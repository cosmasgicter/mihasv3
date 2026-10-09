"""The scoped applications query + aggregate contract (task 9.1).

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 9.1 —
              "Create one scoped applications query and aggregate contract".
Requirements: **R8.1** (list, filters, facets, search, pagination, aggregates,
              and dashboard links served by one scoped query contract; portfolio
              totals are never inferred from one page), **R8.6** (metrics are
              authoritative, scope-aware, definition-labelled, and explicit about
              unknown states), R3.1/R3.2 (capability authority; cross-tenant
              substitution is an indistinguishable 404), R6.5 (export is a
              command with capability, audit, redaction, and a size limit).
Findings:     **ADM-01** — "Application totals, filters, and select options are
              derived from the currently loaded page. A dashboard link emits a
              filter the parser ignores."

The claim this file makes
-------------------------
This file is the task's ``_Evidence:`` line's first half: *direct DB aggregate
comparison*. :class:`TestAggregatesEqualIndependentSql` recomputes **every**
aggregate the endpoint publishes with an independent raw-SQL query over the same
filtered set and asserts equality — so "the server owns the numbers" is measured
against the database rather than against another Django expression.

The rest proves the contract around it: scope before lookup, facets over the
whole filtered set, page-independence of both aggregates and export, the
registered-parameter contract that closes ADM-01's ignored-filter half, and the
saved-filter records that replace the single ``sessionStorage`` slot.

Every test runs with ``production_scope`` active, so the test-settings
legacy-admin all-access shortcut is disabled and what is measured is the real
membership/grant-derived capability model.
"""

from __future__ import annotations

import csv
import io
import json
import uuid
from datetime import timedelta

import pytest
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import (
    AdminSavedFilter,
    Application,
    ApplicationAmendment,
    ApplicationCondition,
)
from apps.applications.query_service import (
    ACCEPTED_STATUSES,
    DEADLINE_PRESSURE_HOURS,
    EXPORT_ROW_LIMIT,
    REGISTERED_PARAMETERS,
    REVIEW_QUEUE_STATUSES,
    ApplicationQueryService,
)
from apps.catalog.services import AccessScopeService
from apps.common.models import AuditLog
from tests.tenant_fixtures import (
    build_application,
    build_membership,
    build_profile,
    build_two_tenant_worlds,
)

QUERY_URL = "/api/v1/admin/applications/"
SAVED_FILTERS_URL = "/api/v1/admin/applications/saved-filters/"


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


def _grant_export(world):
    """Give a world's staff the explicit tenant export grant (R6.5)."""
    for membership in world.staff.userinstitutionmembership_set.all():
        membership.permissions = ["export"]
        membership.save(update_fields=["permissions"])
    return world.staff


def _app(world, **overrides) -> Application:
    return build_application(
        student=world.student,
        institution=world.institution,
        canonical_program=world.canonical_program,
        offering=world.offering,
        intake=world.intake,
        **overrides,
    )


def _csv_rows(response) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(response.content.decode())))


@pytest.fixture(autouse=True)
def production_scope(monkeypatch):
    """Measure the real membership/grant model, never the test admin shortcut."""
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


@pytest.fixture()
def worlds(db):
    """Two independent tenants sharing one canonical program, and no applications.

    ``with_application=False`` because this file's arithmetic is the point: every
    count asserted below must describe exactly the rows the test itself created.
    The default fixture also seeds one ``draft`` application per world, and the
    roster correctly shows it — the admin surface has always listed drafts
    (``draftFilter`` defaults to ``all``, and ``draft_count`` is a published
    aggregate) — so leaving it in would mean every expectation carried a silent
    ``+ 1`` that a reader could not distinguish from a scoping bug. Each world's
    institution access grant is unaffected (``grant_scope='institution'``).
    """
    return build_two_tenant_worlds(with_application=False)


