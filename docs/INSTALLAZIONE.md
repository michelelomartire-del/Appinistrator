# Installazione e messa in produzione

Questa guida copre l'installazione del CRM EffeBi su un server Linux dello studio.
Per lo sviluppo locale è sufficiente la sezione 1 e 2 con PGlite.

> Per la messa online passo passo (scelta dell'host UE, PostgreSQL, systemd,
> nginx, certificati, backup automatici e checklist di go-live) vedi
> [`DEPLOY-UE.md`](DEPLOY-UE.md).

## 1. Prerequisiti

| Componente | Versione minima | Note |
| --- | --- | --- |
| Node.js | 22.10 | `node -v` |
| npm | 10 | incluso in Node |
| PostgreSQL | 15 | obbligatorio per dati reali, in regione UE |
| Disco | 5 GB | database, documenti e backup |
| Reverse proxy | nginx/Caddy | solo per pubblicazione HTTPS |

Non servono Docker né servizi cloud: l'applicazione è un singolo processo Node.

## 2. Installazione

```bash
git clone <repository> /opt/effebi-crm
cd /opt/effebi-crm
npm ci --omit=dev=false      # le dipendenze di build servono per compilare il client
cp .env.example .env
```

Compilare `.env` seguendo [`CONFIGURAZIONE.md`](CONFIGURAZIONE.md). Come minimo:

- `NODE_ENV=production`
- `DATABASE_URL` (PostgreSQL in regione UE)
- `APP_ENCRYPTION_KEY` (32 byte casuali, base64)
- `APP_URL=https://crm.studio.example`
- `DEMO_MODE=false`

Generare la chiave:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Conservarla in un gestore di segreti: **senza questa chiave i segreti MFA già
salvati non sono più decifrabili** (l'accesso resta possibile, ma la MFA va
riconfigurata).

## 3. Database e primo account

```bash
npm run build        # genera dist/public (client) e dist/server (API)
npm run migrate      # crea lo schema; è idempotente
npm run admin:create -- --email nome@studio.it --nome Nome --cognome Cognome
```

`admin:create`:

- crea l'account (o reimposta la password se l'email esiste) con
  `must_change_password = true`;
- se `--password` è omessa genera una password monouso di 22 caratteri e la
  stampa **una sola volta**;
- invalida le sessioni attive dell'account.

Consegnare le credenziali a voce o tramite canale cifrato. Al primo accesso
l'amministratore deve cambiare la password e può attivare la MFA
(Impostazioni → Autenticazione a due fattori).

Non esiste alcuna procedura di registrazione pubblica: nuovi account si creano
solo da CLI sul server.

## 4. Avvio

Manuale:

```bash
NODE_ENV=production npm start
```

Il processo serve sia le API (`/api/*`) sia il client compilato (`dist/public`).
All'avvio vengono verificati i parametri di produzione: con configurazione
insicura (manca `DATABASE_URL`, `DEMO_MODE` attivo, `APP_URL` in HTTP, storage
Supabase senza credenziali) il processo **non parte** e stampa il motivo.

### Servizio systemd

```ini
# /etc/systemd/system/effebi-crm.service
[Unit]
Description=CRM EffeBi
After=network.target postgresql.service

[Service]
Type=simple
User=effebi
WorkingDirectory=/opt/effebi-crm
EnvironmentFile=/opt/effebi-crm/.env
ExecStart=/usr/bin/node dist/server/index.js
Restart=on-failure
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now effebi-crm
sudo systemctl status effebi-crm
```

### Reverse proxy (nginx)

```nginx
server {
  listen 443 ssl http2;
  server_name crm.studio.example;

  client_max_body_size 12m;          # import/upload documenti

  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

server {
  listen 80;
  server_name crm.studio.example;
  return 301 https://$host$request_uri;
}
```

`TRUST_PROXY` deve corrispondere al numero di proxy davanti all'app (1 con la
configurazione sopra), altrimenti il rate limiting vede sempre lo stesso IP.

L'applicazione invia già `Strict-Transport-Security`, `Content-Security-Policy`,
`X-Content-Type-Options`, `X-Frame-Options` e `Referrer-Policy`.

## 5. Verifica dopo il deploy

1. `curl https://crm.studio.example/api/health` → `{"ok":true,...}` con `"demo":false`.
2. Da browser anonimo: la pagina di accesso appare e nessuna chiamata a `/api/...`
   restituisce dati (401).
3. Accesso con l'account amministratore, cambio password forzato.
4. Impostazioni → Stato del sistema: migrazioni applicate e conteggi coerenti.
5. Caricare un documento di prova e verificare che l'URL diretto del file
   (`/api/documenti/:id/file`) senza sessione restituisca 401.
6. Pianificare backup e prova di ripristino (vedi [`BACKUP-RIPRISTINO.md`](BACKUP-RIPRISTINO.md)).

## 6. Aggiornamenti

```bash
cd /opt/effebi-crm
git pull
npm ci
npm run build
npm run migrate
sudo systemctl restart effebi-crm
```

Eseguire `npm run migrate` sempre prima del riavvio: le migrazioni sono
idempotenti e applicate in transazione.

## 7. Recupero accessi

| Problema | Rimedio (solo da server) |
| --- | --- |
| Password dimenticata | `npm run admin:create -- --email ... --nome ... --cognome ...` reimposta la password e forza il cambio |
| Dispositivo MFA perso | `npm run admin:reset-mfa -- --email ...` disattiva la MFA e chiude le sessioni |
| Sessione sospetta | Impostazioni → Sessioni attive → Revoca |

Nessuno di questi comandi è esposto via rete.
