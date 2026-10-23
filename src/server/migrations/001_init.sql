-- ===========================================================================
-- CRM EffeBi — migrazione iniziale
-- PostgreSQL 15+ (compatibile con Supabase e con PGlite per lo sviluppo)
-- ===========================================================================

-- --- Utenti e sessioni ------------------------------------------------------
create table users (
  id                  uuid primary key,
  email               text not null,
  nome                text not null,
  cognome             text not null,
  password_hash       text not null,
  ruolo               text not null default 'amministratore'
                        check (ruolo in ('amministratore', 'collaboratore')),
  attivo              boolean not null default true,
  mfa_enabled         boolean not null default false,
  mfa_secret_cifrato  text,
  mfa_confirmed_at    timestamptz,
  mfa_last_counter    bigint,
  must_change_password boolean not null default false,
  failed_attempts     integer not null default 0,
  locked_until        timestamptz,
  last_login_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index users_email_unique on users (lower(email));

create table sessions (
  id              uuid primary key,
  user_id         uuid not null references users(id) on delete cascade,
  token_hash      text not null unique,
  csrf_token      text not null,
  mfa_verified_at timestamptz,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  last_seen_at    timestamptz not null default now(),
  ip_hash         text,
  user_agent      text
);
create index sessions_user_idx on sessions (user_id);
create index sessions_expires_idx on sessions (expires_at);

create table login_attempts (
  id          uuid primary key,
  email_hash  text not null,
  ip_hash     text not null,
  esito       text not null check (esito in ('successo', 'password_errata', 'mfa_errata', 'bloccato')),
  created_at  timestamptz not null default now()
);
create index login_attempts_email_idx on login_attempts (email_hash, created_at desc);
create index login_attempts_ip_idx on login_attempts (ip_hash, created_at desc);
create index login_attempts_created_idx on login_attempts (created_at);

-- --- Audit log --------------------------------------------------------------
create table audit_log (
  id             uuid primary key,
  user_id        uuid references users(id) on delete set null,
  attore_email   text,
  azione         text not null,
  entita_tipo    text not null,
  entita_id      uuid,
  descrizione    text not null,
  modifiche      jsonb,
  ip_hash        text,
  created_at     timestamptz not null default now()
);
create index audit_log_created_idx on audit_log (created_at desc);
create index audit_log_entity_idx on audit_log (entita_tipo, entita_id);

-- --- Condomini --------------------------------------------------------------
create sequence condominio_codice_seq;

create table condomini (
  id                    uuid primary key,
  codice                text not null unique,
  denominazione         text not null,
  indirizzo             text,
  cap                   text,
  comune                text,
  provincia             text,
  codice_fiscale        text,
  stato                 text not null default 'attivo'
                          check (stato in ('potenziale', 'attivo', 'cessato')),
  data_inizio_incarico  date,
  data_fine_incarico    date,
  note                  text,
  archiviato            boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references users(id) on delete set null
);
create index condomini_stato_idx on condomini (stato, archiviato);
create index condomini_comune_idx on condomini (lower(comune));
create index condomini_denominazione_idx on condomini (lower(denominazione));

-- --- Persone e relazioni ----------------------------------------------------
create table persone (
  id              uuid primary key,
  nome            text not null,
  cognome         text not null,
  codice_fiscale  text,
  email           text,
  telefono        text,
  note            text,
  archiviato      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references users(id) on delete set null
);
create index persone_cognome_idx on persone (lower(cognome), lower(nome));
create index persone_cf_idx on persone (upper(codice_fiscale));
create index persone_email_idx on persone (lower(email));

create table condominio_persone (
  id              uuid primary key,
  condominio_id   uuid not null references condomini(id) on delete cascade,
  persona_id      uuid not null references persone(id) on delete cascade,
  ruolo           text not null
                    check (ruolo in ('consigliere', 'condomino', 'referente', 'fornitore', 'amministratore', 'altro')),
  qualifica       text,
  data_inizio     date,
  data_fine       date,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (condominio_id, persona_id, ruolo)
);
create index condominio_persone_persona_idx on condominio_persone (persona_id);

create table unita (
  id                    uuid primary key,
  condominio_id         uuid not null references condomini(id) on delete cascade,
  identificativo        text not null,
  piano                 text,
  categoria             text,
  millesimi             numeric(12, 4),
  millesimi_riscaldamento numeric(12, 4),
  note                  text,
  archiviato            boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (condominio_id, identificativo)
);
create index unita_condominio_idx on unita (condominio_id);

create table unita_persone (
  id              uuid primary key,
  unita_id        uuid not null references unita(id) on delete cascade,
  persona_id      uuid not null references persone(id) on delete cascade,
  titolo          text not null default 'proprietario'
                    check (titolo in ('proprietario', 'usufruttuario', 'affittuario', 'comodatario', 'altro')),
  millesimi       numeric(12, 4),
  data_inizio     date,
  data_fine       date,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (unita_id, persona_id, titolo)
);
create index unita_persone_persona_idx on unita_persone (persona_id);

-- --- Attività, promemoria, interazioni --------------------------------------
create table attivita (
  id              uuid primary key,
  condominio_id   uuid references condomini(id) on delete cascade,
  persona_id      uuid references persone(id) on delete set null,
  tipo            text not null default 'nota'
                    check (tipo in ('telefonata', 'email', 'incontro', 'promemoria', 'attivita', 'nota')),
  titolo          text not null,
  descrizione     text,
  data            date not null default current_date,
  scadenza        date,
  completata      boolean not null default false,
  priorita        text not null default 'normale'
                    check (priorita in ('bassa', 'normale', 'alta')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references users(id) on delete set null
);
create index attivita_condominio_idx on attivita (condominio_id, data desc);
create index attivita_scadenza_idx on attivita (scadenza) where completata = false;

-- --- Segnalazioni -----------------------------------------------------------
create sequence segnalazione_codice_seq;

create table segnalazioni (
  id                    uuid primary key,
  codice                text not null unique,
  condominio_id         uuid not null references condomini(id) on delete cascade,
  unita_id              uuid references unita(id) on delete set null,
  area_comune           text,
  titolo                text not null,
  descrizione           text,
  categoria             text not null default 'altro'
                          check (categoria in ('manutenzione', 'guasto', 'pulizia', 'sicurezza', 'rumore', 'documenti', 'amministrativa', 'altro')),
  priorita              text not null default 'media'
                          check (priorita in ('bassa', 'media', 'alta', 'urgente')),
  stato                 text not null default 'nuova'
                          check (stato in ('nuova', 'in_valutazione', 'assegnata', 'in_corso', 'risolta', 'chiusa')),
  data_apertura         date not null default current_date,
  scadenza              date,
  data_chiusura         date,
  fornitore_persona_id  uuid references persone(id) on delete set null,
  referente             text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references users(id) on delete set null
);
create index segnalazioni_condominio_idx on segnalazioni (condominio_id, stato);
create index segnalazioni_stato_idx on segnalazioni (stato, scadenza);

create table segnalazione_storico (
  id              uuid primary key,
  segnalazione_id uuid not null references segnalazioni(id) on delete cascade,
  da_stato        text,
  a_stato         text,
  nota            text,
  user_id         uuid references users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index segnalazione_storico_idx on segnalazione_storico (segnalazione_id, created_at);

-- --- Assemblee --------------------------------------------------------------
create table assemblee (
  id                uuid primary key,
  condominio_id     uuid not null references condomini(id) on delete cascade,
  data              date not null,
  ora               time,
  tipo              text not null default 'ordinaria'
                      check (tipo in ('ordinaria', 'straordinaria')),
  luogo             text,
  modalita          text not null default 'presenza'
                      check (modalita in ('presenza', 'videoconferenza', 'mista')),
  stato             text not null default 'programmata'
                      check (stato in ('programmata', 'convocata', 'svolta', 'annullata')),
  quorum_registrato numeric(9, 4),
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references users(id) on delete set null
);
create index assemblee_condominio_idx on assemblee (condominio_id, data desc);

create table assemblea_punti (
  id              uuid primary key,
  assemblea_id    uuid not null references assemblee(id) on delete cascade,
  ordine          integer not null default 1,
  titolo          text not null,
  descrizione     text,
  delibera        text,
  esito           text
                    check (esito in ('approvato', 'respinto', 'rinviato', 'non_trattato')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index assemblea_punti_idx on assemblea_punti (assemblea_id, ordine);

create table assemblea_partecipanti (
  id              uuid primary key,
  assemblea_id    uuid not null references assemblee(id) on delete cascade,
  persona_id      uuid references persone(id) on delete set null,
  unita_id        uuid references unita(id) on delete set null,
  nome_esterno    text,
  presente        boolean not null default false,
  delegante       text,
  millesimi       numeric(12, 4),
  note            text,
  created_at      timestamptz not null default now()
);
create index assemblea_partecipanti_idx on assemblea_partecipanti (assemblea_id);

-- --- Rendiconti -------------------------------------------------------------
create table periodi_contabili (
  id              uuid primary key,
  condominio_id   uuid not null references condomini(id) on delete cascade,
  etichetta       text not null,
  data_inizio     date not null,
  data_fine       date not null,
  stato           text not null default 'bozza' check (stato in ('bozza', 'chiuso')),
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references users(id) on delete set null,
  check (data_fine >= data_inizio),
  unique (condominio_id, data_inizio, data_fine)
);
create index periodi_condominio_idx on periodi_contabili (condominio_id, data_inizio desc);

create table spese (
  id              uuid primary key,
  periodo_id      uuid not null references periodi_contabili(id) on delete cascade,
  data            date not null,
  descrizione     text not null,
  categoria       text,
  importo         numeric(14, 2) not null,
  fornitore       text,
  riferimento     text,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references users(id) on delete set null,
  check (importo >= 0)
);
create index spese_periodo_idx on spese (periodo_id, data);

create table rate (
  id              uuid primary key,
  periodo_id      uuid not null references periodi_contabili(id) on delete cascade,
  unita_id        uuid references unita(id) on delete set null,
  descrizione     text not null,
  numero          text,
  scadenza        date not null,
  importo         numeric(14, 2) not null,
  criteri_ripartizione text,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references users(id) on delete set null,
  check (importo >= 0)
);
create index rate_periodo_idx on rate (periodo_id, scadenza);

create table pagamenti (
  id              uuid primary key,
  rata_id         uuid not null references rate(id) on delete cascade,
  data            date not null,
  importo         numeric(14, 2) not null,
  metodo          text,
  riferimento     text,
  note            text,
  created_at      timestamptz not null default now(),
  created_by      uuid references users(id) on delete set null,
  check (importo > 0)
);
create index pagamenti_rata_idx on pagamenti (rata_id);

-- --- Consumi ----------------------------------------------------------------
create table consumi (
  id              uuid primary key,
  condominio_id   uuid not null references condomini(id) on delete cascade,
  categoria       text not null
                    check (categoria in ('acqua', 'gas', 'energia_elettrica', 'teleriscaldamento', 'rifiuti', 'altro')),
  periodo_da      date not null,
  periodo_a       date not null,
  valore          numeric(14, 3) not null,
  unita_misura    text not null,
  costo           numeric(14, 2),
  fonte           text,
  origine         text not null default 'inserito'
                    check (origine in ('inserito', 'importato', 'stimato')),
  data_rilevazione date,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references users(id) on delete set null,
  check (periodo_a >= periodo_da),
  check (valore >= 0)
);
create index consumi_condominio_idx on consumi (condominio_id, periodo_da desc);

-- --- Documenti --------------------------------------------------------------
create table documenti (
  id              uuid primary key,
  condominio_id   uuid references condomini(id) on delete cascade,
  entita_tipo     text not null
                    check (entita_tipo in ('condominio', 'persona', 'unita', 'segnalazione', 'assemblea', 'periodo_contabile', 'spesa', 'rata', 'consumo', 'attivita')),
  entita_id       uuid,
  nome_file       text not null,
  mime            text not null,
  dimensione      bigint not null,
  storage_key     text not null unique,
  checksum_sha256 text not null,
  categoria       text,
  descrizione     text,
  archiviato      boolean not null default false,
  created_at      timestamptz not null default now(),
  created_by      uuid references users(id) on delete set null
);
create index documenti_entita_idx on documenti (entita_tipo, entita_id);
create index documenti_condominio_idx on documenti (condominio_id);

-- --- Importazioni -----------------------------------------------------------
create table import_batches (
  id              uuid primary key,
  tipo            text not null check (tipo in ('condomini', 'persone', 'unita', 'segnalazioni', 'consumi')),
  nome_file       text not null,
  dimensione      bigint not null,
  hash_file       text not null,
  stato           text not null default 'anteprima'
                    check (stato in ('anteprima', 'completato', 'annullato', 'errore')),
  righe_totali    integer not null default 0,
  righe_valide    integer not null default 0,
  righe_errori    integer not null default 0,
  righe_duplicate integer not null default 0,
  riepilogo       jsonb,
  created_by      uuid references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  completato_at   timestamptz
);
create index import_batches_created_idx on import_batches (created_at desc);

create table import_rows (
  id              uuid primary key,
  batch_id        uuid not null references import_batches(id) on delete cascade,
  numero_riga     integer not null,
  dati            jsonb,
  errori          jsonb not null default '[]'::jsonb,
  avvisi          jsonb not null default '[]'::jsonb,
  duplicato       boolean not null default false,
  esito           text not null default 'in_attesa'
                    check (esito in ('in_attesa', 'valida', 'errore', 'duplicato', 'importata', 'ignorata')),
  entita_id       uuid,
  created_at      timestamptz not null default now()
);
create index import_rows_batch_idx on import_rows (batch_id, numero_riga);
