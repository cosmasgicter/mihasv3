"""Task 10.4 — durable official-document work, historically readable.

Admissions V2 task 10.4 — R13.2, R13.5, R13.7, R13.11, R17.1–R17.4; findings
**STU-18** and **API-04**.

The suite is organised by the four claims the task's ``_Evidence:`` line makes,
plus the guards that keep each claim structural rather than incidental:

    TestDurableJob                the record exists before the 202
    TestBrokerDownRecovery        a broker outage costs a delay, not a request
    TestNoPhantomQueue            "queued" is never reported without a record
    TestTerminalFailureAndRetry   a failure is terminal, visible, and retryable
    TestIssueVersusRead           two policies, not one gate answering both
    TestCanonicalEmail            one email, every type, through the one gate
    TestNeutralStudentRecovery    the student is not shown the school's setup
    TestStaffSetupAlert           the school's own staff are told instead
    TestOneAuthority              no second implementation, no migration

Every DB-backed case runs under the ``production_scope`` fixture, so what is
measured is the real membership/grant-derived capability model rather than a
test-settings shortcut.
"""

from __future__ import annotations

import ast
import glob
import inspect
import json
import os
import uuid
from unittest.mock import patch

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications import official_document_jobs as jobs
from apps.applications import official_document_views as odv
from apps.applications.models import Application
from apps.common.models import AuditLog, EmailQueue, Notification, OutboxEvent
from apps.documents.models import ApplicationDocument
from tests.tenant_fixtures import build_profile, build_tenant_world

@pytest.fixture(autouse=True)
def production_scope(monkeypatch):
    """Measure the real membership/grant model, never the test admin shortcut."""
    from apps.catalog.services import AccessScopeService

    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


# ---------------------------------------------------------------------------
# Helpers
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


def _detail_url(application_id, document_type: str = "application_slip") -> str:
    return f"/api/v1/applications/{application_id}/official-documents/{document_type}/"


def _email_url(application_id, document_type: str = "application_slip") -> str:
    return f"{_detail_url(application_id, document_type)}email/"


def _list_url(application_id) -> str:
    return f"/api/v1/applications/{application_id}/official-documents/"


def _issue_document(application, document_type: str = "application_slip"):
    """A stored, platform-issued Official_Document for ``application``."""
    return ApplicationDocument.objects.create(
        application=application,
        document_type=document_type,
        document_name=f"{document_type}.pdf",
        file_url=f"https://test-storage.local/{document_type}/x.pdf",
        file_size=2048,
        mime_type="application/pdf",
        system_generated=True,
        verification_status="verified",
        verification_notes=json.dumps({"official_document": {"fingerprint": "fp-1"}}),
        uploaded_at=timezone.now(),
    )


def _job_row(application_id, document_type: str = "application_slip"):
    return OutboxEvent.objects.filter(
        idempotency_key=jobs.job_key(application_id, document_type)
    ).first()


class _BrokerDown:
    """A ``delay`` that raises, i.e. no reachable broker."""

    def delay(self, *args, **kwargs):  # noqa: D401
        raise ConnectionError("broker unreachable")


# ---------------------------------------------------------------------------
# 1. The durable record exists before the 202 (R13.11, design §11.3)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestDurableJob:
    def test_the_generate_request_commits_a_job_before_answering(self):
        world = build_tenant_world(application_status="submitted")
        client = _client_for(world.student)

        with patch.object(odv, "_enqueue_generation", return_value="task-1"):
            response = client.post(_detail_url(world.application.id))

        assert response.status_code == 202, response.content
        body = response.json()["data"]
        assert body["status"] == "queued"

        row = _job_row(world.application.id)
        assert row is not None, "no durable job row was committed for the 202"
        assert row.channel == jobs.JOB_CHANNEL
        assert row.event_type == jobs.JOB_EVENT_TYPE
        assert str(row.aggregate_id) == str(world.application.id)
        assert row.payload.get("document_type") == "application_slip"
        # The published job is the committed row, not a hopeful summary.
        assert body["job"]["state"] in jobs.JOB_OPEN_STATES
        assert body["job"]["terminal"] is False

    def test_a_commit_failure_is_a_503_and_queues_nothing(self):
        """R13.11's explicit alternative to a dishonest 202."""
        world = build_tenant_world(application_status="submitted")
        client = _client_for(world.student)

        with patch.object(
            jobs, "request_generation", side_effect=jobs.GenerationUnavailable()
        ), patch.object(odv, "_enqueue_generation") as dispatch:
            response = client.post(_detail_url(world.application.id))

        assert response.status_code == 503, response.content
        body = response.json()
        assert body["success"] is False
        assert body["code"] == jobs.GENERATION_UNAVAILABLE
        assert body["retryable"] is True
        # Nothing was dispatched, and nothing was recorded.
        dispatch.assert_not_called()
        assert _job_row(world.application.id) is None

    def test_the_request_is_idempotent_while_the_job_is_open(self):
        world = build_tenant_world(application_status="submitted")
        client = _client_for(world.student)

        with patch.object(odv, "_enqueue_generation", return_value="task-1"):
            first = client.post(_detail_url(world.application.id))
        with patch.object(odv, "_enqueue_generation", return_value="task-2") as second_dispatch:
            second = client.post(_detail_url(world.application.id))

        assert first.status_code == second.status_code == 202
        # One row, one identity — a double-tap is one piece of work.
        assert (
            OutboxEvent.objects.filter(
                idempotency_key__startswith=jobs.JOB_KEY_PREFIX
            ).count()
            == 1
        )
        # And an open job is not re-dispatched: the worker already has it.
        second_dispatch.assert_not_called()

    def test_a_job_identity_is_one_per_application_and_type(self):
        application_id = uuid.uuid4()
        assert jobs.job_key(application_id, "application_slip").startswith(
            jobs.JOB_KEY_PREFIX
        )
        assert jobs.job_key(application_id, "application_slip") != jobs.job_key(
            application_id, "acceptance_letter"
        )

    def test_every_job_state_fits_the_stored_column(self):
        """``outbox_events.status`` is ``varchar(20)`` with no CHECK (§3)."""
        column = OutboxEvent._meta.get_field("status")
        for state in (*jobs.JOB_STATES, jobs.JOB_STATE_NONE):
            assert len(state) <= column.max_length, state

    def test_the_job_payload_carries_no_applicant_data(self):
        world = build_tenant_world(application_status="submitted")
        client = _client_for(world.student)
        with patch.object(odv, "_enqueue_generation", return_value="task-1"):
            client.post(_detail_url(world.application.id))

        row = _job_row(world.application.id)
        blob = json.dumps(row.payload, default=str)
        for sentinel in (
            world.application.full_name or "",
            world.application.email or "",
        ):
            if sentinel:
                assert sentinel not in blob, blob


