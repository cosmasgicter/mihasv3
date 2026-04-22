"""Helpers for privacy-safe audit network context."""

from __future__ import annotations

import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings

logger = logging.getLogger(__name__)


def extract_client_ip(request) -> str:
    """Return the client IP, respecting X-Forwarded-For behind a proxy."""
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def hash_network_value(value: str) -> str:
    """Hash a network value with SHA-256 for long-retention correlation."""
    return hashlib.sha256((value or "").encode()).hexdigest()


_fernet_cache: dict[str, Fernet | None] = {}


def _get_fernet() -> Fernet | None:
    key = getattr(settings, "AUDIT_LOG_ENCRYPTION_KEY", "") or ""
    key = key.strip()
    if not key:
        return None
    if key in _fernet_cache:
        return _fernet_cache[key]
    try:
        fernet = Fernet(key.encode())
        _fernet_cache[key] = fernet
        return fernet
    except Exception:
        logger.exception("Invalid AUDIT_LOG_ENCRYPTION_KEY configuration")
        _fernet_cache[key] = None
        return None


def encrypt_network_value(value: str) -> str | None:
    """Encrypt a value for short-retention forensics access."""
    if not value:
        return None
    fernet = _get_fernet()
    if fernet is None:
        return None
    return fernet.encrypt(value.encode()).decode()


def decrypt_network_value(value: str | None) -> str | None:
    """Decrypt a previously encrypted network value."""
    if not value:
        return None
    fernet = _get_fernet()
    if fernet is None:
        return None
    try:
        return fernet.decrypt(value.encode()).decode()
    except InvalidToken:
        logger.warning("Failed to decrypt audit network context due to invalid token")
        return None
    except Exception:
        logger.exception("Unexpected failure decrypting audit network context")
        return None


def build_audit_network_fields(request) -> dict[str, str | None]:
    """Build hash and encrypted network fields for an audit event."""
    ip_address = extract_client_ip(request)
    user_agent = request.META.get("HTTP_USER_AGENT", "")
    return {
        "ip_address": hash_network_value(ip_address),
        "user_agent": hash_network_value(user_agent),
        "ip_address_encrypted": encrypt_network_value(ip_address),
        "user_agent_encrypted": encrypt_network_value(user_agent),
    }
