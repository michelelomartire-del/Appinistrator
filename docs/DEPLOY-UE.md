# Deploy su un server Node in UE

Runbook per mettere online il CRM EffeBi su un server Linux in Unione Europea:
un solo processo Node, PostgreSQL gestito o locale, HTTPS, backup automatici.

Riferimenti collegati: [`INSTALLAZIONE.md`](INSTALLAZIONE.md) (parametri),
[`CONFIGURAZIONE.md`](CONFIGURAZIONE.md) (variabili), [`BACKUP-RIPRISTINO.md`](BACKUP-RIPRISTINO.md).

---

## 1. Perché un server e non una piattaforma serverless

L'applicazione ha bisogno di un processo persistente e di un disco scrivibile:

| Requisito | Server Node | Serverless (es. Vercel) |
| --- | --- | --- |
| Import fino a 8 MB, documenti fino a 15 MB | ok (nginx `client_max_body_size`) | limite piattaforma 4,5 MB per richiesta **e risposta** |
| Storage locale documenti | ok | filesystem di sola lettura, serve storage esterno |
| Rate limit in memoria per login/MFA/ricerca | coerente su un solo processo | istanze multiple, limite non condiviso |
| Migrazioni, CLI admin, seed | semplici | da spostare su CI |
| Costo tipico | 5–12 €/mese | piano a consumo |

## 2. Scelta dell'host (regione UE)

| Opzione | Note | Costo indicativo |
| --- | --- | --- |
| **Hetzner CX22** (Norimberga/Falkenstein, DE) | 2 vCPU, 4 GB RAM, 40 GB SSD — configurazione consigliata | ~4–5 €/mese |
| Hetzner CPX11 | 2 vCPU AMD, 2 GB RAM | ~5 €/mese |
| Netcup / IONOS / Aruba Cloud (IT) | alternative con datacenter in Germania o Italia | 5–10 €/mese |
| Render / Railway / Fly.io (region `fra`/`ams`) | PaaS con deploy da git, disco persistente a pagamento | 7–20 €/mese |

PostgreSQL, due strade:

- **gestito in UE** (Supabase, Neon, Hetzner Managed): backup e aggiornamenti inclusi, consigliato se non si vuole amministrare il database;
- **locale sullo stesso server** (sezione 4B): zero costi aggiuntivi, backup e patch a carico dello studio.

Per un singolo studio con poche centinaia di unità, 2 GB di RAM e un database locale bastano; il disco va dimensionato sui documenti (PDF di verbali e bollette).

## 3. Preparazione del server (Ubuntu 24.04 LTS)

```bash
# da locale: primo accesso come root
ssh root@203.0.113.10

apt update && apt upgrade -y
apt install -y ufw fail2ban unattended-upgrades curl git nginx \
  postgresql-client ca-certificates

# utente dedicato, senza privilegi e senza login con password
adduser --disabled-password --gecos "" effebi
usermod -aG www-data effebi
mkdir -p /home/effebi/.ssh && chmod 700 /home/effebi/.ssh
cp ~/.ssh/authorized_keys /home/effebi/.ssh/ && chown -R effebi:effebi /home/effebi/.ssh
chmod 600 /home/effebi/.ssh/authorized_keys

# firewall: solo SSH, HTTP, HTTPS
ufw default deny incoming && ufw default allow outgoing
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
ufw --force enable

systemctl enable --now fail2ban
dpkg-reconfigure -plow unattended-upgrades   # aggiornamenti di sicurezza automatici
timedatectl set-timezone Europe/Rome
```

Verificare di poter accedere come `effebi` **prima** di disabilitare l'accesso root via password:

```bash
ssh effebi@203.0.113.10
```

Aggiungere 2 GB di swap solo se il server ha 2 GB di RAM (utile durante la build):

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 4A. PostgreSQL gestito (consigliato)

1. Creare il progetto scegliendo **regione UE** (es. `eu-central-1`, `eu-south-1`).
2. Annotare la connection string; se il provider offre il pooler, usare quella (porta 6543 su Supabase).
3. Impostare in `.env`:
   ```env
   DATABASE_URL=postgresql://utente:password@host:5432/effebi_crm?sslmode=require
   DATABASE_SSL=true
   ```
4. Consentire l'IP del server (allowlist) e conservare la password nel gestore segreti.

## 4B. PostgreSQL locale sullo stesso server

