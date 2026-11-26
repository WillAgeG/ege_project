#!/bin/sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${POSTGRES_USER:-vektor}"
PGDATABASE="${POSTGRES_DB:-vektor_ege}"
if [ -n "${BACKUP_INTERVAL_SEC:-}" ]; then
  INTERVAL_SEC="$BACKUP_INTERVAL_SEC"
else
  INTERVAL_SEC="$(( ${BACKUP_INTERVAL_HOURS:-24} * 3600 ))"
fi
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

STOP_REQUESTED=0
trap 'STOP_REQUESTED=1' INT TERM

mkdir -p "$BACKUP_DIR"

run_once() {
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  out_file="${BACKUP_DIR}/vektor_pg_${ts}.dump"
  tmp_file="${out_file}.tmp"
  enc_file="${out_file}.enc"
  enc_tmp="${enc_file}.tmp"

  echo "[pg-backup] creating dump ${PGDATABASE} -> ${out_file}"
  if pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" --format=custom --compress=9 --no-owner -f "$tmp_file" && [ -s "$tmp_file" ]; then
    if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ] && command -v openssl >/dev/null 2>&1; then
      if openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt -in "$tmp_file" -out "$enc_tmp" -pass env:BACKUP_ENCRYPTION_KEY && [ -s "$enc_tmp" ]; then
        rm -f "$tmp_file"
        mv "$enc_tmp" "$enc_file"
        (
          cd "$BACKUP_DIR"
          sha256sum "$(basename "$enc_file")" > "$(basename "$enc_file").sha256"
        )
        echo "[pg-backup] ready encrypted: $(basename "$enc_file")"
      else
        rm -f "$enc_tmp" "$tmp_file"
        echo "[pg-backup] ERROR: openssl encryption failed" >&2
      fi
    else
      mv "$tmp_file" "$out_file"
      (
        cd "$BACKUP_DIR"
        sha256sum "$(basename "$out_file")" > "$(basename "$out_file").sha256"
      )
      echo "[pg-backup] ready: $(basename "$out_file")"
    fi
  else
    rm -f "$tmp_file" "$enc_tmp"
    echo "[pg-backup] ERROR: pg_dump failed" >&2
  fi

  if [ "$RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
    find "$BACKUP_DIR" -maxdepth 1 -type f \( -name "vektor_pg_*.dump" -o -name "vektor_pg_*.dump.sha256" -o -name "vektor_pg_*.dump.enc" -o -name "vektor_pg_*.dump.enc.sha256" \) -mtime "+${RETENTION_DAYS}" -delete || true
  fi
}

if [ "${1:-}" = "--once" ]; then
  run_once
  exit 0
fi

# Небольшая пауза после старта, чтобы app успел применить первичную схему oltp/outbox
sleep 15

while [ "$STOP_REQUESTED" -eq 0 ]; do
  run_once
  slept=0
  while [ "$slept" -lt "$INTERVAL_SEC" ] && [ "$STOP_REQUESTED" -eq 0 ]; do
    sleep 5
    slept=$((slept + 5))
  done
done
