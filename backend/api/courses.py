"""Headless API для курсов: безопасная песочница проверки решений на Python (ОГЭ и ЕГЭ по информатике)."""

from __future__ import annotations

import ast
import asyncio
import base64
import signal
import subprocess
import sys
import tempfile
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..config import Settings
from .auth_docs import RateLimiter, client_ip

ALLOWED_IMPORTS: frozenset[str] = frozenset(
    {
        "math",
        "itertools",
        "functools",
        "collections",
        "string",
        "re",
        "bisect",
        "heapq",
        "fractions",
        "decimal",
        "statistics",
        "random",
        "operator",
    }
)

FORBIDDEN_CALLS: frozenset[str] = frozenset(
    {
        "open",
        "exec",
        "eval",
        "compile",
        "__import__",
        "getattr",
        "setattr",
        "delattr",
        "globals",
        "locals",
        "vars",
        "dir",
        "breakpoint",
        "help",
        "memoryview",
        "type",
        "object",
    }
)

_RUNNER_WRAPPER = """
import base64
import builtins
import sys

try:
    import resource
    resource.setrlimit(resource.RLIMIT_CPU, (3, 4))
except Exception:
    pass

ALLOWED = set(sys.argv[2].split(",")) if len(sys.argv) > 2 and sys.argv[2] else set()
ORIG_IMPORT = builtins.__import__

def _safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    root = str(name or "").split(".")[0]
    if level != 0 or root not in ALLOWED:
        raise ImportError(f"Модуль '{root}' запрещён в учебной песочнице")
    return ORIG_IMPORT(name, globals, locals, fromlist, level)

SAFE_BUILTINS = {
    "__import__": _safe_import,
    "abs": abs,
    "all": all,
    "any": any,
    "ascii": ascii,
    "bin": bin,
    "bool": bool,
    "bytearray": bytearray,
    "bytes": bytes,
    "callable": callable,
    "chr": chr,
    "complex": complex,
    "dict": dict,
    "divmod": divmod,
    "enumerate": enumerate,
    "filter": filter,
    "float": float,
    "format": format,
    "frozenset": frozenset,
    "hash": hash,
    "hex": hex,
    "input": input,
    "int": int,
    "isinstance": isinstance,
    "issubclass": issubclass,
    "iter": iter,
    "len": len,
    "list": list,
    "map": map,
    "max": max,
    "min": min,
    "next": next,
    "oct": oct,
    "ord": ord,
    "pow": pow,
    "print": print,
    "range": range,
    "repr": repr,
    "reversed": reversed,
    "round": round,
    "set": set,
    "slice": slice,
    "sorted": sorted,
    "str": str,
    "sum": sum,
    "tuple": tuple,
    "zip": zip,
    "Exception": Exception,
    "ValueError": ValueError,
    "TypeError": TypeError,
    "KeyError": KeyError,
    "IndexError": IndexError,
    "ZeroDivisionError": ZeroDivisionError,
    "RuntimeError": RuntimeError,
    "AssertionError": AssertionError,
    "StopIteration": StopIteration,
    "LookupError": LookupError,
    "ArithmeticError": ArithmeticError,
}

src = base64.b64decode(sys.argv[1]).decode("utf-8")
ns = {"__name__": "__main__", "__builtins__": SAFE_BUILTINS}
exec(compile(src, "<solution>", "exec"), ns)
""".strip()


class PythonTestCase(BaseModel):
    stdin: str = Field(default="", max_length=4096)
    expected: str = Field(default="", max_length=4096)
    hidden: bool = False


class RunPythonRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=8000)
    tests: list[PythonTestCase] = Field(..., min_length=1, max_length=12)


def validate_python_ast(code: str) -> str | None:
    """Проверяет синтаксис и запрещённые конструкции в Python-коде ученика."""
    try:
        tree = ast.parse(code, mode="exec")
    except SyntaxError as exc:
        line = exc.lineno or 1
        msg = exc.msg or "syntax error"
        return f"Синтаксическая ошибка в строке {line}: {msg}"

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root_mod = alias.name.split(".")[0]
                if root_mod not in ALLOWED_IMPORTS:
                    return f"Импорт модуля «{root_mod}» запрещён в учебной песочнице."
        elif isinstance(node, ast.ImportFrom):
            root_mod = (node.module or "").split(".")[0]
            if node.level != 0 or root_mod not in ALLOWED_IMPORTS:
                return f"Импорт из «{node.module or '.'}» запрещён в учебной песочнице."
        elif isinstance(node, ast.Attribute):
            if node.attr.startswith("__"):
                return f"Служебный атрибут «{node.attr}» запрещён в учебной песочнице."
        elif isinstance(node, ast.Name):
            if node.id.startswith("__") and node.id != "__name__":
                return f"Служебное имя «{node.id}» запрещено в учебной песочнице."
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id in FORBIDDEN_CALLS:
                return f"Функция «{node.func.id}» запрещена в учебной песочнице."
    return None


