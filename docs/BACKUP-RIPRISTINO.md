# Backup e ripristino

Un backup completo del CRM comprende **tre elementi**:

1. **Database** (tutte le anagrafiche, i moduli, l'audit log e i metadati dei documenti);
2. **Documenti** (file dell'archivio privato: cartella locale o bucket Supabase);
3. **`.env`** (in particolare `APP_ENCRYPTION_KEY`), conservato in un gestore di segreti,
   **non** nello stesso archivio del backup dati.

Senza la chiave di cifratura i dati restano leggibili, ma i segreti MFA non sono
decifrabili: in caso di ripristino senza chiave si esegue
`npm run admin:reset-mfa -- --email ...` e si riconfigura la MFA.

## Frequenza consigliata

| Elemento | Frequenza | Conservazione |
| --- | --- | --- |
| Database | giornaliera (automatica) | 30 giorni + 1 copia mensile per 12 mesi |
| Documenti | giornaliera (incrementale o snapshot) | come il database |
| `.env` | a ogni modifica della configurazione | versionato nel gestore segreti |

Eseguire almeno **una prova di ripristino complete** ogni trimestre: un backup mai
ripristinato non è un backup.

## 1. Database PostgreSQL

### Backup

```bash
STAMP=$(date +%Y%m%d-%H%M)
pg_dump --format=custom --no-owner --no-privileges \
  --file=/var/backups/effebi/db-$STAMP.dump \
  "$DATABASE_URL"
```

- `--format=custom` permette il ripristino selettivo e la compressione.
- Verificare l'esito (`echo $?`) e la dimensione del file (`pg_restore --list`).
- Copiare l'archivio su una destinazione diversa dal server (regione UE),
  cifrata, con accesso limitato.

Se il database è gestito (Supabase, Postgres cloud), usare anche i backup
automatici del fornitore: verificare nel contratto ritenzione e regione.

### Ripristino

Su un database vuoto:

```bash
createdb effebi_crm_restore
pg_restore --no-owner --no-privileges --dbname=effebi_crm_restore \
  /var/backups/effebi/db-20260101-0300.dump
```

Poi aggiornare `DATABASE_URL` in `.env`, eseguire `npm run migrate` (applica le
migrazioni successive al backup) e riavviare il servizio.

> Ripristinare **solo** il database senza i documenti produce schede documento
> senza file: ripristinare sempre i due elementi dallo stesso momento.

## 2. Documenti

### Storage locale (`STORAGE_DRIVER=local`)

Cartella `DATA_DIR/documenti` (default `.data/documenti`), file con permessi
`0600` e nomi UUID.

```bash
# backup
tar -czf /var/backups/effebi/documenti-$(date +%Y%m%d).tar.gz \
  -C /opt/effebi-crm/.data documenti

# verifica
tar -tzf /var/backups/effebi/documenti-$(date +%Y%m%d).tar.gz | head
```

Il backup va eseguito con l'applicazione ferma oppure su uno snapshot del volume:
un file copiato mentre viene scritto può risultare incompleto.

### Supabase Storage (`STORAGE_DRIVER=supabase`)

- attivare i backup del progetto secondo il piano del fornitore;
- in alternativa scaricare periodicamente il bucket privato con la service key
  (solo da server), conservando l'archivio cifrato.

### Ripristino

Riportare la cartella (o il bucket) nella stessa struttura di chiavi indicata
nella colonna `storage_key` della tabella `documenti`. Le chiavi sono generate
dal server e non contengono dati personali.

## 3. Applicazione (PGlite, solo sviluppo/demo)

Con PGlite il database è la cartella `DATA_DIR/db`. Per una copia di lavoro:

```bash
systemctl stop effebi-crm
tar -czf /var/backups/effebi/dev-data.tar.gz -C /opt/effebi-crm .data
systemctl start effebi-crm
```

PGlite **non è supportato per dati reali**: in produzione usare PostgreSQL.

## 4. Procedura di ripristino completa

1. **Fermare** il servizio: `sudo systemctl stop effebi-crm`.
2. **Mettere al sicuro** i dati correnti (rinominare `.data/documenti` o creare un
   database di appoggio): non sovrascrivere senza una copia.
3. **Ripristinare il database** (punto 1) e **i documenti** (punto 2) dello stesso backup.
4. **Verificare `.env`**: `DATABASE_URL`, `APP_ENCRYPTION_KEY`, `STORAGE_DRIVER`,
   `APP_URL`, `DEMO_MODE=false`.
5. **Applicare le migrazioni**: `npm run migrate`.
6. **Riavviare**: `sudo systemctl start effebi-crm`.
7. **Controllare**:

   - `curl https://crm.studio.example/api/health` → `ok: true, demo: false`;
   - accesso amministratore (se la MFA non risponde, `npm run admin:reset-mfa`);
   - Impostazioni → *Stato del sistema*: conteggi di condomìni, persone,
     segnalazioni, assemblee, periodi, consumi e documenti coerenti con il backup;
   - apertura di un documento dal suo condominio: se il file è presente si apre
     correttamente, se manca il sistema risponde con errore esplicito;
   - una segnalazione, un rendiconto e un confronto consumi mostrano gli stessi
     valori di prima del guasto.

8. Annotare data, backup usato, durata e verifiche eseguite nel registro dello studio.

## 5. Cancellazione e conservazione

- L'archivio documenti è privato: la cancellazione di un documento rimuove il file
  dallo storage e la riga dal database.
- Le copie di backup conservano i dati fino alla scadenza stabilita: definirla con
  il titolare del trattamento e documentarla nell'informativa interna.
- L'audit log conserva le operazioni (chi, cosa, quando) senza contenuti dei file
  né password: va incluso nei backup perché è parte della tracciabilità.
