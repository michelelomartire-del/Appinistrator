# Configurazione

Tutta la configurazione passa da variabili d'ambiente, lette da `.env` (mai
committato) o dall'ambiente del servizio. I valori reali di produzione non devono
comparire nel repository, nei log o nel browser.

## Variabili

### Applicazione

| Variabile | Default | Descrizione |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test`, `production`. Con `production` si attivano controlli di sicurezza bloccanti |
| `PORT` | `4000` | Porta HTTP interna |
| `APP_URL` | `http://localhost:4000` | URL pubblico; in produzione deve essere `https://` |
| `TRUST_PROXY` | `0` (dev) / `1` (prod) | Numero di proxy fidati per ricavare l'IP reale |
| `SESSION_TTL_HOURS` | `8` | Durata della sessione; oltre, l'accesso va ripetuto |
| `DATA_DIR` | `.data` | Cartella locale per documenti e database embedded |
| `MIGRATIONS_DIR` | `src/server/migrations` | Cartella delle migrazioni SQL |

### Database

| Variabile | Descrizione |
| --- | --- |
| `DATABASE_URL` | Connessione PostgreSQL (regione UE). Se assente si usa PGlite embedded **solo per sviluppo/demo** |
| `DATABASE_SSL` | `true` per connessioni TLS verso il database gestito |

### Sicurezza

| Variabile | Descrizione |
| --- | --- |
| `APP_ENCRYPTION_KEY` | Chiave base64 (32 byte) per cifrare i segreti MFA a riposo (AES-256-GCM). **Obbligatoria in produzione** |

La chiave non va mai ruotata senza prima disattivare la MFA degli account:
i segreti cifrati con la chiave precedente diventerebbero illeggibili.

### Documenti

| Variabile | Default | Descrizione |
| --- | --- | --- |
| `STORAGE_DRIVER` | `local` | `local` (cartella su disco) o `supabase` (bucket privato) |
| `SUPABASE_URL` | — | URL del progetto Supabase (regione UE) |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Chiave service role, **solo lato server** |
| `SUPABASE_STORAGE_BUCKET` | `documenti-crm` | Bucket **privato** |

### Demo

| Variabile | Default | Descrizione |
| --- | --- | --- |
| `DEMO_MODE` | `true` in dev, `false` in prod | Mostra banner «dati sintetici» e nota credenziali demo |
| `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD` | account demo | Usati solo da `npm run seed:demo` |

## Controlli bloccanti in produzione

Con `NODE_ENV=production` il server rifiuta di avviarsi se:

- `DATABASE_URL` è assente (PGlite non è ammesso per dati reali);
- `APP_ENCRYPTION_KEY` è assente;
- `DEMO_MODE` è attivo;
- `STORAGE_DRIVER=supabase` senza URL o service key;
- `APP_URL` usa `http://` su un host diverso da localhost.

Il seed demo è inoltre rifiutato a runtime in produzione.

## Storage dei documenti

**Locale (`STORAGE_DRIVER=local`)** — file in `DATA_DIR/documenti`, permessi
`0600`, nomi generati dal server (UUID), nessun nome originale sul disco.
È necessario includere questa cartella nei backup.

**Supabase Storage (`STORAGE_DRIVER=supabase`)** — bucket privato, nessuna
policy pubblica; il client riceve solo URL firmati a breve scadenza oppure
scarica tramite `/api/documenti/:id/file` con controllo di sessione. Verificare
in fase di attivazione che:

1. il bucket risulti privato nella dashboard;
2. nessuna policy `select`/`insert` sia assegnata ai ruoli `anon` e `authenticated`;
3. l'accesso avvenga esclusivamente con la service role key dal server.

Prima di attivare lo storage cloud, valutare con il titolare del trattamento
(lo studio) nomina del fornitore, regione dei dati e tempi di conservazione.

## Autenticazione e MFA

- Sessione con token opaco in cookie `httpOnly`, `Secure` in produzione,
  `SameSite=Strict`; a riposo è conservato solo l'hash SHA-256 del token.
- CSRF: header `x-csrf-token` obbligatorio sulle richieste di modifica, confrontato
  con il cookie `effebi_crm_csrf`.
- Password: hash `scrypt`, politica minima verificata lato server, cambio forzato
  al primo accesso e dopo un reset da CLI.
- Blocco temporaneo dell'account dopo tentativi falliti ripetuti; tentativi
  registrati in `login_attempts` senza password né dati personali.
- MFA TOTP (RFC 6238) con segreto cifrato AES-256-GCM; ogni codice è utilizzabile
  una sola volta (contatore anti-replay).
- Log applicativo: solo metodo, percorso, stato e durata. Nessun body, nessuna
  query SQL, nessun nome file.

## Rate limit

Limiti applicati per IP o per utente, con finestra scorrevole in memoria:

| Ambito | Limite indicativo |
| --- | --- |
| `login` | tentativi di accesso per IP |
| `mfa` | verifiche codice per utente |
| `search` | ricerche per utente |
| `upload` | caricamenti documenti |
| `import` | anteprime/conferme di importazione |

Con più istanze applicative il rate limit in memoria non è condiviso: in quel
caso va spostato su un archivio condiviso (es. Redis) o mantenuta una sola
istanza dietro il proxy.

## Privacy e minimizzazione

Il CRM raccoglie solo i dati necessari alle funzioni concordate: anagrafica
condomìni, persone di riferimento, unità, segnalazioni, assemblee, rendiconti,
consumi e documenti. Non sono previsti profilazione, marketing o tracciamento di
terze parti; il client non carica script esterni.
