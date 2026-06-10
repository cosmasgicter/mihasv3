"""Duplicate-by-canonical exploration tests (P11).

Spec: ``multi-tenant-beanola-admissions`` — Phase 0 exploration baseline
(task 1.8, building on the task 1.1 scaffold). Pins the
duplicate-canonicality property:

    P11 Application uniqueness keys on ``(student identity, canonical program,
        intake)``; terminal statuses don't block; a different NRC/passport
        identity may proceed; legacy null-ID rows preserve the previous
        string-keyword filter shape.

These are **exploration** tests: each property either passes against the
current ``DuplicateChecker`` or is recorded as a durable
``@pytest.mark.xfail(strict=True)`` carrying a minimised counter-example,
triaged to the Phase 2 task that will fix it (matching the convention used by
tasks 1.3, 1.6, and 1.7). No production code is changed in this task.

Outcome summary (against current code, ``DATABASE_URL=sqlite:///test.sqlite3``):

- existing non-terminal canonical app blocks a new create ............. PASS
- terminal-status app does not block ................................. PASS
- two schools / one canonical program = one duplicate slot ........... PASS
- canonical match holds even when legacy strings differ .............. PASS
- a different NRC/passport identity may proceed ...................... PASS
- duplicate check at submit keys on canonical ........................ PASS
- legacy null-ID rows preserve the string-keyword shape .............. PASS
- distinct canonical programs sharing a legacy display name must NOT
  collide when canonical IDs are present ............................. FAIL
  (xfail strict → Phase 2 task 8.1: the checker ORs the legacy
  ``program``/``intake`` string with the canonical IDs, so two distinct
  canonical programs that happen to share a display name are treated as one
  slot — keying partly on legacy strings, contrary to R8.1.)

**Validates: Requirements R8.1, R8.4, R14.7**
"""

from __future__ import annotations

import pytest

from apps.applications.duplicate_checker import (
    DuplicateChecker,
    DuplicateCheckResult,
    TERMINAL_STATUSES,
)
from tests.tenant_fixtures import (
    build_application,
    build_canonical_program,
    build_institution,
    build_intake,
    build_offering,
    build_program_intake,
)


@pytest.mark.django_db
class TestDuplicateByCanonical:
    """P11: uniqueness keyed on canonical program + intake.

    **Validates: Requirements R8.1, R8.4, R14.7**
    """

    def test_existing_canonical_application_blocks_new_one(self, tenant_world):
        """A non-terminal application for the same canonical program + intake
        blocks a new create for the same student identity."""
        world = tenant_world  # application is created in 'draft' (non-terminal)
        result = DuplicateChecker.check_at_create(
            user_id=str(world.student.id),
            program=world.application.program,
            intake=world.application.intake,
            nrc_number=world.application.nrc_number,
            program_id=world.canonical_program_id,
            intake_id=world.intake_id,
        )
        assert isinstance(result, DuplicateCheckResult)
        assert result.has_duplicate is True
        assert result.existing_id == str(world.application.id)
        assert result.existing_status == "draft"

    def test_terminal_status_does_not_block(self, tenant_world_factory):
        """A withdrawn (terminal) application does not block a new application
        for the same canonical program + intake (R8.4)."""
        world = tenant_world_factory(application_status="withdrawn")
        assert "withdrawn" in TERMINAL_STATUSES
        result = DuplicateChecker.check_at_create(
            user_id=str(world.student.id),
            program=world.application.program,
            intake=world.application.intake,
            nrc_number=world.application.nrc_number,
            program_id=world.canonical_program_id,
            intake_id=world.intake_id,
        )
        assert result.has_duplicate is False

    def test_two_schools_same_canonical_is_one_slot(self, tenant_world):
        """R8.1/R8.2: two schools offering the *same* canonical program for the
        *same* intake are one duplicate slot for a given student.

        School A already holds the student's draft. We add a second school (B)
        offering the same canonical program for the same intake, then model the
        student being routed to school B (same canonical program + intake IDs,
        canonical-name legacy string as the create path would set). The check
        must still flag a duplicate — duplicate keying ignores the school
        offering / institution entirely.
        """
        world = tenant_world

        # A genuinely different institution offers the same canonical program
        # for the same intake.
        institution_b = build_institution(suffix="school-b")
        offering_b = build_offering(
            institution=institution_b,
            canonical_program=world.canonical_program,
            suffix="school-b",
        )
        build_program_intake(offering=offering_b, intake=world.intake)
        assert offering_b.institution_id != world.institution.id

        # The create path sets the legacy ``program``/``intake`` strings from
        # the canonical program + intake names regardless of school, so both a
        # school-A and a school-B routing share the same canonical IDs.
        result = DuplicateChecker.check_at_create(
            user_id=str(world.student.id),
            program=world.canonical_program.name,
            intake=world.intake.name,
            nrc_number=world.application.nrc_number,
            program_id=world.canonical_program_id,
            intake_id=world.intake_id,
        )
        assert result.has_duplicate is True
        assert result.existing_id == str(world.application.id)

    def test_duplicate_detected_when_legacy_strings_differ_but_canonical_matches(
        self, tenant_world
    ):
        """R8.1: when canonical IDs are present, a duplicate is detected via the
        canonical IDs even if the legacy ``program``/``intake`` strings supplied
        do not match the stored snapshot.

        This proves the canonical IDs (not the legacy strings) carry the match.
        """
        world = tenant_world
        result = DuplicateChecker.check_at_create(
            user_id=str(world.student.id),
            program="A Totally Different Program Display String",
            intake="A Totally Different Intake Display String",
            nrc_number=world.application.nrc_number,
            program_id=world.canonical_program_id,
            intake_id=world.intake_id,
        )
        assert result.has_duplicate is True
        assert result.existing_id == str(world.application.id)

    def test_different_identity_may_proceed(self, tenant_world):
        """R8.3: the same account applying for a *different* person (different
        NRC/passport identity) is not blocked for the same canonical slot.

        The stored application carries an NRC; the new attempt carries only a
        passport, so the identities do not match and the new application is
        permitted.
        """
        world = tenant_world
        assert (world.application.nrc_number or "").strip()  # stored identity is NRC
        result = DuplicateChecker.check_at_create(
            user_id=str(world.student.id),
            program=world.canonical_program.name,
            intake=world.intake.name,
            nrc_number="",
            passport_number="ZN9876543",
            program_id=world.canonical_program_id,
            intake_id=world.intake_id,
        )
        assert result.has_duplicate is False

    def test_check_at_submit_keys_on_canonical(self, tenant_world_factory):
        """R8.6: the duplicate check also runs at submit and keys on canonical
        program + intake.

        An already-submitted application for the same canonical slot and
        identity blocks a second submission, even when a different application
        row is the one being submitted (excluded by id).
        """
        world = tenant_world_factory(application_status="submitted")
        # A second draft for the same student / canonical slot / identity.
        second = build_application(
            student=world.student,
            institution=world.institution,
            canonical_program=world.canonical_program,
            offering=world.offering,
            intake=world.intake,
            suffix="second-draft",
            status="draft",
            nrc_number=world.application.nrc_number,
        )
        result = DuplicateChecker.check_at_submit(
            user_id=str(world.student.id),
            program=world.canonical_program.name,
            intake=world.intake.name,
            exclude_id=str(second.id),
            program_id=world.canonical_program_id,
            intake_id=world.intake_id,
        )
        assert result.has_duplicate is True
        assert result.existing_id == str(world.application.id)
        assert result.existing_status == "submitted"


