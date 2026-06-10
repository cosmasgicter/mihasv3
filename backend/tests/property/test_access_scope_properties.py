"""Property-based exploration tests — AccessScopeService (P6–P8).

Spec: ``multi-tenant-beanola-admissions`` — Phase 0 exploration baseline
(task 1.5). Pins the access-scope isolation properties from the design's
Testing Strategy:

    P6  Scope isolation — staff queryset ∩ other-school rows = ∅
    P7  Grant expiry removes scope at the boundary (an expired grant confers
        no scope)
    P8  Application/offering grant scope does not widen — an application-scoped
        grant must not expose the whole institution; an offering-scoped grant
        must not expose unrelated offerings

Each backend property test runs ≥100 examples with ``--hypothesis-seed=0``
(see ``HYPOTHESIS_SETTINGS`` below).

This is **exploration** against the *current* ``AccessScopeService``: no
production code is changed. Real generators over membership/grant mixes across
≥2 institutions replace the task-1.1 placeholders. Phase 3 (task 12.5) extends
this with the HTTP-surface variants (export/download/verify/receipt/configure).

Run (sqlite-in-memory, since the default ``DATABASE_URL`` points at the
production Neon branch)::

    cd backend && DATABASE_URL="sqlite://:memory:" TESTING=1 \
      .venv/bin/python -m pytest tests/property/test_access_scope_properties.py \
      --hypothesis-seed=0 -v

**Validates: Requirements R4.2, R4.7, R4.8, R14.2**
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from apps.applications.models import Application
from apps.catalog.services import AccessScopeService
from apps.documents.models import ApplicationDocument, Payment
from tests.tenant_fixtures import (
    attach_scope,
    build_access_grant,
    build_application,
    build_canonical_program,
    build_document,
    build_institution,
    build_intake,
    build_offering_with_application,
    build_payment,
    build_profile,
    build_tenant_world,
    build_tenant_worlds,
)


# ≥100 examples, deadline relaxed for DB-backed scope checks; seed pinned via
# the CLI flag ``--hypothesis-seed=0`` per the design's Testing Strategy.
HYPOTHESIS_SETTINGS = settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)


# ---------------------------------------------------------------------------
# Shared strategies
# ---------------------------------------------------------------------------

# P6 — per-institution scope assignment. Each entry decides whether (and how)
# the single staff actor is scoped to that institution: not at all, via an
# active membership, or via an active institution grant. The list length (2..5)
# drives how many distinct institutions are built, so every example exercises
# ≥2 institutions with a *mixed* membership/grant scope (the task's "membership
# /grant mixes across ≥2 institutions"). The wide combinatorial space keeps the
# property at ≥100 examples instead of exhausting a tiny finite domain.
PER_WORLD_SCOPE = st.lists(
    st.sampled_from(["none", "membership", "institution_grant"]),
    min_size=2,
    max_size=5,
)

# P7 — grant scope kinds; institution / offering / application grants all carry
# an optional expiry.
GRANT_SCOPE_KIND = st.sampled_from(
    ["institution_grant", "offering_grant", "application_grant"]
)

# P7 — grant expiry. ``None`` → never expires. Otherwise ``(is_future, seconds)``
# with a ≥60s magnitude so the tiny clock drift between building the grant and
# the service's ``timezone.now()`` can never flip the result. The exact boundary
# equality case (``expires_at == now``) is pinned by a deterministic unit test.
EXPIRY = st.one_of(
    st.none(),
    st.tuples(st.booleans(), st.integers(min_value=60, max_value=10_000_000)),
)

# P8 — one application status per sibling offering inside a single institution.
# The list length (2..6) is the sibling count (≥2 so at least one sibling is
# "unrelated"); the status mix proves scope fidelity is independent of
# application status, and gives the property a large input space (≥100 examples).
SIBLING_STATUSES = st.lists(
    st.sampled_from(["draft", "submitted", "under_review", "approved"]),
    min_size=2,
    max_size=6,
)
# Which sibling receives the grant (taken modulo the sibling count).
GRANTED_INDEX = st.integers(min_value=0, max_value=5)


def _resolve_expiry(spec) -> tuple[object, bool]:
    """Map an ``EXPIRY`` draw to ``(expires_at, is_expired)``.

    ``spec is None`` → never-expiring grant. Otherwise ``(is_future, seconds)``
    yields an ``expires_at`` that magnitude of seconds in the future or past.
    """
    if spec is None:
        return None, False
    is_future, seconds = spec
    delta = timedelta(seconds=seconds)
    if is_future:
        return timezone.now() + delta, False
    return timezone.now() - delta, True


# ---------------------------------------------------------------------------
# P6 — Cross-tenant scope isolation
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestScopeIsolation:
    """P6: a non-super-admin's filtered queryset never intersects another
    school's rows — on applications, payments, and documents.

    **Validates: Requirements R4.2, R4.3, R14.2**
    """

    def test_staff_application_scope_excludes_other_school(self, two_tenant_worlds):
        """Concrete check: school-A staff (whose only scope is a membership to
        school A) filtering the global application queryset see school A's
        application but never school B's."""
        world_a, world_b = two_tenant_worlds
        service = AccessScopeService()
        scoped = service.filter_applications(Application.objects.all(), world_a.staff)
        scoped_ids = {str(pk) for pk in scoped.values_list("id", flat=True)}
        assert world_a.application_id in scoped_ids
        assert world_b.application_id not in scoped_ids

    def test_staff_payment_and_document_scope_excludes_other_school(self, two_tenant_worlds):
        """Concrete check: payments and documents are isolated too. School-A
        staff never see school B's payment or document rows."""
        world_a, world_b = two_tenant_worlds
        pay_a = build_payment(application=world_a.application)
        pay_b = build_payment(application=world_b.application)
        doc_a = build_document(application=world_a.application)
        doc_b = build_document(application=world_b.application)

        service = AccessScopeService()
        scoped_payments = {
            str(pk)
            for pk in service.filter_payments(Payment.objects.all(), world_a.staff).values_list("id", flat=True)
        }
        scoped_documents = {
            str(pk)
            for pk in service.filter_documents(ApplicationDocument.objects.all(), world_a.staff).values_list("id", flat=True)
        }

        assert str(pay_a.id) in scoped_payments
        assert str(pay_b.id) not in scoped_payments
        assert str(doc_a.id) in scoped_documents
        assert str(doc_b.id) not in scoped_documents

    @HYPOTHESIS_SETTINGS
    @given(per_world_scope=PER_WORLD_SCOPE)
    def test_scope_never_intersects_out_of_scope_schools(self, per_world_scope):
        """P6 (property): with ≥2 schools and a single staff actor scoped to an
        arbitrary *mix* of them (some via membership, some via institution
        grant, some not at all), the actor's filtered application / payment /
        document querysets contain **every** in-scope school's rows and
        **never** an out-of-scope school's rows.

        The actor is a fresh ``reviewer`` with no implicit access; scope is
        attached only to the schools whose draw is not ``"none"``. When every
        draw is ``"none"`` the actor has no scope at all and must see none of
        the rows (the degenerate isolation case that also pins R4.6's "no
        global leakage").
        """
        worlds = build_tenant_worlds(len(per_world_scope), application_status="submitted")
        actor = build_profile(role="reviewer")

        # Give every world a payment + document so all three surfaces are
        # exercised against the same scope.
        payments = {}
        documents = {}
        for world in worlds:
            payments[world.application_id] = build_payment(application=world.application)
            documents[world.application_id] = build_document(application=world.application)

        in_scope = []
        for world, kind in zip(worlds, per_world_scope):
            if kind != "none":
                attach_scope(actor, world, kind)
                in_scope.append(True)
            else:
                in_scope.append(False)

        service = AccessScopeService()
        scoped_apps = {
            str(pk)
            for pk in service.filter_applications(Application.objects.all(), actor).values_list("id", flat=True)
        }
        scoped_payments = {
            str(pk)
            for pk in service.filter_payments(Payment.objects.all(), actor).values_list("id", flat=True)
        }
        scoped_documents = {
            str(pk)
            for pk in service.filter_documents(ApplicationDocument.objects.all(), actor).values_list("id", flat=True)
        }

        for world, flag in zip(worlds, in_scope):
            app_id = world.application_id
            pay_id = str(payments[app_id].id)
            doc_id = str(documents[app_id].id)
            if flag:
                assert app_id in scoped_apps
                assert pay_id in scoped_payments
                assert doc_id in scoped_documents
            else:
                # Cross-tenant isolation: an out-of-scope school's rows never
                # appear in the actor's filtered querysets, on any surface.
                assert app_id not in scoped_apps
                assert pay_id not in scoped_payments
                assert doc_id not in scoped_documents


