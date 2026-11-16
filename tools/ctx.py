#!/usr/bin/env python3
"""Zero-dependency structural + FTS5 BM25 code & context search engine for Vektor EGE."""

from __future__ import annotations

import argparse
import ast
from dataclasses import dataclass
from pathlib import Path
import re
import signal
import sqlite3
import sys
import time
from typing import Any

if hasattr(signal, "SIGPIPE"):
    signal.signal(signal.SIGPIPE, signal.SIG_DFL)

ROOT_DIR = Path(__file__).resolve().parent.parent
WORKSPACES_PARENT = ROOT_DIR.parent
DEFAULT_DB_PATH = ROOT_DIR / ".local_data" / "ctx_index.db"
LEGACY_GEMINI_BYTES = 42188

SIBLING_REPOS = (
    "vektor-ui-kit",
    "vektor-api",
    "vektor-postgres",
    "vektor-polars-engine",
    "vektor-airflow",
    "vektor-grafana",
)

EXCLUDED_DIRS = {
    ".git",
    ".venv",
    ".venv-etl",
    "__pycache__",
    ".local_data",
    ".pytest_cache",
    "warehouse",
    "logs",
    "node_modules",
    "assets",
    "plugins",
}

ALLOWED_EXTS = {".py", ".js", ".css", ".sql", ".md", ".html", ".sh", ".toml", ".yaml", ".yml", ".json"}
MAX_FILE_BYTES = 1_200_000
MAX_JSON_BYTES = 64_000

DOC_TOPICS = {
    "overview": ROOT_DIR / "docs" / "context" / "overview.md",
    "ux-ui": ROOT_DIR / "docs" / "context" / "ux-ui.md",
    "uikit": ROOT_DIR / "docs" / "context" / "ux-ui.md",
    "frontend": ROOT_DIR / "docs" / "context" / "frontend.md",
    "backend": ROOT_DIR / "docs" / "context" / "backend.md",
    "databases": ROOT_DIR / "docs" / "context" / "databases.md",
    "db": ROOT_DIR / "docs" / "context" / "databases.md",
    "etl": ROOT_DIR / "docs" / "context" / "etl.md",
    "token-economy": ROOT_DIR / "docs" / "context" / "token-economy.md",
    "tokens": ROOT_DIR / "docs" / "context" / "token-economy.md",
    "gemini": ROOT_DIR / "GEMINI.md",
    "repositories": ROOT_DIR / "REPOSITORIES.md",
    "roadmap": ROOT_DIR / "ROADMAP_UNCONNECTED.md",
}

HTTP_METHODS = {"get", "post", "put", "patch", "delete", "websocket", "route", "api_route"}


@dataclass(frozen=True)
class ExtractedSymbol:
    name: str
    kind: str  # class | func | route | action | css | sql | doc
    signature: str
    body: str
    start_line: int
    end_line: int


def _is_bank_path(rel_path: str) -> bool:
    norm = rel_path.replace("\\", "/").lstrip("/")
    return norm.startswith("frontend/subjects/") or norm.startswith("bank/")


def _find_js_block_end(lines: list[str], start_idx: int, max_scan: int = 900) -> int:
    """Brace-balanced end line finder for JS/CSS blocks (0-indexed input, returns 1-indexed line)."""
    depth = 0
    seen_open = False
    in_single = False
    in_double = False
    in_backtick = False
    in_block_comment = False
    limit = min(len(lines), start_idx + max_scan)

    for idx in range(start_idx, limit):
        line = lines[idx]
        i = 0
        n = len(line)
        while i < n:
            ch = line[i]
            nxt = line[i + 1] if i + 1 < n else ""

            if in_block_comment:
                if ch == "*" and nxt == "/":
                    in_block_comment = False
                    i += 2
                    continue
                i += 1
                continue

            if in_single:
                if ch == "\\":
                    i += 2
                    continue
                if ch == "'":
                    in_single = False
                i += 1
                continue

            if in_double:
                if ch == "\\":
                    i += 2
                    continue
                if ch == '"':
                    in_double = False
                i += 1
                continue

            if in_backtick:
                if ch == "\\":
                    i += 2
                    continue
                if ch == "`":
                    in_backtick = False
                i += 1
                continue

            if ch == "/" and nxt == "/":
                break
            if ch == "/" and nxt == "*":
                in_block_comment = True
                i += 2
                continue
            if ch == "'":
                in_single = True
                i += 1
                continue
            if ch == '"':
                in_double = True
                i += 1
                continue
            if ch == "`":
                in_backtick = True
                i += 1
                continue

            if ch == "{":
                depth += 1
                seen_open = True
            elif ch == "}":
                if seen_open:
                    depth -= 1
                    if depth <= 0:
                        return idx + 1
            i += 1

        if idx == start_idx and not seen_open:
            return start_idx + 1

    return min(len(lines), start_idx + 1)


def _snippet(lines: list[str], start_line: int, end_line: int, max_lines: int = 35, max_chars: int = 1600) -> str:
    chunk = lines[max(0, start_line - 1) : min(len(lines), end_line, start_line - 1 + max_lines)]
    text = "\n".join(chunk)
    return text[:max_chars]


def _extract_route_decorator(dec: ast.expr) -> tuple[str, str, int] | None:
    if not isinstance(dec, ast.Call):
        return None
    func = dec.func
    if not isinstance(func, ast.Attribute):
        return None
    method = func.attr.lower()
    if method not in HTTP_METHODS:
        return None
    if not dec.args:
        return None
    arg0 = dec.args[0]
    if isinstance(arg0, ast.Constant) and isinstance(arg0.value, str):
        label = "WS" if method == "websocket" else method.upper()
        return label, arg0.value, getattr(dec, "lineno", arg0.lineno)
    return None


