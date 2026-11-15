# ROADMAP_UNCONNECTED.md — Архитектурный роадмап (2 LIVE + 10 в бэклоге) и контракты событий «Вектор ЕГЭ»

> [!IMPORTANT]
> Этот документ фиксирует **12 архитектурных контуров** экосистемы «Вектор ЕГЭ»:
> - **2 контура подключены к живому сайту (`ПОДКЛЮЧЕНО (LIVE)`)**: **Item #5 (`Dual-Write / PostgreSQL Auth & Docs`)** через `databases/postgres/store.py` (`DualWriteDatabase`, `PostgresDatabase`, `create_store`, `outbox.kafka_outbox`) и **Item #12 (`Realtime & Calendar Sync`)** через `backend/realtime.py`, `backend/calendar_sync.py`, `frontend/core/realtime.js` и UI-Kit виджеты `EGE.kit.realtimeStatusPillHTML` / `EGE.kit.calendarSyncCardHTML`.
> - **Остальные 10 контуров намеренно оставлены в отложенном бэклоге (`ОТЛОЖЕНО (BACKLOG)`)**: они спроектированы на уровне схем `vektor-postgres`, пайплайнов `vektor-polars-engine`, DAG-ов `vektor-airflow` и дашбордов `vektor-grafana`, чтобы боевой SPA (`frontend/app.js`) сохранял 100% автономность и zero-config запуск.

---

## 1. Сводная матрица 12 контуров (2 LIVE + 10 Deferred Backlog)

