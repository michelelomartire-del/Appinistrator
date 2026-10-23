# Demo statica (senza login) su Vercel

Versione dimostrativa dell'applicazione: si apre direttamente nella dashboard,
senza credenziali, e gira **interamente nel browser**. Non c'è server, non c'è
database, non esiste alcun dato reale: utili per capire il prodotto, non per
lavorarci.

## Cosa è incluso

- Stessi schermi dell'applicazione: dashboard, condomìni, persone, segnalazioni,
  assemblee, rendiconti, consumi, importazione, impostazioni.
- Dati inventati e coerenti: 6 condomìni, 70 unità con millesimi che sommano
  1000, 24 persone, 16 segnalazioni, 7 assemblee, 7 periodi contabili con 160
  rate e 113 pagamenti, 26 consumi, 9 documenti scaricabili (PDF, CSV, XLSX).
- **Modificabile** su anagrafiche e attività: creare/modificare/archiviare
  condomìni, aggiungere unità (con blocco oltre 1000 millesimi), creare persone e
  collegarle, aprire segnalazioni e cambiarne lo stato, creare attività.
- **In sola lettura**: rendiconti, assemblee, consumi, importazione e caricamento
  documenti. I pulsanti rispondono con un messaggio esplicito: la demo non
  simula calcoli contabili né upload.
- Le modifiche restano nel `localStorage` del browser; il pulsante
  **Ripristina dati demo** nel banner in alto riporta tutto allo stato iniziale.

## Come funziona

```
snapshot dell'API reale  →  src/demo/snapshot.json  →  fetch finto nel browser
(documenti e template)       public/demo-docs/…        (stessi endpoint /api)
```

`npm run demo:snapshot` avvia in memoria un PostgreSQL (PGlite), esegue il seed
dimostrativo, interroga l'API Express e salva le risposte: la demo usa quindi le
**stesse strutture dati** della produzione, senza duplicare i formati a mano.
Le liste e gli indicatori vengono poi ricalcolati nel browser dai record, così
una segnalazione appena creata compare anche nei totali della dashboard.

## Esecuzione locale

```bash
npm install
npm run dev:demo     # rigenera lo snapshot e apre http://localhost:5174
```

Per una verifica identica alla produzione:

```bash
npm run build:demo
npx vite preview --mode demo --port 4174
```

## Deploy su Vercel

La configurazione è nel repository (`vercel.json`): non servono variabili
d'ambiente, database o segreti.

1. **Repository su GitHub** — questo repository (branch `main`).
2. **Vercel → Add New → Project → Import Git Repository**.
3. Selezionare il repository e lasciare tutto come proposto:
   - Framework Preset: **Other**
   - Build Command: `npm run build:demo` (letto da `vercel.json`)
   - Output Directory: `dist/demo` (letto da `vercel.json`)
   - Install Command: `npm ci`
   - Root Directory: la radice del repository
4. **Deploy**. Nessuna variabile d'ambiente da inserire.
5. L'indirizzo `https://<progetto>.vercel.app` mostra subito la demo.

Ogni nuovo deploy rigenera i dati dimostrativi con date relative al giorno della
build: le assemblee future restano future e le segnalazioni scadute restano
scadute. Non c'è nulla da aggiornare a mano.

### Perché qui Vercel va bene

La demo è un sito statico: HTML, JavaScript e i file di esempio. Non usa Vercel
Functions, quindi non si applicano né il limite di 4,5 MB per richiesta né i
problemi di filesystem di sola lettura. L'applicazione completa, invece, richiede
un processo Node con PostgreSQL (vedi [`DEPLOY-UE.md`](DEPLOY-UE.md)).

## Limiti da tenere presenti

| Aspetto | Comportamento |
| --- | --- |
| Accesso | Nessuna autenticazione: chiunque abbia il link vede i dati demo |
| Dati | Inventati e marcati `[DEMO]`; nessun dato di persone o condomìni reali |
| Persistenza | Solo nel browser che si sta usando; un altro dispositivo riparte dai dati iniziali |
| Calcoli | Nessuna scrittura su rendiconti, rate, consumi, assemblee |
| File | I documenti sono esempi statici scaricabili; l'upload è disattivato |
| Ricerca e indicatori | Funzionano sui dati demo, ricalcolati dai record |

**Non inserire mai dati reali nella demo**: non c'è autenticazione né cifratura,
e i file caricati non vengono conservati.

## Quando si passa all'applicazione reale

La demo e l'applicazione convivono nello stesso repository ma con build separate:

| Comando | Risultato | Dove si usa |
| --- | --- | --- |
| `npm run build` | `dist/public` + `dist/server` | server Node con PostgreSQL |
| `npm run build:demo` | `dist/demo` (statico) | Vercel, presentazioni, formazione |

L'applicazione reale non è toccata da questa modalità: la demo è attiva solo con
`vite --mode demo`, e in produzione restano login, MFA, autorizzazioni lato
server, audit log e archivio privato documenti.

## Manutenzione

- Cambiare i dati demo: `src/server/services/demo-data.ts` (dataset), poi
  `npm run demo:snapshot` per rigenerare lo snapshot e i file.
- Cambiare gli schermi: si modificano i componenti in `src/client`, sia per la
  demo sia per l'applicazione.
- Aggiungere un endpoint all'API: se serve anche nella demo, va gestito in
  `src/demo/api.ts`; il test `tests/demo.test.ts` verifica che le rotte
  dichiarate rispondano e che i moduli contabili restino in sola lettura.
- I file in `public/demo-docs` e `public/demo-templates` sono generati: non
  vanno modificati a mano e non sono versionati.
