"""The user directory's CRUD, import, bulk, and export contract (task 9.3).

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 9.3 —
              "Rebuild user directory CRUD, import, bulk, and export".
Requirements: **R6.1** (list, search, filters, sort, pagination, facets, counts,
              and export are server-side and preserve tenant scope in every
              request), **R6.2** (create/update serializers and forms share one
              supported field and role contract; ignored mutation fields are
              rejected, not silently lost), **R6.4** (bulk import previews,
              rejects unsupported roles, requires the intended memberships,
              applies atomically per declared mode, remains idempotent, and
              returns row-level failures), **R6.5** (bulk mutation and export are
              backend commands with explicit capability, audit, redaction, size,
              and rate limits, and the frontend does not export only its loaded
              page).
Findings:     **ADM-03** — "User management fetches only the first server page
              and then filters, sorts, paginates, and exports locally. Update
              fields are silently ignored by the backend." **ADM-04** — "Batch
              import accepts unsupported roles and creates profiles without
              tenant memberships; bulk role changes can fail on partial records."
              **AUTH-04** — invented permissions and unsupported roles.

The four claims the task's ``_Evidence:`` line asks for
------------------------------------------------------
1. **page 2+** — :class:`TestPageTwoAndBeyond`. The rows change, the totals do
   not, and the aggregates on page 3 equal an independent SQL count over the
   whole filtered set. That is the ADM-03 property: a page is a window, not the
   population.
2. **ignored-field rejection** — :class:`TestIgnoredFieldsAreRejected`. Every
   field the edit form sends is implemented, and a field outside the contract is
   a 400 naming it. The pre-9.3 endpoint answered ``200 OK`` and dropped it.
3. **import rollback** — :class:`TestImportIsPreviewedTenantBoundAtomic`. One bad
   row in ``all_or_nothing`` mode leaves the database exactly as it was, and the
   preview says so before the operator commits.
4. **audited export** — :class:`TestExportIsPageIndependentAndAudited`. The
   export is the whole filtered set regardless of ``page``, needs the platform's
   export capability, is bounded rather than truncated, and writes one audit row
   carrying counts and filters but no applicant data.

Every test runs with ``production_scope`` active, so the test-settings
legacy-admin all-access shortcut is disabled and what is measured is the real
membership/grant-derived capability model.
"""
from __future__ import annotations

import csv
import io
import uuid

import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.accounts.models import Profile
from apps.accounts.user_bulk_service import (
    BULK_OP_DEACTIVATE,
    BULK_OP_SET_ROLE,
    MAX_BULK_SIZE,
    confirmation_token_for,
)
from apps.accounts.user_directory_service import (
    CREATE_FIELDS,
    EXPORT_ROW_LIMIT,
    PLATFORM_ONLY_USER_FIELDS,
    REGISTERED_PARAMETERS,
    SORT_FIELDS,
    SUPPORTED_ROLES,
    UPDATE_FIELDS,
    UserDirectoryQueryService,
)
from apps.accounts.user_directory_views import (
    ACTION_USER_EXPORTED,
    FACET_OPEN_DIMENSIONS,
    USER_EXPORT_CAPABILITY,
)
from apps.accounts.user_import_service import (
    ACTION_USER_BATCH_IMPORT,
    ACTION_USER_IMPORT_PREVIEWED,
    ERROR_DUPLICATE_IN_BATCH,
    ERROR_EMAIL_EXISTS,
    ERROR_MISSING_FIELD,
    ERROR_ROLE_ABOVE_ACTOR,
    ERROR_UNSUPPORTED_FIELD,
    ERROR_UNSUPPORTED_ROLE,
    IMPORT_MODE_ALL_OR_NOTHING,
    IMPORT_MODE_PER_ROW,
)
from apps.catalog.models import UserInstitutionMembership
from apps.catalog.services import AccessScopeService
from apps.common.models import AuditLog
from tests.tenant_fixtures import (
    build_membership,
    build_profile,
    build_two_tenant_worlds,
)

USERS_URL = "/api/v1/admin/users/"
EXPORT_URL = "/api/v1/admin/users/export/"
BULK_URL = "/api/v1/admin/users/bulk/"
IMPORT_URL = "/api/v1/admin/users/batch-import/"
PREVIEW_URL = "/api/v1/admin/users/batch-import/preview/"


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


def _super_admin():
    return build_profile(role="super_admin", suffix=f"root-{uuid.uuid4().hex[:6]}")


def _staff_in(
    world,
    *,
    role: str = "reviewer",
    suffix: str | None = None,
    permissions: list[str] | None = None,
):
    """A staff account with an active membership in ``world``'s school.

    ``permissions=None`` is the platform's read-only default bundle
    ("mutate only when granted"), which is what a plain membership yields.
    ``permissions=["manage"]`` adds ``tenant.staff.invite`` /
    ``tenant.staff.disable`` — the grants a directory *write* needs.
    """
    profile = build_profile(role=role, suffix=suffix or f"{role}-{uuid.uuid4().hex[:6]}")
    build_membership(
        user=profile,
        institution=world.institution,
        role=role,
        permissions=permissions or [],
    )
    return profile


def _manager_in(world, *, role: str = "admin", suffix: str | None = None):
    """A staff account that may also *write* in ``world``'s school."""
    return _staff_in(world, role=role, suffix=suffix, permissions=["manage"])


def _sql_count(where: str, params: list) -> int:
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT COUNT(*) FROM profiles WHERE {where}", params)
        return cursor.fetchone()[0]


def _csv_rows(response) -> list[dict[str, str]]:
    body = response.content.decode("utf-8")
    return list(csv.DictReader(io.StringIO(body)))


@pytest.fixture()
def production_scope(monkeypatch):
    """Force the production membership/grant scope model.

    Under ``config.settings.test`` ``AccessScopeService`` grants a bare
    ``role == "admin"`` user all-access (legacy dev/test compatibility). This
    task's claims are about the real scope model, so that branch is disabled
    exactly as the other 9.x suites do.
    """
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


# ---------------------------------------------------------------------------
# 1. Page 2 and beyond (R6.1, ADM-03)
# ---------------------------------------------------------------------------


