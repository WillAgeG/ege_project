#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.prod}"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.yml"

usage() {
  cat <<EOF
Использование:
  $0 backup                  — снять сжатый custom-дамп PostgreSQL 17 + SHA-256 и очистить старые (> ${RETENTION_DAYS} дн.)
  $0 restore <dump_file>     — восстановить БД из custom-дампа (.dump) с проверкой SHA-256

Переменные окружения:
  ENV_FILE=${ENV_FILE}
  BACKUP_DIR=${BACKUP_DIR}
  RETENTION_DAYS=${RETENTION_DAYS}
EOF
}

get_env_val() {
  local target_key="$1"
  local default_val="${2:-}"
  if [ ! -f "$ENV_FILE" ]; then
    printf '%s' "$default_val"
    return 0
  fi
  local line key val first last found="$default_val"
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      ''|\#*) continue ;;
    esac
    while [ "${line# }" != "$line" ]; do line="${line# }"; done
    case "$line" in
      ''|\#*) continue ;;
      export\ *) line="${line#export }" ;;
    esac
    case "$line" in
      *=*) ;;
      *) continue ;;
    esac
    key="${line%%=*}"
    val="${line#*=}"
    while [ "${key% }" != "$key" ]; do key="${key% }"; done
    while [ "${key# }" != "$key" ]; do key="${key# }"; done
    if [ "$key" != "$target_key" ]; then
      continue
    fi
    while [ "${val# }" != "$val" ]; do val="${val# }"; done
    if [ "${#val}" -ge 2 ]; then
      first="${val:0:1}"
      last="${val:$((${#val} - 1)):1}"
      if [ "$first" = "'" ] && [ "$last" = "'" ]; then
        val="${val:1:$((${#val} - 2))}"
      elif [ "$first" = '"' ] && [ "$last" = '"' ]; then
        val="${val:1:$((${#val} - 2))}"
      fi
    fi
    found="$val"
  done < "$ENV_FILE"
  printf '%s' "$found"
}

calc_sha256() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file"
  else
    shasum -a 256 "$file"
  fi
}

verify_sha256() {
  local sum_file="$1"
  local dir base
  dir="$(cd "$(dirname "$sum_file")" && pwd)"
  base="$(basename "$sum_file")"
  (
    cd "$dir"
    if command -v sha256sum >/dev/null 2>&1; then
      sha256sum -c "$base"
    else
      shasum -a 256 -c "$base"
    fi
  )
}

require_env() {
  if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: ENV_FILE не найден: $ENV_FILE" >&2
    exit 1
  fi
  PG_USER="$(get_env_val POSTGRES_USER vektor)"
  PG_DB="$(get_env_val POSTGRES_DB vektor_ege)"
  BACKUP_ENC_KEY="${BACKUP_ENCRYPTION_KEY:-$(get_env_val BACKUP_ENCRYPTION_KEY "")}"
}

cmd_backup() {
  require_env
  mkdir -p "$BACKUP_DIR"
  local ts out_file tmp_file enc_file enc_tmp final_file
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  out_file="${BACKUP_DIR}/${PG_DB}_${ts}.dump"
  tmp_file="${out_file}.tmp"
  enc_file="${out_file}.enc"
  enc_tmp="${enc_file}.tmp"

  echo "Создание дампа ${PG_DB} (пользователь ${PG_USER}) -> ${out_file}"
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
    pg_dump -U "$PG_USER" -d "$PG_DB" --format=custom --compress=9 --no-owner \
    > "$tmp_file"

  if [ ! -s "$tmp_file" ]; then
    rm -f "$tmp_file"
    echo "ERROR: дамп получился пустым" >&2
    exit 1
  fi

  if [ -n "$BACKUP_ENC_KEY" ]; then
    if ! command -v openssl >/dev/null 2>&1; then
      rm -f "$tmp_file"
      echo "ERROR: openssl не найден для шифрования дампа" >&2
      exit 1
    fi
    _VEKTOR_BACKUP_KEY="$BACKUP_ENC_KEY" openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt \
      -in "$tmp_file" -out "$enc_tmp" -pass env:_VEKTOR_BACKUP_KEY
    rm -f "$tmp_file"
    mv "$enc_tmp" "$enc_file"
    final_file="$enc_file"
  else
    mv "$tmp_file" "$out_file"
    final_file="$out_file"
  fi

  (
    cd "$BACKUP_DIR"
    calc_sha256 "$(basename "$final_file")" > "$(basename "$final_file").sha256"
  )
  echo "Готово: ${final_file} ($(wc -c < "$final_file" | tr -d ' ') байт)"

  if [ "$RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
    find "$BACKUP_DIR" -maxdepth 1 -type f \( -name "${PG_DB}_*.dump" -o -name "${PG_DB}_*.dump.sha256" -o -name "${PG_DB}_*.dump.enc" -o -name "${PG_DB}_*.dump.enc.sha256" \) -mtime "+${RETENTION_DAYS}" -delete
  fi
}

cmd_restore() {
  local dump_file="${1:-}"
  if [ -z "$dump_file" ]; then
    echo "ERROR: укажите путь к .dump файлу" >&2
    usage
    exit 1
  fi
  if [ ! -f "$dump_file" ]; then
    echo "ERROR: файл дампа не найден: $dump_file" >&2
    exit 1
  fi
  require_env

  if [ -f "${dump_file}.sha256" ]; then
    echo "Проверка контрольной суммы ${dump_file}.sha256..."
    verify_sha256 "${dump_file}.sha256"
  fi

  echo "Восстановление ${PG_DB} из ${dump_file}..."
  case "$dump_file" in
    *.enc)
      if [ -z "$BACKUP_ENC_KEY" ]; then
        echo "ERROR: для восстановления зашифрованного дампа требуется BACKUP_ENCRYPTION_KEY" >&2
        exit 1
      fi
      _VEKTOR_BACKUP_KEY="$BACKUP_ENC_KEY" openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
        -in "$dump_file" -pass env:_VEKTOR_BACKUP_KEY \
        | docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
          pg_restore -U "$PG_USER" -d "$PG_DB" --clean --if-exists --no-owner
      ;;
    *)
      docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
        pg_restore -U "$PG_USER" -d "$PG_DB" --clean --if-exists --no-owner \
        < "$dump_file"
      ;;
  esac
  echo "Восстановление завершено."
}

case "${1:-backup}" in
  backup) cmd_backup ;;
  restore) cmd_restore "${2:-}" ;;
  -h|--help) usage ;;
  *)
    usage >&2
    exit 1
    ;;
esac
