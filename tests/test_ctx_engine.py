"""Тесты модульной архитектуры контекста (GEMINI.md + docs/context/*) и поискового движка tools/ctx.py + MCP."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys

from fastapi.testclient import TestClient

from backend.config import AIConfig, GoogleOAuthConfig, Settings
from backend.main import create_app
import tools.ctx as ctx_engine

ROOT_DIR = Path(__file__).resolve().parent.parent


def _run_cli(*args: str, db_path: Path) -> str:
    proc = subprocess.run(
        [sys.executable, str(ROOT_DIR / "tools" / "ctx.py"), "--db", str(db_path), *args],
        cwd=str(ROOT_DIR),
        capture_output=True,
        text=True,
        check=True,
    )
    return proc.stdout


def test_context_sharding_and_budget_guards() -> None:
    gemini_path = ROOT_DIR / "GEMINI.md"
    assert gemini_path.is_file()
    assert gemini_path.stat().st_size <= 3200, "Always-on GEMINI.md must stay slim (<= 3200 bytes)"

    shards = ("overview", "ux-ui", "frontend", "backend", "databases", "etl", "token-economy")
    for name in shards:
        p = ROOT_DIR / "docs" / "context" / f"{name}.md"
        assert p.is_file(), f"Missing context shard: {p}"
        assert p.stat().st_size <= 10_240, f"Context shard too large (> 10 KB): {p}"

    skill = ROOT_DIR / ".agents" / "skills" / "context-engine" / "SKILL.md"
    assert skill.is_file()
    skill_text = skill.read_text(encoding="utf-8")
    assert "name: context-engine" in skill_text


def test_ctx_cli_routes_actions_symbols_outline_punctuation_and_bank_exclusion(tmp_path: Path) -> None:
    db_path = tmp_path / "ctx_test.db"

    idx_out = _run_cli("index", db_path=db_path)
    assert "INDEX_OK" in idx_out

    routes_out = _run_cli("routes", db_path=db_path)
    for route in ("/api/admin/overview", "/api/realtime/stream", "/api/calendar/{feed_token}.ics"):
        assert route in routes_out, f"Missing route {route}"

    act_book = _run_cli("actions", "book-submit", db_path=db_path)
    assert "frontend/core/market-bb-actions.js:" in act_book and "book-submit" in act_book

    act_req = _run_cli("actions", "tc-req-accept", db_path=db_path)
    assert "frontend/views/tutor-cabinet.js:" in act_req and "tc-req-accept" in act_req

    sym_dw = _run_cli("symbol", "DualWriteDatabase", db_path=db_path)
    assert "databases/postgres/dual_write.py:" in sym_dw

    sym_dt = _run_cli("symbol", "dataTableHTML", "--slice", "--max-lines", "25", db_path=db_path)
    assert "ux-ui/components/tables.js:" in sym_dt
    assert "function dataTableHTML" in sym_dt

    outline_out = _run_cli("outline", "frontend/app.js", db_path=db_path)
    outline_lines = [ln for ln in outline_out.splitlines() if ln.strip()]
    assert 40 < len(outline_lines) < 250, f"Expected compact outline (<250 lines), got {len(outline_lines)}"

    # Punctuation-heavy queries must not raise FTS5 syntax errors
    p_route = _run_cli("search", "/api/admin/tutors", db_path=db_path)
    assert "backend/api/admin.py:" in p_route

    p_css = _run_cli("search", ".bb-data-table", db_path=db_path)
    assert "ux-ui/styles/brandbook.css:" in p_css

    # Question-bank noise exclusion by default
    no_bank = _run_cli("search", "митоз", "--limit", "15", db_path=db_path)
    assert "frontend/subjects/" not in no_bank

    with_bank = _run_cli("search", "митоз", "--include-bank", "--limit", "10", db_path=db_path)
    assert "frontend/subjects/" in with_bank

    # Doc shard section lookup
    doc_sec = _run_cli("doc", "backend", "--section", "ENV-переменные", db_path=db_path)
    assert "DATABASE_URL" in doc_sec
    assert "RealtimeBroker" not in doc_sec

    # Stats sanity
    stats_json = json.loads(_run_cli("stats", "--json", db_path=db_path))
    assert stats_json["geminiRuleSavingsPct"] >= 90.0
    assert stats_json["indexedFiles"] >= 60
    assert stats_json["indexedSymbols"] >= 500


def test_mcp_stdio_newline_and_content_length_modes(tmp_path: Path) -> None:
    db_path = tmp_path / "ctx_mcp.db"

    # 1. Newline-delimited JSON-RPC (MCP 2025-03-26 stdio)
    reqs = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-03-26"}},
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "ctx_search", "arguments": {"query": "/api/admin/overview"}}},
        {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "ctx_stats", "arguments": {"allRepos": False}}},
    ]
    stdin_payload = "\n".join(json.dumps(r) for r in reqs) + "\n"
    proc = subprocess.run(
        [sys.executable, str(ROOT_DIR / "tools" / "ctx_mcp.py"), str(db_path)],
        cwd=str(ROOT_DIR),
        input=stdin_payload,
        capture_output=True,
        text=True,
        check=True,
    )
    resps = [json.loads(line) for line in proc.stdout.splitlines() if line.strip()]
    assert [r["id"] for r in resps] == [1, 2, 3, 4]
    assert resps[0]["result"]["serverInfo"]["name"] == "vektor-ctx"
    tool_names = {t["name"] for t in resps[1]["result"]["tools"]}
    assert {"ctx_search", "ctx_symbol", "ctx_outline", "ctx_routes", "ctx_actions", "ctx_doc", "ctx_stats"}.issubset(tool_names)
    assert "backend/api/admin.py:" in resps[2]["result"]["content"][0]["text"]
    stats_payload = json.loads(resps[3]["result"]["content"][0]["text"])
    assert stats_payload["geminiRuleSavingsPct"] >= 90.0

    # 2. Content-Length LSP-style framing
    def frame(obj: dict) -> bytes:
        b = json.dumps(obj).encode("utf-8")
        return f"Content-Length: {len(b)}\r\n\r\n".encode("ascii") + b

    cl_stdin = b"".join([
        frame({"jsonrpc": "2.0", "id": 10, "method": "initialize", "params": {}}),
        frame({"jsonrpc": "2.0", "id": 11, "method": "tools/call", "params": {"name": "ctx_doc", "arguments": {"topic": "databases", "section": "PostgreSQL 17"}}}),
        frame({"jsonrpc": "2.0", "id": 12, "method": "tools/call", "params": {"name": "ctx_doc", "arguments": {"topic": "databases", "section": "Dual-Write"}}}),
    ])
    proc_cl = subprocess.run(
        [sys.executable, str(ROOT_DIR / "tools" / "ctx_mcp.py"), str(db_path)],
        cwd=str(ROOT_DIR),
        input=cl_stdin,
        capture_output=True,
        check=True,
    )
    assert b"Content-Length:" in proc_cl.stdout
    assert b"kafka_outbox" in proc_cl.stdout
    assert b"DualWriteDatabase" in proc_cl.stdout


def test_context_tools_and_docs_not_exposed_via_http(tmp_path: Path) -> None:
    settings = Settings(
        db_path=tmp_path / "web.db",
        ai=AIConfig(None, None, None, None, None),
        google=GoogleOAuthConfig(None, None),
    )
    app = create_app(settings)
    with TestClient(app) as client:
        for forbidden in (
            "/tools/ctx.py",
            "/tools/ctx_mcp.py",
            "/docs/context/backend.md",
            "/GEMINI.md",
            "/.agents/skills/context-engine/SKILL.md",
        ):
            assert client.get(forbidden).status_code == 404, f"Must not expose {forbidden}"
