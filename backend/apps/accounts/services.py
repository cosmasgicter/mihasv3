"""Account business logic services.

Password hashing, login attempt tracking, password reset tokens.

Implements task 9.3.
Requirements: 2.2, 2.7, 2.8, 2.9
"""

import hashlib
import logging
import os
from datetime import timedelta
from enum import Enum

import bcrypt
from django.utils import timezone

logger = logging.getLogger(__name__)

# Failed-login lockout window: failures within this window count toward
# the lockout threshold.
LOGIN_FAILURE_WINDOW = timedelta(minutes=15)

# Password-reset token lifetime.
PASSWORD_RESET_TOKEN_TTL = timedelta(hours=1)


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------


def hash_password(plaintext: str) -> str:
    """Hash a password with bcrypt (12 rounds)."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(plaintext.encode("utf-8"), salt).decode("utf-8")


def verify_password(plaintext: str, hashed: str) -> bool:
    """Verify a password against a bcrypt hash.

    Also handles one-time SHA-256 → bcrypt migration for legacy hashes.
    Legacy hashes are detected by not starting with '$2' (bcrypt prefix).
    """
    if not hashed:
        return False

    # Check if this is a bcrypt hash
    if hashed.startswith("$2"):
        try:
            return bcrypt.checkpw(plaintext.encode("utf-8"), hashed.encode("utf-8"))
        except (ValueError, TypeError):
            return False

    # Legacy SHA-256 hash migration path
    sha256_hash = hashlib.sha256(plaintext.encode("utf-8")).hexdigest()
    if sha256_hash == hashed:
        # Password matches legacy hash - caller should re-hash with bcrypt
        return True

    return False


def needs_rehash(hashed: str) -> bool:
    """Check if a password hash needs migration to bcrypt."""
    return not hashed.startswith("$2") if hashed else False


# ---------------------------------------------------------------------------
# Login attempt tracking
# ---------------------------------------------------------------------------


class LoginStatus(Enum):
    ALLOWED = "allowed"
    BLOCKED = "blocked"       # 5+ failures in 15 min
    LOCKED = "locked"         # 10+ consecutive failures


def check_login_attempts(email_hash: str) -> LoginStatus:
    """Check if login is allowed for the given email hash.

    - 5+ failures in 15 min → BLOCKED
    - 10+ consecutive failures → LOCKED
    """
    from apps.accounts.models import LoginAttempt

    window_start = timezone.now() - LOGIN_FAILURE_WINDOW

    # Count failures in the 15-minute window
    recent_failures = LoginAttempt.objects.filter(
        email_hash=email_hash,
        success=False,
        attempted_at__gte=window_start,
    ).count()

    if recent_failures >= 5:
        # Check for 10+ consecutive failures (no time window)
        consecutive = _count_consecutive_failures(email_hash)
        if consecutive >= 10:
            return LoginStatus.LOCKED
        return LoginStatus.BLOCKED

    return LoginStatus.ALLOWED


def _count_consecutive_failures(email_hash: str) -> int:
    """Count consecutive failed login attempts (most recent first)."""
    from apps.accounts.models import LoginAttempt

    attempts = LoginAttempt.objects.filter(
        email_hash=email_hash,
    ).order_by("-attempted_at").values_list("success", flat=True)[:20]

    count = 0
    for success in attempts:
        if success:
            break
        count += 1
    return count


def record_login_attempt(email_hash: str, ip_hash: str, success: bool) -> None:
    """Create a LoginAttempt record."""
    from apps.accounts.models import LoginAttempt

    LoginAttempt.objects.create(
        email_hash=email_hash,
        ip_hash=ip_hash,
        success=success,
    )


# ---------------------------------------------------------------------------
# Password reset tokens
# ---------------------------------------------------------------------------


def generate_password_reset_token(user) -> str:
    """Generate a 32-byte random token, store SHA-256 hash in DB with 1-hour expiry.

    Returns the raw token (to be sent in the reset link).
    """
    from apps.accounts.models import PasswordResetToken

    raw_token = os.urandom(32).hex()
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    PasswordResetToken.objects.create(
        user=user,
        token_hash=token_hash,
        expires_at=timezone.now() + PASSWORD_RESET_TOKEN_TTL,
    )

    return raw_token


def verify_password_reset_token(token: str):
    """Verify a password reset token.

    Hashes the raw token, looks up in DB, checks expiry and used flag.
    Marks the token as used on success.

    Returns the associated user on success, None on failure.
    """
    from apps.accounts.models import PasswordResetToken

    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()

    try:
        reset_token = PasswordResetToken.objects.select_related("user").get(
            token_hash=token_hash,
            used_at__isnull=True,
        )
    except PasswordResetToken.DoesNotExist:
        return None

    if reset_token.expires_at < timezone.now():
        return None

    # Mark as used
    reset_token.used_at = timezone.now()
    reset_token.save(update_fields=["used_at"])

    return reset_token.user


# ---------------------------------------------------------------------------
# Lockout email (placeholder)
# ---------------------------------------------------------------------------


def send_lockout_email(user) -> None:
    """Enqueue a lockout notification email via the shared outbox helper.

    Persists an ``EmailQueue`` row and dispatches it through the centralized
    durable-delivery path. Errors are logged but never raised to the caller.
    """
    try:
        from apps.common.outbox import queue_email

        recipient = getattr(user, "email", None)
        if not recipient:
            logger.warning(
                "Cannot send lockout email — no email for user_id=%s",
                getattr(user, "id", "unknown"),
            )
            return

        subject = "Account Temporarily Locked"
        body = (
            "<p>Your account has been temporarily locked due to repeated "
            "failed login attempts.</p>"
            "<p>For your security, please wait before trying again. "
            "If you did not make these attempts, we recommend resetting "
            "your password immediately.</p>"
            "<p>If you need assistance, please contact support.</p>"
        )

        email_record = queue_email(
            recipient_email=recipient,
            subject=subject,
            body=body,
        )

        logger.info(
            "Lockout email queued for user_id=%s (email_queue_id=%s)",
            getattr(user, "id", "unknown"),
            email_record.id,
        )
    except Exception:
        logger.exception(
            "Failed to queue lockout email for user_id=%s",
            getattr(user, "id", "unknown"),
        )
