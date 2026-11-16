#!/usr/bin/env python3
"""Zero-dependency MCP (Model Context Protocol) Stdio server wrapping tools/ctx.py."""

from __future__ import annotations

import json
import os
from pathlib import Path
import sys
from typing import Any

TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

import ctx as ctx_engine  # noqa: E402

MCP_TOOLS: list[dict[str, Any]] = [
    {
        "name": "ctx_search",
        "description": "Search code, CSS selectors, SQL tables, FastAPI routes, SPA actions, and docs/context/*.md using FTS5 BM25 + exact path matching.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query (symbol, route, selector, keyword)"},
                "kind": {"type": "string", "enum": ["func", "class", "route", "action", "css", "sql", "doc"]},
                "module": {"type": "string", "description": "Optional path substring filter"},
                "repo": {"type": "string", "description": "Optional repository name filter"},
                "allRepos": {"type": "boolean", "description": "Search across all 7 Vektor EGE repositories"},
                "includeBank": {"type": "boolean", "description": "Include exam question bank files"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 50, "default": 12},
            },
            "required": ["query"],
        },
    },
    {
        "name": "ctx_symbol",
        "description": "Find exact StartLine-EndLine coordinates and optionally return a numbered code slice for a function, class, route, or SPA action.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Symbol, route, or action name"},
                "slice": {"type": "boolean", "default": True, "description": "Include numbered source lines of top match"},
                "maxLines": {"type": "integer", "default": 80, "minimum": 1, "maximum": 200},
                "allRepos": {"type": "boolean", "default": False},
            },
            "required": ["name"],
        },
    },
    {
        "name": "ctx_outline",
        "description": "Return structural table of contents (line ranges + signatures) for a file without loading its full body.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "filePath": {"type": "string", "description": "Relative or absolute path to file"},
                "full": {"type": "boolean", "default": False},
            },
            "required": ["filePath"],
        },
    },
    {
        "name": "ctx_routes",
        "description": "List FastAPI HTTP, SSE, and WebSocket routes with handler names and exact file line ranges.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "substr": {"type": "string"},
                "allRepos": {"type": "boolean", "default": False},
            },
        },
    },
    {
        "name": "ctx_actions",
        "description": "List frontend SPA ACTIONS, FORMS, and view handleAction handlers with exact line ranges.",
        "inputSchema": {
            "type": "object",
            "properties": {"substr": {"type": "string"}},
        },
    },
    {
        "name": "ctx_doc",
        "description": "Read a focused domain shard from docs/context/*.md (or a single heading section) instead of loading full docs.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "topic": {"type": "string", "description": "overview | ux-ui | frontend | backend | databases | etl | token-economy | repositories | roadmap"},
                "section": {"type": "string", "description": "Optional heading substring to return only that section"},
            },
        },
    },
    {
        "name": "ctx_stats",
        "description": "Return token-economy metrics (GEMINI.md byte/token savings and index breakdown across repos).",
        "inputSchema": {
            "type": "object",
            "properties": {"allRepos": {"type": "boolean", "default": True}},
        },
    },
]


def handle_tool_call(conn: Any, name: str, args: dict[str, Any], *, default_all_repos: bool = False) -> tuple[str, bool]:
    args = args or {}
    if name == "ctx_search":
        q = str(args.get("query") or "")
        all_repos = bool(args.get("allRepos", default_all_repos))
        include_bank = bool(args.get("includeBank", False))
        repo = args.get("repo")
        ctx_engine.sync_index(conn, all_repos=bool(all_repos or repo), include_bank=include_bank, repo_filter=repo)
        hits = ctx_engine.search_symbols(
            conn,
            q,
            kind=args.get("kind"),
            module=args.get("module"),
            repo=repo,
            all_repos=bool(all_repos or repo),
            include_bank=include_bank,
            limit=max(1, min(50, int(args.get("limit") or 12))),
        )
        if not hits:
            return f"No matches for: {q}", False
        lines = [f"[{h['kind']}] {ctx_engine._display_path(h)}:{h['start_line']}-{h['end_line']}  {h['signature']}" for h in hits]
        return "\n".join(lines), False

    if name == "ctx_symbol":
        sym = str(args.get("name") or "")
        all_repos = bool(args.get("allRepos", default_all_repos))
        ctx_engine.sync_index(conn, all_repos=all_repos)
        hits = ctx_engine.find_symbol_slices(conn, sym, all_repos=all_repos)
        if not hits:
            return f"Symbol not found: {sym}", False
        parts: list[str] = []
        do_slice = args.get("slice", True)
        max_lines = max(1, min(200, int(args.get("maxLines") or 80)))
        for idx, h in enumerate(hits):
            parts.append(f"[{h['kind']}] {ctx_engine._display_path(h)}:{h['start_line']}-{h['end_line']}  {h['signature']}")
            if do_slice and idx == 0:
                parts.append(ctx_engine.read_numbered_slice(h["abs_path"], int(h["start_line"]), int(h["end_line"]), max_lines=max_lines))
        return "\n".join(parts), False

    if name == "ctx_outline":
        fp = str(args.get("filePath") or "")
        ctx_engine.sync_index(conn, all_repos=True)
        meta, syms = ctx_engine.file_outline(conn, fp, full=bool(args.get("full", False)))
        if not meta:
            return f"File not indexed: {fp}", True
        lines = [f"OUTLINE {ctx_engine._display_path(meta)} ({meta['line_count']} lines, {meta['size_bytes']} bytes, {len(syms)} symbols)"]
        lines.extend(f"L{s['start_line']}-{s['end_line']} [{s['kind']}] {s['signature']}" for s in syms)
        return "\n".join(lines), False

    if name == "ctx_routes":
        all_repos = bool(args.get("allRepos", default_all_repos))
        ctx_engine.sync_index(conn, all_repos=all_repos)
        rows = ctx_engine.list_routes(conn, all_repos=all_repos, substr=args.get("substr"))
        return "\n".join(f"{r['signature']}  ->  {ctx_engine._display_path(r)}:{r['start_line']}-{r['end_line']}" for r in rows), False

    if name == "ctx_actions":
        ctx_engine.sync_index(conn, all_repos=False)
        rows = ctx_engine.list_actions(conn, substr=args.get("substr"))
        return "\n".join(f"{r['name']}  ->  {r['rel_path']}:{r['start_line']}-{r['end_line']}" for r in rows), False

    if name == "ctx_doc":
        ok, text = ctx_engine.read_doc_topic(args.get("topic"), section=args.get("section"))
        return text, not ok

    if name == "ctx_stats":
        all_repos = bool(args.get("allRepos", True))
        ctx_engine.sync_index(conn, all_repos=all_repos)
        st = ctx_engine.compute_stats(conn, all_repos=all_repos)
        return json.dumps(st, ensure_ascii=False, indent=2), False

    return f"Unknown tool: {name}", True