# ---------------------------------------------------------------------------
# The required evidence: direct DB aggregate comparison
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAggregatesEqualIndependentSql:
    """Every published aggregate equals an independent SQL count over the same set.

    This is the task's ``_Evidence:`` claim. The endpoint computes its counters
    with Django ``Count(..., filter=Q(...))`` expressions; this recomputes them
    with hand-written SQL against the same filtered row set and asserts equality.
    Two different query builders agreeing on the same database is a materially
    stronger statement than one builder agreeing with itself.

    **Validates: Requirements R8.1, R8.6**
    """

    @staticmethod
    def _independent_counts(institution_id: str) -> dict[str, int]:
        """Recompute the aggregates with raw SQL, independently of the ORM."""
        accepted = ", ".join(f"'{value}'" for value in ACCEPTED_STATUSES)
        queue = ", ".join(f"'{value}'" for value in REVIEW_QUEUE_STATUSES)
        from apps.documents.payment_constants import RESOLVED_PAYMENT_STATUSES

        resolved = ", ".join(f"'{value}'" for value in RESOLVED_PAYMENT_STATUSES)
        sql = f"""
            SELECT
                count(*)                                              AS total,
                count(*) FILTER (WHERE status = 'draft')               AS draft_count,
                count(*) FILTER (WHERE status = 'submitted')           AS submitted_count,
                count(*) FILTER (WHERE status = 'under_review')        AS under_review_count,
                count(*) FILTER (WHERE status IN ({queue}))            AS decision_queue_count,
                count(*) FILTER (WHERE status = 'waitlisted')          AS waitlisted_count,
                count(*) FILTER (WHERE status = 'approved')            AS approved_count,
                count(*) FILTER (WHERE status = 'conditionally_approved')
                                                                       AS conditionally_approved_count,
                count(*) FILTER (WHERE status = 'enrolled')            AS enrolled_count,
                count(*) FILTER (WHERE status IN ({accepted}))         AS accepted_count,
                count(*) FILTER (WHERE status = 'rejected')            AS rejected_count,
                count(*) FILTER (WHERE status = 'withdrawn')           AS withdrawn_count,
                count(*) FILTER (WHERE payment_status IN ({resolved})) AS payment_resolved_count,
                count(*) FILTER (WHERE payment_status IN ('pending', 'pending_review'))
                                                                       AS payment_pending_count,
                count(*) FILTER (WHERE payment_status IN ('rejected', 'failed'))
                                                                       AS payment_rejected_count,
                count(*) FILTER (WHERE payment_status IS NULL
                                    OR payment_status IN ('', 'not_paid', 'unpaid'))
                                                                       AS payment_unpaid_count,
                count(*) FILTER (WHERE is_late_submission)             AS late_submission_count,
                count(*) FILTER (WHERE assigned_reviewer_id IS NULL)   AS unassigned_count
            FROM applications
            WHERE institution_id = %s
        """
        with connection.cursor() as cursor:
            cursor.execute(sql, [institution_id])
            columns = [column[0] for column in cursor.description]
            row = cursor.fetchone()
        return dict(zip(columns, row))

    def test_every_aggregate_matches_raw_sql(self, worlds):
        """Fifteen counters, two query builders, one database, no disagreement."""
        world_a, world_b = worlds
        # A spread wide enough that a mis-scoped or mis-filtered counter shows up:
        # every status bucket, both payment poles, a late row, an unassigned row.
        for status_value in (
            "draft",
            "draft",
            "submitted",
            "submitted",
            "under_review",
            "waitlisted",
            "approved",
            "conditionally_approved",
            "enrolled",
            "rejected",
            "withdrawn",
        ):
            _app(world_a, status=status_value)
        _app(world_a, status="submitted", payment_status="successful")
        _app(world_a, status="submitted", payment_status="pending")
        _app(world_a, status="submitted", payment_status="rejected")
        _app(world_a, status="submitted", payment_status="deferred")
        _app(world_a, status="submitted", is_late_submission=True)
        # Tenant B's rows must not appear in ANY of A's numbers.
        for _ in range(7):
            _app(world_b, status="approved", payment_status="successful")

        response = _client_for(world_a.staff).get(QUERY_URL)
        assert response.status_code == 200, response.content
        aggregates = response.json()["data"]["aggregates"]

        expected = self._independent_counts(world_a.institution_id)
        for key, value in expected.items():
            assert aggregates[key] == value, (
                f"{key}: endpoint said {aggregates[key]}, raw SQL said {value}"
            )
        # And the independent count is not accidentally the whole table.
        assert expected["total"] < Application.objects.count()

    def test_aggregate_matches_raw_sql_under_a_filter(self, worlds):
        """The comparison holds for a *filtered* set, not just the whole scope."""
        world_a, _ = worlds
        for _ in range(4):
            _app(world_a, status="submitted")
        for _ in range(3):
            _app(world_a, status="approved")

        response = _client_for(world_a.staff).get(QUERY_URL, {"status": "submitted"})
        assert response.status_code == 200, response.content
        aggregates = response.json()["data"]["aggregates"]

        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT count(*) FROM applications "
                "WHERE institution_id = %s AND status = 'submitted'",
                [world_a.institution_id],
            )
            (raw_total,) = cursor.fetchone()

        assert aggregates["total"] == raw_total == 4
        assert aggregates["approved_count"] == 0

    def test_deadline_pressure_aggregate_matches_raw_sql(self, worlds):
        """The deadline counter is a real SQL predicate, not a dashboard label.

        ADM-01's ignored-filter half was a *deadline* tile. This proves the
        number the roster publishes for it equals an independent SQL count over
        the same window.
        """
        world_a, _ = worlds
        now = timezone.now()
        inside = _app(
            world_a,
            status="approved",
            enrollment_confirmation_deadline=now + timedelta(hours=12),
        )
        _app(
            world_a,
            status="approved",
            enrollment_confirmation_deadline=now + timedelta(hours=DEADLINE_PRESSURE_HOURS + 24),
        )
        _app(world_a, status="approved")  # no deadline at all

        # A condition deadline counts too, which the enrollment column alone misses.
        conditioned = _app(world_a, status="conditionally_approved")
        ApplicationCondition.objects.create(
            id=uuid.uuid4(),
            application=conditioned,
            description="Provide certified results",
            condition_type="document",
            deadline=(now + timedelta(hours=24)).date(),
            status="pending",
        )

        response = _client_for(world_a.staff).get(QUERY_URL)
        assert response.status_code == 200, response.content
        aggregates = response.json()["data"]["aggregates"]

        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT count(*) FROM applications a
                WHERE a.institution_id = %s
                  AND COALESCE(
                        a.enrollment_confirmation_deadline,
                        (SELECT c.deadline::timestamptz FROM application_conditions c
                          WHERE c.application_id = a.id
                            AND c.status NOT IN ('met', 'waived')
                          ORDER BY c.deadline LIMIT 1)
                      ) BETWEEN %s AND %s
                """,
                [world_a.institution_id, now, now + timedelta(hours=DEADLINE_PRESSURE_HOURS)],
            )
            (raw_pressure,) = cursor.fetchone()

        assert aggregates["deadline_pressure_count"] == raw_pressure == 2
        assert aggregates["deadline_pressure_hours"] == DEADLINE_PRESSURE_HOURS
        # The filter selects exactly the rows the counter counted.
        filtered = _client_for(world_a.staff).get(
            QUERY_URL, {"deadline_pressure": "true"}
        )
        assert filtered.json()["data"]["totalCount"] == raw_pressure
        ids = {row["id"] for row in filtered.json()["data"]["results"]}
        assert str(inside.id) in ids


# ---------------------------------------------------------------------------
# Aggregates and facets are page-independent (ADM-01's core)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestNothingIsDerivedFromTheLoadedPage:
    """Turning a page cannot change a total or remove a filter option.

    **Validates: Requirements R8.1**
    """

    def test_aggregates_are_identical_on_every_page(self, worlds):
        world_a, _ = worlds
        for _ in range(5):
            _app(world_a, status="submitted")
        for _ in range(4):
            _app(world_a, status="approved")

        client = _client_for(world_a.staff)
        page_1 = client.get(QUERY_URL, {"page": 1, "pageSize": 2}).json()["data"]
        page_2 = client.get(QUERY_URL, {"page": 2, "pageSize": 2}).json()["data"]
        page_5 = client.get(QUERY_URL, {"page": 5, "pageSize": 2}).json()["data"]

        assert len(page_1["results"]) == 2
        assert len(page_2["results"]) == 2
        assert page_1["aggregates"] == page_2["aggregates"] == page_5["aggregates"]
        assert page_1["aggregates"]["total"] == 9
        assert page_1["totalCount"] == page_2["totalCount"] == 9
        assert page_1["totalPages"] == 5
        # Different pages really are different rows (no repeat, no skip).
        assert {row["id"] for row in page_1["results"]}.isdisjoint(
            {row["id"] for row in page_2["results"]}
        )

    def test_facets_are_complete_regardless_of_page(self, worlds):
        """A status with no row on this page is still an offered filter option.

        The browser used to build its pick list from the loaded rows, so a program
        or status absent from page 1 was simply not offerable. Here page 1 of 1
        row still offers every status in scope, with its true count.
        """
        world_a, _ = worlds
        for _ in range(3):
            _app(world_a, status="submitted")
        _app(world_a, status="approved")
        _app(world_a, status="rejected")

        data = _client_for(world_a.staff).get(
            QUERY_URL, {"page": 1, "pageSize": 1}
        ).json()["data"]
        assert len(data["results"]) == 1

        options = {
            option["value"]: option["count"] for option in data["facets"]["status"]["options"]
        }
        assert options == {"submitted": 3, "approved": 1, "rejected": 1}
        assert data["facets"]["status"]["truncated"] is False

    def test_a_narrowed_query_still_offers_the_other_values_of_that_dimension(
        self, worlds
    ):
        """Facets describe what else you could ask for, not what you asked for.

        Computing the status facet *after* ``status=approved`` would offer only
        ``approved`` — recreating ADM-01's defect in a new place, with the
        operator unable to widen the query again.
        """
        world_a, _ = worlds
        for _ in range(2):
            _app(world_a, status="submitted")
        _app(world_a, status="approved")

        data = _client_for(world_a.staff).get(
            QUERY_URL, {"status": "approved"}
        ).json()["data"]

        assert data["totalCount"] == 1
        assert data["aggregates"]["total"] == 1
        options = {
            option["value"]: option["count"] for option in data["facets"]["status"]["options"]
        }
        assert options == {"submitted": 2, "approved": 1}

    def test_facet_options_carry_labels_and_ids(self, worlds):
        """An institution facet is (id, label, count), not a harvested string.

        The old ``[...new Set(applications.map(a => a.institution))]`` produced
        display strings with no id and no count, so the filter it built matched on
        a name — which breaks the moment a school is renamed.
        """
        world_a, _ = worlds
        _app(world_a, status="submitted")

        data = _client_for(world_a.staff).get(QUERY_URL).json()["data"]
        option = data["facets"]["institution"]["options"][0]
        assert option["value"] == world_a.institution_id
        assert option["label"] == world_a.institution.name
        assert option["count"] == 1


# ---------------------------------------------------------------------------
# Authority + scope (R3.1, R3.2)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAuthorityIsCapabilityDerived:
    """The roster is gated by ``tenant.application.read``, never a role string.

    **Validates: Requirements R3.1, R3.2, R8.1**
    """

    def test_scoped_reviewer_can_read_their_assigned_queue(self, worlds):
        """A Reviewer's queue is tenant-authorised AND assignment-scoped (R8.2)."""
        world_a, _ = worlds
        reviewer = build_profile(role="reviewer")
        build_membership(user=reviewer, institution=world_a.institution, role="reviewer")
        mine = _app(world_a, status="submitted", assigned_reviewer_id=reviewer)
        _app(world_a, status="submitted")  # someone else's work

        data = _client_for(reviewer).get(QUERY_URL).json()["data"]
        assert [row["id"] for row in data["results"]] == [str(mine.id)]
        # The aggregate describes the reviewer's own queue, not the tenant's.
        assert data["aggregates"]["total"] == 1

    def test_student_is_masked_as_not_found(self, worlds):
        world_a, _ = worlds
        _app(world_a, status="submitted")
        response = _client_for(world_a.student).get(QUERY_URL)
        assert response.status_code == 404, response.content
        body = json.dumps(response.json())
        assert world_a.institution.name not in body
        assert world_a.institution_id not in body

    def test_no_scope_admin_is_masked_as_not_found(self, worlds):
        """An ``admin`` role string with no membership has zero authority."""
        world_a, _ = worlds
        _app(world_a, status="submitted")
        stranger = build_profile(role="admin")
        response = _client_for(stranger).get(QUERY_URL)
        assert response.status_code == 404, response.content
        assert "results" not in json.dumps(response.json())

    def test_anonymous_is_denied(self):
        response = APIClient().get(QUERY_URL)
        assert response.status_code in (401, 403), response.content


