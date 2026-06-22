"""Property 11 — Notification cursor pagination correctness (task 7.2).

# Feature: system-performance-hardening, Property 11

R9 adds a cursor mode to ``NotificationListView`` (``backend/apps/common/
notification_views.py``). When the request carries ``?after=<id>`` the view:

* orders by descending ``(created_at, id)`` and returns only rows strictly
  *older* than the anchor's composite key (R9.1);
* caps the page at ``min(pageSize default 20, max 100)`` (R9.1);
* issues **no** ``count()`` query and reports ``totalCount`` as ``null`` (R9.1);
* wraps the payload in the ``{"success": true, "data": ...}`` envelope (R9.1);
* returns an empty result set without error for a well-formed but unknown
  ``after`` id (R9.5).

Property 11 proves, for an *arbitrary* set of notifications and an *arbitrary*
``after`` anchor, that:

1. the returned page equals exactly the notifications strictly older than the
   anchor under the descending ``(created_at, id)`` order, truncated to the cap,
   in the correct order (against an independent in-Python oracle);
2. paging through with successive ``after`` cursors yields every older
   notification **exactly once** with no overlaps and no gaps (the classic
   cursor-correctness invariant);
3. the cursor response never carries a full count (``totalCount is None``) and
   executes no ``COUNT(...)`` SQL (R9.1);
4. a well-formed but unknown ``after`` id returns an empty, error-free envelope
   (R9.5).

**Validates: Requirements 9.1, 9.5**

DB-backed against the SQLite ``config.settings.test`` database. Each Hypothesis
example builds a **fresh** student profile (unique id) and scopes every read to
that profile, so the test DB not rolling back between examples cannot leak rows
from one example into another (the view filters ``user_id=request.user.pk``).
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.authentication import JWTUser
from apps.common.models import Notification
from apps.common.notification_views import NotificationListView

pytestmark = pytest.mark.django_db

_factory = APIRequestFactory()
_view = NotificationListView.as_view()

# Cursor-mode default and cap from the view contract (R9.1).
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------


@st.composite
def _notification_sets(draw, *, min_count=1, max_count=25):
    """Generate a notification set for one user with varied created_at/id.

    Returns ``(count, minute_offsets, anchor_index)``. ``minute_offsets`` may
    repeat values so that two notifications share an identical ``created_at`` —
    this deliberately exercises the ``id`` tiebreak in the ``(created_at, id)``
    composite key. ``anchor_index`` selects which existing notification is used
    as the ``after`` anchor.
    """
    count = draw(st.integers(min_value=min_count, max_value=max_count))
    # Offsets in a small range relative to count so ties are common.
    offsets = draw(
        st.lists(
            st.integers(min_value=0, max_value=max(1, count)),
            min_size=count,
            max_size=count,
        )
    )
    anchor_index = draw(st.integers(min_value=0, max_value=count - 1))
    return count, offsets, anchor_index


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_user_with_notifications(offsets):
    """Persist a fresh student profile + one notification per offset.

    Returns ``(user, rows)`` where ``user`` is a ``JWTUser`` authenticated as
    the profile and ``rows`` is a list of ``(id, created_at)`` tuples for the
    persisted notifications (the oracle's raw material).
    """
    from tests.tenant_fixtures import build_profile

    profile = build_profile(role="student", suffix=f"ncur-{uuid.uuid4().hex[:8]}")

    # Anchor all timestamps to a fixed, microsecond-free base so equal offsets
    # produce genuinely identical created_at values (true ties).
    base = timezone.now().replace(microsecond=0) - timedelta(days=1)

    to_create = []
    rows = []
    for index, offset in enumerate(offsets):
        nid = uuid.uuid4()
        created_at = base + timedelta(minutes=offset)
        to_create.append(
            Notification(
                id=nid,
                user=profile,
                title=f"N{index}",
                message=f"body {index}",
                type="info",
                is_read=False,
                created_at=created_at,
                updated_at=created_at,
            )
        )
        rows.append((nid, created_at))

    Notification.objects.bulk_create(to_create)

    user = JWTUser(
        {"user_id": str(profile.id), "role": "student", "email": profile.email}
    )
    return user, rows


def _cursor_get(user, *, after, page_size=None):
    """Drive ``NotificationListView`` in cursor mode and return the response."""
    params = {"after": str(after)}
    if page_size is not None:
        params["pageSize"] = str(page_size)
    request = _factory.get("/api/v1/notifications/", params)
    force_authenticate(request, user=user)
    return _view(request)


def _oracle_older(rows, anchor_key):
    """Notifications strictly older than ``anchor_key`` in descending order.

    ``rows`` is a list of ``(id, created_at)``; the composite key is
    ``(created_at, id)`` and ``id`` is a ``uuid.UUID`` (Python UUID ordering
    matches the fixed-width lowercase-hex ordering SQLite applies to the
    stored ``UUIDField``).
    """
    older = [
        (nid, created_at)
        for (nid, created_at) in rows
        if (created_at, nid) < anchor_key
    ]
    older.sort(key=lambda r: (r[1], r[0]), reverse=True)
    return [str(nid) for (nid, _created_at) in older]


def _result_ids(response):
    return [item["id"] for item in response.data["data"]["results"]]


# ---------------------------------------------------------------------------
# Property 11 — single-page cursor correctness + envelope + no-count
# ---------------------------------------------------------------------------


@given(spec=_notification_sets())
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.too_slow,
        HealthCheck.data_too_large,
    ],
)
def test_property_11_cursor_page_matches_oracle(spec):
    """The cursor page equals the strictly-older descending oracle, capped.

    **Validates: Requirements 9.1**
    """
    count, offsets, anchor_index = spec
    user, rows = _build_user_with_notifications(offsets)

    anchor_id, anchor_created_at = rows[anchor_index]
    anchor_key = (anchor_created_at, anchor_id)

    page_size = DEFAULT_PAGE_SIZE
    with CaptureQueriesContext(connection) as ctx:
        response = _cursor_get(user, after=anchor_id)

    assert response.status_code == 200

    # Envelope shape (R9.1).
    assert response.data["success"] is True
    data = response.data["data"]
    assert data["totalCount"] is None  # no full count in cursor mode (R9.1)
    assert data["after"] == str(anchor_id)

    # No COUNT(...) SQL executed for a cursor request (R9.1).
    assert not any("count(" in q["sql"].lower() for q in ctx.captured_queries), (
        "cursor mode must not issue a full-count query"
    )

    expected = _oracle_older(rows, anchor_key)[:page_size]
    assert _result_ids(response) == expected

    # Cap is respected.
    assert len(data["results"]) <= page_size


# ---------------------------------------------------------------------------
# Property 11 — paging invariant: every older row exactly once, no gaps/overlaps
# ---------------------------------------------------------------------------


@given(
    spec=_notification_sets(min_count=1, max_count=12),
    page_size=st.integers(min_value=1, max_value=4),
)
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.too_slow,
        HealthCheck.data_too_large,
    ],
)
def test_property_11_paging_covers_every_older_once(spec, page_size):
    """Walking successive ``after`` cursors yields each older row exactly once.

    Starting from an arbitrary anchor and following ``after = last id of the
    previous page`` until empty must reproduce the full descending older-set
    with no duplicates and no omissions.

    **Validates: Requirements 9.1**
    """
    count, offsets, anchor_index = spec
    user, rows = _build_user_with_notifications(offsets)

    anchor_id, anchor_created_at = rows[anchor_index]
    expected = _oracle_older(rows, (anchor_created_at, anchor_id))

    collected = []
    cursor = anchor_id
    # Bound the loop generously; it must terminate well before this.
    for _ in range(count + 2):
        response = _cursor_get(user, after=cursor, page_size=page_size)
        assert response.status_code == 200
        page_ids = _result_ids(response)
        if not page_ids:
            break
        assert len(page_ids) <= page_size
        collected.extend(page_ids)
        cursor = page_ids[-1]

    # No overlaps (each id at most once) ...
    assert len(collected) == len(set(collected))
    # ... and no gaps: the concatenation equals the full descending oracle.
    assert collected == expected


# ---------------------------------------------------------------------------
# Property 11 — well-formed but unknown anchor → empty, error-free (R9.5)
# ---------------------------------------------------------------------------


@given(
    offsets=st.lists(
        st.integers(min_value=0, max_value=20), min_size=0, max_size=15
    ),
)
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.too_slow,
        HealthCheck.data_too_large,
    ],
)
def test_property_11_unknown_after_returns_empty_envelope(offsets):
    """A valid-format ``after`` matching no row → empty results, no error.

    **Validates: Requirements 9.5**
    """
    user, _rows = _build_user_with_notifications(offsets)

    # A fresh random UUID is overwhelmingly not among the persisted ids.
    unknown_after = uuid.uuid4()

    with CaptureQueriesContext(connection) as ctx:
        response = _cursor_get(user, after=unknown_after)

    assert response.status_code == 200
    assert response.data["success"] is True
    data = response.data["data"]
    assert data["results"] == []
    assert data["totalCount"] is None
    assert data["after"] == str(unknown_after)
    # Still no full-count query on the unknown-anchor path (R9.1/R9.5).
    assert not any("count(" in q["sql"].lower() for q in ctx.captured_queries)