```bash
apt install -y postgresql postgresql-contrib

sudo -u postgres psql <<'SQL'
create role effebi with login password 'SOSTITUIRE_CON_PASSWORD_FORTE';
create database effebi_crm owner effebi encoding 'UTF8' template template0;
revoke all on database effebi_crm from public;
SQL

# connessioni solo da localhost, con password (scram-sha-256)
sed -i "s/^local\s\+all\s\+all\s\+peer/local   all             all                                     scram-sha-256/" /etc/postgresql/*/main/pg_hba.conf
systemctl restart postgresql
```

In `.env`: `DATABASE_URL=postgresql://effebi:PASSWORD@127.0.0.1:5432/effebi_crm` e `DATABASE_SSL=false`.

Buone pratiche minime (file `postgresql.conf`):

```conf
listen_addresses = 'localhost'
shared_buffers = 512MB          # su server da 4 GB
work_mem = 16MB
max_connections = 40
```

Riavviare: `systemctl restart postgresql`. Il database è incluso nei backup dello script alla sezione 8.

## 5. Applicazione

```bash
sudo -u effebi -H bash
mkdir -p /opt/effebi-crm && cd /opt/effebi-crm
git clone https://github.com/<organizzazione>/Appinistrator.git .

# Node 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v    # >= 22.10

# dipendenze + build
npm ci
npm run build            # dist/public (client) + dist/server (API)

# configurazione
cp .env.production.example .env
chmod 600 .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # APP_ENCRYPTION_KEY
$EDITOR .env             # DATABASE_URL, APP_URL, chiave, DEMO_MODE=false

# dati persistenti fuori dal repository
sudo mkdir -p /var/lib/effebi-crm && sudo chown -R effebi:effebi /var/lib/effebi-crm
# in .env: DATA_DIR=/var/lib/effebi-crm

# schema, account amministratore, controllo configurazione
npm run migrate
npm run admin:create -- --email nome@studio.it --nome Nome --cognome Cognome

# prova rapida (prima del servizio)
npm start
# in un'altra shell: curl -s http://127.0.0.1:4000/api/health
```

`admin:create` stampa una password monouso se non ne viene indicata una: consegnarla a voce o su canale cifrato. Al primo accesso l'app forza il cambio password.

Se compare un errore di configurazione, il server elenca esattamente cosa manca (chiave, `DATABASE_URL`, `DEMO_MODE`, `APP_URL` in HTTP).

## 6. Servizio systemd

```ini
# /etc/systemd/system/effebi-crm.service
[Unit]
Description=CRM EffeBi
After=network.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=effebi
Group=effebi
WorkingDirectory=/opt/effebi-crm
EnvironmentFile=/opt/effebi-crm/.env
ExecStart=/usr/bin/node dist/server/index.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=20

# isolamento
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/var/lib/effebi-crm
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictSUIDSGID=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now effebi-crm
sudo systemctl status effebi-crm
journalctl -u effebi-crm -f        # log applicativo (metodo, percorso, stato, durata)
```

## 7. HTTPS con nginx e Let's Encrypt

```nginx
# /etc/nginx/sites-available/crm
server {
  listen 80;
  server_name crm.studio-effebi.example;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name crm.studio-effebi.example;

  # caricamenti: documenti fino a 15 MB + margine multipart
  client_max_body_size 16m;

  # il portale applicativo non deve essere indicizzato
  add_header X-Robots-Tag "noindex, nofollow" always;

  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/crm
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d crm.studio-effebi.example --redirect --agree-tos -m nome@studio.it
sudo systemctl list-timers | grep certbot   # rinnovo automatico
```

Allineare `.env`: `APP_URL=https://crm.studio-effebi.example` e `TRUST_PROXY=1` (un proxy davanti). Con più proxy incrementare il valore.

## 8. Backup automatici

Lo script `scripts/backup.sh` esegue dump del database, archivio dei documenti,
verifica di integrità, impronte SHA-256 e rotazione (30 giorni + 12 copie mensili).

```bash
sudo mkdir -p /var/backups/effebi && sudo chown effebi:effebi /var/backups/effebi
sudo -u effebi DATABASE_URL="$(grep '^DATABASE_URL=' /opt/effebi-crm/.env | cut -d= -f2-)" \
  DATA_DIR=/var/lib/effebi-crm BACKUP_DIR=/var/backups/effebi \
  /opt/effebi-crm/scripts/backup.sh --dry-run   # prova senza scrivere
```

