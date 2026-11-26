"""Объектное хранилище медиа (аватары и приватные сканы дипломов): локальный том или S3 РФ (SigV4)."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import hmac
import io
import os
from pathlib import Path
from typing import Any, Callable
from urllib.parse import quote, urlsplit
import uuid

import httpx

from .config import MediaConfig, Settings


class MediaValidationError(Exception):
    """Ошибка проверки формата, подписи или размера загружаемого файла."""

    def __init__(self, code: str, message: str, status: int = 400) -> None:
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


class MediaStorageError(Exception):
    """Ошибка записи, чтения или удаления объекта в хранилище."""

    def __init__(self, code: str, message: str, status: int = 502) -> None:
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


def detect_and_validate_media(
    data: bytes,
    *,
    allow_pdf: bool = False,
    max_bytes: int = 5 * 1024 * 1024,
) -> tuple[str, str]:
    """Определяет реальный MIME и расширение файла по магическим байтам (отсекает SVG/HTML/скрипты)."""
    if not data:
        raise MediaValidationError("empty_file", "Выбран пустой файл.", 400)
    if len(data) > max_bytes:
        limit_mb = round(max_bytes / (1024 * 1024), 1)
        raise MediaValidationError(
            "file_too_large",
            f"Файл превышает допустимый размер ({limit_mb:g} МБ).",
            413,
        )

    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", "jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", "png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", "webp"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif", "gif"
    if allow_pdf and data.startswith(b"%PDF-"):
        return "application/pdf", "pdf"

    allowed_hint = "JPG, PNG, WebP, GIF или PDF" if allow_pdf else "JPG, PNG, WebP или GIF"
    raise MediaValidationError(
        "unsupported_media_type",
        f"Неподдерживаемый формат файла. Допустимы только {allowed_hint}.",
        400,
    )


_FORBIDDEN_CHAT_EXTS = frozenset({
    ".html", ".htm", ".svg", ".js", ".mjs", ".exe", ".bat", ".cmd",
    ".sh", ".ps1", ".msi", ".dll", ".php", ".jsp", ".py",
})
_CHAT_OOXML_TYPES = {
    ".docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"),
    ".xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
    ".pptx": ("application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"),
    ".odt": ("application/vnd.oasis.opendocument.text", "odt"),
    ".zip": ("application/zip", "zip"),
}
_CHAT_OLE2_TYPES = {
    ".doc": ("application/msword", "doc"),
    ".xls": ("application/vnd.ms-excel", "xls"),
    ".ppt": ("application/vnd.ms-powerpoint", "ppt"),
}
_CHAT_UNSUPPORTED_MSG = (
    "Неподдерживаемый формат файла. Допустимы фото (JPG, PNG, WebP, GIF) и файлы "
    "(PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT, CSV, MD, RTF, ZIP)."
)


def detect_and_validate_chat_file(
    data: bytes,
    filename: str = "",
    *,
    max_bytes: int = 20 * 1024 * 1024,
) -> tuple[str, str, bool]:
    """Определяет MIME, расширение и признак изображения для вложений чата с защитой от активного контента."""
    if not data:
        raise MediaValidationError("empty_file", "Выбран пустой файл.", 400)
    if len(data) > max_bytes:
        limit_mb = round(max_bytes / (1024 * 1024), 1)
        raise MediaValidationError(
            "file_too_large",
            f"Файл превышает допустимый размер ({limit_mb:g} МБ).",
            413,
        )

    ext_hint = Path(str(filename or "")).suffix.lower()
    if ext_hint in _FORBIDDEN_CHAT_EXTS:
        raise MediaValidationError("unsupported_media_type", _CHAT_UNSUPPORTED_MSG, 400)

    if data.startswith((b"MZ", b"\x7fELF", b"\xca\xfe\xba\xbe", b"#!")):
        raise MediaValidationError("unsupported_media_type", _CHAT_UNSUPPORTED_MSG, 400)
    head_txt = data[:512].lstrip().lower()
    if head_txt.startswith((b"<svg", b"<!doctype", b"<html", b"<script", b"<?php", b"<?xml")):
        raise MediaValidationError("unsupported_media_type", _CHAT_UNSUPPORTED_MSG, 400)

    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", "jpg", True
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", "png", True
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", "webp", True
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif", "gif", True

    if data.startswith(b"%PDF-"):
        return "application/pdf", "pdf", False
    if data.startswith((b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")):
        mime, ext = _CHAT_OOXML_TYPES.get(ext_hint, ("application/zip", "zip"))
        return mime, ext, False
    if data.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        mime, ext = _CHAT_OLE2_TYPES.get(ext_hint, ("application/msword", "doc"))
        return mime, ext, False
    if data.startswith(b"{\\rtf"):
        return "application/rtf", "rtf", False

    if ext_hint in (".txt", ".csv", ".md") and b"\x00" not in data:
        decoded_ok = False
        for enc in ("utf-8", "cp1251"):
            try:
                data.decode(enc)
                decoded_ok = True
                break
            except UnicodeDecodeError:
                continue
        if decoded_ok:
            return "text/plain; charset=utf-8", ext_hint.lstrip("."), False

    raise MediaValidationError("unsupported_media_type", _CHAT_UNSUPPORTED_MSG, 400)


def webp_supported() -> bool:
    """Проверяет доступность кодировщика WebP в установленной библиотеке Pillow."""
    try:
        from PIL import features

        return bool(features.check("webp"))
    except Exception:
        return False


def normalize_avatar_image(
    data: bytes,
    mime: str,
    ext: str,
    *,
    max_dim: int = 512,
    quality: int = 82,
    enabled: bool = True,
) -> tuple[bytes, str, str, dict[str, Any]]:
    """Поворачивает по EXIF, уменьшает до max_dim, очищает метаданные и сжимает в WebP."""
    raw_len = len(data)
    if not enabled:
        return (
            data,
            mime,
            ext,
            {
                "normalized": False,
                "reason": "disabled",
                "originalBytes": raw_len,
                "outputBytes": raw_len,
                "exifStripped": False,
            },
        )
    try:
        from PIL import Image, ImageOps, UnidentifiedImageError, features
    except ImportError:
        return (
            data,
            mime,
            ext,
            {
                "normalized": False,
                "reason": "pillow_unavailable",
                "originalBytes": raw_len,
                "outputBytes": raw_len,
                "exifStripped": False,
            },
        )
    if not features.check("webp"):
        return (
            data,
            mime,
            ext,
            {
                "normalized": False,
                "reason": "webp_codec_unavailable",
                "originalBytes": raw_len,
                "outputBytes": raw_len,
                "exifStripped": False,
            },
        )

    eff_dim = max(64, min(2048, int(max_dim or 512)))
    eff_quality = max(40, min(98, int(quality or 82)))
    prev_max_pixels = Image.MAX_IMAGE_PIXELS
    Image.MAX_IMAGE_PIXELS = 25_000_000
    try:
        with Image.open(io.BytesIO(data)) as opened:
            if getattr(opened, "is_animated", False):
                opened.seek(0)
            transposed = ImageOps.exif_transpose(opened)
            orig_w, orig_h = transposed.size
            if orig_w <= 0 or orig_h <= 0:
                raise MediaValidationError("invalid_image", "Изображение не содержит пикселей.", 400)
            has_alpha = transposed.mode in ("RGBA", "LA") or (
                transposed.mode == "P" and "transparency" in transposed.info
            )
            converted = transposed.convert("RGBA" if has_alpha else "RGB")
            if max(orig_w, orig_h) > eff_dim:
                resampling = getattr(Image, "Resampling", Image).LANCZOS
                converted.thumbnail((eff_dim, eff_dim), resampling)
            # Создаём чистое изображение из пикселей, гарантированно удаляя EXIF, GPS и ICC.
            clean = Image.frombytes(converted.mode, converted.size, converted.tobytes())
            out = io.BytesIO()
            clean.save(out, format="WEBP", quality=eff_quality, method=4)
            webp_bytes = out.getvalue()
            return (
                webp_bytes,
                "image/webp",
                "webp",
                {
                    "normalized": True,
                    "originalWidth": int(orig_w),
                    "originalHeight": int(orig_h),
                    "width": int(clean.width),
                    "height": int(clean.height),
                    "originalBytes": raw_len,
                    "outputBytes": len(webp_bytes),
                    "exifStripped": True,
                },
            )
    except MediaValidationError:
        raise
    except Image.DecompressionBombError as exc:
        raise MediaValidationError("image_too_large", "Слишком большое разрешение изображения.", 400) from exc
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise MediaValidationError("invalid_image", "Файл изображения повреждён или не поддерживается.", 400) from exc
    finally:
        Image.MAX_IMAGE_PIXELS = prev_max_pixels


def _aws_hash_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _aws_sign(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def _aws_signing_key(secret_key: str, date_stamp: str, region: str, service: str = "s3") -> bytes:
    k_date = hmac.new(("AWS4" + secret_key).encode("utf-8"), date_stamp.encode("utf-8"), hashlib.sha256).digest()
    k_region = hmac.new(k_date, region.encode("utf-8"), hashlib.sha256).digest()
    k_service = hmac.new(k_region, service.encode("utf-8"), hashlib.sha256).digest()
    return hmac.new(k_service, b"aws4_request", hashlib.sha256).digest()


def _encode_s3_path(endpoint_path: str, bucket: str, key: str) -> str:
    base = endpoint_path.rstrip("/")
    clean_bucket = quote(bucket.strip("/"), safe="")
    clean_key = "/".join(quote(seg, safe="-_.~") for seg in key.strip("/").split("/") if seg)
    return f"{base}/{clean_bucket}/{clean_key}"


def sign_s3_headers(
    *,
    method: str,
    endpoint_url: str,
    region: str,
    access_key: str,
    secret_key: str,
    bucket: str,
    key: str,
    payload: bytes = b"",
    content_type: str | None = None,
    now_utc: datetime | None = None,
) -> tuple[str, dict[str, str]]:
    """Подписывает запрос к S3-совместимому API по схеме AWS Signature V4 (path-style)."""
    parsed = urlsplit(endpoint_url)
    dt = now_utc or datetime.now(timezone.utc)
    amz_date = dt.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = dt.strftime("%Y%m%d")
    canonical_uri = _encode_s3_path(parsed.path, bucket, key)
    payload_hash = _aws_hash_sha256(payload)

    headers_lower: dict[str, str] = {
        "host": parsed.netloc,
        "x-amz-content-sha256": payload_hash,
        "x-amz-date": amz_date,
    }
    if content_type:
        headers_lower["content-type"] = content_type

    sorted_keys = sorted(headers_lower.keys())
    canonical_headers = "".join(f"{k}:{headers_lower[k].strip()}\n" for k in sorted_keys)
    signed_headers = ";".join(sorted_keys)
    canonical_request = "\n".join(
        [
            method.upper(),
            canonical_uri,
            "",
            canonical_headers,
            signed_headers,
            payload_hash,
        ]
    )
    credential_scope = f"{date_stamp}/{region}/s3/aws4_request"
    string_to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            amz_date,
            credential_scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ]
    )
    sig = hmac.new(
        _aws_signing_key(secret_key, date_stamp, region),
        string_to_sign.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    out_headers: dict[str, str] = {
        "x-amz-content-sha256": payload_hash,
        "x-amz-date": amz_date,
        "Authorization": (
            f"AWS4-HMAC-SHA256 Credential={access_key}/{credential_scope}, "
            f"SignedHeaders={signed_headers}, Signature={sig}"
        ),
    }
    if content_type:
        out_headers["Content-Type"] = content_type
    full_url = f"{parsed.scheme}://{parsed.netloc}{canonical_uri}"
    return full_url, out_headers


def build_s3_presigned_url(
    *,
    endpoint_url: str,
    region: str,
    access_key: str,
    secret_key: str,
    bucket: str,
    key: str,
    expires_sec: int = 900,
    now_utc: datetime | None = None,
) -> str:
    """Генерирует временную presigned GET-ссылку (AWS SigV4 Query Auth)."""
    parsed = urlsplit(endpoint_url)
    dt = now_utc or datetime.now(timezone.utc)
    amz_date = dt.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = dt.strftime("%Y%m%d")
    canonical_uri = _encode_s3_path(parsed.path, bucket, key)
    credential_scope = f"{date_stamp}/{region}/s3/aws4_request"
    ttl = max(60, min(604800, int(expires_sec)))

    params = [
        ("X-Amz-Algorithm", "AWS4-HMAC-SHA256"),
        ("X-Amz-Credential", quote(f"{access_key}/{credential_scope}", safe="-_.~")),
        ("X-Amz-Date", amz_date),
        ("X-Amz-Expires", str(ttl)),
        ("X-Amz-SignedHeaders", "host"),
    ]
    canonical_query = "&".join(f"{k}={v}" for k, v in sorted(params, key=lambda x: x[0]))
    canonical_request = "\n".join(
        [
            "GET",
            canonical_uri,
            canonical_query,
            f"host:{parsed.netloc}\n",
            "host",
            "UNSIGNED-PAYLOAD",
        ]
    )
    string_to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            amz_date,
            credential_scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ]
    )
    sig = hmac.new(
        _aws_signing_key(secret_key, date_stamp, region),
        string_to_sign.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"{parsed.scheme}://{parsed.netloc}{canonical_uri}?{canonical_query}&X-Amz-Signature={sig}"


class LocalObjectStorage:
    """Локальное объектное хранилище (bucket/object_key) в томе /data/media с защитой от path traversal."""

    driver = "local"

    def __init__(self, base_dir: Path, cfg: MediaConfig) -> None:
        self.base_dir = Path(base_dir).resolve()
        self.cfg = cfg

    def _safe_path(self, bucket: str, key: str) -> Path:
        clean_bucket = bucket.strip("/").replace("..", "")
        clean_key = "/".join(seg for seg in key.strip("/").split("/") if seg and seg not in (".", ".."))
        if not clean_bucket or not clean_key:
            raise MediaStorageError("invalid_key", "Некорректный путь объекта.", 400)
        target = (self.base_dir / clean_bucket / clean_key).resolve()
        root_bucket = (self.base_dir / clean_bucket).resolve()
        if not target.is_relative_to(root_bucket):
            raise MediaStorageError("invalid_key", "Выход за границы бакета запрещён.", 400)
        return target

    async def put_object(self, bucket: str, key: str, data: bytes, content_type: str) -> dict[str, Any]:
        del content_type
        target = self._safe_path(bucket, key)
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_name(f".tmp_{uuid.uuid4().hex}")
        tmp.write_bytes(data)
        os.replace(tmp, target)
        return {
            "driver": self.driver,
            "bucket": bucket,
            "objectKey": key,
            "sizeBytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        }

    async def get_object(self, bucket: str, key: str) -> bytes:
        target = self._safe_path(bucket, key)
        if not target.is_file():
            raise MediaStorageError("media_not_found", "Файл не найден в хранилище.", 404)
        return target.read_bytes()

    async def delete_object(self, bucket: str, key: str) -> None:
        target = self._safe_path(bucket, key)
        target.unlink(missing_ok=True)

    def public_url_for(self, asset_id: str, bucket: str, key: str) -> str:
        del bucket, key
        return f"/api/media/public/{asset_id}"

    def presign_get_url(self, bucket: str, key: str) -> str | None:
        del bucket, key
        return None

    def status(self) -> dict[str, Any]:
        files = 0
        total_bytes = 0
        if self.base_dir.is_dir():
            for p in self.base_dir.rglob("*"):
                if p.is_file() and not p.name.startswith(".tmp_"):
                    files += 1
                    total_bytes += int(p.stat().st_size)
        return {
            "driver": self.driver,
            "s3Configured": bool(self.cfg.s3_configured),
            "localDir": str(self.base_dir),
            "buckets": {
                "avatars": self.cfg.s3_bucket_avatars,
                "diplomas": self.cfg.s3_bucket_diplomas,
            },
            "filesCount": files,
            "totalBytes": total_bytes,
            "publicBaseUrl": self.cfg.s3_public_base_url,
            "avatarWebp": {
                "enabled": bool(self.cfg.avatar_webp_enabled),
                "pillowWebp": webp_supported(),
                "maxDim": int(self.cfg.avatar_max_dim),
                "quality": int(self.cfg.avatar_webp_quality),
            },
            "redirect": {
                "publicRedirect": bool(self.cfg.public_redirect),
                "privatePresignRedirect": bool(self.cfg.private_presign_redirect),
            },
        }


class S3ObjectStorage:
    """Асинхронный S3-клиент (SigV4) для Selectel S3 / Timeweb S3 / Yandex Object Storage / MinIO."""

    driver = "s3"

    def __init__(
        self,
        cfg: MediaConfig,
        *,
        http_getter: Callable[[], httpx.AsyncClient | None] | None = None,
    ) -> None:
        if not cfg.s3_configured or not cfg.s3_endpoint_url or not cfg.s3_access_key_id or not cfg.s3_secret_access_key:
            raise MediaStorageError("s3_not_configured", "Параметры S3 не заполнены.", 500)
        self.cfg = cfg
        self.endpoint_url = cfg.s3_endpoint_url
        self.region = cfg.s3_region
        self.access_key = cfg.s3_access_key_id
        self.secret_key = cfg.s3_secret_access_key
        self._http_getter = http_getter

    async def _request(
        self,
        method: str,
        bucket: str,
        key: str,
        *,
        payload: bytes = b"",
        content_type: str | None = None,
    ) -> httpx.Response:
        url, headers = sign_s3_headers(
            method=method,
            endpoint_url=self.endpoint_url,
            region=self.region,
            access_key=self.access_key,
            secret_key=self.secret_key,
            bucket=bucket,
            key=key,
            payload=payload,
            content_type=content_type,
        )
        client = self._http_getter() if self._http_getter else None
        owns = False
        if client is None:
            client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0))
            owns = True
        try:
            if method.upper() == "PUT":
                return await client.put(url, content=payload, headers=headers)
            if method.upper() == "DELETE":
                return await client.delete(url, headers=headers)
            return await client.get(url, headers=headers)
        except httpx.HTTPError as exc:
            raise MediaStorageError("s3_network_error", f"Ошибка подключения к S3: {exc}", 502) from exc
        finally:
            if owns:
                await client.aclose()

    async def put_object(self, bucket: str, key: str, data: bytes, content_type: str) -> dict[str, Any]:
        resp = await self._request("PUT", bucket, key, payload=data, content_type=content_type)
        if resp.status_code not in (200, 201, 204):
            raise MediaStorageError("s3_put_failed", f"S3 PUT вернул HTTP {resp.status_code}", 502)
        return {
            "driver": self.driver,
            "bucket": bucket,
            "objectKey": key,
            "sizeBytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        }

    async def get_object(self, bucket: str, key: str) -> bytes:
        resp = await self._request("GET", bucket, key)
        if resp.status_code == 404:
            raise MediaStorageError("media_not_found", "Объект не найден в S3.", 404)
        if resp.status_code != 200:
            raise MediaStorageError("s3_get_failed", f"S3 GET вернул HTTP {resp.status_code}", 502)
        return bytes(resp.content)

    async def delete_object(self, bucket: str, key: str) -> None:
        resp = await self._request("DELETE", bucket, key)
        if resp.status_code not in (200, 202, 204, 404):
            raise MediaStorageError("s3_delete_failed", f"S3 DELETE вернул HTTP {resp.status_code}", 502)

    def public_url_for(self, asset_id: str, bucket: str, key: str) -> str:
        if self.cfg.s3_public_base_url:
            clean_key = "/".join(quote(seg, safe="-_.~") for seg in key.strip("/").split("/") if seg)
            return f"{self.cfg.s3_public_base_url}/{quote(bucket.strip('/'), safe='')}/{clean_key}"
        return f"/api/media/public/{asset_id}"

    def presign_get_url(self, bucket: str, key: str) -> str | None:
        return build_s3_presigned_url(
            endpoint_url=self.endpoint_url,
            region=self.region,
            access_key=self.access_key,
            secret_key=self.secret_key,
            bucket=bucket,
            key=key,
            expires_sec=self.cfg.presign_ttl_sec,
        )

    def status(self) -> dict[str, Any]:
        return {
            "driver": self.driver,
            "s3Configured": True,
            "endpointUrl": self.endpoint_url,
            "region": self.region,
            "buckets": {
                "avatars": self.cfg.s3_bucket_avatars,
                "diplomas": self.cfg.s3_bucket_diplomas,
            },
            "publicBaseUrl": self.cfg.s3_public_base_url,
            "avatarWebp": {
                "enabled": bool(self.cfg.avatar_webp_enabled),
                "pillowWebp": webp_supported(),
                "maxDim": int(self.cfg.avatar_max_dim),
                "quality": int(self.cfg.avatar_webp_quality),
            },
            "redirect": {
                "publicRedirect": bool(self.cfg.public_redirect),
                "privatePresignRedirect": bool(self.cfg.private_presign_redirect),
            },
        }


def create_media_storage(
    settings: Settings,
    *,
    http_getter: Callable[[], httpx.AsyncClient | None] | None = None,
) -> LocalObjectStorage | S3ObjectStorage:
    """Создаёт S3ObjectStorage (при настроенном S3) или LocalObjectStorage."""
    cfg = settings.media
    mode = (cfg.storage or "auto").strip().lower()
    use_s3 = (mode == "s3" and cfg.s3_configured) or (mode == "auto" and cfg.s3_configured)
    if use_s3:
        return S3ObjectStorage(cfg, http_getter=http_getter)
    local_root = cfg.local_dir or (Path(settings.db_path).resolve().parent / "media")
    return LocalObjectStorage(local_root, cfg)


__all__ = [
    "LocalObjectStorage",
    "MediaStorageError",
    "MediaValidationError",
    "S3ObjectStorage",
    "build_s3_presigned_url",
    "create_media_storage",
    "detect_and_validate_media",
    "normalize_avatar_image",
    "sign_s3_headers",
    "webp_supported",
]
