"""Capability/scope cache invalidation tests, incl. stale-super-admin demotion (task 12.4).

DB-backed integration coverage for the per-user Capability_Cache (namespace
``"cap"``) wired in ``apps.accounts.admin_user_views._resolve_capability_payload``
(task 12.1) and the invalidation signals in ``apps.accounts.signals`` (task
12.2). With ``PERF_CACHE_CAPABILITIES=True`` we prove that every
authority-affecting change forces the *next* ``GET /api/v1/admin/scope/`` and
``GET /api/v1/admin/capabilities/`` read to recompute and never serve the
pre-change cache entry:

- ``Profile.role`` change (R5.4),
- ``UserInstitutionMembership`` create / update / delete (R5.5),
- ``AccessGrant`` create / update / delete (R5.5),
- ``Institution.is_active`` change for a tenant-scoped user (R5.6),
- the stale-super-admin demotion case: after a super_admin -> admin demotion the
  next scope/capabilities reads return zero ``platform.*`` capabilities and
  never the pre-change all-access entry (R5.7).

On-commit handling
------------------
The invalidation in ``apps.accounts.signals`` is bound via
``transaction.on_commit`` (so the version-token bump lands right after the
change commits and never fires for a rolled-back transaction). Under
``@pytest.mark.django_db`` the test body runs inside an atomic block that is
rolled back, so ``on_commit`` callbacks would otherwise never run. We therefore
commit each triggering change inside pytest-django's
``django_capture_on_commit_callbacks(execute=True)`` context manager, which
captures the callbacks registered during the block and runs them immediately —
exercising the real signal -> ``invalidate_user("cap", ...)`` path.

Proving "recompute, not a stale serve"
--------------------------------------
The capability cache backs onto the LocMem cache under the test settings, so a
**cache hit issues zero ORM queries** while a **recompute issues one or more**
(``AdminCapabilityService`` resolves scope from the DB). Every check therefore
sandwiches the reads in :class:`~django.test.utils.CaptureQueriesContext`:

1. prime (compute + store) -> query count > 0,
2. immediate repeat read -> query count == 0 (the entry is genuinely cached, R5.1),
3. commit the triggering change -> ``on_commit`` invalidation fires,
4. next read -> query count > 0 (the cache was invalidated; the pre-change entry
   was not served).

Where the change is observable in the payload (role, membership, grant) we also
assert the recomputed payload reflects the new state. For the
``Institution.is_active`` case the visible-institution set is unchanged by a
deactivation (``visible_institution_queryset`` does not filter on
``is_active``), so the query-count delta is the proof that the next read
recomputed rather than serving the pre-change entry.

# Feature: system-performance-hardening
Requirements: 5.4, 5.5, 5.6, 5.7
"""

from __future__ import annotations

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.admin_user_views import AdminCapabilitiesView, AdminScopeView

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Authenticated principal (mirrors the JWT auth model used in production)
# ---------------------------------------------------------------------------


class _Principal:
    """Minimal JWT-style principal: ``role`` + ``id``/``pk``, no DB row.

    Production sets ``request.user`` from the JWT, not a ``Profile`` row, so the
    capability views only ever read ``user.role`` / ``user.pk``. We back the
    principal's ``id`` with a real ``Profile`` row so that (a) the cache key
    ``str(user.pk)`` and the signal's ``invalidate_user("cap", profile.pk)``
    target the same id, and (b) ``AccessScopeService`` resolves the principal's
    memberships/grants (keyed by ``user_id``) from the DB. ``role`` is carried
    on the principal so a recompute reflects the post-change authority just as a
    freshly minted token would.
    """

    is_authenticated = True

    def __init__(self, role, user_id):
        self.role = role
        self.id = user_id
        self.pk = user_id


def _principal_for(profile) -> _Principal:
    return _Principal(profile.role, profile.id)


# ---------------------------------------------------------------------------
# View drivers + query-counting read helper
# ---------------------------------------------------------------------------


def _call_scope(user):
    request = APIRequestFactory().get("/api/v1/admin/scope/")
    force_authenticate(request, user=user)
    return AdminScopeView.as_view()(request)


def _call_capabilities(user):
    request = APIRequestFactory().get("/api/v1/admin/capabilities/")
    force_authenticate(request, user=user)
    return AdminCapabilitiesView.as_view()(request)


def _read(call, user):
    """Invoke a capability/scope view and return ``(payload, query_count)``.

    The query count is the cross-tenant-safe signal of cache hit (0) vs
    recompute (>0): a LocMem cache hit touches no DB, while a recompute resolves
    scope through ``AdminCapabilityService`` and issues at least one query.
    """
    with CaptureQueriesContext(connection) as ctx:
        response = call(user)
    assert response.status_code == 200, response.data
    return response.data["data"], len(ctx.captured_queries)


def _platform_caps(payload) -> list[str]:
    return [c for c in payload["capabilities"] if c.startswith("platform.")]


def _institution_ids(payload) -> list[str]:
    return sorted(inst["id"] for inst in payload["institutions"])