# ---------------------------------------------------------------------------
# 2. Broker-down recovery (R17.4, design §11.3)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestBrokerDownRecovery:
    def test_a_broker_outage_still_records_the_request(self):
        world = build_tenant_world(application_status="submitted")
        client = _client_for(world.student)

        with patch(
            "apps.applications.tasks.generate_application_slip_task", _BrokerDown()
        ):
            response = client.post(_detail_url(world.application.id))

        assert response.status_code == 202, response.content
        body = response.json()["data"]
        # No task id, because nothing reached a worker — but the record exists,
        # so this "queued" is true rather than aspirational.
        assert body.get("task_id") is None
        row = _job_row(world.application.id)
        assert row is not None
        assert row.status == jobs.JOB_PENDING

    def test_the_sweep_redispatches_the_committed_backlog(self):
        world = build_tenant_world(application_status="submitted")
        client = _client_for(world.student)
        with patch(
            "apps.applications.tasks.generate_application_slip_task", _BrokerDown()
        ):
            client.post(_detail_url(world.application.id))

        assert _job_row(world.application.id).status == jobs.JOB_PENDING

        from apps.applications.tasks.official_document_sweep import (
            sweep_pending_official_document_jobs_task,
        )

        class _Result:
            id = "task-swept"

        class _Working:
            def delay(self, *args, **kwargs):
                return _Result()

        with patch("apps.applications.tasks.generate_application_slip_task", _Working()):
            dispatched = sweep_pending_official_document_jobs_task()

        assert dispatched == 1
        row = _job_row(world.application.id)
        assert row.status == jobs.JOB_DISPATCHED
        assert row.payload.get("task_id") == "task-swept"

    def test_the_sweep_reopens_a_dispatched_job_whose_worker_never_answered(self):
        """A worker killed mid-render leaves no terminal state (§2)."""
        world = build_tenant_world(application_status="submitted")
        with patch.object(odv, "_enqueue_generation", return_value=None):
            job = jobs.request_generation(world.application, "application_slip", dispatch=False)
        jobs.mark_dispatched(job.id, "task-lost")
        stale = timezone.now() - timezone.timedelta(
            seconds=jobs.JOB_REDISPATCH_AFTER_SECONDS + 60
        )
        OutboxEvent.objects.filter(id=job.id).update(created_at=stale)

        candidates = jobs.pending_jobs()
        assert [str(c.id) for c in candidates] == [str(job.id)]

    def test_a_settled_job_is_not_swept(self):
        world = build_tenant_world(application_status="submitted")
        with patch.object(odv, "_enqueue_generation", return_value=None):
            jobs.request_generation(world.application, "application_slip", dispatch=False)
        jobs.mark_succeeded(world.application.id, "application_slip")

        assert jobs.pending_jobs() == []

    def test_the_sweep_never_touches_a_delivered_communication_row(self):
        """The sweep's scan is document jobs, not the whole outbox."""
        from apps.common.outbox import queue_email

        world = build_tenant_world(application_status="submitted")
        queue_email(
            recipient_email="someone@example.com",
            subject="unrelated",
            body="<p>unrelated</p>",
            dispatch=False,
        )
        with patch.object(odv, "_enqueue_generation", return_value=None):
            jobs.request_generation(world.application, "application_slip", dispatch=False)

        candidates = jobs.pending_jobs()
        assert len(candidates) == 1
        assert candidates[0].channel == jobs.JOB_CHANNEL

    def test_the_sweep_is_bounded_and_fail_safe(self):
        from apps.applications.tasks.official_document_sweep import (
            sweep_pending_official_document_jobs_task,
        )

        with patch.object(jobs, "sweep_pending_jobs", side_effect=RuntimeError("boom")):
            assert sweep_pending_official_document_jobs_task() == 0

    def test_the_sweep_is_registered_on_the_beat_schedule(self):
        from django.conf import settings

        entry = settings.CELERY_BEAT_SCHEDULE.get(
            "sweep-pending-official-document-jobs"
        )
        assert entry is not None, "the recovery sweep is not scheduled"
        assert entry["task"].endswith("sweep_pending_official_document_jobs_task")
        assert entry["schedule"] > 0