@pytest.mark.tenant
@pytest.mark.django_db
class TestPageTwoAndBeyond:
    """A page is a window; the numbers describe the population."""

    def test_paging_walks_the_whole_population_without_repeating_a_row(
        self, production_scope
    ):
        root = _super_admin()
        world_a, _world_b = build_two_tenant_worlds()
        for index in range(26):
            build_profile(role="student", suffix=f"page-{index:02d}")

        client = _client_for(root)
        first = client.get(USERS_URL, {"pageSize": 10, "page": 1}).json()["data"]
        second = client.get(USERS_URL, {"pageSize": 10, "page": 2}).json()["data"]
        third = client.get(USERS_URL, {"pageSize": 10, "page": 3}).json()["data"]

        # The total is the server's and does not move with the page.
        assert first["totalCount"] == second["totalCount"] == third["totalCount"]
        assert first["totalCount"] >= 26
        assert first["totalPages"] == -(-first["totalCount"] // 10)

        assert len(first["results"]) == 10
        assert len(second["results"]) == 10
        ids = [row["id"] for row in first["results"] + second["results"] + third["results"]]
        # A total ordering is what makes paging correct: no row appears twice and
        # none is skipped, even where two accounts share a display name.
        assert len(ids) == len(set(ids))

    def test_the_aggregates_equal_an_independent_sql_count(self, production_scope):
        root = _super_admin()
        build_two_tenant_worlds()
        for index in range(6):
            build_profile(role="reviewer", suffix=f"agg-rev-{index}")
        for index in range(3):
            build_profile(role="admin", suffix=f"agg-adm-{index}")
        disabled = build_profile(role="student", suffix="agg-off")
        disabled.is_active = False
        disabled.save(update_fields=["is_active"])

        client = _client_for(root)
        # Deliberately read page 3 with a small page: the aggregates must
        # describe the population, not the three rows on screen.
        data = client.get(
            USERS_URL, {"pageSize": 3, "page": 3, "is_active": "false"}
        ).json()["data"]
        aggregates = data["aggregates"]

        assert aggregates["total_count"] == _sql_count("is_active = false", [])
        assert aggregates["disabled_count"] == aggregates["total_count"]
        assert aggregates["enabled_count"] == 0

        unfiltered = client.get(USERS_URL, {"pageSize": 3, "page": 2}).json()["data"]
        agg = unfiltered["aggregates"]
        assert agg["total_count"] == _sql_count(
            "(is_active IS TRUE OR is_active IS NULL)", []
        )
        for role in SUPPORTED_ROLES:
            assert agg["role_breakdown"][role] == _sql_count(
                "role = %s AND (is_active IS TRUE OR is_active IS NULL)", [role]
            )

    def test_every_headline_number_states_what_it_counts(self, production_scope):
        root = _super_admin()
        data = _client_for(root).get(USERS_URL).json()["data"]
        definitions = data["aggregate_definitions"]
        for key in data["aggregates"]:
            if key == "role_breakdown":
                continue
            assert definitions.get(key), f"{key} ships no definition"
        # MAINT-02's lesson, applied here: an enabled account is an account
        # permitted to sign in, and the sentence says so rather than implying
        # presence.
        assert "not a count of users currently online" in definitions["enabled_count"]

    def test_search_sort_and_filters_are_the_servers(self, production_scope):
        root = _super_admin()
        target = build_profile(
            role="reviewer", suffix="needle", first_name="Zzz", last_name="Needle"
        )
        build_profile(role="student", suffix="haystack", first_name="Aaa")

        client = _client_for(root)
        found = client.get(USERS_URL, {"search": target.email}).json()["data"]
        assert found["totalCount"] == 1
        assert found["results"][0]["id"] == str(target.id)

        by_role = client.get(USERS_URL, {"role": "reviewer"}).json()["data"]
        assert {row["role"] for row in by_role["results"]} == {"reviewer"}
        assert by_role["totalCount"] == _sql_count(
            "role = 'reviewer' AND (is_active IS TRUE OR is_active IS NULL)", []
        )

        ascending = client.get(
            USERS_URL, {"sort": "display_name", "order": "asc", "pageSize": 100}
        ).json()["data"]["results"]
        names = [row["full_name"] for row in ascending]
        assert names == sorted(names)

        # The legacy client spelling still resolves rather than silently
        # falling back to the default sort.
        assert client.get(USERS_URL, {"sort": "name"}).status_code == 200

    def test_search_covers_the_name_the_table_renders(self, production_scope):
        """The derived display name is searchable, or the search contradicts the screen.

        An account stored as ``first_name='Ada'`` / ``last_name='Lovelace'`` with
        no ``full_name`` renders as "Ada Lovelace". Searching that string used to
        match *neither* stored column, so an operator could read a name off the
        table and fail to find it. Found by running the browser journey.
        """
        root = _super_admin()
        target = build_profile(
            role="student", suffix="split-name", first_name="Ada", last_name="Lovelace"
        )
        Profile.objects.filter(pk=target.pk).update(full_name=None)

        data = _client_for(root).get(USERS_URL, {"search": "Ada Lovelace"}).json()["data"]
        assert data["totalCount"] == 1
        assert data["results"][0]["id"] == str(target.id)

    def test_an_unregistered_parameter_is_echoed_not_dropped(self, production_scope):
        root = _super_admin()
        data = _client_for(root).get(
            USERS_URL, {"roleFilter": "admin", "sortField": "name"}
        ).json()["data"]
        assert set(data["filters"]["unknown_parameters"]) == {"roleFilter", "sortField"}

    def test_every_registered_parameter_is_understood(self, production_scope):
        """The registry is the contract, not documentation of one."""
        assert "role" in REGISTERED_PARAMETERS
        assert "institution_id" in REGISTERED_PARAMETERS
        assert "export" in REGISTERED_PARAMETERS
        for key in SORT_FIELDS:
            # Every sort key must be reachable through the registered ``sort``
            # parameter, and every ordering must end in a total tie-break.
            assert SORT_FIELDS[key][-1] == "id"


# ---------------------------------------------------------------------------
# 2. Facets over the whole filtered set, each dimension left open (R6.1)
# ---------------------------------------------------------------------------


@pytest.mark.tenant
@pytest.mark.django_db
class TestFacetsAreWholeSetAndOpen:
    def test_a_facet_offers_a_value_that_is_not_on_this_page(self, production_scope):
        root = _super_admin()
        for index in range(12):
            build_profile(role="student", suffix=f"facet-stu-{index}")
        build_profile(role="admin", suffix="facet-adm")

        data = _client_for(root).get(
            USERS_URL, {"pageSize": 2, "page": 1, "sort": "role", "order": "asc"}
        ).json()["data"]
        page_roles = {row["role"] for row in data["results"]}
        facet_roles = {
            option["value"] for option in data["facets"]["role"]["options"]
        }
        assert "admin" in facet_roles
        assert facet_roles - page_roles, "the facet offers nothing the page does not"

    def test_a_narrowed_query_still_offers_the_other_values(self, production_scope):
        root = _super_admin()
        build_profile(role="admin", suffix="open-adm")
        build_profile(role="reviewer", suffix="open-rev")

        data = _client_for(root).get(USERS_URL, {"role": "admin"}).json()["data"]
        assert data["filters"]["role"] == ["admin"]
        facet_roles = {
            option["value"] for option in data["facets"]["role"]["options"]
        }
        # Its own dimension is left open, so the operator can widen again.
        assert {"admin", "reviewer"} <= facet_roles

    def test_a_facet_count_is_a_sql_count_over_the_filtered_set(
        self, production_scope
    ):
        root = _super_admin()
        for index in range(4):
            build_profile(role="reviewer", suffix=f"fc-{index}")

        data = _client_for(root).get(USERS_URL, {"pageSize": 1}).json()["data"]
        counts = {
            option["value"]: option["count"]
            for option in data["facets"]["role"]["options"]
        }
        assert counts["reviewer"] == _sql_count(
            "role = 'reviewer' AND (is_active IS TRUE OR is_active IS NULL)", []
        )

    def test_every_open_dimension_names_a_real_filter_field(self, production_scope):
        from apps.accounts.user_directory_service import UserDirectoryFilters

        for fields in FACET_OPEN_DIMENSIONS.values():
            for name in fields:
                assert hasattr(UserDirectoryFilters(), name), name


# ---------------------------------------------------------------------------
# 3. The field + role contract (R6.2, ADM-03/AUTH-04)
# ---------------------------------------------------------------------------


@pytest.mark.tenant
@pytest.mark.django_db
class TestIgnoredFieldsAreRejected:
    def test_the_edit_forms_fields_are_all_implemented(self, production_scope):
        """R6.2: the form and the endpoint share one vocabulary.

        The edit form has always sent ``full_name``/``email``/``phone``/``role``.
        ``email`` and ``phone`` were not on the pre-9.3 serializer, so they were
        dropped inside a 200.
        """
        assert {"email", "phone", "first_name", "last_name", "role"} <= UPDATE_FIELDS
        assert {"email", "password", "role"} <= CREATE_FIELDS

    def test_an_update_actually_changes_email_and_phone(self, production_scope):
        root = _super_admin()
        target = build_profile(role="student", suffix="edit-me")

        response = _client_for(root).patch(
            f"{USERS_URL}{target.id}/",
            {
                "email": "corrected@example.com",
                "phone": "+260970000001",
                "first_name": "Corrected",
            },
            format="json",
        )
        assert response.status_code == 200, response.data
        target.refresh_from_db()
        assert target.email == "corrected@example.com"
        assert target.phone == "+260970000001"
        assert target.first_name == "Corrected"

    def test_an_unsupported_field_is_rejected_and_named(self, production_scope):
        root = _super_admin()
        target = build_profile(role="student", suffix="reject-me")
        before = target.first_name

        response = _client_for(root).patch(
            f"{USERS_URL}{target.id}/",
            {"first_name": "Changed", "nrc_number": "111111/11/1"},
            format="json",
        )
        assert response.status_code == 400
        assert response.data["code"] == "UNSUPPORTED_FIELD"
        assert "nrc_number" in response.data["data"]["unsupported_fields"]
        target.refresh_from_db()
        # Rejected means nothing was applied, not "the supported half landed".
        assert target.first_name == before

    def test_a_duplicate_email_is_a_conflict_not_a_silent_no_op(
        self, production_scope
    ):
        root = _super_admin()
        first = build_profile(role="student", suffix="dup-a")
        second = build_profile(role="student", suffix="dup-b")

        response = _client_for(root).patch(
            f"{USERS_URL}{second.id}/", {"email": first.email}, format="json"
        )
        assert response.status_code == 409
        assert response.data["code"] == "DUPLICATE_EMAIL"

    def test_the_supported_roles_are_the_platform_hierarchy(self, production_scope):
        from apps.accounts.permissions import ROLE_HIERARCHY

        assert set(SUPPORTED_ROLES) == set(ROLE_HIERARCHY)
        root = _super_admin()
        data = _client_for(root).get(USERS_URL).json()["data"]
        # Published, so the form reads the server's list instead of keeping its
        # own — the third disagreeing copy AUTH-04 describes.
        assert data["supported_roles"] == list(SUPPORTED_ROLES)

    def test_an_unsupported_role_is_rejected(self, production_scope):
        root = _super_admin()
        target = build_profile(role="student", suffix="badrole")
        response = _client_for(root).patch(
            f"{USERS_URL}{target.id}/", {"role": "superdev"}, format="json"
        )
        assert response.status_code == 400
        assert response.data["code"] == "VALIDATION_ERROR"
        assert "role" in response.data["details"]

    def test_a_create_rejects_an_unsupported_field(self, production_scope):
        root = _super_admin()
        response = _client_for(root).post(
            USERS_URL,
            {
                "email": "new@example.com",
                "password": "secret123",
                "first_name": "New",
                "last_name": "Person",
                "role": "student",
                "date_of_birth": "2000-01-01",
            },
            format="json",
        )
        assert response.status_code == 400
        assert response.data["code"] == "UNSUPPORTED_FIELD"
        assert not Profile.objects.filter(email="new@example.com").exists()


# ---------------------------------------------------------------------------
# 4. Authority: the role ceiling and self-deactivation (AUTH-04)
# ---------------------------------------------------------------------------


@pytest.mark.tenant
@pytest.mark.django_db
class TestRoleCeilingAndSelfDeactivation:
    """The three guarantees ``TestAdminUserDetailHardening`` used to mock.

    Those tests drove the view with ``@patch("…Profile.objects.get")`` and a
    ``SimpleNamespace`` target, which stopped working once the scoped fetch
    became part of the query rather than a comparison after it. The guarantees
    are the point, so they are asserted here against real rows.
    """

    def test_an_admin_cannot_promote_a_user_above_their_own_role(
        self, production_scope
    ):
        world_a, _ = build_two_tenant_worlds()
        actor = _manager_in(world_a, suffix="ceil-actor")
        target = _staff_in(world_a, role="student", suffix="ceil-target")

        response = _client_for(actor).patch(
            f"{USERS_URL}{target.id}/", {"role": "super_admin"}, format="json"
        )
        assert response.status_code == 403
        assert response.data["code"] == "PRIVILEGE_ESCALATION"
        target.refresh_from_db()
        assert target.role == "student"

    def test_an_admin_cannot_modify_an_account_above_their_own_role(
        self, production_scope
    ):
        world_a, _ = build_two_tenant_worlds()
        actor = _manager_in(world_a, suffix="mod-actor")
        target = _staff_in(world_a, role="super_admin", suffix="mod-root")

        response = _client_for(actor).patch(
            f"{USERS_URL}{target.id}/", {"first_name": "Changed"}, format="json"
        )
        assert response.status_code == 403
        assert response.data["code"] == "INSUFFICIENT_PRIVILEGES"
        target.refresh_from_db()
        assert target.first_name != "Changed"

    def test_an_actor_cannot_deactivate_their_own_account(self, production_scope):
        world_a, _ = build_two_tenant_worlds()
        actor = _manager_in(world_a, suffix="self-off")

        response = _client_for(actor).patch(
            f"{USERS_URL}{actor.id}/", {"is_active": False}, format="json"
        )
        assert response.status_code == 400
        assert response.data["code"] == "SELF_DEACTIVATION_FORBIDDEN"
        actor.refresh_from_db()
        assert actor.is_active is not False

    def test_the_ceiling_is_checked_before_the_scope_mask(self, production_scope):
        """A privilege escalation attempt is a 403, not a mask.

        Ordering matters and is deliberate: an actor asking to assign a role
        above their own is told they may not, because the refusal discloses
        nothing about any other tenant — the *role* is the problem, not the
        target. An out-of-scope target is still a masked 404.
        """
        world_a, world_b = build_two_tenant_worlds()
        actor = _manager_in(world_a, suffix="order-actor")
        stranger = _staff_in(world_b, role="student", suffix="order-stranger")

        escalation = _client_for(actor).patch(
            f"{USERS_URL}{stranger.id}/", {"role": "super_admin"}, format="json"
        )
        assert escalation.status_code == 403

        masked = _client_for(actor).patch(
            f"{USERS_URL}{stranger.id}/", {"first_name": "Changed"}, format="json"
        )
        assert masked.status_code == 404
        assert masked.data["code"] == "NOT_FOUND"


# ---------------------------------------------------------------------------
# 5. Scope precedes lookup (R6.1, tenant isolation)
# ---------------------------------------------------------------------------


@pytest.mark.tenant
@pytest.mark.django_db
class TestScopePrecedesLookup:
    def test_another_tenants_account_is_masked_exactly_like_an_unknown_one(
        self, production_scope
    ):
        world_a, world_b = build_two_tenant_worlds()
        actor = _staff_in(world_a, role="admin", suffix="mask-actor")
        stranger = _staff_in(world_b, role="reviewer", suffix="mask-stranger")

        client = _client_for(actor)
        other = client.get(f"{USERS_URL}{stranger.id}/")
        unknown = client.get(f"{USERS_URL}{uuid.uuid4()}/")

        assert other.status_code == unknown.status_code == 404
        assert other.json() == unknown.json()

    def test_another_tenants_accounts_never_reach_the_list(self, production_scope):
        world_a, world_b = build_two_tenant_worlds()
        actor = _staff_in(world_a, role="admin", suffix="list-actor")
        stranger = _staff_in(world_b, role="reviewer", suffix="list-stranger")

        data = _client_for(actor).get(USERS_URL, {"pageSize": 200}).json()["data"]
        ids = {row["id"] for row in data["results"]}
        assert str(stranger.id) not in ids
        assert str(actor.id) in ids
        # The count describes the actor's scope, not the table.
        assert data["totalCount"] == len(ids)

    def test_an_out_of_scope_institution_filter_is_masked_and_audited(
        self, production_scope
    ):
        world_a, world_b = build_two_tenant_worlds()
        actor = _staff_in(world_a, role="admin", suffix="inst-actor")

        client = _client_for(actor)
        other = client.get(USERS_URL, {"institution_id": str(world_b.institution.id)})
        unknown = client.get(USERS_URL, {"institution_id": str(uuid.uuid4())})

        assert other.status_code == unknown.status_code == 404
        assert other.json() == unknown.json()

        probes = AuditLog.objects.filter(
            action="scope.denied", entity_type="user.institution"
        )
        assert probes.count() >= 2
        blob = str(list(probes.values_list("changes", flat=True)))
        # The probe is recorded without confirming what was probed.
        assert world_b.institution.name not in blob
        assert world_b.institution.code not in blob

    def test_the_platform_only_columns_are_withheld_from_a_tenant_actor(
        self, production_scope
    ):
        world_a, _ = build_two_tenant_worlds()
        actor = _staff_in(world_a, role="admin", suffix="redact-actor")

        data = _client_for(actor).get(USERS_URL).json()["data"]
        assert data["redaction"]["applied"] is True
        assert set(data["redaction"]["withheld_fields"]) == set(
            PLATFORM_ONLY_USER_FIELDS
        )
        for row in data["results"]:
            for column in PLATFORM_ONLY_USER_FIELDS:
                assert column not in row

        root_data = _client_for(_super_admin()).get(USERS_URL).json()["data"]
        assert root_data["redaction"]["applied"] is False
        assert root_data["redaction"]["withheld_fields"] == []

    def test_the_service_never_compares_a_role_string(self, production_scope):
        """Authority is a capability here, not a role comparison (AUTH-04).

        ``role_level`` is the platform's own hierarchy and is exempt: the
        *ceiling* is a hierarchy question by definition. What must not appear is
        an endpoint deciding scope or capability by testing a role string.
        """
        import inspect

        from apps.accounts import user_directory_service, user_directory_views

        for module in (user_directory_service, user_directory_views):
            source = inspect.getsource(module)
            for forbidden in (
                'role == "super_admin"',
                "role == 'super_admin'",
                'role in ("admin"',
                '.role == "admin"',
            ):
                assert forbidden not in source, (module.__name__, forbidden)


# ---------------------------------------------------------------------------
# 6. Import: previewed, tenant-bound, atomic, idempotent, row errors (R6.4)
# ---------------------------------------------------------------------------


def _rows(*specs):
    return [dict(spec) for spec in specs]


@pytest.mark.tenant
@pytest.mark.django_db
class TestImportIsPreviewedTenantBoundAtomic:
    def test_the_preview_writes_nothing_and_says_what_would_happen(
        self, production_scope
    ):
        root = _super_admin()
        world_a, _ = build_two_tenant_worlds()
        before = Profile.objects.count()

        response = _client_for(root).post(
            PREVIEW_URL,
            {
                "institution_id": str(world_a.institution.id),
                "mode": IMPORT_MODE_ALL_OR_NOTHING,
                "rows": _rows(
                    {"email": "ok@example.com", "full_name": "Ok Person", "role": "student"},
                    {"email": "bad@example.com", "full_name": "Bad Role", "role": "superdev"},
                ),
            },
            format="json",
        )
        assert response.status_code == 200, response.data
        data = response.data["data"]
        assert data["valid_count"] == 1
        assert data["error_count"] == 1
        # The whole point: the operator learns the batch will not commit before
        # committing it.
        assert data["would_commit"] is False
        assert data["errors"][0]["code"] == ERROR_UNSUPPORTED_ROLE
        assert data["errors"][0]["index"] == 2
        assert Profile.objects.count() == before

        previews = AuditLog.objects.filter(action=ACTION_USER_IMPORT_PREVIEWED)
        assert previews.exists()

    def test_one_bad_row_rolls_the_whole_batch_back(self, production_scope):
        root = _super_admin()
        world_a, _ = build_two_tenant_worlds()
        before = Profile.objects.count()
        memberships_before = UserInstitutionMembership.objects.count()

        response = _client_for(root).post(
            IMPORT_URL,
            {
                "institution_id": str(world_a.institution.id),
                "mode": IMPORT_MODE_ALL_OR_NOTHING,
                "rows": _rows(
                    {"email": "keep1@example.com", "full_name": "Keep One", "role": "student"},
                    {"email": "keep2@example.com", "full_name": "Keep Two", "role": "student"},
                    {"email": "nope@example.com", "full_name": "No Role", "role": ""},
                ),
            },
            format="json",
        )
        assert response.status_code == 200, response.data
        data = response.data["data"]
        assert data["committed"] is False
        # Not "how far it got" — the pre-9.3 response reported a partial count.
        assert data["created"] == 0
        assert data["rolled_back_reason"] == "INVALID_ROWS"
        assert data["errors"][0]["code"] == ERROR_MISSING_FIELD
        assert Profile.objects.count() == before
        assert UserInstitutionMembership.objects.count() == memberships_before
        assert not Profile.objects.filter(email="keep1@example.com").exists()

    def test_per_row_mode_keeps_the_rows_that_worked(self, production_scope):
        root = _super_admin()
        world_a, _ = build_two_tenant_worlds()
        existing = build_profile(role="student", suffix="already-here")

        response = _client_for(root).post(
            IMPORT_URL,
            {
                "institution_id": str(world_a.institution.id),
                "mode": IMPORT_MODE_PER_ROW,
                "rows": _rows(
                    {"email": "fresh@example.com", "full_name": "Fresh One", "role": "student"},
                    {"email": existing.email, "full_name": "Clash", "role": "student"},
                ),
            },
            format="json",
        )
        assert response.status_code == 201, response.data
        data = response.data["data"]
        assert data["committed"] is True
        assert data["created"] == 1
        assert data["errors"][0]["code"] == ERROR_EMAIL_EXISTS
        assert Profile.objects.filter(email="fresh@example.com").exists()

    def test_every_created_account_is_bound_to_the_school(self, production_scope):
        root = _super_admin()
        world_a, _ = build_two_tenant_worlds()

        response = _client_for(root).post(
            IMPORT_URL,
            {
                "institution_id": str(world_a.institution.id),
                "rows": _rows(
                    {"email": "bound@example.com", "full_name": "Bound Staff", "role": "reviewer"},
                ),
            },
            format="json",
        )
        assert response.status_code == 201, response.data
        created = Profile.objects.get(email="bound@example.com")
        membership = UserInstitutionMembership.objects.get(
            user_id=created.id, institution_id=world_a.institution.id
        )
        # ADM-04: the pre-9.3 import produced a role string and no tenant scope.
        assert membership.is_active is True
        assert membership.role == "reviewer"

    def test_an_import_with_no_school_is_refused_with_an_actionable_code(
        self, production_scope
    ):
        root = _super_admin()
        response = _client_for(root).post(
            IMPORT_URL,
            {"rows": _rows({"email": "x@example.com", "full_name": "X Y", "role": "student"})},
            format="json",
        )
        assert response.status_code == 400
        assert response.data["code"] == "INSTITUTION_REQUIRED"
        assert not Profile.objects.filter(email="x@example.com").exists()

    def test_an_out_of_scope_school_is_masked(self, production_scope):
        world_a, world_b = build_two_tenant_worlds()
        actor = _manager_in(world_a, suffix="imp-actor")

        response = _client_for(actor).post(
            IMPORT_URL,
            {
                "institution_id": str(world_b.institution.id),
                "rows": _rows(
                    {"email": "cross@example.com", "full_name": "Cross Tenant", "role": "student"}
                ),
            },
            format="json",
        )
        assert response.status_code == 404
        assert response.data["code"] == "NOT_FOUND"
        assert not Profile.objects.filter(email="cross@example.com").exists()

    def test_a_role_above_the_actor_is_a_row_error_not_a_created_account(
        self, production_scope
    ):
        world_a, _ = build_two_tenant_worlds()
        # An admin holding tenant.staff.invite for their own school.
        actor = _manager_in(world_a, suffix="ceil-import")

        response = _client_for(actor).post(
            PREVIEW_URL,
            {
                "institution_id": str(world_a.institution.id),
                "rows": _rows(
                    {"email": "root2@example.com", "full_name": "Root Two", "role": "super_admin"},
                ),
            },
            format="json",
        )
        assert response.status_code == 200, response.data
        data = response.data["data"]
        assert data["valid_count"] == 0
        assert data["errors"][0]["code"] == ERROR_ROLE_ABOVE_ACTOR
        assert data["errors"][0]["index"] == 1

    def test_row_errors_address_the_operators_own_line_numbers(
        self, production_scope
    ):
        root = _super_admin()
        world_a, _ = build_two_tenant_worlds()

        response = _client_for(root).post(
            PREVIEW_URL,
            {
                "institution_id": str(world_a.institution.id),
                "rows": _rows(
                    {"email": "one@example.com", "full_name": "One", "role": "student"},
                    {"email": "one@example.com", "full_name": "Dup", "role": "student"},
                    {"email": "three@example.com", "full_name": "Three", "role": "student", "nrc": "x"},
                ),
            },
            format="json",
        )
        data = response.data["data"]
        codes = {error["index"]: error["code"] for error in data["errors"]}
        # 1-based and stable, so the operator can open the file and find it.
        assert codes[2] == ERROR_DUPLICATE_IN_BATCH
        assert codes[3] == ERROR_UNSUPPORTED_FIELD
        assert all(error["index"] is not None for error in data["errors"])

    def test_the_batch_is_audited_and_carries_no_address(self, production_scope):
        root = _super_admin()
        world_a, _ = build_two_tenant_worlds()

        _client_for(root).post(
            IMPORT_URL,
            {
                "institution_id": str(world_a.institution.id),
                "rows": _rows(
                    {"email": "audited@example.com", "full_name": "Audited One", "role": "student"}
                ),
            },
            format="json",
        )
        row = AuditLog.objects.filter(action=ACTION_USER_BATCH_IMPORT).latest("created_at")
        changes = row.changes or {}
        assert changes["created_count"] == 1
        assert changes["committed"] is True
        assert changes["institution_id"] == str(world_a.institution.id)
        assert "audited@example.com" not in str(changes)
        assert changes["created_email_hashes"]

    def test_a_replay_with_the_same_idempotency_key_imports_once(
        self, production_scope
    ):
        root = _super_admin()
        world_a, _ = build_two_tenant_worlds()
        client = _client_for(root)
        body = {
            "institution_id": str(world_a.institution.id),
            "rows": _rows(
                {"email": "once@example.com", "full_name": "Only Once", "role": "student"}
            ),
        }

        first = client.post(
            IMPORT_URL, body, format="json", HTTP_IDEMPOTENCY_KEY="import-key-1"
        )
        second = client.post(
            IMPORT_URL, body, format="json", HTTP_IDEMPOTENCY_KEY="import-key-1"
        )

        assert first.status_code == 201, first.data
        assert second.status_code == 201
        assert Profile.objects.filter(email="once@example.com").count() == 1

    def test_a_replay_without_a_key_creates_nothing_extra(self, production_scope):
        """Fail closed rather than duplicate: a double-submit is safe either way."""
        root = _super_admin()
        world_a, _ = build_two_tenant_worlds()
        client = _client_for(root)
        body = {
            "institution_id": str(world_a.institution.id),
            "rows": _rows(
                {"email": "twice@example.com", "full_name": "Not Twice", "role": "student"}
            ),
        }

        assert client.post(IMPORT_URL, body, format="json").status_code == 201
        replay = client.post(IMPORT_URL, body, format="json")
        assert replay.status_code == 200
        assert replay.data["data"]["committed"] is False
        assert replay.data["data"]["errors"][0]["code"] == ERROR_EMAIL_EXISTS
        assert Profile.objects.filter(email="twice@example.com").count() == 1

    def test_an_oversized_batch_is_refused_before_anything_is_validated(
        self, production_scope
    ):
        from apps.accounts.user_directory_service import IMPORT_MAX_ROWS

        root = _super_admin()
        world_a, _ = build_two_tenant_worlds()
        rows = [
            {"email": f"bulk{index}@example.com", "full_name": f"P {index}", "role": "student"}
            for index in range(IMPORT_MAX_ROWS + 1)
        ]
        response = _client_for(root).post(
            IMPORT_URL,
            {"institution_id": str(world_a.institution.id), "rows": rows},
            format="json",
        )
        assert response.status_code == 400
        assert response.data["code"] == "BATCH_TOO_LARGE"
        assert response.data["data"]["row_limit"] == IMPORT_MAX_ROWS

    def test_an_unknown_mode_is_refused_rather_than_defaulted(self, production_scope):
        root = _super_admin()
        world_a, _ = build_two_tenant_worlds()
        response = _client_for(root).post(
            IMPORT_URL,
            {
                "institution_id": str(world_a.institution.id),
                "mode": "best_effort_maybe",
                "rows": _rows(
                    {"email": "mode@example.com", "full_name": "Mode X", "role": "student"}
                ),
            },
            format="json",
        )
        assert response.status_code == 400
        assert response.data["code"] == "INVALID_IMPORT_MODE"
        assert not Profile.objects.filter(email="mode@example.com").exists()

    def test_the_preview_and_the_commit_share_one_validator(self, production_scope):
        """No second code path for the commit to disagree with."""
        root = _super_admin()
        world_a, _ = build_two_tenant_worlds()
        body = {
            "institution_id": str(world_a.institution.id),
            "rows": _rows(
                {"email": "same@example.com", "full_name": "Same Rules", "role": "student"},
                {"email": "nope@example.com", "full_name": "Nope", "role": "wizard"},
            ),
        }
        client = _client_for(root)
        preview = client.post(PREVIEW_URL, body, format="json").data["data"]
        commit = client.post(IMPORT_URL, body, format="json").data["data"]

        assert preview["would_commit"] is False
        assert commit["committed"] is False
        assert [error["code"] for error in preview["errors"]] == [
            error["code"] for error in commit["errors"]
        ]
        assert [error["index"] for error in preview["errors"]] == [
            error["index"] for error in commit["errors"]
        ]

    def test_a_generated_password_is_never_echoed(self, production_scope):
        root = _super_admin()
        world_a, _ = build_two_tenant_worlds()
        response = _client_for(root).post(
            PREVIEW_URL,
            {
                "institution_id": str(world_a.institution.id),
                "rows": _rows(
                    {"email": "secret@example.com", "full_name": "Secret One", "role": "student"}
                ),
            },
            format="json",
        )
        row = response.data["data"]["rows"][0]
        assert row["password_supplied"] is False
        assert row["will_receive_generated_password"] is True
        assert "password" not in row


# ---------------------------------------------------------------------------
# 7. Bulk mutation as one command (R6.5, ADM-03)
# ---------------------------------------------------------------------------


@pytest.mark.tenant
@pytest.mark.django_db
class TestBulkIsOneServerCommand:
    def test_a_bulk_role_change_applies_in_one_command(self, production_scope):
        root = _super_admin()
        targets = [build_profile(role="student", suffix=f"bulk-{i}") for i in range(3)]
        ids = [str(profile.id) for profile in targets]

        response = _client_for(root).post(
            BULK_URL,
            {
                "operation": BULK_OP_SET_ROLE,
                "user_ids": ids,
                "role": "reviewer",
                "confirmation_token": confirmation_token_for(
                    BULK_OP_SET_ROLE, ids, "reviewer"
                ),
            },
            format="json",
        )
        assert response.status_code == 200, response.data
        data = response.data["data"]
        assert data["committed"] is True
        assert data["updated"] == 3
        for profile in targets:
            profile.refresh_from_db()
            assert profile.role == "reviewer"

    def test_a_wrong_confirmation_is_refused_server_side(self, production_scope):
        root = _super_admin()
        target = build_profile(role="student", suffix="bulk-token")
        ids = [str(target.id)]

        response = _client_for(root).post(
            BULK_URL,
            {
                "operation": BULK_OP_SET_ROLE,
                "user_ids": ids,
                "role": "reviewer",
                # A token computed for a *different* selection must not authorise
                # this one. Previously the check ran only in the browser.
                "confirmation_token": confirmation_token_for(
                    BULK_OP_SET_ROLE, [str(uuid.uuid4())], "reviewer"
                ),
            },
            format="json",
        )
        assert response.status_code == 400
        assert response.data["code"] == "INVALID_CONFIRMATION_TOKEN"
        target.refresh_from_db()
        assert target.role == "student"

    def test_one_refused_target_stops_the_whole_command(self, production_scope):
        world_a, world_b = build_two_tenant_worlds()
        actor = _manager_in(world_a, suffix="bulk-actor")
        mine = _staff_in(world_a, role="student", suffix="bulk-mine")
        stranger = _staff_in(world_b, role="student", suffix="bulk-stranger")
        ids = [str(mine.id), str(stranger.id)]

        response = _client_for(actor).post(
            BULK_URL,
            {
                "operation": BULK_OP_SET_ROLE,
                "user_ids": ids,
                "role": "reviewer",
                "confirmation_token": confirmation_token_for(
                    BULK_OP_SET_ROLE, ids, "reviewer"
                ),
            },
            format="json",
        )
        assert response.status_code == 200, response.data
        data = response.data["data"]
        assert data["committed"] is False
        assert data["updated"] == 0
        codes = {error["code"] for error in data["errors"]}
        assert codes == {"NOT_FOUND"}
        mine.refresh_from_db()
        # An authority change nobody can enumerate afterwards is worse than none.
        assert mine.role == "student"

    def test_the_command_refuses_a_role_above_the_actor(self, production_scope):
        world_a, _ = build_two_tenant_worlds()
        actor = _manager_in(world_a, suffix="bulk-ceiling")
        target = _staff_in(world_a, role="student", suffix="bulk-ceiling-t")
        ids = [str(target.id)]

        response = _client_for(actor).post(
            BULK_URL,
            {
                "operation": BULK_OP_SET_ROLE,
                "user_ids": ids,
                "role": "super_admin",
                "confirmation_token": confirmation_token_for(
                    BULK_OP_SET_ROLE, ids, "super_admin"
                ),
            },
            format="json",
        )
        assert response.status_code == 403
        assert response.data["code"] == "PRIVILEGE_ESCALATION"

    def test_self_deactivation_is_refused_in_bulk_too(self, production_scope):
        world_a, _ = build_two_tenant_worlds()
        actor = _manager_in(world_a, suffix="bulk-self")
        ids = [str(actor.id)]

        response = _client_for(actor).post(
            BULK_URL,
            {
                "operation": BULK_OP_DEACTIVATE,
                "user_ids": ids,
                "confirmation_token": confirmation_token_for(
                    BULK_OP_DEACTIVATE, ids, None
                ),
            },
            format="json",
        )
        data = response.data["data"]
        assert data["committed"] is False
        assert data["errors"][0]["code"] == "SELF_DEACTIVATION_FORBIDDEN"
        actor.refresh_from_db()
        assert actor.is_active is not False

    def test_the_command_is_size_bounded(self, production_scope):
        root = _super_admin()
        ids = [str(uuid.uuid4()) for _ in range(MAX_BULK_SIZE + 1)]
        response = _client_for(root).post(
            BULK_URL,
            {
                "operation": BULK_OP_DEACTIVATE,
                "user_ids": ids,
                "confirmation_token": confirmation_token_for(
                    BULK_OP_DEACTIVATE, ids, None
                ),
            },
            format="json",
        )
        assert response.status_code == 400
        assert response.data["code"] == "BATCH_SIZE_EXCEEDED"
        assert response.data["data"]["size_limit"] == MAX_BULK_SIZE

    def test_the_command_is_audited_without_pii(self, production_scope):
        root = _super_admin()
        target = build_profile(role="student", suffix="bulk-audit")
        ids = [str(target.id)]

        _client_for(root).post(
            BULK_URL,
            {
                "operation": BULK_OP_SET_ROLE,
                "user_ids": ids,
                "role": "reviewer",
                "confirmation_token": confirmation_token_for(
                    BULK_OP_SET_ROLE, ids, "reviewer"
                ),
            },
            format="json",
        )
        row = AuditLog.objects.filter(action="user_bulk_updated").latest("created_at")
        changes = row.changes or {}
        assert changes["operation"] == BULK_OP_SET_ROLE
        assert changes["updated_count"] == 1
        assert target.email not in str(changes)


# ---------------------------------------------------------------------------
# 8. Export: page-independent, capability-gated, bounded, audited (R6.5)
# ---------------------------------------------------------------------------


@pytest.mark.tenant
@pytest.mark.django_db
class TestExportIsPageIndependentAndAudited:
    def test_the_export_is_the_filtered_set_not_the_page(self, production_scope):
        root = _super_admin()
        for index in range(12):
            build_profile(role="student", suffix=f"exp-{index:02d}")

        client = _client_for(root)
        total = client.get(USERS_URL, {"pageSize": 3}).json()["data"]["totalCount"]
        response = client.get(EXPORT_URL, {"pageSize": 3, "page": 2})

        assert response.status_code == 200
        assert response["Content-Type"] == "text/csv"
        rows = _csv_rows(response)
        # ``page`` and ``pageSize`` cannot change what an export contains.
        assert len(rows) == total

    def test_the_export_honours_the_same_filters(self, production_scope):
        root = _super_admin()
        for index in range(4):
            build_profile(role="reviewer", suffix=f"expf-{index}")

        client = _client_for(root)
        listed = client.get(USERS_URL, {"role": "reviewer"}).json()["data"]
        rows = _csv_rows(client.get(EXPORT_URL, {"role": "reviewer"}))
        assert len(rows) == listed["totalCount"]
        assert {row["role"] for row in rows} == {"reviewer"}

    def test_the_export_needs_the_platforms_export_capability(self, production_scope):
        world_a, _ = build_two_tenant_worlds()
        # A membership with no explicit grant: the default tenant bundle is
        # read-only, so this actor may read the directory and not export it.
        reader = _staff_in(world_a, role="reviewer", suffix="exp-reader")

        client = _client_for(reader)
        listed = client.get(USERS_URL)
        assert listed.status_code == 200
        assert listed.json()["data"]["can_export"] is False

        refused = client.get(EXPORT_URL)
        assert refused.status_code == 403
        assert refused.data["code"] == "INSUFFICIENT_PERMISSIONS"
        assert AuditLog.objects.filter(
            action="auth.denied", entity_type="profiles"
        ).exists()

    def test_the_export_is_bounded_and_refuses_rather_than_truncates(
        self, production_scope, monkeypatch
    ):
        root = _super_admin()
        for index in range(4):
            build_profile(role="student", suffix=f"expl-{index}")

        monkeypatch.setattr(
            "apps.accounts.user_directory_service.EXPORT_ROW_LIMIT", 2
        )
        monkeypatch.setattr("apps.accounts.user_directory_views.EXPORT_ROW_LIMIT", 2)

        response = _client_for(root).get(EXPORT_URL)
        assert response.status_code == 400
        assert response.data["code"] == "EXPORT_TOO_LARGE"
        assert response.data["data"]["row_limit"] == 2
        assert response.data["data"]["row_count"] > 2

    def test_the_export_is_audited_with_counts_and_filters_but_no_rows(
        self, production_scope
    ):
        root = _super_admin()
        for index in range(3):
            build_profile(role="admin", suffix=f"expa-{index}")

        response = _client_for(root).get(EXPORT_URL, {"role": "admin"})
        rows = _csv_rows(response)

        row = AuditLog.objects.filter(action=ACTION_USER_EXPORTED).latest("created_at")
        changes = row.changes or {}
        assert changes["row_count"] == len(rows)
        assert changes["row_limit"] == EXPORT_ROW_LIMIT
        assert changes["page_independent"] is True
        assert changes["filters"]["role"] == ["admin"]
        # The decision is recorded; the data is not.
        for exported in rows:
            assert exported["email"] not in str(changes)
        assert row.retention_category == "security"

    def test_the_same_export_is_reachable_from_the_list_route(self, production_scope):
        root = _super_admin()
        build_profile(role="student", suffix="expalias")
        client = _client_for(root)
        via_query = client.get(USERS_URL, {"export": "csv"})
        via_route = client.get(EXPORT_URL)
        assert via_query.status_code == via_route.status_code == 200
        assert _csv_rows(via_query) == _csv_rows(via_route)

    def test_a_tenant_export_withholds_the_platform_columns(self, production_scope):
        world_a, _ = build_two_tenant_worlds()
        actor = _staff_in(
            world_a, role="admin", suffix="exp-tenant", permissions=["export"]
        )

        response = _client_for(actor).get(EXPORT_URL)
        assert response.status_code == 200, getattr(response, "data", None)
        header = response.content.decode("utf-8").splitlines()[0]
        for column in PLATFORM_ONLY_USER_FIELDS:
            assert column not in header

    def test_the_export_capability_is_the_platforms_existing_one(
        self, production_scope
    ):
        """No capability was invented by this task."""
        from apps.catalog.services import AdminCapabilityService

        assert USER_EXPORT_CAPABILITY in AdminCapabilityService.TENANT_CAPABILITIES
        assert len(AdminCapabilityService.PLATFORM_CAPABILITIES) == 17
        assert len(AdminCapabilityService.TENANT_CAPABILITIES) == 17


# ---------------------------------------------------------------------------
# 9. The service is the one authority
# ---------------------------------------------------------------------------


@pytest.mark.tenant
@pytest.mark.django_db
class TestTheServiceIsTheOneAuthority:
    def test_a_row_carries_one_display_name_computed_in_sql(self, production_scope):
        root = _super_admin()
        stored = build_profile(role="student", suffix="named", full_name="Stored Name")
        split = build_profile(
            role="student", suffix="split", first_name="First", last_name="Last"
        )
        Profile.objects.filter(pk=split.pk).update(full_name=None)

        rows = {
            row["id"]: row
            for row in _client_for(root)
            .get(USERS_URL, {"pageSize": 200})
            .json()["data"]["results"]
        }
        assert rows[str(stored.id)]["full_name"] == "Stored Name"
        assert rows[str(split.id)]["full_name"] == "First Last"

    def test_sorting_by_role_orders_by_authority_not_the_alphabet(
        self, production_scope
    ):
        root = _super_admin()
        build_profile(role="student", suffix="ord-stu")
        build_profile(role="admin", suffix="ord-adm")
        build_profile(role="reviewer", suffix="ord-rev")

        rows = (
            _client_for(root)
            .get(USERS_URL, {"sort": "role", "order": "asc", "pageSize": 200})
            .json()["data"]["results"]
        )
        seen = [row["role"] for row in rows]
        first_admin = seen.index("admin")
        first_student = seen.index("student")
        # ``admin`` before ``student`` is a fact about the platform. Sorted
        # alphabetically it would be the other way round.
        assert first_admin < first_student

    def test_a_null_is_active_is_treated_as_enabled(self, production_scope):
        """``profiles.is_active`` is nullable and NULL has always meant enabled.

        A NULL silently disappearing from the directory would be a new way for
        the page to under-report the population.
        """
        root = _super_admin()
        target = build_profile(role="student", suffix="nullactive")
        Profile.objects.filter(pk=target.pk).update(is_active=None)

        data = _client_for(root).get(USERS_URL, {"pageSize": 200}).json()["data"]
        ids = {row["id"] for row in data["results"]}
        assert str(target.id) in ids
        row = next(item for item in data["results"] if item["id"] == str(target.id))
        assert row["is_active"] is True

    def test_the_staff_without_membership_counter_names_the_adm_04_population(
        self, production_scope
    ):
        root = _super_admin()
        world_a, _ = build_two_tenant_worlds()
        orphan = build_profile(role="admin", suffix="orphan-staff")
        bound = _staff_in(world_a, role="admin", suffix="bound-staff")

        data = _client_for(root).get(USERS_URL, {"pageSize": 200}).json()["data"]
        aggregates = data["aggregates"]
        rows = {row["id"]: row for row in data["results"]}
        assert rows[str(orphan.id)]["has_active_membership"] is False
        assert rows[str(bound.id)]["has_active_membership"] is True
        assert aggregates["staff_without_membership_count"] >= 1
        definition = data["aggregate_definitions"]["staff_without_membership_count"]
        assert "no tenant access" in definition

    def test_the_envelope_and_pagination_shape_are_preserved(self, production_scope):
        root = _super_admin()
        payload = _client_for(root).get(USERS_URL).json()
        assert payload["success"] is True
        for key in ("page", "pageSize", "totalCount", "results"):
            assert key in payload["data"]

    def test_a_row_column_set_is_shared_by_json_and_csv(self, production_scope):
        root = _super_admin()
        build_profile(role="student", suffix="colshare")
        client = _client_for(root)
        row = client.get(USERS_URL).json()["data"]["results"][0]
        header = client.get(EXPORT_URL).content.decode("utf-8").splitlines()[0]
        assert set(row) == set(header.split(","))
        assert set(row) == set(UserDirectoryQueryService.ROW_COLUMNS)