# ---------------------------------------------------------------------------
# R5.4 — Profile.role change forces recompute
# ---------------------------------------------------------------------------


@override_settings(PERF_CACHE_CAPABILITIES=True)
def test_role_change_forces_recompute(django_capture_on_commit_callbacks):
    """A ``Profile.role`` change invalidates the user's cached payload (R5.4)."""
    from tests.tenant_fixtures import build_institution, build_membership, build_profile

    user = build_profile(role="admin")
    inst = build_institution()
    build_membership(user=user, institution=inst, role="admin")
    principal = _principal_for(user)

    # Prime: first read computes + stores, repeat read is a cache hit (R5.1).
    primed, q_prime = _read(_call_capabilities, principal)
    assert q_prime > 0
    assert primed["role"] == "admin"
    assert primed["is_super_admin"] is False
    _, q_hit = _read(_call_capabilities, principal)
    assert q_hit == 0, "primed entry must be served from cache (R5.1)"

    # Commit the role change; the on_commit invalidation must fire.
    with django_capture_on_commit_callbacks(execute=True):
        user.role = "super_admin"
        user.save()
    principal.role = "super_admin"

    # Next read recomputes (cache miss) and reflects the new role (R5.4).
    after, q_after = _read(_call_capabilities, principal)
    assert q_after > 0, "role change must force the next read to recompute (R5.4)"
    assert after["role"] == "super_admin"
    assert after["is_super_admin"] is True


# ---------------------------------------------------------------------------
# R5.5 — Membership create / update / delete force recompute
# ---------------------------------------------------------------------------


@override_settings(PERF_CACHE_CAPABILITIES=True)
def test_membership_lifecycle_forces_recompute(django_capture_on_commit_callbacks):
    """Membership create/update/delete each force the next read to recompute (R5.5)."""
    from tests.tenant_fixtures import build_institution, build_membership, build_profile

    user = build_profile(role="admin")
    inst = build_institution()
    principal = _principal_for(user)

    # Prime: an admin with no membership sees no institutions.
    primed, q_prime = _read(_call_scope, principal)
    assert q_prime > 0
    assert primed["institutions"] == []
    _, q_hit = _read(_call_scope, principal)
    assert q_hit == 0, "primed entry must be served from cache (R5.1)"

    # CREATE membership -> next read recomputes and now sees the institution.
    with django_capture_on_commit_callbacks(execute=True):
        membership = build_membership(user=user, institution=inst, role="admin")
    after_create, q_create = _read(_call_scope, principal)
    assert q_create > 0, "membership create must force recompute (R5.5)"
    assert _institution_ids(after_create) == [str(inst.id)]

    # Re-prime the cache hit before the next mutation.
    _, q_hit2 = _read(_call_scope, principal)
    assert q_hit2 == 0

    # UPDATE membership (deactivate) -> next read recomputes, institution drops.
    with django_capture_on_commit_callbacks(execute=True):
        membership.is_active = False
        membership.save()
    after_update, q_update = _read(_call_scope, principal)
    assert q_update > 0, "membership update must force recompute (R5.5)"
    assert after_update["institutions"] == []

    # Reactivate so the delete is exercised from an in-scope state.
    with django_capture_on_commit_callbacks(execute=True):
        membership.is_active = True
        membership.save()
    after_reactivate, _ = _read(_call_scope, principal)
    assert _institution_ids(after_reactivate) == [str(inst.id)]
    _, q_hit3 = _read(_call_scope, principal)
    assert q_hit3 == 0

    # DELETE membership -> next read recomputes, institution drops.
    with django_capture_on_commit_callbacks(execute=True):
        membership.delete()
    after_delete, q_delete = _read(_call_scope, principal)
    assert q_delete > 0, "membership delete must force recompute (R5.5)"
    assert after_delete["institutions"] == []


# ---------------------------------------------------------------------------
# R5.5 — AccessGrant create / update / delete force recompute
# ---------------------------------------------------------------------------