Cron giornaliero alle 03:15 (l'utente `effebi` legge `.env`):

```cron
# crontab -e (utente effebi)
15 3 * * * set -a; . /opt/effebi-crm/.env; set +a; /opt/effebi-crm/scripts/backup.sh >> /var/log/effebi-backup.log 2>&1
```

Copiare i backup **fuori dal server** (destinazione cifrata in UE):

```bash
# esempio con rclone verso storage S3 compatibile UE
rclone sync /var/backups/effebi remote:effebi-backup --immutable
```

Verifica trimestrale di ripristino: [`BACKUP-RIPRISTINO.md`](BACKUP-RIPRISTINO.md), sezione 4.

## 9. Monitoraggio

- **Salute**: `curl -fsS https://crm.studio-effebi.example/api/health` → `{"ok":true,...,"demo":false}`; collegarlo a un servizio di uptime (Uptime Kuma, BetterStack) con avviso su email.
- **Errori**: `journalctl -u effebi-crm -p err --since "24 hours ago"`; il log applicativo non contiene dati personali.
- **Disco**: avviso all'80% (`df -h`), i documenti crescono nel tempo.
- **Database**: `pg_database_size('effebi_crm')`, connessioni attive `pg_stat_activity`.
- **Sessioni**: Impostazioni → *Stato del sistema* mostra conteggi e migrazioni applicate.

## 10. Aggiornamenti e rollback

```bash
cd /opt/effebi-crm
git fetch --tags
git tag | tail -5                 # individuare la versione
git checkout v1.1.0               # oppure: git pull --ff-only
npm ci
npm run build
npm run migrate                   # idempotente, sempre prima del riavvio
sudo systemctl restart effebi-crm
curl -fsS http://127.0.0.1:4000/api/health
```

Rollback del codice: `git checkout <tag-precedente>`, `npm ci`, `npm run build`, riavvio.
**Attenzione**: se la nuova versione ha applicato una migrazione distruttiva, il rollback del solo codice non basta: ripristinare il dump precedente (sezione 4 dei backup) e riallineare `schema_migrations`.

Prima di ogni aggiornamento: backup manuale.

## 11. Checklist di go-live

- [ ] `NODE_ENV=production`, `DEMO_MODE=false`, `APP_URL` in `https://`
- [ ] `APP_ENCRYPTION_KEY` salvata nel gestore segreti (non solo nel `.env`)
- [ ] `.env` con permessi `600`, proprietario `effebi`
- [ ] PostgreSQL in regione UE, password forte, accesso ristretto
- [ ] `DATA_DIR` fuori dal checkout, backups inclusi
- [ ] migrazioni applicate, account amministratore creato
- [ ] MFA attivata dall'amministratore (Impostazioni → Autenticazione a due fattori)
- [ ] HTTPS valido, redirect da HTTP, rinnovo certificato attivo
- [ ] da browser anonimo nessun dato: `/api/condomini` risponde 401
- [ ] download di un documento senza sessione risponde 401
- [ ] upload di un PDF di prova (e di un file da 10 MB) funziona
- [ ] backup automatico eseguito almeno una volta, con ripristino provato su database di test
- [ ] registro trattamenti aggiornato: fornitore hosting, regione, sub-responsabili
- [ ] nessun dato demo in produzione (`select count(*) from condomini where codice like 'DEMO-%'` → 0)

## 12. Costi indicativi (mensili)

| Voce | Costo |
| --- | --- |
| VPS 2 vCPU / 4 GB (UE) | 4–6 € |
| Dominio (annuo) | ~12 €/anno |
| PostgreSQL gestito (se scelto) | 0–25 € |
| Backup fuori sede (100 GB) | 1–5 € |
| **Totale tipico** | **5–15 €/mese** |

## 13. Problemi frequenti

| Sintomo | Causa probabile | Rimedio |
| --- | --- | --- |
| `502 Bad Gateway` | servizio fermo o crash all'avvio | `systemctl status effebi-crm`, `journalctl -u effebi-crm -n 100`; se manca configurazione il processo esce con il motivo |
| Login non mantiene la sessione | cookie `Secure` su HTTP, o `APP_URL` errata | usare HTTPS e allineare `APP_URL` |
| `403` con `code: "csrf"` su ogni modifica | proxy che rimuove i cookie o chiamate cross-origin | verificare dominio unico e header `x-csrf-token` |
| Upload rifiutato con 413 | `client_max_body_size` troppo basso | 16 MB in nginx, ricaricare |
| `migrate` fallisce | credenziali o database assente | provare `psql "$DATABASE_URL" -c 'select 1'` |
| Documento non scaricabile | file assente in `DATA_DIR` dopo un ripristino parziale | ripristinare documenti e database dallo stesso backup |
| Avvio rifiutato | `DEMO_MODE=true`, `DATABASE_URL` assente, `APP_URL` http | leggere l'elenco stampato dal server e correggere `.env` |
| Errori `too many clients` | pool applicativo + connessioni esterne | usare la stringa *pooled* del provider o ridurre `max` in `src/server/db.ts` |
