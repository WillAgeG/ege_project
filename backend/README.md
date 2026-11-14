# Backend — Python API и ИИ-прокси «Вектор ЕГЭ»

Отдельный серверный слой на **FastAPI** без смешивания со слоем хранения данных и ETL.

## Технологический стек

- **Web / ASGI:** Python 3.13, `FastAPI >= 0.115`, `Uvicorn` (`--workers 1` под SQLite WAL + proxy headers для Railway).
- **HTTP-клиент:** `httpx` (асинхронный SSE-стриминг и JSON-запросы к внешним LLM).
- **Аутентификация:** scrypt-хеширование паролей (`databases/sqlite/store.py`), HTTP-only cookie-сессии + Google OAuth 2.0 (PKCE).
- **ИИ-провайдеры:** Gemini, OpenAI, Anthropic, OpenRouter.

## Файлы `backend/`

| Файл | Роль |
| :--- | :--- |
| [`main.py`](main.py) | Точка входа `create_app()` / `app`: SPA-маршруты (`/`, `/landing`, `/brandbook`, `/fees`, `/privacy`), аутентификация `/api/auth/*`, синхронизация документов `/api/docs/*`, ИИ-прокси `/api/ai/*`, healthcheck `/api/health` и безопасный `static_assets` allowlist для `frontend/` и `ux-ui/`. |
| [`config.py`](config.py) | Загрузка конфигурации (`Settings`, `AIConfig`, `GoogleOAuthConfig`) из env и `.env`, автоопределение `DB_PATH` (`RAILWAY_VOLUME_MOUNT_PATH` или `.local_data/ege.db`). |
| [`ai.py`](ai.py) | Единый адаптер стриминга (`stream_ai_text`) и структурированного JSON (`complete_ai_json`) поверх провайдеров ИИ. |

## Запуск

```bash
# Из корня репозитория:
.venv/bin/uvicorn backend.main:app --reload --port 8000
```
