"""Тесты серверных форм обратной связи («Сообщить о баге», «Сотрудничество») и вложений до 20 МБ."""

from __future__ import annotations

import io
import json
from pathlib import Path
import sqlite3

from fastapi.testclient import TestClient
from PIL import Image
import pytest

from backend.config import MediaConfig, Settings
from backend.main import create_app
from databases.postgres.store import create_store


def _make_png() -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", (24, 24), color=(16, 128, 72))
    img.save(buf, format="PNG")
    return buf.getvalue()


PNG_BYTES = _make_png()
PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n"


def _make_settings(
    tmp_path: Path,
    name: str,
    *,
    admin_token: str = "",
    max_feedback_bytes: int = 20 * 1024 * 1024,
    max_feedback_files: int = 5,
) -> Settings:
    return Settings(
        db_path=tmp_path / name,
        admin_api_token=admin_token,
        admin_require_auth=bool(admin_token),
        media=MediaConfig(
            storage="local",
            local_dir=tmp_path / "media",
            max_feedback_bytes=max_feedback_bytes,
            max_feedback_files=max_feedback_files,
        ),
    )


def test_feedback_bug_and_coop_with_attachments_and_admin_flow(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_secret = "adm-fb-secret"
    app = create_app(_make_settings(tmp_path, "fb_flow.db", admin_token=admin_secret))

    alerts: list[tuple[str, str]] = []

    async def _fake_alert(title: str, body: str) -> bool:
        alerts.append((title, body))
        return True

    with TestClient(app) as c_guest, TestClient(app) as c_user, TestClient(app) as c_adm:
        monkeypatch.setattr(app.state.telegram, "notify_admin_alert", _fake_alert)

        # 1. Гостевой баг-репорт с двумя вложениями (PNG + PDF)
        r_bug = c_guest.post(
            "/api/feedback",
            data={
                "kind": "bug",
                "subject": "Баг в задании №11 (Русский язык)",
                "message": "Неверный вариант в ключе задания №11",
                "contact": "@bug_reporter",
                "page_url": "https://vektor-ege.ru/#quiz/rus",
                "context_json": json.dumps({"view": "quiz", "sid": "rus", "qnum": "11"}),
            },
            files=[
                ("files", ("screenshot.png", PNG_BYTES, "image/png")),
                ("files", ("exam_task.pdf", PDF_BYTES, "application/pdf")),
            ],
        )
        assert r_bug.status_code == 200
        bug_t = r_bug.json()["ticket"]
        assert bug_t["id"].startswith("fb-")
        assert bug_t["kind"] == "bug"
        assert bug_t["status"] == "new"
        assert bug_t["userId"] is None
        assert bug_t["attachmentsCount"] == 2
        assert len(bug_t["attachments"]) == 2
        att_png, att_pdf = bug_t["attachments"]
        assert att_png["contentType"] == "image/png"
        assert att_pdf["contentType"] == "application/pdf"
        assert bug_t["context"]["qnum"] == "11"
        assert any("screenshot.png" in body and bug_t["id"] in body for _, body in alerts)

        # Публичный URL медиа строго запрещён для feedback-вложений
        r_pub = c_guest.get(f"/api/media/public/{att_png['assetId']}")
        assert r_pub.status_code == 403
        assert r_pub.json()["detail"]["code"] == "private_asset_forbidden"

        # 2. Валидация ошибки сотрудничества без контакта -> 400
        r_bad_coop = c_guest.post(
            "/api/feedback",
            data={
                "kind": "cooperation",
                "subject": "Сотрудничество",
                "message": "Хотим подключить онлайн-школу",
                "contact": "",
            },
        )
        assert r_bad_coop.status_code == 400

        # 3. Авторизованная отправка формы «Сотрудничество» (authorName подтягивается из профиля)
        assert c_user.post(
            "/api/auth/register",
            json={"username": "partner_school", "password": "secret123", "displayName": "Онлайн-школа Меридиан"},
        ).status_code == 200
        uid = c_user.get("/api/me").json()["user"]["id"]

        r_coop = c_user.post(
            "/api/feedback",
            data={
                "kind": "cooperation",
                "subject": "Сотрудничество с Вектор",
                "message": "Предлагаем разместить 15 преподавателей по биологии и химии.",
                "contact": "https://t.me/meridian_school",
                "page_url": "https://vektor-ege.ru/#landing",
            },
            files=[("files", ("offer.pdf", PDF_BYTES, "application/pdf"))],
        )
        assert r_coop.status_code == 200
        coop_t = r_coop.json()["ticket"]
        assert coop_t["kind"] == "cooperation"
        assert coop_t["userId"] == uid
        assert coop_t["authorName"] == "Онлайн-школа Меридиан"
        assert coop_t["attachmentsCount"] == 1

        # 4. Закрытость админских эндпоинтов без токена
        assert c_guest.get("/api/admin/feedback").status_code == 401
        assert c_guest.get("/api/admin/feedback", headers={"X-Admin-Token": "wrong"}).status_code == 403
        assert c_guest.get(f"/api/admin/feedback/{bug_t['id']}/files/{att_png['assetId']}").status_code == 401

        # 5. Overview KPI отражает newFeedbackCount = 2
        adm_hdr = {"X-Admin-Token": admin_secret}
        over = c_adm.get("/api/admin/overview", headers=adm_hdr).json()
        assert over["kpi"]["newFeedbackCount"] == 2

        # 6. Фильтрация и чтение вложений в Admin API
        only_bugs = c_adm.get("/api/admin/feedback?kind=bug", headers=adm_hdr).json()["tickets"]
        assert [t["id"] for t in only_bugs] == [bug_t["id"]]
        only_coop = c_adm.get("/api/admin/feedback?kind=cooperation", headers=adm_hdr).json()["tickets"]
        assert [t["id"] for t in only_coop] == [coop_t["id"]]

        f_png = c_adm.get(f"/api/admin/feedback/{bug_t['id']}/files/{att_png['assetId']}", headers=adm_hdr)
        assert f_png.status_code == 200
        assert f_png.headers["content-type"].startswith("image/png")
        assert f_png.content == PNG_BYTES

        f_pdf = c_adm.get(f"/api/admin/feedback/{bug_t['id']}/files/{att_pdf['assetId']}", headers=adm_hdr)
        assert f_pdf.status_code == 200
        assert f_pdf.headers["content-type"].startswith("application/pdf")
        assert f_pdf.content == PDF_BYTES

        # Чужой asset_id от другого тикета не отдаётся (защита от IDOR)
        assert (
            c_adm.get(f"/api/admin/feedback/{coop_t['id']}/files/{att_png['assetId']}", headers=adm_hdr).status_code
            == 404
        )

        # 7. Модерация статуса в админке и пересчёт newFeedbackCount
        r_rev = c_adm.post(
            f"/api/admin/feedback/{bug_t['id']}/review",
            headers=adm_hdr,
            json={"status": "resolved", "reviewNote": "Исправлено в банке ФИПИ №11"},
        )
        assert r_rev.status_code == 200
        rev_t = r_rev.json()["ticket"]
        assert rev_t["status"] == "resolved"
        assert rev_t["reviewNote"] == "Исправлено в банке ФИПИ №11"
        assert rev_t["reviewedAt"] is not None

        over_after = c_adm.get("/api/admin/overview", headers=adm_hdr).json()
        assert over_after["kpi"]["newFeedbackCount"] == 1


def test_feedback_validation_limits_and_magic_bytes(tmp_path: Path) -> None:
    app = create_app(
        _make_settings(
            tmp_path,
            "fb_limits.db",
            max_feedback_bytes=70_000,
            max_feedback_files=2,
        )
    )
    with TestClient(app) as c:
        # 1. Исполняемый / текстовый файл, замаскированный под PNG -> 400 unsupported_media_type
        r_fake = c.post(
            "/api/feedback",
            data={"kind": "bug", "message": "Прикрепляю подозрительный файл"},
            files=[("files", ("fake.png", b"<svg><script>alert(1)</script></svg>", "image/png"))],
        )
        assert r_fake.status_code == 400
        assert r_fake.json()["code"] == "unsupported_media_type"

        # 2. Превышение лимита одного файла -> 413 file_too_large
        oversized_png = PNG_BYTES + b"\x00" * 71_000
        r_big = c.post(
            "/api/feedback",
            data={"kind": "bug", "message": "Очень большой скриншот"},
            files=[("files", ("huge.png", oversized_png, "image/png"))],
        )
        assert r_big.status_code == 413
        assert r_big.json()["code"] == "file_too_large"

        # 3. Превышение суммарного лимита двумя файлами по 40 КБ (> 70 КБ) -> 413
        part_a = PNG_BYTES + b"\x00" * 40_000
        part_b = PDF_BYTES + b"%" * 40_000
        r_sum = c.post(
            "/api/feedback",
            data={"kind": "bug", "message": "Два файла суммарно больше лимита"},
            files=[
                ("files", ("part1.png", part_a, "image/png")),
                ("files", ("part2.pdf", part_b, "application/pdf")),
            ],
        )
        assert r_sum.status_code == 413
        assert r_sum.json()["code"] == "file_too_large"

        # 4. Больше max_feedback_files (3 при лимите 2) -> 400 too_many_files
        r_cnt = c.post(
            "/api/feedback",
            data={"kind": "bug", "message": "Слишком много файлов"},
            files=[
                ("files", ("a.png", PNG_BYTES, "image/png")),
                ("files", ("b.png", PNG_BYTES, "image/png")),
                ("files", ("c.png", PNG_BYTES, "image/png")),
            ],
        )
        assert r_cnt.status_code == 400
        assert r_cnt.json()["detail"]["code"] == "too_many_files"


def test_sqlite_legacy_media_assets_upgrades_preserving_fk(tmp_path: Path) -> None:
    db_file = tmp_path / "legacy_media.db"
    conn = sqlite3.connect(db_file)
    conn.execute(
        """
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            username_lower TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
        """
    )
    conn.execute(
        "INSERT INTO users (id, username, username_lower, password_hash, created_at) VALUES (1, 'tut', 'tut', 'h', 1000)"
    )
    conn.execute(
        """
        CREATE TABLE media_assets (
            id TEXT PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            kind TEXT NOT NULL CHECK (kind IN ('avatar', 'diploma')),
            storage_driver TEXT NOT NULL DEFAULT 'local',
            bucket TEXT NOT NULL,
            object_key TEXT NOT NULL,
            content_type TEXT NOT NULL,
            size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
            sha256 TEXT NOT NULL DEFAULT '',
            original_filename TEXT NOT NULL DEFAULT '',
            public_url TEXT,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE tutor_verifications (
            id TEXT PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            tutor_id TEXT NOT NULL DEFAULT '',
            asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
            doc_type TEXT NOT NULL DEFAULT 'diploma',
            title TEXT NOT NULL DEFAULT '',
            comment TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',
            review_note TEXT NOT NULL DEFAULT '',
            reviewed_by TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            reviewed_at TEXT
        )
        """
    )
    conn.execute(
        """
        INSERT INTO media_assets (id, user_id, kind, storage_driver, bucket, object_key, content_type, size_bytes, created_at)
        VALUES ('med-old-1', 1, 'diploma', 'local', 'diplomas-private', 'diplomas/1/med-old-1.pdf', 'application/pdf', 123, '2026-11-20T00:00:00Z')
        """
    )
    conn.execute(
        """
        INSERT INTO tutor_verifications (id, user_id, tutor_id, asset_id, created_at)
        VALUES ('ver-old-1', 1, '', 'med-old-1', '2026-11-20T00:00:00Z')
        """
    )
    conn.commit()
    conn.close()

    store = create_store(Settings(db_path=db_file))
    try:
        asset = store.create_media_asset(
            asset_id="med-fb-1",
            user_id=None,
            kind="feedback",
            storage_driver="local",
            bucket="diplomas-private",
            object_key="feedback/fb-1/med-fb-1.png",
            content_type="image/png",
            size_bytes=len(PNG_BYTES),
            original_filename="bug.png",
        )
        assert asset["kind"] == "feedback"
        assert store.get_media_asset("med-old-1") is not None
        assert store.get_verification("ver-old-1") is not None
        fk_issues = store._conn.execute("PRAGMA foreign_key_check").fetchall()
        assert fk_issues == []
    finally:
        store.close()
