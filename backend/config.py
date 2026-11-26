"""Конфигурация сервера через переменные окружения."""

from dataclasses import dataclass
import os
from pathlib import Path
import re

ROOT_DIR = Path(__file__).resolve().parent.parent

DEFAULT_MODELS = {
    "gemini": ("gemini-3.8-flash", "gemini-3.1-pro-preview"),
    "openai": ("gpt-6.1-terra", "gpt-6.1-sol"),
    "anthropic": ("claude-sonnet-5-5", "claude-opus-5-5"),
    "openrouter": ("google/gemini-3.8-flash", "anthropic/claude-sonnet-5-5"),
}

PROVIDER_ENV_KEYS = (
    ("gemini", "GEMINI_API_KEY"),
    ("openai", "OPENAI_API_KEY"),
    ("anthropic", "ANTHROPIC_API_KEY"),
    ("openrouter", "OPENROUTER_API_KEY"),
)


def _int_env(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _float_env(name: str, default: float) -> float:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _bool_env(name: str, default: bool) -> bool:
    raw = os.environ.get(name, "").strip().lower()
    if not raw:
        return default
    if raw in ("1", "true", "yes", "on"):
        return True
    if raw in ("0", "false", "no", "off"):
        return False
    return default


def _csv_env(name: str) -> tuple[str, ...]:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return ()
    return tuple(item.strip().rstrip("/") for item in raw.split(",") if item.strip())


def resolve_db_path() -> Path:
    explicit = os.environ.get("DB_PATH", "").strip()
    if explicit:
        return Path(explicit)
    vol = os.environ.get("RAILWAY_VOLUME_MOUNT_PATH", "").strip()
    if vol:
        return Path(vol) / "app.db"
    return ROOT_DIR / ".local_data" / "app.db"


@dataclass(frozen=True)
class AIConfig:
    provider: str | None
    api_key: str | None
    model: str | None
    model_complex: str | None
    base_url: str | None

    @property
    def enabled(self) -> bool:
        return bool(self.provider and self.api_key)


def load_ai_config() -> AIConfig:
    wanted = os.environ.get("AI_PROVIDER", "auto").strip().lower()
    explicit_key = os.environ.get("AI_API_KEY", "").strip()
    provider: str | None = None
    api_key: str | None = None

    if wanted in ("", "auto"):
        for p, env_name in PROVIDER_ENV_KEYS:
            val = os.environ.get(env_name, "").strip()
            if val:
                provider, api_key = p, val
                break
    elif wanted in DEFAULT_MODELS:
        provider = wanted
        env_name = dict(PROVIDER_ENV_KEYS)[wanted]
        api_key = explicit_key or os.environ.get(env_name, "").strip() or None

    if not provider or not api_key:
        return AIConfig(provider=None, api_key=None, model=None, model_complex=None, base_url=None)

    def_fast, def_complex = DEFAULT_MODELS[provider]
    model = os.environ.get("AI_MODEL", "").strip() or def_fast
    model_complex = os.environ.get("AI_MODEL_COMPLEX", "").strip() or def_complex
    base_url = os.environ.get("AI_BASE_URL", "").strip().rstrip("/") or None
    return AIConfig(provider=provider, api_key=api_key, model=model, model_complex=model_complex, base_url=base_url)


@dataclass(frozen=True)
class GoogleOAuthConfig:
    client_id: str | None
    client_secret: str | None

    @property
    def enabled(self) -> bool:
        return bool(self.client_id and self.client_secret)


def load_google_oauth_config() -> GoogleOAuthConfig:
    cid = os.environ.get("GOOGLE_CLIENT_ID", "").strip() or None
    csec = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip() or None
    return GoogleOAuthConfig(client_id=cid, client_secret=csec)


@dataclass(frozen=True)
class TelegramAuthConfig:
    bot_username: str | None = None
    bot_token: str | None = None
    webhook_secret: str | None = None
    admin_chat_id: str | None = None

    @property
    def enabled(self) -> bool:
        return bool(self.bot_username and self.bot_token)

    @property
    def bot_api_enabled(self) -> bool:
        return bool(self.bot_token)


def load_telegram_auth_config() -> TelegramAuthConfig:
    bot_user = os.environ.get("TELEGRAM_BOT_USERNAME", "").strip().lstrip("@") or None
    bot_tok = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip() or None
    wh_sec = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "").strip() or None
    adm_chat = os.environ.get("TELEGRAM_ADMIN_CHAT_ID", "").strip() or None
    return TelegramAuthConfig(
        bot_username=bot_user,
        bot_token=bot_tok,
        webhook_secret=wh_sec,
        admin_chat_id=adm_chat,
    )


