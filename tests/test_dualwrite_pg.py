"""Тесты Dual-Write (SQLite + PostgreSQL 17), PostgresDatabase и Transactional Outbox."""

from pathlib import Path
import uuid

import psycopg
from psycopg.rows import dict_row
import pytest

from backend.config import Settings, load_settings
from databases.postgres.store import DualWriteDatabase, PostgresDatabase, create_store
from databases.sqlite.store import Database, StorageError, hash_token

PG_DSN = "postgresql://postgres@127.0.0.1:5432/vektor_ege"


def _pg_available() -> bool:
    try:
        with psycopg.connect(PG_DSN, connect_timeout=1) as conn:
            conn.execute("SELECT 1 FROM oltp.users LIMIT 1")
        return True
    except Exception:
        return False

ENVELOPE_KEYS = {
    "event_id",
    "event_type",
    "occurred_at",
    "user_id",
    "session_id",
    "role",
    "view",
    "payload",
    "schema_version",
}


def _cleanup_pg(usernames: list[str], slugs: list[str], event_ids: list[str]) -> None:
    with psycopg.connect(PG_DSN, row_factory=dict_row) as conn:
        with conn.transaction():
            pg_uids: list[int] = []
            if usernames:
                lowers = [u.lower() for u in usernames]
                rows = conn.execute(
                    "SELECT id FROM oltp.users WHERE username_lower = ANY(%s)",
                    (lowers,),
                ).fetchall()
                pg_uids = [int(r["id"]) for r in rows]
                if pg_uids:
                    conn.execute(
                        "DELETE FROM outbox.kafka_outbox WHERE partition_key = ANY(%s)",
                        ([str(uid) for uid in pg_uids],),
                    )
                conn.execute(
                    "DELETE FROM oltp.users WHERE username_lower = ANY(%s)",
                    (lowers,),
                )
            if slugs:
                conn.execute(
                    "DELETE FROM oltp.calendar_events WHERE tutor_slug = ANY(%s)",
                    (slugs,),
                )
                conn.execute(
                    "DELETE FROM oltp.calendar_sync_tokens WHERE tutor_slug = ANY(%s)",
                    (slugs,),
                )
                conn.execute(
                    "DELETE FROM oltp.realtime_notifications WHERE tutor_slug = ANY(%s)",
                    (slugs,),
                )
                conn.execute(
                    "DELETE FROM outbox.kafka_outbox WHERE partition_key = ANY(%s)",
                    (slugs,),
                )
            if event_ids:
                conn.execute(
                    "DELETE FROM oltp.realtime_notifications WHERE event_id = ANY(%s)",
                    (event_ids,),
                )
                conn.execute(
                    "DELETE FROM outbox.kafka_outbox WHERE payload->>'event_id' = ANY(%s)",
                    (event_ids,),
                )


