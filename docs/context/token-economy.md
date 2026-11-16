# Контекст: Экономия токенов и собственный поисковой движок (`tools/ctx.py` и MCP)

## 1. Почему токены расходовались и как это решено
1. **Слишком большой Always-On `GEMINI.md`**: раньше корневой `GEMINI.md` весил `42,188` байт (`~7,500+` токенов) и загружался в системный промпт **на каждом шаге** основного агента и всех субагентов роя. Теперь `GEMINI.md` сжат до `<= 2,600` байт (`~94%` экономии на системных правилах каждый ход), а детали вынесены в **7 тематических файлов** `docs/context/*.md` (принцип *Progressive Disclosure*: читается только нужный домен).
2. **Слепое чтение больших файлов**: `frontend/app.js` (~5 900 строк), `tutor-cabinet.js` (~3 660 строк), `brandbook.js` (~3 530 строк) и 40 файлов банка заданий `frontend/subjects/*.js`. Вместо `read_file` по 800 строк за раз используется локальный структурно-полнотекстовый движок [`tools/ctx.py`](../../tools/ctx.py).

## 2. Как устроен поисковой движок (`tools/ctx.py`)
- **Zero-dependency**: работает только на стандартной библиотеке Python 3.13 (`sqlite3` + **FTS5 BM25 `unicode61`** для русского и английского, `ast`, `re`). Индекс хранится в `.local_data/ctx_index.db` (в `.gitignore`).
- **Инкрементальная переиндексация**: хранит `(repo, rel_path, mtime_ns, size)` и при любом запросе синхронизирует изменённые файлы за `< 50 ms`. По умолчанию **исключает** шумные файлы банка вопросов (`frontend/subjects/*.js`, `bank/*`, `.venv`, `warehouse`), если не передан `--include-bank`.
- **Мультиязыковые парсеры (точные `start_line..end_line`)**:
  - Python (`ast`): классы, функции, декораторы FastAPI `@router.*` / `@app.*` (метод + URL).
  - JS: именованные функции, `EGE.x.y = ...`, ключи `ACTIONS = { ... }`, `FORMS = { ... }` и ветки `act === "..."` в `handleAction`.
  - CSS: селекторы (`.bb-data-table`, `@media`, `@container`) и CSS-переменные `--*`.
  - SQL: `CREATE TABLE` и `CREATE INDEX`.
  - Markdown: заголовки `# / ## / ###`.

## 3. Команды `tools/ctx.py`
```bash
# 1. Индекс по всем 7 репозиториям + статистика экономии токенов:
python3 tools/ctx.py index --all-repos
python3 tools/ctx.py stats --all-repos

# 2. Мгновенный поиск (BM25 + безопасный LIKE для путей вроде /api/admin или .bb-data-table):
python3 tools/ctx.py search "/api/admin/tutors"
python3 tools/ctx.py search "вывод СБП" --kind func --module tutor-cabinet

# 3. Точный срез символа (--slice выводит только строки самой функции):
python3 tools/ctx.py symbol dataTableHTML --slice --max-lines 40

# 4. Оглавление гигантского файла вместо чтения целиком:
python3 tools/ctx.py outline frontend/app.js

# 5. Готовые карты роутов, UI-экшенов и доков:
python3 tools/ctx.py routes --all-repos
python3 tools/ctx.py actions tc-req
python3 tools/ctx.py doc backend --section "Таблица эндпоинтов"
```

## 4. Опциональное подключение как MCP-сервер (`tools/ctx_mcp.py`)
Поисковик можно подключить напрямую как MCP-инструмент в `~/.gemini/config/mcp_config.json` (поддерживаются `Content-Length` и line-delimited JSON-RPC stdio):
```json
{
  "mcpServers": {
    "vektor-ctx": {
      "command": "python3",
      "args": ["/Users/aleksej/Documents/my_projects/Preparation/tools/ctx_mcp.py"],
      "env": { "VEKTOR_ALL_REPOS": "1" }
    }
  }
}
```
Экспортируемые MCP-инструменты: `ctx_search`, `ctx_symbol`, `ctx_outline`, `ctx_routes`, `ctx_actions`, `ctx_doc`, `ctx_stats`.