@dataclass(frozen=True)
class SchedulerConfig:
    enabled: bool = True
    interval_sec: int = 60
    initial_delay_sec: int = 15
    lesson_duration_min: int = 60
    auto_capture_grace_min: int = 15
    pending_ttl_hours: int = 24
    reminder_24h_min: int = 24 * 60
    reminder_1h_min: int = 60
    chat_unanswered_delay_sec: int = 60
    chat_unanswered_max_age_hours: int = 24
    chat_check_interval_sec: int = 15
    realtime_retention_days: int = 30
    advisory_lock_enabled: bool = True


def load_scheduler_config() -> SchedulerConfig:
    return SchedulerConfig(
        enabled=_bool_env("SCHEDULER_ENABLED", True),
        interval_sec=max(5, _int_env("SCHEDULER_INTERVAL_SEC", 60)),
        initial_delay_sec=max(0, _int_env("SCHEDULER_INITIAL_DELAY_SEC", 15)),
        lesson_duration_min=max(15, _int_env("SCHEDULER_LESSON_DURATION_MIN", 60)),
        auto_capture_grace_min=max(0, _int_env("SCHEDULER_AUTO_CAPTURE_GRACE_MIN", 15)),
        pending_ttl_hours=max(1, _int_env("SCHEDULER_PENDING_TTL_HOURS", 24)),
        reminder_24h_min=max(180, _int_env("SCHEDULER_REMINDER_24H_MIN", 24 * 60)),
        reminder_1h_min=max(10, _int_env("SCHEDULER_REMINDER_1H_MIN", 60)),
        chat_unanswered_delay_sec=max(5, _int_env("SCHEDULER_CHAT_UNANSWERED_DELAY_SEC", 60)),
        chat_unanswered_max_age_hours=max(1, _int_env("SCHEDULER_CHAT_UNANSWERED_MAX_AGE_HOURS", 24)),
        chat_check_interval_sec=max(5, _int_env("SCHEDULER_CHAT_CHECK_INTERVAL_SEC", 15)),
        realtime_retention_days=max(1, _int_env("SCHEDULER_REALTIME_RETENTION_DAYS", 30)),
        advisory_lock_enabled=_bool_env("SCHEDULER_ADVISORY_LOCK_ENABLED", True),
    )


@dataclass(frozen=True)
class BackupConfig:
    enabled: bool = True
    interval_hours: int = 24
    retention_days: int = 14
    backup_dir: Path | None = None
    encryption_key: str | None = None
    s3_bucket: str | None = None
    s3_prefix: str = "backups"
    s3_endpoint_url: str | None = None
    s3_region: str = "ru-central1"
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None
    s3_require_encryption: bool = False

    @property
    def encryption_enabled(self) -> bool:
        return bool((self.encryption_key or "").strip())

    @property
    def s3_configured(self) -> bool:
        return bool(
            self.s3_bucket
            and self.s3_endpoint_url
            and self.s3_access_key_id
            and self.s3_secret_access_key
        )


def load_backup_config() -> BackupConfig:
    raw_dir = os.environ.get("BACKUP_DIR", "").strip()
    raw_prefix = os.environ.get("BACKUP_S3_PREFIX", "backups").strip().strip("/") or "backups"
    endpoint = (
        os.environ.get("BACKUP_S3_ENDPOINT_URL") or os.environ.get("S3_ENDPOINT_URL") or ""
    ).strip().rstrip("/") or None
    region = (
        os.environ.get("BACKUP_S3_REGION") or os.environ.get("S3_REGION") or "ru-central1"
    ).strip() or "ru-central1"
    access_key = (
        os.environ.get("BACKUP_S3_ACCESS_KEY_ID") or os.environ.get("S3_ACCESS_KEY_ID") or ""
    ).strip() or None
    secret_key = (
        os.environ.get("BACKUP_S3_SECRET_ACCESS_KEY") or os.environ.get("S3_SECRET_ACCESS_KEY") or ""
    ).strip() or None
    return BackupConfig(
        enabled=_bool_env("BACKUP_ENABLED", True),
        interval_hours=max(1, _int_env("BACKUP_INTERVAL_HOURS", 24)),
        retention_days=max(1, _int_env("BACKUP_RETENTION_DAYS", 14)),
        backup_dir=Path(raw_dir) if raw_dir else None,
        encryption_key=os.environ.get("BACKUP_ENCRYPTION_KEY", "").strip() or None,
        s3_bucket=os.environ.get("BACKUP_S3_BUCKET", "").strip() or None,
        s3_prefix=raw_prefix,
        s3_endpoint_url=endpoint,
        s3_region=region,
        s3_access_key_id=access_key,
        s3_secret_access_key=secret_key,
        s3_require_encryption=_bool_env("BACKUP_S3_REQUIRE_ENCRYPTION", False),
    )