| № | Контур | Статус и текущее состояние на сайте | Репозитории-владельцы (Owner Repos) | Целевые таблицы БД (`vektor_ege`) / Топики Kafka / Хранилища | Причина отложенного подключения / Архитектура LIVE-реализации |
|---|---|---|---|---|---|
| **1** | **Payments / Acquiring**<br>*(Серверный эквайринг)* | **`ОТЛОЖЕНО (BACKLOG)`**<br>В `EGE.payments` (`frontend/app.js`) используется `provider: "demo"`: баланс ученика пополняется локально в `localStorage` без реального банковского редиректа, серверного `POST /api/payments/topup` и проверки подписи вебхуков. | `Preparation` (`backend/`),<br>`vektor-postgres` | **PostgreSQL**: `oltp.payment_intents`, `oltp.wallet_accounts`, `oltp.wallet_ledger`<br>**Kafka**: `vektor.payments.ledger.v1` | Требует юрлица/мерчанта (СБП / ЮKassa / Т-Касса), публичных TLS-вебхуков, строгого контроля `Idempotency-Key` и финансового комплаенса (пороги `>= 5 000 ₽` первый депозит и `>= 100 ₽` повторные). |
| **2** | **Escrow Engine**<br>*(Серверный эскроу 95% / 5%)* | **`ОТЛОЖЕНО (BACKLOG)`**<br>Заморозка ставки при отклике, удержание комиссии `5%` и возврат при отмене считаются на клиенте; нет серверного автомата состояний и крон-триггера по завершению слота `10:00–20:00`. | `Preparation` (`backend/`),<br>`vektor-postgres`,<br>`vektor-airflow` | **PostgreSQL**: `oltp.escrow_holds`, `oltp.wallet_ledger`, `oltp.lesson_requests`, `gold.daily_gmv_metrics`<br>**Kafka**: `vektor.payments.ledger.v1` | Требует транзакционного движка двойной записи (`frozen` при отклике → `captured` `95%` преподавателю / `5%` платформе после урока → `refunded` `100%` при отмене `>= 4 ч` до слота) поверх серверного эквайринга. |
| **3** | **Payouts & НПД**<br>*(Выплаты и «Мой налог»)* | **`ОТЛОЖЕНО (BACKLOG)`**<br>Модалка вывода в кабинете репетитора (`EGE.payments.createPayoutIntent`, от `500 ₽`, СБП / Карта Мир, опциональный чек НПД) создаёт демо-запись в браузере без реального B2C-перевода и регистрации чека в ФНС. | `Preparation` (`backend/`),<br>`vektor-postgres` | **PostgreSQL**: `oltp.payout_requests`, `oltp.npd_receipts`, `oltp.wallet_ledger`<br>**Kafka**: `vektor.payments.ledger.v1` | Требует банковского B2C-шлюза выплат по СБП/картам Мир, антифрод-холда для новых репетиторов и интеграции с API ФНС «Мой налог» (автоформирование чеков НПД `4–6%`). |
| **4** | **Marketplace Server DB**<br>*(Серверный маркетплейс)* | **`ОТЛОЖЕНО (BACKLOG)`**<br>Анкета репетитора (`tc-my-profile`), входящие заявки, торги `±100 ₽` и кулдауны поднятия (`4 ч` ручное / `24 ч` авто) хранятся в `localStorage` (`vektor-ege:market`) как основной источник для демо-витрины. | `Preparation` (`backend/`, `frontend/`),<br>`vektor-postgres` | **PostgreSQL**: `oltp.tutors`, `oltp.tutor_slots`, `oltp.lesson_requests`, `oltp.tutor_boosts`<br>**Kafka**: `vektor.market.bids.v1` | Полный перевод публичной витрины `/market` на серверные таблицы требует обязательной авторизации обеих сторон сделки и отказа от мгновенного гостевого демо-режима без регистрации. |
| **5** | **Dual-Write / PostgreSQL Auth & Docs**<br>*(Миграция с SQLite на PG 17)* | **`ПОДКЛЮЧЕНО (LIVE)`**<br>Реализовано в `databases/postgres/store.py` (`PostgresDatabase`, `DualWriteDatabase`, фабрика `create_store(settings)`) и подключено в `backend/main.py` (`GET /api/health/storage`). | `Preparation` (`backend/`, `databases/postgres/store.py`),<br>`vektor-postgres` | **PostgreSQL**: `oltp.users`, `oltp.user_identities`, `oltp.sessions`, `oltp.oauth_states`, `oltp.docs` (`JSONB`), `outbox.kafka_outbox` | **Включено в живой код**: поддерживает режимы `DB_MODE = auto \| sqlite \| dual \| postgres`. В режиме `dual` синхронно пишет в SQLite WAL и PostgreSQL 17 (`DATABASE_URL`), публикует канонические события в `outbox.kafka_outbox` и прозрачно откатывается на SQLite при недоступности PG. |
| **6** | **Clickstream & User Logs**<br>*(Продуктовая телеметрия)* | **`ОТЛОЖЕНО (BACKLOG)`**<br>Действия пользователей (просмотры анкет, фильтр предмета/бюджета, ползунок времени `10:00–20:00`, шаги ставок `±100 ₽`, клики по `WhatsApp`/`Telegram`/`MAX`, попытки ЕГЭ, воронка оплаты, ошибки UI) не отправляются батчами из браузера. | `Preparation` (`frontend/`, `backend/`),<br>`vektor-postgres`,<br>`vektor-polars-engine`,<br>`vektor-grafana` | **API**: `POST /api/events/batch` (`navigator.sendBeacon`)<br>**PostgreSQL**: `telemetry.user_events`, `gold.clickstream_funnel`<br>**Kafka**: `vektor.user.clickstream.v1` | Включение постоянной отправки батчей из `app.js` отложено до запуска выделенного collector-ингресса и баннера согласия на аналитические куки (`/privacy`). |
| **7** | **Kafka / Redpanda Streaming Bus**<br>*(Шина событий реального времени)* | **`ОТЛОЖЕНО (BACKLOG)`**<br>Между веб-приложением, OLTP PostgreSQL 17 и аналитическим движком Polars нет внешнего брокера Kafka/Redpanda; доменные события уже пишутся в живую таблицу `outbox.kafka_outbox`. | `vektor-postgres`,<br>`vektor-polars-engine`,<br>`vektor-airflow`,<br>`vektor-grafana` | **PostgreSQL**: `outbox.kafka_outbox`<br>**Kafka (5 топиков)**:<br>`vektor.user.clickstream.v1`,<br>`vektor.market.bids.v1`,<br>`vektor.payments.ledger.v1`,<br>`vektor.study.attempts.v1`,<br>`vektor.tutors.raw.v1` | На текущем объёме нагрузки транзакционная таблица `outbox.kafka_outbox` в PostgreSQL 17 (заполняемая живым Dual-Write слоем) и микро-батчи Polars/Airflow обеспечивают ту же семантику доставки без отдельного JVM/Redpanda кластера. |
| **8** | **Messenger Bots**<br>*(Боты WA / TG / MAX)* | **`ОТЛОЖЕНО (BACKLOG)`**<br>Кнопки мессенджеров в UI Kit (`EGE.kit.messengerLinksHTML`) открывают клиентские deep-link ссылки (`wa.me`, `t.me`, `max.ru`); нет серверных пушей в мессенджеры о новой ставке `±100 ₽` и напоминаний за 1 час до урока. | `Preparation` (`backend/`),<br>`vektor-airflow`,<br>`vektor-postgres` | **PostgreSQL**: `oltp.notification_queue`, `oltp.messenger_bindings`, `outbox.kafka_outbox`<br>**Kafka**: `vektor.market.bids.v1` | Требует регистрации боевых ботов Telegram Bot API, WhatsApp Business API (WABA) и MAX Bot API, хранения секретных токенов и подтверждения привязки телефона пользователем. |
| **9** | **Live Scrapers & Ingestion**<br>*(Автопарсеры анкет и модерация)* | **`ОТЛОЖЕНО (BACKLOG)`**<br>Нормализатор `etl/sources/ykt_tg_max_schema.py` и Polars-пайплайн обрабатывают батчи объявлений, но не опрашивают живые ленты Доски Ykt.ru, TG и MAX в реальном времени и не связаны с серверной модерацией лидов с `/landing`. | `vektor-polars-engine`,<br>`vektor-airflow`,<br>`vektor-postgres` | **Kafka**: `vektor.tutors.raw.v1`<br>**Parquet**: `warehouse/bronze/*.parquet`, `warehouse/silver/*.parquet`, `warehouse/gold/*.parquet`<br>**PostgreSQL**: `bronze.tutors_raw`, `silver.tutors_dedup`, `gold.subject_price_mart` | Живой парсинг внешних площадок требует антибот-прокси, соблюдения лимитов и ручной премодерации телефонов перед публикацией в открытой витрине `/market`. |
| **10** | **S3 Media & Verification**<br>*(Объектное хранилище и дипломы)* | **`ОТЛОЖЕНО (BACKLOG)`**<br>Загруженное репетитором фото хранится как Base64 `DataURL` прямо в `localStorage` (либо выключается переключателем «Без фото»), а сканы дипломов/сертификатов ЕГЭ не загружаются на сервер. | `Preparation` (`backend/`, `frontend/`),<br>`vektor-postgres` | **S3 / MinIO / Cloudflare R2**: бакеты `avatars-public`, `diplomas-private`<br>**PostgreSQL**: `oltp.media_assets`, `oltp.tutor_verifications` | Хранение бинарных изображений в SQLite/`localStorage` раздувает JSON-документы (`MAX_DOC_BYTES = 2 MiB`); в продакшене требуется S3-совместимое хранилище с presigned URL и ресайзом в `WebP/AVIF`. |
| **11** | **AI Study Analytics & Quotas**<br>*(Серверная аналитика ФИПИ и квоты LLM)* | **`ОТЛОЖЕНО (BACKLOG)`**<br>ИИ-прокси `/api/ai` (`backend/ai.py`) проверяет сочинения и даёт подсказки, но держит лимит `50/ч` в памяти процесса (`_RateLimiter`) и не строит кросс-когортную матрицу ошибок ФИПИ и критериев `К1–К10` Задания 27. | `Preparation` (`backend/`),<br>`vektor-polars-engine`,<br>`vektor-postgres`,<br>`vektor-grafana` | **PostgreSQL**: `oltp.study_attempts`, `gold.fipi_error_matrix`<br>**Kafka**: `vektor.study.attempts.v1`<br>**Parquet**: `warehouse/gold/fipi_error_matrix.parquet` | Распределённый RateLimiter и персональные рекомендации тем для репетитора и ученика требуют накопления серверной истории попыток в PostgreSQL + расчёта агрегатов в Polars. |
| **12** | **Realtime & Calendar Sync**<br>*(WebSocket/SSE кабинета и `.ics` / GCal)* | **`ПОДКЛЮЧЕНО (LIVE)`**<br>Реализовано в `backend/realtime.py` (`/api/realtime/{stream,ws,publish,recent}`), `backend/calendar_sync.py` (`/api/calendar/{state,sync,{feed_token}.ics,import-ics}`), `frontend/core/realtime.js` (`window.EGE.realtime`) и UI-Kit компонентах `EGE.kit.realtimeStatusPillHTML` / `EGE.kit.calendarSyncCardHTML`. | `Preparation` (`backend/`, `frontend/`, `ux-ui/`),<br>`vektor-postgres` | **API**: `/api/realtime/stream` (SSE), `/api/realtime/ws` (WebSocket), `/api/realtime/publish`, `PUT /api/calendar/sync`, `/api/calendar/{feed_token}.ics`, `/api/calendar/import-ics`<br>**PostgreSQL**: `oltp.calendar_sync_tokens`, `oltp.calendar_events`, `oltp.realtime_notifications`, `outbox.kafka_outbox` | **Включено в живой код**: мгновенная доставка ставок `market.bid.created` и обновлений расписания через SSE + WebSocket + `BroadcastChannel`, RFC 5545 `.ics`-фид и двусторонний импорт занятости Google Calendar с автоматическим пересчётом часовых поясов `Asia/Yakutsk` (`UTC+9`) ↔ `Europe/Moscow` (`UTC+3`, `07:00 UTC → 16:00 Якт / 10:00 Мск`). |