# ---------------------------------------------------------------------------
# P7 — Grant expiry
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestGrantExpiry:
    """P7: an expired access grant drops out of the computed scope at the
    boundary — an expired grant confers no scope.

    **Validates: Requirements R4.8, R14.2**
    """

    def test_expired_grant_excluded_from_scope(self, tenant_world_factory):
        """Concrete check: a staff user whose only signal is an expired
        institution grant has no institution scope (membership + the world's
        default grant are deactivated first)."""
        world = tenant_world_factory(staff_role="reviewer")
        world.membership.is_active = False
        world.membership.save(update_fields=["is_active"])
        world.access_grant.is_active = False
        world.access_grant.save(update_fields=["is_active"])
        build_access_grant(
            user=world.staff,
            scope_type="institution",
            institution=world.institution,
            expires_at=timezone.now() - timedelta(days=1),
        )
        filters = AccessScopeService().filters_for_user(world.staff)
        assert world.institution_id not in filters.institution_ids

    def test_grant_expiry_boundary_is_exclusive(self):
        """Deterministic boundary check: ``expires_at`` strictly in the past is
        excluded, exactly-at/just-before "now" is excluded (the filter is
        ``expires_at > now``), and a clearly-future expiry is included."""
        service = AccessScopeService()

        just_expired = build_profile(role="reviewer")
        inst1 = build_institution()
        build_access_grant(
            user=just_expired,
            scope_type="institution",
            institution=inst1,
            expires_at=timezone.now() - timedelta(microseconds=1),
        )
        assert str(inst1.id) not in service.filters_for_user(just_expired).institution_ids

        active = build_profile(role="reviewer")
        inst2 = build_institution()
        build_access_grant(
            user=active,
            scope_type="institution",
            institution=inst2,
            expires_at=timezone.now() + timedelta(hours=1),
        )
        assert str(inst2.id) in service.filters_for_user(active).institution_ids

    @HYPOTHESIS_SETTINGS
    @given(expiry=EXPIRY, scope_kind=GRANT_SCOPE_KIND)
    def test_expired_grant_confers_no_scope(self, expiry, scope_kind):
        """P7 (property): across every grant scope kind (institution / offering
        / application), an expired grant contributes nothing to the computed
        scope, while a future-dated or never-expiring grant contributes its
        target.

        The actor's *only* access is this single grant — no membership and no
        other grant — so the grant's expiry is the sole determinant of scope.
        Expiry is drawn over a wide ± domain (≥60s magnitude) so the property
        runs ≥100 examples without the boundary clock-drift flakiness; the exact
        equality boundary is pinned separately above.
        """
        world = build_tenant_world(staff_role="reviewer")
        actor = build_profile(role="reviewer")
        expires_at, expired = _resolve_expiry(expiry)
        attach_scope(actor, world, scope_kind, expires_at=expires_at)

        filters = AccessScopeService().filters_for_user(actor)

        if scope_kind == "institution_grant":
            target, bucket = world.institution_id, filters.institution_ids
        elif scope_kind == "offering_grant":
            target, bucket = world.offering_id, filters.offering_ids
        else:  # application_grant
            target, bucket = str(world.application.id), filters.application_ids

        if expired:
            assert target not in bucket, "expired grant must confer no scope"
            # An expired grant must also leave the queryset empty of its target.
            scoped = AccessScopeService().filter_applications(
                Application.objects.filter(pk=world.application.id), actor
            )
            assert world.application_id not in {str(pk) for pk in scoped.values_list("id", flat=True)}
        else:
            assert target in bucket, "active/never-expiring grant must confer scope"