@dataclass(frozen=True)
class MonitoringConfig:
    alert_5xx_enabled: bool = True
    alert_cooldown_sec: int = 300
    sentry_dsn: str | None = None
    sentry_traces_sample_rate: float = 0.0
    release: str = "vektor-ege@1.2.0"
    json_logs: bool = False
    log_level: str = "INFO"
    metrics_enabled: bool = True
    metrics_token: str = ""


def load_monitoring_config(*, is_prod: bool = False) -> MonitoringConfig:
    raw_rate = _float_env("SENTRY_TRACES_SAMPLE_RATE", 0.0)
    bounded_rate = max(0.0, min(1.0, raw_rate))
    dsn = os.environ.get("SENTRY_DSN", "").strip() or None
    rel = os.environ.get("APP_RELEASE", "").strip() or "vektor-ege@1.2.0"
    raw_log_fmt = os.environ.get("LOG_FORMAT", "").strip().lower()
    if raw_log_fmt == "json":
        json_logs = True
    elif raw_log_fmt == "text":
        json_logs = False
    else:
        json_logs = _bool_env("JSON_LOGS", is_prod)
    raw_level = os.environ.get("LOG_LEVEL", "INFO").strip().upper()
    log_level = raw_level if raw_level in ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL") else "INFO"
    return MonitoringConfig(
        alert_5xx_enabled=_bool_env("ALERT_5XX_ENABLED", True),
        alert_cooldown_sec=max(10, _int_env("ALERT_COOLDOWN_SEC", 300)),
        sentry_dsn=dsn,
        sentry_traces_sample_rate=bounded_rate,
        release=rel,
        json_logs=json_logs,
        log_level=log_level,
        metrics_enabled=_bool_env("METRICS_ENABLED", True),
        metrics_token=os.environ.get("METRICS_TOKEN", "").strip(),
    )


_METRIKA_ID_RE = re.compile(r"^\d{4,15}$")


@dataclass(frozen=True)
class AnalyticsConfig:
    yandex_metrika_id: str | None = None
    yandex_metrika_webvisor: bool = False

    @property
    def enabled(self) -> bool:
        return bool(self.yandex_metrika_id)


def load_analytics_config() -> AnalyticsConfig:
    raw_id = os.environ.get("YANDEX_METRIKA_ID", "").strip()
    clean_id = raw_id if _METRIKA_ID_RE.match(raw_id) else None
    return AnalyticsConfig(
        yandex_metrika_id=clean_id,
        yandex_metrika_webvisor=_bool_env("YANDEX_METRIKA_WEBVISOR", False),
    )


@dataclass(frozen=True)
class MediaConfig:
    storage: str = "auto"
    local_dir: Path | None = None
    s3_endpoint_url: str | None = None
    s3_region: str = "ru-central1"
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None
    s3_bucket_avatars: str = "avatars-public"
    s3_bucket_diplomas: str = "diplomas-private"
    s3_public_base_url: str | None = None
    max_avatar_bytes: int = 5 * 1024 * 1024
    max_diploma_bytes: int = 10 * 1024 * 1024
    max_feedback_bytes: int = 20 * 1024 * 1024
    max_feedback_files: int = 5
    max_chat_bytes: int = 20 * 1024 * 1024
    max_chat_files: int = 5
    presign_ttl_sec: int = 900
    avatar_webp_enabled: bool = True
    avatar_max_dim: int = 512
    avatar_webp_quality: int = 82
    public_redirect: bool = False
    private_presign_redirect: bool = False

    @property
    def s3_configured(self) -> bool:
        return bool(self.s3_endpoint_url and self.s3_access_key_id and self.s3_secret_access_key)