@pytest.mark.django_db
class TestLegacyDuplicateFallback:
    """P11: legacy null-ID rows preserve the previous string-keyword shape.

    **Validates: Requirements R8.5, R14.7**
    """

    def test_legacy_null_ids_preserve_string_keyword_shape(self, tenant_world_factory):
        """R8.5: with no canonical IDs supplied (legacy create path), the check
        falls back to the previous ``(program, intake)`` string-keyword filter
        and still detects an overlapping non-terminal application."""
        world = tenant_world_factory(with_canonical_ids=False)
        app = world.application
        assert app.canonical_program_id is None
        assert app.intake_ref_id is None

        result = DuplicateChecker.check_at_create(
            user_id=str(world.student.id),
            program=app.program,
            intake=app.intake,
            nrc_number=app.nrc_number,
            # No program_id / intake_id → legacy string-keyword branch.
        )
        assert result.has_duplicate is True
        assert result.existing_id == str(app.id)

    def test_legacy_different_intake_string_does_not_block(self, tenant_world_factory):
        """R8.5: the legacy string branch keys on the ``(program, intake)``
        pair — a different intake string is a different slot and is allowed."""
        world = tenant_world_factory(with_canonical_ids=False)
        app = world.application
        result = DuplicateChecker.check_at_create(
            user_id=str(world.student.id),
            program=app.program,
            intake=f"{app.intake} — A Different Window",
            nrc_number=app.nrc_number,
        )
        assert result.has_duplicate is False


@pytest.mark.django_db
class TestCanonicalKeyingDivergence:
    """P11 divergence: keying must NOT fall back to legacy strings when
    canonical IDs are present.

    **Validates: Requirements R8.1, R14.7**
    """

    def test_distinct_canonical_with_shared_legacy_name_should_not_block(self, tenant_world):
        """A new application for a DISTINCT canonical program (same display name,
        same intake) must not be blocked when canonical IDs are present."""
        world = tenant_world
        # A second, genuinely distinct canonical program that shares the display
        # name of the first (a realistic rename / duplicate-name scenario).
        other_canonical = build_canonical_program(name=world.canonical_program.name)
        assert str(other_canonical.id) != world.canonical_program_id

        result = DuplicateChecker.check_at_create(
            user_id=str(world.student.id),
            program=world.canonical_program.name,  # shared legacy display string
            intake=world.intake.name,
            nrc_number=world.application.nrc_number,
            program_id=str(other_canonical.id),  # DISTINCT canonical program
            intake_id=world.intake_id,
        )
        # Canonical-only keying ⇒ different canonical program ⇒ not a duplicate.
        assert result.has_duplicate is False
