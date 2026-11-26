"""Автоматическое резервное копирование БД (SQLite Online Backup + gzip/SHA-256 и pg_dump)."""

from __future__ import annotations

from datetime import datetime, timezone
import gzip
import hashlib
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import threading
import time
from typing import Any

import httpx

from .config import BackupConfig, Settings
from .media_storage import sign_s3_headers


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def encrypt_file_aes256(src: Path, dst: Path, passphrase: str) -> None:
    """Шифрует файл через OpenSSL AES-256-CBC (PBKDF2 SHA-256, ключ в env)."""
    key = str(passphrase or "").strip()
    if not key:
        raise ValueError("Пустой ключ шифрования BACKUP_ENCRYPTION_KEY")
    openssl_bin = shutil.which("openssl")
    if not openssl_bin:
        raise RuntimeError("openssl недоступен для шифрования бэкапа")
    env = dict(os.environ)
    env["_VEKTOR_BACKUP_KEY"] = key
    proc = subprocess.run(
        [
            openssl_bin,
            "enc",
            "-aes-256-cbc",
            "-pbkdf2",
            "-iter",
            "100000",
            "-salt",
            "-in",
            str(src),
            "-out",
            str(dst),
            "-pass",
            "env:_VEKTOR_BACKUP_KEY",
        ],
        env=env,
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
    )
    if proc.returncode != 0 or not dst.is_file() or dst.stat().st_size == 0:
        raise RuntimeError((proc.stderr or proc.stdout or "openssl encrypt failed").strip())


def decrypt_file_aes256(src: Path, dst: Path, passphrase: str) -> None:
    """Расшифровывает .enc бэкап, созданный encrypt_file_aes256."""
    key = str(passphrase or "").strip()
    if not key:
        raise ValueError("Пустой ключ шифрования BACKUP_ENCRYPTION_KEY")
    openssl_bin = shutil.which("openssl")
    if not openssl_bin:
        raise RuntimeError("openssl недоступен для расшифровки бэкапа")
    env = dict(os.environ)
    env["_VEKTOR_BACKUP_KEY"] = key
    proc = subprocess.run(
        [
            openssl_bin,
            "enc",
            "-d",
            "-aes-256-cbc",
            "-pbkdf2",
            "-iter",
            "100000",
            "-in",
            str(src),
            "-out",
            str(dst),
            "-pass",
            "env:_VEKTOR_BACKUP_KEY",
        ],
        env=env,
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
    )
    if proc.returncode != 0 or not dst.is_file():
        raise RuntimeError((proc.stderr or proc.stdout or "openssl decrypt failed").strip())