def load_media_config() -> MediaConfig:
    raw_storage = os.environ.get("MEDIA_STORAGE", "auto").strip().lower()
    storage = raw_storage if raw_storage in ("auto", "local", "s3") else "auto"
    raw_dir = os.environ.get("MEDIA_LOCAL_DIR", "").strip()
    return MediaConfig(
        storage=storage,
        local_dir=Path(raw_dir) if raw_dir else None,
        s3_endpoint_url=os.environ.get("S3_ENDPOINT_URL", "").strip().rstrip("/") or None,
        s3_region=os.environ.get("S3_REGION", "ru-central1").strip() or "ru-central1",
        s3_access_key_id=os.environ.get("S3_ACCESS_KEY_ID", "").strip() or None,
        s3_secret_access_key=os.environ.get("S3_SECRET_ACCESS_KEY", "").strip() or None,
        s3_bucket_avatars=os.environ.get("S3_BUCKET_AVATARS", "avatars-public").strip() or "avatars-public",
        s3_bucket_diplomas=os.environ.get("S3_BUCKET_DIPLOMAS", "diplomas-private").strip() or "diplomas-private",
        s3_public_base_url=os.environ.get("S3_PUBLIC_BASE_URL", "").strip().rstrip("/") or None,
        max_avatar_bytes=max(65536, _int_env("MEDIA_MAX_AVATAR_BYTES", 5 * 1024 * 1024)),
        max_diploma_bytes=max(65536, _int_env("MEDIA_MAX_DIPLOMA_BYTES", 10 * 1024 * 1024)),
        max_feedback_bytes=max(65536, min(52_428_800, _int_env("MEDIA_MAX_FEEDBACK_BYTES", 20 * 1024 * 1024))),
        max_feedback_files=max(1, min(10, _int_env("MEDIA_MAX_FEEDBACK_FILES", 5))),
        max_chat_bytes=max(
            65536,
            min(52_428_800, _int_env("VEKTOR_MEDIA_MAX_CHAT_BYTES", _int_env("MEDIA_MAX_CHAT_BYTES", 20 * 1024 * 1024))),
        ),
        max_chat_files=max(1, min(10, _int_env("VEKTOR_MEDIA_MAX_CHAT_FILES", _int_env("MEDIA_MAX_CHAT_FILES", 5)))),
        presign_ttl_sec=max(60, _int_env("MEDIA_PRESIGN_TTL_SEC", 900)),
        avatar_webp_enabled=_bool_env("MEDIA_AVATAR_WEBP", True),
        avatar_max_dim=max(64, min(2048, _int_env("MEDIA_AVATAR_MAX_DIM", 512))),
        avatar_webp_quality=max(40, min(98, _int_env("MEDIA_AVATAR_WEBP_QUALITY", 82))),
        public_redirect=_bool_env("MEDIA_PUBLIC_REDIRECT", False),
        private_presign_redirect=_bool_env("MEDIA_PRIVATE_PRESIGN_REDIRECT", False),
    )


@dataclass(frozen=True)
class PaymentsConfig:
    provider: str = "auto"  # auto | demo | yookassa
    yookassa_shop_id: str | None = None
    yookassa_secret_key: str | None = None
    yookassa_api_url: str = "https://api.yookassa.ru/v3"
    yookassa_receipt_enabled: bool = True
    yookassa_vat_code: int = 1
    yookassa_tax_system_code: int | None = None
    yookassa_payment_mode: str = "advance"
    yookassa_payment_subject: str = "payment"
    yookassa_check_webhook_ip: bool = True
    yookassa_fallback_receipt_email: str | None = None

    @property
    def yookassa_configured(self) -> bool:
        return bool(self.yookassa_shop_id and self.yookassa_secret_key)

    @property
    def active_provider(self) -> str:
        if self.provider == "yookassa":
            return "yookassa"
        if self.provider == "auto" and self.yookassa_configured:
            return "yookassa"
        return "demo"