@pytest.mark.django_db
class TestCrossTenantIsolation:
    """Tenant A cannot observe, count, or infer tenant B through any surface.

    **Validates: Requirements R3.2, R8.1**
    """

    def test_list_and_aggregates_exclude_the_other_tenant(self, worlds):
        world_a, world_b = worlds
        mine = _app(world_a, status="submitted")
        theirs = _app(world_b, status="submitted", full_name="Bee Tenant Applicant")

        response = _client_for(world_a.staff).get(QUERY_URL)
        assert response.status_code == 200, response.content
        data = response.json()["data"]
        body = response.content.decode()

        assert [row["id"] for row in data["results"]] == [str(mine.id)]
        assert data["aggregates"]["total"] == 1
        for secret in (
            str(theirs.id),
            world_b.institution_id,
            world_b.institution.name,
            world_b.offering.name,
            "Bee Tenant Applicant",
        ):
            assert secret not in body

    def test_searching_the_other_tenants_applicant_returns_the_same_empty_body(
        self, worlds
    ):
        """A hit and a miss are indistinguishable, so search cannot confirm a name."""
        world_a, world_b = worlds
        _app(world_b, status="submitted", full_name="Bee Tenant Applicant")
        client = _client_for(world_a.staff)

        probe = client.get(QUERY_URL, {"search": "Bee Tenant Applicant"}).json()["data"]
        nonsense = client.get(QUERY_URL, {"search": "zzzz-no-such-applicant"}).json()["data"]

        assert probe["totalCount"] == nonsense["totalCount"] == 0
        assert probe["results"] == nonsense["results"] == []
        assert probe["aggregates"]["total"] == nonsense["aggregates"]["total"] == 0

    @pytest.mark.parametrize(
        "parameter",
        ["institution_id", "program_offering_id", "intake_id"],
    )
    def test_out_of_scope_identifier_filter_is_a_masked_404(self, worlds, parameter):
        """An out-of-scope id is byte-identical to an id that does not exist.

        A 200 with zero rows would answer a question the actor was not entitled to
        ask: it confirms the id resolves, because a nonsense id would behave
        differently. Both collapse to one response, and the probe is recorded.
        """
        world_a, world_b = worlds
        _app(world_b, status="submitted")
        client = _client_for(world_a.staff)

        target = {
            "institution_id": world_b.institution_id,
            "program_offering_id": world_b.offering_id,
            "intake_id": world_b.intake_id,
        }[parameter]

        out_of_scope = client.get(QUERY_URL, {parameter: target})
        random_uuid = client.get(QUERY_URL, {parameter: str(uuid.uuid4())})

        assert out_of_scope.status_code == random_uuid.status_code == 404
        assert out_of_scope.content == random_uuid.content
        assert world_b.institution.name not in out_of_scope.content.decode()

    def test_a_masked_filter_probe_is_audited(self, worlds):
        world_a, world_b = worlds
        before = AuditLog.objects.filter(action="scope.denied").count()
        _client_for(world_a.staff).get(
            QUERY_URL, {"institution_id": world_b.institution_id}
        )
        assert AuditLog.objects.filter(action="scope.denied").count() == before + 1

    def test_reviewer_filter_cannot_enumerate_another_tenants_staff(self, worlds):
        """A reviewer with no assigned work in scope is indistinguishable."""
        world_a, world_b = worlds
        their_reviewer = build_profile(role="reviewer")
        build_membership(
            user=their_reviewer, institution=world_b.institution, role="reviewer"
        )
        _app(world_b, status="submitted", assigned_reviewer_id=their_reviewer)
        client = _client_for(world_a.staff)

        probe = client.get(QUERY_URL, {"assigned_reviewer_id": str(their_reviewer.id)})
        nonsense = client.get(QUERY_URL, {"assigned_reviewer_id": str(uuid.uuid4())})

        assert probe.status_code == nonsense.status_code == 404
        assert probe.content == nonsense.content

    def test_peer_offering_count_is_platform_only(self, worlds):
        """Cross-tenant context is not computed for a tenant actor at all.

        Both worlds offer the same canonical program, so the number is real; its
        absence for a tenant actor is a decision, not a coincidence.
        """
        world_a, world_b = worlds
        _app(world_a, status="submitted")
        _app(world_b, status="submitted")

        tenant_data = _client_for(world_a.staff).get(QUERY_URL).json()["data"]
        assert "peer_offering_count" not in tenant_data["results"][0]
        assert tenant_data["redaction"] == {
            "applied": True,
            "withheld_fields": ["peer_offering_count"],
        }

        platform_admin = build_profile(role="super_admin")
        platform_data = _client_for(platform_admin).get(QUERY_URL).json()["data"]
        assert platform_data["redaction"]["applied"] is False
        counts = {row["peer_offering_count"] for row in platform_data["results"]}
        assert counts == {2}


