# Modello dati

Documento di riferimento per la validazione del modello prima di importare dati
reali. Lo schema fisico è in `src/server/migrations/001_init.sql`.

## Principi

1. **Nessun dato duplicato in copia**: la persona esiste una volta sola e viene
   collegata a condomìni e unità tramite tabelle di relazione.
2. **Codici generati dal sistema**: condomìni `FB-0001`, segnalazioni `SG-0001`.
   I codici sono stabili e non modificabili dall'interfaccia.
3. **Archiviazione invece di cancellazione** per condomìni, persone e unità: i
   record restano consultabili nello storico ma spariscono dagli elenchi attivi.
4. **Nessun calcolo inventato**: i campi derivati (totali, residui, percentuali)
   sono sempre ricalcolati dai record; se manca un dato il risultato è `null` e
   l'interfaccia scrive «non calcolabile» con il motivo.
5. **Tracciabilità**: ogni scrittura produce una riga in `audit_log` con autore,
   entità e descrizione, senza contenuti dei documenti né password.

## Entità

```
users ── sessions
  │
  ├── audit_log
  │
condomini ──┬── condominio_persone ── persone
            ├── unita ──┬── unita_persone ──┘
            │           └── rate
            ├── attivita
            ├── segnalazioni ── segnalazione_storico
            ├── assemblee ──┬── assemblea_punti
            │               └── assemblea_partecipanti
            ├── periodi_contabili ──┬── spese
            │                       └── rate ── pagamenti
            ├── consumi
            └── documenti (polimorfico: condominio, persona, unità, segnalazione,
                           assemblea, periodo, spesa, rata, consumo, attività)
```

### `condomini`

Dati identificativi e fiscali del condominio cliente, stato dell'incarico
(`potenziale`, `attivo`, `cessato`), date di inizio/fine incarico, note.
Vincolo `unique(codice)`. Archiviazione logica.

### `persone`

Rubrica unica: nome, cognome, codice fiscale, email, telefono, note.
Il codice fiscale, quando presente, è l'elemento di riconoscimento usato per
evitare duplicati (controllo in creazione e nell'import).

### `condominio_persone`

Ruolo della persona nel condominio (`condomino`, `consigliere`, `referente`,
`fornitore`, `amministratore`, `altro`), qualifica, validità temporale.
`unique(condominio_id, persona_id, ruolo)` impedisce doppioni dello stesso ruolo.

### `unita` e `unita_persone`

Unità immobiliare con identificativo interno, piano, categoria, millesimi e
millesimi di riscaldamento. `unique(condominio_id, identificativo)`.
La tabella `unita_persone` esprime i titoli (proprietà, usufrutto, locazione,
comodato) con eventuale quota di millesimi e periodo di validità.

**Regola millesimi**: la somma dei millesimi delle unità di un condominio non può
superare 1000; il server rifiuta l'operazione con il totale attuale e il valore
proposto. Non viene mai ridistribuito automaticamente un residuo.

### `attivita`

Nota o promemoria con data, tipo e collegamento a condominio e persona.
Serve alla dashboard «attività in scadenza».

### `segnalazioni` e `segnalazione_storico`

Ticket con categoria, priorità, stato, date di apertura/chiusura e scadenza,
eventuale unità o area comune, referente e fornitore incaricato. Ogni cambio di
stato produce una riga di storico con la nota dell'operatore.

### `assemblee`, `assemblea_punti`, `assemblea_partecipanti`

Convocazione (data, ora, luogo, modalità, stato), punti all'ordine del giorno con
esito e delibera, partecipanti con presenza, delegante e millesimi.

**Quorum**: `assemblee.quorum_registrato` è un **valore dichiarato** in verbale.
Il CRM non deduce quorum costitutivi o deliberativi da regolamenti non acquisiti.

### `periodi_contabili`, `spese`, `rate`, `pagamenti`

Periodo con etichetta e intervallo di date (`unique` su condominio e intervallo),
stato `bozza`/`chiuso`. Spese con data, categoria, importo e fornitore; rate con
scadenza, importo, unità e criteri di ripartizione **descritti**, non calcolati;
pagamenti collegati alla rata.

Regole applicate:

- un periodo `chiuso` non accetta nuove spese (409 con motivazione);
- periodi sovrapposti dello stesso condominio sono rifiutati;
- i pagamenti non possono superare l'importo della rata;
- lo stato della rata (pagata, parziale, scaduta, aperta) e il residuo sono
  derivati da importi e date, mai memorizzati a mano.

### `consumi`

Rilevazione per condominio, categoria, intervallo e unità di misura, con costo
facoltativo, fonte e **origine** (`inserito`, `importato`, `stimato`).

Confronto tra periodi: possibile solo se categoria e unità di misura coincidono,
i periodi hanno la stessa durata, sono consecutivi e nessuno dei due è `stimato`.
In caso contrario il confronto restituisce `non_confrontabile` con il motivo.

### `documenti`

Metadati del file (nome originale, MIME, dimensione, checksum SHA-256, categoria,
descrizione) e chiave di archiviazione generata dal server. Il file non è mai
raggiungibile con un URL pubblico: il download passa da `/api/documenti/:id/file`
con sessione valida e controllo dei permessi.

### `import_batches` e `import_rows`

Registro delle importazioni: tipo, nome file, dimensione, hash, esito, conteggi e
riepilogo. Le righe conservano numero originale, dati letti, errori, avvisi,
esito e l'entità creata (utile per l'annullamento selettivo).
**Il file caricato non viene salvato.**

