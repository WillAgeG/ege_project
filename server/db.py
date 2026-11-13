"""SQLite-хранилище пользователей, сессий и документов прогресса."""

from dataclasses import dataclass
import hashlib
import hmac
import json
from pathlib import Path
import re
import secrets
import sqlite3
import threading
import time
from typing import Any

DOC_NAME_RE = re.compile(r"^(profile|plan|mocks|essays|prog-[a-z]+|log-\d{4}-\d{2})$")
USERNAME_RE = re.compile(r"^[0-9A-Za-zА-Яа-яЁё_.\-]{2,32}$")


class StorageError(Exception):
    def __init__(self, code: str, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=16384,
        r=8,
        p=1,
        maxmem=32 * 1024 * 1024,
        dklen=32,
    )
    return f"scrypt${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt_hex, dk_hex = stored.split("$", 2)
        if scheme != "scrypt":
            return False
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(dk_hex)
    except (ValueError, TypeError):
        return False
    actual = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=16384,
        r=8,
        p=1,
        maxmem=32 * 1024 * 1024,
        dklen=32,
    )
    return hmac.compare_digest(actual, expected)


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def deep_merge(target: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    """Сливает patch в target аналогично app.js, удаляя ключи со значением None."""
    out = dict(target) if isinstance(target, dict) else {}
    for key, value in (patch or {}).items():
        if value is None:
            out.pop(key, None)
        elif isinstance(value, dict):
            nested = out.get(key)
            out[key] = deep_merge(nested if isinstance(nested, dict) else {}, value)
        else:
            out[key] = value
    return out


def validate_username(raw: str) -> str:
    username = (raw or "").strip()
    if not USERNAME_RE.match(username):
        raise StorageError(
            "invalid_username",
            "Логин должен быть от 2 до 32 символов (буквы, цифры, _, ., -).",
            400,
        )
    return username


def validate_password(password: str) -> str:
    if not isinstance(password, str) or len(password) < 6 or len(password) > 128:
        raise StorageError(
            "invalid_password",
            "Пароль должен быть от 6 до 128 символов.",
            400,
        )
    return password


def validate_doc_name(name: str) -> str:
    if not DOC_NAME_RE.match(name or ""):
        raise StorageError("invalid_doc", "Недопустимое имя документа.", 400)
    return name


@dataclass(frozen=True)
class User:
    id: int
    username: str


class Database:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL;")
            self._conn.execute("PRAGMA synchronous=NORMAL;")
            self._conn.execute("PRAGMA foreign_keys=ON;")
            self._conn.execute("PRAGMA busy_timeout=5000;")
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    username_lower TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
                CREATE TABLE IF NOT EXISTS docs (
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    data TEXT NOT NULL,
                    updated_at INTEGER NOT NULL,
                    PRIMARY KEY (user_id, name)
                );
                """
            )
            self._conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (int(time.time()),))
            self._conn.commit()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def ping(self) -> None:
        with self._lock:
            self._conn.execute("SELECT 1").fetchone()

    def create_user(self, raw_username: str, raw_password: str, max_users: int = 0) -> User:
        username = validate_username(raw_username)
        password = validate_password(raw_password)
        pw_hash = hash_password(password)
        now = int(time.time())
        with self._lock:
            if max_users > 0:
                count = self._conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
                if count >= max_users:
                    raise StorageError(
                        "user_limit",
                        "Достигнут лимит регистраций на этом сервере.",
                        403,
                    )
            exists = self._conn.execute(
                "SELECT 1 FROM users WHERE username_lower = ?",
                (username.lower(),),
            ).fetchone()
            if exists:
                raise StorageError("username_taken", "Такой логин уже занят.", 409)
            cur = self._conn.execute(
                "INSERT INTO users (username, username_lower, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (username, username.lower(), pw_hash, now),
            )
            self._conn.commit()
            return User(id=int(cur.lastrowid), username=username)

    def authenticate(self, raw_username: str, raw_password: str) -> User | None:
        username = (raw_username or "").strip()
        if not username or not isinstance(raw_password, str):
            return None
        with self._lock:
            row = self._conn.execute(
                "SELECT id, username, password_hash FROM users WHERE username_lower = ?",
                (username.lower(),),
            ).fetchone()
        if not row or not verify_password(raw_password, row["password_hash"]):
            return None
        return User(id=int(row["id"]), username=str(row["username"]))

    def create_session(self, user_id: int, ttl_sec: int) -> str:
        raw_token = secrets.token_urlsafe(32)
        now = int(time.time())
        with self._lock:
            self._conn.execute(
                "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                (hash_token(raw_token), user_id, now, now + ttl_sec),
            )
            self._conn.commit()
        return raw_token

    def get_user_by_token(self, raw_token: str | None) -> User | None:
        if not raw_token:
            return None
        th = hash_token(raw_token)
        now = int(time.time())
        with self._lock:
            row = self._conn.execute(
                """
                SELECT u.id, u.username, s.expires_at
                FROM sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token_hash = ?
                """,
                (th,),
            ).fetchone()
            if not row:
                return None
            if int(row["expires_at"]) <= now:
                self._conn.execute("DELETE FROM sessions WHERE token_hash = ?", (th,))
                self._conn.commit()
                return None
            return User(id=int(row["id"]), username=str(row["username"]))

    def delete_session(self, raw_token: str | None) -> None:
        if not raw_token:
            return
        with self._lock:
            self._conn.execute("DELETE FROM sessions WHERE token_hash = ?", (hash_token(raw_token),))
            self._conn.commit()

    def get_docs(self, user_id: int) -> dict[str, dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT name, data FROM docs WHERE user_id = ?",
                (user_id,),
            ).fetchall()
        out: dict[str, dict[str, Any]] = {}
        for row in rows:
            try:
                parsed = json.loads(row["data"])
                if isinstance(parsed, dict):
                    out[str(row["name"])] = parsed
            except json.JSONDecodeError:
                continue
        return out

    def _serialize_checked(self, data: dict[str, Any], max_bytes: int) -> str:
        encoded = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        if len(encoded.encode("utf-8")) > max_bytes:
            raise StorageError("quota_exceeded", "Документ слишком большой.", 413)
        return encoded

    def patch_doc(self, user_id: int, name: str, patch: dict[str, Any], max_bytes: int) -> None:
        validate_doc_name(name)
        if not isinstance(patch, dict):
            raise StorageError("invalid_body", "Ожидался JSON-объект.", 400)
        now = int(time.time())
        with self._lock:
            row = self._conn.execute(
                "SELECT data FROM docs WHERE user_id = ? AND name = ?",
                (user_id, name),
            ).fetchone()
            current = json.loads(row["data"]) if row else {}
            if not isinstance(current, dict):
                current = {}
            merged = deep_merge(current, patch)
            encoded = self._serialize_checked(merged, max_bytes)
            self._conn.execute(
                """
                INSERT INTO docs (user_id, name, data, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, name) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
                """,
                (user_id, name, encoded, now),
            )
            self._conn.commit()

    def replace_doc(self, user_id: int, name: str, data: dict[str, Any], max_bytes: int) -> None:
        validate_doc_name(name)
        if not isinstance(data, dict):
            raise StorageError("invalid_body", "Ожидался JSON-объект.", 400)
        encoded = self._serialize_checked(data, max_bytes)
        now = int(time.time())
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO docs (user_id, name, data, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, name) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
                """,
                (user_id, name, encoded, now),
            )
            self._conn.commit()
