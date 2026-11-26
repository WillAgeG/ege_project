"""PostgreSQL 17 операции с загруженными медиа и заявками на верификацию репетиторов."""

from __future__ import annotations

from typing import Any
import uuid

from databases.sqlite.store import StorageError

from .schema import _iso_utc


class PgMediaMixin:
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
        with self._pool.connection() as conn:
            with conn.transaction():
                conn.execute(
                    """
                    INSERT INTO oltp.media_assets (
                        id, user_id, kind, storage_driver, bucket, object_key,
                        content_type, size_bytes, sha256, original_filename, public_url
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING
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
                    ),
                )
        return self.get_media_asset(aid) or {"id": aid}

    def get_media_asset(self, asset_id: str) -> dict[str, Any] | None:
        aid = str(asset_id or "").strip()
        if not aid:
            return None
        with self._pool.connection() as conn:
            row = conn.execute(
                """
                SELECT id, user_id, kind, storage_driver, bucket, object_key,
                       content_type, size_bytes, sha256, original_filename, public_url, created_at
                FROM oltp.media_assets
                WHERE id = %s
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
            "createdAt": _iso_utc(row["created_at"]),
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
        tutor_updated = False
        with self._pool.connection() as conn:
            with conn.transaction():
                conn.execute(
                    "UPDATE oltp.users SET avatar_url = %s WHERE id = %s",
                    (clean_url or None, uid),
                )
                if update_tutor:
                    cur = conn.execute(
                        """
                        UPDATE oltp.tutors
                        SET photo_url = %s, has_photo = %s, updated_at = NOW()
                        WHERE user_id = %s
                        """,
                        (clean_url, bool(clean_url), uid),
                    )
                    tutor_updated = int(cur.rowcount or 0) > 0
        return {"userId": uid, "avatarUrl": clean_url, "tutorUpdated": tutor_updated}

    @staticmethod
    def _serialize_verification_row(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "userId": int(row["user_id"]) if row["user_id"] is not None else None,
            "tutorId": str(row["tutor_id"] or ""),
            "tutorName": str(row.get("tutor_name") or row.get("user_display_name") or row.get("username") or "Преподаватель"),
            "tutorSubject": str(row.get("tutor_subject") or ""),
            "tutorVerified": bool(row.get("tutor_verified")) if row.get("tutor_verified") is not None else False,
            "username": str(row.get("username") or ""),
            "assetId": str(row["asset_id"]),
            "bucket": str(row.get("bucket") or ""),
            "objectKey": str(row.get("object_key") or ""),
            "storageDriver": str(row.get("storage_driver") or "local"),
            "contentType": str(row.get("content_type") or "application/octet-stream"),
            "sizeBytes": int(row.get("size_bytes") or 0),
            "originalFilename": str(row.get("original_filename") or ""),
            "docType": str(row.get("doc_type") or "diploma"),
            "title": str(row.get("title") or ""),
            "comment": str(row.get("comment") or ""),
            "status": str(row.get("status") or "pending"),
            "reviewNote": str(row.get("review_note") or ""),
            "reviewedBy": str(row.get("reviewed_by") or ""),
            "createdAt": _iso_utc(row.get("created_at")),
            "reviewedAt": _iso_utc(row["reviewed_at"]) if row.get("reviewed_at") else None,
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
        with self._pool.connection() as conn:
            with conn.transaction():
                resolved_tid = str(tutor_id or "").strip()
                if not resolved_tid:
                    trow = conn.execute(
                        "SELECT id FROM oltp.tutors WHERE user_id = %s ORDER BY updated_at DESC LIMIT 1",
                        (uid,),
                    ).fetchone()
                    if trow:
                        resolved_tid = str(trow["id"])
                conn.execute(
                    """
                    INSERT INTO oltp.tutor_verifications (
                        id, user_id, tutor_id, asset_id, doc_type, title, comment, status
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending')
                    ON CONFLICT (id) DO NOTHING
                    """,
                    (
                        vid,
                        uid,
                        resolved_tid,
                        str(asset_id),
                        clean_type,
                        str(title or "")[:120],
                        str(comment or "")[:500],
                    ),
                )
                self._insert_outbox(
                    conn,
                    topic="vektor.tutors.raw.v1",
                    partition_key=resolved_tid or str(uid),
                    event_type="tutor.verification.submitted",
                    user_id=uid,
                    role="tutor",
                    view="cabinet",
                    payload={
                        "verificationId": vid,
                        "tutorId": resolved_tid,
                        "assetId": str(asset_id),
                        "docType": clean_type,
                    },
                )
        return self.get_verification(vid) or {"id": vid, "status": "pending"}

    def get_verification(self, verification_id: str) -> dict[str, Any] | None:
        vid = str(verification_id or "").strip()
        if not vid:
            return None
        with self._pool.connection() as conn:
            row = conn.execute(
                """
                SELECT v.id, v.user_id, v.tutor_id, v.asset_id, v.doc_type, v.title, v.comment,
                       v.status, v.review_note, v.reviewed_by, v.created_at, v.reviewed_at,
                       m.bucket, m.object_key, m.storage_driver, m.content_type, m.size_bytes, m.original_filename,
                       t.full_name AS tutor_name, t.subject AS tutor_subject, t.verified AS tutor_verified,
                       u.username AS username, u.display_name AS user_display_name
                FROM oltp.tutor_verifications v
                JOIN oltp.media_assets m ON m.id = v.asset_id
                LEFT JOIN oltp.tutors t ON t.id = v.tutor_id
                LEFT JOIN oltp.users u ON u.id = v.user_id
                WHERE v.id = %s
                """,
                (vid,),
            ).fetchone()
        return self._serialize_verification_row(row) if row else None

    def list_user_verifications(self, user_id: int) -> list[dict[str, Any]]:
        uid = int(user_id)
        with self._pool.connection() as conn:
            rows = conn.execute(
                """
                SELECT v.id, v.user_id, v.tutor_id, v.asset_id, v.doc_type, v.title, v.comment,
                       v.status, v.review_note, v.reviewed_by, v.created_at, v.reviewed_at,
                       m.bucket, m.object_key, m.storage_driver, m.content_type, m.size_bytes, m.original_filename,
                       t.full_name AS tutor_name, t.subject AS tutor_subject, t.verified AS tutor_verified,
                       u.username AS username, u.display_name AS user_display_name
                FROM oltp.tutor_verifications v
                JOIN oltp.media_assets m ON m.id = v.asset_id
                LEFT JOIN oltp.tutors t ON t.id = v.tutor_id
                LEFT JOIN oltp.users u ON u.id = v.user_id
                WHERE v.user_id = %s
                ORDER BY v.created_at DESC
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
        where = "WHERE v.status = %s" if clean_st in ("pending", "approved", "rejected") else ""
        params: list[Any] = [clean_st] if where else []
        params.append(max(1, min(500, int(limit))))
        with self._pool.connection() as conn:
            rows = conn.execute(
                f"""
                SELECT v.id, v.user_id, v.tutor_id, v.asset_id, v.doc_type, v.title, v.comment,
                       v.status, v.review_note, v.reviewed_by, v.created_at, v.reviewed_at,
                       m.bucket, m.object_key, m.storage_driver, m.content_type, m.size_bytes, m.original_filename,
                       t.full_name AS tutor_name, t.subject AS tutor_subject, t.verified AS tutor_verified,
                       u.username AS username, u.display_name AS user_display_name
                FROM oltp.tutor_verifications v
                JOIN oltp.media_assets m ON m.id = v.asset_id
                LEFT JOIN oltp.tutors t ON t.id = v.tutor_id
                LEFT JOIN oltp.users u ON u.id = v.user_id
                {where}
                ORDER BY CASE WHEN v.status = 'pending' THEN 0 ELSE 1 END, v.created_at DESC
                LIMIT %s
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
        verified_granted = False
        resolved_tid = ""
        with self._pool.connection() as conn:
            with conn.transaction():
                row = conn.execute(
                    "SELECT id, user_id, tutor_id FROM oltp.tutor_verifications WHERE id = %s",
                    (vid,),
                ).fetchone()
                if not row:
                    raise StorageError("verification_not_found", "Заявка на верификацию не найдена.", 404)

                uid = int(row["user_id"]) if row["user_id"] is not None else None
                resolved_tid = str(row["tutor_id"] or "")

                conn.execute(
                    """
                    UPDATE oltp.tutor_verifications
                    SET status = %s, review_note = %s, reviewed_by = %s, reviewed_at = NOW()
                    WHERE id = %s
                    """,
                    (next_status, str(review_note or "")[:300], str(reviewer or "admin")[:64], vid),
                )

                if next_status == "approved":
                    if resolved_tid:
                        cur = conn.execute(
                            "UPDATE oltp.tutors SET verified = TRUE, updated_at = NOW() WHERE id = %s",
                            (resolved_tid,),
                        )
                        verified_granted = int(cur.rowcount or 0) > 0
                    if not verified_granted and uid is not None:
                        cur = conn.execute(
                            "UPDATE oltp.tutors SET verified = TRUE, updated_at = NOW() WHERE user_id = %s",
                            (uid,),
                        )
                        verified_granted = int(cur.rowcount or 0) > 0
                        if not resolved_tid:
                            trow = conn.execute(
                                "SELECT id FROM oltp.tutors WHERE user_id = %s LIMIT 1", (uid,)
                            ).fetchone()
                            if trow:
                                resolved_tid = str(trow["id"])

                self._insert_outbox(
                    conn,
                    topic="vektor.tutors.raw.v1",
                    partition_key=resolved_tid or vid,
                    event_type="tutor.verification.reviewed",
                    user_id=uid,
                    role="admin",
                    view="admin",
                    payload={
                        "verificationId": vid,
                        "tutorId": resolved_tid,
                        "status": next_status,
                        "verifiedGranted": verified_granted,
                    },
                )

        ver = self.get_verification(vid) or {"id": vid, "status": next_status}
        return {
            "verification": ver,
            "tutorId": resolved_tid,
            "verifiedGranted": verified_granted,
        }


__all__ = ["PgMediaMixin"]
