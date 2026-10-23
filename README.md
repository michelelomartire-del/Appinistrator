# CRM EffeBi

Applicazione gestionale interna per **Studio EffeBi — Amministrazioni Condominiali**.
Sostituisce i fogli di calcolo dello studio con un'unica applicazione web: condomìni,
persone e unità immobiliari, segnalazioni, assemblee, rendiconti, consumi, archivio
documenti e importazione massiva da CSV/XLSX.

> Questo repository è **indipendente** dal sito pubblico dello studio: nessun file,
> database o credenziale del sito viene letto o modificato da qui.

## Due modi di usarlo

| | Demo statica | Applicazione completa |
| --- | --- | --- |
| Accesso | Nessuno: si apre direttamente | Account amministratore con MFA |
| Backend | Nessuno (dati nel browser) | Node + PostgreSQL in UE |
| Deploy | Vercel, gratis, un clic | Server con dominio e backup |
| Comando | `npm run dev:demo` / `npm run build:demo` | `npm run dev` / `npm run build` |
| Dati | Inventati e marcati `[DEMO]` | Solo quelli reali dello studio |

La demo serve a **vedere e provare** il gestionale: si apre senza login, con dati
inventati ma coerenti, e alcune funzioni sono modificabili (condomìni, unità,
persone, segnalazioni, attività). Rendiconti, assemblee e consumi sono in sola
lettura perché la demo non simula calcoli contabili.
Guida: [`docs/DEMO-VERCEL.md`](docs/DEMO-VERCEL.md).

## Caratteristiche

| Area | Contenuto |
| --- | --- |
| Accesso | Account unico amministratore creato da riga di comando, nessuna registrazione pubblica, MFA TOTP opzionale, blocco dopo troppi tentativi |
| Condomìni | Anagrafica clienti, incarico, persone collegate, unità immobiliari e millesimi (con controllo di coerenza sulla somma) |
| Persone | Rubrica unica, ruoli per condominio, titoli sulle unità, nessun duplicato silenzioso (codice fiscale univoco) |
| Segnalazioni | Ticket con priorità, stato, storico delle modifiche, scadenze |
| Assemblee | Convocazioni, punti all'ordine del giorno, partecipanti, quorum **registrato** |
| Rendiconti | Periodi contabili, spese, rate, pagamenti; totali e residui calcolati dai record |
| Consumi | Rilevazioni per categoria, con distinzione esplicita tra dato inserito, importato e stimato |
| Documenti | Archivio privato con permessi verificati lato server, nessun URL pubblico permanente |
| Import | CSV/XLSX con anteprima, validazione riga per riga, rilevamento duplicati, annullamento dell'importazione |
| Audit | Registro delle modifiche consultabile dall'amministratore |

Tutti gli indicatori della dashboard derivano da record persistiti. Quando un dato non
è calcolabile (mancano rate, periodi o rilevazioni confrontabili) l'interfaccia scrive
**«non calcolabile»** con la motivazione: non esistono zeri o percentuali di comodo.

## Requisiti

- Node.js ≥ 22.10
- PostgreSQL 15+ in regione UE per la produzione (in sviluppo è incluso PGlite, un
  PostgreSQL embedded salvato in `.data/`)
- Un volume per i documenti (disco locale o bucket privato Supabase Storage)

## Avvio rapido (sviluppo, dati sintetici)

```bash
npm install
cp .env.example .env          # compilare almeno APP_ENCRYPTION_KEY
npm run migrate                # crea lo schema
npm run admin:create -- --email admin@studio.example --nome Nome --cognome Cognome
npm run seed:demo              # dati FITTIZI marcati [DEMO], mai in produzione
npm run dev                    # API su :4000 + interfaccia su :5173
```

Account demo creato dal seed: `demo@effebi.invalid` / `EffeBi-Demo-2026!`.
Il seed è rifiutato quando `NODE_ENV=production`.

### Cosa contiene la demo

Il seed crea un ambiente completo e coerente, interamente inventato e marcato
`[DEMO]`:

| Area | Contenuto |
| --- | --- |
| Condomìni | 6 anagrafiche (5 attivi + 1 potenziale) fra Bologna e provincia |
| Unità | 70 unità (appartamenti e garage) con millesimi che tornano a 1000 per condominio |
| Persone | 24 contatti: condòmini, consiglieri, referenti e 6 fornitori |
| Segnalazioni | 16 pratiche in stati diversi, con storico e due scadute |
| Assemblee | 7 assemblee (svolte, convocate, programmate) con punti, esiti e partecipanti |
| Rendiconti | 7 periodi su due esercizi, 160 rate e 113 pagamenti registrati |
| Consumi | 26 rilevazioni trimestrali e mensili, con valori stimati dichiarati |
| Attività | 12 note e promemoria, alcuni in scadenza |
| Documenti | 9 file reali nell'archivio privato (verbali, polizza, riparto CSV, preventivo XLSX) |
| Importazioni | 2 lotti storici con righe importate, un errore e un duplicato |
| Audit | 6 voci di registro |

Le rate derivano dal budget del periodo ripartito per millesimi, gli incassi sono
compatibili con le rate emesse e i mesi estivi hanno consumi di gas più bassi:
i numeri sono inventati ma le relazioni fra loro sono coerenti. `npm run seed:demo`
può essere rieseguito in qualsiasi momento: azzera **solo** i record demo
(condomìni `DEMO-*`, persone e consumi marcati `[DEMO]`, lotti `demo-*`) e
ricostruisce il dataset aggiornato alla data corrente.

## Comandi

| Comando | Descrizione |
| --- | --- |
| `npm run dev` | API (tsx watch) e interfaccia Vite in parallelo |
| `npm run build` | Build di produzione in `dist/` (client + server) |
| `npm start` | Avvio del server compilato (serve anche il client) |
| `npm run migrate` | Applica le migrazioni SQL |
| `npm run admin:create` | Crea o reimposta l'account amministratore |
| `npm run admin:reset-mfa` | Disattiva la MFA di un account (recupero da server) |
| `npm run seed:demo` | Dati dimostrativi sintetici |
| `npm run template:xlsx` | Rigenera i template di import in `templates/` |
| `npm run typecheck` | TypeScript su client e server |
| `npm run dev:demo` | Demo statica in locale (porta 5174, senza backend) |
| `npm run build:demo` | Build statica della demo in `dist/demo` (per Vercel) |
| `npm run demo:snapshot` | Rigenera snapshot e file dimostrativi |
| `npm test` | Suite automatica (auth, condomìni, moduli, import, calcoli, dashboard, UI, demo) |
| `scripts/backup.sh` | Backup di database e documenti con verifica e rotazione (cron) |

## Documentazione

- [`docs/DEMO-VERCEL.md`](docs/DEMO-VERCEL.md) — demo statica senza login e deploy su Vercel
- [`docs/DEPLOY-UE.md`](docs/DEPLOY-UE.md) — runbook completo su server Node in UE (server, PostgreSQL, HTTPS, backup, go-live)
- [`docs/INSTALLAZIONE.md`](docs/INSTALLAZIONE.md) — installazione, primo avvio, messa in produzione
- [`docs/CONFIGURAZIONE.md`](docs/CONFIGURAZIONE.md) — variabili d'ambiente, storage, sicurezza, MFA
- [`docs/IMPORT.md`](docs/IMPORT.md) — formato dei file, colonne, errori, duplicati, annullamento
- [`docs/BACKUP-RIPRISTINO.md`](docs/BACKUP-RIPRISTINO.md) — backup e ripristino di database e documenti
- [`docs/MODELLO-DATI.md`](docs/MODELLO-DATI.md) — modello dati e regole di calcolo
- [`docs/ARCHITETTURA.md`](docs/ARCHITETTURA.md) — scelte tecniche e motivazioni

## Struttura

```
src/
  shared/        tipi e schemi condivisi client/server (Zod)
  server/        API Express, autenticazione, servizi, migrazioni SQL, CLI
  client/        interfaccia React (pagine, componenti, hook)
tests/           test automatici (API, calcoli, componenti)
templates/       template XLSX di importazione
docs/            documentazione operativa
```

## Stato e limiti noti (v1)

- Utente singolo amministratore; nessun portale condòmino, pagamento online,
  voto elettronico o contabilità automatica (fuori perimetro concordato).
- Nessun calcolo di riparti o di quorum: il quorum si registra come valore
  dichiarato in assemblea, non viene dedotto.
- L'import non sostituisce i dati esistenti: crea o aggiorna solo ciò che è
  validato in anteprima; resta sempre possibile annullare un lotto.
- I dati reali dei condomìni non sono inclusi nel repository né nei test.
