"""Secure and correct public tracking (admissions-v2 task 10.5).

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/``
Requirements: R13.12, R2.3-R2.4, R17.2, R17.7
Findings:     STU-22 (guessable application numbers used as credentials, unreliable
              host binding, frontend/backend field drift), TEN-10 (a trusted tenant
              host must win)
Design:       design.md §12 — "Public tracking uses a random, revocable, hashed
              tracking secret and minimal response. An institution domain can
              reveal only an application for that same tenant. … Attempts are
              rate-limited and audited without logging the raw token. Share links
              include the random token, not an application number."

The `_Evidence:` line names five things, and each has a class here:

* :class:`TestEnumeration`   — the credential is random and hashed; a sequential
  application number authorises nothing; every refusal is the same refusal.
* :class:`TestRateLimit`     — failed attempts are charged per IP; a valid holder
  never spends the budget.
* :class:`TestHostIsolation` — a white-label host reveals only its own tenant's
  application; the neutral portal resolves by secret alone.
* :class:`TestContract`      — the published field set is exactly what the client
  reads, and nothing more.
* :class:`TestShareLink`     — the shareable URL carries the random token and no
  PII, and issuing rotates.

Plus :class:`TestMigration` (this task *does* ship schema) and
:class:`TestOneAuthority` (the guards that keep it one authority).

**Validates: Requirements R13.12, R2.3, R2.4, R17.2, R17.7**
"""

from __future__ import annotations

import ast
import inspect
import pathlib
import re
import uuid

import pytest
from django.core.cache import cache
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.applications import tracking_secret
from apps.applications.models import Application
from apps.applications.public_views import ApplicationTrackView
from apps.applications.serializers import ApplicationTrackingSerializer
from apps.accounts.authentication import JWTUser
from apps.catalog.services import AccessScopeService
from apps.common.models import AuditLog
from apps.common.throttling import PublicTrackingFailureThrottle
from tests.tenant_fixtures import (
    build_application,
    build_institution_domain,
    build_profile,
    build_tenant_world,
    build_two_tenant_worlds,
)

TRACK_URL = "/api/v1/applications/track/"

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]


def link_url(application_id) -> str:
    return f"/api/v1/applications/{application_id}/tracking-link/"


def _client_for(profile) -> APIClient:
    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(profile.id),
                "email": profile.email,
                "role": profile.role,
                "first_name": profile.first_name or "T",
                "last_name": profile.last_name or "S",
            }
        )
    )
    return client


def _issue(application) -> str:
    """Issue through the service and return the plaintext secret."""
    return tracking_secret.issue(application).code


@pytest.fixture(autouse=True)
def production_scope(monkeypatch):
    """Measure the real membership/grant model, never the test admin shortcut."""
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


@pytest.fixture(autouse=True)
def clean_throttle_bucket():
    """Each test starts with an empty failed-attempt budget."""
    cache.clear()
    yield
    cache.clear()


