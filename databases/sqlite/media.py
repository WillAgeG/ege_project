"""Операции SQLite с загруженными медиа-объектами и заявками на верификацию репетиторов."""

from __future__ import annotations

import json
from typing import Any
import uuid

from .common import StorageError, _iso_utc_now


class SqliteMediaMixin:
    def create_media_asset(
        self,
        *,
        asset_id: str | None = None,
        user_id: int | None,
        kind: str,
        storage_driver: str,
        bucket: str,
        object_key: str,
        content_type: str,
        size_bytes: int,
        sha256: str = "",
        original_filename: str = "",
        public_url: str | None = None,
    ) -> dict[str, Any]:
        clean_kind = str(kind or "avatar").strip().lower()
        if clean_kind not in ("avatar", "diploma", "feedback", "chat"):
            raise StorageError("invalid_media_kind", "Допустимы типы media: avatar, diploma, feedback, chat.", 400)
        aid = str(asset_id or f"med-{uuid.uuid4().hex[:14]}")
        now_iso = _iso_utc_now()
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO media_assets (
                    id, user_id, kind, storage_driver, bucket, object_key,
                    content_type, size_bytes, sha256, original_filename, public_url, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    aid,
                    int(user_id) if user_id is not None else None,
                    clean_kind,
                    str(storage_driver or "local"),
                    str(bucket),
                    str(object_key),
                    str(content_type),
                    max(0, int(size_bytes)),
                    str(sha256 or ""),
                    str(original_filename or "")[:180],
                    public_url,
                    now_iso,
                ),
            )
            self._conn.commit()
        return self.get_media_asset(aid) or {
            "id": aid,
            "userId": user_id,
            "kind": clean_kind,
            "storageDriver": storage_driver,
            "bucket": bucket,
            "objectKey": object_key,
            "contentType": content_type,
            "sizeBytes": int(size_bytes),
            "sha256": sha256,
            "originalFilename": original_filename,
            "publicUrl": public_url,
            "createdAt": now_iso,
        }

    def get_media_asset(self, asset_id: str) -> dict[str, Any] | None:
        aid = str(asset_id or "").strip()
        if not aid:
            return None
        with self._lock:
            row = self._conn.execute(
                """
                SELECT id, user_id, kind, storage_driver, bucket, object_key,
                       content_type, size_bytes, sha256, original_filename, public_url, created_at
                FROM media_assets
                WHERE id = ?
                """,
                (aid,),
            ).fetchone()
        if not row:
            return None
        return {
            "id": str(row["id"]),
            "userId": int(row["user_id"]) if row["user_id"] is not None else None,
            "kind": str(row["kind"]),
            "storageDriver": str(row["storage_driver"]),
            "bucket": str(row["bucket"]),
            "objectKey": str(row["object_key"]),
            "contentType": str(row["content_type"]),
            "sizeBytes": int(row["size_bytes"] or 0),
            "sha256": str(row["sha256"] or ""),
            "originalFilename": str(row["original_filename"] or ""),
            "publicUrl": row["public_url"],
            "createdAt": str(row["created_at"]),
        }

    def set_user_avatar_url(
        self,
        user_id: int,
        avatar_url: str,
        *,
        update_tutor: bool = False,
    ) -> dict[str, Any]:
        uid = int(user_id)
        clean_url = str(avatar_url or "").strip()[:512]
        now_iso = _iso_utc_now()
        with self._lock:
            self._conn.execute(
                "UPDATE users SET avatar_url = ? WHERE id = ?",
                (clean_url or None, uid),
            )
            tutor_updated = False
            if update_tutor:
                cur = self._conn.execute(
                    """
                    UPDATE admin_tutors
                    SET photo_url = ?, has_photo = ?, updated_at = ?
                    WHERE user_id = ?
                    """,
                    (clean_url, 1 if clean_url else 0, now_iso, uid),
                )
                tutor_updated = int(cur.rowcount or 0) > 0
            self._conn.commit()
        return {"userId": uid, "avatarUrl": clean_url, "tutorUpdated": tutor_updated}

    @staticmethod
    def _serialize_verification_row(row: Any) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "userId": int(row["user_id"]) if row["user_id"] is not None else None,
            "tutorId": str(row["tutor_id"] or ""),
            "tutorName": str(row["tutor_name"] or row["user_display_name"] or row["username"] or "Преподаватель"),
            "tutorSubject": str(row["tutor_subject"] or ""),
            "tutorVerified": bool(row["tutor_verified"]) if row["tutor_verified"] is not None else False,
            "username": str(row["username"] or ""),
            "assetId": str(row["asset_id"]),
            "bucket": str(row["bucket"] or ""),
            "objectKey": str(row["object_key"] or ""),
            "storageDriver": str(row["storage_driver"] or "local"),
            "contentType": str(row["content_type"] or "application/octet-stream"),
            "sizeBytes": int(row["size_bytes"] or 0),
            "originalFilename": str(row["original_filename"] or ""),
            "docType": str(row["doc_type"] or "diploma"),
            "title": str(row["title"] or ""),
            "comment": str(row["comment"] or ""),
            "status": str(row["status"] or "pending"),
            "reviewNote": str(row["review_note"] or ""),
            "reviewedBy": str(row["reviewed_by"] or ""),
            "createdAt": str(row["created_at"] or ""),
            "reviewedAt": row["reviewed_at"],
        }

    def create_tutor_verification(
        self,
        *,
        verification_id: str | None = None,
        user_id: int,
        asset_id: str,
        doc_type: str = "diploma",
        title: str = "",
        comment: str = "",
        tutor_id: str = "",
    ) -> dict[str, Any]:
        clean_type = str(doc_type or "diploma").strip().lower()
        if clean_type not in ("diploma", "ege_expert", "certificate", "other"):
            clean_type = "diploma"
        vid = str(verification_id or f"ver-{uuid.uuid4().hex[:12]}")
        uid = int(user_id)
        now_iso = _iso_utc_now()
        with self._lock:
            resolved_tid = str(tutor_id or "").strip()
            if not resolved_tid:
                trow = self._conn.execute(
                    "SELECT id FROM admin_tutors WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1",
                    (uid,),
                ).fetchone()
                if trow:
                    resolved_tid = str(trow["id"])
            self._conn.execute(
                """
                INSERT INTO tutor_verifications (
                    id, user_id, tutor_id, asset_id, doc_type, title, comment,
                    status, review_note, reviewed_by, created_at, reviewed_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', '', '', ?, NULL)
                """,
                (
                    vid,
                    uid,
                    resolved_tid,
                    str(asset_id),
                    clean_type,
                    str(title or "")[:120],
                    str(comment or "")[:500],
                    now_iso,
                ),
            )
            self._conn.execute(
                """
                INSERT INTO admin_outbox_events (topic, partition_key, event_type, payload, created_at)
                VALUES ('vektor.tutors.raw.v1', ?, 'tutor.verification.submitted', ?, ?)
                """,
                (
                    resolved_tid or str(uid),
                    json.dumps(
                        {
                            "verificationId": vid,
                            "userId": uid,
                            "tutorId": resolved_tid,
                            "assetId": str(asset_id),
                            "docType": clean_type,
                        },
                        ensure_ascii=False,
                    ),
                    now_iso,
                ),
            )
            self._conn.commit()
        return self.get_verification(vid) or {"id": vid, "status": "pending"}

    def get_verification(self, verification_id: str) -> dict[str, Any] | None:
        vid = str(verification_id or "").strip()
        if not vid:
            return None
        with self._lock:
            row = self._conn.execute(
                """
                SELECT v.id, v.user_id, v.tutor_id, v.asset_id, v.doc_type, v.title, v.comment,
                       v.status, v.review_note, v.reviewed_by, v.created_at, v.reviewed_at,
                       m.bucket, m.object_key, m.storage_driver, m.content_type, m.size_bytes, m.original_filename,
                       t.full_name AS tutor_name, t.subject AS tutor_subject, t.verified AS tutor_verified,
                       u.username AS username, u.display_name AS user_display_name
                FROM tutor_verifications v
                JOIN media_assets m ON m.id = v.asset_id
                LEFT JOIN admin_tutors t ON t.id = v.tutor_id
                LEFT JOIN users u ON u.id = v.user_id
                WHERE v.id = ?
                """,
                (vid,),
            ).fetchone()
        return self._serialize_verification_row(row) if row else None

    def list_user_verifications(self, user_id: int) -> list[dict[str, Any]]:
        uid = int(user_id)
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT v.id, v.user_id, v.tutor_id, v.asset_id, v.doc_type, v.title, v.comment,
                       v.status, v.review_note, v.reviewed_by, v.created_at, v.reviewed_at,
                       m.bucket, m.object_key, m.storage_driver, m.content_type, m.size_bytes, m.original_filename,
                       t.full_name AS tutor_name, t.subject AS tutor_subject, t.verified AS tutor_verified,
                       u.username AS username, u.display_name AS user_display_name
                FROM tutor_verifications v
                JOIN media_assets m ON m.id = v.asset_id
                LEFT JOIN admin_tutors t ON t.id = v.tutor_id
                LEFT JOIN users u ON u.id = v.user_id
                WHERE v.user_id = ?
                ORDER BY v.created_at DESC, v.rowid DESC
                """,
                (uid,),
            ).fetchall()
        return [self._serialize_verification_row(r) for r in rows]

    def admin_list_verifications(
        self,
        *,
        status: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        clean_st = (status or "").strip().lower()
        where = ""
        params: list[Any] = []
        if clean_st in ("pending", "approved", "rejected"):
            where = "WHERE v.status = ?"
            params.append(clean_st)
        params.append(max(1, min(500, int(limit))))
        with self._lock:
            rows = self._conn.execute(
                f"""
                SELECT v.id, v.user_id, v.tutor_id, v.asset_id, v.doc_type, v.title, v.comment,
                       v.status, v.review_note, v.reviewed_by, v.created_at, v.reviewed_at,
                       m.bucket, m.object_key, m.storage_driver, m.content_type, m.size_bytes, m.original_filename,
                       t.full_name AS tutor_name, t.subject AS tutor_subject, t.verified AS tutor_verified,
                       u.username AS username, u.display_name AS user_display_name
                FROM tutor_verifications v
                JOIN media_assets m ON m.id = v.asset_id
                LEFT JOIN admin_tutors t ON t.id = v.tutor_id
                LEFT JOIN users u ON u.id = v.user_id
                {where}
                ORDER BY CASE WHEN v.status = 'pending' THEN 0 ELSE 1 END, v.created_at DESC
                LIMIT ?
                """,
                tuple(params),
            ).fetchall()
        return [self._serialize_verification_row(r) for r in rows]

    def admin_review_verification(
        self,
        verification_id: str,
        action: str,
        *,
        review_note: str = "",
        reviewer: str = "admin",
    ) -> dict[str, Any]:
        act = str(action or "").strip().lower()
        if act in ("approve", "approved"):
            next_status = "approved"
        elif act in ("reject", "rejected"):
            next_status = "rejected"
        else:
            raise StorageError("invalid_action", "Допустимые действия: approve или reject.", 400)

        vid = str(verification_id or "").strip()
        now_iso = _iso_utc_now()
        verified_granted = False
        resolved_tid = ""
        with self._lock:
            row = self._conn.execute(
                "SELECT id, user_id, tutor_id FROM tutor_verifications WHERE id = ?",
                (vid,),
            ).fetchone()
            if not row:
                raise StorageError("verification_not_found", "Заявка на верификацию не найдена.", 404)

            uid = int(row["user_id"]) if row["user_id"] is not None else None
            resolved_tid = str(row["tutor_id"] or "")

            self._conn.execute(
                """
                UPDATE tutor_verifications
                SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ?
                WHERE id = ?
                """,
                (next_status, str(review_note or "")[:300], str(reviewer or "admin")[:64], now_iso, vid),
            )

            if next_status == "approved":
                if resolved_tid:
                    cur = self._conn.execute(
                        "UPDATE admin_tutors SET verified = 1, updated_at = ? WHERE id = ?",
                        (now_iso, resolved_tid),
                    )
                    verified_granted = int(cur.rowcount or 0) > 0
                if not verified_granted and uid is not None:
                    cur = self._conn.execute(
                        "UPDATE admin_tutors SET verified = 1, updated_at = ? WHERE user_id = ?",
                        (now_iso, uid),
                    )
                    verified_granted = int(cur.rowcount or 0) > 0
                    if not resolved_tid:
                        trow = self._conn.execute(
                            "SELECT id FROM admin_tutors WHERE user_id = ? LIMIT 1", (uid,)
                        ).fetchone()
                        if trow:
                            resolved_tid = str(trow["id"])

            self._conn.execute(
                """
                INSERT INTO admin_outbox_events (topic, partition_key, event_type, payload, created_at)
                VALUES ('vektor.tutors.raw.v1', ?, 'tutor.verification.reviewed', ?, ?)
                """,
                (
                    resolved_tid or vid,
                    json.dumps(
                        {
                            "verificationId": vid,
                            "tutorId": resolved_tid,
                            "status": next_status,
                            "verifiedGranted": verified_granted,
                        },
                        ensure_ascii=False,
                    ),
                    now_iso,
                ),
            )
            self._conn.commit()

        ver = self.get_verification(vid) or {"id": vid, "status": next_status}
        return {
            "verification": ver,
            "tutorId": resolved_tid,
            "verifiedGranted": verified_granted,
        }


__all__ = ["SqliteMediaMixin"]
