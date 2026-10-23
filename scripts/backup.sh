#!/usr/bin/env bash
#
# Backup completo del CRM EffeBi (database + documenti + verifica integrità).
# Pensato per cron su un server Linux; non invia nulla all'esterno.
#
# Uso:
#   sudo -u effebi ./scripts/backup.sh            # esegue il backup
#   sudo -u effebi ./scripts/backup.sh --dry-run  # mostra cosa farebbe
#
# Variabili (con default):
#   DATABASE_URL    connessione PostgreSQL (obbligatoria)
#   DATA_DIR        cartella dati dell'app (default: .data accanto al repo)
#   BACKUP_DIR      destinazione dei backup (default: /var/backups/effebi)
#   RETENTION_DAYS  giorni di conservazione dei backup giornalieri (default: 30)
#   MONTHLY_KEEP    mesi di conservazione delle copie mensili (default: 12)
#
set -euo pipefail

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

DATA_DIR="${DATA_DIR:-${APP_DIR}/.data}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/effebi}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
MONTHLY_KEEP="${MONTHLY_KEEP:-12}"
DATABASE_URL="${DATABASE_URL:-}"

STAMP="$(date +%Y%m%d-%H%M)"
DAY="$(date +%Y%m%d)"
MONTH="$(date +%Y%m)"

log() { printf '[backup %s] %s\n' "$(date +%H:%M:%S)" "$*"; }
run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    log "dry-run: $*"
    return 0
  fi
  "$@"
}

if [[ -z "$DATABASE_URL" ]]; then
  echo "ERRORE: DATABASE_URL non impostata. Il backup PGlite non è supportato in produzione." >&2
  exit 2
fi

if [[ ! -d "$DATA_DIR" ]]; then
  echo "ERRORE: DATA_DIR non trovata: $DATA_DIR" >&2
  exit 2
fi

if [[ "$DRY_RUN" == "0" ]]; then
  if ! command -v pg_dump >/dev/null 2>&1; then
    echo "ERRORE: pg_dump non trovato (installare postgresql-client)." >&2
    exit 2
  fi
else
  command -v pg_dump >/dev/null 2>&1 || log "avviso: pg_dump non disponibile in questo ambiente (dry-run)"
fi

run mkdir -p "$BACKUP_DIR"

DB_FILE="${BACKUP_DIR}/db-${STAMP}.dump"
DOCS_FILE="${BACKUP_DIR}/documenti-${STAMP}.tar.gz"

# --- 1. Database ------------------------------------------------------------
log "dump del database in ${DB_FILE}"
run pg_dump --format=custom --no-owner --no-privileges --file="$DB_FILE" "$DATABASE_URL"

if [[ "$DRY_RUN" == "0" ]]; then
  if [[ ! -s "$DB_FILE" ]]; then
    echo "ERRORE: il dump è vuoto." >&2
    exit 3
  fi
  pg_restore --list "$DB_FILE" > /dev/null
  log "dump verificato ($(du -h "$DB_FILE" | cut -f1))"
fi

# --- 2. Documenti -----------------------------------------------------------
if [[ -d "${DATA_DIR}/documenti" ]]; then
  log "archivio documenti in ${DOCS_FILE}"
  run tar -czf "$DOCS_FILE" -C "$DATA_DIR" documenti
else
  log "cartella documenti assente (STORAGE_DRIVER=supabase?): salto l'archivio locale"
fi

# --- 3. Copia mensile (il giorno 1 di ogni mese) ----------------------------
if [[ "$(date +%d)" == "01" ]]; then
  log "copia mensile per il mese ${MONTH}"
  run cp "$DB_FILE" "${BACKUP_DIR}/mensile-db-${MONTH}.dump"
  if [[ -f "$DOCS_FILE" ]]; then
    run cp "$DOCS_FILE" "${BACKUP_DIR}/mensile-documenti-${MONTH}.tar.gz"
  fi
fi

# --- 4. Impronte di integrità ----------------------------------------------
if [[ "$DRY_RUN" == "0" ]]; then
  ( cd "$BACKUP_DIR" && sha256sum "$(basename "$DB_FILE")" > "${DB_FILE}.sha256" )
  if [[ -f "$DOCS_FILE" ]]; then
    ( cd "$BACKUP_DIR" && sha256sum "$(basename "$DOCS_FILE")" >> "${DB_FILE}.sha256" )
  fi
  log "impronte SHA-256 scritte in ${DB_FILE}.sha256"
fi

# --- 5. Pulizia con conservazione ------------------------------------------
log "rimozione backup giornalieri più vecchi di ${RETENTION_DAYS} giorni"
run find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'db-*.dump' -o -name 'db-*.dump.sha256' -o -name 'documenti-*.tar.gz' \) \
  -mtime +"$RETENTION_DAYS" -delete

log "rimozione copie mensili più vecchie di ${MONTHLY_KEEP} mesi"
run find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'mensile-db-*.dump' -o -name 'mensile-documenti-*.tar.gz' \) \
  -mtime +$((MONTHLY_KEEP * 31)) -delete

log "completato. Ultimi file in ${BACKUP_DIR}:"
if [[ "$DRY_RUN" == "0" ]]; then
  ls -lh "$BACKUP_DIR" | tail -n 6
fi

cat <<'NOTA'

Promemoria:
- copiare i backup fuori dal server (destinazione cifrata, in UE);
- la chiave APP_ENCRYPTION_KEY va conservata nel gestore segreti, non qui;
- con STORAGE_DRIVER=supabase i documenti seguono i backup del fornitore;
- provare il ripristino almeno ogni trimestre (docs/BACKUP-RIPRISTINO.md).
NOTA
