# ROADMAP_UNCONNECTED.md — Неподключённый бэклог (12 контуров) и контракты событий «Вектор ЕГЭ»

> [!IMPORTANT]
> Этот документ фиксирует **12 архитектурных контуров**, которые спроектированы на уровне схем данных (`vektor-postgres`), контрактов API/событий и аналитических пайплайнов (`vektor-polars-engine`, `vektor-airflow`, `vektor-grafana`), но **намеренно не подключены к боевому SPA (`frontend/app.js`) и текущему легковесному серверу (`backend/main.py`) в репозитории `Preparation`**. Живой сайт сохраняет 100% автономность (zero-bundler Vanilla JS + локальный SQLite + демо-платежи `provider: "demo"`), а внешние сервисы вынесены в отдельные репозитории.

---

## 1. Сводная матрица 12 неподключённых контуров

| № | Контур | Текущий пробел на живом сайте (Current Gap) | Репозитории-владельцы (Owner Repos) | Целевые таблицы БД (`vektor_ege`) / Топики Kafka / Хранилища | Причина отложенного подключения (Why Deferred) |
|---|---|---|---|---|---|
| **1** | **Payments / Acquiring**<br>*(Серверный эквайринг)* | В `EGE.payments` (`frontend/app.js`) используется `provider: "demo"`: баланс ученика пополняется локально в `localStorage` без реального банковского редиректа, серверного `POST /api/payments/topup` и проверки подписи вебхуков. | `Preparation` (`backend/`),<br>`vektor-postgres` | **PostgreSQL**: `oltp.payment_intents`, `oltp.wallet_accounts`, `oltp.wallet_ledger`<br>**Kafka**: `vektor.payments.ledger.v1` | Требует юрлица/мерчанта (СБП / ЮKassa / Т-Касса), публичных TLS-вебхуков, строгого контроля `Idempotency-Key` и финансового комплаенса (пороги `>= 5 000 ₽` первый депозит и `>= 100 ₽` повторные). |
| **2** | **Escrow Engine**<br>*(Серверный эскроу 95% / 5%)* | Заморозка ставки при отклике, удержание комиссии `5%` и возврат при отмене считаются на клиенте; нет серверного автомата состояний и крон-триггера по завершению слота `10:00–20:00`. | `Preparation` (`backend/`),<br>`vektor-postgres`,<br>`vektor-airflow` | **PostgreSQL**: `oltp.escrow_holds`, `oltp.wallet_ledger`, `oltp.lessons`, `gold.sales_daily`<br>**Kafka**: `vektor.payments.ledger.v1` | Требует транзакционного движка двойной записи (`frozen` при отклике → `captured` `95%` преподавателю / `5%` платформе после урока → `refunded` `100%` при отмене `>= 4 ч` до слота) поверх серверного расписания. |
| **3** | **Payouts & НПД**<br>*(Выплаты и «Мой налог»)* | Модалка вывода в кабинете репетитора (`EGE.payments.createPayoutIntent`, от `500 ₽`, СБП / Карта Мир, опциональный чек НПД) создаёт демо-запись в браузере без реального B2C-перевода и регистрации чека в ФНС. | `Preparation` (`backend/`),<br>`vektor-postgres` | **PostgreSQL**: `oltp.payout_requests`, `oltp.npd_receipts`, `oltp.wallet_ledger`<br>**Kafka**: `vektor.payments.ledger.v1` | Требует банковского B2C-шлюза выплат по СБП/картам Мир, антифрод-холда для новых репетиторов и интеграции с API ФНС «Мой налог» (автоформирование чеков НПД `4–6%`). |
| **4** | **Marketplace Server DB**<br>*(Серверный маркетплейс)* | Анкета репетитора (`tc-my-profile`), входящие заявки, торги `±100 ₽`, сетка слотов `10:00–20:00` и кулдауны поднятия (`4 ч` ручное / `24 ч` авто) хранятся в `localStorage` (`vektor-ege:market`) и не синхронизируются между устройствами ученика и преподавателя. | `Preparation` (`backend/`, `frontend/`),<br>`vektor-postgres` | **PostgreSQL**: `oltp.tutors`, `oltp.tutor_slots`, `oltp.market_requests`, `oltp.market_bids`, `oltp.tutor_boosts`<br>**Kafka**: `vektor.market.bids.v1` | Перевод витрины на серверное состояние требует аутентификации обеих сторон сделки, блокировок слотов (`SELECT ... FOR UPDATE`) и сохранения офлайн-демо режима для неавторизованных гостей. |
| **5** | **Dual-Write / PostgreSQL Auth & Docs**<br>*(Миграция с SQLite на PG 17)* | `backend/main.py` и `databases/sqlite/store.py` пишут `users`, `user_identities`, `sessions`, `oauth_states` и `docs` только в локальный файл SQLite (`WAL`), не используя `DATABASE_URL` и пул соединений `psycopg_pool`. | `Preparation` (`backend/`, `databases/`),<br>`vektor-postgres` | **PostgreSQL**: `oltp.users`, `oltp.user_identities`, `oltp.sessions`, `oltp.oauth_states`, `oltp.user_docs` (`JSONB`), `outbox.kafka_outbox` | Для сохранения автономного zero-config запуска `Preparation` (Docker / локальный `uvicorn` без внешнего PG) переход спроектирован через паттерн Dual-Write + Transactional Outbox (`outbox.kafka_outbox`). |
| **6** | **Clickstream & User Logs**<br>*(Продуктовая телеметрия)* | Действия пользователей (просмотры анкет, фильтр предмета/бюджета, ползунок времени `10:00–20:00`, шаги ставок `±100 ₽`, клики по `WhatsApp`/`Telegram`/`MAX`, попытки ЕГЭ, воронка оплаты, ошибки UI) не отправляются на сервер. | `Preparation` (`frontend/`, `backend/`),<br>`vektor-postgres`,<br>`vektor-polars-engine`,<br>`vektor-grafana` | **API**: `POST /api/events/batch` (`navigator.sendBeacon`)<br>**PostgreSQL**: `telemetry.user_events`, `outbox.kafka_outbox`<br>**Kafka**: `vektor.user.clickstream.v1` | Включение постоянной отправки батчей из `app.js` без выделенного приёмника перегружает однопроцессный SQLite; контур активируется вместе с таблицей `telemetry.user_events` в PostgreSQL 17. |
| **7** | **Kafka / Redpanda Streaming Bus**<br>*(Шина событий реального времени)* | Между веб-приложением, OLTP PostgreSQL 17 и аналитическим движком Polars нет запущенного брокера Kafka/Redpanda; события буферизуются в таблице `outbox.kafka_outbox`. | `vektor-postgres`,<br>`vektor-polars-engine`,<br>`vektor-airflow`,<br>`vektor-grafana` | **PostgreSQL**: `outbox.kafka_outbox`<br>**Kafka (5 топиков)**:<br>`vektor.user.clickstream.v1`,<br>`vektor.market.bids.v1`,<br>`vektor.payments.ledger.v1`,<br>`vektor.study.attempts.v1`,<br>`vektor.tutors.raw.v1` | На текущем объёме данных транзакционная таблица `outbox.kafka_outbox` в PostgreSQL 17 и микро-батчи Polars/Airflow обеспечивают ту же семантику доставки без накладных расходов JVM/брокера. |
| **8** | **Messenger Bots**<br>*(Боты WA / TG / MAX)* | Кнопки мессенджеров в UI Kit (`EGE.kit.messengerLinksHTML`) открывают клиентские deep-link ссылки (`wa.me`, `t.me`, `max.ru`); нет серверных пушей репетитору о новой ставке `±100 ₽` и напоминаний за 1 час до урока. | `Preparation` (`backend/`),<br>`vektor-airflow`,<br>`vektor-postgres` | **PostgreSQL**: `oltp.notification_queue`, `oltp.messenger_bindings`, `outbox.kafka_outbox`<br>**Kafka**: `vektor.market.bids.v1` | Требует регистрации боевых ботов Telegram Bot API, WhatsApp Business API (WABA) и MAX Bot API, хранения секретных токенов и подтверждения привязки телефона/аккаунта пользователем. |
| **9** | **Live Scrapers & Ingestion**<br>*(Автопарсеры анкет и модерация)* | Нормализатор `etl/sources/ykt_tg_max_schema.py` и Polars-пайплайн обрабатывают батчи объявлений, но не опрашивают живые ленты Доски Ykt.ru, TG и MAX в реальном времени и не связаны с серверной модерацией лидов с `/landing`. | `vektor-polars-engine`,<br>`vektor-airflow`,<br>`vektor-postgres` | **Kafka**: `vektor.tutors.raw.v1`<br>**Parquet**: `warehouse/bronze/*.parquet`, `warehouse/silver/*.parquet`, `warehouse/gold/*.parquet`<br>**PostgreSQL**: `silver.tutors_dedup`, `gold.tutor_market` | Живой парсинг требует антибот-прокси, соблюдения лимитов площадок и ручной премодерации контактов перед публикацией в открытой витрине `/market`. |
| **10** | **S3 Media & Verification**<br>*(Объектное хранилище и дипломы)* | Загруженное репетитором фото хранится как Base64 `DataURL` прямо в `localStorage` (либо выключается переключателем «Без фото»), а сканы дипломов/сертификатов ЕГЭ не загружаются на сервер. | `Preparation` (`backend/`, `frontend/`),<br>`vektor-postgres` | **S3 / MinIO / Cloudflare R2**: бакеты `avatars-public`, `diplomas-private`<br>**PostgreSQL**: `oltp.media_assets`, `oltp.tutor_verifications` | Хранение бинарных изображений в SQLite/`localStorage` раздувает JSON-документы (`MAX_DOC_BYTES = 2 MiB`); в продакшене требуется S3-совместимое хранилище с presigned URL и ресайзом в `WebP/AVIF`. |
| **11** | **AI Study Analytics & Quotas**<br>*(Серверная аналитика ФИПИ и квоты LLM)* | ИИ-прокси `/api/ai` (`backend/ai.py`) проверяет сочинения и даёт подсказки, но держит лимит `50/ч` в памяти процесса (`_RateLimiter`) и не строит кросс-когортную матрицу ошибок ФИПИ и критериев `К1–К10` Задания 27. | `Preparation` (`backend/`),<br>`vektor-polars-engine`,<br>`vektor-postgres`,<br>`vektor-grafana` | **PostgreSQL**: `oltp.study_attempts`, `gold.fipi_error_matrix`<br>**Kafka**: `vektor.study.attempts.v1`<br>**Parquet**: `warehouse/gold/fipi_error_matrix.parquet` | Распределённый RateLimiter и персональные рекомендации тем для репетитора и ученика требуют накопления серверной истории попыток в PostgreSQL + расчёта агрегатов в Polars. |
| **12** | **Realtime & Calendar Sync**<br>*(WebSocket/SSE кабинета и `.ics` / GCal)* | Бейдж новых заявок в кабинете преподавателя и статусы откликов обновляются внутри текущей сессии браузера; нет push-стрима между устройствами и двусторонней синхронизации `.ics` / Google Calendar. | `Preparation` (`backend/`, `frontend/`),<br>`vektor-postgres` | **API**: `GET /api/realtime/stream` (SSE), `GET /api/calendar/{tutor_id}.ics`<br>**PostgreSQL**: `oltp.tutor_slots`, `oltp.calendar_sync_tokens` | Требует серверного хранения расписания (`oltp.tutor_slots`), долгоживущих SSE/WebSocket-подключений и конвертации часовых поясов `Asia/Yakutsk` (`UTC+9`) ↔ `Europe/Moscow` (`UTC+3`). |

