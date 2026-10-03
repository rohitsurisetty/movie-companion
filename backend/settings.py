"""
Central runtime settings for the Film Companion backend.

Everything that used to be a hardcoded constant or a scattered os.getenv()
lives here so a deploy can be configured purely through environment
variables. Import from this module instead of calling os.getenv() in
handlers.

    from settings import settings

Feature flags default to the *current* (demo) behaviour so nothing changes
until the env is flipped; `validate_required_env()` fails fast with a clear
message when something mandatory is missing.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import List

logger = logging.getLogger(__name__)


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _int(name: str, default: int) -> int:
    raw = os.getenv(name)
    try:
        return int(raw) if raw not in (None, "") else default
    except ValueError:
        logger.warning("Env %s=%r is not an int, using default %s", name, raw, default)
        return default


def _list(name: str, default: List[str]) -> List[str]:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return list(default)
    return [x.strip() for x in raw.split(",") if x.strip()]


def _str(name: str, default: str) -> str:
    """Stripped env value; unset or blank falls back to `default`."""
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip()


@dataclass(frozen=True)
class Settings:
    # --- Core infrastructure (required) ---
    mongo_url: str = field(default_factory=lambda: os.getenv("MONGO_URL", ""))
    db_name: str = field(default_factory=lambda: os.getenv("DB_NAME", "film_companion"))
    environment: str = field(default_factory=lambda: os.getenv("APP_ENV", "development"))

    # --- CORS ---
    # Mobile apps don't send an Origin header, so this only matters for the
    # admin web dashboard and local web preview.
    allowed_origins: List[str] = field(
        default_factory=lambda: _list(
            "ALLOWED_ORIGINS",
            ["http://localhost:3000", "http://localhost:5173", "http://localhost:8081"],
        )
    )
    allowed_origin_regex: str = field(default_factory=lambda: os.getenv("ALLOWED_ORIGIN_REGEX", ""))

    # --- Third-party APIs ---
    tmdb_access_token: str = field(default_factory=lambda: os.getenv("TMDB_ACCESS_TOKEN", ""))
    google_maps_api_key: str = field(default_factory=lambda: os.getenv("GOOGLE_MAPS_API_KEY", ""))
    openai_api_key: str = field(default_factory=lambda: os.getenv("OPENAI_API_KEY", ""))
    llm_model_default: str = field(default_factory=lambda: os.getenv("LLM_MODEL_DEFAULT", "gpt-4o-mini"))
    llm_model_matching: str = field(default_factory=lambda: os.getenv("LLM_MODEL_MATCHING", "gpt-4o-mini"))
    elevenlabs_api_key: str = field(default_factory=lambda: os.getenv("ELEVENLABS_API_KEY", ""))

    # --- Auth providers ---
    # Google Sign-In: the *web* client ID is the audience of ID tokens issued
    # to the Android app. Comma-separate several to accept more than one.
    google_oauth_client_ids: List[str] = field(default_factory=lambda: _list("GOOGLE_OAUTH_CLIENT_IDS", []))
    # SMS provider for phone OTP: "console" (log only, dev), "msg91", "twilio"
    sms_provider: str = field(default_factory=lambda: os.getenv("SMS_PROVIDER", "console").strip().lower())
    msg91_auth_key: str = field(default_factory=lambda: os.getenv("MSG91_AUTH_KEY", ""))
    msg91_template_id: str = field(default_factory=lambda: os.getenv("MSG91_TEMPLATE_ID", ""))
    twilio_account_sid: str = field(default_factory=lambda: os.getenv("TWILIO_ACCOUNT_SID", ""))
    twilio_auth_token: str = field(default_factory=lambda: os.getenv("TWILIO_AUTH_TOKEN", ""))
    twilio_from_number: str = field(default_factory=lambda: os.getenv("TWILIO_FROM_NUMBER", ""))
    otp_ttl_seconds: int = field(default_factory=lambda: _int("OTP_TTL_SECONDS", 300))
    otp_max_attempts: int = field(default_factory=lambda: _int("OTP_MAX_ATTEMPTS", 5))
    session_ttl_days: int = field(default_factory=lambda: _int("SESSION_TTL_DAYS", 30))
    # Fixed-code numbers for Google Play review / QA, e.g.
    #   TEST_OTP_NUMBERS="+919999900001:123456,+919999900002:654321"
    # No SMS is sent to these numbers and only the listed code is accepted.
    test_otp_numbers: str = field(default_factory=lambda: os.getenv("TEST_OTP_NUMBERS", ""))
    # Phone OTP is only sent to these country codes (blocks SMS-pumping fraud
    # via international premium numbers). Comma-separated, e.g. "+91,+971".
    otp_allowed_country_codes: List[str] = field(default_factory=lambda: _list("OTP_ALLOWED_COUNTRY_CODES", ["+91"]))
    # How many reverse proxies sit in front of the app (Railway: 1). The client
    # IP is the Nth X-Forwarded-For entry from the right; entries further left
    # are client-supplied and spoofable.
    trusted_proxy_hops: int = field(default_factory=lambda: _int("TRUSTED_PROXY_HOPS", 1))

    # --- Admin dashboard ---
    admin_username: str = field(default_factory=lambda: os.getenv("ADMIN_USERNAME", "admin"))
    # bcrypt hash of the admin password. Generate with:
    #   python -c "import bcrypt;print(bcrypt.hashpw(b'yourpass', bcrypt.gensalt()).decode())"
    admin_password_hash: str = field(default_factory=lambda: os.getenv("ADMIN_PASSWORD_HASH", ""))

    # --- Demo / mock behaviour (all flip to false for a real launch) ---
    # Include the hardcoded mock profiles in the /matches feed.
    mock_feed_profiles: bool = field(default_factory=lambda: _bool("MOCK_FEED_PROFILES", True))
    # Serve ONLY mock profiles (never real users). Previously DEMO_FEED_MOCKS_ONLY=True.
    mock_feed_only: bool = field(default_factory=lambda: _bool("MOCK_FEED_ONLY", False))
    # Auto-seed scripted mock conversations / unmatched history into real accounts.
    mock_seed_chats: bool = field(default_factory=lambda: _bool("MOCK_SEED_CHATS", True))
    # LLM auto-replies when a user messages a mock profile.
    mock_bot_replies: bool = field(default_factory=lambda: _bool("MOCK_BOT_REPLIES", True))
    # Expose /api/dev/* helper routes.
    enable_dev_routes: bool = field(default_factory=lambda: _bool("ENABLE_DEV_ROUTES", False))

    # --- Legal & support pages (legal_pages.py, served at /legal/*) ---
    # The bracketed defaults are placeholders: set the real values before
    # publishing the app (Google Play links to these pages).
    app_display_name: str = field(default_factory=lambda: _str("APP_DISPLAY_NAME", "Film Companion"))
    legal_company_name: str = field(default_factory=lambda: _str("LEGAL_COMPANY_NAME", "[Company legal name]"))
    legal_company_address: str = field(default_factory=lambda: _str("LEGAL_COMPANY_ADDRESS", "[Registered address]"))
    support_email: str = field(default_factory=lambda: _str("SUPPORT_EMAIL", "support@example.com"))
    grievance_officer_name: str = field(
        default_factory=lambda: _str("GRIEVANCE_OFFICER_NAME", "[Grievance Officer name]")
    )
    # Defaults to SUPPORT_EMAIL when unset.
    grievance_officer_email: str = field(
        default_factory=lambda: _str("GRIEVANCE_OFFICER_EMAIL", _str("SUPPORT_EMAIL", "support@example.com"))
    )
    legal_effective_date: str = field(default_factory=lambda: _str("LEGAL_EFFECTIVE_DATE", "3 October 2026"))

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() in ("prod", "production")


settings = Settings()


def validate_required_env() -> None:
    """Fail fast at startup with a readable message instead of a KeyError
    deep inside Motor. Warn (don't fail) for optional integrations so a
    partially configured dev box still boots."""
    missing = []
    if not settings.mongo_url:
        missing.append("MONGO_URL")
    if not settings.db_name:
        missing.append("DB_NAME")
    if missing:
        raise RuntimeError(
            "Missing required environment variables: "
            + ", ".join(missing)
            + ". See backend/.env.example."
        )

    optional = {
        "TMDB_ACCESS_TOKEN": settings.tmdb_access_token,
        "GOOGLE_MAPS_API_KEY": settings.google_maps_api_key,
        "OPENAI_API_KEY": settings.openai_api_key,
        "ELEVENLABS_API_KEY": settings.elevenlabs_api_key,
        "GOOGLE_OAUTH_CLIENT_IDS": ",".join(settings.google_oauth_client_ids),
        "ADMIN_PASSWORD_HASH": settings.admin_password_hash,
    }
    for name, value in optional.items():
        if not value:
            logger.warning("Env %s not set — the feature that depends on it is disabled.", name)

    if settings.is_production:
        if settings.sms_provider == "console":
            logger.error("APP_ENV=production but SMS_PROVIDER=console — phone OTPs will NOT be delivered.")
        if not settings.admin_password_hash:
            logger.error("APP_ENV=production but ADMIN_PASSWORD_HASH is empty — admin login is disabled.")
        if settings.mock_feed_only or settings.mock_seed_chats:
            logger.warning("APP_ENV=production with mock flags enabled (MOCK_FEED_ONLY/MOCK_SEED_CHATS).")
        placeholders = [
            name
            for name, value in (
                ("LEGAL_COMPANY_NAME", settings.legal_company_name),
                ("LEGAL_COMPANY_ADDRESS", settings.legal_company_address),
                ("GRIEVANCE_OFFICER_NAME", settings.grievance_officer_name),
                ("SUPPORT_EMAIL", settings.support_email),
            )
            if value.startswith("[") or value.endswith("@example.com")
        ]
        if placeholders:
            logger.warning(
                "APP_ENV=production but the /legal pages still show placeholder values for: %s",
                ", ".join(placeholders),
            )