def _read_message(stream: Any) -> tuple[dict[str, Any] | None, str]:
    """Read either Content-Length framed or newline-delimited JSON-RPC message."""
    while True:
        raw_line = stream.readline()
        if not raw_line:
            return None, "line"
        stripped = raw_line.strip()
        if not stripped:
            continue

        lower = raw_line.decode("utf-8", errors="ignore").lower()
        if lower.startswith("content-length:"):
            try:
                length = int(lower.split(":", 1)[1].strip())
            except ValueError:
                return None, "cl"
            while True:
                hdr = stream.readline()
                if not hdr or hdr in (b"\r\n", b"\n"):
                    break
            payload = stream.read(length)
            if not payload:
                return None, "cl"
            return json.loads(payload.decode("utf-8")), "cl"

        return json.loads(stripped.decode("utf-8")), "line"


def _write_message(stream: Any, obj: dict[str, Any], framing: str) -> None:
    encoded = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if framing == "cl":
        header = f"Content-Length: {len(encoded)}\r\n\r\n".encode("ascii")
        stream.write(header + encoded)
    else:
        stream.write(encoded + b"\n")
    stream.flush()


def serve_stdio(*, db_path: Path | None = None) -> int:
    default_all = os.environ.get("VEKTOR_ALL_REPOS", "0").strip() in {"1", "true", "yes"}
    conn = ctx_engine.open_db(db_path)
    stdin_buf = sys.stdin.buffer
    stdout_buf = sys.stdout.buffer

    try:
        while True:
            try:
                msg, framing = _read_message(stdin_buf)
            except json.JSONDecodeError:
                continue
            if msg is None:
                break

            req_id = msg.get("id")
            method = msg.get("method", "")
            params = msg.get("params") or {}

            if req_id is None:
                # Notification (e.g. notifications/initialized)
                continue

            if method == "initialize":
                proto = params.get("protocolVersion") or "2025-03-26"
                result = {
                    "protocolVersion": proto,
                    "capabilities": {"tools": {"listChanged": False}},
                    "serverInfo": {"name": "vektor-ctx", "version": "1.0.0"},
                }
                _write_message(stdout_buf, {"jsonrpc": "2.0", "id": req_id, "result": result}, framing)
            elif method == "ping":
                _write_message(stdout_buf, {"jsonrpc": "2.0", "id": req_id, "result": {}}, framing)
            elif method == "tools/list":
                _write_message(stdout_buf, {"jsonrpc": "2.0", "id": req_id, "result": {"tools": MCP_TOOLS}}, framing)
            elif method == "tools/call":
                tool_name = str(params.get("name") or "")
                tool_args = params.get("arguments") or {}
                text, is_err = handle_tool_call(conn, tool_name, tool_args, default_all_repos=default_all)
                _write_message(
                    stdout_buf,
                    {
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "result": {"content": [{"type": "text", "text": text}], "isError": is_err},
                    },
                    framing,
                )
            else:
                _write_message(
                    stdout_buf,
                    {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Method not found: {method}"}},
                    framing,
                )
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    db_arg = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    raise SystemExit(serve_stdio(db_path=db_arg))