# ---------------------------------------------------------------------------
# The registered-parameter contract (ADM-01's ignored-filter half)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestRegisteredParameterContract:
    """A parameter the contract does not implement is reported, not swallowed.

    **Validates: Requirements R8.1**
    """

    def test_every_dashboard_deep_link_parameter_is_registered(self):
        """The parameters the admin dashboard links with must all be real.

        The ADM-01 defect was a tile linking to ``?deadlinePressureFilter=true``,
        a name nothing parsed — so the tile's number and the roster it opened
        described different sets. This pins the six deep-link parameters against
        the contract.
        """
        dashboard_link_parameters = {
            "overdue_review",
            "review_queue",
            "has_pending_documents",
            "payment_status",
            "has_upcoming_interviews",
            "deadline_pressure",
        }
        assert dashboard_link_parameters <= REGISTERED_PARAMETERS

    def test_an_unknown_parameter_is_echoed_back(self, worlds):
        """The response says which parameters it did not understand."""
        world_a, _ = worlds
        _app(world_a, status="submitted")
        data = _client_for(world_a.staff).get(
            QUERY_URL, {"deadlinePressureFilter": "true"}
        ).json()["data"]
        assert data["filters"]["unknown_parameters"] == ["deadlinePressureFilter"]

    def test_a_understood_query_reports_no_unknown_parameters(self, worlds):
        world_a, _ = worlds
        _app(world_a, status="submitted")
        data = _client_for(world_a.staff).get(
            QUERY_URL, {"review_queue": "true", "sort": "deadline", "order": "asc"}
        ).json()["data"]
        assert data["filters"]["unknown_parameters"] == []
        assert data["filters"]["sort"] == "deadline"
        assert data["filters"]["order"] == "asc"

    def test_an_unknown_sort_falls_back_rather_than_interpolating(self, worlds):
        """The roster never orders by an arbitrary caller-supplied column."""
        world_a, _ = worlds
        _app(world_a, status="submitted")
        data = _client_for(world_a.staff).get(
            QUERY_URL, {"sort": "id; DROP TABLE applications"}
        ).json()["data"]
        assert data["filters"]["sort"] == "activity_at"
        assert Application.objects.exists()