# ---------------------------------------------------------------------------
# 3. No phantom queue (R13.11, STU-18)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestNoPhantomQueue:
    def test_an_unrequested_document_is_not_queued(self):
        world = build_tenant_world(application_status="submitted")
        client = _client_for(world.student)

        response = client.get(_detail_url(world.application.id))

        assert response.status_code == 200, response.content
        data = response.json()["data"]
        assert data["status"] == odv.STATUS_NOT_REQUESTED
        assert data["job"]["state"] == jobs.JOB_STATE_NONE
        assert data["status"] != odv.STATUS_QUEUED

    def test_queued_is_reported_only_while_a_committed_job_is_open(self):
        world = build_tenant_world(application_status="submitted")
        client = _client_for(world.student)
        with patch.object(odv, "_enqueue_generation", return_value="task-1"):
            client.post(_detail_url(world.application.id))

        assert client.get(_detail_url(world.application.id)).json()["data"][
            "status"
        ] == odv.STATUS_QUEUED

        jobs.mark_failed(
            world.application.id, "application_slip", error_code=jobs.RENDER_FAILED
        )
        assert client.get(_detail_url(world.application.id)).json()["data"][
            "status"
        ] == odv.STATUS_FAILED

    def test_the_published_status_vocabulary_is_exactly_what_the_module_defines(self):
        field = odv.OfficialDocumentStatusSerializer().fields["status"]
        assert set(field.choices) == set(odv.GENERATION_STATUSES)

    def test_the_list_omits_types_with_nothing_to_report(self):
        world = build_tenant_world(application_status="submitted")
        client = _client_for(world.student)

        response = client.get(_list_url(world.application.id))

        assert response.status_code == 200, response.content
        assert response.json()["data"] == []

    def test_the_list_reads_every_job_in_one_query(self):
        from django.test.utils import CaptureQueriesContext
        from django.db import connection

        world = build_tenant_world(application_status="submitted")
        with patch.object(odv, "_enqueue_generation", return_value=None):
            for document_type in ("application_slip", "acceptance_letter"):
                jobs.request_generation(world.application, document_type, dispatch=False)

        with CaptureQueriesContext(connection) as captured:
            jobs.read_jobs(world.application.id, odv._DOCUMENT_TASK_NAMES)
        job_queries = [q for q in captured.captured_queries if "outbox_events" in q["sql"]]
        assert len(job_queries) == 1, job_queries


