#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.prod"
SKIP_COMPOSE=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --skip-compose)
      SKIP_COMPOSE=1
      shift
      ;;
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    -h|--help)
      echo "Использование: $0 [--skip-compose] [--env-file PATH | PATH]"
      exit 0
      ;;
    *)
      ENV_FILE="$1"
      shift
      ;;
  esac
done

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: файл окружения не найден: $ENV_FILE" >&2
  echo "Создайте его командой: cp ${ROOT_DIR}/.env.prod.example ${ENV_FILE}" >&2
  exit 1
fi

errors=0
err() {
  echo "  [FAIL] $1" >&2
  errors=$((errors + 1))
}

ok() {
  echo "  [OK]   $1"
}

get_env_val() {
  local target_key="$1"
  local line key val first last
  local found=""
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      ''|\#*) continue ;;
    esac
    # Убрать ведущие пробелы
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

has_placeholder() {
  local low
  low="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$low" in
    *change_me*|*example.ru*|*example.com*|*replace-with*|*your-domain*)
      return 0
      ;;
  esac
  return 1
}

echo "=== Preflight-проверка прод-контура 152-ФЗ (${ENV_FILE}) ==="

REQUIRED_KEYS=(
  APP_DOMAIN
  ADMIN_DOMAIN
  ACME_EMAIL
  ADMIN_BASIC_USER
  ADMIN_BASIC_HASH
  POSTGRES_DB
  POSTGRES_USER
  POSTGRES_PASSWORD
  DB_MODE
  VEKTOR_ENV
  DEV_DEMO_MODE
  SECURITY_HEADERS
  ADMIN_REQUIRE_AUTH
  ADMIN_API_TOKEN
)

for k in "${REQUIRED_KEYS[@]}"; do
  v="$(get_env_val "$k")"
  if [ -z "$v" ]; then
    err "$k пуст или отсутствует в $ENV_FILE"
  elif has_placeholder "$v"; then
    err "$k содержит шаблонное значение (${v})"
  else
    ok "$k задан"
  fi
done

APP_DOMAIN_VAL="$(get_env_val APP_DOMAIN)"
ADMIN_DOMAIN_VAL="$(get_env_val ADMIN_DOMAIN)"
ACME_EMAIL_VAL="$(get_env_val ACME_EMAIL)"
ADMIN_BASIC_HASH_VAL="$(get_env_val ADMIN_BASIC_HASH)"
POSTGRES_PASSWORD_VAL="$(get_env_val POSTGRES_PASSWORD)"
ADMIN_API_TOKEN_VAL="$(get_env_val ADMIN_API_TOKEN)"
DB_MODE_VAL="$(printf '%s' "$(get_env_val DB_MODE)" | tr '[:upper:]' '[:lower:]')"
VEKTOR_ENV_VAL="$(printf '%s' "$(get_env_val VEKTOR_ENV)" | tr '[:upper:]' '[:lower:]')"
DEV_DEMO_MODE_VAL="$(printf '%s' "$(get_env_val DEV_DEMO_MODE)" | tr '[:upper:]' '[:lower:]')"
ADMIN_REQUIRE_AUTH_VAL="$(printf '%s' "$(get_env_val ADMIN_REQUIRE_AUTH)" | tr '[:upper:]' '[:lower:]')"
SECURITY_HEADERS_VAL="$(printf '%s' "$(get_env_val SECURITY_HEADERS)" | tr '[:upper:]' '[:lower:]')"

if [ -n "$APP_DOMAIN_VAL" ]; then
  case "$APP_DOMAIN_VAL" in
    http://* | https://* | */*) err "APP_DOMAIN должен быть доменным именем без https:// и слэшей: $APP_DOMAIN_VAL" ;;
    *.*) ok "APP_DOMAIN формат корректен ($APP_DOMAIN_VAL)" ;;
    *) err "APP_DOMAIN должен содержать зону (например vektor.ru): $APP_DOMAIN_VAL" ;;
  esac
fi