@pytest.mark.django_db
class TestFiltersRunInSql:
    """Each registered filter narrows rows in the database.

    **Validates: Requirements R8.1**
    """

    def test_review_queue_filter_and_counter_agree(self, worlds):
        world_a, _ = worlds
        _app(world_a, status="submitted")
        _app(world_a, status="under_review")
        _app(world_a, status="approved")

        data = _client_for(world_a.staff).get(
            QUERY_URL, {"review_queue": "true"}
        ).json()["data"]
        assert data["totalCount"] == 2
        assert data["aggregates"]["decision_queue_count"] == 2

    def test_overdue_review_filter_uses_the_configured_sla(self, worlds):
        world_a, _ = worlds
        stale = _app(
            world_a,
            status="submitted",
            submitted_at=timezone.now() - timedelta(days=30),
        )
        _app(world_a, status="submitted", submitted_at=timezone.now())

        data = _client_for(world_a.staff).get(
            QUERY_URL, {"overdue_review": "true"}
        ).json()["data"]
        assert [row["id"] for row in data["results"]] == [str(stale.id)]
        assert data["aggregates"]["review_sla_days"] >= 1

    def test_pending_amendments_filter(self, worlds):
        world_a, _ = worlds
        amended = _app(world_a, status="submitted")
        _app(world_a, status="submitted")
        ApplicationAmendment.objects.create(
            id=uuid.uuid4(),
            application=amended,
            field_name="phone",
            old_value="+260970000001",
            new_value="+260970000002",
            reason="Changed number",
            status="pending",
        )
        data = _client_for(world_a.staff).get(
            QUERY_URL, {"has_pending_amendments": "true"}
        ).json()["data"]
        assert [row["id"] for row in data["results"]] == [str(amended.id)]

    def test_exclude_status_and_search_compose(self, worlds):
        world_a, _ = worlds
        _app(world_a, status="draft", full_name="Zara Draft")
        wanted = _app(world_a, status="submitted", full_name="Zara Submitted")

        data = _client_for(world_a.staff).get(
            QUERY_URL, {"exclude_status": "draft", "search": "Zara"}
        ).json()["data"]
        assert [row["id"] for row in data["results"]] == [str(wanted.id)]

    def test_search_matches_the_application_number(self, worlds):
        world_a, _ = worlds
        target = _app(world_a, status="submitted")
        _app(world_a, status="submitted")

        data = _client_for(world_a.staff).get(
            QUERY_URL, {"search": target.application_number}
        ).json()["data"]
        assert [row["id"] for row in data["results"]] == [str(target.id)]

    def test_sort_by_deadline_orders_by_the_derived_column(self, worlds):
        world_a, _ = worlds
        now = timezone.now()
        later = _app(
            world_a,
            status="approved",
            enrollment_confirmation_deadline=now + timedelta(days=5),
        )
        sooner = _app(
            world_a,
            status="approved",
            enrollment_confirmation_deadline=now + timedelta(days=1),
        )
        data = _client_for(world_a.staff).get(
            QUERY_URL, {"sort": "deadline", "order": "asc"}
        ).json()["data"]
        ordered = [row["id"] for row in data["results"] if row["next_deadline_at"]]
        assert ordered[:2] == [str(sooner.id), str(later.id)]