def _run_one_test(code_b64: str, allowed_csv: str, tc: PythonTestCase, index: int, workdir: str) -> dict[str, Any]:
    t0 = time.monotonic()
    err_msg: str | None = None
    actual = ""
    passed = False

    try:
        proc = subprocess.run(
            [sys.executable, "-I", "-c", _RUNNER_WRAPPER, code_b64, allowed_csv],
            input=tc.stdin,
            capture_output=True,
            text=True,
            timeout=2.0,
            cwd=workdir,
            env={"PYTHONIOENCODING": "utf-8"},
            check=False,
        )
        stdout = (proc.stdout or "")[:8192]
        stderr = (proc.stderr or "")[:8192]
        if proc.returncode != 0:
            sigxcpu = getattr(signal, "SIGXCPU", None)
            sigkill = getattr(signal, "SIGKILL", None)
            last_line = [ln.strip() for ln in stderr.splitlines() if ln.strip()]
            if (sigxcpu and proc.returncode == -sigxcpu) or (
                sigkill and proc.returncode == -sigkill and not last_line and (time.monotonic() - t0) >= 1.8
            ):
                err_msg = "Превышен лимит времени (2 сек)"
            else:
                err_msg = last_line[-1] if last_line else f"Ошибка выполнения (код {proc.returncode})"
        else:
            actual = stdout.replace("\r\n", "\n").strip()
            expected_norm = tc.expected.replace("\r\n", "\n").strip()
            passed = actual == expected_norm
    except subprocess.TimeoutExpired:
        err_msg = "Превышен лимит времени (2 сек)"

    elapsed_ms = max(1, int(round((time.monotonic() - t0) * 1000)))
    return {
        "index": index,
        "hidden": bool(tc.hidden),
        "passed": passed,
        "timeMs": elapsed_ms,
        "stdin": None if tc.hidden else tc.stdin,
        "expected": None if tc.hidden else tc.expected,
        "actual": None if tc.hidden else actual,
        "error": err_msg,
    }


def _execute_python_suite(code: str, tests: list[PythonTestCase]) -> dict[str, Any]:
    ast_err = validate_python_ast(code)
    if ast_err:
        return {
            "ok": False,
            "passed": 0,
            "total": len(tests),
            "error": ast_err,
            "results": [],
        }

    code_b64 = base64.b64encode(code.encode("utf-8")).decode("ascii")
    allowed_csv = ",".join(sorted(ALLOWED_IMPORTS))
    results: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="vektor_py_") as tmpdir:
        for idx, tc in enumerate(tests, start=1):
            results.append(_run_one_test(code_b64, allowed_csv, tc, idx, tmpdir))

    passed_count = sum(1 for r in results if r["passed"])
    return {
        "ok": passed_count == len(tests) and len(tests) > 0,
        "passed": passed_count,
        "total": len(tests),
        "error": None,
        "results": results,
    }


def create_courses_router(settings: Settings) -> APIRouter:
    router = APIRouter()

    @router.post("/api/courses/run-python")
    async def run_python_code(request: Request, body: RunPythonRequest) -> dict[str, Any]:
        limiter = getattr(request.app.state, "limiter", None)
        if limiter is None:
            limiter = RateLimiter(db_getter=lambda: getattr(request.app.state, "db", None))
            request.app.state.limiter = limiter
        limiter.check(f"courses:py:{client_ip(request)}", limit=20, window_sec=60)

        code = body.code.strip("\ufeff")
        if not code.strip():
            raise HTTPException(
                status_code=400,
                detail={"code": "empty_code", "message": "Введите код на Python перед запуском."},
            )
        return await asyncio.to_thread(_execute_python_suite, code, body.tests)

    return router