if [ -n "$ADMIN_DOMAIN_VAL" ]; then
  case "$ADMIN_DOMAIN_VAL" in
    http://* | https://* | */*) err "ADMIN_DOMAIN должен быть доменным именем без https:// и слэшей: $ADMIN_DOMAIN_VAL" ;;
    "$APP_DOMAIN_VAL") err "ADMIN_DOMAIN не должен совпадать с APP_DOMAIN" ;;
    *.*) ok "ADMIN_DOMAIN формат корректен ($ADMIN_DOMAIN_VAL)" ;;
    *) err "ADMIN_DOMAIN должен содержать зону: $ADMIN_DOMAIN_VAL" ;;
  esac
fi

if [ -n "$ACME_EMAIL_VAL" ]; then
  case "$ACME_EMAIL_VAL" in
    *@*.*) ok "ACME_EMAIL формат корректен" ;;
    *) err "ACME_EMAIL не похож на корректный email: $ACME_EMAIL_VAL" ;;
  esac
fi

if [ "$VEKTOR_ENV_VAL" != "production" ]; then
  err "VEKTOR_ENV должен быть production (сейчас: '${VEKTOR_ENV_VAL:-empty}')"
else
  ok "VEKTOR_ENV=production"
fi

if [ "$DEV_DEMO_MODE_VAL" != "0" ] && [ "$DEV_DEMO_MODE_VAL" != "false" ]; then
  err "DEV_DEMO_MODE в проде должен быть 0 (сейчас: '${DEV_DEMO_MODE_VAL:-empty}')"
else
  ok "DEV_DEMO_MODE отключён"
fi

if [ "$ADMIN_REQUIRE_AUTH_VAL" != "1" ] && [ "$ADMIN_REQUIRE_AUTH_VAL" != "true" ]; then
  err "ADMIN_REQUIRE_AUTH должен быть 1 (сейчас: '${ADMIN_REQUIRE_AUTH_VAL:-empty}')"
else
  ok "ADMIN_REQUIRE_AUTH включён"
fi

if [ "$SECURITY_HEADERS_VAL" != "1" ] && [ "$SECURITY_HEADERS_VAL" != "true" ]; then
  err "SECURITY_HEADERS должен быть 1 (сейчас: '${SECURITY_HEADERS_VAL:-empty}')"
else
  ok "SECURITY_HEADERS включён"
fi

if [ "$DB_MODE_VAL" != "postgres" ] && [ "$DB_MODE_VAL" != "dual" ]; then
  err "DB_MODE для прод-контура должен быть postgres или dual (сейчас: '${DB_MODE_VAL:-empty}')"
else
  ok "DB_MODE=${DB_MODE_VAL}"
fi

if [ -n "$POSTGRES_PASSWORD_VAL" ]; then
  if [ "${#POSTGRES_PASSWORD_VAL}" -lt 16 ]; then
    err "POSTGRES_PASSWORD слишком короткий (минимум 16 символов)"
  elif printf '%s' "$POSTGRES_PASSWORD_VAL" | grep -qE '[@/:?#%[:space:]]'; then
    err "POSTGRES_PASSWORD содержит спецсимволы URL (@ / : ? # % или пробелы); используйте openssl rand -hex 24"
  else
    ok "POSTGRES_PASSWORD длина и формат безопасны"
  fi
fi

if [ -n "$ADMIN_API_TOKEN_VAL" ]; then
  if [ "${#ADMIN_API_TOKEN_VAL}" -lt 24 ]; then
    err "ADMIN_API_TOKEN слишком короткий (минимум 24 символа)"
  else
    ok "ADMIN_API_TOKEN достаточной длины"
  fi
fi

if [ -n "$ADMIN_BASIC_HASH_VAL" ]; then
  case "$ADMIN_BASIC_HASH_VAL" in
    '$2a$'*|'$2b$'*|'$2y$'*)
      if [ "${#ADMIN_BASIC_HASH_VAL}" -lt 50 ]; then
        err "ADMIN_BASIC_HASH повреждён или усечён; оберните хэш в одинарные кавычки '...'"
      else
        ok "ADMIN_BASIC_HASH распознан как bcrypt"
      fi
      ;;
    *)
      err "ADMIN_BASIC_HASH должен быть bcrypt-хэшем (\$2a\$/\$2b\$/\$2y\$); сгенерируйте через caddy hash-password и оберните в одинарные кавычки"
      ;;
  esac
fi

