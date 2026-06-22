"""Property 17 — authentication and CSRF preservation across changed endpoints.

# Feature: system-performance-hardening, Property 17

Spec: ``.kiro/specs/system-performance-hardening/`` — task 19.3.

**Validates: Requirements 13.5**

R13.5 requires that every endpoint this feature touches keeps the existing
cookie-based authentication (DRF authentication setting ``request.user``) and
CSRF protection intact: a valid CSRF token is accepted and a missing/invalid
token is rejected with **no state change**. The performance work in this spec
is read-path caching and behaviour-preserving refactors, so the property to
pin is that none of those changes weakened the auth/CSRF boundary.

This drives the *real* DRF stack over the cookie (``access_token``) auth path —
**not** ``force_authenticate``, which bypasses
``JWTCookieAuthentication._enforce_csrf`` — so the genuine CSRF layer
(``apps.accounts.authentication``: CSRF validated at the
``JWTCookieAuthentication`` layer, not middleware, with the
``CSRF_EXEMPT_PATTERNS`` exemptions) is exercised end-to-end. It mirrors the
established cookie-auth + CSRF pattern in
``backend/tests/unit/test_tenant_api_contract_preservation.py`` and the
DB-backed tenant property style in
``backend/tests/property/test_capability_gated_writes.py``.

Two halves of the property, each over ≥100 hypothesis examples:

* **Authentication preserved (changed read endpoints).** For the read
  endpoints this feature changed — the cached capability/scope endpoints
  (R5: ``GET /api/v1/admin/scope/`` and ``GET /api/v1/admin/capabilities/``)
  and the cached/single-query admin dashboard (R2:
  ``GET /api/v1/admin/dashboard/``) — a cookie-authenticated request resolves
  ``request.user`` and returns ``200`` across arbitrary admin/super-admin users,
  while an unauthenticated request (no credentials, or a garbage cookie token)
  is rejected with ``401``/``403`` and serves no payload.
* **CSRF preserved (changed state-changing endpoint).** For a state-changing
  endpoint this feature touches (the legacy catalog write path
  ``PATCH /api/v1/catalog/institutions/{id}/`` — catalog writes drive the R4
  catalog-cache invalidation), a cookie-authenticated request **with** a valid
  CSRF token is accepted (``200``) and mutates state, while one with a
  **missing** or **invalid** token is rejected (``403`` with a ``CSRF_*`` stable
  code) and causes **no** state change (the persisted institution name is
  unchanged).

Run::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/property/test_perf_csrf_preservation.py -q
"""

from __future__ import annotations

import hashlib
from datetime import timedelta

import pytest
from django.conf import settings
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from hypothesis import HealthCheck, given, settings as hyp_settings
from hypothesis import strategies as st
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.accounts.models import CSRFToken
from apps.accounts.tokens import generate_access_token
from apps.catalog.models import Institution
from tests.tenant_fixtures import build_institution, build_profile

pytestmark = [pytest.mark.django_db, pytest.mark.tenant]


# ≥100 examples (spec minimum). Deadline relaxed for the DB + HTTP round-trips;
# the ``db`` fixture is function-scoped and intentionally combined with
# ``@given`` (each example builds its own unique rows), so suppress that health
# check exactly as ``test_capability_gated_writes.py`` does.
HYPOTHESIS_SETTINGS = hyp_settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)

# Align the JWT signing key for encode (``generate_access_token``) and decode
# (``JWTCookieAuthentication``). Without a non-empty key the auth layer reports
# AUTH_SERVICE_ERROR before authentication can resolve ``request.user``.
_CSRF_SIGNING = {**settings.SIMPLE_JWT, "SIGNING_KEY": "perf-csrf-preservation-signing-key"}

# Read endpoints changed by this feature (R2 dashboard, R5 scope/capabilities).
# All three require ``[IsAuthenticated, IsAdmin]`` (role level >= admin).
_READ_ENDPOINTS = {
    "scope": "/api/v1/admin/scope/",
    "capabilities": "/api/v1/admin/capabilities/",
    "dashboard": "/api/v1/admin/dashboard/",
}

# Roles that pass ``IsAdmin`` — so a 200 isolates the *authentication* layer
# (request.user resolved) from authorization noise.
_ADMIN_ROLE = st.sampled_from(["admin", "super_admin"])
_READ_ENDPOINT = st.sampled_from(sorted(_READ_ENDPOINTS))

# CSRF tokens: non-empty ASCII alphanumerics (matches the real token charset).
_CSRF_TOKENS = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N")),
    min_size=12,
    max_size=48,
)
_NAME_SEED = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "Zs")),
    min_size=0,
    max_size=24,
)
_CSRF_VARIANT = st.sampled_from(["valid", "missing", "invalid"])


def _mint_cookie_token(profile) -> str:
    """A real signed ``access_token`` for ``profile`` (the cookie auth path)."""
    user = JWTUser(
        {
            "user_id": str(profile.id),
            "email": profile.email,
            "role": profile.role,
            "first_name": profile.first_name,
            "last_name": profile.last_name,
            "token_type": "access",
        }
    )
    return generate_access_token(user)


