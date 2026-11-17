# GEMINI.md — Вектор ЕГЭ (роутер контекста)

Платформа ЕГЭ-2027 + маркетплейс (`±100 ₽`, `10:00–20:00`). Порты: `:8770` Web/API, `:8771` `vektor-api`, `:8772` `vektor-ui-kit`, `:5432` PG17, `:8085` Airflow, `:3000` Grafana. **Порт `55432` (PID `9188`) не трогать!**

## Экономия токенов (обязательно)
Файлы > 200 строк не читать целиком. Искать через [`tools/ctx.py`](tools/ctx.py), читать только `StartLine..EndLine`:
- `python3 tools/ctx.py search "<q>"` / `symbol "<name>" --slice` / `outline <file>`
- `python3 tools/ctx.py routes` / `actions [q]` / `doc <topic>`

## Доменные справки (`docs/context/`)
- [`overview.md`](docs/context/overview.md) — роли, экраны `VIEWS`, карта 7 репо
- [`ux-ui.md`](docs/context/ux-ui.md) — UI Kit `ux-ui/`, `vektor-ui-kit`, токены, `EGE.kit`/`charts`
- [`frontend.md`](docs/context/frontend.md) — SPA `frontend/`, `EGE.api`, таблицы вьюх, `/admin`
- [`backend.md`](docs/context/backend.md) — `backend/api/*`, `shell.py`, `vektor-api`, SSE/WS/`.ics`
- [`databases.md`](docs/context/databases.md) — SQLite WAL, PG17 Dual-Write, `outbox.kafka_outbox`
- [`etl.md`](docs/context/etl.md) — `etl/`, `Polars M4 Pro`, Airflow, Grafana, 5 Kafka-топиков
- [`token-economy.md`](docs/context/token-economy.md) — `tools/ctx.py` и MCP [`tools/ctx_mcp.py`](tools/ctx_mcp.py)
- [`REPOSITORIES.md`](REPOSITORIES.md) / [`ROADMAP_UNCONNECTED.md`](ROADMAP_UNCONNECTED.md)
- План запуска и СБП (`docs/business/`): [`vektor_ege_pitch_300k_yakutsk.pdf`](docs/business/vektor_ege_pitch_300k_yakutsk.pdf) (старт `30.11.2026`, Якутск), [`vektor_ege_unit_economics_v2_sbp_low_fee.docx`](docs/business/vektor_ege_unit_economics_v2_sbp_low_fee.docx), [`vektor_ege_unit_economics_yakutsk.docx`](docs/business/vektor_ege_unit_economics_yakutsk.docx) — тарифы `390 / 990 / 2 190 / 4 590 / 8 900 ₽`, `PRO 1 490 ₽/мес`.

## Жёсткие инварианты
1. В `ux-ui/` запрещены `fetch(`, `EventSource`, `WebSocket`, `EGE.api`, `EGE.tutors`.
2. `frontend/app.js` — строго CRLF (`bare_lf == 0`); единая формула `95%/5%`.
3. Нет `#13794b`, `"Вывести 95%"`, `"5%:"` на `/brandbook`.
4. `GET /api/health` строго `{"ok": True, "db": "ok", "ai": ...}`; uvicorn `--workers 1`.
5. Allowlist статики: `backend/shell.py` + `tests/test_server.py`.

## Проверка
```bash
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc tests/check_app.js && .venv/bin/pytest -q && python3 -c 'b=open("frontend/app.js","rb").read(); assert b.count(b"\n")==b.count(b"\r\n"); print("CRLF_OK")'
```