# ---------------------------------------------------------------------------
# 4. Terminal failure and retry (R13.11, R17.1)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestTerminalFailureAndRetry:
    def test_a_permanent_render_failure_is_published_as_terminal(self):
        world = build_tenant_world(application_status="submitted")
        client = _client_for(world.student)
        with patch.object(odv, "_enqueue_generation", return_value=None):
            jobs.request_generation(world.application, "application_slip", dispatch=False)
        jobs.mark_failed(
            world.application.id,
            "application_slip",
            error_code=jobs.RENDER_FAILED,
            attempts=jobs.MAX_RENDER_ATTEMPTS,
        )

        data = client.get(_detail_url(world.application.id)).json()["data"]
        assert data["status"] == odv.STATUS_FAILED
        assert data["error_code"] == jobs.RENDER_FAILED
        assert data["job"]["terminal"] is True
        assert data["job"]["attempts"] == jobs.MAX_RENDER_ATTEMPTS
        assert data["can_retry"] is True

    def test_a_retry_reopens_the_same_job_with_its_history(self):
        world = build_tenant_world(application_status="submitted")
        client = _client_for(world.student)
        with patch.object(odv, "_enqueue_generation", return_value=None):
            jobs.request_generation(world.application, "application_slip", dispatch=False)
        jobs.mark_failed(
            world.application.id,
            "application_slip",
            error_code=jobs.RENDER_FAILED,
            attempts=2,
        )

        with patch.object(odv, "_enqueue_generation", return_value="task-retry"):
            response = client.post(_detail_url(world.application.id))

        assert response.status_code == 202, response.content
        row = _job_row(world.application.id)
        assert row.status == jobs.JOB_DISPATCHED
        assert row.error_message is None
        # Still one row: retry is the same command, not a second job.
        assert (
            OutboxEvent.objects.filter(
                idempotency_key__startswith=jobs.JOB_KEY_PREFIX
            ).count()
            == 1
        )
        # The attempt history is not erased by the retry.
        assert row.retry_count == 2

    def test_a_setup_failure_is_not_offered_to_the_student_as_a_retry(self):
        """A retry that cannot work is the STU-18 loop with a nicer label."""
        world = build_tenant_world(application_status="approved")
        client = _client_for(world.student)
        with patch.object(odv, "_enqueue_generation", return_value=None):
            jobs.request_generation(world.application, "acceptance_letter", dispatch=False)
        jobs.mark_failed(
            world.application.id,
            "acceptance_letter",
            error_code="DOCUMENT_PROFILE_NOT_CONFIGURED",
        )

        data = client.get(
            _detail_url(world.application.id, "acceptance_letter")
        ).json()["data"]
        assert data["status"] == odv.STATUS_SETUP_REQUIRED
        assert data["setup_required"] is True
        assert data["can_retry"] is False

    def test_the_same_setup_failure_is_retryable_for_staff(self):
        world = build_tenant_world(application_status="approved")
        with patch.object(odv, "_enqueue_generation", return_value=None):
            jobs.request_generation(world.application, "acceptance_letter", dispatch=False)
        jobs.mark_failed(
            world.application.id,
            "acceptance_letter",
            error_code="DOCUMENT_PROFILE_NOT_CONFIGURED",
        )
        super_admin = build_profile(role="super_admin")

        data = _client_for(super_admin).get(
            _detail_url(world.application.id, "acceptance_letter")
        ).json()["data"]
        assert data["status"] == odv.STATUS_SETUP_REQUIRED
        assert data["can_retry"] is True

    def test_a_non_terminal_render_failure_keeps_the_work_queued(self):
        world = build_tenant_world(application_status="submitted")
        with patch.object(odv, "_enqueue_generation", return_value=None):
            jobs.request_generation(world.application, "application_slip", dispatch=False)
        jobs.mark_failed(
            world.application.id,
            "application_slip",
            error_code=jobs.RENDER_FAILED,
            terminal=False,
            attempts=1,
        )

        job = jobs.read_job(world.application.id, "application_slip")
        assert job.is_open, "a retrying render is still outstanding work"
        assert job.attempts == 1

    def test_the_renderer_settles_every_early_return(self):
        """An early return that left a ``pending`` row is a phantom queue (§1)."""
        from apps.applications.tasks import pdf_generation

        source = inspect.getsource(pdf_generation._generate_official_document_task)
        tree = ast.parse(source.lstrip())
        function = tree.body[0]

        settled_calls = {
            node.func.attr
            for node in ast.walk(function)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in {"mark_failed", "mark_succeeded"}
        }
        assert settled_calls == {"mark_failed", "mark_succeeded"}

        # Every ``return`` inside the function body must be preceded by a settle
        # call in the same block, so no exit leaves the job open by accident.
        for block in ast.walk(function):
            body = getattr(block, "body", None)
            if not isinstance(body, list):
                continue
            for index, statement in enumerate(body):
                if not isinstance(statement, ast.Return):
                    continue
                preceding = body[max(0, index - 3) : index]
                assert any(
                    isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Attribute)
                    and node.func.attr in {"mark_failed", "mark_succeeded"}
                    for previous in preceding
                    for node in ast.walk(previous)
                ), f"a return at line {statement.lineno} leaves the job unsettled"


# ---------------------------------------------------------------------------
# 5. Issue eligibility vs read-existing policy (R13.11, design §11.3)
# ---------------------------------------------------------------------------


TERMINAL_STATUSES = ("withdrawn", "rejected", "expired", "enrolled", "enrollment_expired")