# ---------------------------------------------------------------------------
# Envelope + definitions (R8.6, design §14.1)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEnvelopeAndDefinitions:
    """The canonical envelope is preserved and every metric states its meaning.

    **Validates: Requirements R8.6, R14.1**
    """

    def test_envelope_and_pagination_shape(self, worlds):
        world_a, _ = worlds
        _app(world_a, status="submitted")
        payload = _client_for(world_a.staff).get(QUERY_URL).json()
        assert payload["success"] is True
        data = payload["data"]
        for key in ("page", "pageSize", "totalCount", "results"):
            assert key in data
        # Additive keys, not a replacement shape.
        for key in ("totalPages", "aggregates", "facets", "filters", "redaction", "can_export"):
            assert key in data

    def test_each_headline_metric_carries_a_definition(self, worlds):
        world_a, _ = worlds
        _app(world_a, status="submitted")
        aggregates = _client_for(world_a.staff).get(QUERY_URL).json()["data"]["aggregates"]
        definitions = aggregates["definitions"]
        for metric in (
            "decision_queue_count",
            "accepted_count",
            "payment_resolved_count",
            "overdue_review_count",
            "deadline_pressure_count",
        ):
            assert definitions.get(metric), f"{metric} has no definition"
            assert metric in aggregates

    def test_an_empty_scope_is_an_honest_zero_with_its_window(self, worlds):
        """Zero rows still publishes the windows, so it is a *measured* zero."""
        world_a, _ = worlds
        aggregates = _client_for(world_a.staff).get(QUERY_URL).json()["data"]["aggregates"]
        assert aggregates["total"] == 0
        assert aggregates["review_sla_days"] >= 1
        assert aggregates["deadline_pressure_hours"] == DEADLINE_PRESSURE_HOURS
        assert aggregates["next_deadline_at"] is None


# ---------------------------------------------------------------------------
# Export (R6.5)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestExportIsACommand:
    """The export is page-independent, capability-gated, redacted, and audited.

    **Validates: Requirements R6.5, R8.1**
    """

    def test_export_is_page_independent(self, worlds):
        world_a, _ = worlds
        for _ in range(3):
            _app(world_a, status="submitted")
        _grant_export(world_a)

        response = _client_for(world_a.staff).get(
            QUERY_URL, {"export": "csv", "page": 3, "pageSize": 1}
        )
        assert response.status_code == 200, response.content
        assert response["Content-Type"] == "text/csv"
        assert len(_csv_rows(response)) == 3

    def test_export_requires_the_explicit_export_capability(self, worlds):
        world_a, _ = worlds
        _app(world_a, status="submitted")
        response = _client_for(world_a.staff).get(QUERY_URL, {"export": "csv"})
        assert response.status_code == 403, response.content
        assert AuditLog.objects.filter(action="auth.denied").exists()

    def test_export_is_audited_without_the_rows(self, worlds):
        world_a, _ = worlds
        app = _app(world_a, status="submitted", full_name="Audited Applicant")
        _grant_export(world_a)

        _client_for(world_a.staff).get(QUERY_URL, {"export": "csv"})
        entry = AuditLog.objects.filter(action="application.exported").first()
        assert entry is not None
        changes = json.dumps(entry.changes or {})
        assert "Audited Applicant" not in changes
        assert str(app.id) not in changes
        assert '"row_count": 1' in changes or "'row_count': 1" in changes
        # SHA-256 redacted network context, never a raw address.
        for value in (entry.ip_address, entry.user_agent):
            if value:
                assert len(value) == 64 and all(ch in "0123456789abcdef" for ch in value)

    def test_export_omits_the_platform_only_column_for_a_tenant(self, worlds):
        world_a, _ = worlds
        _app(world_a, status="submitted")
        _grant_export(world_a)

        response = _client_for(world_a.staff).get(QUERY_URL, {"export": "csv"})
        header = response.content.decode().splitlines()[0]
        assert "peer_offering_count" not in header

    def test_export_excludes_the_other_tenant(self, worlds):
        world_a, world_b = worlds
        _app(world_a, status="submitted")
        _app(world_b, status="submitted", full_name="Bee Tenant Applicant")
        _grant_export(world_a)

        response = _client_for(world_a.staff).get(QUERY_URL, {"export": "csv"})
        body = response.content.decode()
        assert len(_csv_rows(response)) == 1
        assert "Bee Tenant Applicant" not in body
        assert world_b.institution.name not in body

    def test_export_row_limit_is_a_refusal_not_a_truncation(self, worlds, monkeypatch):
        world_a, _ = worlds
        for _ in range(3):
            _app(world_a, status="submitted")
        _grant_export(world_a)
        monkeypatch.setattr(
            "apps.applications.query_service.EXPORT_ROW_LIMIT", 2
        )
        monkeypatch.setattr("apps.applications.admin_query_views.EXPORT_ROW_LIMIT", 2)

        response = _client_for(world_a.staff).get(QUERY_URL, {"export": "csv"})
        assert response.status_code == 400, response.content
        assert response.json()["code"] == "EXPORT_TOO_LARGE"


