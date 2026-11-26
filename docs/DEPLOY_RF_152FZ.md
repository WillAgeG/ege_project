# Прод-контур «Вектор ЕГЭ» в РФ (152-ФЗ: Selectel / Timeweb Cloud / Yandex Cloud)

Руководство по развёртыванию изолированного прод-стека:

- **Обратный прокси + TLS:** `Caddy 2.9` (по умолчанию, авто-HTTPS Let's Encrypt, HTTP/2 + HTTP/3, без буферизации для SSE и стриминга ИИ) либо альтернативный профиль `Nginx 1.27 + Certbot`.
- **Веб-приложение и API (`app`):** FastAPI (`uvicorn --workers ${WEB_CONCURRENCY:-2}` — мультиворкерная координация через PostgreSQL `pg_try_advisory_lock` в `BackgroundScheduler`, `LISTEN/NOTIFY` в `RealtimeBroker` и персистентные `RateLimiter`/`PhoneOtpStore`; автомиграции `alembic upgrade head` выполняются одноразовым контейнером `migrate` до запуска `app`, а `DB_RUN_CONSTRAINT_DDL=0` отключает блокирующие `DROP/ADD CONSTRAINT` на старте).
- **База данных (`postgres`):** `PostgreSQL 17` в полностью изолированной внутренней Docker-сети `backend_internal` (`internal: true`), без проброса порта `5432` на хост.
- **Операционная панель (`admin`):** `Streamlit`-админка на отдельном поддомене (`https://admin.<домен>`) за двойной защитой: **Basic Auth** на уровне прокси (`Caddy`/`Nginx`) + **`ADMIN_API_TOKEN`** в Headless Admin API (`/api/admin/*`) и заголовком `X-Robots-Tag: noindex, nofollow`.

---

## 1. Подбор площадки в РФ (ч. 5 ст. 18 152-ФЗ)

Первичная запись и хранение персональных данных граждан РФ (телефоны, профили, расписание, история заявок, отклики и сессии) должны физически размещаться на серверах в РФ:

| Провайдер | Рекомендуемый ЦОД / регион | Минимальная конфигурация (MVP) | Комфортная конфигурация (Рост) |
|---|---|---|---|
| **Timeweb Cloud** | Санкт-Петербург (`ru-1`) или Москва (`ru-2`) | 2 vCPU, 4 GB RAM, 40 GB NVMe | 4 vCPU, 8 GB RAM, 80 GB NVMe |
| **Selectel** | Москва / Санкт-Петербург (Облачные серверы VPC) | 2 vCPU, 4 GB RAM, 40 GB SSD | 4 vCPU, 8 GB RAM, 80 GB SSD |
| **Yandex Cloud** | `ru-central1-a/b/d` (Москва, 152-ФЗ УЗ-1/УЗ-2) | 2 vCPU (100%), 4 GB RAM, 40 GB SSD | 4 vCPU, 8 GB RAM, 80 GB SSD |

Рекомендуемая ОС: **Ubuntu 24.04 LTS**.

---

## 2. Подготовка сервера и брандмауэр

```bash
# На сервере (Ubuntu 24.04 LTS)
sudo apt-get update && sudo apt-get install -y ca-certificates curl openssl apache2-utils ufw
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"

# Открываем только SSH, HTTP (ACME) и HTTPS (включая UDP/443 для HTTP/3)
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw --force enable
```

> В **Yandex Cloud** (Security Groups) и **Timeweb/Selectel** (Cloud Firewall) также оставьте открытыми **только** входящие `22/tcp`, `80/tcp`, `443/tcp` и `443/udp`. Порты `5432` (PostgreSQL), `8000` (FastAPI) и `8501` (Streamlit) не публикуются наружу даже на самом хосте.

---

## 3. DNS A-записи

Создайте две A-записи (или CNAME для `admin`) на белый IPv4-адрес российского VPS (желательно через российский DNS-провайдер: DNS Timeweb / Selectel / Yandex Cloud DNS / Reg.ru):

- `@` (`vektor-ege.ru`) → `<IPv4_VPS>`
- `admin` (`admin.vektor-ege.ru`) → `<IPv4_VPS>`

---

## 4. Настройка секретов и preflight-проверка

```bash
git clone <url-вашего-репозитория> vektor-ege
cd vektor-ege

cp .env.prod.example .env.prod
chmod 600 .env.prod
```

Сгенерируйте криптостойкие секреты:

```bash
# Пароль PostgreSQL (hex — без спецсимволов URL @ / : ? # %)
openssl rand -hex 24

# Токен Headless Admin API
openssl rand -hex 32

# Секрет Telegram webhook (если используете бота)
openssl rand -hex 24

# Bcrypt-хэш для Caddy Basic Auth на admin.<домен>
docker run --rm caddy:2.9-alpine caddy hash-password --plaintext 'НАДЁЖНЫЙ_ПАРОЛЬ_АДМИНА'
```

Заполните `.env.prod` (обязательно оберните `ADMIN_BASIC_HASH` в **одинарные кавычки**, чтобы Docker Compose не интерпретировал символы `$` внутри bcrypt-хэша!):

```dotenv
APP_DOMAIN=vektor-ege.ru
ADMIN_DOMAIN=admin.vektor-ege.ru
ACME_EMAIL=ops@vektor-ege.ru
ADMIN_BASIC_USER=ops
ADMIN_BASIC_HASH='$2a$14$...'
POSTGRES_PASSWORD=...
ADMIN_API_TOKEN=...
DB_MODE=postgres
VEKTOR_ENV=production
DEV_DEMO_MODE=0
```

Перед первым запуском прогоните preflight-проверку:

```bash
bash deploy/scripts/preflight_rf.sh .env.prod
```

---

## 5. Запуск прод-стека (вариант по умолчанию: Caddy + авто-TLS)

```bash
docker compose --env-file .env.prod up -d --build
docker compose --env-file .env.prod ps
```

Проверка работоспособности на сервере:

```bash
curl -sS https://vektor-ege.ru/api/health
curl -sS https://vektor-ege.ru/api/health/storage
```

`storage` должен вернуть `"mode": "postgres"`, `"postgres": "ok"` (или `"mode": "dual"`, если выбран `DB_MODE=dual`).

### Подключение Telegram-бота (рекомендуется HTTPS Webhook)

Если задан `TELEGRAM_BOT_TOKEN` и `TELEGRAM_WEBHOOK_SECRET`, привяжите webhook на ваш домен:

```bash
docker compose --env-file .env.prod exec app \
  python -m backend.telegram_bot --set-webhook "https://vektor-ege.ru/api/telegram/webhook"
```

Если webhook по какой-то причине нежелателен, можно запустить polling-воркер из опционального профиля:

```bash
docker compose --env-file .env.prod --profile bot-polling up -d bot
```

---

## 6. Альтернативный вариант: Nginx 1.27 + Certbot (Let's Encrypt)

Если в вашей инфраструктуре стандарт — Nginx:

1. Сформируйте `.htpasswd` для админки:

```bash
htpasswd -cB deploy/nginx/.htpasswd ops
chmod 600 deploy/nginx/.htpasswd
```

2. Выпустите первый сертификат Certbot (на время первичного выпуска для `/.well-known/acme-challenge/` используйте `certonly --standalone` при остановленном 80 порту или временный HTTP-конфиг):

```bash
docker compose -f docker-compose.yml -f deploy/nginx/docker-compose.nginx.yml \
  --env-file .env.prod --profile certbot run --rm -p 80:80 certbot certonly \
  --standalone -m ops@vektor-ege.ru --agree-tos --no-eff-email \
  -d vektor-ege.ru -d admin.vektor-ege.ru
```

3. Поднимите основной стек с Nginx:

```bash
docker compose -f docker-compose.yml -f deploy/nginx/docker-compose.nginx.yml \
  --env-file .env.prod up -d --build
```

4. Продление сертификата (по cron раз в неделю):

```bash
docker compose -f docker-compose.yml -f deploy/nginx/docker-compose.nginx.yml \
  --env-file .env.prod --profile certbot run --rm certbot renew --webroot -w /var/www/certbot \
  && docker compose -f docker-compose.yml -f deploy/nginx/docker-compose.nginx.yml \
  --env-file .env.prod exec nginx nginx -s reload
```

---

## 7. Миграции БД (Alembic), бэкапы, алерты 5xx и Яндекс Метрика

### Версионированные миграции Alembic

Схема SQLite и PostgreSQL 17 описана в ревизиях `databases/alembic/versions/` (`20261123_0001_baseline_schema` … **`20261126_0014_p1_indexes_escrow_check`**). В `docker-compose.yml` перед запуском `app` автоматически отрабатывает сервис `migrate` (`alembic upgrade head`):

```bash
# Проверка текущей ревизии и ручное применение миграций в контейнере app
docker compose --env-file .env.prod exec app alembic current
docker compose --env-file .env.prod exec app alembic upgrade head
```

### Автоматическое и ручное резервное копирование (AES-256 + S3 РФ)

- В основном `docker-compose.yml` включён изолированный sidecar **`pg-backup`** (`postgres:17-alpine` в сети `backend_internal`): раз в `BACKUP_INTERVAL_HOURS` часов (`24 ч`) он создаёт `custom`-дамп в том `pg_backups`, при заданном `BACKUP_ENCRYPTION_KEY` шифрует его в `.dump.enc` (`AES-256-CBC PBKDF2`), генерирует `.sha256` и очищает архивы старше `BACKUP_RETENTION_DAYS` (`14` дней).
- В контейнере `app` встроенный `BackupManager` (вызывается `BackgroundScheduler` и кнопкой в Streamlit-админке) также шифрует бэкапы по `BACKUP_ENCRYPTION_KEY` и выгружает `.enc` + `.sha256` по AWS SigV4 в S3 РФ (`BACKUP_S3_BUCKET`, `BACKUP_S3_ENDPOINT_URL`, `BACKUP_S3_REQUIRE_ENCRYPTION=1`).
- Скрипт [deploy/scripts/backup_postgres.sh](../deploy/scripts/backup_postgres.sh) поддерживает шифрованный дамп и восстановление (если задан `BACKUP_ENCRYPTION_KEY`):

```bash
# Разовый дамп на хост (при BACKUP_ENCRYPTION_KEY создаётся *.dump.enc)
bash deploy/scripts/backup_postgres.sh backup

# Восстановление из обычного или .enc дампа (с проверкой SHA-256)
bash deploy/scripts/backup_postgres.sh restore backups/vektor_ege_20261126T120000Z.dump.enc
```

### Мониторинг 5xx, X-Request-ID, JSON-логи и Prometheus `/metrics`

- Middleware `RequestObservabilityMiddleware` присваивает каждому запросу сквозной `X-Request-ID` и пишет структурированные JSON-логи (`LOG_FORMAT=json`, `LOG_LEVEL=INFO`).
- Middleware `ErrorMonitoringMiddleware` перехватывает необработанные исключения и ответы `5xx`, маскирует email/телефоны (152-ФЗ), подавляет дубли в течение `ALERT_COOLDOWN_SEC` (`300` сек.) и отправляет алерт в `TELEGRAM_ADMIN_CHAT_ID` и/или `SENTRY_DSN` с указанием `requestId`.
- Эндпоинт `GET /metrics` отдаёт Prometheus-метрики (`vektor_http_requests_total`, `vektor_http_request_duration_seconds_*`, `vektor_scheduler_lock_skipped_total`, `vektor_realtime_subscribers`, `vektor_backups_s3_uploads_total`) и защищён `METRICS_TOKEN` (`Authorization: Bearer <METRICS_TOKEN>` или `X-Metrics-Token`) либо админ-токеном.

### Веб-аналитика (Яндекс Метрика по согласию cookies)

- Укажите числовой ID счётчика `YANDEX_METRIKA_ID` (и при необходимости `YANDEX_METRIKA_WEBVISOR=0|1`) в `.env.prod`: FastAPI автоматически расширит CSP на `mc.yandex.ru` / `mc.yandex.com` и передаст ID в `EGE_HOST`.
- Код Метрики (`tag.js`) не загружается до тех пор, пока пользователь не нажмёт «Принять все» или не включит тумблер «Аналитика» в настройках cookie-баннера; при отзыве согласия счётчик останавливается и `_ym_*` cookies удаляются.

### Объектное хранилище медиа и сканов дипломов (S3 / локальный том)

- **Аватары и приватные сканы дипломов:** по умолчанию (`MEDIA_STORAGE=local`) файлы сохраняются в локальном каталоге `MEDIA_LOCAL_DIR` (в Docker — том `/data/media`, раздельный префикс для бакетов `avatars-public` и `diplomas-private`). Аватары в `POST /api/media/avatar` автоматически поворачиваются по EXIF, уменьшаются до `MEDIA_AVATAR_MAX_DIM` (`512` px), очищаются от EXIF/GPS-метаданных и сжимаются в **WebP** (`MEDIA_AVATAR_WEBP=1`, `MEDIA_AVATAR_WEBP_QUALITY=82`). Аватары отдаются через `GET /api/media/public/{asset_id}`, а документы верификации — строго владельцу или администратору (`GET /api/media/private/{asset_id}`, `GET /api/admin/verifications/{id}/file`).
- **Российский S3 (Selectel S3 / Timeweb S3 / Yandex Object Storage) и CDN/presigned redirect:** задайте в `.env.prod` переменные `MEDIA_STORAGE=s3`, `S3_ENDPOINT_URL`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_AVATARS` и `S3_BUCKET_DIPLOMAS` (опционально `S3_PUBLIC_BASE_URL` для CDN). При включении `MEDIA_PUBLIC_REDIRECT=1` публичные аватары отдают HTTP `307` на CDN/presigned URL, а при `MEDIA_PRIVATE_PRESIGN_REDIRECT=1` приватные сканы после проверки прав отдают `307` на временный SigV4 presigned URL (`MEDIA_PRESIGN_TTL_SEC=900`). Загрузка выполняется на сервере по протоколу AWS SigV4; храните бакеты только в ДЦ на территории РФ (ч. 5 ст. 18 152-ФЗ).

### Персистентный RateLimiter, PhoneOtpStore и бездемо-витрина (`DEV_DEMO_MODE=0`)

- **RateLimiter и OTP в БД (`20261123_0008`):** `RateLimiter` (auth, ИИ `/api/ai` `50/ч`, `/api/tutor-applications`, Telegram) и `PhoneOtpStore` хранят состояние в таблицах `rate_limit_hits` / `oltp.rate_limit_hits` и `phone_otp_codes` / `oltp.phone_otp_codes` (с периодической очисткой в `BackgroundScheduler`), поэтому ограничения и активные SMS/TG-коды не сбрасываются при рестарте контейнера или масштабировании воркеров.
- **Чистая витрина `/market` в прод-режиме (`DEV_DEMO_MODE=0`):** на сервере отключается сидинг демо-анкет (`seed_demo=False`), а во фронтенде каталог `/market` и `/landing` очищается от встроенных демо-репетиторов и работает строго на данных из `GET /api/tutors`.

### Реальная доставка 4-значных OTP (Telegram Gateway, WhatsApp Business API, SMS РФ)

- **Telegram (`channel="tg"`):** сначала проверяется привязанный чат Telegram-бота; для новых пользователей без привязки используется **Telegram Gateway API** (`TELEGRAM_GATEWAY_TOKEN`, `/sendVerificationMessage`), отправляющий код в официальный системный чат `Verification Codes` по номеру телефона.
- **WhatsApp (`channel="wa"`):** поддерживается **WhatsApp Business Cloud API** (`WHATSAPP_PROVIDER=cloud`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, Authentication-шаблон `WHATSAPP_TEMPLATE_NAME`) и партнерский BSP HTTP webhook (`WHATSAPP_PROVIDER=webhook`, `WHATSAPP_WEBHOOK_URL`).
- **SMS-шлюзы РФ и авто-фоллбэк (`channel="sms"` / `OTP_SMS_FALLBACK=1`):** поддержаны **SMS.ru** (`SMS_RU_API_ID`), **SMSC.ru** (`SMSC_LOGIN`, `SMSC_PASSWORD`) и универсальный HTTP webhook (`SMS_WEBHOOK_URL`). Если основной мессенджер недоступен, код автоматически отправляется по SMS (`fallbackUsed: true`). При включении `OTP_REQUIRE_DELIVERY=1` в `DEV_DEMO_MODE=0` недоставленный код вернёт HTTP `503`.

### Эквайринг ЮKassa API v3 (СБП 0%, карты РФ +3%, чеки 54-ФЗ)

- Заполните в `.env.prod` переменные `PAYMENTS_PROVIDER=yookassa` (или `auto`), `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`, `YOOKASSA_VAT_CODE` (по умолчанию `1` — без НДС) и `YOOKASSA_TAX_SYSTEM_CODE` (например `2` для УСН доходы).
- В личном кабинете ЮKassa укажите URL входящих уведомлений: `https://<APP_DOMAIN>/api/payments/yookassa/webhook` (события `payment.succeeded`, `payment.canceled`).
- Caddy и Nginx уже ограничивают этот URL официальными IPv4/IPv6-сетями ЮKassa (`185.71.76.0/27`, `185.71.77.0/27`, `77.75.153.0/25`, `77.75.154.128/25`, `77.75.156.11`, `77.75.156.35`, `2a02:5180::/32`), а FastAPI дополнительно перепроверяет каждый платёж запросом `GET /v3/payments/{id}` перед зачислением баланса.

### Автовыплаты репетиторам (ЮKassa Payouts API v3) и чеки НПД (ФНС «Мой налог»)

- Заполните в `.env.prod` переменные шлюза выплат `PAYOUTS_PROVIDER=yookassa` (или `auto`), `YOOKASSA_PAYOUT_AGENT_ID`, `YOOKASSA_PAYOUT_SECRET_KEY`, а также пороги антифрода `PAYOUTS_AUTO_DISPATCH=1`, `PAYOUTS_AUTO_MAX_RUB=15000`, `PAYOUTS_ANTIFRAUD_MIN_LESSONS=1`.
- В ЛК ЮKassa Выплат подключите webhook `https://<APP_DOMAIN>/api/payouts/yookassa/webhook` (события `payout.succeeded`, `payout.canceled`); Caddy и Nginx фильтруют этот маршрут тем же allowlist IP ЮKassa, а сервер сверяет выплату по `GET /v3/payouts/{id}` (полные номера карт PAN не сохраняются в БД).
- Для автоматической регистрации чеков самозанятых (`4–6%`) настройте `NPD_PROVIDER=partner` (`NPD_PARTNER_API_URL`, `NPD_PARTNER_API_KEY`) или `NPD_PROVIDER=lknpd` (`NPD_LKNPD_TOKEN`), укажите реквизиты платформы `NPD_PLATFORM_INN` / `NPD_PLATFORM_NAME` и при необходимости включите онлайн-проверку статуса самозанятого по ИНН (`NPD_CHECK_STATUS_ONLINE=1`).

---

## 8. Чеклист соответствия 152-ФЗ и продакшен-гигиены

- **Локализация ПДн (ч. 5 ст. 18 152-ФЗ):** VPS и резервные S3-бэкапы находятся только в дата-центрах на территории РФ; для сторонних зарубежных LLM/OAuth не передаются ФИО и телефоны в открытом виде (либо используются отечественные/локальные провайдеры через `AI_BASE_URL`).
- **Сетевая изоляция БД:** PostgreSQL 17 доступен только по приватной сети `backend_internal` (`internal: true`); Streamlit изолирован за Basic Auth + `ADMIN_API_TOKEN`.
- **Транспортная защита:** обязательный TLS 1.2/1.3, `Strict-Transport-Security`, `HttpOnly` + `SameSite=Lax` + `Secure` (через `X-Forwarded-Proto: https`) для cookie `pvm_session`.
- **Организационно-правовые документы:** на сайте уже опубликованы `/offer`, `/refunds` и `/privacy` (152-ФЗ) с явным согласием при регистрации и баннером cookies; перед приёмом реальных ПДн направьте уведомление оператора в Роскомнадзор и внесите актуальные реквизиты оператора (ИНН/ОГРН/email) в [`backend/legal.py`](../backend/legal.py).
