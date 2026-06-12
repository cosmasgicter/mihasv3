"""Admin config validation correctness property test (task 23.1, test-first).

Spec: ``multi-tenant-beanola-remediation`` — Phase 6 (Admin config validation),
Requirements 11 (Admin Required-Document Validation) and 12 (Admin Access-Grant
Validation).

This module implements exactly one property — **Property 21** — against the two
real admin serializers that tasks 23.2 / 23.3 harden:

    apps.catalog.admin_serializers.AdminRequiredDocumentSerializer
    apps.catalog.admin_serializers.AdminAccessGrantSerializer

It is deliberately **test-first** for a *feature* spec (NOT a bugfix
bug-condition exploration): the property encodes the TARGET validation contract
described in design.md Component 6 / Property 21. Until 23.2 + 23.3 land, the
current serializers under-validate (they only check program↔institution
ownership for required documents and scope_type↔target-id presence for grants),
so several of the rejection cases below will be *accepted* and these assertions
will fail. That failure is the expected red state of test-first work — it is not
a defect to fix in this task.

Property 21 (design.md):

    For any required-document or access-grant create/update payload, the
    serializer accepts the payload **if and only if** all canonical-relationship
    and target rules hold (required-document: institution active, program active
    and owned by the institution, canonical active, program↔canonical match, no
    duplicate active scope; access-grant: scope_type valid, target
    exists/active/in-institution per scope, ``expires_at`` strictly future UTC,
    permission in the allowlist, no duplicate active ``(user, scope_type, target
    id)`` except self-update), and on rejection it returns a field-level error
    and creates or modifies no row.

**Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 12.1, 12.2, 12.3,
12.4, 12.5, 12.6, 12.7, 12.8**

Test harness notes:

* Existence failures (``*_not_exist``) reference a random UUID and the property
  asserts the serializer rejects them at ``is_valid`` time — so the test never
  attempts to ``save()`` a dangling foreign key (the tenant tables carry real
  FKs on Postgres). Rows are only inserted on the *valid* branch.
* Each example builds a fresh institution / program / canonical-program graph
  with unique IDs, so duplicate detection only ever observes the rows the
  example explicitly creates (the same isolation the sibling Phase-3/Phase-4
  property tests rely on).
* ``EXPECTED_PERMISSION_ALLOWLIST`` is the access-grant permission allowlist the
  property pins for R12.5. Task 23.3 MUST define an allowlist equal to (or a
  superset that still rejects the ``__not_a_permission__`` sentinel) this set in
  ``apps.catalog.admin_serializers``; the sentinel used below is guaranteed to
  be outside any sane allowlist.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from django.utils import timezone
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from apps.catalog.admin_serializers import (
    AdminAccessGrantSerializer,
    AdminRequiredDocumentSerializer,
)
from apps.catalog.models import AccessGrant, InstitutionRequiredDocument
from tests.tenant_fixtures import (
    build_application,
    build_canonical_program,
    build_institution,
    build_intake,
    build_offering,
    build_profile,
)

# ---------------------------------------------------------------------------
# Contract constants (the TARGET that 23.2 / 23.3 implement)
# ---------------------------------------------------------------------------

# The three scope_type values R12 / the API contract accept. Note the contract
# uses ``program_offering`` (the AccessScopeService internally calls the same
# concept "offering", but the serializer + R12.2 name it ``program_offering``).
VALID_GRANT_SCOPES = ("institution", "program_offering", "application")

# Access_Grant permission allowlist (R12.5). Task 23.3 pins the authoritative
# copy in the serializer; this is the property's oracle. ``__not_a_permission__``
# is the out-of-allowlist sentinel used to build rejection cases.
EXPECTED_PERMISSION_ALLOWLIST = frozenset(
    {"view", "review", "manage", "verify_documents", "verify_payments", "export"}
)
_BAD_PERMISSION = "__not_a_permission__"

_DOCUMENT_TYPE = "nrc"
_DOCUMENT_LABEL = "National Registration Card"

# Required-document failure modes. ``none`` is the single fully-valid case; every
# other mode violates exactly one R11 rule and MUST be rejected.
_REQUIRED_DOC_MODES = (
    "none",
    "institution_not_exist",
    "institution_inactive",
    "program_not_exist",
    "program_inactive",
    "program_wrong_institution",
    "canonical_not_exist",
    "canonical_inactive",
    "program_canonical_mismatch",
    "duplicate",
)

# Access-grant failure modes. The ``none_*`` modes are the valid cases (including
# a self-update); every other mode violates exactly one R12 rule.
_GRANT_VALID_MODES = (
    "none_institution",
    "none_program_offering",
    "none_application",
    "none_self_update",
)
_GRANT_FAILURE_MODES = (
    "scope_missing",
    "scope_invalid",
    "target_missing",
    "target_not_exist",
    "target_inactive",
    "institution_mismatch",
    "expired",
    "bad_permission",
    "duplicate",
)
_GRANT_MODES = _GRANT_VALID_MODES + _GRANT_FAILURE_MODES


# ≥100 examples; success pinned to ``--hypothesis-seed=0`` on the CLI. Each
# example builds a small tenant graph through a function-scoped ``django_db``
# transaction, so the per-example fixture + occasional slow build are exempted
# from the health checks — the same harness every Beanola property test uses.
_VALIDATION_PROPERTY_SETTINGS = settings(
    max_examples=25,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.data_too_large,
        HealthCheck.too_slow,
    ],
)


def _assert_field_level_error(serializer) -> None:
    """A rejected payload must expose a non-empty, field-keyed error map
    (R11.6 / R12.8 — the error identifies the offending field)."""
    errors = serializer.errors
    assert errors, "expected a validation error but serializer.errors was empty"
    assert isinstance(errors, dict), f"expected field-level error dict, got {type(errors)!r}"


@pytest.mark.django_db
class TestAdminValidationCorrectnessProperty:
    # Feature: multi-tenant-beanola-remediation, Property 21: Required-document and access-grant validation correctness — accept iff all canonical-relationship/target rules hold; on rejection a field-level error and no row created/modified.
    """Property 21: Required-document and access-grant validation correctness.

    For any required-document or access-grant create/update payload, the
    serializer accepts it iff every canonical-relationship/target rule holds, and
    on rejection it returns a field-level error and creates or modifies no row.

    **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 12.1, 12.2,
    12.3, 12.4, 12.5, 12.6, 12.7, 12.8**
    """

    # -- Required documents (R11) -----------------------------------------

    @_VALIDATION_PROPERTY_SETTINGS
    @given(mode=st.sampled_from(_REQUIRED_DOC_MODES))
    def test_required_document_validation_accepts_iff_rules_hold(self, mode):
        now = timezone.now()
        before = InstitutionRequiredDocument.objects.count()

        # Default payload scaffolding — overridden per failure mode below.
        payload: dict = {"document_type": _DOCUMENT_TYPE, "label": _DOCUMENT_LABEL}
        precreate_duplicate = False

        if mode == "institution_not_exist":
            payload["institution_id"] = str(uuid.uuid4())
        elif mode == "institution_inactive":
            inst = build_institution(is_active=False)
            payload["institution_id"] = str(inst.id)
        elif mode == "program_not_exist":
            inst = build_institution(is_active=True)
            payload["institution_id"] = str(inst.id)
            payload["program_id"] = str(uuid.uuid4())
        elif mode == "program_inactive":
            inst = build_institution(is_active=True)
            canonical = build_canonical_program(is_active=True)
            program = build_offering(institution=inst, canonical_program=canonical, is_active=False)
            payload["institution_id"] = str(inst.id)
            payload["program_id"] = str(program.id)
        elif mode == "program_wrong_institution":
            inst = build_institution(is_active=True)
            other = build_institution(is_active=True)
            canonical = build_canonical_program(is_active=True)
            program = build_offering(institution=other, canonical_program=canonical, is_active=True)
            payload["institution_id"] = str(inst.id)
            payload["program_id"] = str(program.id)
        elif mode == "canonical_not_exist":
            inst = build_institution(is_active=True)
            payload["institution_id"] = str(inst.id)
            payload["canonical_program_id"] = str(uuid.uuid4())
        elif mode == "canonical_inactive":
            inst = build_institution(is_active=True)
            canonical = build_canonical_program(is_active=False)
            payload["institution_id"] = str(inst.id)
            payload["canonical_program_id"] = str(canonical.id)
        elif mode == "program_canonical_mismatch":
            inst = build_institution(is_active=True)
            canonical_a = build_canonical_program(is_active=True)
            canonical_b = build_canonical_program(is_active=True)
            program = build_offering(institution=inst, canonical_program=canonical_a, is_active=True)
            payload["institution_id"] = str(inst.id)
            payload["program_id"] = str(program.id)
            payload["canonical_program_id"] = str(canonical_b.id)
        else:
            # ``none`` (fully valid, both scope columns set + matching) and
            # ``duplicate`` (same fully-valid scope, but a dup active row exists).
            inst = build_institution(is_active=True)
            canonical = build_canonical_program(is_active=True)
            program = build_offering(institution=inst, canonical_program=canonical, is_active=True)
            payload["institution_id"] = str(inst.id)
            payload["program_id"] = str(program.id)
            payload["canonical_program_id"] = str(canonical.id)
            if mode == "duplicate":
                precreate_duplicate = True
                InstitutionRequiredDocument.objects.create(
                    id=uuid.uuid4(),
                    institution_id=inst.id,
                    program_id=program.id,
                    canonical_program_id=canonical.id,
                    document_type=_DOCUMENT_TYPE,
                    label=_DOCUMENT_LABEL,
                    is_required=True,
                    is_active=True,
                    created_at=now,
                )

        expected_valid = mode == "none"

        baseline = InstitutionRequiredDocument.objects.count()
        serializer = AdminRequiredDocumentSerializer(data=payload)
        is_valid = serializer.is_valid()

        assert is_valid is expected_valid, {
            "mode": mode,
            "expected_valid": expected_valid,
            "got_valid": is_valid,
            "errors": serializer.errors,
            "payload": payload,
        }

        if expected_valid:
            serializer.save()
            assert InstitutionRequiredDocument.objects.count() == baseline + 1, {
                "mode": mode,
                "expected_created": True,
            }
        else:
            _assert_field_level_error(serializer)
            # No row created or modified by a rejected payload (R11.6). The only
            # pre-existing row is the deliberate duplicate decoy, if any.
            assert InstitutionRequiredDocument.objects.count() == baseline, {
                "mode": mode,
                "precreate_duplicate": precreate_duplicate,
            }

        # Sanity: the only net change to the global table across this example is
        # the (optional) duplicate decoy plus a single valid insert.
        delta = InstitutionRequiredDocument.objects.count() - before
        assert delta == (1 if expected_valid else 0) + (1 if precreate_duplicate else 0)

    # -- Access grants (R12) ----------------------------------------------

    @_VALIDATION_PROPERTY_SETTINGS
    @given(
        mode=st.sampled_from(_GRANT_MODES),
        generic_scope=st.sampled_from(VALID_GRANT_SCOPES),
        include_future_expiry=st.booleans(),
        include_matching_institution=st.booleans(),
        valid_permissions=st.lists(
            st.sampled_from(sorted(EXPECTED_PERMISSION_ALLOWLIST)), max_size=3, unique=True
        ),
    )
    def test_access_grant_validation_accepts_iff_rules_hold(
        self,
        mode,
        generic_scope,
        include_future_expiry,
        include_matching_institution,
        valid_permissions,
    ):
        now = timezone.now()
        actor = build_profile(role="super_admin")
        grantee = build_profile(role="reviewer")
        before = AccessGrant.objects.count()

        payload: dict = {"user_id": str(grantee.id), "permissions": list(valid_permissions)}
        instance = None  # set only for the self-update case
        precreate_rows = 0

        def _future_expiry():
            return (now + timedelta(days=7)).isoformat()

        if mode == "scope_missing":
            # No scope_type at all (R12.7).
            pass
        elif mode == "scope_invalid":
            payload["scope_type"] = "definitely_not_a_scope"
        elif mode == "target_missing":
            # Valid scope but the required target id is absent (R12.1/2/3).
            payload["scope_type"] = generic_scope
        elif mode == "target_not_exist":
            payload["scope_type"] = generic_scope
            if generic_scope == "institution":
                payload["institution_id"] = str(uuid.uuid4())
            elif generic_scope == "program_offering":
                payload["program_id"] = str(uuid.uuid4())
            else:
                payload["application_id"] = str(uuid.uuid4())
        elif mode == "target_inactive":
            # Only institution / program_offering carry an active flag.
            scope = "institution" if generic_scope == "application" else generic_scope
            payload["scope_type"] = scope
            if scope == "institution":
                inst = build_institution(is_active=False)
                payload["institution_id"] = str(inst.id)
            else:
                inst = build_institution(is_active=True)
                canonical = build_canonical_program(is_active=True)
                program = build_offering(
                    institution=inst, canonical_program=canonical, is_active=False
                )
                payload["program_id"] = str(program.id)
        elif mode == "institution_mismatch":
            # program_offering grant whose supplied institution_id does not own
            # the referenced program (R12.2 cross-institution mismatch).
            owner = build_institution(is_active=True)
            other = build_institution(is_active=True)
            canonical = build_canonical_program(is_active=True)
            program = build_offering(institution=owner, canonical_program=canonical, is_active=True)
            payload["scope_type"] = "program_offering"
            payload["program_id"] = str(program.id)
            payload["institution_id"] = str(other.id)
        elif mode == "expired":
            inst = build_institution(is_active=True)
            payload["scope_type"] = "institution"
            payload["institution_id"] = str(inst.id)
            payload["expires_at"] = (now - timedelta(days=1)).isoformat()
        elif mode == "bad_permission":
            inst = build_institution(is_active=True)
            payload["scope_type"] = "institution"
            payload["institution_id"] = str(inst.id)
            payload["permissions"] = list(valid_permissions) + [_BAD_PERMISSION]
        elif mode == "duplicate":
            inst = build_institution(is_active=True)
            payload["scope_type"] = "institution"
            payload["institution_id"] = str(inst.id)
            # A pre-existing active grant for the identical (user, scope, target).
            AccessGrant.objects.create(
                id=uuid.uuid4(),
                user_id=grantee.id,
                scope_type="institution",
                institution_id=inst.id,
                permissions=[],
                is_active=True,
                created_at=now,
                created_by_id=actor.id,
            )
            precreate_rows = 1
        elif mode == "none_institution":
            inst = build_institution(is_active=True)
            payload["scope_type"] = "institution"
            payload["institution_id"] = str(inst.id)
            if include_future_expiry:
                payload["expires_at"] = _future_expiry()
        elif mode == "none_program_offering":
            inst = build_institution(is_active=True)
            canonical = build_canonical_program(is_active=True)
            program = build_offering(institution=inst, canonical_program=canonical, is_active=True)
            payload["scope_type"] = "program_offering"
            payload["program_id"] = str(program.id)
            if include_matching_institution:
                payload["institution_id"] = str(inst.id)
            if include_future_expiry:
                payload["expires_at"] = _future_expiry()
        elif mode == "none_application":
            inst = build_institution(is_active=True)
            canonical = build_canonical_program(is_active=True)
            program = build_offering(institution=inst, canonical_program=canonical, is_active=True)
            intake = build_intake(is_active=True)
            student = build_profile(role="student")
            application = build_application(
                student=student,
                institution=inst,
                canonical_program=canonical,
                offering=program,
                intake=intake,
                status="submitted",
            )
            payload["scope_type"] = "application"
            payload["application_id"] = str(application.id)
            if include_future_expiry:
                payload["expires_at"] = _future_expiry()
        elif mode == "none_self_update":
            # Updating the same existing active grant with its own target must be
            # accepted — the duplicate guard excludes the row under edit (R12.6).
            inst = build_institution(is_active=True)
            instance = AccessGrant.objects.create(
                id=uuid.uuid4(),
                user_id=grantee.id,
                scope_type="institution",
                institution_id=inst.id,
                permissions=[],
                is_active=True,
                created_at=now,
                created_by_id=actor.id,
            )
            precreate_rows = 1
            payload["scope_type"] = "institution"
            payload["institution_id"] = str(inst.id)
            payload["permissions"] = list(valid_permissions)

        expected_valid = mode in _GRANT_VALID_MODES

        baseline = AccessGrant.objects.count()
        if instance is not None:
            serializer = AdminAccessGrantSerializer(instance, data=payload, partial=True)
        else:
            serializer = AdminAccessGrantSerializer(data=payload)
        is_valid = serializer.is_valid()

        assert is_valid is expected_valid, {
            "mode": mode,
            "generic_scope": generic_scope,
            "expected_valid": expected_valid,
            "got_valid": is_valid,
            "errors": serializer.errors,
            "payload": payload,
        }

        if expected_valid:
            if instance is not None:
                serializer.save()
                # Self-update modifies in place — no new row.
                assert AccessGrant.objects.count() == baseline, {"mode": mode}
                instance.refresh_from_db()
                assert instance.is_active is True
            else:
                serializer.save(created_by_id=actor.id)
                assert AccessGrant.objects.count() == baseline + 1, {"mode": mode}
        else:
            _assert_field_level_error(serializer)
            # A rejected payload creates or modifies no Access_Grant row, and
            # leaves any pre-existing row unchanged (R12.8).
            assert AccessGrant.objects.count() == baseline, {
                "mode": mode,
                "precreate_rows": precreate_rows,
            }

        net = AccessGrant.objects.count() - before
        assert net == precreate_rows + (1 if (expected_valid and instance is None) else 0)