---

## 2. Канонический JSON-конверт событий (Items #6 и #7)

Все события пользовательской телеметрии (`POST /api/events/batch`, `navigator.sendBeacon` → `telemetry.user_events`) и доменные события транзакционного аутбокса (`outbox.kafka_outbox` → Kafka) используют единый неизменяемый конверт **Canonical Event Envelope (`v1`)**:

```json
{
  "event_id": "019639a4-7c8b-7000-8a12-4f91b2c0d3e4",
  "event_type": "market.bid.submitted",
  "occurred_at": "2026-11-15T14:50:12.345Z",
  "user_id": "usr_9f8e7d6c5b4a",
  "session_id": "ses_3a2b1c0d9e8f",
  "role": "student",
  "view": "market",
  "payload": {
    "tutor_id": "tut_yakutsk_bio_01",
    "subject": "bio",
    "base_price_rub": 1200,
    "offered_price_rub": 1100,
    "delta_rub": -100,
    "slot_hour_local": "16:00",
    "city": "Якутск",
    "tz_offset": "+09:00"
  },
  "schema_version": "1.0.0"
}
```

### Обязательные поля конверта

| Поле | Тип | Описание и инварианты |
|---|---|---|
| `event_id` | `string (UUIDv7 / UUIDv4)` | Глобально уникальный идентификатор события; первичный ключ идемпотентности при дедупликации в `telemetry.user_events`, `outbox.kafka_outbox` и Polars `LazyFrame`. |
| `event_type` | `string` | Имя события в нотации `<domain>.<entity>.<action>` (например: `ui.tutor_card.viewed`, `ui.messenger.clicked`, `market.bid.submitted`, `payments.escrow.captured`, `study.essay.graded`). |
| `occurred_at` | `string (ISO-8601 UTC)` | Время возникновения события в UTC (`YYYY-MM-DDTHH:mm:ss.sssZ`). Локальный пояс (`UTC+9` Якутск / `UTC+3` Москва) передаётся в `payload.tz_offset`. |
| `user_id` | `string \| null` | Идентификатор пользователя из `oltp.users` (`null` для неавторизованного гостя). |
| `session_id` | `string` | Идентификатор клиентской или серверной сессии для склейки воронки от первого визита на `/landing` до оплаты. |
| `role` | `"student" \| "tutor" \| "guest" \| "system"` | Активный продуктовый режим инициатора события. |
| `view` | `string` | Текущий экран SPA из `VIEWS` (`landing`, `market`, `cabinet`, `fees`, `study`, `quiz`, `essay`, `stats`, `brandbook` и др.) или `"backend"` для серверных задач. |
| `payload` | `object (JSONB)` | Типизированное тело события, соответствующее контракту одного из 5 топиков Kafka. |
| `schema_version` | `string (SemVer)` | Версия схемы конверта (текущая — `"1.0.0"`). |