---

## 2. Канонический JSON-конверт событий (Items #5, #6, #7, #12)

Все события транзакционного аутбокса (`outbox.kafka_outbox`), realtime-хаба (`backend/realtime.py`) и пользовательской телеметрии (`telemetry.user_events`) используют единый неизменяемый конверт **Canonical Event Envelope (`v1`)**:

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
| `event_type` | `string` | Имя события в нотации `<domain>.<entity>.<action>` (например: `auth.user.registered`, `docs.document.updated`, `market.bid.created`, `calendar.slots.synced`, `payments.escrow.captured`). |
| `occurred_at` | `string (ISO-8601 UTC)` | Время возникновения события в UTC (`YYYY-MM-DDTHH:mm:ss.sssZ`). Локальный пояс (`UTC+9` Якутск / `UTC+3` Москва) передаётся в `payload`. |
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
| **`vektor.user.clickstream.v1`** | `session_id` | `telemetry.user_events`, `outbox.kafka_outbox` (`auth.user.*`, `docs.document.*`) | `vektor-polars-engine` → `warehouse/bronze/clickstream.parquet`, `gold.clickstream_funnel`, `vektor-grafana` | События регистрации/логина, синхронизации документов прогресса, просмотры анкет, фильтры (предмет, бюджет, слот `10:00–20:00`), шаги цены `±100 ₽`, клики по `WhatsApp` / `Telegram` / `MAX`. |
| **`vektor.market.bids.v1`** | `tutor_id` | `oltp.lesson_requests`, `backend/realtime.py`, `backend/calendar_sync.py` → `outbox.kafka_outbox` | Realtime-хаб (`SSE`/`WS`), боты WA/TG/MAX, Polars-расчёт конверсии торгов `±100 ₽`, Grafana | Живые отклики учеников (`market.bid.created`), подтверждение/отклонение слота `10:00–20:00`, двусторонняя синхронизация `.ics` / Google Calendar (`UTC+9` ↔ `UTC+3`) и поднятия анкет (`4 ч` / `24 ч`). |
| **`vektor.payments.ledger.v1`** | `user_id` | `oltp.wallet_ledger`, `oltp.escrow_holds`, `oltp.payout_requests` → `outbox.kafka_outbox` | `etl/sales/sales_metrics.py`, `vektor-polars-engine` (`gold.daily_gmv_metrics`), антифрод и сверка НПД | Депозиты (`>= 5 000 ₽` / `>= 100 ₽`), переходы эскроу (`frozen` → `captured` `95%/5%` → `refunded` `100%`), выводы от `500 ₽` (СБП / Мир) и чеки НПД. |
| **`vektor.study.attempts.v1`** | `user_id` | `oltp.docs` (`prog-*`, `essays`, `mocks`), `/api/ai` → `outbox.kafka_outbox` | `vektor-polars-engine` (`gold.fipi_error_matrix`), рекомендации тем, Grafana | Попытки решения заданий ЕГЭ (биология, химия, русский язык), тайминг, ИИ-подсказки и оценки сочинений Задания 27 по критериям `К1–К10`. |
| **`vektor.tutors.raw.v1`** | `source_listing_id` | `bronze.tutors_raw` (Ykt.ru / TG / WA / MAX и лиды `/landing`) → `outbox.kafka_outbox` | `vektor-polars-engine` (`Bronze → Silver → Gold Parquet`) под управлением `vektor-airflow` | Сырые анкеты репетиторов из внешних источников для нормализации телефонов (`+7`), канонизации `@login`, дедупликации в `pl.LazyFrame` и записи в `silver.tutors_dedup` / `gold.subject_price_mart`. |
