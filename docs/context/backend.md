# Контекст: Backend FastAPI (`backend/` и `vektor-api`)

> [!NOTE]
> `backend/api/` не зависит от HTML/CSS/UI-Kit и используется как в `Preparation` (`:8770`), так и в standalone репозитории `vektor-api` (`:8771`, OpenAPI `/docs`, CORS для `:8770` и `:8772`). Всегда `--workers 1` (в памяти `RateLimiter` и `RealtimeBroker`).

## 1. Модули `backend/`
- `backend/api/__init__.py` — `create_api_router(settings)` (подключает `auth_docs`, `realtime_calendar`, `admin`) и `create_api_app(custom_settings, enable_cors=True)` (чистый headless API без HTML/статики).
- `backend/api/auth_docs.py` — Health (`/api/health`, `/api/health/storage`), `RateLimiter`, `/api/me`, локальная авторизация `scrypt` (`/api/auth/{register,login,logout}`), Google OAuth 2.0 PKCE `S256` (`/api/auth/google/{start,callback}`), CRUD документов `/api/docs*`, LLM-прокси `/api/ai`.
- `backend/api/realtime_calendar.py` — Realtime SSE/WS/publish/recent + двухсторонний `.ics` / Google Calendar синк.
- `backend/api/admin.py` — Admin REST `/api/admin/*`.
- `backend/shell.py` — `register_shell_routes(app)`: SSR-оболочка SPA (`/`, `/index.html`, `/landing`, `/brandbook`, `/fees`, `/admin`, `/privacy`) + безопасный `static_assets` allowlist для `ux-ui/*` и `frontend/*` (все секреты, `backend/`, `databases/`, `tools/`, `docs/` отдают `404`).
- `backend/main.py` — композитор `create_app(custom_settings)` = Lifespan (`create_store`, `httpx.AsyncClient`, `RateLimiter`, `RealtimeBroker`) + `create_api_router` + `register_shell_routes`.
- `backend/config.py` — `Settings`, `AIConfig`, `GoogleOAuthConfig`, `resolve_db_path()`, `database_url`, `db_mode`.
- `backend/ai.py` — SSE (`stream_ai_text`) и JSON (`complete_ai_json`) для Gemini / OpenAI / Anthropic / OpenRouter.
- `backend/realtime.py` — `RealtimeBroker` (thread/async fanout через `asyncio.Queue` для SSE + WebSocket, `Last-Event-ID` replay, 15s heartbeat).
- `backend/calendar_sync.py` — `resolve_timezone_info` (`UTC+9` `Asia/Yakutsk` ↔ `UTC+3` `Europe/Moscow`), RFC 5545 `generate_ics` (`VTIMEZONE` + `CRLF`), `parse_ics_busy_slots` (вкл. `Z` -> локальное `10:00–20:00`, JS `dow` `0..6`), `detect_busy_conflicts`, `build_google_calendar_urls`, `validate_public_ics_url` (SSRF-защита).

## 2. Таблица эндпоинтов (обзор; точные строки — `python3 tools/ctx.py routes`)
| Метод и путь | Авторизация | Назначение |
|---|---|---|
| `GET /api/health` | Нет | **Строго** `{"ok": True, "db": "ok", "ai": ...}` (`tests/test_server.py:48`). |
| `GET /api/health/storage` | Нет | Статус `sqlite` / `dual` / `postgres` и `outboxPending`. |
| `GET /api/me`, `POST /api/auth/{register,login,logout}` | Rate limit `20/15m` | Профиль сессии и `scrypt`-аутентификация (`pvm_session`). |
| `GET /api/auth/google/{start,callback}` | PKCE `state` | OAuth 2.0 + PKCE `S256` и `upsert_oauth_user`. |
| `GET/PATCH/PUT /api/docs` | `require_user` | Выгрузка и `deep_merge` (с удалением `null`) прогресса (`<= 2 MiB`). |
| `POST /api/ai` | `require_user` + `50/ч` | SSE (`text/event-stream`) или `json` к ИИ. |
| `GET /api/realtime/{stream,recent}`, `POST /api/realtime/publish`, `WS /api/realtime/ws` | Опц. кука | Live-уведомления кабинета + запись в `outbox.kafka_outbox`. |
| `GET /api/calendar/state`, `PUT /api/calendar/sync`, `GET /api/calendar/{feed_token}.ics`, `POST /api/calendar/import-ics` | Опц. / токен фида | Двусторонний синк `.ics` / Google Calendar (`UTC+9` ↔ `UTC+3`). |
| `GET /api/admin/{architecture,overview,users,tutors,requests,payouts,outbox}` + `POST` модерации | Нет (демо/внутр.) | Модерация ролей, анкет, заявок `±100 ₽`, выплат СБП/Мир и лента `outbox`. |

## 3. ENV-переменные ([.env.example](../../.env.example))
- `DB_PATH`, `DATABASE_URL` (`postgresql://postgres@127.0.0.1:5432/vektor_ege`), `DB_MODE` (`auto | sqlite | dual | postgres`)
- `SESSION_DAYS` (`30`), `INVITE_CODE`, `MAX_USERS`, `MAX_DOC_BYTES` (`2097152`)
- `AI_PROVIDER`, `GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY`, `AI_MODEL`, `AI_MODEL_COMPLEX`, `AI_BASE_URL`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_BASE_URL`
