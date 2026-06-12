"""Tenant-aware communication-template scope + schema tests (task 29.2).

Spec: ``multi-tenant-beanola-remediation`` — Phase 7 (Tenant-Aware
Communication Templates), Requirement 14.

These tests guard the work shipped by tasks 27.1 (the additive migration
``2026_06_08_04_communication_templates_tenant.sql`` adding
``communication_templates.institution_id`` + ``version`` and the
``idx_comm_templates_tenant_lookup`` index), 28.2 (tenant-aware model fields),
and 29.1 (scoped template management in ``apps.common.template_views``).

Coverage:

  * **R14.2** — the tenant columns (``institution_id``, ``version``) are present
    on the ``communication_templates`` table/model, and the
    ``idx_comm_templates_tenant_lookup`` index is declared by the migration SQL
    (introspected directly on Postgres when the suite runs against Neon).
  * **R14.6** — list/update management is tenant-scoped: a super-admin manages
    any template; a School_Staff member manages only their assigned
    institution's templates and sees only those in the list.
  * **R14.9** — an out-of-scope School_Staff template update is rejected with a
    403 ``OUT_OF_SCOPE`` authorization error and **no mutation**; platform
    (``institution_id`` NULL) templates are super-admin-only (403 ``FORBIDDEN``
    for staff) with no mutation.

Scope is established through ``AccessScopeService`` (membership + grant) via the
``tenant_fixtures`` factory — never on the ``admin`` role alone.

**Validates: Requirements 14.2, 14.6, 14.9**
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path

import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.common.models import CommunicationTemplate
from tests.tenant_fixtures import build_profile, build_tenant_world

# Path to the migration that introduces the tenant columns + index.
_MIGRATION_SQL = (
    Path(__file__).resolve().parents[2]
    / "scripts"
    / "2026_06_08_04_communication_templates_tenant.sql"
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _client_for(profile) -> APIClient:
    """An APIClient authenticated as ``profile`` via a JWTUser (no DB session)."""
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


def _list_url() -> str:
    return "/api/v1/admin/templates/"


def _update_url(key: str, institution_id=None) -> str:
    base = f"/api/v1/admin/templates/{key}/"
    if institution_id is not None:
        return f"{base}?institution_id={institution_id}"
    return base


def _body(response):
    try:
        return response.json()
    except Exception:  # pragma: no cover - non-JSON body
        return getattr(response, "data", None)


def _make_template(*, key: str, institution_id=None, version: int = 1, **overrides):
    """Persist a ``communication_templates`` row (platform row when id is None)."""
    defaults = dict(
        id=uuid.uuid4(),
        template_key=key,
        institution_id=institution_id,
        version=version,
        subject_template="Original subject",
        body_template="Original body",
        channel="both",
        is_active=True,
    )
    defaults.update(overrides)
    return CommunicationTemplate.objects.create(**defaults)


# ---------------------------------------------------------------------------
# R14.2 — schema presence: tenant columns + lookup index
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestTenantSchemaPresence:
    """The tenant columns and lookup index from migration 27.1 are present.

    **Validates: Requirement 14.2**
    """

    def test_tenant_columns_present_on_table(self):
        """``institution_id`` and ``version`` exist as real DB columns."""
        columns = {
            col.name
            for col in connection.introspection.get_table_description(
                connection.cursor(), "communication_templates"
            )
        }
        assert "institution_id" in columns, columns
        assert "version" in columns, columns

    def test_model_round_trips_tenant_columns(self):
        """A row written with an institution + version reads back unchanged."""
        world = build_tenant_world()
        template = _make_template(
            key="application_submitted",
            institution_id=world.institution.id,
            version=3,
        )

        reloaded = CommunicationTemplate.objects.get(id=template.id)
        assert str(reloaded.institution_id) == str(world.institution.id)
        assert reloaded.version == 3

    def test_platform_row_allows_null_institution(self):
        """A platform template carries a NULL institution association."""
        template = _make_template(key="acceptance", institution_id=None, version=1)
        reloaded = CommunicationTemplate.objects.get(id=template.id)
        assert reloaded.institution_id is None
        assert reloaded.version == 1

    def test_migration_declares_tenant_lookup_index(self):
        """The migration SQL declares ``idx_comm_templates_tenant_lookup`` over
        (institution_id, template_key, is_active, version)."""
        assert _MIGRATION_SQL.exists(), _MIGRATION_SQL
        sql = _MIGRATION_SQL.read_text()

        # The index is declared idempotently against communication_templates.
        assert re.search(
            r"CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_comm_templates_tenant_lookup",
            sql,
            re.IGNORECASE,
        ), sql
        # It covers the tenant-aware lookup tuple.
        index_clause = sql[sql.lower().index("idx_comm_templates_tenant_lookup"):]
        for column in ("institution_id", "template_key", "is_active", "version"):
            assert column in index_clause, (column, index_clause[:400])

    def test_migration_adds_both_tenant_columns(self):
        """The migration adds ``institution_id`` and ``version`` additively."""
        sql = _MIGRATION_SQL.read_text().lower()
        assert "add column if not exists institution_id" in sql, sql
        assert "add column if not exists version" in sql, sql

    def test_tenant_lookup_index_present_on_postgres(self):
        """On Postgres (Neon), the lookup index physically exists.

        Skipped on the SQLite contract-test fallback, which has no migration to
        inspect (``pg_indexes`` is Postgres-only).
        """
        if connection.vendor != "postgresql":
            pytest.skip(
                f"pg_indexes is Postgres-only; backend is {connection.vendor!r}."
            )
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT indexname FROM pg_indexes "
                "WHERE schemaname = 'public' AND tablename = %s AND indexname = %s",
                ["communication_templates", "idx_comm_templates_tenant_lookup"],
            )
            row = cursor.fetchone()
        assert row is not None, (
            "idx_comm_templates_tenant_lookup is missing — apply "
            "2026_06_08_04_communication_templates_tenant.sql to the test DB."
        )


# ---------------------------------------------------------------------------
# R14.6 — list management is tenant-scoped
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestTemplateListScope:
    """GET /api/v1/admin/templates/ is tenant-scoped.

    **Validates: Requirement 14.6**
    """

    def test_super_admin_sees_all_templates(self):
        """A super-admin sees platform + every institution's templates."""
        world = build_tenant_world()
        _make_template(key="application_submitted", institution_id=world.institution.id)
        _make_template(key="application_submitted", institution_id=None)
        other_id = uuid.uuid4()
        _make_template(key="acceptance", institution_id=other_id)

        super_admin = build_profile(role="super_admin")
        response = _client_for(super_admin).get(_list_url())

        assert response.status_code == 200, _body(response)
        body = _body(response)
        assert body["success"] is True
        seen = {(t["template_key"], t["institution_id"]) for t in body["data"]}
        assert ("application_submitted", str(world.institution.id)) in seen
        assert ("application_submitted", None) in seen
        assert ("acceptance", str(other_id)) in seen

    def test_scoped_staff_sees_only_assigned_institution(self):
        """A School_Staff member sees only their assigned institution's templates
        — never platform or another school's rows."""
        world = build_tenant_world(staff_role="admin")
        mine = _make_template(
            key="application_submitted", institution_id=world.institution.id
        )
        other_id = uuid.uuid4()
        _make_template(key="application_submitted", institution_id=other_id)
        _make_template(key="application_submitted", institution_id=None)

        response = _client_for(world.staff).get(_list_url())

        assert response.status_code == 200, _body(response)
        body = _body(response)
        assert body["success"] is True
        returned_ids = {t["institution_id"] for t in body["data"]}
        assert returned_ids == {str(world.institution.id)}, returned_ids
        returned_template_ids = {t["id"] for t in body["data"]}
        assert str(mine.id) in returned_template_ids