def test_settings_and_create_store_modes(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("DB_MODE", raising=False)
    s_default = load_settings()
    assert s_default.database_url is None
    assert s_default.db_mode == "auto"

    s_sqlite = Settings(db_path=tmp_path / "s1.db")
    store_sqlite = create_store(s_sqlite)
    try:
        assert isinstance(store_sqlite, Database)
        assert store_sqlite.storage_health() == {
            "ok": True,
            "mode": "sqlite",
            "sqlite": "ok",
            "postgres": "disabled",
            "outboxPending": 0,
        }
    finally:
        store_sqlite.close()

    monkeypatch.setenv("DATABASE_URL", PG_DSN)
    monkeypatch.setenv("DB_MODE", "dual")
    monkeypatch.setenv("DB_PATH", str(tmp_path / "env.db"))
    s_env = load_settings()
    assert s_env.database_url == PG_DSN
    assert s_env.db_mode == "dual"

    store_forced_sqlite = create_store(Settings(db_path=tmp_path / "s2.db", database_url=PG_DSN, db_mode="sqlite"))
    try:
        assert isinstance(store_forced_sqlite, Database)
    finally:
        store_forced_sqlite.close()

    if _pg_available():
        store_dual = create_store(Settings(db_path=tmp_path / "s3.db", database_url=PG_DSN, db_mode="auto"))
        try:
            assert isinstance(store_dual, DualWriteDatabase)
        finally:
            store_dual.close()

        store_pg = create_store(Settings(db_path=tmp_path / "s4.db", database_url=PG_DSN, db_mode="postgres"))
        try:
            assert isinstance(store_pg, PostgresDatabase)
        finally:
            store_pg.close()


def test_sqlite_calendar_realtime_and_extended_docs(tmp_path: Path) -> None:
    db = Database(tmp_path / "sqlite_cal.db")
    try:
        u = db.create_user("sql_tutor", "secret123")
        db.patch_doc(u.id, "tutor-cabinet", {"city": "Якутск", "rate": 1600}, 65536)
        db.patch_doc(u.id, "calendar-sync", {"gcalConnected": True}, 65536)
        docs = db.get_docs(u.id)
        assert docs["tutor-cabinet"] == {"city": "Якутск", "rate": 1600}
        assert docs["calendar-sync"] == {"gcalConnected": True}
        with pytest.raises(StorageError) as exc_info:
            db.patch_doc(u.id, "forbidden-doc", {"x": 1}, 65536)
        assert exc_info.value.code == "invalid_doc"

        cal1 = db.upsert_calendar_sync(
            tutor_slug="sql-tutor-1",
            user_id=u.id,
            tutor_name="Саргылана",
            city="Якутск",
            timezone="UTC+9",
            open_slots={"1": ["16:00", "17:00"]},
            events=[
                {
                    "uid": "ev-sql-1",
                    "studentName": "Айана",
                    "subject": "bio",
                    "dow": 1,
                    "slotDate": "2026-11-16",
                    "hour": "16:00",
                    "priceRub": 1600,
                    "status": "accepted",
                }
            ],
            busy_slots=[
                {
                    "uid": "gcal-1",
                    "dow": 1,
                    "slotDate": "2026-11-16",
                    "hour": "18:00",
                    "summary": "Занято",
                    "sourceTz": "UTC",
                }
            ],
            gcal_connected=True,
        )
        token = cal1["feedToken"]
        assert token
        assert len(cal1["events"]) == 1
        assert len(cal1["busySlots"]) == 1

        # Повторный upsert сохраняет feed_token для того же tutor_slug
        cal2 = db.upsert_calendar_sync(tutor_slug="sql-tutor-1", open_slots={"1": ["16:00"]})
        assert cal2["feedToken"] == token
        assert db.get_calendar_by_token(token)["tutorSlug"] == "sql-tutor-1"
        assert db.get_calendar_by_slug("sql-tutor-1")["feedToken"] == token

        e1 = db.record_realtime_event(
            event_id="rt-sql-1",
            channel="tutor",
            event_type="market.bid.created",
            title="Новая заявка",
            tutor_slug="sql-tutor-1",
            payload={"price": 1700},
        )
        # Идемпотентность по event_id
        e1_dup = db.record_realtime_event(
            event_id="rt-sql-1",
            channel="tutor",
            event_type="market.bid.created",
            title="Новая заявка",
            tutor_slug="sql-tutor-1",
        )
        assert e1_dup["id"] == e1["id"]

        e2 = db.record_realtime_event(
            event_id="rt-sql-2",
            channel="tutor",
            event_type="calendar.synced",
            title="Календарь обновлён",
            tutor_slug="sql-tutor-1",
        )
        e3 = db.record_realtime_event(
            event_id="rt-sql-3",
            channel="student",
            event_type="market.bid.accepted",
            title="Принято",
            tutor_slug="sql-tutor-1",
        )
        assert e2["id"] > e1["id"]
        recent_tutor = db.list_realtime_events(channel="tutor", tutor_slug="sql-tutor-1", limit=10)
        assert [ev["eventId"] for ev in recent_tutor] == ["rt-sql-1", "rt-sql-2"]
        since = db.list_realtime_events(channel="tutor", tutor_slug="sql-tutor-1", since_id=e1["id"])
        assert [ev["eventId"] for ev in since] == ["rt-sql-2"]
        assert e3["channel"] == "student"
    finally:
        db.close()


def test_dual_write_no_user_id_collision_and_outbox(tmp_path: Path) -> None:
    if not _pg_available():
        pytest.skip("PostgreSQL 17 (:5432/vektor_ege) not available in CI")
    suffix = uuid.uuid4().hex[:10]
    uname_local = f"dw_local_{suffix}"
    uname_oauth = f"dw_oauth_{suffix}"
    slug = f"dw-tutor-{suffix}"
    rt_event_id = f"rt-dw-{suffix}"
    created_usernames = [uname_local]

    store = create_store(Settings(db_path=tmp_path / "dual.db", database_url=PG_DSN, db_mode="dual"))
    assert isinstance(store, DualWriteDatabase)
    try:
        health = store.storage_health()
        assert health["ok"] is True
        assert health["mode"] == "dual"
        assert health["sqlite"] == "ok"
        assert health["postgres"] == "ok"
        assert isinstance(health["outboxPending"], int)

        # SQLite user получает id=1, но в PG уже есть id=1..8 — коллизии быть не должно!
        u = store.create_user(
            uname_local,
            "secret123",
            email=f"{uname_local}@example.com",
            display_name="Двойная Запись",
        )
        assert u.id == 1

        token = store.create_session(u.id, 3600)
        assert store.get_user_by_token(token).username == uname_local

        # OAuth state + upsert_oauth_user
        st = store.create_oauth_state("google", "ver-123", "https://ege.example/cb")
        assert store.consume_oauth_state(st, "google") == ("ver-123", "https://ege.example/cb")
        oauth_u = store.upsert_oauth_user(
            "google",
            f"sub-{suffix}",
            email=f"{uname_oauth}@gmail.com",
            email_verified=True,
            display_name="Google Ученик",
        )
        created_usernames.append(oauth_u.username)

        # Docs: JSONB deep_merge с удалением None + разные Kafka топики в outbox
        store.patch_doc(u.id, "profile", {"name": "Айана", "targets": {"bio": 85, "chem": 70}}, 65536)
        store.patch_doc(u.id, "profile", {"targets": {"chem": None, "rus": 90}}, 65536)
        store.replace_doc(u.id, "mocks", {"list": [{"id": "m1", "score": 82}]}, 65536)
        store.patch_doc(u.id, "tutor-cabinet", {"city": "Якутск", "tz": "UTC+9"}, 65536)

        assert store.get_docs(u.id)["profile"] == {"name": "Айана", "targets": {"bio": 85, "rus": 90}}

        # Calendar & Realtime dual-write
        cal = store.upsert_calendar_sync(
            tutor_slug=slug,
            user_id=u.id,
            tutor_name="Тест Репетитор",
            city="Якутск",
            timezone="UTC+9",
            open_slots={"2": ["15:00", "16:00"]},
            events=[
                {
                    "uid": f"ev-{suffix}",
                    "studentName": "Тимур",
                    "subject": "chem",
                    "dow": 2,
                    "slotDate": "2026-11-17",
                    "hour": "16:00",
                    "priceRub": 1800,
                    "status": "accepted",
                }
            ],
            busy_slots=[
                {
                    "uid": f"gcal-{suffix}",
                    "dow": 2,
                    "slotDate": "2026-11-17",
                    "hour": "17:00",
                    "summary": "GCal Busy",
                    "sourceTz": "UTC",
                }
            ],
            gcal_connected=True,
        )
        rt = store.record_realtime_event(
            event_id=rt_event_id,
            channel="tutor",
            event_type="market.bid.created",
            title="Ставка +100 ₽",
            message="Тимур предложил 1 800 ₽",
            tutor_slug=slug,
            payload={"priceRub": 1800},
        )
        assert rt["eventId"] == rt_event_id

        # Проверяем реальные строки в PostgreSQL 17!
        with psycopg.connect(PG_DSN, row_factory=dict_row) as pg_conn:
            pg_user = pg_conn.execute(
                "SELECT id, username FROM oltp.users WHERE username_lower = %s",
                (uname_local.lower(),),
            ).fetchone()
            assert pg_user is not None
            pg_uid = int(pg_user["id"])
            assert pg_uid > 8

            # Сессия в PG привязана к pg_uid, а не к SQLite id=1!
            pg_sess = pg_conn.execute(
                "SELECT user_id FROM oltp.sessions WHERE token_hash = %s",
                (hash_token(token),),
            ).fetchone()
            assert pg_sess is not None and int(pg_sess["user_id"]) == pg_uid

            # JSONB merge + удаление None в oltp.docs
            pg_docs = pg_conn.execute(
                "SELECT name, data FROM oltp.docs WHERE user_id = %s",
                (pg_uid,),
            ).fetchall()
            docs_map = {r["name"]: r["data"] for r in pg_docs}
            assert docs_map["profile"] == {"name": "Айана", "targets": {"bio": 85, "rus": 90}}
            assert docs_map["mocks"] == {"list": [{"id": "m1", "score": 82}]}
            assert docs_map["tutor-cabinet"] == {"city": "Якутск", "tz": "UTC+9"}

            # Calendar sync в PG имеет тот же feed_token
            pg_cal = pg_conn.execute(
                "SELECT feed_token, user_id, gcal_connected FROM oltp.calendar_sync_tokens WHERE tutor_slug = %s",
                (slug,),
            ).fetchone()
            assert pg_cal is not None
            assert pg_cal["feed_token"] == cal["feedToken"]
            assert int(pg_cal["user_id"]) == pg_uid
            assert pg_cal["gcal_connected"] is True

            # Transactional Outbox (Canonical Envelope v1 + 3 топика)
            outbox_user = pg_conn.execute(
                "SELECT topic, payload FROM outbox.kafka_outbox WHERE partition_key = %s ORDER BY id ASC",
                (str(pg_uid),),
            ).fetchall()
            topics_user = [r["topic"] for r in outbox_user]
            assert "vektor.user.clickstream.v1" in topics_user
            assert "vektor.study.attempts.v1" in topics_user
            assert "vektor.market.bids.v1" in topics_user
            for row in outbox_user:
                env = row["payload"]
                assert ENVELOPE_KEYS.issubset(set(env.keys()))
                assert env["schema_version"] == "1.0.0"

            outbox_cal = pg_conn.execute(
                "SELECT topic, payload FROM outbox.kafka_outbox WHERE partition_key = %s ORDER BY id ASC",
                (slug,),
            ).fetchall()
            assert len(outbox_cal) >= 2
            assert all(r["topic"] == "vektor.market.bids.v1" for r in outbox_cal)
            assert any(r["payload"]["event_type"] == "calendar.synced" for r in outbox_cal)
            assert any(r["payload"]["event_type"] == "market.bid.created" for r in outbox_cal)

        store.delete_session(token)
        assert store.get_user_by_token(token) is None
    finally:
        store.close()
        _cleanup_pg(created_usernames, [slug], [rt_event_id])


def test_postgres_only_mode_full_crud() -> None:
    if not _pg_available():
        pytest.skip("PostgreSQL 17 (:5432/vektor_ege) not available in CI")
    suffix = uuid.uuid4().hex[:10]
    uname = f"pg_only_{suffix}"
    slug = f"pg-tutor-{suffix}"
    rt_event_id = f"rt-pg-{suffix}"

    pg = PostgresDatabase(PG_DSN)
    try:
        h = pg.storage_health()
        assert h["ok"] is True
        assert h["mode"] == "postgres"
        assert h["sqlite"] == "disabled"
        assert h["postgres"] == "ok"

        u = pg.create_user(uname, "secret123", email=f"{uname}@example.com", display_name="ПГ Юзер")
        assert pg.authenticate(uname, "secret123").id == u.id
        assert pg.authenticate(f"{uname}@example.com", "secret123").id == u.id
        assert pg.authenticate(uname, "wrong") is None

        tok = pg.create_session(u.id, 3600)
        assert pg.get_user_by_token(tok).id == u.id
        pg.delete_session(tok)
        assert pg.get_user_by_token(tok) is None

        pg.patch_doc(u.id, "plan", {"univ": "СВФУ", "drop": 1}, 4096)
        pg.patch_doc(u.id, "plan", {"drop": None, "target": 265}, 4096)
        assert pg.get_docs(u.id)["plan"] == {"univ": "СВФУ", "target": 265}

        with pytest.raises(StorageError) as quota_err:
            pg.replace_doc(u.id, "plan", {"huge": "a" * 5000}, 512)
        assert quota_err.value.code == "quota_exceeded"

        cal = pg.upsert_calendar_sync(
            tutor_slug=slug,
            user_id=u.id,
            city="Москва",
            timezone="UTC+3",
            events=[
                {
                    "uid": f"ev-pg-{suffix}",
                    "studentName": "Егор",
                    "subject": "rus",
                    "dow": 3,
                    "slotDate": "2026-11-18",
                    "hour": "10:00",
                    "priceRub": 1500,
                }
            ],
        )
        assert pg.get_calendar_by_token(cal["feedToken"])["timezone"] == "UTC+3"
        assert pg.get_calendar_by_slug(slug)["events"][0]["hour"] == "10:00"

        rt = pg.record_realtime_event(
            event_id=rt_event_id,
            channel="tutor",
            event_type="calendar.synced",
            title="Синхронизация",
            tutor_slug=slug,
        )
        listed = pg.list_realtime_events(channel="tutor", tutor_slug=slug, limit=10)
        assert [x["eventId"] for x in listed] == [rt["eventId"]]
    finally:
        pg.close()
        _cleanup_pg([uname], [slug], [rt_event_id])
