"""The admin dashboard's metric contract (task 9.2).

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 9.2 —
              "Make dashboard metrics truthful".
Requirements: **R8.6** (dashboard metrics are authoritative, scope-aware,
              definition-labelled, and explicit about loading, stale, error, and
              unknown states; missing data never becomes a healthy zero),
              **R17.3** (metrics cover the real failure surfaces), **R17.4**
              (honest degraded states rather than guessed values), **R17.5**
              (bounded reads), **R17.6** (a failure is never relabelled as
              success by inventing a healthy default).
Findings:     **ADM-02** — "Missing dashboard metrics are synthesized as healthy
              zeros, scoped polling can lose institution scope, and enabled
              accounts are labeled online users." **MAINT-02** — misleading
              labels and decorative metrics.

The claim this file makes
-------------------------
The task's ``_Evidence:`` line asks for *metric query tests proving each number
equals an independent count over its stated scope*. Two independent statements
are made here, and they check different things:

1. :class:`TestEachNumberEqualsAnIndependentCount` recomputes **every** published
   metric with hand-written SQL over the same scoped rows. Two different query
   builders agreeing on one database is stronger than one builder agreeing with
   itself.
2. :class:`TestATileIsTheRosterItOpens` asserts each exception tile's number
   equals the roster endpoint's own ``totalCount`` for the query that tile's link
   carries. That is the property an operator actually relies on: the number
   promises a page, and the page has that many rows in it.

The rest proves the states around the numbers: a failed source is ``unknown``
rather than zero, a genuine zero is distinguishable from a missing read, health
is derived from the read instead of defaulted to "good", scope precedes lookup,
and the enabled-account metric says what it counts.

Every test runs with ``production_scope`` active, so the test-settings
legacy-admin all-access shortcut is disabled and what is measured is the real
membership/grant-derived capability model.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.accounts.dashboard_metrics import (
    APPLICATION_METRIC_COUNTERS,
    HEALTH_DEGRADED,
    HEALTH_OPERATIONAL,
    HEALTH_UNKNOWN,
    SOURCE_ACCOUNTS,
    SOURCE_APPLICATIONS,
    STALE_AFTER_SECONDS,
    DashboardMetricsService,
    dashboard_metric_registry,
    metric_keys,
)
from apps.applications.models import ApplicationCondition, ApplicationInterview
from apps.applications.query_service import (
    DASHBOARD_ONLY_DEFINITIONS,
    DASHBOARD_TILES,
    DEADLINE_PRESSURE_HOURS,
    ApplicationQueryService,
)
from apps.catalog.services import AccessScopeService
from apps.common.models import AuditLog
from tests.tenant_fixtures import (
    build_application,
    build_document,
    build_two_tenant_worlds,
)

DASHBOARD_URL = "/api/v1/admin/dashboard/"
ROSTER_URL = "/api/v1/admin/applications/"


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


def _app(world, **overrides):
    return build_application(
        student=world.student,
        institution=world.institution,
        canonical_program=world.canonical_program,
        offering=world.offering,
        intake=world.intake,
        **overrides,
    )


def _dashboard(profile, **params):
    return _client_for(profile).get(DASHBOARD_URL, params).json()


def _metrics(profile, **params):
    return _dashboard(profile, **params)["data"]["metrics"]


def _value(metrics, key):
    return metrics[key]["value"]


@pytest.fixture(autouse=True)
def production_scope(monkeypatch):
    """Measure the real membership/grant model, never the test admin shortcut."""
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


@pytest.fixture(autouse=True)
def cache_off(settings):
    """Measure the computation, not a cache hit (the flag's own default)."""
    settings.PERF_CACHE_DASHBOARD = False


@pytest.fixture()
def worlds(db):
    """Two independent tenants sharing one canonical program, no applications."""
    return build_two_tenant_worlds(with_application=False)


def _seed_spread(world):
    """One application per interesting shape, so every counter has a real answer.

    Deliberately explicit rather than looped: each row below is the *reason* a
    counter is non-zero, and a reader must be able to check the arithmetic by
    hand against the assertions.
    """
    now = timezone.now()
    old = now - timedelta(days=60)
    rows = {
        "draft": _app(world, status="draft"),
        "submitted_fresh": _app(world, status="submitted", submitted_at=now),
        "submitted_overdue": _app(world, status="submitted", submitted_at=old),
        "under_review_overdue": _app(world, status="under_review", submitted_at=old),
        "approved": _app(world, status="approved", payment_status="successful"),
        "conditional": _app(world, status="conditionally_approved"),
        "enrolled": _app(world, status="enrolled"),
        "rejected": _app(world, status="rejected"),
        "payment_review": _app(world, status="submitted", payment_status="pending_review"),
        "unpaid": _app(world, status="submitted", payment_status=None),
    }
    # A document nobody has verified → one application in "pending documents".
    build_document(application=rows["submitted_fresh"], verification_status="pending")
    # An interview ahead of now → one application in "upcoming interviews".
    ApplicationInterview.objects.create(
        id=uuid.uuid4(),
        application=rows["approved"],
        scheduled_at=now + timedelta(days=2),
        mode="online",
        status="scheduled",
    )
    # An open condition due inside the pressure window → one application in
    # "deadline pressure". Uses a *condition* deadline rather than the enrollment
    # column, which is the half a naive implementation misses.
    ApplicationCondition.objects.create(
        id=uuid.uuid4(),
        application=rows["conditional"],
        condition_type="document",
        description="Submit certified results",
        deadline=now + timedelta(hours=DEADLINE_PRESSURE_HOURS - 2),
        status="pending",
        created_at=now,
        updated_at=now,
    )
    return rows


# ---------------------------------------------------------------------------
# The required evidence, part 1: an independent count per number
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEachNumberEqualsAnIndependentCount:
    """Every published metric equals a hand-written SQL count over its scope.

    **Validates: Requirements R8.6**
    """

    @staticmethod
    def _independent(institution_id: str) -> dict[str, int]:
        """Recompute every dashboard counter in raw SQL, independently of the ORM."""
        from apps.applications.query_service import (
            ACCEPTED_STATUSES,
            PAYMENT_REVIEW_STATUSES,
            REVIEW_QUEUE_STATUSES,
            UNVERIFIED_DOCUMENT_STATES,
            _review_sla_days,
        )
        from apps.documents.payment_constants import RESOLVED_PAYMENT_STATUSES

        def quoted(values):
            return ", ".join(f"'{value}'" for value in values)

        unverified = quoted(
            [state for state in UNVERIFIED_DOCUMENT_STATES if state is not None]
        )
        sla_days = _review_sla_days()
        sql = f"""
            SELECT
                count(*)                                                   AS total_applications,
                count(*) FILTER (WHERE status IN ({quoted(REVIEW_QUEUE_STATUSES)}))
                                                                           AS decision_queue,
                count(*) FILTER (WHERE status IN ({quoted(ACCEPTED_STATUSES)}))
                                                                           AS accepted_path,
                count(*) FILTER (WHERE status = 'rejected')                AS rejected,
                count(*) FILTER (WHERE status IN ({quoted(REVIEW_QUEUE_STATUSES)})
                                   AND submitted_at < now() - interval '{sla_days} days')
                                                                           AS overdue_reviews,
                count(*) FILTER (WHERE payment_status IN ({quoted(RESOLVED_PAYMENT_STATUSES)}))
                                                                           AS payment_resolved,
                count(*) FILTER (WHERE payment_status IS NULL
                                    OR payment_status IN ('', 'not_paid', 'unpaid'))
                                                                           AS payment_unpaid,
                count(*) FILTER (WHERE payment_status IN ({quoted(PAYMENT_REVIEW_STATUSES)}))
                                                                           AS payment_review,
                count(*) FILTER (WHERE EXISTS (
                    SELECT 1 FROM application_documents d
                     WHERE d.application_id = a.id
                       AND (d.verification_status IS NULL
                            OR d.verification_status IN ({unverified}))))  AS pending_documents,
                count(*) FILTER (WHERE EXISTS (
                    SELECT 1 FROM application_interviews i
                     WHERE i.application_id = a.id
                       AND i.scheduled_at >= now()
                       AND i.status IN ('scheduled', 'pending')))          AS upcoming_interviews,
                count(*) FILTER (WHERE COALESCE(
                        a.enrollment_confirmation_deadline,
                        (SELECT c.deadline FROM application_conditions c
                          WHERE c.application_id = a.id
                            AND c.status NOT IN ('met', 'waived')
                          ORDER BY c.deadline LIMIT 1))
                        BETWEEN now()
                            AND now() + interval '{DEADLINE_PRESSURE_HOURS} hours')
                                                                           AS deadline_pressure,
                count(*) FILTER (WHERE COALESCE(submitted_at, updated_at, created_at)
                                       >= date_trunc('day', now()))        AS today_activity
            FROM applications a
            WHERE a.institution_id = %s
        """
        with connection.cursor() as cursor:
            cursor.execute(sql, [institution_id])
            columns = [column[0] for column in cursor.description]
            row = cursor.fetchone()
        return dict(zip(columns, row))

    def test_every_application_metric_matches_raw_sql(self, worlds):
        world_a, world_b = worlds
        _seed_spread(world_a)
        # Rows in the other tenant that must not reach any of world A's numbers.
        _app(world_b, status="submitted")
        _app(world_b, status="approved")

        metrics = _metrics(world_a.staff)
        expected = self._independent(str(world_a.institution.id))

        for key, value in expected.items():
            assert metrics[key]["state"] == "ok", key
            assert _value(metrics, key) == value, (
                f"{key}: dashboard said {_value(metrics, key)}, SQL said {value}"
            )

        # The seeded spread is real: not every counter is zero, so an equality
        # that held only because both sides were empty cannot pass this file.
        assert expected["total_applications"] == 10
        assert expected["overdue_reviews"] == 2
        assert expected["pending_documents"] == 1
        assert expected["upcoming_interviews"] == 1
        assert expected["deadline_pressure"] == 1
        assert expected["payment_review"] == 1

    def test_enabled_accounts_match_an_independent_count(self, worlds):
        """The MAINT-02 metric counts sign-in permission, and that is checkable."""
        world_a, _ = worlds
        metrics = _metrics(world_a.staff)
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT count(*) FILTER (WHERE is_active) AS enabled,
                       count(*)                          AS total
                  FROM profiles
                 WHERE id = %s
                    OR id IN (SELECT user_id FROM user_institution_memberships
                               WHERE institution_id = %s AND is_active)
                """,
                [str(world_a.staff.id), str(world_a.institution.id)],
            )
            enabled, total = cursor.fetchone()
        assert _value(metrics, "staff_accounts_enabled") == enabled
        assert _value(metrics, "staff_accounts_total") == total

    def test_a_selected_school_narrows_every_number(self, worlds):
        """``?institution_id=`` re-scopes the metrics, it does not merely relabel."""
        world_a, world_b = worlds
        _app(world_a, status="submitted")
        _app(world_b, status="submitted")
        _app(world_b, status="submitted")
        super_admin = world_a.student
        super_admin.role = "super_admin"
        super_admin.save(update_fields=["role"])

        everything = _metrics(super_admin)
        just_b = _metrics(super_admin, institution_id=str(world_b.institution.id))

        assert _value(everything, "total_applications") == 3
        assert _value(just_b, "total_applications") == 2
        assert (
            self._independent(str(world_b.institution.id))["total_applications"]
            == _value(just_b, "total_applications")
        )


# ---------------------------------------------------------------------------
# The required evidence, part 2: a tile is the roster it opens
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestATileIsTheRosterItOpens:
    """Each exception tile's number equals its link's roster ``totalCount``.

    ADM-02's sibling defect: a number computed one way beside a link computed
    another. Pairing the counter with the registered query in ``DASHBOARD_TILES``
    makes them the same predicate; this proves it end to end, through both HTTP
    endpoints, on the same rows.

    **Validates: Requirements R8.6, R8.1**
    """

    def test_every_tile_count_equals_its_rosters_total(self, worlds):
        world_a, _ = worlds
        _seed_spread(world_a)
        client = _client_for(world_a.staff)
        metrics = client.get(DASHBOARD_URL).json()["data"]["metrics"]
        metric_by_counter = {
            counter: key for key, counter in APPLICATION_METRIC_COUNTERS.items()
        }

        for tile, spec in DASHBOARD_TILES.items():
            metric_key = metric_by_counter[spec["counter"]]
            roster = client.get(f"{ROSTER_URL}?{spec['roster_query']}").json()["data"]
            assert metrics[metric_key]["state"] == "ok", tile
            assert _value(metrics, metric_key) == roster["totalCount"], (
                f"tile {tile}: dashboard said {_value(metrics, metric_key)}, "
                f"the roster it opens has {roster['totalCount']} rows"
            )

    def test_each_tile_publishes_the_query_its_link_must_carry(self, worlds):
        """The link is served by the backend, so a tile cannot invent a spelling."""
        world_a, _ = worlds
        metrics = _metrics(world_a.staff)
        metric_by_counter = {
            counter: key for key, counter in APPLICATION_METRIC_COUNTERS.items()
        }
        for spec in DASHBOARD_TILES.values():
            metric = metrics[metric_by_counter[spec["counter"]]]
            assert metric["roster_query"] == spec["roster_query"]

    def test_every_tile_query_is_a_registered_parameter(self):
        """A tile query outside 9.1's registered set would be silently dropped."""
        from urllib.parse import parse_qsl

        from apps.applications.query_service import REGISTERED_PARAMETERS

        for tile, spec in DASHBOARD_TILES.items():
            for name, _ in parse_qsl(spec["roster_query"]):
                assert name in REGISTERED_PARAMETERS, f"{tile} emits {name!r}"


# ---------------------------------------------------------------------------
# Unknown is not zero (ADM-02's heart, R8.6 / R17.6)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAFailedSourceIsUnknownNotZero:
    """A source that does not answer produces ``None``, never ``0``.

    **Validates: Requirements R8.6, R17.4, R17.6**
    """

    def test_a_failed_applications_read_leaves_every_count_unknown(
        self, worlds, monkeypatch
    ):
        world_a, _ = worlds
        _seed_spread(world_a)

        def explode(*args, **kwargs):
            raise RuntimeError("simulated applications-read failure")

        monkeypatch.setattr(
            ApplicationQueryService, "dashboard_counters", explode
        )
        data = _dashboard(world_a.staff)["data"]

        for key, counter in APPLICATION_METRIC_COUNTERS.items():
            assert data["metrics"][key]["state"] == "unknown", key
            assert data["metrics"][key]["value"] is None, key
        assert data["sources"][SOURCE_APPLICATIONS]["state"] == "failed"

    def test_a_failed_source_does_not_take_the_others_down(self, worlds, monkeypatch):
        """Partial failure is reported as partial, not as an empty dashboard."""
        world_a, _ = worlds
        _seed_spread(world_a)
        monkeypatch.setattr(
            DashboardMetricsService,
            "_account_counters",
            lambda *a, **k: (_ for _ in ()).throw(RuntimeError("accounts down")),
        )
        data = _dashboard(world_a.staff)["data"]

        assert data["metrics"]["total_applications"]["state"] == "ok"
        assert data["metrics"]["total_applications"]["value"] == 10
        assert data["metrics"]["staff_accounts_enabled"]["state"] == "unknown"
        assert data["metrics"]["staff_accounts_enabled"]["value"] is None
        assert data["health"]["state"] == HEALTH_DEGRADED

    def test_the_failure_reason_names_no_internals(self, worlds, monkeypatch):
        """An operator learns the source failed, not the database's error text."""
        secret = "relation applications_secret_internal does not exist"
        monkeypatch.setattr(
            ApplicationQueryService,
            "dashboard_counters",
            lambda *a, **k: (_ for _ in ()).throw(RuntimeError(secret)),
        )
        world_a, _ = worlds
        body = _client_for(world_a.staff).get(DASHBOARD_URL).content.decode()
        assert secret not in body
        assert "RuntimeError" in body  # the class, which carries no data

    def test_a_legacy_block_omits_a_key_rather_than_zeroing_it(
        self, worlds, monkeypatch
    ):
        """The compatibility shape declines to answer instead of answering wrong."""
        world_a, _ = worlds
        _seed_spread(world_a)
        monkeypatch.setattr(
            ApplicationQueryService,
            "dashboard_counters",
            lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")),
        )
        data = _dashboard(world_a.staff)["data"]
        assert "total" not in data["applications"]
        assert data["needs_attention"] == {}
        # The accounts source still answered, so its keys are present.
        assert "enabled" in data["users"]

    def test_a_genuine_zero_is_ok_and_carries_its_window(self, worlds):
        """An empty scope is a *measured* zero, distinguishable from no answer."""
        world_a, _ = worlds
        data = _dashboard(world_a.staff)["data"]
        assert data["metrics"]["total_applications"]["state"] == "ok"
        assert data["metrics"]["total_applications"]["value"] == 0
        assert data["metrics"]["overdue_reviews"]["value"] == 0
        assert data["windows"]["review_sla_days"] >= 1
        assert data["windows"]["deadline_pressure_hours"] == DEADLINE_PRESSURE_HOURS


# ---------------------------------------------------------------------------
# Definitions, scope labels, freshness, health (R8.6)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEveryNumberStatesWhatItCounts:
    """Each metric ships its definition, its scope, and its source.

    **Validates: Requirements R8.6**
    """

    def test_every_metric_carries_a_non_empty_definition(self, worlds):
        world_a, _ = worlds
        metrics = _metrics(world_a.staff)
        assert set(metrics) == set(metric_keys())
        for key, metric in metrics.items():
            assert metric["definition"].strip(), f"{key} has no definition"
            assert metric["definition"].endswith("."), f"{key} is not a sentence"
            assert metric["scope"] in {"institution", "platform"}
            assert metric["source"]

    def test_a_tile_definition_is_the_rosters_own_sentence(self):
        """"Decision queue" cannot mean one thing here and another there."""
        roster = ApplicationQueryService.aggregate_definitions()
        registry = {metric.key: metric.definition for metric in dashboard_metric_registry()}
        assert registry["decision_queue"] == roster["decision_queue_count"]
        assert registry["accepted_path"] == roster["accepted_count"]
        assert registry["overdue_reviews"] == roster["overdue_review_count"]
        assert registry["deadline_pressure"] == roster["deadline_pressure_count"]

    def test_the_dashboard_only_counters_are_the_only_new_sentences(self):
        """Nothing is restated: extra definitions exist only where they must."""
        merged = ApplicationQueryService.dashboard_definitions()
        roster = ApplicationQueryService.aggregate_definitions()
        assert set(merged) - set(roster) == set(DASHBOARD_ONLY_DEFINITIONS)

    def test_enabled_accounts_never_claims_to_count_presence(self, worlds):
        """MAINT-02: the label is what changed; the population did not."""
        world_a, _ = worlds
        metric = _metrics(world_a.staff)["staff_accounts_enabled"]
        definition = metric["definition"].lower()
        assert "enabled to sign in" in definition
        assert "not a count of users currently online" in definition
        body = _client_for(world_a.staff).get(DASHBOARD_URL).content.decode().lower()
        for banned in ("active users online", "users online now", '"online"'):
            assert banned not in body

    def test_freshness_is_published_with_a_staleness_budget(self, worlds):
        """Polling can decide the numbers are stale; nothing is pushed (no SSE)."""
        world_a, _ = worlds
        freshness = _dashboard(world_a.staff)["data"]["freshness"]
        assert freshness["stale_after_seconds"] == STALE_AFTER_SECONDS
        generated = timezone.datetime.fromisoformat(freshness["generated_at"])
        assert abs((timezone.now() - generated).total_seconds()) < 60

    def test_health_is_derived_from_the_read_not_defaulted(self, worlds, monkeypatch):
        world_a, _ = worlds
        assert _dashboard(world_a.staff)["data"]["health"]["state"] == HEALTH_OPERATIONAL

        for attr, target in (
            ("dashboard_counters", ApplicationQueryService),
            ("_account_counters", DashboardMetricsService),
            ("_recent_activity", DashboardMetricsService),
        ):
            monkeypatch.setattr(
                target,
                attr,
                lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")),
            )
        data = _dashboard(world_a.staff)["data"]
        assert data["health"]["state"] == HEALTH_UNKNOWN
        assert data["health"]["definition"]

    def test_scope_is_labelled_so_a_number_states_who_it_describes(self, worlds):
        world_a, _ = worlds
        scoped = _dashboard(world_a.staff)["data"]["scope"]
        assert scoped["kind"] == "institution"
        assert scoped["all_access"] is False
        assert scoped["institution_count"] == 1

        world_a.student.role = "super_admin"
        world_a.student.save(update_fields=["role"])
        platform = _dashboard(world_a.student)["data"]["scope"]
        assert platform["kind"] == "platform"
        assert platform["all_access"] is True


# ---------------------------------------------------------------------------
# Scope before lookup, and cross-tenant silence (R3.2, R8.6)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestScopePrecedesLookup:
    """An out-of-scope school is a masked 404, not a 200 full of zeros.

    A dashboard that answered ``200`` with zeros for another tenant's institution
    id would confirm the id resolves — the same disclosure 9.1 closed on the
    roster's identifier filters.

    **Validates: Requirements R3.2, R8.6**
    """

    def test_another_tenants_institution_is_masked(self, worlds):
        world_a, world_b = worlds
        _app(world_b, status="submitted")
        response = _client_for(world_a.staff).get(
            DASHBOARD_URL, {"institution_id": str(world_b.institution.id)}
        )
        assert response.status_code == 404
        assert response.json()["code"] == "NOT_FOUND"

    def test_an_unknown_institution_is_indistinguishable(self, worlds):
        world_a, world_b = worlds
        client = _client_for(world_a.staff)
        theirs = client.get(
            DASHBOARD_URL, {"institution_id": str(world_b.institution.id)}
        )
        nonsense = client.get(DASHBOARD_URL, {"institution_id": str(uuid.uuid4())})
        assert theirs.status_code == nonsense.status_code == 404
        assert theirs.json() == nonsense.json()

    def test_the_probe_is_audited(self, worlds):
        world_a, world_b = worlds
        AuditLog.objects.all().delete()
        _client_for(world_a.staff).get(
            DASHBOARD_URL, {"institution_id": str(world_b.institution.id)}
        )
        assert AuditLog.objects.filter(action="scope.denied").exists()

    def test_a_scoped_actor_may_narrow_to_their_own_school(self, worlds):
        """The resolver narrows rather than ignoring — same rule as the roster."""
        world_a, _ = worlds
        _app(world_a, status="submitted")
        metrics = _metrics(world_a.staff, institution_id=str(world_a.institution.id))
        assert _value(metrics, "total_applications") == 1

    def test_another_tenants_rows_never_reach_any_number(self, worlds):
        world_a, world_b = worlds
        _app(world_a, status="submitted")
        for _ in range(4):
            _app(world_b, status="approved")
        body = _client_for(world_a.staff).get(DASHBOARD_URL).json()["data"]
        assert _value(body["metrics"], "total_applications") == 1
        assert _value(body["metrics"], "accepted_path") == 0
        raw = _client_for(world_a.staff).get(DASHBOARD_URL).content.decode()
        assert str(world_b.institution.id) not in raw
        assert world_b.institution.name not in raw

    def test_the_service_never_compares_a_role_string(self):
        """Authority is a capability; scope is a queryset. Never a role literal."""
        import inspect

        from apps.accounts import dashboard_metrics

        source = inspect.getsource(dashboard_metrics)
        for banned in ('== "admin"', "== 'admin'", '== "super_admin"', "== 'reviewer'"):
            assert banned not in source


# ---------------------------------------------------------------------------
# The registry itself (R8.6, R17.5)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestTheRegistryIsTheOneAuthority:
    """One list of metrics, one definition each, one bounded read.

    **Validates: Requirements R8.6, R17.5**
    """

    def test_no_metric_key_is_declared_twice(self):
        keys = [metric.key for metric in dashboard_metric_registry()]
        assert len(keys) == len(set(keys))

    def test_every_application_metric_reads_a_real_counter(self, worlds):
        """A metric wired to a counter the service does not publish is a bug."""
        world_a, _ = worlds
        _app(world_a, status="submitted")
        service = ApplicationQueryService()
        queryset = service.annotate(service.scoped_applications(world_a.staff))
        counters = service.dashboard_counters(world_a.staff, queryset)
        for key, counter in APPLICATION_METRIC_COUNTERS.items():
            assert counter in counters, f"{key} reads missing counter {counter}"

    def test_the_activity_feed_is_bounded(self, worlds):
        from apps.accounts.dashboard_metrics import ACTIVITY_LIMIT

        world_a, _ = worlds
        _seed_spread(world_a)
        activity = _dashboard(world_a.staff)["data"]["recent_activity"]
        assert len(activity) <= ACTIVITY_LIMIT

    def test_the_accounts_source_owns_exactly_the_account_metrics(self):
        by_source: dict[str, set[str]] = {}
        for metric in dashboard_metric_registry():
            by_source.setdefault(metric.source, set()).add(metric.key)
        assert by_source[SOURCE_ACCOUNTS] == {
            "staff_accounts_total",
            "staff_accounts_enabled",
        }
        assert by_source[SOURCE_APPLICATIONS] == set(APPLICATION_METRIC_COUNTERS)

    def test_the_envelope_is_preserved(self, worlds):
        world_a, _ = worlds
        payload = _client_for(world_a.staff).get(DASHBOARD_URL).json()
        assert payload["success"] is True
        data = payload["data"]
        for key in ("metrics", "sources", "health", "freshness", "scope", "windows"):
            assert key in data
        # Additive, not a replacement: the pre-9.2 blocks are still there.
        for key in ("applications", "users", "needs_attention", "recent_activity"):
            assert key in data
