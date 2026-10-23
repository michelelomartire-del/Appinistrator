# Importazione da CSV/XLSX

L'importazione serve a portare nel CRM i dati che oggi vivono nei fogli di calcolo.
Non sovrascrive mai nulla in modo silenzioso: prima mostra un'anteprima riga per
riga, salva solo dopo conferma e ogni lotto è annullabile.

## Flusso operativo

1. **Scarica il template** dalla pagina *Importazioni* (o da
   `GET /api/import/template/:tipo`, oppure dai file in `templates/`). I template
   contengono le intestazioni, i valori ammessi e le note di compilazione.
2. **Compila** un file per tipo di dato, senza rinominare le colonne obbligatorie.
3. **Carica** il file e ottieni l'anteprima: totale righe, righe valide, righe con
   errori, possibili duplicati.
4. **Correggi** il file e ricaricalo se ci sono errori. Gli errori non bloccano
   l'intero file: si importano solo le righe valide.
5. **Conferma** l'importazione indicando se includere i duplicati (di norma no).
6. Se qualcosa non torna, **annulla** il lotto: vengono rimossi solo i record
   creati da quell'importazione.

## Tipi di importazione e colonne

Le colonne contrassegnate con `*` sono obbligatorie. L'ordine non è vincolante,
ma i nomi sì (sono accettate anche le varianti indicate dal template, senza
distinzione di maiuscole e accenti).

### Condomìni — `template-condomini.xlsx`

| Colonna | Obbligatoria | Note |
| --- | --- | --- |
| Denominazione | sì | Max 200 caratteri |
| Indirizzo | no | |
| CAP | no | Max 5 caratteri |
| Comune | no | |
| Provincia | no | Sigla di 2 lettere |
| Codice fiscale | no | Usato per riconoscere i duplicati |
| Stato | no | `potenziale`, `attivo`, `cessato` (default `attivo`) |
| Data inizio incarico / Data fine incarico | no | Data italiana `gg/mm/aaaa` o ISO |
| Note | no | |

Il codice interno (`FB-0001`) è sempre assegnato dal CRM: non va inserito.

### Persone e contatti — `template-persone.xlsx`

| Colonna | Obbligatoria | Note |
| --- | --- | --- |
| Nome, Cognome | sì | |
| Codice fiscale | no | Chiave di riconoscimento principale |
| Email / Telefono | no | |
| Codice condominio | no | Se presente, collega la persona al condominio esistente |
| Ruolo nel condominio | no | `consigliere`, `condomino`, `referente`, `fornitore`, `amministratore`, `altro` |
| Identificativo unità | no | Collega la persona all'unità indicata |
| Titolo sull'unità | no | `proprietario`, `usufruttuario`, `affittuario`, `comodatario`, `altro` |
| Note | no | |

La persona viene creata una sola volta anche se compare in più righe.

### Unità immobiliari — `template-unita.xlsx`

| Colonna | Obbligatoria | Note |
| --- | --- | --- |
| Codice condominio | sì | Deve esistere |
| Identificativo | sì | Es. `Int. 4` — univoco nel condominio |
| Piano | no | |
| Categoria | no | Testo libero (es. abitazione, garage, negozio) |
| Millesimi | no | Numero ≤ 1000; la somma per condominio non può superare 1000 |
| Millesimi riscaldamento | no | |
| Note | no | |

### Segnalazioni — `template-segnalazioni.xlsx`

| Colonna | Obbligatoria | Note |
| --- | --- | --- |
| Codice condominio | sì | Deve esistere |
| Titolo | sì | |
| Descrizione | no | |
| Categoria | no | `manutenzione`, `guasto`, `pulizia`, `sicurezza`, `rumore`, `documenti`, `amministrativa`, `altro` |
| Priorità | no | `bassa`, `media`, `alta`, `urgente` |
| Stato | no | `nuova`, `in_valutazione`, `assegnata`, `in_corso`, `risolta`, `chiusa` |
| Data apertura / Scadenza | no | |
| Area comune | no | |
| Identificativo unità | no | |
| Referente | no | Nome della persona di riferimento |