def _cookie_client(profile) -> APIClient:
    client = APIClient()
    client.cookies["access_token"] = _mint_cookie_token(profile)
    return client


class TestProperty17AuthAndCsrfPreservation:
    """Property 17: authentication and CSRF preservation (R13.5).

    # Feature: system-performance-hardening, Property 17

    **Validates: Requirements 13.5**
    """

    # -- Authentication preserved on the changed read endpoints -------------

    @override_settings(SIMPLE_JWT=_CSRF_SIGNING)
    @HYPOTHESIS_SETTINGS
    @given(role=_ADMIN_ROLE, endpoint=_READ_ENDPOINT)
    def test_changed_read_endpoints_resolve_authenticated_user(self, role, endpoint):
        """A cookie-authenticated admin/super-admin request resolves
        ``request.user`` and returns 200 on every read endpoint this feature
        changed (R5 scope/capabilities, R2 dashboard)."""
        cache.clear()
        profile = build_profile(role=role)
        client = _cookie_client(profile)

        resp = client.get(_READ_ENDPOINTS[endpoint])

        assert resp.status_code == 200, (endpoint, role, resp.status_code, resp.data)
        body = resp.data
        assert isinstance(body, dict) and body.get("success") is True, body
        # The capability endpoints echo the resolved actor's role — direct proof
        # that DRF authentication set ``request.user`` from the cookie token.
        if endpoint in ("scope", "capabilities"):
            assert body["data"]["role"] == role, body

    @override_settings(SIMPLE_JWT=_CSRF_SIGNING)
    @HYPOTHESIS_SETTINGS
    @given(endpoint=_READ_ENDPOINT, credential=st.sampled_from(["none", "garbage"]))
    def test_changed_read_endpoints_reject_unauthenticated(self, endpoint, credential):
        """Without a valid cookie (no credentials, or a garbage/undecodable
        cookie token) the changed read endpoints reject with 401/403 and serve
        no payload — authentication is still enforced (R13.5)."""
        cache.clear()
        client = APIClient()
        if credential == "garbage":
            client.cookies["access_token"] = "not-a-valid-jwt-token"

        resp = client.get(_READ_ENDPOINTS[endpoint])

        assert resp.status_code in (401, 403), (endpoint, credential, resp.status_code)
        body = resp.data
        assert isinstance(body, dict)
        assert body.get("success") is not True, body
        assert "data" not in body, body

    # -- CSRF preserved on a changed state-changing endpoint ----------------

    @override_settings(SIMPLE_JWT=_CSRF_SIGNING)
    @HYPOTHESIS_SETTINGS
    @given(csrf_raw=_CSRF_TOKENS, name_seed=_NAME_SEED, variant=_CSRF_VARIANT)
    def test_csrf_preserved_on_changed_state_changing_endpoint(
        self, csrf_raw, name_seed, variant
    ):
        """``PATCH /api/v1/catalog/institutions/{id}/`` (a catalog write touched
        by the R4 cache-invalidation work) accepts a valid CSRF token and
        rejects a missing/invalid one with **no state change** (R13.5).

        A Super_Admin actor is used so platform authorization always passes and
        the CSRF token is the only gate under test.
        """
        cache.clear()
        actor = build_profile(role="super_admin")
        institution = build_institution()
        original_name = institution.name
        new_name = f"Renamed {name_seed.strip() or 'School'}"
        # Guard the state-change assertion: the new value must actually differ.
        if new_name == original_name:
            new_name = f"{new_name} Updated"

        client = _cookie_client(actor)
        url = f"/api/v1/catalog/institutions/{institution.id}/"

        extra: dict[str, str] = {}
        if variant == "valid":
            CSRFToken.objects.create(
                user=actor,
                token_hash=hashlib.sha256(csrf_raw.encode()).hexdigest(),
                expires_at=timezone.now() + timedelta(hours=1),
            )
            extra["HTTP_X_CSRF_TOKEN"] = csrf_raw
        elif variant == "invalid":
            # A well-formed header that matches no persisted token row.
            extra["HTTP_X_CSRF_TOKEN"] = f"{csrf_raw}-no-matching-row"
        # variant == "missing": no X-CSRF-Token header at all.

        resp = client.patch(url, {"name": new_name}, format="json", **extra)
        institution.refresh_from_db()

        if variant == "valid":
            assert resp.status_code == 200, (resp.status_code, resp.data)
            assert institution.name == new_name, "valid CSRF must apply the write"
        else:
            assert resp.status_code == 403, (variant, resp.status_code, resp.data)
            code = resp.data.get("code") if isinstance(resp.data, dict) else None
            assert code in ("CSRF_MISSING", "CSRF_INVALID"), (variant, resp.data)
            # No state change: the persisted name is untouched on rejection.
            assert institution.name == original_name, (
                f"{variant} CSRF must not mutate state: "
                f"{institution.name!r} != {original_name!r}"
            )
            # And the institution must still exist (rejection != deletion).
            assert Institution.objects.filter(id=institution.id).exists()