def load_payments_config() -> PaymentsConfig:
    raw_provider = os.environ.get("PAYMENTS_PROVIDER", "auto").strip().lower()
    provider = raw_provider if raw_provider in ("auto", "demo", "yookassa") else "auto"
    raw_vat = _int_env("YOOKASSA_VAT_CODE", 1)
    vat_code = raw_vat if 1 <= raw_vat <= 6 else 1
    raw_tax_str = os.environ.get("YOOKASSA_TAX_SYSTEM_CODE", "").strip()
    tax_code: int | None = None
    if raw_tax_str.isdigit():
        tval = int(raw_tax_str)
        if 1 <= tval <= 6:
            tax_code = tval
    pay_mode = os.environ.get("YOOKASSA_PAYMENT_MODE", "advance").strip() or "advance"
    pay_subj = os.environ.get("YOOKASSA_PAYMENT_SUBJECT", "payment").strip() or "payment"
    return PaymentsConfig(
        provider=provider,
        yookassa_shop_id=os.environ.get("YOOKASSA_SHOP_ID", "").strip() or None,
        yookassa_secret_key=os.environ.get("YOOKASSA_SECRET_KEY", "").strip() or None,
        yookassa_api_url=(
            os.environ.get("YOOKASSA_API_URL", "https://api.yookassa.ru/v3").strip().rstrip("/")
            or "https://api.yookassa.ru/v3"
        ),
        yookassa_receipt_enabled=_bool_env("YOOKASSA_RECEIPT_ENABLED", True),
        yookassa_vat_code=vat_code,
        yookassa_tax_system_code=tax_code,
        yookassa_payment_mode=pay_mode,
        yookassa_payment_subject=pay_subj,
        yookassa_check_webhook_ip=_bool_env("YOOKASSA_CHECK_WEBHOOK_IP", True),
        yookassa_fallback_receipt_email=os.environ.get("YOOKASSA_FALLBACK_RECEIPT_EMAIL", "").strip() or None,
    )


@dataclass(frozen=True)
class PayoutsConfig:
    provider: str = "auto"  # auto | manual | yookassa
    yookassa_agent_id: str | None = None
    yookassa_secret_key: str | None = None
    yookassa_api_url: str = "https://api.yookassa.ru/v3"
    auto_dispatch: bool = True
    auto_max_rub: int = 15_000
    antifraud_min_lessons: int = 1
    check_webhook_ip: bool = True
    npd_provider: str = "auto"  # auto | demo | partner | lknpd
    npd_status_api_url: str = "https://statusnpd.nalog.ru/api/v1/tracker/taxpayer_status"
    npd_check_status_online: bool = False
    npd_partner_api_url: str | None = None
    npd_partner_api_key: str | None = None
    npd_lknpd_api_url: str = "https://lknpd.nalog.ru/api/v1"
    npd_lknpd_token: str | None = None
    npd_platform_inn: str | None = None
    npd_platform_name: str = "ООО «Вектор»"

    @property
    def yookassa_payouts_configured(self) -> bool:
        return bool(self.yookassa_agent_id and self.yookassa_secret_key)

    @property
    def active_provider(self) -> str:
        if self.provider == "yookassa":
            return "yookassa"
        if self.provider == "auto" and self.yookassa_payouts_configured:
            return "yookassa"
        return "manual"

    @property
    def npd_partner_configured(self) -> bool:
        return bool(self.npd_partner_api_url and self.npd_partner_api_key)

    @property
    def npd_lknpd_configured(self) -> bool:
        return bool(self.npd_lknpd_token)

    @property
    def active_npd_provider(self) -> str:
        if self.npd_provider in ("partner", "lknpd", "demo"):
            return self.npd_provider
        if self.npd_partner_configured:
            return "partner"
        if self.npd_lknpd_configured:
            return "lknpd"
        return "demo"