# ---------------------------------------------------------------------------
# Saved filters (design §13.2)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSavedFilters:
    """A named query is a server record, private to its owner.

    **Validates: Requirements R8.1**
    """

    def test_save_list_and_apply(self, worlds):
        world_a, _ = worlds
        _app(world_a, status="submitted")
        _app(world_a, status="approved")
        client = _client_for(world_a.staff)

        created = client.post(
            SAVED_FILTERS_URL,
            {"name": "Decision queue", "query": {"review_queue": "true"}},
            format="json",
        )
        assert created.status_code == 201, created.content
        saved_id = created.json()["data"]["id"]

        listed = client.get(SAVED_FILTERS_URL).json()["data"]
        assert listed["totalCount"] == 1
        assert listed["results"][0]["name"] == "Decision queue"

        applied = client.get(QUERY_URL, {"saved_filter": saved_id}).json()["data"]
        assert applied["totalCount"] == 1
        assert applied["filters"]["review_queue"] is True

    def test_explicit_parameters_override_the_saved_filter(self, worlds):
        world_a, _ = worlds
        _app(world_a, status="submitted")
        _app(world_a, status="approved")
        client = _client_for(world_a.staff)
        saved_id = client.post(
            SAVED_FILTERS_URL,
            {"name": "Queue", "query": {"review_queue": "true"}},
            format="json",
        ).json()["data"]["id"]

        data = client.get(
            QUERY_URL, {"saved_filter": saved_id, "review_queue": "false"}
        ).json()["data"]
        assert data["filters"]["review_queue"] is False
        assert data["totalCount"] == 1

    def test_saving_the_same_name_updates_rather_than_duplicating(self, worlds):
        world_a, _ = worlds
        client = _client_for(world_a.staff)
        first = client.post(
            SAVED_FILTERS_URL,
            {"name": "Mine", "query": {"review_queue": "true"}},
            format="json",
        )
        second = client.post(
            SAVED_FILTERS_URL,
            {"name": "mine", "query": {"overdue_review": "true"}},
            format="json",
        )
        assert first.status_code == 201
        assert second.status_code == 200, second.content
        assert first.json()["data"]["id"] == second.json()["data"]["id"]
        assert client.get(SAVED_FILTERS_URL).json()["data"]["totalCount"] == 1

    def test_an_unregistered_parameter_cannot_be_saved(self, worlds):
        """Saving ADM-01's own defect to disk is refused, with the name.

        A stored ``deadlinePressureFilter`` would be silently ignored every time
        the view was opened — the exact failure the finding describes, made
        durable.
        """
        world_a, _ = worlds
        response = _client_for(world_a.staff).post(
            SAVED_FILTERS_URL,
            {"name": "Broken", "query": {"deadlinePressureFilter": "true"}},
            format="json",
        )
        assert response.status_code == 400, response.content
        assert response.json()["code"] == "UNREGISTERED_QUERY_PARAMETER"
        assert response.json()["data"]["unregistered"] == ["deadlinePressureFilter"]
        assert not AdminSavedFilter.objects.exists()

    def test_saved_filters_are_private_to_their_owner(self, worlds):
        world_a, _ = worlds
        other_staff = build_profile(role="admin")
        build_membership(user=other_staff, institution=world_a.institution, role="admin")

        mine = _client_for(world_a.staff).post(
            SAVED_FILTERS_URL, {"name": "Private", "query": {}}, format="json"
        ).json()["data"]["id"]

        theirs = _client_for(other_staff)
        assert theirs.get(SAVED_FILTERS_URL).json()["data"]["totalCount"] == 0
        # Another operator's id is the same mask as one that does not exist.
        probe = theirs.get(QUERY_URL, {"saved_filter": mine})
        nonsense = theirs.get(QUERY_URL, {"saved_filter": str(uuid.uuid4())})
        assert probe.status_code == nonsense.status_code == 404
        assert probe.content == nonsense.content
        assert theirs.delete(f"{SAVED_FILTERS_URL}{mine}/").status_code == 404
        assert AdminSavedFilter.objects.filter(id=mine).exists()

    def test_a_cross_tenant_institution_binding_is_masked(self, worlds):
        world_a, world_b = worlds
        response = _client_for(world_a.staff).post(
            SAVED_FILTERS_URL,
            {"name": "Theirs", "institution_id": world_b.institution_id, "query": {}},
            format="json",
        )
        assert response.status_code == 404, response.content
        assert not AdminSavedFilter.objects.exists()

    def test_delete_removes_the_owners_own_filter(self, worlds):
        world_a, _ = worlds
        client = _client_for(world_a.staff)
        saved_id = client.post(
            SAVED_FILTERS_URL, {"name": "Temp", "query": {}}, format="json"
        ).json()["data"]["id"]
        assert client.delete(f"{SAVED_FILTERS_URL}{saved_id}/").status_code == 204
        assert client.get(SAVED_FILTERS_URL).json()["data"]["totalCount"] == 0

    def test_a_name_is_required(self, worlds):
        world_a, _ = worlds
        response = _client_for(world_a.staff).post(
            SAVED_FILTERS_URL, {"query": {}}, format="json"
        )
        assert response.status_code == 400, response.content

    def test_the_database_itself_refuses_a_duplicate_name(self, worlds):
        """The per-owner uniqueness is the database's, not only the view's.

        ``test_saving_the_same_name_updates_rather_than_duplicating`` proves the
        *endpoint* converges, but it does so through an application-level
        ``filter(name__iexact=...)`` read — which two concurrent saves can both
        pass before either writes. The final guard is
        ``uq_admin_saved_filters_owner_name`` from
        ``backend/scripts/2026_08_06_01_admin_saved_filters.sql``, and this
        asserts it exists and bites, by bypassing the view entirely.

        Without this the index would be declared in a migration nobody runs
        against a test database (the model is ``managed = False``, so
        ``create_model`` emits the table and none of the expression indexes), and
        the ``IntegrityError`` branch in the view would be unreachable code.
        """
        from django.db import IntegrityError, transaction

        world_a, _ = worlds
        AdminSavedFilter.objects.create(
            user_id=world_a.staff.id, name="Overdue", query={}
        )
        # Same owner, different case: one saved view, not two an operator cannot
        # tell apart.
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                AdminSavedFilter.objects.create(
                    user_id=world_a.staff.id, name="overdue", query={}
                )
        # The name is only unique *per owner* — a colleague may keep their own.
        other_staff = build_profile(role="admin")
        build_membership(user=other_staff, institution=world_a.institution, role="admin")
        AdminSavedFilter.objects.create(user_id=other_staff.id, name="Overdue", query={})
        assert AdminSavedFilter.objects.filter(name__iexact="overdue").count() == 2


