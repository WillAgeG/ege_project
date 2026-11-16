---
name: context-engine
description: >-
  Use this skill when exploring, debugging, or modifying code across the Vektor EGE codebase
  (Preparation and its 6 sibling repositories) to locate exact symbol line ranges, FastAPI routes,
  SPA UI actions, SQL schemas, and domain context shards in `docs/context/` with minimal token usage
  via `tools/ctx.py` instead of reading whole files.
---

# Context Engine (`tools/ctx.py`) — Low-Token Navigation

Always query the structural FTS5 index before calling `read_file` on large files (`frontend/app.js`, `frontend/views/tutor-cabinet.js`, `ux-ui/brandbook/brandbook.js`, `databases/postgres/store.py`).

## Commands

```bash
# 1. Ranked search across code, CSS, SQL, and docs/context/*.md (excludes question-bank noise by default):
python3 tools/ctx.py search "<query>"
python3 tools/ctx.py search "<query>" --all-repos --limit 10

# 2. Extract exact line slice of a symbol, route, action, selector, or table:
python3 tools/ctx.py symbol "<name>" --slice --max-lines 80

# 3. Structural outline of any file without reading its body:
python3 tools/ctx.py outline frontend/app.js

# 4. Dedicated lookups for FastAPI routes, SPA ACTIONS/handleAction, and context shards:
python3 tools/ctx.py routes
python3 tools/ctx.py actions <substr>
python3 tools/ctx.py doc <overview|ux-ui|frontend|backend|databases|etl|token-economy> [--section "<title>"]

# 5. Measure current token savings:
python3 tools/ctx.py stats --all-repos
```

## Rules
- Never open whole files > 200 lines; always read only `[start_line..end_line]` returned by `ctx.py`.
- Read only the single matching shard under `docs/context/` for the layer you are editing.
- Use `--include-bank` only when specifically searching biology/chemistry/russian exam questions.