def _py_arg_preview(args: ast.arguments) -> str:
    names = [a.arg for a in args.posonlyargs + args.args if a.arg not in ("self", "cls")]
    kwonly = [a.arg for a in args.kwonlyargs]
    parts = names[:4] + (["..."] if len(names) > 4 else []) + ([f"*{a}" for a in kwonly[:2]])
    return ", ".join(parts)


def extract_py_symbols(text: str) -> list[ExtractedSymbol]:
    lines = text.splitlines()
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return []

    out: list[ExtractedSymbol] = []
    seen: set[tuple[str, str, int]] = set()

    def visit(node: ast.AST, depth: int) -> None:
        for child in ast.iter_child_nodes(node):
            if isinstance(child, ast.ClassDef):
                end_ln = getattr(child, "end_lineno", child.lineno) or child.lineno
                doc = ast.get_docstring(child) or ""
                doc_first = doc.splitlines()[0].strip()[:80] if doc else ""
                sig = f"class {child.name}" + (f" — {doc_first}" if doc_first else "")
                key = ("class", child.name, child.lineno)
                if key not in seen:
                    seen.add(key)
                    out.append(ExtractedSymbol(child.name, "class", sig, _snippet(lines, child.lineno, end_ln), child.lineno, end_ln))
                visit(child, depth + 1)
            elif isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                end_ln = getattr(child, "end_lineno", child.lineno) or child.lineno
                route_hit = None
                for dec in child.decorator_list:
                    r = _extract_route_decorator(dec)
                    if r:
                        route_hit = r
                        method_lbl, route_path, dec_ln = r
                        sig = f"{method_lbl} {route_path} -> {child.name}({_py_arg_preview(child.args)})"
                        rkey = ("route", route_path, dec_ln)
                        if rkey not in seen:
                            seen.add(rkey)
                            out.append(ExtractedSymbol(route_path, "route", sig, _snippet(lines, dec_ln, end_ln), dec_ln, end_ln))

                # Keep classes/routes + top-level and 1-level factory inner functions
                if depth <= 2 or route_hit is not None:
                    prefix = "async def" if isinstance(child, ast.AsyncFunctionDef) else "def"
                    doc = ast.get_docstring(child) or ""
                    doc_first = doc.splitlines()[0].strip()[:70] if doc else ""
                    sig = f"{prefix} {child.name}({_py_arg_preview(child.args)})" + (f" — {doc_first}" if doc_first else "")
                    fkey = ("func", child.name, child.lineno)
                    if fkey not in seen:
                        seen.add(fkey)
                        out.append(ExtractedSymbol(child.name, "func", sig, _snippet(lines, child.lineno, end_ln), child.lineno, end_ln))
                if depth < 2:
                    visit(child, depth + 1)

    visit(tree, 0)
    return out


_JS_FUNC_RE = re.compile(r"^\s{0,8}(?:async\s+)?function\s+([A-Za-z_$][0-9A-Za-z_$]*)\s*\(([^)]*)\)\s*\{")
_JS_NS_RE = re.compile(r"^\s{0,8}(?:window\.)?(EGE(?:\.[A-Za-z_$][0-9A-Za-z_$]*){1,4})\s*=\s*(?:async\s+function\b|\{|function\b)")
_JS_EXPORT_PROP_RE = re.compile(r"^\s{2,6}([A-Za-z_$][0-9A-Za-z_$]*)\s*\(([^)]*)\)\s*\{")
_JS_ACT_BLOCK_START_RE = re.compile(r"^\s{0,6}const\s+(ACTIONS|FORMS)\s*=\s*\{")
_JS_OBJ_KEY_RE = re.compile(r'^\s{4,8}"?([a-z][0-9a-zA-Z_-]*)"?\s*:\s*(?:\([^)]*\)|[A-Za-z_$])')
_JS_ACT_IF_RE = re.compile(r'if\s*\(\s*act\s*===\s*"([^"]+)"')
_JS_CATALOG_SEC_RE = re.compile(r"^\s{2,6}function\s+(render[A-Za-z0-9_]+|view[A-Za-z0-9_]+)\s*\(")