# ---------------------------------------------------------------------------
# 1. Enumeration (R13.12, STU-22)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEnumeration:
    def test_an_application_number_is_not_a_credential(self):
        world = build_tenant_world(application_status="submitted")
        client = APIClient()

        response = client.get(TRACK_URL, {"code": world.application.application_number})

        assert response.status_code == 400
        assert response.data["code"] == "TRACKING_SECRET_REQUIRED"
        # The application's data is absent, not merely unrendered.
        body = str(response.data)
        assert world.application.full_name not in body
        assert str(world.application.status) not in body

    def test_a_legacy_tracking_code_is_not_a_credential(self):
        world = build_tenant_world(application_status="submitted")
        application = world.application
        application.public_tracking_code = "TRK-ABCDEF123456"
        application.save(update_fields=["public_tracking_code"])

        response = APIClient().get(TRACK_URL, {"code": "TRK-ABCDEF123456"})

        assert response.status_code == 400
        assert response.data["code"] == "TRACKING_SECRET_REQUIRED"

    def test_the_refusal_is_identical_whether_or_not_the_number_exists(self):
        """The refusal must be a pure function of the string.

        This is the enumeration property. If a real application number produced a
        different status, code or message than an invented one, the endpoint would
        confirm existence for free — which is exactly the oracle STU-22 describes,
        just moved one response code along.
        """
        world = build_tenant_world(application_status="submitted")
        client = APIClient()

        real = client.get(TRACK_URL, {"code": world.application.application_number})
        invented = client.get(TRACK_URL, {"code": "BNL999999999999"})

        assert real.status_code == invented.status_code == 400
        assert real.data == invented.data

    def test_a_legacy_identifier_never_reaches_the_database(self):
        """No query at all — the strongest form of "not an oracle"."""
        world = build_tenant_world(application_status="submitted")
        client = APIClient()
        code = world.application.application_number

        with connection.execute_wrapper(_QueryRecorder()) as _:
            pass
        recorder = _QueryRecorder()
        with connection.execute_wrapper(recorder):
            response = client.get(TRACK_URL, {"code": code})

        assert response.status_code == 400
        application_reads = [
            sql for sql in recorder.statements if "applications" in sql.lower()
        ]
        assert application_reads == [], application_reads

    def test_a_live_secret_resolves_its_application(self):
        world = build_tenant_world(application_status="submitted")
        code = _issue(world.application)

        response = APIClient().get(TRACK_URL, {"code": code})

        assert response.status_code == 200, response.data
        assert response.data["data"]["application_number"] == (
            world.application.application_number
        )

    def test_the_plaintext_is_never_stored(self):
        world = build_tenant_world(application_status="submitted")
        code = _issue(world.application)
        _, verifier = tracking_secret.parse(code)

        row = Application.objects.get(pk=world.application.pk)

        assert row.tracking_secret_hash == tracking_secret.hash_verifier(verifier)
        assert verifier not in (row.tracking_secret_hash or "")
        assert code not in (row.tracking_secret_hash or "")
        # The selector is stored (it is not secret); the verifier is not.
        assert row.tracking_selector not in (None, "")
        assert verifier != row.tracking_selector

    def test_an_unknown_selector_is_a_masked_404(self):
        build_tenant_world(application_status="submitted")
        invented = tracking_secret.build_code("00000000", "0" * 20)

        response = APIClient().get(TRACK_URL, {"code": invented})

        assert response.status_code == 404
        assert response.data["code"] == "NOT_FOUND"

    def test_a_wrong_verifier_on_a_real_selector_is_the_same_404(self):
        world = build_tenant_world(application_status="submitted")
        code = _issue(world.application)
        selector, _ = tracking_secret.parse(code)
        wrong = tracking_secret.build_code(selector, "Z" * 20)
        client = APIClient()

        unknown = client.get(
            TRACK_URL, {"code": tracking_secret.build_code("00000000", "0" * 20)}
        )
        tampered = client.get(TRACK_URL, {"code": wrong})

        assert tampered.status_code == unknown.status_code == 404
        assert tampered.data == unknown.data

    def test_a_revoked_secret_is_the_same_404(self):
        world = build_tenant_world(application_status="submitted")
        code = _issue(world.application)
        tracking_secret.revoke(world.application)

        response = APIClient().get(TRACK_URL, {"code": code})

        assert response.status_code == 404
        assert response.data["code"] == "NOT_FOUND"

    def test_issuing_again_revokes_the_previous_secret(self):
        world = build_tenant_world(application_status="submitted")
        first = _issue(world.application)
        second = _issue(world.application)
        client = APIClient()

        assert first != second
        assert client.get(TRACK_URL, {"code": first}).status_code == 404
        assert client.get(TRACK_URL, {"code": second}).status_code == 200

    def test_unrecognised_input_keeps_the_stable_invalid_format_code(self):
        response = APIClient().get(TRACK_URL, {"code": "NOTACODE"})

        assert response.status_code == 400
        assert response.data["code"] == "INVALID_FORMAT"

    def test_a_missing_code_keeps_the_stable_validation_error_code(self):
        response = APIClient().get(TRACK_URL)

        assert response.status_code == 400
        assert response.data["code"] == "VALIDATION_ERROR"

    def test_the_secret_carries_enough_entropy_to_be_unsearchable(self):
        """40 bits of selector + 100 bits of verifier, over an unambiguous alphabet."""
        assert len(tracking_secret.ALPHABET) == 32
        assert not (set("ILOU") & set(tracking_secret.ALPHABET))
        assert tracking_secret.SELECTOR_LENGTH == 8
        assert tracking_secret.VERIFIER_LENGTH == 20

    def test_the_verifier_is_compared_in_constant_time(self):
        source = inspect.getsource(tracking_secret.matches)
        assert "compare_digest" in source
        # An `==` on the digest would leak the matching prefix length in timing.
        assert "==" not in source.split('"""')[-1]