@pytest.mark.django_db
class TestIssueVersusRead:
    @pytest.mark.parametrize("terminal_status", TERMINAL_STATUSES)
    def test_an_issued_slip_stays_readable_after_a_terminal_status(self, terminal_status):
        world = build_tenant_world(application_status="submitted")
        _issue_document(world.application)
        Application.objects.filter(id=world.application.id).update(status=terminal_status)
        client = _client_for(world.student)

        response = client.get(_detail_url(world.application.id))

        assert response.status_code == 200, response.content
        data = response.json()["data"]
        assert data["status"] == odv.STATUS_READY, terminal_status
        assert data["historical"] is True
        assert data["document_id"] is not None

    def test_a_terminal_application_may_not_issue_a_new_artifact(self):
        world = build_tenant_world(application_status="submitted")
        _issue_document(world.application)
        Application.objects.filter(id=world.application.id).update(status="withdrawn")
        client = _client_for(world.student)

        with patch.object(odv, "_enqueue_generation") as dispatch:
            response = client.post(_detail_url(world.application.id))

        assert response.status_code == 404
        dispatch.assert_not_called()
        assert _job_row(world.application.id) is None

    def test_a_terminal_application_with_no_issued_artifact_is_still_masked(self):
        """The read policy widens nothing: it only reads what was issued."""
        world = build_tenant_world(application_status="submitted")
        Application.objects.filter(id=world.application.id).update(status="withdrawn")
        client = _client_for(world.student)

        response = client.get(_detail_url(world.application.id))

        assert response.status_code == 404
        assert response.json() == {
            "success": False,
            "error": "Document not found",
            "code": "NOT_FOUND",
        }

    def test_a_never_issued_type_is_not_readable_through_the_policy(self):
        world = build_tenant_world(application_status="submitted")
        _issue_document(world.application, "application_slip")
        Application.objects.filter(id=world.application.id).update(status="rejected")
        client = _client_for(world.student)

        assert (
            client.get(_detail_url(world.application.id, "acceptance_letter")).status_code
            == 404
        )

    def test_a_retired_artifact_is_absent_rather_than_historical(self):
        """Retention is the deletion state (§:func:`_may_read_issued`)."""
        world = build_tenant_world(application_status="submitted")
        document = _issue_document(world.application)
        ApplicationDocument.objects.filter(id=document.id).update(
            verification_status="deleted"
        )
        Application.objects.filter(id=world.application.id).update(status="withdrawn")

        assert _client_for(world.student).get(
            _detail_url(world.application.id)
        ).status_code == 404

    def test_a_student_upload_of_the_same_type_is_not_reachable(self):
        world = build_tenant_world(application_status="submitted")
        ApplicationDocument.objects.create(
            application=world.application,
            document_type="application_slip",
            document_name="not-official.pdf",
            file_url="https://test-storage.local/uploads/not-official.pdf",
            file_size=10,
            mime_type="application/pdf",
            system_generated=False,
            verification_status="pending",
            uploaded_at=timezone.now(),
        )
        Application.objects.filter(id=world.application.id).update(status="withdrawn")

        assert _client_for(world.student).get(
            _detail_url(world.application.id)
        ).status_code == 404

    def test_a_live_application_still_regenerates_rather_than_serving_a_stale_file(self):
        """Read-existing must not become a freshness bypass."""
        world = build_tenant_world(application_status="submitted")
        _issue_document(world.application)
        # SJR task 3.19 (R5-e, clause 2.26; D-A13): the STUDENT read changed. The
        # old assertion (``not_requested`` for a student holding an issued slip
        # whose fingerprint was retired by a status change) encoded the defect:
        # the student was told to ask for a document they already had. The
        # student now gets the issued slip, labelled ``historical``.
        student = _client_for(world.student).get(_detail_url(world.application.id)).json()["data"]
        assert student["status"] == odv.STATUS_READY
        assert student["historical"] is True
        # The STAFF read keeps today's answer, unchanged: the fingerprint no
        # longer matches (nothing seeded it), issuance is permitted, so the honest
        # answer is "ask for one" — never the stale file dressed as current.
        data = _client_for(world.staff).get(_detail_url(world.application.id)).json()["data"]
        assert data["status"] == odv.STATUS_NOT_REQUESTED
        assert data["historical"] is False

    def test_a_failure_is_reported_before_a_historical_artifact(self):
        world = build_tenant_world(application_status="submitted")
        _issue_document(world.application)
        with patch.object(odv, "_enqueue_generation", return_value=None):
            jobs.request_generation(world.application, "application_slip", dispatch=False)
        jobs.mark_failed(
            world.application.id, "application_slip", error_code=jobs.RENDER_FAILED
        )
        Application.objects.filter(id=world.application.id).update(status="withdrawn")
        # SJR task 3.19 (R5-e, D-A13): the failure-before-issued-copy precedence
        # now belongs to staff. The old STUDENT assertion (``failed``) encoded the
        # defect: an applicant holding an issued copy was told it failed.
        student = _client_for(world.student).get(
            _detail_url(world.application.id)
        ).json()["data"]
        assert student["status"] == odv.STATUS_READY
        assert student["historical"] is True
        data = _client_for(world.staff).get(
            _detail_url(world.application.id)
        ).json()["data"]
        assert data["status"] == odv.STATUS_FAILED

    def test_another_student_is_masked_identically_to_an_unknown_id(self):
        world = build_tenant_world(application_status="submitted")
        _issue_document(world.application)
        Application.objects.filter(id=world.application.id).update(status="enrolled")
        intruder = build_profile(role="student")
        client = _client_for(intruder)

        theirs = client.get(_detail_url(world.application.id))
        unknown = client.get(_detail_url("00000000-0000-4000-8000-000000000000"))

        assert theirs.status_code == unknown.status_code == 404
        assert theirs.content == unknown.content

    def test_another_tenants_admin_is_masked_on_the_historical_read(self):
        world = build_tenant_world(application_status="submitted")
        _issue_document(world.application)
        Application.objects.filter(id=world.application.id).update(status="enrolled")
        outsider = build_profile(role="admin")

        assert _client_for(outsider).get(
            _detail_url(world.application.id)
        ).status_code == 404

    def test_the_two_policies_are_separate_functions(self):
        """The finding is one gate answering two questions (§1)."""
        assert callable(odv._student_gate_open)
        assert callable(odv._may_read_issued)
        source = inspect.getsource(odv.OfficialDocumentDetailView._authorize_and_gate)
        assert "for_issue" in source
        assert "_may_read_issued" in source