def load_payouts_config() -> PayoutsConfig:
    raw_provider = os.environ.get("PAYOUTS_PROVIDER", "auto").strip().lower()
    provider = raw_provider if raw_provider in ("auto", "manual", "yookassa") else "auto"
    raw_npd = os.environ.get("NPD_PROVIDER", "auto").strip().lower()
    npd_provider = raw_npd if raw_npd in ("auto", "demo", "partner", "lknpd") else "auto"
    return PayoutsConfig(
        provider=provider,
        yookassa_agent_id=os.environ.get("YOOKASSA_PAYOUT_AGENT_ID", "").strip() or None,
        yookassa_secret_key=os.environ.get("YOOKASSA_PAYOUT_SECRET_KEY", "").strip() or None,
        yookassa_api_url=(
            os.environ.get("YOOKASSA_PAYOUT_API_URL", "https://api.yookassa.ru/v3").strip().rstrip("/")
            or "https://api.yookassa.ru/v3"
        ),
        auto_dispatch=_bool_env("PAYOUTS_AUTO_DISPATCH", True),
        auto_max_rub=max(500, _int_env("PAYOUTS_AUTO_MAX_RUB", 15_000)),
        antifraud_min_lessons=max(0, _int_env("PAYOUTS_ANTIFRAUD_MIN_LESSONS", 1)),
        check_webhook_ip=_bool_env("YOOKASSA_CHECK_WEBHOOK_IP", True),
        npd_provider=npd_provider,
        npd_status_api_url=(
            os.environ.get("NPD_STATUS_API_URL", "https://statusnpd.nalog.ru/api/v1/tracker/taxpayer_status")
            .strip()
            .rstrip("/")
            or "https://statusnpd.nalog.ru/api/v1/tracker/taxpayer_status"
        ),
        npd_check_status_online=_bool_env("NPD_CHECK_STATUS_ONLINE", False),
        npd_partner_api_url=os.environ.get("NPD_PARTNER_API_URL", "").strip().rstrip("/") or None,
        npd_partner_api_key=os.environ.get("NPD_PARTNER_API_KEY", "").strip() or None,
        npd_lknpd_api_url=(
            os.environ.get("NPD_LKNPD_API_URL", "https://lknpd.nalog.ru/api/v1").strip().rstrip("/")
            or "https://lknpd.nalog.ru/api/v1"
        ),
        npd_lknpd_token=os.environ.get("NPD_LKNPD_TOKEN", "").strip() or None,
        npd_platform_inn=os.environ.get("NPD_PLATFORM_INN", "").strip() or None,
        npd_platform_name=os.environ.get("NPD_PLATFORM_NAME", "ООО «Вектор»").strip() or "ООО «Вектор»",
    )


@dataclass(frozen=True)
class OtpDeliveryConfig:
    telegram_gateway_token: str | None = None
    telegram_gateway_api_url: str = "https://gatewayapi.telegram.org"
    telegram_gateway_sender_username: str | None = None
    telegram_gateway_ttl_sec: int = 300
    whatsapp_provider: str = "auto"  # auto | cloud | webhook | off
    whatsapp_api_url: str = "https://graph.facebook.com/v21.0"
    whatsapp_phone_number_id: str | None = None
    whatsapp_access_token: str | None = None
    whatsapp_template_name: str = "vektor_otp_code"
    whatsapp_template_lang: str = "ru"
    whatsapp_use_template: bool = True
    whatsapp_webhook_url: str | None = None
    whatsapp_webhook_token: str | None = None
    sms_provider: str = "auto"  # auto | sms_ru | smsc | webhook | off
    sms_sender: str = "VektorEGE"
    sms_ru_api_id: str | None = None
    sms_ru_api_url: str = "https://sms.ru/sms/send"
    smsc_login: str | None = None
    smsc_password: str | None = None
    smsc_api_url: str = "https://smsc.ru/sys/send.php"
    sms_webhook_url: str | None = None
    sms_webhook_token: str | None = None
    sms_fallback_enabled: bool = True
    require_delivery: bool = False

    @property
    def telegram_gateway_configured(self) -> bool:
        return bool(self.telegram_gateway_token)

    @property
    def whatsapp_cloud_configured(self) -> bool:
        return bool(self.whatsapp_phone_number_id and self.whatsapp_access_token)

    @property
    def whatsapp_webhook_configured(self) -> bool:
        return bool(self.whatsapp_webhook_url)

    @property
    def active_whatsapp_provider(self) -> str:
        if self.whatsapp_provider == "off":
            return "none"
        if self.whatsapp_provider == "cloud":
            return "cloud" if self.whatsapp_cloud_configured else "none"
        if self.whatsapp_provider == "webhook":
            return "webhook" if self.whatsapp_webhook_configured else "none"
        if self.whatsapp_cloud_configured:
            return "cloud"
        if self.whatsapp_webhook_configured:
            return "webhook"
        return "none"

    @property
    def sms_ru_configured(self) -> bool:
        return bool(self.sms_ru_api_id)

    @property
    def smsc_configured(self) -> bool:
        return bool(self.smsc_login and self.smsc_password)

    @property
    def sms_webhook_configured(self) -> bool:
        return bool(self.sms_webhook_url)

    @property
    def active_sms_provider(self) -> str:
        if self.sms_provider == "off":
            return "none"
        if self.sms_provider == "sms_ru":
            return "sms_ru" if self.sms_ru_configured else "none"
        if self.sms_provider == "smsc":
            return "smsc" if self.smsc_configured else "none"
        if self.sms_provider == "webhook":
            return "webhook" if self.sms_webhook_configured else "none"
        if self.sms_ru_configured:
            return "sms_ru"
        if self.smsc_configured:
            return "smsc"
        if self.sms_webhook_configured:
            return "webhook"
        return "none"

    @property
    def any_live_provider(self) -> bool:
        return bool(
            self.telegram_gateway_configured
            or self.active_whatsapp_provider != "none"
            or self.active_sms_provider != "none"
        )