class _QueryRecorder:
    """Collect the SQL a block of code executes."""

    def __init__(self):
        self.statements: list[str] = []

    def __call__(self, execute, sql, params, many, context):
        self.statements.append(sql)
        return execute(sql, params, many, context)


# ---------------------------------------------------------------------------
# 2. Rate limit (R13.12 "rate-limit attempts", R17.7)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestRateLimit:
    def _exhaust(self, client, *, attempts: int):
        last = None
        for index in range(attempts):
            selector = f"{index:08d}".replace("8", "7").replace("9", "7")
            last = client.get(
                TRACK_URL, {"code": tracking_secret.build_code(selector, "0" * 20)}
            )
        return last

    def test_failed_attempts_exhaust_the_budget(self):
        throttle = PublicTrackingFailureThrottle()
        limit = throttle.num_requests
        client = APIClient()

        self._exhaust(client, attempts=limit)
        blocked = client.get(
            TRACK_URL, {"code": tracking_secret.build_code("77777777", "0" * 20)}
        )

        assert blocked.status_code == 429
        assert "Retry-After" in blocked.headers or blocked.get("Retry-After")

    def test_a_valid_holder_never_spends_the_failure_budget(self):
        world = build_tenant_world(application_status="submitted")
        code = _issue(world.application)
        client = APIClient()
        throttle = PublicTrackingFailureThrottle()

        for _ in range(throttle.num_requests + 5):
            response = client.get(TRACK_URL, {"code": code})
            assert response.status_code == 200, response.data

    def test_a_spent_budget_still_answers_a_correct_token(self):
        """The budget bounds refusals, not the endpoint.

        The address is shared — a school computer room, an internet café, any
        NAT is one client here — so refusing the holder of a correct token
        because a stranger behind the same address was guessing would deny the
        tracker's whole purpose for an hour, and would disclose nothing to the
        guesser either way (the verifier is 100 random bits).

        Caught by the browser journey, where every context shares one address:
        pre-fix, the third journey's deliberate host-mismatch attempts locked
        every later journey out of a *valid* read.
        """
        world = build_tenant_world(application_status="submitted")
        code = _issue(world.application)
        client = APIClient(REMOTE_ADDR="203.0.113.77")
        throttle = PublicTrackingFailureThrottle()

        self._exhaust(client, attempts=throttle.num_requests)

        # The same client, now over budget: a wrong token is 429 …
        blocked = client.get(
            TRACK_URL, {"code": tracking_secret.build_code("77777777", "0" * 20)}
        )
        assert blocked.status_code == 429
        # … and the correct token still resolves.
        for _ in range(3):
            allowed = client.get(TRACK_URL, {"code": code})
            assert allowed.status_code == 200, allowed.data

    def test_a_refused_attempt_does_not_extend_the_lockout(self):
        """Knocking while throttled must not slide the window forward.

        Otherwise a client that keeps retrying never recovers, and an operator
        cannot reason about when the budget frees up.
        """
        client = APIClient(REMOTE_ADDR="203.0.113.78")
        throttle = PublicTrackingFailureThrottle()
        self._exhaust(client, attempts=throttle.num_requests)
        key = throttle.get_cache_key(
            type("R", (), {"META": {"REMOTE_ADDR": "203.0.113.78"}})(), None
        )

        before = list(cache.get(key, []))
        for _ in range(3):
            assert (
                client.get(
                    TRACK_URL,
                    {"code": tracking_secret.build_code("77777777", "0" * 20)},
                ).status_code
                == 429
            )
        after = list(cache.get(key, []))

        assert len(after) == len(before) == throttle.num_requests
        assert after == before

    def test_the_budget_identity_is_not_caller_controlled(self):
        """A forwarded header must not mint a fresh budget.

        ``NUM_PROXIES`` lives in Django settings, not in ``REST_FRAMEWORK``, so
        DRF's own ``get_ident`` would key on the **whole** ``X-Forwarded-For``
        chain — one spoofed header per request and the budget is decorative.
        The key comes from the repo's trusted-proxy helper instead, which counts
        from the right.
        """
        client = APIClient(REMOTE_ADDR="203.0.113.79")
        throttle = PublicTrackingFailureThrottle()
        self._exhaust(client, attempts=throttle.num_requests)

        for spoof in ("198.51.100.7", "198.51.100.8, 198.51.100.9", "not-an-ip"):
            response = client.get(
                TRACK_URL,
                {"code": tracking_secret.build_code("77777777", "0" * 20)},
                HTTP_X_FORWARDED_FOR=f"{spoof}, 203.0.113.79",
            )
            assert response.status_code == 429, (spoof, response.status_code)

    def test_a_legacy_identifier_refusal_is_not_charged(self):
        """A student pasting their own application number is not an attempt.

        It never reaches the database, so charging for it would let a bystander
        lock themselves out by doing the obvious thing.
        """
        world = build_tenant_world(application_status="submitted")
        client = APIClient()
        throttle = PublicTrackingFailureThrottle()

        for _ in range(throttle.num_requests + 5):
            response = client.get(
                TRACK_URL, {"code": world.application.application_number}
            )
            assert response.status_code == 400
            assert response.data["code"] == "TRACKING_SECRET_REQUIRED"

    def test_the_budget_is_keyed_per_client(self):
        throttle = PublicTrackingFailureThrottle()
        limit = throttle.num_requests
        first = APIClient(REMOTE_ADDR="203.0.113.10")
        second = APIClient(REMOTE_ADDR="203.0.113.11")

        self._exhaust(first, attempts=limit)
        blocked = first.get(
            TRACK_URL, {"code": tracking_secret.build_code("77777777", "0" * 20)}
        )
        other = second.get(
            TRACK_URL, {"code": tracking_secret.build_code("77777777", "0" * 20)}
        )

        assert blocked.status_code == 429
        assert other.status_code == 404

    def test_the_gate_defaults_to_enabled(self, settings):
        """The boundary of an unauthenticated endpoint is not opt-in."""
        del settings.PUBLIC_TRACKING_RATE_LIMITS
        assert PublicTrackingFailureThrottle()._enabled() is True

    def test_the_gate_can_be_disabled_explicitly(self, settings):
        settings.PUBLIC_TRACKING_RATE_LIMITS = False
        throttle = PublicTrackingFailureThrottle()
        assert throttle.get_cache_key(object(), object()) is None

    def test_a_rate_limited_attempt_is_audited(self):
        throttle = PublicTrackingFailureThrottle()
        client = APIClient()
        self._exhaust(client, attempts=throttle.num_requests)
        AuditLog.objects.all().delete()

        client.get(TRACK_URL, {"code": tracking_secret.build_code("77777777", "0" * 20)})

        outcomes = [
            row.changes.get("outcome")
            for row in AuditLog.objects.filter(action="application.tracking_attempted")
        ]
        assert "rate_limited" in outcomes

    def test_the_coarse_middleware_budget_is_still_declared(self):
        """This task adds a failure budget; it does not remove the request budget."""
        from apps.common.middleware import RateLimitMiddleware

        scopes = dict(RateLimitMiddleware.SCOPE_LIMITS)
        assert scopes["/api/v1/applications/track/"] == "20/10m"