class BackupManager:
    """Создаёт атомарные бэкапы (опционально AES-256 + S3) с SHA-256 и контролирует ретенцию."""

    def __init__(self, settings: Settings, *, s3_transport: httpx.BaseTransport | None = None) -> None:
        self.settings = settings
        self.config: BackupConfig = settings.backup
        self._s3_transport = s3_transport
        self._lock = threading.Lock()
        self._last_backup_at: str | None = None
        self._last_backup_epoch: float | None = None
        self._last_file: str | None = None
        self._last_error: str | None = None
        self._s3_uploads_total = 0
        self._last_s3_upload_at: str | None = None
        self._last_s3_key: str | None = None

    @property
    def backup_dir(self) -> Path:
        if self.config.backup_dir is not None:
            return Path(self.config.backup_dir)
        return Path(self.settings.db_path).resolve().parent / "backups"

    def _sqlite_active(self) -> bool:
        mode = (self.settings.db_mode or "auto").strip().lower()
        return mode in ("sqlite", "dual", "auto") and Path(self.settings.db_path).is_file()

    def _pg_active(self) -> bool:
        mode = (self.settings.db_mode or "auto").strip().lower()
        return bool(
            self.settings.database_url
            and mode in ("postgres", "dual", "auto")
            and shutil.which("pg_dump")
        )

    def _list_archives(self) -> list[Path]:
        bdir = self.backup_dir
        if not bdir.is_dir():
            return []
        files = [
            p
            for p in bdir.iterdir()
            if p.is_file()
            and p.name.startswith("vektor_")
            and p.name.endswith((".db.gz", ".db.gz.enc", ".dump", ".dump.enc"))
        ]
        files.sort(key=lambda p: (p.stat().st_mtime, p.name), reverse=True)
        return files

    def should_run_scheduled(self, now_utc: datetime | None = None) -> bool:
        if not self.config.enabled:
            return False
        if not (self._sqlite_active() or self._pg_active()):
            return False
        now_ts = (now_utc or datetime.now(timezone.utc)).timestamp()
        last_ts = self._last_backup_epoch
        if last_ts is None:
            archives = self._list_archives()
            if archives:
                last_ts = archives[0].stat().st_mtime
                self._last_backup_epoch = last_ts
                self._last_file = archives[0].name
                self._last_backup_at = datetime.fromtimestamp(last_ts, tz=timezone.utc).strftime(
                    "%Y-%m-%dT%H:%M:%SZ"
                )
        if last_ts is None:
            return True
        return (now_ts - last_ts) >= float(self.config.interval_hours * 3600)

    def _finalize_artifact(self, *, tmp_plain: Path, final_plain: Path, engine: str) -> dict[str, Any]:
        if self.config.encryption_enabled:
            tmp_enc = tmp_plain.with_name(f"{tmp_plain.name}.enc")
            final_enc = Path(f"{final_plain}.enc")
            sha_path = Path(f"{final_enc}.sha256")
            try:
                encrypt_file_aes256(tmp_plain, tmp_enc, str(self.config.encryption_key or ""))
                digest = _sha256_file(tmp_enc)
                os.replace(tmp_enc, final_enc)
                sha_path.write_text(f"{digest}  {final_enc.name}\n", encoding="utf-8")
                return {
                    "engine": engine,
                    "file": final_enc.name,
                    "path": str(final_enc),
                    "shaPath": str(sha_path),
                    "sizeBytes": int(final_enc.stat().st_size),
                    "sha256": digest,
                    "encrypted": True,
                    "cipher": "aes-256-cbc-pbkdf2",
                }
            finally:
                tmp_enc.unlink(missing_ok=True)

        sha_path = Path(f"{final_plain}.sha256")
        digest = _sha256_file(tmp_plain)
        os.replace(tmp_plain, final_plain)
        sha_path.write_text(f"{digest}  {final_plain.name}\n", encoding="utf-8")
        return {
            "engine": engine,
            "file": final_plain.name,
            "path": str(final_plain),
            "shaPath": str(sha_path),
            "sizeBytes": int(final_plain.stat().st_size),
            "sha256": digest,
            "encrypted": False,
        }

    def _upload_to_s3(self, item: dict[str, Any]) -> dict[str, Any]:
        if self.config.s3_require_encryption and not item.get("encrypted"):
            raise RuntimeError(
                "backup_encryption_key_required: задайте BACKUP_ENCRYPTION_KEY для выгрузки в S3"
            )
        if not self.config.s3_configured:
            return {"s3Uploaded": False}

        bucket = str(self.config.s3_bucket)
        endpoint = str(self.config.s3_endpoint_url)
        region = str(self.config.s3_region or "ru-central1")
        access_key = str(self.config.s3_access_key_id)
        secret_key = str(self.config.s3_secret_access_key)
        prefix = str(self.config.s3_prefix or "backups").strip("/")

        art_path = Path(str(item["path"]))
        sha_path = Path(str(item.get("shaPath") or f"{art_path}.sha256"))
        obj_key = f"{prefix}/{art_path.name}" if prefix else art_path.name
        sha_key = f"{obj_key}.sha256"

        art_bytes = art_path.read_bytes()
        sha_bytes = sha_path.read_bytes() if sha_path.is_file() else f"{item['sha256']}  {art_path.name}\n".encode("utf-8")

        client_kwargs: dict[str, Any] = {"timeout": httpx.Timeout(120.0, connect=15.0)}
        if self._s3_transport is not None:
            client_kwargs["transport"] = self._s3_transport

        with httpx.Client(**client_kwargs) as client:
            for key, payload, ctype in (
                (obj_key, art_bytes, "application/octet-stream"),
                (sha_key, sha_bytes, "text/plain; charset=utf-8"),
            ):
                url, headers = sign_s3_headers(
                    method="PUT",
                    endpoint_url=endpoint,
                    region=region,
                    access_key=access_key,
                    secret_key=secret_key,
                    bucket=bucket,
                    key=key,
                    payload=payload,
                    content_type=ctype,
                )
                resp = client.put(url, content=payload, headers=headers)
                if resp.status_code not in (200, 201, 204):
                    raise RuntimeError(f"S3 PUT {key} вернул HTTP {resp.status_code}")

        return {
            "s3Uploaded": True,
            "s3Bucket": bucket,
            "s3Key": obj_key,
            "s3ShaKey": sha_key,
        }

    def _backup_sqlite(self, ts_label: str) -> dict[str, Any]:
        src_path = Path(self.settings.db_path).resolve()
        bdir = self.backup_dir
        bdir.mkdir(parents=True, exist_ok=True)
        tmp_raw = bdir / f".tmp_{ts_label}_{os.getpid()}.db"
        tmp_gz = bdir / f".tmp_{ts_label}_{os.getpid()}.db.gz"
        final_gz = bdir / f"vektor_sqlite_{ts_label}.db.gz"

        try:
            src_conn = sqlite3.connect(str(src_path), timeout=10.0)
            dst_conn = sqlite3.connect(str(tmp_raw))
            try:
                src_conn.backup(dst_conn)
            finally:
                dst_conn.close()
                src_conn.close()

            with tmp_raw.open("rb") as f_in, gzip.open(tmp_gz, "wb", compresslevel=6) as f_out:
                shutil.copyfileobj(f_in, f_out, length=65536)

            return self._finalize_artifact(tmp_plain=tmp_gz, final_plain=final_gz, engine="sqlite")
        finally:
            tmp_raw.unlink(missing_ok=True)
            tmp_gz.unlink(missing_ok=True)

    def _backup_postgres(self, ts_label: str) -> dict[str, Any]:
        pg_dump = shutil.which("pg_dump")
        if not pg_dump or not self.settings.database_url:
            raise RuntimeError("pg_dump или DATABASE_URL недоступны")
        bdir = self.backup_dir
        bdir.mkdir(parents=True, exist_ok=True)
        tmp_dump = bdir / f".tmp_{ts_label}_{os.getpid()}.dump"
        final_dump = bdir / f"vektor_pg_{ts_label}.dump"
        try:
            proc = subprocess.run(
                [
                    pg_dump,
                    self.settings.database_url,
                    "--format=custom",
                    "--compress=9",
                    "--no-owner",
                    "-f",
                    str(tmp_dump),
                ],
                capture_output=True,
                text=True,
                timeout=300,
                check=False,
            )
            if proc.returncode != 0 or not tmp_dump.is_file() or tmp_dump.stat().st_size == 0:
                raise RuntimeError((proc.stderr or proc.stdout or "pg_dump failed").strip())
            return self._finalize_artifact(tmp_plain=tmp_dump, final_plain=final_dump, engine="postgres")
        finally:
            tmp_dump.unlink(missing_ok=True)

    def _prune_old_backups(self, now_ts: float) -> int:
        bdir = self.backup_dir
        if not bdir.is_dir():
            return 0
        cutoff = now_ts - float(max(1, self.config.retention_days) * 86400)
        removed = 0
        for item in self._list_archives():
            if item.stat().st_mtime < cutoff:
                item.unlink(missing_ok=True)
                Path(f"{item}.sha256").unlink(missing_ok=True)
                removed += 1
        return removed

    def run_backup(self) -> dict[str, Any]:
        """Выполняет синхронный бэкап активных БД, шифрует (если задан ключ) и выгружает в S3."""
        with self._lock:
            now_dt = datetime.now(timezone.utc)
            ts_label = now_dt.strftime("%Y%m%dT%H%M%SZ")
            ran_iso = now_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
            created: list[dict[str, Any]] = []
            errors: list[str] = []

            if self._sqlite_active():
                try:
                    created.append(self._backup_sqlite(ts_label))
                except Exception as exc:
                    errors.append(f"sqlite: {exc}")

            if self._pg_active():
                try:
                    created.append(self._backup_postgres(ts_label))
                except Exception as exc:
                    errors.append(f"postgres: {exc}")

            s3_uploaded_count = 0
            if self.config.s3_configured:
                for item in created:
                    try:
                        s3_info = self._upload_to_s3(item)
                        item.update(s3_info)
                        if s3_info.get("s3Uploaded"):
                            s3_uploaded_count += 1
                            self._s3_uploads_total += 1
                            self._last_s3_upload_at = ran_iso
                            self._last_s3_key = str(s3_info.get("s3Key") or "")
                    except Exception as exc:
                        item["s3Uploaded"] = False
                        errors.append(f"s3({item.get('engine')}): {exc}")

            pruned = self._prune_old_backups(time.time())
            if created:
                self._last_backup_at = ran_iso
                self._last_backup_epoch = time.time()
                self._last_file = created[-1]["file"]
            self._last_error = "; ".join(errors) if errors else None
            return {
                "ok": not errors,
                "ranAt": ran_iso,
                "created": created,
                "s3UploadedCount": s3_uploaded_count,
                "prunedCount": pruned,
                "errors": errors,
                "error": self._last_error,
            }

    def status(self) -> dict[str, Any]:
        archives = self._list_archives()
        recent = []
        total_bytes = 0
        for p in archives:
            sz = int(p.stat().st_size)
            total_bytes += sz
            if len(recent) < 10:
                recent.append(
                    {
                        "file": p.name,
                        "encrypted": p.name.endswith(".enc"),
                        "sizeBytes": sz,
                        "createdAt": datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc).strftime(
                            "%Y-%m-%dT%H:%M:%SZ"
                        ),
                    }
                )
        last_at = self._last_backup_at or (recent[0]["createdAt"] if recent else None)
        last_file = self._last_file or (recent[0]["file"] if recent else None)
        return {
            "enabled": bool(self.config.enabled),
            "backupDir": str(self.backup_dir),
            "intervalHours": int(self.config.interval_hours),
            "retentionDays": int(self.config.retention_days),
            "encryptionEnabled": bool(self.config.encryption_enabled),
            "s3Configured": bool(self.config.s3_configured),
            "s3Bucket": self.config.s3_bucket,
            "s3Prefix": self.config.s3_prefix,
            "s3RequireEncryption": bool(self.config.s3_require_encryption),
            "s3UploadsTotal": int(self._s3_uploads_total),
            "lastS3UploadAt": self._last_s3_upload_at,
            "lastS3Key": self._last_s3_key,
            "sqliteActive": self._sqlite_active(),
            "pgDumpActive": self._pg_active(),
            "filesCount": len(archives),
            "totalBytes": total_bytes,
            "lastBackupAt": last_at,
            "lastFile": last_file,
            "lastError": self._last_error,
            "recentFiles": recent,
        }


__all__ = ["BackupManager", "decrypt_file_aes256", "encrypt_file_aes256"]