def extract_js_symbols(text: str, rel_path: str) -> list[ExtractedSymbol]:
    lines = text.splitlines()
    out: list[ExtractedSymbol] = []
    seen: set[tuple[str, str, int]] = set()
    in_action_table_until = 0
    # Skip minified/bundled vendor scripts (single huge lines > 6000 chars)
    if any(len(ln_txt) > 6000 for ln_txt in lines[:10]):
        return []

    if _is_bank_path(rel_path):
        # Summarize question-bank file into 1 searchable entry for `--include-bank`.
        title = Path(rel_path).stem
        out.append(
            ExtractedSymbol(
                name=title,
                kind="func",
                signature=f"subject bank module: {rel_path}",
                body="\n".join(lines[:400])[:16000],
                start_line=1,
                end_line=len(lines),
            )
        )
        return out

    for idx, line in enumerate(lines):
        ln = idx + 1

        m_tbl = _JS_ACT_BLOCK_START_RE.match(line)
        if m_tbl:
            tbl_name = m_tbl.group(1)
            end_tbl = _find_js_block_end(lines, idx, max_scan=2000)
            in_action_table_until = end_tbl
            key = ("class", tbl_name, ln)
            if key not in seen:
                seen.add(key)
                out.append(ExtractedSymbol(tbl_name, "class", f"const {tbl_name} = {{...}}", _snippet(lines, ln, min(end_tbl, ln + 25)), ln, end_tbl))
            continue

        if ln <= in_action_table_until:
            m_k = _JS_OBJ_KEY_RE.match(line)
            if m_k:
                act_name = m_k.group(1)
                end_a = _find_js_block_end(lines, idx, max_scan=160)
                key = ("action", act_name, ln)
                if key not in seen:
                    seen.add(key)
                    out.append(ExtractedSymbol(act_name, "action", f'action "{act_name}"', _snippet(lines, ln, end_a, max_lines=20), ln, end_a))
                continue

        m_if = _JS_ACT_IF_RE.search(line)
        if m_if:
            act_name = m_if.group(1)
            end_a = _find_js_block_end(lines, idx, max_scan=160)
            key = ("action", act_name, ln)
            if key not in seen:
                seen.add(key)
                out.append(ExtractedSymbol(act_name, "action", f'handleAction "{act_name}"', _snippet(lines, ln, end_a, max_lines=20), ln, end_a))

        m_fn = _JS_FUNC_RE.match(line)
        if m_fn:
            fn_name = m_fn.group(1)
            fn_args = m_fn.group(2).strip()[:60]
            end_fn = _find_js_block_end(lines, idx, max_scan=900)
            key = ("func", fn_name, ln)
            if key not in seen:
                seen.add(key)
                out.append(ExtractedSymbol(fn_name, "func", f"function {fn_name}({fn_args})", _snippet(lines, ln, end_fn), ln, end_fn))
            continue

        m_ns = _JS_NS_RE.match(line)
        if m_ns:
            ns_name = m_ns.group(1)
            end_ns = _find_js_block_end(lines, idx, max_scan=900)
            kind = "func" if ("function" in line) else "class"
            key = (kind, ns_name, ln)
            if key not in seen:
                seen.add(key)
                out.append(ExtractedSymbol(ns_name, kind, f"{ns_name} = ...", _snippet(lines, ln, end_ns), ln, end_ns))
            continue

        # Capture object literal method properties on top exports / EGEPayments
        if rel_path.endswith("frontend/core/api.js") or "EGEPayments" in line:
            m_prop = _JS_EXPORT_PROP_RE.match(line)
            if m_prop and m_prop.group(1) not in ("if", "for", "while", "switch", "catch"):
                fn_name = m_prop.group(1)
                end_p = _find_js_block_end(lines, idx, max_scan=120)
                key = ("func", fn_name, ln)
                if key not in seen:
                    seen.add(key)
                    out.append(ExtractedSymbol(fn_name, "func", f"method {fn_name}({m_prop.group(2).strip()[:45]})", _snippet(lines, ln, end_p), ln, end_p))

    if not out and lines:
        out.append(ExtractedSymbol(Path(rel_path).stem, "func", f"module {rel_path}", _snippet(lines, 1, len(lines)), 1, len(lines)))
    return out


_CSS_RULE_RE = re.compile(r"^([.@#:a-zA-Z\[][^{;\n]{0,120})\{")


def extract_css_symbols(text: str) -> list[ExtractedSymbol]:
    lines = text.splitlines()
    out: list[ExtractedSymbol] = []
    seen: set[tuple[str, int]] = set()

    for idx, line in enumerate(lines):
        stripped = line.strip()
        if not stripped or stripped.startswith("/*") or stripped.startswith("*"):
            continue
        m = _CSS_RULE_RE.match(stripped)
        if not m:
            continue
        sel = re.sub(r"\s+", " ", m.group(1).strip())
        if sel.startswith(("@keyframes", "from", "to", "0%", "50%", "100%")):
            continue
        ln = idx + 1
        end_ln = _find_js_block_end(lines, idx, max_scan=200)
        name = sel.split(",")[0].strip().split()[0][:80]
        if (name, ln) not in seen:
            seen.add((name, ln))
            out.append(ExtractedSymbol(name, "css", f"{sel} {{...}}", _snippet(lines, ln, end_ln, max_lines=16), ln, end_ln))
    return out


_SQL_CREATE_RE = re.compile(r"^\s*CREATE\s+(?:UNIQUE\s+)?(TABLE|INDEX|SCHEMA|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_.\"]+)", re.IGNORECASE)


def extract_sql_symbols(text: str) -> list[ExtractedSymbol]:
    lines = text.splitlines()
    out: list[ExtractedSymbol] = []
    n = len(lines)
    idx = 0
    while idx < n:
        line = lines[idx]
        m = _SQL_CREATE_RE.match(line)
        if m:
            obj_type = m.group(1).upper()
            obj_name = m.group(2).strip('"')
            start_ln = idx + 1
            end_ln = start_ln
            for j in range(idx, min(n, idx + 80)):
                end_ln = j + 1
                if ";" in lines[j]:
                    break
            out.append(ExtractedSymbol(obj_name, "sql", f"CREATE {obj_type} {obj_name}", _snippet(lines, start_ln, end_ln, max_lines=30), start_ln, end_ln))
            idx = end_ln
            continue
        idx += 1
    return out


_MD_HEADING_RE = re.compile(r"^(#{1,3})\s+(.+?)\s*$")


def extract_md_symbols(text: str, rel_path: str) -> list[ExtractedSymbol]:
    lines = text.splitlines()
    headings: list[tuple[int, str, int]] = []
    in_fence = False
    for idx, line in enumerate(lines):
        if line.strip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        m = _MD_HEADING_RE.match(line)
        if m:
            headings.append((len(m.group(1)), m.group(2).strip(), idx + 1))

    if not headings:
        if not lines:
            return []
        return [ExtractedSymbol(Path(rel_path).name, "doc", rel_path, _snippet(lines, 1, len(lines), max_lines=40), 1, len(lines))]

    out: list[ExtractedSymbol] = []
    for i, (lvl, title, start_ln) in enumerate(headings):
        next_ln = headings[i + 1][2] - 1 if i + 1 < len(headings) else len(lines)
        end_ln = max(start_ln, next_ln)
        sig = ("#" * lvl) + " " + title
        out.append(ExtractedSymbol(title, "doc", sig, _snippet(lines, start_ln, end_ln, max_lines=40, max_chars=2200), start_ln, end_ln))
    return out