@override_settings(PERF_CACHE_CAPABILITIES=True)
def test_access_grant_lifecycle_forces_recompute(django_capture_on_commit_callbacks):
    """AccessGrant create/update/delete each force the next read to recompute (R5.5)."""
    from tests.tenant_fixtures import build_access_grant, build_institution, build_profile

    user = build_profile(role="admin")
    inst = build_institution()
    principal = _principal_for(user)

    # Prime: admin with no grant sees no institutions.
    primed, q_prime = _read(_call_scope, principal)
    assert q_prime > 0
    assert primed["institutions"] == []
    _, q_hit = _read(_call_scope, principal)
    assert q_hit == 0, "primed entry must be served from cache (R5.1)"

    # CREATE an institution-scoped grant -> recompute, institution now visible.
    with django_capture_on_commit_callbacks(execute=True):
        grant = build_access_grant(user=user, scope_type="institution", institution=inst)
    after_create, q_create = _read(_call_scope, principal)
    assert q_create > 0, "grant create must force recompute (R5.5)"
    assert _institution_ids(after_create) == [str(inst.id)]

    _, q_hit2 = _read(_call_scope, principal)
    assert q_hit2 == 0

    # UPDATE grant (deactivate) -> recompute, institution drops.
    with django_capture_on_commit_callbacks(execute=True):
        grant.is_active = False
        grant.save()
    after_update, q_update = _read(_call_scope, principal)
    assert q_update > 0, "grant update must force recompute (R5.5)"
    assert after_update["institutions"] == []

    # Reactivate so the delete is exercised from an in-scope state.
    with django_capture_on_commit_callbacks(execute=True):
        grant.is_active = True
        grant.save()
    after_reactivate, _ = _read(_call_scope, principal)
    assert _institution_ids(after_reactivate) == [str(inst.id)]
    _, q_hit3 = _read(_call_scope, principal)
    assert q_hit3 == 0

    # DELETE grant -> recompute, institution drops.
    with django_capture_on_commit_callbacks(execute=True):
        grant.delete()
    after_delete, q_delete = _read(_call_scope, principal)
    assert q_delete > 0, "grant delete must force recompute (R5.5)"
    assert after_delete["institutions"] == []


# ---------------------------------------------------------------------------
# R5.6 — Institution.is_active change forces recompute for scoped users
# ---------------------------------------------------------------------------


@override_settings(PERF_CACHE_CAPABILITIES=True)
def test_institution_active_change_forces_recompute(django_capture_on_commit_callbacks):
    """Deactivating a tenant invalidates its scoped users' cached payloads (R5.6).

    ``visible_institution_queryset`` does not filter on ``is_active``, so the
    visible-institution payload is unchanged by the deactivation; the proof that
    the next read recomputed (rather than serving the pre-change entry) is the
    query-count delta — a cache hit issues zero ORM queries, the post-change
    read issues one or more.
    """
    from tests.tenant_fixtures import build_institution, build_membership, build_profile

    user = build_profile(role="admin")
    inst = build_institution(is_active=True)
    build_membership(user=user, institution=inst, role="admin")
    principal = _principal_for(user)

    primed, q_prime = _read(_call_scope, principal)
    assert q_prime > 0
    assert _institution_ids(primed) == [str(inst.id)]
    _, q_hit = _read(_call_scope, principal)
    assert q_hit == 0, "primed entry must be served from cache (R5.1)"

    # Deactivate the tenant; the R5.6 signal resolves scoped users via active
    # membership and invalidates the admin's cached payload.
    with django_capture_on_commit_callbacks(execute=True):
        inst.is_active = False
        inst.save()

    _, q_after = _read(_call_scope, principal)
    assert q_after > 0, (
        "institution activation change must force the next read to recompute "
        "and not serve the pre-change entry (R5.6)"
    )


# ---------------------------------------------------------------------------
# R5.7 — Stale super-admin demotion
# ---------------------------------------------------------------------------


@override_settings(PERF_CACHE_CAPABILITIES=True)
def test_stale_super_admin_demotion(django_capture_on_commit_callbacks):
    """After a super_admin -> admin demotion both endpoints recompute to zero
    ``platform.*`` capabilities and never serve the pre-change all-access entry (R5.7)."""
    from tests.tenant_fixtures import build_profile

    user = build_profile(role="super_admin")
    principal = _principal_for(user)

    # Prime via the scope endpoint; capabilities shares the same per-user "cap"
    # entry, so this primes both views.
    scope_before, q_scope_prime = _read(_call_scope, principal)
    assert q_scope_prime > 0
    assert scope_before["is_super_admin"] is True
    assert scope_before["all_access"] is True
    assert _platform_caps(scope_before), "super_admin must start with platform.* caps"

    # Both endpoints now serve the cached super-admin payload (R5.1).
    caps_before, q_caps_hit = _read(_call_capabilities, principal)
    assert q_caps_hit == 0, "capabilities must hit the shared primed entry"
    assert caps_before["is_super_admin"] is True

    # Demote the user; the Profile.role signal invalidates the cached entry.
    with django_capture_on_commit_callbacks(execute=True):
        user.role = "admin"
        user.save()
    principal.role = "admin"

    # Next scope read recomputes and exposes zero platform.* / no all-access.
    scope_after, q_scope_after = _read(_call_scope, principal)
    assert q_scope_after > 0, "demotion must force scope to recompute (R5.7)"
    assert scope_after["is_super_admin"] is False
    assert scope_after["all_access"] is False
    assert _platform_caps(scope_after) == [], "no platform.* after demotion (R5.7)"

    # The capabilities endpoint shares the same per-user "cap" entry, which the
    # scope recompute above just re-stored — so this read is served from the
    # freshly recomputed (post-demotion) entry, never the pre-change all-access
    # one: it likewise exposes zero platform.* capabilities (R5.7).
    caps_after, _ = _read(_call_capabilities, principal)
    assert caps_after["is_super_admin"] is False
    assert _platform_caps(caps_after) == [], "no platform.* after demotion (R5.7)"