# ---------------------------------------------------------------------------
# 3. Host isolation (TEN-10, R2.3-R2.4)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestHostIsolation:
    def _activate(self, institution, hostname):
        return build_institution_domain(
            institution=institution,
            hostname=hostname,
            is_active=True,
            status="active",
            verified_at=timezone.now(),
        )

    def test_a_tenant_host_resolves_its_own_application(self):
        world = build_tenant_world(application_status="submitted")
        self._activate(world.institution, "apply.school-a.example")
        code = _issue(world.application)

        response = APIClient().get(
            TRACK_URL, {"code": code}, HTTP_HOST="apply.school-a.example"
        )

        assert response.status_code == 200, response.data

    def test_a_tenant_host_masks_another_tenants_application(self):
        world_a, world_b = build_two_tenant_worlds(application_status="submitted")
        self._activate(world_a.institution, "apply.school-a.example")
        code_b = _issue(world_b.application)
        client = APIClient()

        on_a = client.get(TRACK_URL, {"code": code_b}, HTTP_HOST="apply.school-a.example")
        unknown = client.get(
            TRACK_URL,
            {"code": tracking_secret.build_code("00000000", "0" * 20)},
            HTTP_HOST="apply.school-a.example",
        )

        assert on_a.status_code == 404
        # Byte-identical to an unknown secret: the school's own portal must not
        # become a way to learn that a code belongs somewhere else.
        assert on_a.data == unknown.data

    def test_the_neutral_portal_resolves_any_tenants_application_by_secret(self):
        world_a, world_b = build_two_tenant_worlds(application_status="submitted")
        self._activate(world_a.institution, "apply.school-a.example")
        code_b = _issue(world_b.application)

        response = APIClient().get(TRACK_URL, {"code": code_b}, HTTP_HOST="testserver")

        assert response.status_code == 200, response.data

    def test_a_non_active_domain_fails_closed_to_the_neutral_context(self):
        """Fail closed means neutral, not "guess the tenant" and not "deny everyone".

        A host whose domain row is not ``active`` resolves no tenant, so the secret
        alone is the authority — the same as the shared portal. It must not
        silently bind the *unusable* domain's institution.
        """
        world_a, world_b = build_two_tenant_worlds(application_status="submitted")
        build_institution_domain(
            institution=world_a.institution,
            hostname="apply.pending.example",
            is_active=False,
            status="pending_dns",
        )
        code_b = _issue(world_b.application)

        response = APIClient().get(
            TRACK_URL, {"code": code_b}, HTTP_HOST="apply.pending.example"
        )

        assert response.status_code == 200, response.data

    def test_a_host_mismatch_is_audited_as_such(self):
        world_a, world_b = build_two_tenant_worlds(application_status="submitted")
        self._activate(world_a.institution, "apply.school-a.example")
        code_b = _issue(world_b.application)
        AuditLog.objects.all().delete()

        APIClient().get(TRACK_URL, {"code": code_b}, HTTP_HOST="apply.school-a.example")

        rows = list(AuditLog.objects.filter(action="application.tracking_attempted"))
        assert [row.changes.get("outcome") for row in rows] == ["host_mismatch"]
        assert rows[0].changes.get("host_bound") is True
        # The refused application's identity is not recorded on a denial.
        assert rows[0].entity_id is None

    def test_the_forwarded_host_is_honoured(self):
        """The platform sits behind an edge, so the tenant host arrives forwarded."""
        world_a, world_b = build_two_tenant_worlds(application_status="submitted")
        self._activate(world_a.institution, "apply.school-a.example")
        code_b = _issue(world_b.application)

        response = APIClient().get(
            TRACK_URL,
            {"code": code_b},
            HTTP_X_FORWARDED_HOST="apply.school-a.example",
        )

        assert response.status_code == 404


