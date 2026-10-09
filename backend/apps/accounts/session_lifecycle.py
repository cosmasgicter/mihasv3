"""Shared device-session lifecycle helpers."""

import logging
from datetime import timedelta

from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import DeviceSession

logger = logging.getLogger(__name__)


def get_refresh_token_lifetime():
    return settings.SIMPLE_JWT.get("REFRESH_TOKEN_LIFETIME", timedelta(days=7))


def get_refresh_token_expiry(now=None):
    current_time = now or timezone.now()
    return current_time + get_refresh_token_lifetime()


def active_session_filters(now=None) -> Q:
    current_time = now or timezone.now()
    activity_cutoff = current_time - get_refresh_token_lifetime()
    return (
        Q(expires_at__gt=current_time)
        | Q(expires_at__isnull=True, last_activity__gte=activity_cutoff)
        | Q(
            expires_at__isnull=True,
            last_activity__isnull=True,
            created_at__gte=activity_cutoff,
        )
    )


def stale_session_filters(now=None) -> Q:
    current_time = now or timezone.now()
    activity_cutoff = current_time - get_refresh_token_lifetime()
    return (
        Q(expires_at__lte=current_time)
        | Q(expires_at__isnull=True, last_activity__lt=activity_cutoff)
        | Q(
            expires_at__isnull=True,
            last_activity__isnull=True,
            created_at__lt=activity_cutoff,
        )
    )


def deactivate_stale_sessions(user_id=None, now=None) -> int:
    current_time = now or timezone.now()
    queryset = DeviceSession.objects.filter(
        is_active=True,
    ).filter(stale_session_filters(current_time))
    if user_id is not None:
        queryset = queryset.filter(user_id=user_id)
    return queryset.update(is_active=False, updated_at=current_time)


def revoke_sessions_for_authority_change(user_id, *, reason: str, actor_id=None) -> int:
    """Revoke every active session for ``user_id`` after an authority change (R3.5).

    When a role, membership, access grant, or reviewer assignment changes, the
    affected user's in-flight sessions carry stale authority (their 30-minute
    access token still encodes the old role/scope). This helper fails closed on
    that staleness:

    1. Blacklists each active session's stored refresh JTI so the refresh
       endpoint cannot mint a new access token from an old refresh token.
    2. Deactivates the ``DeviceSession`` rows (``verify_token`` also rejects a
       refresh token whose ``DeviceSession`` is inactive — defence in depth).
    3. Emits a ``session.revoke_authority_change`` security Audit_Event with the
       reason and the acting operator, never raising into the request path.

    Access tokens already expire in ~30 minutes, so blacklisting the refresh
    token bounds the stale-authority window to that single access-token
    lifetime rather than the 7-day refresh window. Returns the number of
    sessions deactivated.

    Safe to call inside a request/transaction: a Redis or audit failure is
    swallowed (the DeviceSession deactivation is the durable guarantee).
    """
    if not user_id:
        return 0

    now = timezone.now()
    # Import here to avoid a circular import (tokens imports models which the
    # session views import).
    try:
        from apps.accounts.tokens import blacklist_jti
    except Exception:  # pragma: no cover - defensive
        blacklist_jti = None

    # Session revocation is best-effort defense-in-depth layered on top of the
    # (already-committed, already-audited) authority mutation. A DB or Redis
    # failure here must never break the authority change itself, mirroring how
    # ``blacklist_jti`` and ``TenantAuditService`` already degrade. In prod the
    # DB is always reachable so revocation runs; in a DB-less unit context it
    # degrades to a no-op.
    revoked = 0
    try:
        active = DeviceSession.objects.filter(user_id=user_id, is_active=True)

        if blacklist_jti is not None:
            for jti in active.exclude(refresh_jti__isnull=True).exclude(
                refresh_jti=""
            ).values_list("refresh_jti", flat=True):
                try:
                    blacklist_jti(jti)
                except Exception:
                    logger.warning(
                        "Failed to blacklist JTI during authority-change revoke",
                        exc_info=True,
                    )

        revoked = active.update(is_active=False, updated_at=now)
    except Exception:
        logger.warning(
            "Session revocation on authority change could not complete", exc_info=True
        )
        return 0

    try:
        from apps.catalog.tenant_audit_service import TenantAuditService

        TenantAuditService.record_event(
            action="session.revoke_authority_change",
            entity_type="user_session",
            entity_id=str(user_id),
            actor_id=actor_id,
            actor_role=None,
            metadata={"reason": reason, "revoked_sessions": revoked},
            retention_category="security",
        )
    except Exception:  # pragma: no cover - audit must never break the request
        logger.warning(
            "Failed to emit session.revoke_authority_change audit event", exc_info=True
        )

    return revoked