---

## 3. Контракты 5 топиков Kafka / Redpanda (Item #7)

| Топик | Ключ партиционирования (`key`) | Таблица-источник в `vektor_ege` | Потребители (Consumers) | Схема `payload` и назначение |
|---|---|---|---|---|
| **`vektor.user.clickstream.v1`** | `session_id` | `telemetry.user_events` (`POST /api/events/batch`) | `vektor-polars-engine` → `warehouse/bronze/clickstream.parquet`, дашборды `vektor-grafana` | Просмотры экранов и анкет, фильтры (предмет, бюджет, слот `10:00–20:00`), шаги цены `±100 ₽`, клики по `WhatsApp` / `Telegram` / `MAX`, воронка оплаты и ошибки UI. |
| **`vektor.market.bids.v1`** | `tutor_id` | `oltp.market_bids`, `oltp.market_requests`, `oltp.tutor_boosts` → `outbox.kafka_outbox` | Боты уведомлений WA/TG/MAX, Polars-расчёт конверсии торгов `±100 ₽`, Grafana | Отклики со ставкой `base ± 100 ₽`, подтверждение/отмена часового окна `10:00–20:00`, ручное (`4 ч`) и автоматическое (`24 ч`) поднятие анкеты репетитора. |
| **`vektor.payments.ledger.v1`** | `user_id` | `oltp.wallet_ledger`, `oltp.escrow_holds`, `oltp.payout_requests` → `outbox.kafka_outbox` | `etl/sales/sales_metrics.py`, `vektor-polars-engine` (`gold.sales_daily`), антифрод и сверка НПД | Депозиты (`>= 5 000 ₽` / `>= 100 ₽`), переходы эскроу (`frozen` → `captured` `95%/5%` → `refunded` `100%`), выводы от `500 ₽` (СБП / Мир) и чеки НПД. |
| **`vektor.study.attempts.v1`** | `user_id` | `oltp.study_attempts`, `/api/docs/state`, `/api/ai` → `outbox.kafka_outbox` | `vektor-polars-engine` (`gold.fipi_error_matrix`), рекомендации тем, Grafana | Попытки решения заданий ЕГЭ (биология, химия, русский язык), тайминг, ИИ-подсказки и оценки сочинений Задания 27 по критериям `К1–К10`. |
| **`vektor.tutors.raw.v1`** | `source_listing_id` | Скраперы Ykt.ru / TG / WA / MAX и лиды `/landing` → `outbox.kafka_outbox` | `vektor-polars-engine` (`Bronze → Silver → Gold Parquet`) под управлением `vektor-airflow` | Сырые анкеты репетиторов из внешних источников для нормализации телефонов (`+7`), канонизации `@login`, дедупликации в `pl.LazyFrame` и записи в `silver.tutors_dedup` / `gold.tutor_market`. |