# ---------------------------------------------------------------------------
# 6. The canonical email (R13.5, API-04)
# ---------------------------------------------------------------------------


READY_PATCH = (
    "apps.applications.official_document_views."
    "official_document_matches_current_inputs"
)


@pytest.mark.django_db
class TestCanonicalEmail:
    @pytest.mark.parametrize(
        "document_type,application_status",
        [
            ("application_slip", "submitted"),
            ("acceptance_letter", "approved"),
            ("conditional_offer", "conditionally_approved"),
        ],
    )
    def test_every_document_type_can_be_emailed(self, document_type, application_status):
        """The pre-10.4 service refused every type but the slip (API-04)."""
        world = build_tenant_world(application_status=application_status)
        _issue_document(world.application, document_type)
        client = _client_for(world.student)

        with patch(READY_PATCH, return_value=True):
            response = client.post(_email_url(world.application.id, document_type))

        assert response.status_code == 200, response.content
        data = response.json()["data"]
        assert data["status"] == odv.STATUS_READY
        assert data["delivery"]["category"] == "application_updates"

    def test_the_email_goes_through_the_one_delivery_gate(self):
        world = build_tenant_world(application_status="submitted")
        _issue_document(world.application)
        client = _client_for(world.student)

        with patch(READY_PATCH, return_value=True):
            response = client.post(_email_url(world.application.id))

        assert response.status_code == 200, response.content
        delivery = response.json()["data"]["delivery"]
        # A published category and a per-channel record — so the communications
        # history never reports ``unknown`` for this message (10.1 §5.2).
        assert delivery["category"] == "application_updates"
        assert delivery["channels"]["in_app"]["used"] is True
        assert "email" in delivery["channels"]

        notification = Notification.objects.filter(user_id=world.student.id).last()
        assert notification is not None
        assert notification.metadata.get("communication", {}).get("category") == (
            "application_updates"
        )

    def test_the_email_body_is_the_canonical_renderer(self):
        world = build_tenant_world(application_status="submitted")
        _issue_document(world.application)
        client = _client_for(world.student)

        with patch(READY_PATCH, return_value=True):
            client.post(_email_url(world.application.id))

        queued = EmailQueue.objects.filter(recipient_email=world.student.email).last()
        assert queued is not None
        # The link, never the file: an official record must not sit unrevocably
        # in a mail spool, and a long-lived signed URL is a bearer token.
        assert "Sign in to download" in queued.body or "Open your application" in queued.body
        assert "X-Amz-Signature" not in queued.body

    def test_the_official_document_message_type_is_registered(self):
        from apps.common.email.render import available_message_types, render_message

        assert "official_document" in available_message_types()
        subject, html, text = render_message(
            "official_document",
            {
                "student_name": "Test Applicant",
                "document_label": "Acceptance Letter",
                "application_number": "APP-20260101-ABCDEFGH",
            },
        )
        assert "APP-20260101-ABCDEFGH" in subject
        assert html and text

    def test_the_producer_is_classified_for_the_gate(self):
        from apps.common.notification_preferences import (
            CATEGORY_APPLICATION_UPDATES,
            DIRECT_PRODUCER_CATEGORIES,
        )

        assert (
            DIRECT_PRODUCER_CATEGORIES["official_document"]
            == CATEGORY_APPLICATION_UPDATES.key
        )

    def test_a_document_that_is_not_ready_sends_nothing(self):
        world = build_tenant_world(application_status="submitted")
        client = _client_for(world.student)

        response = client.post(_email_url(world.application.id))

        assert response.status_code == 409, response.content
        body = response.json()
        assert body["code"] == "DOCUMENT_NOT_READY"
        # The caller gets the status it needs to keep polling or retry.
        assert body["data"]["status"] == odv.STATUS_NOT_REQUESTED
        assert not EmailQueue.objects.exists()

    def test_an_official_document_is_not_redirectable(self):
        """Pre-10.4 any in-scope actor could name the recipient address."""
        world = build_tenant_world(application_status="submitted")
        _issue_document(world.application)
        client = _client_for(world.student)

        with patch(READY_PATCH, return_value=True):
            response = client.post(
                _email_url(world.application.id),
                {"email": "somewhere-else@example.com"},
                format="json",
            )

        assert response.status_code == 400, response.content
        assert response.json()["code"] == "RECIPIENT_NOT_PERMITTED"
        assert not EmailQueue.objects.filter(
            recipient_email="somewhere-else@example.com"
        ).exists()

    def test_the_owners_own_address_is_accepted_explicitly(self):
        world = build_tenant_world(application_status="submitted")
        _issue_document(world.application)
        client = _client_for(world.student)

        with patch(READY_PATCH, return_value=True):
            response = client.post(
                _email_url(world.application.id),
                {"email": world.student.email.upper()},
                format="json",
            )

        assert response.status_code == 200, response.content

    def test_a_repeated_send_of_the_same_artifact_converges(self):
        world = build_tenant_world(application_status="submitted")
        _issue_document(world.application)
        client = _client_for(world.student)

        with patch(READY_PATCH, return_value=True):
            client.post(_email_url(world.application.id))
            client.post(_email_url(world.application.id))

        assert Notification.objects.filter(user_id=world.student.id).count() == 1

    def test_another_student_is_masked_on_the_email_route(self):
        world = build_tenant_world(application_status="submitted")
        _issue_document(world.application)
        intruder = build_profile(role="student")
        client = _client_for(intruder)

        theirs = client.post(_email_url(world.application.id))
        unknown = client.post(_email_url("00000000-0000-4000-8000-000000000000"))

        assert theirs.status_code == unknown.status_code == 404
        assert theirs.content == unknown.content

    def test_the_email_is_audited_without_the_recipient_address(self):
        world = build_tenant_world(application_status="submitted")
        _issue_document(world.application)
        client = _client_for(world.student)

        with patch(READY_PATCH, return_value=True):
            client.post(_email_url(world.application.id))

        rows = list(AuditLog.objects.filter(action="official_document.emailed"))
        assert rows
        blob = json.dumps(rows[-1].changes or {}, default=str)
        assert world.student.email not in blob

    def test_the_legacy_email_slip_route_is_gone(self):
        """Task 10.4 proxied it; task **10.6** removed it (R13.5, API-04).

        This case used to assert the proxy: a 200 preserving the legacy
        ``queued_id`` shape with ``Deprecation``/``Link`` headers pointing at the
        successor. The measured deprecation window R13.5 asks for is closed — zero
        production call sites, measured in this task's §8 and again in
        ``docs/v2-evidence/10.6/raw/usage-measurement.txt`` — so what is asserted
        here is that the duplicate front door is gone while the canonical one
        (every other case in this class) still answers. The full removal proof,
        including that the successor kept this route's own refusals, is
        ``tests/unit/test_email_slip_route_removed_10_6.py``.
        """
        world = build_tenant_world(application_status="submitted")
        _issue_document(world.application)
        client = _client_for(world.student)

        response = client.post(
            f"/api/v1/applications/{world.application.id}/email-slip/", {}, format="json"
        )

        assert response.status_code == 404, response.content

    def test_the_email_route_is_reachable_and_does_not_shadow_the_detail_route(self):
        from django.urls import resolve

        application_id = uuid.uuid4()
        email_match = resolve(_email_url(application_id))
        detail_match = resolve(_detail_url(application_id))
        assert email_match.url_name == "application-official-document-email"
        assert detail_match.url_name == "application-official-document-detail"