DB_RUN_CONSTRAINT_DDL_VAL="$(printf '%s' "$(get_env_val DB_RUN_CONSTRAINT_DDL)" | tr '[:upper:]' '[:lower:]')"
if [ "$DB_RUN_CONSTRAINT_DDL_VAL" = "1" ] || [ "$DB_RUN_CONSTRAINT_DDL_VAL" = "true" ]; then
  err "DB_RUN_CONSTRAINT_DDL в проде должен быть 0 (схемой управляет Alembic)"
fi

WEB_CONCURRENCY_VAL="$(get_env_val WEB_CONCURRENCY)"
if [ -n "$WEB_CONCURRENCY_VAL" ]; then
  case "$WEB_CONCURRENCY_VAL" in
    *[!0-9]*|"")
      err "WEB_CONCURRENCY должен быть целым числом 1..16 (сейчас: '${WEB_CONCURRENCY_VAL}')"
      ;;
    *)
      if [ "$WEB_CONCURRENCY_VAL" -lt 1 ] || [ "$WEB_CONCURRENCY_VAL" -gt 16 ]; then
        err "WEB_CONCURRENCY должен быть в диапазоне 1..16 (сейчас: '${WEB_CONCURRENCY_VAL}')"
      else
        ok "WEB_CONCURRENCY=${WEB_CONCURRENCY_VAL}"
      fi
      ;;
  esac
fi

LOG_FORMAT_VAL="$(printf '%s' "$(get_env_val LOG_FORMAT)" | tr '[:upper:]' '[:lower:]')"
if [ -n "$LOG_FORMAT_VAL" ] && [ "$LOG_FORMAT_VAL" != "json" ] && [ "$LOG_FORMAT_VAL" != "text" ]; then
  err "LOG_FORMAT должен быть 'json' или 'text' (сейчас: '${LOG_FORMAT_VAL}')"
fi

METRICS_TOKEN_VAL="$(get_env_val METRICS_TOKEN)"
if [ -n "$METRICS_TOKEN_VAL" ]; then
  if has_placeholder "$METRICS_TOKEN_VAL" || [ "${#METRICS_TOKEN_VAL}" -lt 16 ]; then
    err "METRICS_TOKEN содержит шаблонное значение или короче 16 символов"
  else
    ok "METRICS_TOKEN задан"
  fi
fi

BACKUP_ENCRYPTION_KEY_VAL="$(get_env_val BACKUP_ENCRYPTION_KEY)"
BACKUP_S3_BUCKET_VAL="$(get_env_val BACKUP_S3_BUCKET)"
BACKUP_S3_REQUIRE_ENC_VAL="$(printf '%s' "$(get_env_val BACKUP_S3_REQUIRE_ENCRYPTION)" | tr '[:upper:]' '[:lower:]')"
if [ -n "$BACKUP_ENCRYPTION_KEY_VAL" ]; then
  if has_placeholder "$BACKUP_ENCRYPTION_KEY_VAL" || [ "${#BACKUP_ENCRYPTION_KEY_VAL}" -lt 16 ]; then
    err "BACKUP_ENCRYPTION_KEY содержит шаблонное значение или короче 16 символов"
  else
    ok "BACKUP_ENCRYPTION_KEY задан"
  fi
elif [ -n "$BACKUP_S3_BUCKET_VAL" ] && [ "$BACKUP_S3_REQUIRE_ENC_VAL" != "0" ] && [ "$BACKUP_S3_REQUIRE_ENC_VAL" != "false" ]; then
  err "Задан BACKUP_S3_BUCKET, но отсутствует BACKUP_ENCRYPTION_KEY (или установите BACKUP_S3_REQUIRE_ENCRYPTION=0)"
fi

if [ "$SKIP_COMPOSE" -eq 0 ] && command -v docker >/dev/null 2>&1; then
  if docker compose -f "${ROOT_DIR}/docker-compose.yml" --env-file "$ENV_FILE" config --quiet 2>/dev/null; then
    ok "docker compose config валиден"
  else
    err "docker compose config завершился с ошибкой для $ENV_FILE"
  fi
fi

if [ "$errors" -gt 0 ]; then
  echo "=== PREFLIGHT FAILED: найдено ошибок: ${errors} ===" >&2
  exit 1
fi

echo "=== PREFLIGHT OK: конфигурация готова к прод-деплою ==="