### Tabelle tecniche

`users`, `sessions`, `login_attempts`, `audit_log`, `schema_migrations`.
Nessun dato personale non necessario: `login_attempts` registra esito e IP, mai
la password tentata.

## Classificazione dei dati

| Origine | Come si riconosce | Uso |
| --- | --- | --- |
| Inserito manualmente | `origine = 'inserito'`, audit con autore | Dati correnti |
| Importato | lotto di importazione collegato, `origine = 'importato'` | Dati storici/migrati |
| Stimato | `origine = 'stimato'` | Escluso dai confronti, marcato in interfaccia |
| Demo | valori e note con prefisso `[DEMO]`, `DEMO_MODE` attivo | Solo ambienti di prova |

## Cosa il modello non contiene (per scelta)

- credenziali o dati di pagamento dei condòmini;
- coordinate bancarie o collegamenti a home banking;
- voti, deleghe elettroniche e calcolo delle maggioranze;
- dati sanitari o categorie particolari non richieste dalle funzioni concordate;
- contenuti dei documenti nel database (solo metadati e checksum).

## Template di importazione

I file sono in `templates/` e vengono rigenerati con `npm run template:xlsx`:

| File | Entità | Colonne obbligatorie |
| --- | --- | --- |
| `template-condomini.xlsx` | Condomìni | Denominazione |
| `template-unita.xlsx` | Unità immobiliari | Codice condominio, Identificativo |
| `template-persone.xlsx` | Persone e contatti | Nome, Cognome |
| `template-segnalazioni.xlsx` | Segnalazioni | Codice condominio, Titolo |
| `template-consumi.xlsx` | Consumi | Codice condominio, Categoria, Periodo da, Periodo a, Valore, Unità di misura |

Dettaglio di tutte le colonne e delle regole di validazione in
[`IMPORT.md`](IMPORT.md).

## Punti da confermare prima dei dati reali

1. Quali ruoli tra condomino/consigliere/referente/fornitore sono effettivamente
   usati dallo studio (l'elenco è estendibile con una migrazione).
2. Se le unità devono riportare anche la superficie e la categoria catastale.
3. Se i millesimi di riscaldamento vanno gestiti separatamente dalla quota
   generale (il modello li prevede già, ma l'interfaccia li mostra in forma
   sintetica).
4. Quale criterio di ripartizione viene descritto nelle rate (testo libero oggi).
5. Se serve conservare i verbali delle assemblee come documenti collegati
   (possibile già oggi tramite l'archivio documenti).
