"""Session revoke/refresh on authority change (Admissions V2 task 2.2, R3.5).

When a role, membership, access grant, or reviewer assignment changes, the
affected user's in-flight sessions carry stale authority. R3.5 requires the
backend to audit the change and revoke/refresh those sessions so the stale
authority does not persist. This suite exercises the shared
``revoke_sessions_for_authority_change`` helper directly (deterministic, no
Redis dependency) and asserts:

* every active ``DeviceSession`` for the user is deactivated;
* another user's sessions are untouched;
* an ``session.revoke_authority_change`` security Audit_Event is written;
* the helper is best-effort — it returns 0 rather than raising when there are
  no sessions.

**Validates: Requirements R3.5**
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import DeviceSession
from apps.accounts.session_lifecycle import revoke_sessions_for_authority_change
from tests.tenant_fixtures import build_profile


def _session(user_id, *, jti=None, active=True) -> DeviceSession:
    now = timezone.now()
    return DeviceSession.objects.create(
        id=uuid.uuid4(),
        user_id=user_id,
        session_token=uuid.uuid4().hex,
        refresh_jti=jti,
        device_info="pytest",
        ip_address="127.0.0.1",
        is_active=active,
        expires_at=now + timedelta(days=7),
        last_activity=now,
        created_at=now,
        updated_at=now,
    )


@pytest.mark.django_db
class TestAuthorityChangeSessionRevocation:
    """**Validates: Requirements R3.5**"""

    def test_revokes_all_active_sessions_for_the_user(self):
        user = build_profile(role="admin")
        _session(user.id, jti="jti-1")
        _session(user.id, jti="jti-2")

        revoked = revoke_sessions_for_authority_change(
            user.id, reason="role", actor_id=uuid.uuid4()
        )

        assert revoked == 2
        assert not DeviceSession.objects.filter(user_id=user.id, is_active=True).exists()

    def test_does_not_touch_another_users_sessions(self):
        user = build_profile(role="admin")
        other = build_profile(role="student")
        _session(user.id, jti="mine")
        other_session = _session(other.id, jti="theirs")

        revoke_sessions_for_authority_change(user.id, reason="membership_updated")

        other_session.refresh_from_db()
        assert other_session.is_active is True

    def test_writes_a_security_audit_event(self):
        from apps.common.models import AuditLog

        user = build_profile(role="reviewer")
        _session(user.id, jti="jti-a")

        actor = uuid.uuid4()
        revoke_sessions_for_authority_change(
            user.id, reason="reviewer_assigned", actor_id=actor
        )

        event = AuditLog.objects.filter(
            action="session.revoke_authority_change", entity_id=user.id
        ).first()
        assert event is not None
        assert event.retention_category == "security"
        assert event.changes.get("reason") == "reviewer_assigned"

    def test_no_sessions_returns_zero_without_error(self):
        user = build_profile(role="admin")
        assert revoke_sessions_for_authority_change(user.id, reason="role") == 0

    def test_missing_user_id_is_a_noop(self):
        assert revoke_sessions_for_authority_change(None, reason="role") == 0