# ---------------------------------------------------------------------------
# 4. Contract (R13.12, R14, STU-22)
# ---------------------------------------------------------------------------

#: The whole published public tracking contract.
PUBLISHED_FIELDS = frozenset(
    {
        "application_number",
        "status",
        "program_name",
        "intake_name",
        "institution",
        "submitted_at",
        "updated_at",
    }
)

#: Fields the pre-10.5 tracker page read that the backend never sent. Two of them
#: are reviewer-authored notes, which is why the panel that rendered them is gone.
NEVER_PUBLISHED = frozenset(
    {
        "feedback_summary",
        "admin_feedback",
        "admin_feedback_date",
        "eligibility_notes",
        "email",
        "phone",
        "nrc_number",
        "passport_number",
        "date_of_birth",
        "sex",
        "full_name",
        "address_line_1",
        "address_line_2",
        "postal_code",
        "next_of_kin_name",
        "next_of_kin_phone",
        "user_id",
        "payment_status",
        "public_tracking_code",
        "tracking_selector",
        "tracking_secret_hash",
    }
)


@pytest.mark.django_db
class TestContract:
    def test_the_published_field_set_is_exactly_the_contract(self):
        world = build_tenant_world(application_status="submitted")
        code = _issue(world.application)

        response = APIClient().get(TRACK_URL, {"code": code})

        assert set(response.data["data"]) == PUBLISHED_FIELDS

    def test_no_never_published_field_appears(self):
        world = build_tenant_world(application_status="submitted")
        code = _issue(world.application)

        response = APIClient().get(TRACK_URL, {"code": code})

        assert not (set(response.data["data"]) & NEVER_PUBLISHED)

    def test_the_serializer_declares_the_same_contract(self):
        world = build_tenant_world(application_status="submitted")
        data = ApplicationTrackingSerializer(world.application).data
        assert set(data) == PUBLISHED_FIELDS

    def test_no_applicant_value_leaks_into_the_response(self):
        world = build_tenant_world(application_status="submitted")
        application = world.application
        application.full_name = "Enumerable Applicant"
        application.email = "leak@example.com"
        application.phone = "+260970000001"
        application.nrc_number = "123456/78/9"
        application.admin_feedback = "internal reviewer note"
        application.save(
            update_fields=[
                "full_name",
                "email",
                "phone",
                "nrc_number",
                "admin_feedback",
            ]
        )
        code = _issue(application)

        body = str(APIClient().get(TRACK_URL, {"code": code}).data)

        for secret in (
            "Enumerable Applicant",
            "leak@example.com",
            "+260970000001",
            "123456/78/9",
            "internal reviewer note",
        ):
            assert secret not in body

    def test_the_names_are_the_ones_the_client_reads(self):
        """The frontend/backend field drift half of STU-22, as a drift guard.

        The client's `PublicTrackingStatus` interface is parsed out of the
        TypeScript source, so the two sides cannot diverge again without this
        failing.
        """
        source = (
            REPO_ROOT / "apps/admissions/src/services/publicTracking.ts"
        ).read_text()
        block = source.split("export interface PublicTrackingStatus {", 1)[1].split(
            "}", 1
        )[0]
        declared = {
            match.group(1)
            for match in re.finditer(r"^\s*(\w+)\??:", block, re.MULTILINE)
        }
        assert declared == PUBLISHED_FIELDS

    def test_program_and_intake_prefer_the_canonical_record(self):
        world = build_tenant_world(application_status="submitted")
        application = world.application
        application.program = "stale display snapshot"
        application.intake = "stale intake snapshot"
        application.save(update_fields=["program", "intake"])
        code = _issue(application)

        data = APIClient().get(TRACK_URL, {"code": code}).data["data"]

        assert data["program_name"] == world.canonical_program.name
        assert data["intake_name"] == world.intake.name

    def test_a_legacy_row_without_canonical_ids_falls_back_to_the_snapshot(self):
        world = build_tenant_world(with_application=False)
        legacy = build_application(
            student=build_profile(role="student"),
            institution=world.institution,
            canonical_program=world.canonical_program,
            offering=world.offering,
            intake=world.intake,
            status="submitted",
            with_canonical_ids=False,
        )
        legacy.program = "Diploma in Clinical Medicine"
        legacy.intake = "January 2026 Intake"
        legacy.save(update_fields=["program", "intake"])
        code = _issue(legacy)

        data = APIClient().get(TRACK_URL, {"code": code}).data["data"]

        assert data["program_name"] == "Diploma in Clinical Medicine"
        assert data["intake_name"] == "January 2026 Intake"

    def test_a_disclosure_is_audited_without_the_token(self):
        world = build_tenant_world(application_status="submitted")
        code = _issue(world.application)
        selector, verifier = tracking_secret.parse(code)
        AuditLog.objects.all().delete()

        APIClient().get(TRACK_URL, {"code": code})

        rows = list(AuditLog.objects.filter(action="application.tracking_attempted"))
        assert len(rows) == 1
        assert rows[0].changes.get("outcome") == "disclosed"
        assert str(rows[0].entity_id) == str(world.application.id)
        serialised = str(rows[0].changes)
        for fragment in (code, selector, verifier, tracking_secret.hash_verifier(verifier)):
            assert fragment not in serialised

    def test_the_audit_redacts_the_caller_network_identity(self):
        world = build_tenant_world(application_status="submitted")
        code = _issue(world.application)
        AuditLog.objects.all().delete()

        APIClient(REMOTE_ADDR="203.0.113.42").get(
            TRACK_URL, {"code": code}, HTTP_USER_AGENT="probe/1.0"
        )

        row = AuditLog.objects.get(action="application.tracking_attempted")
        assert row.ip_address != "203.0.113.42"
        assert row.user_agent != "probe/1.0"
        assert len(row.ip_address or "") == 64  # SHA-256 hex