def extract_generic_symbols(text: str, rel_path: str) -> list[ExtractedSymbol]:
    lines = text.splitlines()
    if not lines:
        return []
    return [ExtractedSymbol(Path(rel_path).name, "doc", f"file {rel_path}", _snippet(lines, 1, len(lines), max_lines=35), 1, len(lines))]


def extract_file_symbols(text: str, rel_path: str) -> list[ExtractedSymbol]:
    ext = Path(rel_path).suffix.lower()
    if ext == ".py":
        return extract_py_symbols(text)
    if ext == ".js":
        return extract_js_symbols(text, rel_path)
    if ext == ".css":
        return extract_css_symbols(text)
    if ext == ".sql":
        return extract_sql_symbols(text)
    if ext == ".md":
        return extract_md_symbols(text, rel_path)
    return extract_generic_symbols(text, rel_path)


def _iter_repo_files(repo_name: str, repo_root: Path, include_bank: bool) -> list[tuple[str, Path, bool]]:
    found: list[tuple[str, Path, bool]] = []
    if not repo_root.exists():
        return found

    def walk_dir(cur: Path) -> None:
        try:
            entries = sorted(cur.iterdir(), key=lambda p: p.name)
        except OSError:
            return
        for entry in entries:
            name = entry.name
            if entry.is_dir():
                if name in EXCLUDED_DIRS or (name.startswith(".") and name not in {".agents", ".github"}):
                    continue
                rel_dir = entry.relative_to(repo_root).as_posix()
                if not include_bank and (rel_dir == "frontend/subjects" or rel_dir == "bank"):
                    continue
                walk_dir(entry)
            elif entry.is_file():
                ext = entry.suffix.lower()
                if ext not in ALLOWED_EXTS and name != "Dockerfile":
                    continue
                try:
                    sz = entry.stat().st_size
                except OSError:
                    continue
                if sz > MAX_FILE_BYTES or (ext == ".json" and sz > MAX_JSON_BYTES):
                    continue
                rel = entry.relative_to(repo_root).as_posix()
                is_bank = _is_bank_path(rel)
                if is_bank and not include_bank:
                    continue
                found.append((rel, entry, is_bank))

    walk_dir(repo_root)
    return found