# ---------------------------------------------------------------------------
# R14.6 / R14.9 — update management is tenant-scoped, no out-of-scope mutation
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestTemplateUpdateScope:
    """PUT /api/v1/admin/templates/{key}/ enforces tenant scope.

    **Validates: Requirements 14.6, 14.9**
    """

    def test_scoped_staff_can_update_assigned_institution_template(self):
        """R14.6: a School_Staff member updates a template for their assigned
        institution successfully."""
        world = build_tenant_world(staff_role="admin")
        template = _make_template(
            key="application_submitted", institution_id=world.institution.id
        )

        response = _client_for(world.staff).put(
            _update_url("application_submitted", world.institution.id),
            {"subject_template": "Updated by school admin"},
            format="json",
        )

        assert response.status_code == 200, _body(response)
        assert _body(response)["success"] is True
        template.refresh_from_db()
        assert template.subject_template == "Updated by school admin"

    def test_super_admin_can_update_any_institution_template(self):
        """R14.6: a super-admin updates any institution's template."""
        world = build_tenant_world()
        template = _make_template(
            key="acceptance", institution_id=world.institution.id
        )
        super_admin = build_profile(role="super_admin")

        response = _client_for(super_admin).put(
            _update_url("acceptance", world.institution.id),
            {"subject_template": "Updated by super admin"},
            format="json",
        )

        assert response.status_code == 200, _body(response)
        template.refresh_from_db()
        assert template.subject_template == "Updated by super admin"

    def test_super_admin_can_update_platform_template(self):
        """R14.6/R14.9: a super-admin may manage the Beanola platform template."""
        template = _make_template(key="acceptance", institution_id=None)
        super_admin = build_profile(role="super_admin")

        response = _client_for(super_admin).put(
            _update_url("acceptance", "platform"),
            {"subject_template": "Updated platform default"},
            format="json",
        )

        assert response.status_code == 200, _body(response)
        template.refresh_from_db()
        assert template.subject_template == "Updated platform default"

    def test_out_of_scope_staff_update_rejected_no_mutation(self):
        """R14.9: a School_Staff member updating another institution's template
        is rejected with 403 ``OUT_OF_SCOPE`` and the row is unchanged."""
        world = build_tenant_world(staff_role="admin")  # staff assigned here
        other_id = uuid.uuid4()
        template = _make_template(
            key="application_submitted",
            institution_id=other_id,
            subject_template="Untouched subject",
            body_template="Untouched body",
        )
        before = (template.subject_template, template.body_template, template.version)

        response = _client_for(world.staff).put(
            _update_url("application_submitted", other_id),
            {"subject_template": "Attempted cross-tenant edit"},
            format="json",
        )

        assert response.status_code == 403, _body(response)
        body = _body(response)
        assert body["success"] is False, body
        assert body["code"] == "OUT_OF_SCOPE", body

        # No mutation: the underlying row is byte-for-byte unchanged.
        template.refresh_from_db()
        assert (
            template.subject_template,
            template.body_template,
            template.version,
        ) == before

    def test_staff_cannot_manage_platform_template_no_mutation(self):
        """R14.9: a School_Staff member cannot manage a platform (NULL
        institution) template — rejected 403 ``FORBIDDEN`` with no mutation."""
        world = build_tenant_world(staff_role="admin")
        template = _make_template(
            key="acceptance",
            institution_id=None,
            subject_template="Platform subject",
        )
        before = template.subject_template

        response = _client_for(world.staff).put(
            _update_url("acceptance", "platform"),
            {"subject_template": "Attempted platform edit"},
            format="json",
        )

        assert response.status_code == 403, _body(response)
        body = _body(response)
        assert body["success"] is False, body
        assert body["code"] == "FORBIDDEN", body

        template.refresh_from_db()
        assert template.subject_template == before

    def test_out_of_scope_update_does_not_create_template(self):
        """R14.9: a rejected out-of-scope update for a key with no row creates
        nothing (scope is authorized before any lookup or write)."""
        world = build_tenant_world(staff_role="admin")
        other_id = uuid.uuid4()
        before_count = CommunicationTemplate.objects.count()

        response = _client_for(world.staff).put(
            _update_url("nonexistent_key", other_id),
            {"subject_template": "Should never persist"},
            format="json",
        )

        assert response.status_code == 403, _body(response)
        assert _body(response)["code"] == "OUT_OF_SCOPE"
        assert CommunicationTemplate.objects.count() == before_count
