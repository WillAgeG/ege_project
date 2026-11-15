"""SQLite-хранилище пользователей, сессий и документов прогресса."""

from dataclasses import dataclass
from datetime import datetime, timezone
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

DOC_NAME_RE = re.compile(r"^(profile|plan|mocks|essays|tutor-cabinet|calendar-sync|prog-[a-z]+|log-\d{4}-\d{2})$")
USERNAME_RE = re.compile(r"^[0-9A-Za-zА-Яа-яЁё_.\-]{2,32}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _iso_utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _normalize_tz(raw: str | None) -> str:
    val = (raw or "").strip()
    if val in ("UTC+3", "Europe/Moscow", "Москва"):
        return "UTC+3"
    return "UTC+9"


def _normalize_dow(raw: Any, slot_date: str) -> int:
    try:
        d = int(raw)
        if 0 <= d <= 6:
            return d
    except (TypeError, ValueError):
        pass
    try:
        dt = datetime.strptime(slot_date[:10], "%Y-%m-%d")
        # Python weekday(): Mon=0..Sun=6 -> JS getDay(): Sun=0, Mon=1..Sat=6
        return (dt.weekday() + 1) % 7
    except ValueError:
        return 1


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


def validate_email(raw: str | None) -> str | None:
    email = (raw or "").strip()
    if not email:
        return None
    if len(email) > 254 or not EMAIL_RE.match(email):
        raise StorageError("invalid_email", "Укажи корректный email.", 400)
    return email


def validate_display_name(raw: str | None) -> str:
    return re.sub(r"\s+", " ", (raw or "").strip())[:40]


@dataclass(frozen=True)
class User:
    id: int
    username: str
    display_name: str = ""
    email: str | None = None
    avatar_url: str | None = None
    auth_provider: str = "local"


def _row_to_user(row: sqlite3.Row) -> User:
    keys = set(row.keys())
    return User(
        id=int(row["id"]),
        username=str(row["username"]),
        display_name=str(row["display_name"] or "") if "display_name" in keys else "",
        email=row["email"] if "email" in keys else None,
        avatar_url=row["avatar_url"] if "avatar_url" in keys else None,
        auth_provider=str(row["auth_provider"] or "local") if "auth_provider" in keys else "local",
    )


class Database:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        now = int(time.time())
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
                    password_hash TEXT NOT NULL DEFAULT '',
                    display_name TEXT NOT NULL DEFAULT '',
                    email TEXT,
                    email_lower TEXT,
                    avatar_url TEXT,
                    auth_provider TEXT NOT NULL DEFAULT 'local',
                    created_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS user_identities (
                    provider TEXT NOT NULL,
                    provider_subject TEXT NOT NULL,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    email TEXT,
                    created_at INTEGER NOT NULL,
                    PRIMARY KEY (provider, provider_subject)
                );
                CREATE INDEX IF NOT EXISTS idx_identities_user ON user_identities(user_id);
                CREATE TABLE IF NOT EXISTS oauth_states (
                    state_hash TEXT PRIMARY KEY,
                    provider TEXT NOT NULL,
                    code_verifier TEXT NOT NULL,
                    redirect_uri TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL
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
                CREATE TABLE IF NOT EXISTS calendar_sync_tokens (
                    feed_token TEXT PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    tutor_slug TEXT NOT NULL UNIQUE,
                    tutor_name TEXT NOT NULL DEFAULT 'Преподаватель Вектор ЕГЭ',
                    city TEXT NOT NULL DEFAULT 'Якутск',
                    timezone TEXT NOT NULL DEFAULT 'UTC+9' CHECK (timezone IN ('UTC+9', 'UTC+3')),
                    external_ics_url TEXT,
                    gcal_connected INTEGER NOT NULL DEFAULT 0,
                    open_slots TEXT NOT NULL DEFAULT '{}',
                    busy_slots TEXT NOT NULL DEFAULT '[]',
                    last_synced_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS calendar_events (
                    uid TEXT PRIMARY KEY,
                    tutor_slug TEXT NOT NULL,
                    student_name TEXT NOT NULL DEFAULT '',
                    subject TEXT NOT NULL DEFAULT 'bio',
                    exam TEXT NOT NULL DEFAULT 'ЕГЭ',
                    dow INTEGER NOT NULL CHECK (dow BETWEEN 0 AND 6),
                    slot_date TEXT NOT NULL,
                    hour_slot TEXT NOT NULL,
                    duration_min INTEGER NOT NULL DEFAULT 60,
                    timezone TEXT NOT NULL DEFAULT 'UTC+9',
                    price_rub INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted', 'pending', 'external_busy', 'cancelled')),
                    source TEXT NOT NULL DEFAULT 'vektor' CHECK (source IN ('vektor', 'gcal_ics', 'manual')),
                    note TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_calendar_events_tutor_date
                    ON calendar_events(tutor_slug, slot_date, hour_slot);
                CREATE TABLE IF NOT EXISTS realtime_notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_id TEXT NOT NULL UNIQUE,
                    channel TEXT NOT NULL DEFAULT 'tutor',
                    tutor_slug TEXT,
                    event_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    message TEXT NOT NULL DEFAULT '',
                    payload TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_realtime_notifications_channel_id
                    ON realtime_notifications(channel, id DESC);
                """
            )
            existing_cols = {
                str(r["name"]) for r in self._conn.execute("PRAGMA table_info(users)").fetchall()
            }
            migrations = (
                ("display_name", "TEXT NOT NULL DEFAULT ''"),
                ("email", "TEXT"),
                ("email_lower", "TEXT"),
                ("avatar_url", "TEXT"),
                ("auth_provider", "TEXT NOT NULL DEFAULT 'local'"),
            )
            for col_name, col_def in migrations:
                if col_name not in existing_cols:
                    self._conn.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_def}")
            self._conn.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower
                ON users(email_lower)
                WHERE email_lower IS NOT NULL AND email_lower != ''
                """
            )
            self._conn.execute(
                """
                INSERT OR IGNORE INTO user_identities (provider, provider_subject, user_id, email, created_at)
                SELECT 'local', username_lower, id, email, created_at FROM users WHERE password_hash != ''
                """
            )
            self._conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
            self._conn.execute("DELETE FROM oauth_states WHERE expires_at <= ?", (now,))
            self._conn.commit()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def ping(self) -> None:
        with self._lock:
            self._conn.execute("SELECT 1").fetchone()

    def create_user(
        self,
        raw_username: str,
        raw_password: str,
        *,
        email: str | None = None,
        display_name: str = "",
        max_users: int = 0,
    ) -> User:
        username = validate_username(raw_username)
        password = validate_password(raw_password)
        clean_email = validate_email(email)
        clean_display = validate_display_name(display_name)
        email_lower = clean_email.lower() if clean_email else None
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
            if email_lower:
                email_exists = self._conn.execute(
                    "SELECT 1 FROM users WHERE email_lower = ?",
                    (email_lower,),
                ).fetchone()
                if email_exists:
                    raise StorageError("email_taken", "Этот email уже зарегистрирован.", 409)
            cur = self._conn.execute(
                """
                INSERT INTO users (
                    username, username_lower, password_hash, display_name,
                    email, email_lower, avatar_url, auth_provider, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'local', ?)
                """,
                (username, username.lower(), pw_hash, clean_display, clean_email, email_lower, now),
            )
            uid = int(cur.lastrowid)
            self._conn.execute(
                "INSERT INTO user_identities (provider, provider_subject, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)",
                ("local", username.lower(), uid, clean_email, now),
            )
            self._conn.commit()
            return User(
                id=uid,
                username=username,
                display_name=clean_display,
                email=clean_email,
                avatar_url=None,
                auth_provider="local",
            )

    def authenticate(self, raw_login: str, raw_password: str) -> User | None:
        login_val = (raw_login or "").strip().lower()
        if not login_val or not isinstance(raw_password, str):
            return None
        with self._lock:
            row = self._conn.execute(
                """
                SELECT id, username, password_hash, display_name, email, avatar_url, auth_provider
                FROM users
                WHERE username_lower = ? OR (email_lower IS NOT NULL AND email_lower = ?)
                """,
                (login_val, login_val),
            ).fetchone()
        if not row or not verify_password(raw_password, row["password_hash"]):
            return None
        return _row_to_user(row)

    def create_oauth_state(
        self,
        provider: str,
        code_verifier: str,
        redirect_uri: str,
        ttl_sec: int = 600,
    ) -> str:
        raw_state = secrets.token_urlsafe(32)
        now = int(time.time())
        with self._lock:
            self._conn.execute("DELETE FROM oauth_states WHERE expires_at <= ?", (now,))
            self._conn.execute(
                """
                INSERT INTO oauth_states (state_hash, provider, code_verifier, redirect_uri, created_at, expires_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (hash_token(raw_state), provider, code_verifier, redirect_uri, now, now + ttl_sec),
            )
            self._conn.commit()
        return raw_state

    def consume_oauth_state(self, raw_state: str, provider: str) -> tuple[str, str] | None:
        if not raw_state:
            return None
        sh = hash_token(raw_state)
        now = int(time.time())
        with self._lock:
            row = self._conn.execute(
                "SELECT code_verifier, redirect_uri, expires_at FROM oauth_states WHERE state_hash = ? AND provider = ?",
                (sh, provider),
            ).fetchone()
            self._conn.execute("DELETE FROM oauth_states WHERE state_hash = ?", (sh,))
            self._conn.commit()
        if not row or int(row["expires_at"]) <= now:
            return None
        return str(row["code_verifier"]), str(row["redirect_uri"])

    def _generate_unique_username(self, hint: str) -> str:
        cleaned = re.sub(r"[^0-9A-Za-z_.\-]+", "_", (hint or "").strip()).strip("_.-")
        if len(cleaned) < 2:
            cleaned = "user"
        base = cleaned[:24]
        candidate = base
        for idx in range(0, 50):
            if idx > 0:
                suffix = f"_{idx}"
                candidate = base[: 32 - len(suffix)] + suffix
            row = self._conn.execute(
                "SELECT 1 FROM users WHERE username_lower = ?",
                (candidate.lower(),),
            ).fetchone()
            if not row:
                return candidate
        return f"{base[:20]}_{secrets.token_hex(3)}"

    def upsert_oauth_user(
        self,
        provider: str,
        subject: str,
        *,
        email: str | None = None,
        email_verified: bool = False,
        display_name: str = "",
        avatar_url: str | None = None,
        max_users: int = 0,
    ) -> User:
        clean_email = validate_email(email) if email else None
        email_lower = clean_email.lower() if clean_email else None
        clean_display = validate_display_name(display_name)
        clean_avatar = (avatar_url or "").strip()[:500] or None
        now = int(time.time())

        with self._lock:
            id_row = self._conn.execute(
                """
                SELECT u.id, u.username, u.display_name, u.email, u.avatar_url, u.auth_provider
                FROM user_identities ui
                JOIN users u ON u.id = ui.user_id
                WHERE ui.provider = ? AND ui.provider_subject = ?
                """,
                (provider, subject),
            ).fetchone()
            if id_row:
                uid = int(id_row["id"])
                next_display = clean_display or str(id_row["display_name"] or "")
                next_avatar = clean_avatar or id_row["avatar_url"]
                next_email = clean_email if (clean_email and email_verified) else id_row["email"]
                next_email_lower = next_email.lower() if next_email else None
                self._conn.execute(
                    "UPDATE users SET display_name = ?, avatar_url = ?, email = ?, email_lower = ? WHERE id = ?",
                    (next_display, next_avatar, next_email, next_email_lower, uid),
                )
                self._conn.commit()
                refreshed = self._conn.execute(
                    "SELECT id, username, display_name, email, avatar_url, auth_provider FROM users WHERE id = ?",
                    (uid,),
                ).fetchone()
                return _row_to_user(refreshed)

            if email_lower and email_verified:
                email_row = self._conn.execute(
                    "SELECT id, username, display_name, email, avatar_url, auth_provider FROM users WHERE email_lower = ?",
                    (email_lower,),
                ).fetchone()
                if email_row:
                    uid = int(email_row["id"])
                    next_display = str(email_row["display_name"] or "") or clean_display
                    next_avatar = email_row["avatar_url"] or clean_avatar
                    self._conn.execute(
                        "UPDATE users SET display_name = ?, avatar_url = ? WHERE id = ?",
                        (next_display, next_avatar, uid),
                    )
                    self._conn.execute(
                        "INSERT OR IGNORE INTO user_identities (provider, provider_subject, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)",
                        (provider, subject, uid, clean_email, now),
                    )
                    self._conn.commit()
                    refreshed = self._conn.execute(
                        "SELECT id, username, display_name, email, avatar_url, auth_provider FROM users WHERE id = ?",
                        (uid,),
                    ).fetchone()
                    return _row_to_user(refreshed)

            if max_users > 0:
                count = self._conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
                if count >= max_users:
                    raise StorageError(
                        "user_limit",
                        "Достигнут лимит регистраций на этом сервере.",
                        403,
                    )

            hint = (clean_email.split("@", 1)[0] if clean_email else "") or clean_display or "user"
            username = self._generate_unique_username(hint)
            stored_email = clean_email if email_verified else None
            stored_email_lower = email_lower if email_verified else None
            cur = self._conn.execute(
                """
                INSERT INTO users (
                    username, username_lower, password_hash, display_name,
                    email, email_lower, avatar_url, auth_provider, created_at
                ) VALUES (?, ?, '', ?, ?, ?, ?, ?, ?)
                """,
                (username, username.lower(), clean_display, stored_email, stored_email_lower, clean_avatar, provider, now),
            )
            uid = int(cur.lastrowid)
            self._conn.execute(
                "INSERT INTO user_identities (provider, provider_subject, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)",
                (provider, subject, uid, stored_email, now),
            )
            self._conn.commit()
            return User(
                id=uid,
                username=username,
                display_name=clean_display,
                email=stored_email,
                avatar_url=clean_avatar,
                auth_provider=provider,
            )

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
                SELECT u.id, u.username, u.display_name, u.email, u.avatar_url, u.auth_provider, s.expires_at
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
            return _row_to_user(row)

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

    def storage_health(self) -> dict[str, Any]:
        self.ping()
        return {
            "ok": True,
            "mode": "sqlite",
            "sqlite": "ok",
            "postgres": "disabled",
            "outboxPending": 0,
        }

    def _calendar_row_to_dict(self, row: sqlite3.Row) -> dict[str, Any]:
        tutor_slug = str(row["tutor_slug"])
        try:
            open_slots = json.loads(row["open_slots"])
            if not isinstance(open_slots, dict):
                open_slots = {}
        except (json.JSONDecodeError, TypeError):
            open_slots = {}
        try:
            busy_slots = json.loads(row["busy_slots"])
            if not isinstance(busy_slots, list):
                busy_slots = []
        except (json.JSONDecodeError, TypeError):
            busy_slots = []

        ev_rows = self._conn.execute(
            """
            SELECT uid, tutor_slug, student_name, subject, exam, dow, slot_date, hour_slot,
                   duration_min, timezone, price_rub, status, source, note
            FROM calendar_events
            WHERE tutor_slug = ? AND source != 'gcal_ics'
            ORDER BY slot_date ASC, hour_slot ASC, uid ASC
            """,
            (tutor_slug,),
        ).fetchall()
        events: list[dict[str, Any]] = [
            {
                "uid": str(r["uid"]),
                "tutorSlug": str(r["tutor_slug"]),
                "studentName": str(r["student_name"]),
                "subject": str(r["subject"]),
                "exam": str(r["exam"]),
                "dow": int(r["dow"]),
                "slotDate": str(r["slot_date"]),
                "hour": str(r["hour_slot"]),
                "durationMin": int(r["duration_min"]),
                "timezone": str(r["timezone"]),
                "priceRub": int(r["price_rub"]),
                "status": str(r["status"]),
                "source": str(r["source"]),
                "note": str(r["note"]),
            }
            for r in ev_rows
        ]
        return {
            "feedToken": str(row["feed_token"]),
            "tutorSlug": tutor_slug,
            "tutorName": str(row["tutor_name"]),
            "city": str(row["city"]),
            "timezone": str(row["timezone"]),
            "openSlots": open_slots,
            "busySlots": busy_slots,
            "events": events,
            "gcalConnected": bool(row["gcal_connected"]),
            "externalIcsUrl": row["external_ics_url"],
            "lastSyncedAt": str(row["last_synced_at"]),
        }

    def upsert_calendar_sync(
        self,
        *,
        tutor_slug: str,
        user_id: int | None = None,
        tutor_name: str = "Преподаватель Вектор ЕГЭ",
        city: str = "Якутск",
        timezone: str = "UTC+9",
        open_slots: dict[str, list[str]] | None = None,
        events: list[dict[str, Any]] | None = None,
        external_ics_url: str | None = None,
        gcal_connected: bool | None = None,
        busy_slots: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        slug = (tutor_slug or "").strip() or "default-tutor"
        tz = _normalize_tz(timezone)
        now_iso = _iso_utc_now()
        with self._lock:
            existing = self._conn.execute(
                "SELECT * FROM calendar_sync_tokens WHERE tutor_slug = ?",
                (slug,),
            ).fetchone()
            feed_token = str(existing["feed_token"]) if existing else secrets.token_urlsafe(24)
            eff_user_id = user_id if user_id is not None else (existing["user_id"] if existing else None)
            eff_name = (tutor_name or "").strip() or (str(existing["tutor_name"]) if existing else "Преподаватель Вектор ЕГЭ")
            eff_city = (city or "").strip() or (str(existing["city"]) if existing else ("Москва" if tz == "UTC+3" else "Якутск"))
            if open_slots is not None:
                eff_open_slots = open_slots
            elif existing:
                try:
                    eff_open_slots = json.loads(existing["open_slots"])
                except (json.JSONDecodeError, TypeError):
                    eff_open_slots = {}
            else:
                eff_open_slots = {}

            if busy_slots is not None:
                eff_busy_slots = busy_slots
            elif existing:
                try:
                    eff_busy_slots = json.loads(existing["busy_slots"])
                except (json.JSONDecodeError, TypeError):
                    eff_busy_slots = []
            else:
                eff_busy_slots = []

            if gcal_connected is not None:
                eff_gcal = 1 if gcal_connected else 0
            elif existing:
                eff_gcal = int(existing["gcal_connected"])
            else:
                eff_gcal = 0

            if external_ics_url is not None:
                eff_ext_url = external_ics_url.strip() or None
            elif existing:
                eff_ext_url = existing["external_ics_url"]
            else:
                eff_ext_url = None

            self._conn.execute(
                """
                INSERT INTO calendar_sync_tokens (
                    feed_token, user_id, tutor_slug, tutor_name, city, timezone,
                    external_ics_url, gcal_connected, open_slots, busy_slots,
                    last_synced_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(tutor_slug) DO UPDATE SET
                    user_id = excluded.user_id,
                    tutor_name = excluded.tutor_name,
                    city = excluded.city,
                    timezone = excluded.timezone,
                    external_ics_url = excluded.external_ics_url,
                    gcal_connected = excluded.gcal_connected,
                    open_slots = excluded.open_slots,
                    busy_slots = excluded.busy_slots,
                    last_synced_at = excluded.last_synced_at,
                    updated_at = excluded.updated_at
                """,
                (
                    feed_token,
                    eff_user_id,
                    slug,
                    eff_name,
                    eff_city,
                    tz,
                    eff_ext_url,
                    eff_gcal,
                    json.dumps(eff_open_slots, ensure_ascii=False),
                    json.dumps(eff_busy_slots, ensure_ascii=False),
                    now_iso,
                    now_iso,
                ),
            )

            if events is not None:
                self._conn.execute(
                    "DELETE FROM calendar_events WHERE tutor_slug = ? AND source = 'vektor'",
                    (slug,),
                )
                for idx, ev in enumerate(events):
                    slot_date = str(ev.get("slotDate") or ev.get("slot_date") or now_iso[:10])[:10]
                    hour_slot = str(ev.get("hour") or ev.get("hourSlot") or ev.get("hour_slot") or "16:00")[:5]
                    dow = _normalize_dow(ev.get("dow"), slot_date)
                    uid = str(ev.get("uid") or f"vektor:{slug}:{slot_date}:{hour_slot}:{idx}")
                    status = str(ev.get("status") or "accepted")
                    if status not in ("accepted", "pending", "external_busy", "cancelled"):
                        status = "accepted"
                    source = str(ev.get("source") or "vektor")
                    if source not in ("vektor", "gcal_ics", "manual"):
                        source = "vektor"
                    self._conn.execute(
                        """
                        INSERT INTO calendar_events (
                            uid, tutor_slug, student_name, subject, exam, dow, slot_date,
                            hour_slot, duration_min, timezone, price_rub, status, source, note, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(uid) DO UPDATE SET
                            tutor_slug = excluded.tutor_slug,
                            student_name = excluded.student_name,
                            subject = excluded.subject,
                            exam = excluded.exam,
                            dow = excluded.dow,
                            slot_date = excluded.slot_date,
                            hour_slot = excluded.hour_slot,
                            duration_min = excluded.duration_min,
                            timezone = excluded.timezone,
                            price_rub = excluded.price_rub,
                            status = excluded.status,
                            source = excluded.source,
                            note = excluded.note,
                            updated_at = excluded.updated_at
                        """,
                        (
                            uid,
                            slug,
                            str(ev.get("studentName") or ev.get("student_name") or ""),
                            str(ev.get("subject") or "bio"),
                            str(ev.get("exam") or "ЕГЭ"),
                            dow,
                            slot_date,
                            hour_slot,
                            int(ev.get("durationMin") or ev.get("duration_min") or 60),
                            _normalize_tz(ev.get("timezone") or tz),
                            int(ev.get("priceRub") or ev.get("price_rub") or 0),
                            status,
                            source,
                            str(ev.get("note") or ""),
                            now_iso,
                        ),
                    )

            if busy_slots is not None:
                self._conn.execute(
                    "DELETE FROM calendar_events WHERE tutor_slug = ? AND source = 'gcal_ics'",
                    (slug,),
                )
                for idx, bs in enumerate(busy_slots):
                    slot_date = str(bs.get("slotDate") or bs.get("slot_date") or now_iso[:10])[:10]
                    hour_slot = str(bs.get("hour") or bs.get("hourSlot") or bs.get("hour_slot") or "16:00")[:5]
                    dow = _normalize_dow(bs.get("dow"), slot_date)
                    raw_uid = str(bs.get("uid") or f"gcal-{idx}")
                    row_uid = f"gcal:{slug}:{raw_uid}:{slot_date}:{hour_slot}:{idx}"
                    summary = str(bs.get("summary") or "Занято (Google Calendar)")
                    self._conn.execute(
                        """
                        INSERT INTO calendar_events (
                            uid, tutor_slug, student_name, subject, exam, dow, slot_date,
                            hour_slot, duration_min, timezone, price_rub, status, source, note, updated_at
                        ) VALUES (?, ?, ?, 'bio', 'ЕГЭ', ?, ?, ?, 60, ?, 0, 'external_busy', 'gcal_ics', ?, ?)
                        ON CONFLICT(uid) DO UPDATE SET
                            dow = excluded.dow,
                            slot_date = excluded.slot_date,
                            hour_slot = excluded.hour_slot,
                            timezone = excluded.timezone,
                            note = excluded.note,
                            updated_at = excluded.updated_at
                        """,
                        (row_uid, slug, summary, dow, slot_date, hour_slot, tz, summary, now_iso),
                    )

            self._conn.commit()
            refreshed = self._conn.execute(
                "SELECT * FROM calendar_sync_tokens WHERE tutor_slug = ?",
                (slug,),
            ).fetchone()
            return self._calendar_row_to_dict(refreshed)

    def get_calendar_by_token(self, feed_token: str) -> dict[str, Any] | None:
        tok = (feed_token or "").strip()
        if not tok:
            return None
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM calendar_sync_tokens WHERE feed_token = ?",
                (tok,),
            ).fetchone()
            if not row:
                return None
            return self._calendar_row_to_dict(row)

    def get_calendar_by_slug(self, tutor_slug: str) -> dict[str, Any] | None:
        slug = (tutor_slug or "").strip()
        if not slug:
            return None
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM calendar_sync_tokens WHERE tutor_slug = ?",
                (slug,),
            ).fetchone()
            if not row:
                return None
            return self._calendar_row_to_dict(row)

    def _realtime_row_to_dict(self, row: sqlite3.Row) -> dict[str, Any]:
        try:
            payload = json.loads(row["payload"])
            if not isinstance(payload, dict):
                payload = {}
        except (json.JSONDecodeError, TypeError):
            payload = {}
        return {
            "id": int(row["id"]),
            "eventId": str(row["event_id"]),
            "channel": str(row["channel"]),
            "eventType": str(row["event_type"]),
            "title": str(row["title"]),
            "message": str(row["message"]),
            "tutorSlug": row["tutor_slug"],
            "payload": payload,
            "createdAt": str(row["created_at"]),
        }

    def record_realtime_event(
        self,
        *,
        event_id: str,
        channel: str,
        event_type: str,
        title: str,
        message: str = "",
        tutor_slug: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        eid = (event_id or "").strip() or secrets.token_hex(12)
        ch = (channel or "").strip() or "tutor"
        etype = (event_type or "").strip() or "system.event"
        ttl = (title or "").strip() or "Уведомление"
        msg = str(message or "")
        slug = (tutor_slug or "").strip() or None
        payload_json = json.dumps(payload or {}, ensure_ascii=False)
        now_iso = _iso_utc_now()
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO realtime_notifications (
                    event_id, channel, tutor_slug, event_type, title, message, payload, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(event_id) DO NOTHING
                """,
                (eid, ch, slug, etype, ttl, msg, payload_json, now_iso),
            )
            self._conn.commit()
            row = self._conn.execute(
                "SELECT * FROM realtime_notifications WHERE event_id = ?",
                (eid,),
            ).fetchone()
            return self._realtime_row_to_dict(row)

    def list_realtime_events(
        self,
        *,
        channel: str | None = None,
        tutor_slug: str | None = None,
        since_id: int = 0,
        limit: int = 30,
    ) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit or 30), 200))
        clauses: list[str] = []
        params: list[Any] = []
        if channel and channel != "all":
            clauses.append("(channel = ? OR channel = 'all')")
            params.append(channel)
        if tutor_slug:
            clauses.append("tutor_slug = ?")
            params.append(tutor_slug)
        if since_id > 0:
            clauses.append("id > ?")
            params.append(int(since_id))
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self._lock:
            if since_id > 0:
                rows = self._conn.execute(
                    f"SELECT * FROM realtime_notifications {where} ORDER BY id ASC LIMIT ?",
                    (*params, lim),
                ).fetchall()
                return [self._realtime_row_to_dict(r) for r in rows]
            rows = self._conn.execute(
                f"SELECT * FROM realtime_notifications {where} ORDER BY id DESC LIMIT ?",
                (*params, lim),
            ).fetchall()
            return [self._realtime_row_to_dict(r) for r in reversed(rows)]