def open_db(db_path: Path | None = None) -> sqlite3.Connection:
    target = db_path or DEFAULT_DB_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(target))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS files_meta (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            repo TEXT NOT NULL,
            rel_path TEXT NOT NULL,
            abs_path TEXT NOT NULL,
            mtime_ns INTEGER NOT NULL,
            size_bytes INTEGER NOT NULL,
            line_count INTEGER NOT NULL,
            is_bank INTEGER NOT NULL DEFAULT 0,
            UNIQUE (repo, rel_path)
        );
        CREATE TABLE IF NOT EXISTS symbols (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL REFERENCES files_meta(id) ON DELETE CASCADE,
            repo TEXT NOT NULL,
            rel_path TEXT NOT NULL,
            abs_path TEXT NOT NULL,
            name TEXT NOT NULL,
            kind TEXT NOT NULL,
            signature TEXT NOT NULL,
            body TEXT NOT NULL,
            start_line INTEGER NOT NULL,
            end_line INTEGER NOT NULL,
            is_bank INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
        CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind);
        CREATE INDEX IF NOT EXISTS idx_symbols_path ON symbols(repo, rel_path, start_line);
        CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(
            name,
            kind,
            signature,
            body,
            rel_path,
            repo,
            tokenize='unicode61'
        );
        """
    )
    conn.commit()
    return conn


def _target_repos(all_repos: bool, repo_filter: str | None = None) -> list[tuple[str, Path]]:
    repos: list[tuple[str, Path]] = [(ROOT_DIR.name, ROOT_DIR)]
    if all_repos or (repo_filter and repo_filter != ROOT_DIR.name):
        for name in SIBLING_REPOS:
            candidate = WORKSPACES_PARENT / name
            if candidate.exists() and candidate.is_dir():
                repos.append((name, candidate))
    if repo_filter:
        repos = [r for r in repos if r[0] == repo_filter]
    return repos


def sync_index(
    conn: sqlite3.Connection,
    *,
    all_repos: bool = False,
    include_bank: bool = False,
    rebuild: bool = False,
    repo_filter: str | None = None,
) -> dict[str, Any]:
    t0 = time.perf_counter()
    if rebuild:
        conn.execute("DELETE FROM symbols_fts")
        conn.execute("DELETE FROM symbols")
        conn.execute("DELETE FROM files_meta")
        conn.commit()

    repos = _target_repos(all_repos, repo_filter)
    existing_rows = conn.execute("SELECT id, repo, rel_path, mtime_ns, size_bytes, is_bank FROM files_meta").fetchall()
    existing = {(r["repo"], r["rel_path"]): dict(r) for r in existing_rows}

    scanned_files = 0
    reindexed_files = 0
    seen_keys: set[tuple[str, str]] = set()
    active_repos = {name for name, _ in repos}

    for repo_name, repo_root in repos:
        for rel_path, abs_path, is_bank in _iter_repo_files(repo_name, repo_root, include_bank):
            scanned_files += 1
            seen_keys.add((repo_name, rel_path))
            st = abs_path.stat()
            prev = existing.get((repo_name, rel_path))
            if prev and int(prev["mtime_ns"]) == int(st.st_mtime_ns) and int(prev["size_bytes"]) == int(st.st_size):
                continue

            try:
                text = abs_path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            line_count = text.count("\n") + (1 if text and not text.endswith("\n") else 0)
            extracted = extract_file_symbols(text, rel_path)

            if prev:
                file_id = int(prev["id"])
                old_sym_ids = [int(r[0]) for r in conn.execute("SELECT id FROM symbols WHERE file_id = ?", (file_id,)).fetchall()]
                if old_sym_ids:
                    placeholders = ",".join("?" for _ in old_sym_ids)
                    conn.execute(f"DELETE FROM symbols_fts WHERE rowid IN ({placeholders})", old_sym_ids)
                    conn.execute("DELETE FROM symbols WHERE file_id = ?", (file_id,))
                conn.execute(
                    "UPDATE files_meta SET abs_path=?, mtime_ns=?, size_bytes=?, line_count=?, is_bank=? WHERE id=?",
                    (str(abs_path), int(st.st_mtime_ns), int(st.st_size), line_count, int(is_bank), file_id),
                )
            else:
                cur = conn.execute(
                    "INSERT INTO files_meta (repo, rel_path, abs_path, mtime_ns, size_bytes, line_count, is_bank) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (repo_name, rel_path, str(abs_path), int(st.st_mtime_ns), int(st.st_size), line_count, int(is_bank)),
                )
                file_id = int(cur.lastrowid)

            for sym in extracted:
                scur = conn.execute(
                    "INSERT INTO symbols (file_id, repo, rel_path, abs_path, name, kind, signature, body, start_line, end_line, is_bank) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (file_id, repo_name, rel_path, str(abs_path), sym.name, sym.kind, sym.signature, sym.body, sym.start_line, sym.end_line, int(is_bank)),
                )
                sid = int(scur.lastrowid)
                conn.execute(
                    "INSERT INTO symbols_fts (rowid, name, kind, signature, body, rel_path, repo) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (sid, sym.name, sym.kind, sym.signature, sym.body, rel_path, repo_name),
                )
            reindexed_files += 1

    # Prune deleted files within scanned scope
    for (r_name, r_path), prev in existing.items():
        if r_name not in active_repos:
            continue
        if prev["is_bank"] and not include_bank:
            continue
        if (r_name, r_path) not in seen_keys:
            file_id = int(prev["id"])
            old_sym_ids = [int(r[0]) for r in conn.execute("SELECT id FROM symbols WHERE file_id = ?", (file_id,)).fetchall()]
            if old_sym_ids:
                placeholders = ",".join("?" for _ in old_sym_ids)
                conn.execute(f"DELETE FROM symbols_fts WHERE rowid IN ({placeholders})", old_sym_ids)
            conn.execute("DELETE FROM symbols WHERE file_id = ?", (file_id,))
            conn.execute("DELETE FROM files_meta WHERE id = ?", (file_id,))

    conn.commit()
    total_symbols = int(conn.execute("SELECT COUNT(*) FROM symbols").fetchone()[0])
    total_files = int(conn.execute("SELECT COUNT(*) FROM files_meta").fetchone()[0])
    elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
    return {
        "scannedFiles": scanned_files,
        "reindexedFiles": reindexed_files,
        "totalFiles": total_files,
        "totalSymbols": total_symbols,
        "elapsedMs": elapsed_ms,
    }


def _display_path(row: sqlite3.Row | dict[str, Any]) -> str:
    repo = row["repo"]
    rel = row["rel_path"]
    return rel if repo == ROOT_DIR.name else f"{repo}/{rel}"


def _build_fts_match(tokens: list[str]) -> str:
    return " AND ".join(f'"{t}"*' for t in tokens[:8])


def search_symbols(
    conn: sqlite3.Connection,
    query: str,
    *,
    kind: str | None = None,
    module: str | None = None,
    repo: str | None = None,
    all_repos: bool = False,
    include_bank: bool = False,
    limit: int = 12,
) -> list[dict[str, Any]]:
    raw_q = (query or "").strip()
    if not raw_q:
        return []

    tokens = re.findall(r"[0-9A-Za-zА-Яа-яЁё_]+", raw_q)
    has_punct = any(ch in raw_q for ch in "/.:-@±") or len(tokens) == 0
    sql_filters: list[str] = []
    filter_params: list[Any] = []

    if not include_bank:
        sql_filters.append("s.is_bank = 0")
    if not all_repos and not repo:
        sql_filters.append("s.repo = ?")
        filter_params.append(ROOT_DIR.name)
    elif repo:
        sql_filters.append("s.repo = ?")
        filter_params.append(repo)
    if kind:
        sql_filters.append("s.kind = ?")
        filter_params.append(kind)
    if module:
        sql_filters.append("LOWER(s.rel_path) LIKE ?")
        filter_params.append(f"%{module.lower()}%")

    where_extra = (" AND " + " AND ".join(sql_filters)) if sql_filters else ""
    results: list[dict[str, Any]] = []
    seen_ids: set[int] = set()

    # Exact / punctuation substring pass first when path/selector tokens exist or for name matches
    like_pat = f"%{raw_q.lower()}%"
    exact_sql = f"""
        SELECT s.*,
               CASE
                 WHEN LOWER(s.name) = ? THEN 0
                 WHEN LOWER(s.name) LIKE ? THEN 1
                 WHEN LOWER(s.signature) LIKE ? THEN 2
                 ELSE 3
               END AS rank_score
        FROM symbols s
        WHERE (LOWER(s.name) LIKE ? OR LOWER(s.signature) LIKE ? OR LOWER(s.rel_path) LIKE ?)
          {where_extra}
        ORDER BY rank_score ASC, s.start_line ASC
        LIMIT ?
    """
    exact_params: list[Any] = [raw_q.lower(), f"{raw_q.lower()}%", like_pat, like_pat, like_pat, like_pat, *filter_params, max(limit, 10)]
    if has_punct or len(tokens) == 1:
        for r in conn.execute(exact_sql, exact_params).fetchall():
            d = dict(r)
            seen_ids.add(int(d["id"]))
            results.append(d)

    # FTS5 BM25 pass
    if tokens and len(results) < limit:
        match_expr = _build_fts_match(tokens)
        fts_sql = f"""
            SELECT s.*, bm25(symbols_fts, 10.0, 2.0, 6.0, 1.5, 2.0, 0.5) AS rank_score
            FROM symbols_fts
            JOIN symbols s ON s.id = symbols_fts.rowid
            WHERE symbols_fts MATCH ?
              {where_extra}
            ORDER BY rank_score ASC
            LIMIT ?
        """
        try:
            for r in conn.execute(fts_sql, [match_expr, *filter_params, limit]).fetchall():
                d = dict(r)
                sid = int(d["id"])
                if sid not in seen_ids:
                    seen_ids.add(sid)
                    results.append(d)
        except sqlite3.OperationalError:
            pass

    # Broad LIKE fallback if zero results
    if not results:
        for r in conn.execute(exact_sql, exact_params).fetchall():
            d = dict(r)
            sid = int(d["id"])
            if sid not in seen_ids:
                seen_ids.add(sid)
                results.append(d)

    return results[:limit]


def find_symbol_slices(
    conn: sqlite3.Connection,
    name: str,
    *,
    all_repos: bool = False,
    limit: int = 8,
) -> list[dict[str, Any]]:
    q = (name or "").strip()
    if not q:
        return []
    ql = q.lower()
    repo_clause = "" if all_repos else "AND repo = ?"
    params: list[Any] = [ql, f"{ql}%", f"%{ql}%"]
    if not all_repos:
        params.append(ROOT_DIR.name)
    rows = conn.execute(
        f"""
        SELECT *,
               CASE WHEN LOWER(name) = ? THEN 0 WHEN LOWER(name) LIKE ? THEN 1 ELSE 2 END AS prio
        FROM symbols
        WHERE is_bank = 0 AND LOWER(name) LIKE ? {repo_clause}
        ORDER BY prio ASC, CASE kind WHEN 'route' THEN 0 WHEN 'class' THEN 1 WHEN 'func' THEN 2 WHEN 'action' THEN 3 ELSE 4 END, start_line ASC
        LIMIT ?
        """,
        [*params[:-1], f"%{ql}%", *([ROOT_DIR.name] if not all_repos else []), limit],
    ).fetchall() if False else conn.execute(
        f"""
        SELECT *,
               CASE WHEN LOWER(name) = ? THEN 0 WHEN LOWER(name) LIKE ? THEN 1 ELSE 2 END AS prio
        FROM symbols
        WHERE is_bank = 0 AND LOWER(name) LIKE ? {repo_clause}
        ORDER BY prio ASC, CASE kind WHEN 'route' THEN 0 WHEN 'class' THEN 1 WHEN 'func' THEN 2 WHEN 'action' THEN 3 ELSE 4 END, start_line ASC
        LIMIT ?
        """,
        [*params, limit],
    ).fetchall()
    return [dict(r) for r in rows]


def read_numbered_slice(abs_path: str | Path, start_line: int, end_line: int, max_lines: int = 80) -> str:
    p = Path(abs_path)
    if not p.is_file():
        return ""
    lines = p.read_text(encoding="utf-8", errors="ignore").splitlines()
    s = max(1, int(start_line))
    e = min(len(lines), int(end_line), s + max(1, int(max_lines)) - 1)
    width = len(str(e))
    rendered = [f"{ln:>{width}}: {lines[ln - 1]}" for ln in range(s, e + 1)]
    if e < min(len(lines), int(end_line)):
        rendered.append(f"... ({int(end_line) - e} more lines in block L{start_line}-L{end_line})")
    return "\n".join(rendered)


def file_outline(conn: sqlite3.Connection, file_arg: str, *, full: bool = False) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    p = Path(file_arg)
    if p.is_absolute():
        f_row = conn.execute("SELECT * FROM files_meta WHERE abs_path = ?", (str(p.resolve()),)).fetchone()
    else:
        rel = file_arg.lstrip("./")
        f_row = conn.execute("SELECT * FROM files_meta WHERE repo = ? AND rel_path = ?", (ROOT_DIR.name, rel)).fetchone()
        if not f_row:
            f_row = conn.execute("SELECT * FROM files_meta WHERE rel_path LIKE ?", (f"%{rel}",)).fetchone()

    if not f_row:
        return None, []
    syms = conn.execute(
        "SELECT * FROM symbols WHERE file_id = ? ORDER BY start_line ASC",
        (int(f_row["id"]),),
    ).fetchall()
    rows = [dict(s) for s in syms]
    if not full and int(f_row["line_count"]) > 300:
        compact = [
            s for s in rows
            if s["kind"] != "action" and (s["kind"] != "func" or (int(s["end_line"]) - int(s["start_line"]) >= 4))
        ]
        if compact:
            rows = compact
    return dict(f_row), rows


def list_routes(conn: sqlite3.Connection, *, all_repos: bool = False, substr: str | None = None) -> list[dict[str, Any]]:
    filters = ["kind = 'route'", "is_bank = 0"]
    params: list[Any] = []
    if not all_repos:
        filters.append("repo = ?")
        params.append(ROOT_DIR.name)
    if substr:
        filters.append("(LOWER(name) LIKE ? OR LOWER(signature) LIKE ?)")
        params.extend([f"%{substr.lower()}%", f"%{substr.lower()}%"])
    rows = conn.execute(
        f"SELECT * FROM symbols WHERE {' AND '.join(filters)} ORDER BY repo ASC, rel_path ASC, start_line ASC",
        params,
    ).fetchall()
    return [dict(r) for r in rows]


def list_actions(conn: sqlite3.Connection, *, substr: str | None = None) -> list[dict[str, Any]]:
    filters = ["kind = 'action'", "repo = ?", "is_bank = 0"]
    params: list[Any] = [ROOT_DIR.name]
    if substr:
        filters.append("LOWER(name) LIKE ?")
        params.append(f"%{substr.lower()}%")
    rows = conn.execute(
        f"SELECT * FROM symbols WHERE {' AND '.join(filters)} ORDER BY rel_path ASC, start_line ASC",
        params,
    ).fetchall()
    return [dict(r) for r in rows]


def read_doc_topic(topic: str | None = None, *, section: str | None = None) -> tuple[bool, str]:
    if not topic:
        topics = sorted(set(str(p.relative_to(ROOT_DIR)) for p in (ROOT_DIR / "docs" / "context").glob("*.md")))
        return True, "Available docs/context shards:\n" + "\n".join(f"- {t}" for t in topics)

    key = topic.strip().lower()
    target = DOC_TOPICS.get(key)
    if not target:
        cand = ROOT_DIR / "docs" / "context" / f"{key}.md"
        if cand.is_file():
            target = cand
    if not target or not target.is_file():
        return False, f"Unknown doc topic '{topic}'. Available: {', '.join(sorted(DOC_TOPICS.keys()))}"

    text = target.read_text(encoding="utf-8")
    if not section:
        return True, text

    sec_q = section.strip().lower()
    lines = text.splitlines()
    blocks = extract_md_symbols(text, str(target.relative_to(ROOT_DIR)))
    matches = [b for b in blocks if sec_q in b.name.lower()]
    if not matches:
        return False, f"No heading matching '{section}' inside {target.relative_to(ROOT_DIR)}."
    rendered = ["\n".join(lines[m.start_line - 1 : m.end_line]) for m in matches]
    return True, "\n\n---\n\n".join(rendered)


def compute_stats(conn: sqlite3.Connection, *, all_repos: bool = False) -> dict[str, Any]:
    gemini_bytes = (ROOT_DIR / "GEMINI.md").stat().st_size if (ROOT_DIR / "GEMINI.md").is_file() else 0
    saved_bytes = max(0, LEGACY_GEMINI_BYTES - gemini_bytes)
    saved_pct = round((saved_bytes / LEGACY_GEMINI_BYTES) * 100, 2) if LEGACY_GEMINI_BYTES else 0.0

    where_parts = ["is_bank = 0"]
    params: list[Any] = []
    if not all_repos:
        where_parts.append("repo = ?")
        params.append(ROOT_DIR.name)
    repo_where = "WHERE " + " AND ".join(where_parts)
    f_where = "WHERE f.is_bank = 0" + ("" if all_repos else " AND f.repo = ?")
    files_cnt = int(conn.execute(f"SELECT COUNT(*) FROM files_meta {repo_where}", params).fetchone()[0])
    total_sym = int(conn.execute(f"SELECT COUNT(*) FROM symbols {repo_where}", params).fetchone()[0])

    by_kind = {
        r["kind"]: int(r["cnt"])
        for r in conn.execute(
            f"SELECT kind, COUNT(*) AS cnt FROM symbols {repo_where} GROUP BY kind ORDER BY cnt DESC",
            params,
        ).fetchall()
    }
    by_repo = {
        r["repo"]: int(r["cnt"])
        for r in conn.execute(
            f"SELECT repo, COUNT(*) AS cnt FROM files_meta {repo_where} GROUP BY repo ORDER BY cnt DESC",
            params,
        ).fetchall()
    }
    largest = conn.execute(
        f"""
        SELECT f.id, f.repo, f.rel_path, f.size_bytes, f.line_count,
               (SELECT COUNT(*) FROM symbols s WHERE s.file_id = f.id) AS sym_cnt
        FROM files_meta f
        {f_where}
        ORDER BY f.size_bytes DESC
        LIMIT 5
        """,
        params,
    ).fetchall()

    top_files = []
    for r in largest:
        raw_est_tok = max(1, round(int(r["size_bytes"]) / 4))
        outline_est_tok = max(1, int(r["sym_cnt"]) * 14)
        top_files.append(
            {
                "path": _display_path(r),
                "lines": int(r["line_count"]),
                "symbols": int(r["sym_cnt"]),
                "rawTokensEst": raw_est_tok,
                "outlineTokensEst": outline_est_tok,
            }
        )

    return {
        "geminiBytes": gemini_bytes,
        "legacyGeminiBytes": LEGACY_GEMINI_BYTES,
        "geminiRuleSavingsPct": saved_pct,
        "legacyRuleTokensEst": round(LEGACY_GEMINI_BYTES / 4),
        "currentRuleTokensEst": round(gemini_bytes / 4),
        "indexedFiles": files_cnt,
        "indexedSymbols": total_sym,
        "byKind": by_kind,
        "byRepo": by_repo,
        "topLargestFiles": top_files,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Vektor EGE Context & Code Search Engine (zero-dependency SQLite FTS5)")
    parser.add_argument("--db", default=str(DEFAULT_DB_PATH), help="Path to SQLite FTS5 index file")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_idx = sub.add_parser("index", help="Build or incrementally update the index")
    p_idx.add_argument("--all-repos", action="store_true")
    p_idx.add_argument("--include-bank", action="store_true")
    p_idx.add_argument("--rebuild", action="store_true")

    p_search = sub.add_parser("search", help="BM25 + exact symbol/path search")
    p_search.add_argument("query")
    p_search.add_argument("--kind", choices=["func", "class", "route", "action", "css", "sql", "doc"])
    p_search.add_argument("--module", help="Filter by path substring")
    p_search.add_argument("--repo", help="Filter by repository name")
    p_search.add_argument("--all-repos", action="store_true")
    p_search.add_argument("--include-bank", action="store_true")
    p_search.add_argument("--limit", type=int, default=12)

    p_sym = sub.add_parser("symbol", help="Locate exact symbol/route/action line range or print code slice")
    p_sym.add_argument("name")
    p_sym.add_argument("--slice", action="store_true")
    p_sym.add_argument("--max-lines", type=int, default=80)
    p_sym.add_argument("--all-repos", action="store_true")

    p_out = sub.add_parser("outline", help="Print structural outline of a file")
    p_out.add_argument("file_path")
    p_out.add_argument("--full", action="store_true", help="Include single-line helpers and per-action entries")

    p_routes = sub.add_parser("routes", help="List FastAPI routes")
    p_routes.add_argument("substr", nargs="?")
    p_routes.add_argument("--all-repos", action="store_true")

    p_acts = sub.add_parser("actions", help="List SPA ACTIONS / handleAction handlers")
    p_acts.add_argument("substr", nargs="?")

    p_doc = sub.add_parser("doc", help="Read a single docs/context/<topic>.md shard or section")
    p_doc.add_argument("topic", nargs="?")
    p_doc.add_argument("--section")

    p_stats = sub.add_parser("stats", help="Print token economy and index statistics")
    p_stats.add_argument("--all-repos", action="store_true")
    p_stats.add_argument("--json", action="store_true")

    args = parser.parse_args(argv)

    if args.cmd == "doc":
        ok, text = read_doc_topic(args.topic, section=args.section)
        print(text)
        return 0 if ok else 1

    conn = open_db(Path(args.db))
    try:
        if args.cmd == "index":
            res = sync_index(conn, all_repos=args.all_repos, include_bank=args.include_bank, rebuild=args.rebuild)
            print(f"INDEX_OK files={res['totalFiles']} symbols={res['totalSymbols']} reindexed={res['reindexedFiles']} ({res['elapsedMs']} ms)")
            return 0

        if args.cmd == "search":
            sync_index(conn, all_repos=bool(args.all_repos or args.repo), include_bank=bool(args.include_bank), repo_filter=args.repo)
            hits = search_symbols(
                conn,
                args.query,
                kind=args.kind,
                module=args.module,
                repo=args.repo,
                all_repos=bool(args.all_repos or args.repo),
                include_bank=bool(args.include_bank),
                limit=args.limit,
            )
            if not hits:
                print(f"No matches for: {args.query}")
                return 0
            for h in hits:
                print(f"[{h['kind']}] {_display_path(h)}:{h['start_line']}-{h['end_line']}  {h['signature']}")
            return 0

        if args.cmd == "symbol":
            sync_index(conn, all_repos=bool(args.all_repos))
            hits = find_symbol_slices(conn, args.name, all_repos=bool(args.all_repos))
            if not hits:
                print(f"Symbol not found: {args.name}")
                return 1
            for idx, h in enumerate(hits):
                print(f"[{h['kind']}] {_display_path(h)}:{h['start_line']}-{h['end_line']}  {h['signature']}")
                if args.slice and idx == 0:
                    print(read_numbered_slice(h["abs_path"], int(h["start_line"]), int(h["end_line"]), max_lines=args.max_lines))
            return 0

        if args.cmd == "outline":
            sync_index(conn, all_repos=True)
            f_meta, syms = file_outline(conn, args.file_path, full=bool(args.full))
            if not f_meta:
                print(f"File not indexed: {args.file_path}")
                return 1
            print(f"OUTLINE {_display_path(f_meta)} ({f_meta['line_count']} lines, {f_meta['size_bytes']} bytes, {len(syms)} symbols)")
            for s in syms:
                print(f"L{s['start_line']}-{s['end_line']} [{s['kind']}] {s['signature']}")
            return 0

        if args.cmd == "routes":
            sync_index(conn, all_repos=bool(args.all_repos))
            rows = list_routes(conn, all_repos=bool(args.all_repos), substr=args.substr)
            for r in rows:
                print(f"{r['signature']}  ->  {_display_path(r)}:{r['start_line']}-{r['end_line']}")
            return 0

        if args.cmd == "actions":
            sync_index(conn, all_repos=False)
            rows = list_actions(conn, substr=args.substr)
            for r in rows:
                print(f"{r['name']}  ->  {r['rel_path']}:{r['start_line']}-{r['end_line']}")
            return 0

        if args.cmd == "stats":
            sync_index(conn, all_repos=bool(args.all_repos))
            st = compute_stats(conn, all_repos=bool(args.all_repos))
            if args.json:
                import json

                print(json.dumps(st, ensure_ascii=False, indent=2))
            else:
                print(
                    f"Rule context (GEMINI.md): {st['geminiBytes']} B (~{st['currentRuleTokensEst']} tok/turn) "
                    f"vs legacy {st['legacyGeminiBytes']} B (~{st['legacyRuleTokensEst']} tok/turn) -> {st['geminiRuleSavingsPct']}% saved"
                )
                print(f"Indexed: {st['indexedFiles']} files, {st['indexedSymbols']} symbols across {len(st['byRepo'])} repo(s)")
                print("By kind: " + ", ".join(f"{k}={v}" for k, v in st["byKind"].items()))
                print("By repo: " + ", ".join(f"{k}={v}" for k, v in st["byRepo"].items()))
                print("Largest files (raw est tokens vs outline est tokens):")
                for tf in st["topLargestFiles"]:
                    print(f"  - {tf['path']} ({tf['lines']} lines): ~{tf['rawTokensEst']} raw tok -> ~{tf['outlineTokensEst']} outline tok ({tf['symbols']} symbols)")
            return 0
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
