"""Shared device-session lifecycle helpers."""

from datetime import timedelta

from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import DeviceSession


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