### Consumi — `template-consumi.xlsx`

| Colonna | Obbligatoria | Note |
| --- | --- | --- |
| Codice condominio | sì | Deve esistere |
| Categoria | sì | `acqua`, `gas`, `energia_elettrica`, `teleriscaldamento`, `rifiuti`, `altro` |
| Periodo da / Periodo a | sì | Date italiane o ISO |
| Valore | sì | Numero, anche con virgola decimale |
| Unità di misura | sì | `m3`, `kWh`, `MWh`, `lt`, `kg`, `euro`, `altro` |
| Costo (€) | no | |
| Fonte | no | Fornitore o bolletta |
| Origine | no | `inserito`, `importato`, `stimato` (default `importato`) |
| Data rilevazione | no | |
| Note | no | |

L'origine del dato è sempre visibile in interfaccia: un valore `stimato` è
escluso dai confronti tra periodi.

## Regole di lettura dei file

- Formati: `.xlsx`, `.xlsm`, `.csv`, `.txt`. Il CSV può usare `;` o `,` come
  separatore (rilevato automaticamente) ed è accettato il BOM di Excel.
- Dimensione massima **8 MB** per file, massimo **5000 righe**. Oltre il limite
  l'anteprima lo segnala e considera solo le prime 5000 righe.
- Viene letto il **primo foglio** del file Excel; la prima riga è di intestazione.
- Date accettate: `gg/mm/aaaa`, `aaaa-mm-gg`; le date impossibili (es. 31/02)
  producono un errore di riga.
- Numeri accettati in formato italiano (`1.234,56`), con virgola decimale o
  punto decimale (`1234.56`), e con simbolo `€` o `%` rimosso.
- Codici condominio sconosciuti, riferimenti a unità inesistenti, valori fuori
  dai limiti o testi troppo lunghi diventano errori di riga con il nome del campo.

## Duplicati

Il controllo avviene sia contro i dati già presenti sia all'interno del file:

| Tipo | Chiave di confronto |
| --- | --- |
| Condomìni | codice fiscale; oppure denominazione + comune |
| Persone | codice fiscale; oppure nome + cognome + email |
| Unità | codice condominio + identificativo |
| Segnalazioni | codice condominio + titolo + data apertura |
| Consumi | codice condominio + categoria + periodo |

Le righe duplicate **non vengono importate** salvo scelta esplicita nella
conferma. Restano comunque elencate nell'anteprima con il motivo.

## Esito, errori e annullamento

- l'anteprima è conservata come lotto (`import_batches` + `import_rows`) e non
  modifica i dati di produzione;
- ogni riga conserva il numero di riga originale, i dati letti, gli errori e gli
  avvisi: l'amministratore può correggere il file e ricaricarlo;
- **il file caricato non viene salvato** né su disco né nei log; vengono
  registrati solo nome file, dimensione, hash e riepilogo;
- l'annullamento elimina i record creati dal lotto. Se uno di questi è già stato
  collegato ad altri dati (es. un condominio con unità o documenti), l'operazione
  viene rifiutata con l'elenco dei collegamenti: quei dati vanno prima rimossi a
  mano, così non si perdono informazioni per errore.

## Buone pratiche

- Importare in quest'ordine: condomìni → unità → persone → segnalazioni → consumi.
- Usare sempre i codici condominio già presenti, non le denominazioni, nei file
  collegati.
- Prima di un import massiccio su dati reali: eseguire un backup del database
  (vedi [`BACKUP-RIPRISTINO.md`](BACKUP-RIPRISTINO.md)) e provare il file con
  poche righe.
- I dati di prova del seed sono marcati `[DEMO]`: non vanno mescolati ai dati
  reali, meglio usare un ambiente separato.