def load_otp_delivery_config() -> OtpDeliveryConfig:
    raw_wa = os.environ.get("WHATSAPP_PROVIDER", "auto").strip().lower()
    wa_prov = raw_wa if raw_wa in ("auto", "cloud", "webhook", "off") else "auto"
    raw_sms = os.environ.get("SMS_PROVIDER", "auto").strip().lower()
    sms_prov = raw_sms if raw_sms in ("auto", "sms_ru", "smsc", "webhook", "off") else "auto"
    raw_sender = os.environ.get("TELEGRAM_GATEWAY_SENDER_USERNAME", "").strip().lstrip("@")
    return OtpDeliveryConfig(
        telegram_gateway_token=os.environ.get("TELEGRAM_GATEWAY_TOKEN", "").strip() or None,
        telegram_gateway_api_url=(
            os.environ.get("TELEGRAM_GATEWAY_API_URL", "https://gatewayapi.telegram.org").strip().rstrip("/")
            or "https://gatewayapi.telegram.org"
        ),
        telegram_gateway_sender_username=raw_sender or None,
        telegram_gateway_ttl_sec=max(60, min(3600, _int_env("TELEGRAM_GATEWAY_TTL_SEC", 300))),
        whatsapp_provider=wa_prov,
        whatsapp_api_url=(
            os.environ.get("WHATSAPP_API_URL", "https://graph.facebook.com/v21.0").strip().rstrip("/")
            or "https://graph.facebook.com/v21.0"
        ),
        whatsapp_phone_number_id=os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "").strip() or None,
        whatsapp_access_token=os.environ.get("WHATSAPP_ACCESS_TOKEN", "").strip() or None,
        whatsapp_template_name=os.environ.get("WHATSAPP_TEMPLATE_NAME", "vektor_otp_code").strip() or "vektor_otp_code",
        whatsapp_template_lang=os.environ.get("WHATSAPP_TEMPLATE_LANG", "ru").strip() or "ru",
        whatsapp_use_template=_bool_env("WHATSAPP_USE_TEMPLATE", True),
        whatsapp_webhook_url=os.environ.get("WHATSAPP_WEBHOOK_URL", "").strip().rstrip("/") or None,
        whatsapp_webhook_token=os.environ.get("WHATSAPP_WEBHOOK_TOKEN", "").strip() or None,
        sms_provider=sms_prov,
        sms_sender=os.environ.get("SMS_SENDER", "VektorEGE").strip() or "VektorEGE",
        sms_ru_api_id=os.environ.get("SMS_RU_API_ID", "").strip() or None,
        sms_ru_api_url=os.environ.get("SMS_RU_API_URL", "https://sms.ru/sms/send").strip() or "https://sms.ru/sms/send",
        smsc_login=os.environ.get("SMSC_LOGIN", "").strip() or None,
        smsc_password=os.environ.get("SMSC_PASSWORD", "").strip() or None,
        smsc_api_url=os.environ.get("SMSC_API_URL", "https://smsc.ru/sys/send.php").strip() or "https://smsc.ru/sys/send.php",
        sms_webhook_url=os.environ.get("SMS_WEBHOOK_URL", "").strip().rstrip("/") or None,
        sms_webhook_token=os.environ.get("SMS_WEBHOOK_TOKEN", "").strip() or None,
        sms_fallback_enabled=_bool_env("OTP_SMS_FALLBACK", True),
        require_delivery=_bool_env("OTP_REQUIRE_DELIVERY", False),
    )