# ---------------------------------------------------------------------------
# 5. Share link + the owner's command (R13.12, R13.6, STU-22)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestShareLink:
    def test_the_owner_can_issue_a_link(self):
        world = build_tenant_world(application_status="submitted")
        client = _client_for(world.student)

        response = client.post(link_url(world.application.id))

        assert response.status_code == 201, response.data
        data = response.data["data"]
        assert tracking_secret.classify(data["code"]) == tracking_secret.KIND_SECRET
        assert data["replaced_previous"] is False

    def test_the_issued_url_carries_only_the_token(self):
        world = build_tenant_world(application_status="submitted")
        application = world.application
        application.full_name = "Shareable Applicant"
        application.email = "share@example.com"
        application.save(update_fields=["full_name", "email"])
        client = _client_for(world.student)

        data = client.post(link_url(application.id)).data["data"]

        assert data["path"] == f"/track-application?code={data['code']}"
        for pii in (
            "Shareable Applicant",
            "share@example.com",
            application.application_number,
            str(application.id),
        ):
            assert pii not in data["url"]

    def test_the_shared_url_actually_tracks(self):
        world = build_tenant_world(application_status="submitted")
        data = _client_for(world.student).post(link_url(world.application.id)).data["data"]
        code = re.search(r"code=([^&]+)", data["url"]).group(1)

        response = APIClient().get(TRACK_URL, {"code": code})

        assert response.status_code == 200, response.data

    def test_the_url_is_built_from_the_requests_own_origin(self):
        """A student on their school's host gets a link back to that host (TEN-10)."""
        world = build_tenant_world(application_status="submitted")
        build_institution_domain(
            institution=world.institution,
            hostname="apply.school-a.example",
            is_active=True,
            status="active",
        )

        data = (
            _client_for(world.student)
            .post(link_url(world.application.id), HTTP_HOST="apply.school-a.example")
            .data["data"]
        )

        assert data["url"].startswith("http://apply.school-a.example/track-application")

    def test_reissuing_reports_the_rotation(self):
        world = build_tenant_world(application_status="submitted")
        client = _client_for(world.student)

        client.post(link_url(world.application.id))
        second = client.post(link_url(world.application.id))

        assert second.data["data"]["replaced_previous"] is True

    def test_another_student_is_masked(self):
        world = build_tenant_world(application_status="submitted")
        intruder = build_profile(role="student")

        response = _client_for(intruder).post(link_url(world.application.id))

        assert response.status_code == 404

    def test_staff_cannot_issue_the_applicants_link(self):
        """Issuing rotates, so a staff call would revoke the applicant's own link."""
        world = build_tenant_world(application_status="submitted")

        response = _client_for(world.staff).post(link_url(world.application.id))

        assert response.status_code == 404
        assert Application.objects.get(pk=world.application.pk).tracking_selector is None

    def test_an_unknown_application_is_the_same_mask(self):
        world = build_tenant_world(application_status="submitted")
        client = _client_for(world.student)

        unknown = client.post(link_url(uuid.uuid4()))
        other = client.post(link_url(build_tenant_world().application.id))

        assert unknown.status_code == other.status_code == 404
        assert unknown.data == other.data

    def test_issuing_is_audited_without_the_token(self):
        world = build_tenant_world(application_status="submitted")
        AuditLog.objects.all().delete()

        data = _client_for(world.student).post(link_url(world.application.id)).data["data"]

        row = AuditLog.objects.get(action="application.tracking_link_issued")
        assert str(row.entity_id) == str(world.application.id)
        assert data["code"] not in str(row.changes)
        assert row.changes.get("replaced_previous") is False

    def test_an_anonymous_caller_cannot_issue(self):
        world = build_tenant_world(application_status="submitted")

        response = APIClient().post(link_url(world.application.id))

        assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# 6. The migration this task ships
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestMigration:
    FORWARD = REPO_ROOT / "backend/scripts/2026_08_09_01_application_tracking_secret.sql"
    ROLLBACK = (
        REPO_ROOT
        / "backend/scripts/2026_08_09_01_application_tracking_secret_rollback.sql"
    )

    def test_the_forward_script_ships_and_is_additive_and_guarded(self):
        body = self.FORWARD.read_text()
        assert self.FORWARD.exists()
        for column in (
            "tracking_selector",
            "tracking_secret_hash",
            "tracking_secret_issued_at",
            "tracking_secret_revoked_at",
        ):
            assert f"ADD COLUMN IF NOT EXISTS {column}" in body
        statements = [
            line.strip().upper()
            for line in body.splitlines()
            if line.strip() and not line.strip().startswith("--")
        ]
        joined = " ".join(statements)
        for destructive in ("DROP COLUMN", "DROP TABLE", "DELETE FROM", "TRUNCATE"):
            assert destructive not in joined

    def test_the_rollback_ships_and_is_guarded(self):
        body = self.ROLLBACK.read_text()
        assert "DROP INDEX IF EXISTS uq_applications_tracking_selector" in body
        for column in (
            "tracking_selector",
            "tracking_secret_hash",
            "tracking_secret_issued_at",
            "tracking_secret_revoked_at",
        ):
            assert f"DROP COLUMN IF EXISTS {column}" in body

    def test_the_columns_exist_and_are_nullable(self):
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT column_name, is_nullable
                FROM information_schema.columns
                WHERE table_name = 'applications'
                  AND column_name LIKE 'tracking%'
                ORDER BY column_name
                """
            )
            rows = dict(cursor.fetchall())
        assert set(rows) == {
            "tracking_secret_hash",
            "tracking_secret_issued_at",
            "tracking_secret_revoked_at",
            "tracking_selector",
        }
        assert set(rows.values()) == {"YES"}

    def test_the_selector_uniqueness_is_partial(self):
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT indisunique, pg_get_expr(indpred, indrelid)
                FROM pg_index
                WHERE indrelid = 'applications'::regclass
                  AND indexrelid::regclass::text = 'uq_applications_tracking_selector'
                """
            )
            row = cursor.fetchone()
        assert row is not None, "the partial unique index is missing"
        assert row[0] is True
        assert "tracking_selector IS NOT NULL" in row[1]

    def test_a_legacy_row_stays_readable_with_every_column_null(self):
        world = build_tenant_world(application_status="submitted")
        row = Application.objects.get(pk=world.application.pk)

        assert row.tracking_selector is None
        assert row.tracking_secret_hash is None
        assert row.tracking_secret_issued_at is None
        assert row.tracking_secret_revoked_at is None
        # …and its pre-10.5 identifiers are untouched.
        assert row.application_number
        assert row.public_tracking_code

    def test_many_rows_may_coexist_without_a_secret(self):
        """The partial index must not make "no secret yet" a uniqueness collision."""
        first = build_tenant_world(application_status="submitted").application
        second = build_tenant_world(application_status="submitted").application

        assert first.tracking_selector is None
        assert second.tracking_selector is None
        assert Application.objects.filter(tracking_selector__isnull=True).count() >= 2


