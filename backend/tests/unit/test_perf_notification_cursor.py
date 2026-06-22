"""Unit tests for notification cursor edge cases + backward compatibility (task 7.3).

Covers the cursor-mode contract added to ``NotificationListView`` by task 7.1
(system-performance-hardening, R9):

- Invalid ``after`` format -> 400 validation error, no notifications (R9.4).
- Valid-format but unknown ``after`` -> 200 ``{"success": true, "data": ...}``
  envelope with an empty results collection, no error (R9.5).
- Page-number mode (no ``after``) keeps the existing
  ``{page, pageSize, totalCount, results}`` response shape (R9.2).
- Cursor happy path: rows strictly older than the anchor, ordered descending,
  capped at the page size, with ``totalCount`` null.

These are example-based unit tests (not property tests). Authentication mirrors
the ``_JWTUser`` pattern in ``tests/integration/test_perf_golden_snapshots.py``:
a minimal JWT-style principal whose ``pk`` matches a persisted ``Profile`` so the
view's ``user_id=request.user.pk`` queries resolve to real rows.

# Feature: system-performance-hardening
Requirements: 9.2, 9.4, 9.5
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Lightweight authenticated caller (mirrors test_perf_golden_snapshots)
# ---------------------------------------------------------------------------


class _JWTUser:
    """Minimal JWT-style principal: role + id, no DB row needed for auth."""

    is_authenticated = True

    def __init__(self, role: str, user_id):
        self.role = role
        self.id = user_id
        self.pk = user_id


def _call_notifications(user, query: dict | None = None):
    from apps.common.notification_views import NotificationListView

    request = APIRequestFactory().get("/api/v1/notifications/", query or {})
    force_authenticate(request, user=user)
    return NotificationListView.as_view()(request)


def _build_ordered_notifications(profile, count: int):
    """Create ``count`` notifications for ``profile`` with strictly increasing
    ``created_at`` so cursor ordering is total and deterministic. Returns the ids
    in chronological order (oldest first)."""
    from apps.common.models import Notification

    base = timezone.now() - timedelta(hours=count)
    ids = []
    for index in range(count):
        notif = Notification.objects.create(
            id=uuid.uuid4(),
            user=profile,
            title=f"Notice {index}",
            message=f"Body {index}",
            type="info",
            is_read=False,
            idempotency_key=str(uuid.uuid4()),
        )
        # created_at is auto-managed on save; pin it deterministically.
        Notification.objects.filter(pk=notif.id).update(
            created_at=base + timedelta(minutes=index)
        )
        ids.append(notif.id)
    return ids


# ---------------------------------------------------------------------------
# R9.4 — invalid ``after`` format -> 400, no notifications
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("bad_after", ["not-a-uuid", "123", "", "   ", "abc-def-ghi"])
def test_invalid_after_returns_400_with_no_notifications(bad_after):
    """A malformed ``after`` id is a validation error and returns no rows (R9.4)."""
    from tests.tenant_fixtures import build_profile

    profile = build_profile(role="student")
    caller = _JWTUser("student", profile.id)
    # Seed real notifications so a leak would be observable.
    _build_ordered_notifications(profile, 3)

    response = _call_notifications(caller, {"after": bad_after})

    assert response.status_code == 400
    assert response.data["success"] is False
    assert response.data["code"] == "VALIDATION_ERROR"
    # The error names the offending ``after`` field and returns no notifications.
    assert "after" in str(response.data).lower()
    assert "results" not in response.data
    assert "data" not in response.data


# ---------------------------------------------------------------------------
# R9.5 — valid-format but unknown ``after`` -> empty envelope, no error
# ---------------------------------------------------------------------------


def test_unknown_after_returns_empty_envelope_without_error():
    """A well-formed UUID matching no row yields an empty results collection in
    the ``{"success": true, "data": ...}`` envelope and no error (R9.5)."""
    from tests.tenant_fixtures import build_profile

    profile = build_profile(role="student")
    caller = _JWTUser("student", profile.id)
    _build_ordered_notifications(profile, 3)

    unknown_id = uuid.uuid4()
    response = _call_notifications(caller, {"after": str(unknown_id)})

    assert response.status_code == 200
    assert response.data["success"] is True
    data = response.data["data"]
    assert data["results"] == []
    # Cursor mode never executes a full count: totalCount is null.
    assert data["totalCount"] is None
    assert data["after"] == str(unknown_id)


def test_after_belonging_to_another_user_is_treated_as_unknown():
    """An ``after`` id that exists but belongs to a different user is scoped out
    (treated as unknown), returning an empty collection without confirming the
    id exists (R9.5)."""
    from tests.tenant_fixtures import build_profile

    owner = build_profile(role="student")
    other = build_profile(role="student")
    caller = _JWTUser("student", owner.id)

    # The anchor id belongs to ``other``, not to the caller.
    other_ids = _build_ordered_notifications(other, 2)
    _build_ordered_notifications(owner, 2)

    response = _call_notifications(caller, {"after": str(other_ids[-1])})

    assert response.status_code == 200
    assert response.data["success"] is True
    assert response.data["data"]["results"] == []
    assert response.data["data"]["totalCount"] is None


# ---------------------------------------------------------------------------
# R9.2 — page-number mode (no ``after``) response shape unchanged
# ---------------------------------------------------------------------------


def test_page_number_mode_shape_unchanged():
    """Without ``after``, the classic ``{page, pageSize, totalCount, results}``
    shape is preserved inside the data envelope (R9.2)."""
    from tests.tenant_fixtures import build_profile

    profile = build_profile(role="student")
    caller = _JWTUser("student", profile.id)
    _build_ordered_notifications(profile, 4)

    response = _call_notifications(caller, {"page": "1", "pageSize": "20"})

    assert response.status_code == 200
    assert response.data["success"] is True
    data = response.data["data"]
    # Exact key set of the page-number envelope — no cursor-only keys leak in.
    assert set(data.keys()) == {"page", "pageSize", "totalCount", "results"}
    assert data["page"] == 1
    assert data["pageSize"] == 20
    assert data["totalCount"] == 4
    assert len(data["results"]) == 4


def test_page_number_mode_without_params_keeps_classic_shape():
    """The implicit (no-param) page-number read still returns the classic shape
    with a real ``totalCount`` (R9.2)."""
    from tests.tenant_fixtures import build_profile

    profile = build_profile(role="student")
    caller = _JWTUser("student", profile.id)
    _build_ordered_notifications(profile, 3)

    response = _call_notifications(caller)

    assert response.status_code == 200
    data = response.data["data"]
    assert set(data.keys()) == {"page", "pageSize", "totalCount", "results"}
    assert data["totalCount"] == 3
    assert len(data["results"]) == 3


# ---------------------------------------------------------------------------
# R9.1 — cursor happy path (older rows, descending, capped, totalCount null)
# ---------------------------------------------------------------------------


def test_cursor_returns_strictly_older_rows_descending():
    """``?after=<newest id>`` returns the older rows in descending order with
    ``totalCount`` null and no full-count query (R9.1)."""
    from tests.tenant_fixtures import build_profile

    profile = build_profile(role="student")
    caller = _JWTUser("student", profile.id)
    ids = _build_ordered_notifications(profile, 4)  # oldest -> newest

    newest_id = ids[-1]
    response = _call_notifications(caller, {"after": str(newest_id)})

    assert response.status_code == 200
    assert response.data["success"] is True
    data = response.data["data"]
    assert data["totalCount"] is None

    result_ids = [str(row["id"]) for row in data["results"]]
    # The three rows strictly older than the newest, newest-first (descending).
    expected = [str(ids[2]), str(ids[1]), str(ids[0])]
    assert result_ids == expected
    # The anchor itself is excluded.
    assert str(newest_id) not in result_ids


def test_cursor_respects_page_size_cap():
    """Cursor mode caps results at the requested pageSize (R9.1)."""
    from tests.tenant_fixtures import build_profile

    profile = build_profile(role="student")
    caller = _JWTUser("student", profile.id)
    ids = _build_ordered_notifications(profile, 6)  # oldest -> newest

    newest_id = ids[-1]
    response = _call_notifications(caller, {"after": str(newest_id), "pageSize": "2"})

    assert response.status_code == 200
    data = response.data["data"]
    assert data["pageSize"] == 2
    assert data["totalCount"] is None
    result_ids = [str(row["id"]) for row in data["results"]]
    # The two most recent rows older than the anchor.
    assert result_ids == [str(ids[4]), str(ids[3])]