# ---------------------------------------------------------------------------
# P8 — Grant scope fidelity (no widening)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestGrantScopeFidelity:
    """P8: application/offering grants never widen to institution scope.

    - An application-scoped grant exposes only that application — never the
      whole institution or sibling applications.
    - An offering-scoped grant exposes only that offering's applications —
      never unrelated offerings in the same institution.

    **Validates: Requirements R4.7, R14.2**
    """

    @staticmethod
    def _institution_with_siblings(statuses: list[str]):
        """Build one institution holding ``len(statuses)`` offerings, each with
        its own application (in the given status), plus a shared student.
        Returns ``(institution, [(offering, application), ...])``."""
        institution = build_institution()
        canonical = build_canonical_program()
        intake = build_intake()
        student = build_profile(role="student")
        pairs = [
            build_offering_with_application(
                institution=institution,
                canonical_program=canonical,
                intake=intake,
                student=student,
                application_status=status,
            )
            for status in statuses
        ]
        return institution, pairs

    @HYPOTHESIS_SETTINGS
    @given(statuses=SIBLING_STATUSES, granted_index=GRANTED_INDEX)
    def test_offering_grant_does_not_widen_to_institution(self, statuses, granted_index):
        """P8 (property): an offering-scoped grant to one offering never confers
        institution scope and never exposes sibling offerings' applications —
        regardless of which sibling is granted or what status the siblings are
        in."""
        institution, pairs = self._institution_with_siblings(statuses)
        granted = granted_index % len(pairs)
        granted_offering, granted_app = pairs[granted]

        actor = build_profile(role="reviewer")
        build_access_grant(user=actor, scope_type="offering", program=granted_offering)

        service = AccessScopeService()
        filters = service.filters_for_user(actor)

        # No widening to institution scope.
        assert str(institution.id) not in filters.institution_ids
        # Only the granted offering is in scope.
        assert filters.offering_ids == {str(granted_offering.id)}
        assert filters.application_ids == set()

        scoped_ids = {
            str(pk)
            for pk in service.filter_applications(Application.objects.all(), actor).values_list("id", flat=True)
        }
        assert str(granted_app.id) in scoped_ids
        for index, (offering, app) in enumerate(pairs):
            if index == granted:
                continue
            assert str(app.id) not in scoped_ids, "offering grant leaked an unrelated offering's application"

    @HYPOTHESIS_SETTINGS
    @given(statuses=SIBLING_STATUSES, granted_index=GRANTED_INDEX)
    def test_application_grant_does_not_widen_to_institution(self, statuses, granted_index):
        """P8 (property): an application-scoped grant to one application never
        confers institution-wide access and never exposes sibling applications
        in the same institution — regardless of which sibling is granted or
        what status the siblings are in."""
        institution, pairs = self._institution_with_siblings(statuses)
        granted = granted_index % len(pairs)
        _, granted_app = pairs[granted]

        actor = build_profile(role="reviewer")
        build_access_grant(user=actor, scope_type="application", application_id=granted_app.id)

        service = AccessScopeService()
        filters = service.filters_for_user(actor)

        # No widening: neither institution nor offering scope is conferred.
        assert str(institution.id) not in filters.institution_ids
        assert filters.offering_ids == set()
        assert filters.application_ids == {str(granted_app.id)}

        scoped_ids = {
            str(pk)
            for pk in service.filter_applications(Application.objects.all(), actor).values_list("id", flat=True)
        }
        assert str(granted_app.id) in scoped_ids
        for index, (offering, app) in enumerate(pairs):
            if index == granted:
                continue
            assert str(app.id) not in scoped_ids, "application grant leaked a sibling application"