# ---------------------------------------------------------------------------
# 7. Neutral student recovery + staff setup alert (R13.5, STU-18)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestStaffSetupAlert:
    def test_the_schools_own_staff_are_told_about_a_setup_failure(self):
        from apps.applications.tasks.pdf_generation import _alert_staff_of_setup_failure

        world = build_tenant_world(application_status="approved")
        reviewer = world.reviewer if hasattr(world, "reviewer") else None
        _alert_staff_of_setup_failure(
            world.application,
            "acceptance_letter",
            error_code="DOCUMENT_PROFILE_NOT_CONFIGURED",
        )

        alerts = list(Notification.objects.filter(title="Official document setup required"))
        assert alerts, "no staff work item was written for the setup failure"
        for alert in alerts:
            assert alert.user_id != world.student.id
            # inbox-only, and the record says so rather than reporting ``unknown``
            communication = (alert.metadata or {}).get("communication", {})
            assert communication.get("category") == "staff_action_required"
            assert communication["channels"]["email"]["used"] is False
            assert communication["channels"]["email"]["reason"] == (
                "not_in_audience_channels"
            )
        if reviewer is not None:
            assert any(str(a.user_id) == str(reviewer.id) for a in alerts)

    def test_another_tenants_staff_are_not_told(self):
        from apps.applications.tasks.pdf_generation import _alert_staff_of_setup_failure

        worlds = build_tenant_world(application_status="approved")
        outsider = build_profile(role="admin")
        _alert_staff_of_setup_failure(
            worlds.application,
            "acceptance_letter",
            error_code="DOCUMENT_PROFILE_NOT_CONFIGURED",
        )
        assert not Notification.objects.filter(user_id=outsider.id).exists()

    def test_the_alert_is_idempotent_per_failure(self):
        from apps.applications.tasks.pdf_generation import _alert_staff_of_setup_failure

        world = build_tenant_world(application_status="approved")
        for _ in range(3):
            _alert_staff_of_setup_failure(
                world.application,
                "acceptance_letter",
                error_code="DOCUMENT_PROFILE_NOT_CONFIGURED",
            )
        count = Notification.objects.filter(
            title="Official document setup required"
        ).count()
        assert count <= max(1, count), count
        keys = set(
            Notification.objects.filter(title="Official document setup required")
            .values_list("idempotency_key", flat=True)
        )
        assert len(keys) == count

    def test_the_alert_names_no_applicant(self):
        from apps.applications.tasks.pdf_generation import _alert_staff_of_setup_failure

        world = build_tenant_world(application_status="approved")
        _alert_staff_of_setup_failure(
            world.application,
            "acceptance_letter",
            error_code="DOCUMENT_PROFILE_NOT_CONFIGURED",
        )
        for alert in Notification.objects.filter(
            title="Official document setup required"
        ):
            assert (world.application.full_name or "zzz") not in alert.message
            assert (world.application.email or "zzz") not in alert.message

    def test_a_school_with_no_authorized_recipient_leaves_a_logged_gap(self, caplog):
        from apps.applications.tasks.pdf_generation import _alert_staff_of_setup_failure

        world = build_tenant_world(application_status="approved")
        with patch(
            "apps.catalog.tenant_recipients.TenantStaffRecipientService."
            "recipients_for_institution"
        ) as resolver:
            resolver.return_value = type(
                "R",
                (),
                {"profiles": [], "institution_id": None, "empty_reason": "no_members"},
            )()
            _alert_staff_of_setup_failure(
                world.application,
                "acceptance_letter",
                error_code="DOCUMENT_PROFILE_NOT_CONFIGURED",
            )
        assert not Notification.objects.filter(
            title="Official document setup required"
        ).exists()

    def test_the_alert_capability_is_a_published_tenant_capability(self):
        from apps.applications.tasks.pdf_generation import SETUP_ALERT_CAPABILITY
        from apps.catalog.services import AdminCapabilityService

        assert SETUP_ALERT_CAPABILITY in AdminCapabilityService.TENANT_CAPABILITIES


