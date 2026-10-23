# Architettura e decisioni tecniche

Documento delle scelte fatte sul CRM EffeBi, con le alternative scartate. È il
riferimento per le verifiche con lo studio e per chi manuterrà l'applicazione.

## Sintesi

| Ambito | Scelta |
| --- | --- |
| Linguaggio | TypeScript ovunque (client, server, test) |
| Server | Node.js 22 + Express 5, processo singolo |
| Client | React 19 + Vite + TanStack Query, CSS proprio (nessuna UI kit esterna) |
| Database | PostgreSQL 15+ in regione UE; PGlite embedded solo per sviluppo/test |
| Accesso dati | SQL esplicito con parametri (niente ORM) |
| Autenticazione | Sessione opaca su cookie httpOnly + CSRF token; scrypt; MFA TOTP |
| Storage documenti | Disco locale o bucket privato Supabase, sempre mediato dalle API |
| Test | Vitest: API su database in memoria, unit test sui calcoli, test di componenti in jsdom |

## Perché questi strumenti

**Express + SQL esplicito.** Il dominio è piccolo ma con molte relazioni e vincoli
(unicità, millesimi, periodi non sovrapposti, pagamenti entro la rata). Scrivere le
query a mano rende i vincoli visibili e verificabili nei test; un ORM avrebbe
aggiunto magia proprio dove servono garanzie. Tutte le query usano parametri
posizionali, mai concatenazione di stringhe.

**PostgreSQL.** Richiesto dal capitolato, disponibile in regioni UE presso più
fornitori, con transazioni, vincoli `check` e `unique` che impediscono stati
incoerenti anche in caso di errore applicativo. PGlite (PostgreSQL compilato in
WASM) permette di sviluppare e testare senza servizi esterni: **stesso dialetto
SQL della produzione**, quindi i test coprono anche migrazioni e vincoli.

**React + Vite.** Interfaccia interna, single page, con molte tabelle e form. Vite
produce un bundle statico che il server stesso serve: un solo processo da
distribuire, nessun CORS, un solo certificato.

**Nessun servizio di terze parti nel browser.** Non ci sono font, analytics, CDN
o widget esterni: la CSP può restare `default-src 'self'`, non escono dati dal
perimetro dell'applicazione e non serve un banner cookie.

## Sicurezza

- **Autenticazione**: password con `scrypt` (sale per utente), sessione con token
  casuale di 32 byte conservato solo come hash SHA-256; cookie `httpOnly`,
  `Secure`, `SameSite=Strict`, scadenza configurabile.
- **CSRF**: doppio controllo cookie/header (`effebi_crm_csrf` + `x-csrf-token`) su
  ogni richiesta di modifica; le richieste senza header sono rifiutate con
  `403 { code: "csrf" }`.
- **Autorizzazione lato server**: il client non decide nulla. Ogni router è
  protetto da `requireAuth`; `requireAdmin` per audit, sessioni e stato sistema.
  L'accesso a un documento verifica l'esistenza e i permessi prima di leggere il
  file, anche se l'URL è noto.
- **MFA**: TOTP RFC 6238, segreto cifrato AES-256-GCM con `APP_ENCRYPTION_KEY`,
  codice utilizzabile una sola volta (contatore anti-replay), reset solo da CLI.
- **Rate limiting** su login, MFA, ricerca, upload e import; blocco temporaneo
  dell'account dopo tentativi falliti.
- **Upload**: limite 8 MB, massimo 5000 righe per import, tipo MIME dichiarato
  verificato contro i magic bytes (`normalizeMime`), nomi file generati dal
  server, `Content-Disposition: attachment` al download.
- **Log**: solo metodo, percorso, stato e durata. Nessun body, nessuna query SQL,
  nessun nome di persona o file: l'import non lascia tracce di dati personali.
- **Audit log**: ogni scrittura registra autore, azione, entità e descrizione.

## Isolamento e confini

- Il CRM è un'applicazione separata dal sito pubblico: repository, database,
  variabili d'ambiente e processo distinti. Non legge né scrive dati del sito.
- I dati dimostrativi sono marcati `[DEMO]` e il seed è bloccato in produzione.
- In produzione il server rifiuta di partire se rileva configurazioni di comodo
  (PGlite, `DEMO_MODE`, HTTP, chiavi mancanti).
- Nessuna chiave o segreto arriva al browser: il client chiama solo `/api/...`.

## Calcoli e indicatori

I numeri mostrati vengono sempre da record persistiti:

- **rate**: stato e residuo derivati da importo, incassato e scadenza;
- **periodi**: totale spese, totale rate, incassato e residuo ricalcolati a ogni
  lettura, mai memorizzati;
- **consumi**: confronto solo tra periodi omogenei, consecutivi e non stimati;
- **dashboard**: ogni KPI è affiancato dal numero di record che lo compone e da
  un drill-down; quando la base dati non basta il valore è `null` con
  `available: false` e `unavailableReason`.

Nessuna formula di ripartizione o di quorum è implementata: sono dati di input
(descrizione dei criteri, quorum registrato in verbale).

## Struttura del codice

```
src/shared/    schemi Zod, tipi API, costanti e formattazione (usati da client e server)
src/server/
  config.ts     lettura .env e controlli di produzione
  db.ts         adapter PostgreSQL / PGlite con normalizzazione di date e numeric
  auth.ts       sessioni, CSRF, guardie di accesso
  http.ts       errori tipizzati, validazione Zod, paginazione
  services/     calcoli, storage, import (parsing, validazione, commit, rollback)
  routes/       un router per area funzionale
  migrations/   schema SQL versionato
  cli/          migrazioni, admin, seed demo, template XLSX
src/client/     pagine, componenti, hook React Query
tests/          suite automatica
```

## Testing

| File | Copertura |
| --- | --- |
| `tests/auth.test.ts` | accesso, CSRF, MFA e anti-replay, cambio password, upload ostili |
| `tests/condomini.test.ts` | CRUD, archiviazione, persone, unità, limite millesimi |
| `tests/moduli.test.ts` | segnalazioni e storico, assemblee, rendiconti, rate, pagamenti, consumi |
| `tests/import.test.ts` | anteprima, errori per riga, duplicati, conferma, annullamento |
| `tests/calcoli.test.ts` | calcoli monetari, millesimi, confronto consumi, parsing file, TOTP |
| `tests/dashboard.test.ts` | indicatori derivati e casi «non calcolabile» |
| `tests/ui.test.tsx` | accesso senza registrazione, banner demo, stati vuoti |

I test usano un database PGlite in memoria e dati interamente sintetici: nessun
dato di condominio reale è presente nel repository.