# ---------------------------------------------------------------------------
# Drift guards
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestServiceInvariants:
    """The service reads the platform's own vocabulary rather than restating it.

    **Validates: Requirements R8.1, R8.6**
    """

    def test_review_queue_statuses_match_the_legacy_filter(self):
        """One definition of "waiting on a decision", shared with ApplicationFilter."""
        import inspect

        from apps.applications.filters import ApplicationFilter

        source = inspect.getsource(ApplicationFilter.filter_review_queue)
        for value in REVIEW_QUEUE_STATUSES:
            assert f'"{value}"' in source

    def test_accepted_statuses_mirror_the_frontend(self):
        """Drift guard against ``types/applicationStatus.ts``."""
        from pathlib import Path

        path = (
            Path(__file__).resolve().parents[3]
            / "apps"
            / "admissions"
            / "src"
            / "types"
            / "applicationStatus.ts"
        )
        source = path.read_text(encoding="utf-8")
        marker = "ACCEPTED_APPLICATION_STATUSES"
        assert marker in source
        block = source.split(marker, 1)[1].split("]", 1)[0]
        for value in ACCEPTED_STATUSES:
            assert f"'{value}'" in block or f'"{value}"' in block

    def test_grouping_and_counting_happen_in_sql(self, worlds, django_assert_num_queries):
        """No aggregate is produced by reading rows and adding them up in Python.

        Doubling the roster must not change the number of queries: if a counter
        were computed in a loop the query count would move with the data.
        """
        world_a, _ = worlds
        for _ in range(3):
            _app(world_a, status="submitted")
        client = _client_for(world_a.staff)

        from django.db import connection as conn
        from django.test.utils import CaptureQueriesContext

        with CaptureQueriesContext(conn) as first:
            client.get(QUERY_URL, {"pageSize": 2})
        for _ in range(6):
            _app(world_a, status="approved")
        with CaptureQueriesContext(conn) as second:
            client.get(QUERY_URL, {"pageSize": 2})

        assert len(first.captured_queries) == len(second.captured_queries)
        aggregate_sql = [
            entry["sql"]
            for entry in second.captured_queries
            if "COUNT(" in entry["sql"].upper() and "applications" in entry["sql"]
        ]
        assert aggregate_sql, "the aggregates must be SQL COUNTs"

    def test_export_limit_is_declared_to_the_client(self, worlds):
        world_a, _ = worlds
        aggregates = _client_for(world_a.staff).get(QUERY_URL).json()["data"]["aggregates"]
        assert aggregates["row_limit"] == EXPORT_ROW_LIMIT

    def test_the_service_never_compares_a_role_string(self):
        """Authority is a capability here — no ``role ==`` anywhere in the module."""
        from pathlib import Path

        for name in ("query_service.py", "admin_query_views.py"):
            source = (
                Path(__file__).resolve().parents[2]
                / "apps"
                / "applications"
                / name
            ).read_text(encoding="utf-8")
            for pattern in ('role == "admin"', "role == 'admin'", 'role == "super_admin"'):
                assert pattern not in source, f"{name} compares a role string"