# ---------------------------------------------------------------------------
# 7. One authority
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestOneAuthority:
    def test_there_is_one_secret_pattern(self):
        """The view must not carry a second copy of the credential shape."""
        assert (
            ApplicationTrackView.TRACKING_CODE_PATTERN
            is tracking_secret.LEGACY_IDENTIFIER_PATTERN
        )
        source = inspect.getsource(ApplicationTrackView)
        assert "re.compile" not in source

    def test_the_view_holds_no_credential_comparison(self):
        """Hashing and comparing live in the service, not in the endpoint."""
        source = inspect.getsource(ApplicationTrackView)
        for leak in ("sha256", "compare_digest", "tracking_secret_hash"):
            assert leak not in source

    def test_no_role_string_is_compared_in_the_tracking_service(self):
        tree = ast.parse(pathlib.Path(tracking_secret.__file__).read_text())
        literals = {
            node.value
            for node in ast.walk(tree)
            if isinstance(node, ast.Constant) and isinstance(node.value, str)
        }
        assert not ({"admin", "reviewer", "super_admin", "student"} & literals)

    def test_the_endpoint_is_still_classified_as_public_tracking(self):
        from apps.common.public_endpoint_policy import PUBLIC_ENDPOINT_CLASSIFICATIONS

        assert (
            PUBLIC_ENDPOINT_CLASSIFICATIONS[
                "apps.applications.public_views.ApplicationTrackView"
            ]
            == "public_tracking_minimized"
        )
        assert ApplicationTrackView.public_endpoint_category == (
            "public_tracking_minimized"
        )

    def test_the_refusal_messages_are_constants(self):
        """A refusal that formats in a value could format in the wrong one."""
        for name in (
            "SECRET_REQUIRED_MESSAGE",
            "INVALID_FORMAT_MESSAGE",
            "NOT_FOUND_MESSAGE",
        ):
            message = getattr(ApplicationTrackView, name)
            assert isinstance(message, str)
            assert "{" not in message and "%" not in message