@dataclass(frozen=True)
class Settings:
    db_path: Path
    database_url: str | None = None
    db_mode: str = "auto"
    db_run_constraint_ddl: bool | None = None
    db_skip_schema_init: bool = False
    env: str = "development"
    dev_demo_mode: bool = True
    cors_origins: tuple[str, ...] = ()
    security_headers: bool = True
    session_cookie: str = "pvm_session"
    session_ttl_sec: int = 30 * 86400
    invite_code: str = ""
    max_users: int = 0
    max_doc_bytes: int = 2 * 1024 * 1024
    auth_rate_limit: int = 20
    auth_rate_window_sec: int = 900
    ai_rate_limit: int = 50
    ai_rate_window_sec: int = 3600
    admin_require_auth: bool = False
    admin_api_token: str = ""
    trusted_proxy_ips: tuple[str, ...] = ("127.0.0.1/32", "::1/128", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")
    public_base_url: str | None = None
    realtime_pg_notify_enabled: bool = True
    ai: AIConfig = AIConfig(None, None, None, None, None)
    google: GoogleOAuthConfig = GoogleOAuthConfig(None, None)
    telegram: TelegramAuthConfig = TelegramAuthConfig(None, None)
    scheduler: SchedulerConfig = SchedulerConfig()
    backup: BackupConfig = BackupConfig()
    monitoring: MonitoringConfig = MonitoringConfig()
    analytics: AnalyticsConfig = AnalyticsConfig()
    media: MediaConfig = MediaConfig()
    payments: PaymentsConfig = PaymentsConfig()
    payouts: PayoutsConfig = PayoutsConfig()
    otp: OtpDeliveryConfig = OtpDeliveryConfig()


def load_settings() -> Settings:
    raw_mode = os.environ.get("DB_MODE", "auto").strip().lower()
    db_mode = raw_mode if raw_mode in ("sqlite", "dual", "postgres", "auto") else "auto"
    raw_env = (
        os.environ.get("VEKTOR_ENV")
        or os.environ.get("APP_ENV")
        or os.environ.get("RAILWAY_ENVIRONMENT")
        or "development"
    ).strip().lower()
    env = "production" if raw_env in ("prod", "production") else (raw_env or "development")
    is_prod = env == "production"
    dev_demo_mode = _bool_env("DEV_DEMO_MODE", not is_prod)
    raw_constraint_ddl = os.environ.get("DB_RUN_CONSTRAINT_DDL", "").strip()
    db_run_constraint_ddl = _bool_env("DB_RUN_CONSTRAINT_DDL", not is_prod) if raw_constraint_ddl else None
    return Settings(
        db_path=resolve_db_path(),
        database_url=os.environ.get("DATABASE_URL", "").strip() or None,
        db_mode=db_mode,
        db_run_constraint_ddl=db_run_constraint_ddl,
        db_skip_schema_init=_bool_env("DB_SKIP_SCHEMA_INIT", False),
        env=env,
        dev_demo_mode=dev_demo_mode,
        cors_origins=_csv_env("CORS_ORIGINS"),
        security_headers=_bool_env("SECURITY_HEADERS", True),
        session_ttl_sec=max(1, _int_env("SESSION_DAYS", 30)) * 86400,
        invite_code=os.environ.get("INVITE_CODE", "").strip(),
        max_users=max(0, _int_env("MAX_USERS", 0)),
        max_doc_bytes=max(1024, _int_env("MAX_DOC_BYTES", 2 * 1024 * 1024)),
        admin_require_auth=_bool_env("ADMIN_REQUIRE_AUTH", is_prod),
        admin_api_token=(os.environ.get("ADMIN_API_TOKEN") or os.environ.get("VEKTOR_ADMIN_TOKEN") or "").strip(),
        trusted_proxy_ips=(
            _csv_env("TRUSTED_PROXY_IPS")
            or _csv_env("FORWARDED_ALLOW_IPS")
            or ("127.0.0.1/32", "::1/128", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")
        ),
        public_base_url=os.environ.get("PUBLIC_BASE_URL", "").strip().rstrip("/") or None,
        realtime_pg_notify_enabled=_bool_env("REALTIME_PG_NOTIFY_ENABLED", True),
        ai=load_ai_config(),
        google=load_google_oauth_config(),
        telegram=load_telegram_auth_config(),
        scheduler=load_scheduler_config(),
        backup=load_backup_config(),
        monitoring=load_monitoring_config(is_prod=is_prod),
        analytics=load_analytics_config(),
        media=load_media_config(),
        payments=load_payments_config(),
        payouts=load_payouts_config(),
        otp=load_otp_delivery_config(),
    )
