"""Тесты загрузки медиафайлов (локальное хранилище и S3 SigV4) и верификации дипломов репетиторов."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import io
from pathlib import Path

from fastapi.testclient import TestClient
import httpx
from PIL import Image
import pytest

from admin_streamlit.api_client import AdminApiClient
from backend.api import create_api_app
from backend.config import Settings, load_media_config
from backend.media_storage import (
    MediaValidationError,
    build_s3_presigned_url,
    create_media_storage,
    detect_and_validate_media,
    sign_s3_headers,
)

# Минимальные валидные заголовки изображений и PDF для проверки magic bytes
PNG_SAMPLE = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + b"\x00" * 32
JPEG_SAMPLE = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00" + b"\x11" * 24 + b"\xff\xd9"
WEBP_SAMPLE = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 24
PDF_SAMPLE = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n"


def _make_sample_image(fmt: str, size: tuple[int, int] = (24, 24)) -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", size, color=(34, 139, 94))
    img.save(buf, format=fmt)
    return buf.getvalue()


REAL_PNG = _make_sample_image("PNG")
REAL_JPEG = _make_sample_image("JPEG")


class _TestClientTransport(httpx.BaseTransport):
    """Адаптер httpx.BaseTransport -> Starlette/FastAPI TestClient."""

    def __init__(self, tc: TestClient) -> None:
        self._tc = tc

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        body = request.read()
        path = request.url.raw_path.decode("ascii")
        req_headers = {k: v for k, v in request.headers.items() if k.lower() not in {"host", "content-length"}}
        resp = self._tc.request(
            method=request.method,
            url=path,
            content=body,
            headers=req_headers,
            follow_redirects=False,
        )
        return httpx.Response(
            status_code=resp.status_code,
            headers=list(resp.headers.multi_items()),
            content=resp.content,
            request=request,
        )


def _make_settings(tmp_path: Path, name: str, *, admin_token: str = "") -> Settings:
    return Settings(
        db_path=tmp_path / name,
        admin_api_token=admin_token,
        media=load_media_config(),
    )


def test_detect_and_validate_media_magic_and_limits() -> None:
    assert detect_and_validate_media(JPEG_SAMPLE) == ("image/jpeg", "jpg")
    assert detect_and_validate_media(PNG_SAMPLE) == ("image/png", "png")
    assert detect_and_validate_media(WEBP_SAMPLE) == ("image/webp", "webp")
    assert detect_and_validate_media(PDF_SAMPLE, allow_pdf=True) == ("application/pdf", "pdf")

    with pytest.raises(MediaValidationError) as exc_pdf_disallowed:
        detect_and_validate_media(PDF_SAMPLE, allow_pdf=False)
    assert exc_pdf_disallowed.value.status == 400

    for bad in (b"", b"<svg xmlns='http://www.w3.org/2000/svg'></svg>", b"<html><script>alert(1)</script></html>"):
        with pytest.raises(MediaValidationError) as exc_bad:
            detect_and_validate_media(bad, allow_pdf=True)
        assert exc_bad.value.status == 400

    with pytest.raises(MediaValidationError) as exc_big:
        detect_and_validate_media(PNG_SAMPLE + b"a" * 2048, max_bytes=1024)
    assert exc_big.value.status == 413


def test_avatar_upload_public_serve_and_profile_update(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MEDIA_STORAGE", "local")
    monkeypatch.setenv("MEDIA_LOCAL_DIR", str(tmp_path / "media"))
    app = create_api_app(_make_settings(tmp_path, "avatars.db"))

    with TestClient(app) as c_anon, TestClient(app) as c_tut:
        assert (
            c_anon.post("/api/media/avatar", files={"file": ("a.png", PNG_SAMPLE, "image/png")}).status_code == 401
        )

        assert (
            c_tut.post(
                "/api/auth/register",
                json={"username": "tut_media_1", "password": "secret123", "displayName": "Ольга К.", "role": "tutor"},
            ).status_code
            == 200
        )
        tid = c_tut.put(
            "/api/tutor/profile",
            json={
                "name": "Ольга Крылова",
                "subject": "math",
                "subjectName": "Математика",
                "city": "Якутск",
                "timezone": "UTC+9",
                "price": 1500,
                "slots": {"1": ["18:00"]},
            },
        ).json()["tutor"]["id"]

        r_bad = c_tut.post(
            "/api/media/avatar",
            data={"target": "tutor"},
            files={"file": ("xss.svg", b"<svg onload=alert(1)>", "image/svg+xml")},
        )
        assert r_bad.status_code == 400

        r_up = c_tut.post(
            "/api/media/avatar",
            data={"target": "tutor"},
            files={"file": ("avatar.png", REAL_PNG, "image/png")},
        )
        assert r_up.status_code == 200, r_up.text
        body = r_up.json()
        assert body["ok"] is True
        assert body["tutorUpdated"] is True
        assert body["optimization"]["normalized"] is True
        assert body["optimization"]["exifStripped"] is True
        url = body["url"]
        assert url.startswith("/api/media/public/med-")

        me_user = c_tut.get("/api/me").json()["user"]
        assert me_user["avatarUrl"] == url

        tutors = c_anon.get("/api/tutors").json()["tutors"]
        found = next((t for t in tutors if t["id"] == tid), None)
        assert found is not None
        assert found["photoUrl"] == url
        assert not str(found.get("photoUrl") or "").startswith("data:")

        r_pub = c_anon.get(url)
        assert r_pub.status_code == 200
        assert r_pub.content[:4] == b"RIFF" and r_pub.content[8:12] == b"WEBP"
        assert r_pub.headers.get("content-type", "").startswith("image/webp")
        assert "immutable" in r_pub.headers.get("cache-control", "")
        assert r_pub.headers.get("x-content-type-options") == "nosniff"

        r_user_up = c_tut.post(
            "/api/media/avatar",
            data={"target": "user"},
            files={"file": ("ava.jpg", REAL_JPEG, "image/jpeg")},
        )
        assert r_user_up.status_code == 200
        r_user_pub = c_anon.get(r_user_up.json()["url"])
        assert r_user_pub.status_code == 200
        assert r_user_pub.content[:4] == b"RIFF" and r_user_pub.content[8:12] == b"WEBP"

        # При MEDIA_AVATAR_WEBP=0 аватары сохраняются без перекодирования
        monkeypatch.setenv("MEDIA_AVATAR_WEBP", "0")
        app_raw = create_api_app(_make_settings(tmp_path, "avatars_raw.db"))
        with TestClient(app_raw) as c_raw_tut, TestClient(app_raw) as c_raw_anon:
            assert (
                c_raw_tut.post(
                    "/api/auth/register",
                    json={"username": "tut_raw_1", "password": "secret123", "displayName": "Игорь"},
                ).status_code
                == 200
            )
            r_raw_up = c_raw_tut.post(
                "/api/media/avatar",
                data={"target": "user"},
                files={"file": ("raw.png", REAL_PNG, "image/png")},
            )
            assert r_raw_up.status_code == 200
            assert r_raw_up.json()["optimization"]["normalized"] is False
            r_raw_pub = c_raw_anon.get(r_raw_up.json()["url"])
            assert r_raw_pub.status_code == 200
            assert r_raw_pub.content == REAL_PNG
            assert r_raw_pub.headers.get("content-type", "").startswith("image/png")


def test_diploma_verification_privacy_and_admin_review(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MEDIA_STORAGE", "local")
    monkeypatch.setenv("MEDIA_LOCAL_DIR", str(tmp_path / "media"))
    admin_secret = "adm-verif-secret-2026"
    app = create_api_app(_make_settings(tmp_path, "verif.db", admin_token=admin_secret))

    with TestClient(app) as c_anon, TestClient(app) as c_tut, TestClient(app) as c_other, TestClient(app) as c_adm:
        assert (
            c_tut.post(
                "/api/auth/register",
                json={"username": "tut_v_1", "password": "secret123", "displayName": "Иван Б.", "role": "tutor"},
            ).status_code
            == 200
        )
        assert (
            c_other.post(
                "/api/auth/register",
                json={"username": "stu_v_2", "password": "secret123", "displayName": "Чужой"},
            ).status_code
            == 200
        )

        tid = c_tut.put(
            "/api/tutor/profile",
            json={
                "name": "Иван Белов",
                "subject": "phys",
                "subjectName": "Физика",
                "city": "Москва",
                "timezone": "UTC+3",
                "price": 1700,
                "slots": {"3": ["19:00"]},
            },
        ).json()["tutor"]["id"]

        # Загрузка PDF-диплома
        r_pdf = c_tut.post(
            "/api/tutor/verifications",
            data={
                "doc_type": "diploma",
                "title": "Диплом МФТИ",
                "comment": "Прикладываю скан с вкладышем",
                "tutor_id": tid,
            },
            files={"file": ("diploma.pdf", PDF_SAMPLE, "application/pdf")},
        )
        assert r_pdf.status_code == 200, r_pdf.text
        v1 = r_pdf.json()["verification"]
        assert v1["status"] == "pending"
        assert v1["fileUrl"].startswith("/api/media/private/")
        asset_id = v1["assetId"]

        # Загрузка второго документа (сертификат ЕГЭ) для проверки reject
        r_cert = c_tut.post(
            "/api/tutor/verifications",
            data={"doc_type": "ege_expert", "title": "Справка эксперта 2026", "tutor_id": tid},
            files={"file": ("cert.png", PNG_SAMPLE, "image/png")},
        )
        assert r_cert.status_code == 200
        v2 = r_cert.json()["verification"]

        # Репетитор видит свои заявки
        own_list = c_tut.get("/api/tutor/verifications").json()["verifications"]
        assert {item["id"] for item in own_list} >= {v1["id"], v2["id"]}

        # Приватный скан НЕ доступен ни через /public, ни анониму, ни другому пользователю
        assert c_anon.get(f"/api/media/public/{asset_id}").status_code == 403
        assert c_anon.get(f"/api/media/private/{asset_id}").status_code == 401
        assert c_other.get(f"/api/media/private/{asset_id}").status_code == 403

        # Владелец может скачать свой приватный документ
        r_own_file = c_tut.get(v1["fileUrl"])
        assert r_own_file.status_code == 200
        assert r_own_file.content == PDF_SAMPLE
        assert "no-store" in r_own_file.headers.get("cache-control", "")

        # Админка требует токен
        assert c_adm.get("/api/admin/verifications").status_code == 401
        adm_headers = {"X-Admin-Token": admin_secret}

        # Сначала отклоняем вторую заявку — галочка не выдаётся
        r_rej = c_adm.post(
            f"/api/admin/verifications/{v2['id']}/review",
            headers=adm_headers,
            json={"action": "reject", "reviewNote": "Обрезана печать"},
        )
        assert r_rej.status_code == 200
        assert r_rej.json()["verification"]["status"] == "rejected"
        assert r_rej.json()["verification"]["reviewNote"] == "Обрезана печать"
        assert r_rej.json()["verifiedGranted"] is False

        tutors_before = c_anon.get("/api/tutors").json()["tutors"]
        assert next(t for t in tutors_before if t["id"] == tid)["verified"] is False

        # Одобряем диплом -> синяя галочка автоматически включается у репетитора
        r_adm_file = c_adm.get(f"/api/admin/verifications/{v1['id']}/file", headers=adm_headers)
        assert r_adm_file.status_code == 200
        assert r_adm_file.content == PDF_SAMPLE

        r_app = c_adm.post(
            f"/api/admin/verifications/{v1['id']}/review",
            headers=adm_headers,
            json={"action": "approve", "reviewNote": "Подтверждено в ФИС ФРДО"},
        )
        assert r_app.status_code == 200
        assert r_app.json()["verification"]["status"] == "approved"
        assert r_app.json()["verifiedGranted"] is True

        tutors_after = c_anon.get("/api/tutors").json()["tutors"]
        assert next(t for t in tutors_after if t["id"] == tid)["verified"] is True

        # Проверяем статус медиа в /api/admin/ops и события в outbox
        ops = c_adm.get("/api/admin/ops", headers=adm_headers).json()
        assert ops["media"]["driver"] == "local"
        assert ops["media"]["filesCount"] >= 2

        outbox_topics = [ev["topic"] for ev in c_adm.get("/api/admin/outbox", headers=adm_headers).json()["events"]]
        assert "vektor.tutors.raw.v1" in outbox_topics


def test_s3_sigv4_signing_presign_and_storage_roundtrip(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime(2026, 11, 23, 12, 0, 0, tzinfo=timezone.utc)
    url, headers = sign_s3_headers(
        method="PUT",
        endpoint_url="https://s3.ru-1.storage.selcloud.ru",
        region="ru-1",
        access_key="ak123",
        secret_key="sk456",
        bucket="avatars-public",
        key="tut/1/ava.png",
        payload=PNG_SAMPLE,
        content_type="image/png",
        now_utc=now,
    )
    assert url == "https://s3.ru-1.storage.selcloud.ru/avatars-public/tut/1/ava.png"
    assert headers["x-amz-date"] == "20261123T120000Z"
    assert headers["Authorization"].startswith("AWS4-HMAC-SHA256 Credential=ak123/20261123/ru-1/s3/aws4_request")

    presigned = build_s3_presigned_url(
        endpoint_url="https://storage.yandexcloud.net",
        region="ru-central1",
        access_key="ak_yc",
        secret_key="sk_yc",
        bucket="diplomas-private",
        key="verif/d1.pdf",
        expires_sec=900,
        now_utc=now,
    )
    assert "X-Amz-Algorithm=AWS4-HMAC-SHA256" in presigned
    assert "X-Amz-Expires=900" in presigned
    assert "X-Amz-Signature=" in presigned

    objects: dict[str, tuple[bytes, str]] = {}
    calls: list[tuple[str, str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, str(request.url), request.headers.get("authorization", "")))
        path = request.url.path
        if request.method == "PUT":
            objects[path] = (request.content, request.headers.get("content-type", "application/octet-stream"))
            return httpx.Response(200, headers={"ETag": '"abc"'})
        if request.method == "GET":
            item = objects.get(path)
            if not item:
                return httpx.Response(404)
            return httpx.Response(200, content=item[0], headers={"Content-Type": item[1]})
        if request.method == "DELETE":
            objects.pop(path, None)
            return httpx.Response(204)
        return httpx.Response(405)

    real_async_client = httpx.AsyncClient
    mock_transport = httpx.MockTransport(handler)
    monkeypatch.setattr(httpx, "AsyncClient", lambda *a, **kw: real_async_client(*a, **{**kw, "transport": mock_transport}))
    monkeypatch.setenv("MEDIA_STORAGE", "s3")
    monkeypatch.setenv("S3_ENDPOINT_URL", "https://s3.timeweb.cloud")
    monkeypatch.setenv("S3_REGION", "ru-1")
    monkeypatch.setenv("S3_ACCESS_KEY_ID", "ak_tw")
    monkeypatch.setenv("S3_SECRET_ACCESS_KEY", "sk_tw")
    monkeypatch.setenv("S3_BUCKET_AVATARS", "avatars-public")
    monkeypatch.setenv("S3_BUCKET_DIPLOMAS", "diplomas-private")

    storage = create_media_storage(Settings(db_path=tmp_path / "s3.db", media=load_media_config()))
    assert storage.status()["driver"] == "s3"
    assert storage.status()["s3Configured"] is True

    async def _roundtrip() -> None:
        await storage.put_object("avatars-public", "u1/test.png", PNG_SAMPLE, "image/png")
        data = await storage.get_object("avatars-public", "u1/test.png")
        assert data == PNG_SAMPLE
        await storage.delete_object("avatars-public", "u1/test.png")

    asyncio.run(_roundtrip())
    assert [m for m, _, _ in calls] == ["PUT", "GET", "DELETE"]
    assert all(auth.startswith("AWS4-HMAC-SHA256 ") for _, _, auth in calls)
    assert storage.public_url_for("med-1", "avatars-public", "u1/test.png") == "/api/media/public/med-1"


def test_admin_api_client_verifications_workflow(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MEDIA_STORAGE", "local")
    monkeypatch.setenv("MEDIA_LOCAL_DIR", str(tmp_path / "media"))
    secret = "st-verif-secret"
    app = create_api_app(_make_settings(tmp_path, "st_verif.db", admin_token=secret))

    with TestClient(app) as c_tut, TestClient(app) as api_tc:
        assert (
            c_tut.post(
                "/api/auth/register",
                json={"username": "st_tut_v", "password": "secret123", "displayName": "Елена Р.", "role": "tutor"},
            ).status_code
            == 200
        )
        tid = c_tut.put(
            "/api/tutor/profile",
            json={
                "name": "Елена Романова",
                "subject": "rus",
                "subjectName": "Русский язык",
                "city": "Якутск",
                "timezone": "UTC+9",
                "price": 1300,
                "slots": {"2": ["16:00"]},
            },
        ).json()["tutor"]["id"]

        r_up = c_tut.post(
            "/api/tutor/verifications",
            data={"doc_type": "certificate", "title": "Удостоверение ФИПИ", "tutor_id": tid},
            files={"file": ("cert.png", PNG_SAMPLE, "image/png")},
        )
        assert r_up.status_code == 200
        vid = r_up.json()["verification"]["id"]

        with AdminApiClient("http://testserver", admin_token=secret, transport=_TestClientTransport(api_tc)) as cli:
            pending = cli.verifications(status="pending")
            assert any(item["id"] == vid for item in pending)

            raw, ctype = cli.verification_file_bytes(vid)
            assert raw == PNG_SAMPLE
            assert ctype == "image/png"

            res = cli.review_verification(vid, "approve", "Одобрено в Streamlit")
            assert res["verifiedGranted"] is True
            assert res["verification"]["status"] == "approved"

            ops = cli.ops_status()
            assert ops["media"]["driver"] == "local"
            assert ops["media"]["filesCount"] >= 1
