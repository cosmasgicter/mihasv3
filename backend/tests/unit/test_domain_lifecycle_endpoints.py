"""Domain lifecycle command + durable-verification tests (task 4.4, R5.1-R5.3).

Covers the parts of finding TEN-04 that the state-machine property test
(``tests/property/test_domain_status_machine.py``) cannot: the HTTP lifecycle
commands on the one :class:`DomainStatusMachine`, the durable
"commit-a-verification-job-before-returning-accepted" contract (design §6.3),
and the broker-down/retry recovery sweep (design §17 — "Queued means a committed
durable record exists").

What is pinned here:

* **create commits a verification job** (R5.1) — creating a domain requests a
  durable verification job; the committed ``pending_dns`` row survives a broker
  outage and the sweeper re-dispatches it.
* **retry / approve / reject / reactivate** (R5.1) — every operator lifecycle
  command routes through ``platform.domain.manage`` and the one state machine;
  an invalid-for-status command returns ``DOMAIN_TRANSITION_REJECTED`` (409) and
  leaves the domain unchanged.
* **capability policy** (R5.1 / R3) — a non-super-admin without
  ``platform.domain.manage`` is denied every command (403).
* **resolver update** (R5.2) — a reactivated domain resolves its tenant; a
  disabled domain fails closed to the neutral Beanola context.

These are example/edge unit+integration tests; the exhaustive transition table
is covered by the hypothesis property test.

**Validates: Requirements 5.1, 5.2, 5.3**
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.catalog.models import InstitutionDomain
from apps.catalog.services import InstitutionContextService
from apps.catalog.tasks import (
    enqueue_domain_verification,
    sweep_pending_domain_verifications_task,
    verify_institution_domain_task,
)
from tests.tenant_fixtures import (
    build_institution,
    build_institution_domain,
    build_profile,
)

pytestmark = pytest.mark.django_db

D = InstitutionDomain
_SWEEP_LOCK_KEY = "celery_lock:sweep_pending_domain_verifications"


# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------


def _client_for(profile) -> APIClient:
    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(profile.id),
                "email": profile.email,
                "role": profile.role,
                "first_name": profile.first_name,
                "last_name": profile.last_name,
            }
        )
    )
    return client


def _super_admin_client() -> APIClient:
    """A client with platform authority (super_admin => all ``platform.*``)."""
    return _client_for(build_profile(role="super_admin"))


def _tenant_admin_client() -> APIClient:
    """A tenant admin with **no** membership => zero platform capabilities."""
    return _client_for(build_profile(role="admin"))


def _create_url(institution_id) -> str:
    return f"/api/v1/admin/institutions/{institution_id}/domains/"


def _action_url(institution_id, domain_id, action: str) -> str:
    return f"/api/v1/admin/institutions/{institution_id}/domains/{domain_id}/{action}/"


def _host(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}.example"


# ---------------------------------------------------------------------------
# Create commits a durable verification job (R5.1)
# ---------------------------------------------------------------------------


class TestDomainCreateCommitsVerification:
    """Creating a domain commits a verification job before returning accepted."""

    def test_create_requests_verification_job(self):
        """A 201 create returns ``pending_dns`` **and** requests the durable
        verification job for exactly the created domain (R5.1)."""
        client = _super_admin_client()
        inst = build_institution()
        with patch("apps.catalog.tasks.enqueue_domain_verification") as enqueue:
            resp = client.post(
                _create_url(inst.id),
                data={"hostname": _host("create"), "is_primary": True, "is_active": True},
                format="json",
            )
        assert resp.status_code == 201, resp.content
        data = resp.json()["data"]
        assert data["status"] == D.STATUS_PENDING_DNS
        enqueue.assert_called_once()
        assert str(enqueue.call_args.args[0]) == data["id"]

    def test_create_broker_down_persists_and_sweeper_recovers(
        self, django_capture_on_commit_callbacks
    ):
        """If the broker is down at create time the dispatch fails silently, the
        ``pending_dns`` row is still durably committed (201), and the sweeper
        re-dispatches it once the broker recovers (design §17)."""
        client = _super_admin_client()
        inst = build_institution()
        host = _host("brokerdown")

        # Broker is down: the post-commit dispatch raises but must be swallowed.
        with patch.object(
            verify_institution_domain_task, "delay", side_effect=RuntimeError("broker down")
        ):
            with django_capture_on_commit_callbacks(execute=True):
                resp = client.post(
                    _create_url(inst.id),
                    data={"hostname": host, "is_primary": True, "is_active": True},
                    format="json",
                )

        assert resp.status_code == 201, resp.content
        domain_id = resp.json()["data"]["id"]
        domain = D.objects.get(id=domain_id)
        # The durable record exists and was never verified (dispatch never ran).
        assert domain.status == D.STATUS_PENDING_DNS
        assert domain.last_checked_at is None

        # Broker recovers: the sweep re-dispatches the committed job from the DB.
        cache.delete(_SWEEP_LOCK_KEY)
        with patch.object(verify_institution_domain_task, "delay") as delay:
            sweep_pending_domain_verifications_task()
        dispatched = {str(call.args[0]) for call in delay.call_args_list}
        assert domain_id in dispatched


# ---------------------------------------------------------------------------
# enqueue helper + sweeper durability (R5.1 / design §17)
# ---------------------------------------------------------------------------


class TestDurableVerificationDispatch:
    def test_enqueue_dispatches_after_commit(self, django_capture_on_commit_callbacks):
        """``enqueue_domain_verification`` dispatches the task only after commit."""
        inst = build_institution()
        domain = build_institution_domain(
            institution=inst, hostname=_host("enq"), status=D.STATUS_PENDING_DNS
        )
        with patch.object(verify_institution_domain_task, "delay") as delay:
            with django_capture_on_commit_callbacks(execute=True):
                enqueue_domain_verification(domain.id)
                # Nothing dispatched until the transaction commits.
                delay.assert_not_called()
            delay.assert_called_once_with(str(domain.id))

    def test_enqueue_swallows_broker_failure(self, django_capture_on_commit_callbacks):
        """A broker outage during dispatch never propagates (the durable row is
        untouched and the sweeper will retry)."""
        inst = build_institution()
        domain = build_institution_domain(
            institution=inst, hostname=_host("enqfail"), status=D.STATUS_PENDING_DNS
        )
        with patch.object(
            verify_institution_domain_task, "delay", side_effect=RuntimeError("broker down")
        ):
            # Must not raise out of the commit callback.
            with django_capture_on_commit_callbacks(execute=True):
                enqueue_domain_verification(domain.id)
        domain.refresh_from_db()
        assert domain.status == D.STATUS_PENDING_DNS

    def test_sweeper_redispatches_only_unchecked_or_stale_pending_dns(self):
        """The sweep re-dispatches never-checked (broker-down) and stale
        ``pending_dns`` rows, and never touches recently-checked or non-pending
        rows."""
        inst = build_institution()
        now = timezone.now()
        never = build_institution_domain(
            institution=inst, hostname=_host("never"), status=D.STATUS_PENDING_DNS,
            last_checked_at=None,
        )
        stale = build_institution_domain(
            institution=inst, hostname=_host("stale"), status=D.STATUS_PENDING_DNS,
            last_checked_at=now - timedelta(hours=1),
        )
        recent = build_institution_domain(
            institution=inst, hostname=_host("recent"), status=D.STATUS_PENDING_DNS,
            last_checked_at=now,
        )
        active = build_institution_domain(
            institution=inst, hostname=_host("active"), status=D.STATUS_ACTIVE,
        )

        cache.delete(_SWEEP_LOCK_KEY)
        with patch.object(verify_institution_domain_task, "delay") as delay:
            dispatched_count = sweep_pending_domain_verifications_task()

        dispatched = {str(call.args[0]) for call in delay.call_args_list}
        assert str(never.id) in dispatched
        assert str(stale.id) in dispatched
        assert str(recent.id) not in dispatched
        assert str(active.id) not in dispatched
        assert dispatched_count == 2


# ---------------------------------------------------------------------------
# retry (R5.1)
# ---------------------------------------------------------------------------


class TestDomainRetry:
    @pytest.mark.parametrize(
        "start", [D.STATUS_PENDING_DNS, D.STATUS_FAILED, D.STATUS_REJECTED]
    )
    def test_retry_valid_from_pending_failed_rejected(self, start):
        """Retry from pending/failed/rejected returns 202, lands the domain in
        ``pending_dns``, clears ``last_error``, and commits a fresh job."""
        client = _super_admin_client()
        inst = build_institution()
        domain = build_institution_domain(
            institution=inst, hostname=_host("retry"), status=start,
            last_error="previous failure",
        )
        with patch("apps.catalog.tasks.enqueue_domain_verification") as enqueue:
            resp = client.post(_action_url(inst.id, domain.id, "retry"), format="json")
        assert resp.status_code == 202, resp.content
        assert resp.json()["data"]["status"] == D.STATUS_PENDING_DNS
        domain.refresh_from_db()
        assert domain.status == D.STATUS_PENDING_DNS
        assert domain.last_error is None
        enqueue.assert_called_once()
        assert str(enqueue.call_args.args[0]) == str(domain.id)

    @pytest.mark.parametrize(
        "start",
        [D.STATUS_PENDING_REVIEW, D.STATUS_VERIFIED, D.STATUS_ACTIVE, D.STATUS_DISABLED],
    )
    def test_retry_invalid_from_other_statuses(self, start):
        """Retry from a non-retryable status is a 409 and leaves the row alone."""
        client = _super_admin_client()
        inst = build_institution()
        domain = build_institution_domain(
            institution=inst, hostname=_host("retrybad"), status=start,
            is_active=start != D.STATUS_DISABLED,
        )
        with patch("apps.catalog.tasks.enqueue_domain_verification") as enqueue:
            resp = client.post(_action_url(inst.id, domain.id, "retry"), format="json")
        assert resp.status_code == 409, resp.content
        assert resp.json()["code"] == "DOMAIN_TRANSITION_REJECTED"
        enqueue.assert_not_called()
        domain.refresh_from_db()
        assert domain.status == start


# ---------------------------------------------------------------------------
# approve / reject (R5.1)
# ---------------------------------------------------------------------------


class TestDomainApproveReject:
    def test_approve_from_pending_review(self):
        client = _super_admin_client()
        inst = build_institution()
        domain = build_institution_domain(
            institution=inst, hostname=_host("approve"),
            status=D.STATUS_PENDING_REVIEW, verified_at=timezone.now(),
        )
        resp = client.post(_action_url(inst.id, domain.id, "approve"), format="json")
        assert resp.status_code == 200, resp.content
        assert resp.json()["data"]["status"] == D.STATUS_VERIFIED
        domain.refresh_from_db()
        assert domain.status == D.STATUS_VERIFIED

    @pytest.mark.parametrize(
        "start",
        [
            D.STATUS_PENDING_DNS,
            D.STATUS_VERIFIED,
            D.STATUS_ACTIVE,
            D.STATUS_DISABLED,
            D.STATUS_FAILED,
            D.STATUS_REJECTED,
        ],
    )
    def test_approve_invalid_from_other_statuses(self, start):
        client = _super_admin_client()
        inst = build_institution()
        domain = build_institution_domain(
            institution=inst, hostname=_host("approvebad"), status=start,
            is_active=start != D.STATUS_DISABLED,
        )
        resp = client.post(_action_url(inst.id, domain.id, "approve"), format="json")
        assert resp.status_code == 409, resp.content
        assert resp.json()["code"] == "DOMAIN_TRANSITION_REJECTED"
        domain.refresh_from_db()
        assert domain.status == start

    def test_reject_from_pending_review_stores_reason(self):
        client = _super_admin_client()
        inst = build_institution()
        domain = build_institution_domain(
            institution=inst, hostname=_host("reject"), status=D.STATUS_PENDING_REVIEW,
        )
        resp = client.post(
            _action_url(inst.id, domain.id, "reject"),
            data={"reason": "Ownership could not be confirmed."},
            format="json",
        )
        assert resp.status_code == 200, resp.content
        assert resp.json()["data"]["status"] == D.STATUS_REJECTED
        domain.refresh_from_db()
        assert domain.status == D.STATUS_REJECTED
        assert domain.last_error == "Ownership could not be confirmed."

    def test_reject_without_reason_uses_default(self):
        client = _super_admin_client()
        inst = build_institution()
        domain = build_institution_domain(
            institution=inst, hostname=_host("rejectnoreason"),
            status=D.STATUS_PENDING_REVIEW,
        )
        resp = client.post(_action_url(inst.id, domain.id, "reject"), format="json")
        assert resp.status_code == 200, resp.content
        domain.refresh_from_db()
        assert domain.status == D.STATUS_REJECTED
        assert domain.last_error  # a non-empty default reason is recorded

    @pytest.mark.parametrize(
        "start",
        [D.STATUS_PENDING_DNS, D.STATUS_VERIFIED, D.STATUS_ACTIVE, D.STATUS_FAILED],
    )
    def test_reject_invalid_from_other_statuses(self, start):
        client = _super_admin_client()
        inst = build_institution()
        domain = build_institution_domain(
            institution=inst, hostname=_host("rejectbad"), status=start,
        )
        resp = client.post(_action_url(inst.id, domain.id, "reject"), format="json")
        assert resp.status_code == 409, resp.content
        assert resp.json()["code"] == "DOMAIN_TRANSITION_REJECTED"


# ---------------------------------------------------------------------------
# reactivate (R5.1) + resolver update (R5.2)
# ---------------------------------------------------------------------------


class TestDomainReactivate:
    def test_reactivate_from_disabled_makes_domain_resolvable(self):
        """``disabled -> active`` re-enables routing; the fail-closed resolver
        binds the tenant again (R5.1, R5.2)."""
        client = _super_admin_client()
        inst = build_institution()
        host = _host("reactivate")
        domain = build_institution_domain(
            institution=inst, hostname=host, status=D.STATUS_DISABLED, is_active=False,
        )
        # While disabled the resolver fails closed to the neutral context.
        assert InstitutionContextService().resolve(host).institution is None

        resp = client.post(_action_url(inst.id, domain.id, "reactivate"), format="json")
        assert resp.status_code == 200, resp.content
        assert resp.json()["data"]["status"] == D.STATUS_ACTIVE
        domain.refresh_from_db()
        assert domain.status == D.STATUS_ACTIVE
        assert domain.is_active is True

        # Now the resolver routes the tenant (resolver update on transition).
        ctx = InstitutionContextService().resolve(host)
        assert ctx.portal_type == "white_label"
        assert ctx.institution is not None
        assert str(ctx.institution.id) == str(inst.id)

    @pytest.mark.parametrize(
        "start",
        [
            D.STATUS_PENDING_DNS,
            D.STATUS_PENDING_REVIEW,
            D.STATUS_VERIFIED,
            D.STATUS_ACTIVE,
            D.STATUS_FAILED,
            D.STATUS_REJECTED,
        ],
    )
    def test_reactivate_invalid_from_other_statuses(self, start):
        client = _super_admin_client()
        inst = build_institution()
        domain = build_institution_domain(
            institution=inst, hostname=_host("reactivatebad"), status=start,
        )
        resp = client.post(_action_url(inst.id, domain.id, "reactivate"), format="json")
        assert resp.status_code == 409, resp.content
        assert resp.json()["code"] == "DOMAIN_TRANSITION_REJECTED"
        domain.refresh_from_db()
        assert domain.status == start


# ---------------------------------------------------------------------------
# Capability policy (R5.1 / R3): platform.domain.manage required
# ---------------------------------------------------------------------------


class TestDomainLifecycleCapabilityPolicy:
    @pytest.mark.parametrize("action", ["retry", "approve", "reject", "reactivate"])
    def test_lifecycle_commands_require_platform_domain_manage(self, action):
        """A tenant admin without ``platform.domain.manage`` is denied every
        lifecycle command (403) and the domain is never mutated."""
        client = _tenant_admin_client()
        inst = build_institution()
        domain = build_institution_domain(
            institution=inst, hostname=_host(f"cap{action}"),
            status=D.STATUS_PENDING_REVIEW,
        )
        resp = client.post(_action_url(inst.id, domain.id, action), format="json")
        assert resp.status_code == 403, resp.content
        assert resp.json()["code"] == "FORBIDDEN"
        domain.refresh_from_db()
        assert domain.status == D.STATUS_PENDING_REVIEW

    @pytest.mark.parametrize("action", ["retry", "approve", "reject", "reactivate"])
    def test_lifecycle_commands_404_for_unknown_domain(self, action):
        """A well-formed but unknown domain id is a 404 for an authorized actor."""
        client = _super_admin_client()
        inst = build_institution()
        resp = client.post(
            _action_url(inst.id, uuid.uuid4(), action), format="json"
        )
        assert resp.status_code == 404, resp.content
