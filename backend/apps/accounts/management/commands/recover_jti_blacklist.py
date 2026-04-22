"""Management command to recover from JTI blacklist loss after Redis flush/failover.

Conservative approach: since raw JWTs are not stored in the database, we cannot
re-populate the Redis JTI set. Instead, we force-expire all active device sessions
so that every user must re-authenticate, preventing revoked tokens from being reused.

Usage:
    python manage.py recover_jti_blacklist
"""

import logging
import sys

from django.core.management.base import BaseCommand
from django.utils import timezone

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        "Force-expire all active device sessions after a Redis flush/failover. "
        "This invalidates all refresh tokens, requiring users to re-authenticate."
    )

    def handle(self, *args, **options):
        # 1. Verify Redis is reachable
        try:
            from django.core.cache import cache

            cache.set("_jti_recovery_ping", "1", 10)
            if cache.get("_jti_recovery_ping") != "1":
                raise ConnectionError("Redis ping returned unexpected value")
        except Exception as exc:
            msg = f"Redis is unreachable: {exc}. Aborting recovery."
            self.stderr.write(self.style.ERROR(msg))
            logger.error(msg)
            sys.exit(1)

        now = timezone.now()

        # 2. Import model here to avoid import-time issues
        from apps.accounts.models import DeviceSession

        # Count expired sessions (skipped)
        expired_count = DeviceSession.objects.filter(
            is_active=True,
            expires_at__lte=now,
        ).count()

        # Get active sessions to invalidate
        active_sessions = DeviceSession.objects.filter(
            is_active=True,
            expires_at__gt=now,
        )
        active_count = active_sessions.count()

        # 3. Force-expire all active sessions
        if active_count > 0:
            active_sessions.update(expires_at=now)

        # 4. Log results
        logger.info(
            "jti_recovery_complete",
            extra={
                "type": "jti_recovery",
                "sessions_invalidated": active_count,
                "expired_sessions_skipped": expired_count,
            },
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"Recovery complete: {active_count} sessions invalidated, "
                f"{expired_count} expired sessions skipped."
            )
        )