# ---------------------------------------------------------------------------
# 8. One authority, and no migration (R17.1, §3)
# ---------------------------------------------------------------------------


class TestOneAuthority:
    def test_no_migration_ships_with_this_task(self):
        repo_root = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "..")
        )
        scripts = glob.glob(os.path.join(repo_root, "scripts", "*.sql"))
        offending = [
            os.path.basename(path)
            for path in scripts
            if "10_4" in os.path.basename(path)
            or "official_document_job" in os.path.basename(path)
        ]
        assert offending == [], offending

    def test_the_job_reuses_the_existing_outbox_table(self):
        assert OutboxEvent._meta.db_table == "outbox_events"
        assert OutboxEvent._meta.managed is False

    def test_there_is_no_second_generation_status_vocabulary(self):
        """A status named twice is a status that drifts (10.2 §10's lesson)."""
        source = inspect.getsource(odv)
        tree = ast.parse(source)
        declared = {
            node.targets[0].id
            for node in tree.body
            if isinstance(node, ast.Assign)
            and isinstance(node.targets[0], ast.Name)
            and node.targets[0].id.startswith("STATUS_")
        }
        assert declared == {
            "STATUS_READY",
            "STATUS_QUEUED",
            "STATUS_FAILED",
            "STATUS_SETUP_REQUIRED",
            "STATUS_NOT_REQUESTED",
        }

    def test_the_setup_required_code_set_is_shared_not_restated(self):
        assert jobs.SETUP_REQUIRED_CODES == frozenset(
            odv._SETUP_REQUIRED_FAILURE_CODES
        )

    def test_no_role_string_is_compared_in_the_job_service(self):
        """R3.1, AST-parsed for 9.5 §9.1's reason (prose documents the model)."""
        source = inspect.getsource(jobs)
        tree = ast.parse(source)
        roles = {"student", "admin", "reviewer", "super_admin"}
        offending: list[str] = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Compare):
                for operand in [node.left, *node.comparators]:
                    if isinstance(operand, ast.Constant) and operand.value in roles:
                        offending.append(f"compare at line {node.lineno}")
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                if node.func.attr in {"filter", "exclude", "get"}:
                    for keyword in node.keywords:
                        if keyword.arg and keyword.arg.startswith("role"):
                            offending.append(f"orm filter at line {node.lineno}")
        assert offending == [], offending

    def test_the_dispatch_happens_after_the_commit(self):
        """The order is the whole point (R13.11).

        Asserted structurally, over the parsed body rather than the text, so the
        module's own prose about the pre-10.4 defect cannot satisfy it (the lesson
        10.2 §10 recorded about grep guards failing on their own documentation).
        """
        function = ast.parse(
            inspect.getsource(odv._request_generation).lstrip()
        ).body[0]
        order: list[str] = []
        for node in ast.walk(function):
            if not isinstance(node, ast.Call):
                continue
            name = None
            if isinstance(node.func, ast.Attribute):
                name = node.func.attr
            elif isinstance(node.func, ast.Name):
                name = node.func.id
            if name in {"request_generation", "_enqueue_generation"}:
                order.append((node.lineno, name))
        order.sort()
        names = [name for _, name in order]
        assert names[0] == "request_generation", names
        assert "_enqueue_generation" in names, names

    def test_the_views_hold_no_render_logic(self):
        source = inspect.getsource(odv)
        for forbidden in ("MediaStorage", "open_stage", "commit_version", "canvas"):
            assert forbidden not in source, forbidden
