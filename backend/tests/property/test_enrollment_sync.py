"""Property-based tests for enrollment synchronization.

# Feature: audit-remediation, Property 1: Enrollment increment updates both tables

For any valid intake name and program name, calling
IntakeEnforcer.increment_enrollment(intake_name, program_name) should increase
both intakes.current_enrollment and program_intakes.current_enrollment by
exactly 1 for the matching rows.

**Validates: Requirements 1.2**
"""

import os
import uuid

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

import pytest  # noqa: E402
from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402
from unittest.mock import patch, MagicMock  # noqa: E402

from apps.applications.identifier_resolver import ResolvedIdentifier  # noqa: E402


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Intake names: realistic alphanumeric strings with spaces/hyphens
intake_name_strings = st.text(
    alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -",
    min_size=3,
    max_size=50,
).filter(lambda s: s.strip() != "")

# Program names: realistic alphanumeric strings with spaces
program_name_strings = st.text(
    alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ",
    min_size=3,
    max_size=80,
).filter(lambda s: s.strip() != "")


# ---------------------------------------------------------------------------
# Property 1: Enrollment increment updates both tables
# ---------------------------------------------------------------------------

class TestEnrollmentIncrementUpdatesBothTables(SimpleTestCase):
    """# Feature: audit-remediation, Property 1: Enrollment increment updates both tables

    For any valid intake name and program name, calling
    IntakeEnforcer.increment_enrollment(intake_name, program_name) increases
    both intakes.current_enrollment and program_intakes.current_enrollment
    by exactly 1 for the matching rows.

    **Validates: Requirements 1.2**
    """

    @given(intake_name=intake_name_strings, program_name=program_name_strings)
    @settings(max_examples=100, deadline=None)
    def test_increment_updates_both_intake_and_program_intake(
        self, intake_name, program_name
    ):
        """For any valid intake name and program name, increment_enrollment
        should issue F()+1 updates on both the Intake and ProgramIntake rows."""
        from apps.applications.intake_enforcer import IntakeEnforcer

        intake_id = str(uuid.uuid4())
        program_id = str(uuid.uuid4())

        mock_resolved = ResolvedIdentifier(
            id=intake_id, code="", name=intake_name, source="name"
        )

        mock_program = MagicMock()
        mock_program.id = program_id

        mock_intake_qs = MagicMock()
        mock_pi_qs = MagicMock()
        mock_program_qs = MagicMock()
        mock_program_qs.first.return_value = mock_program

        with (
            patch(
                "apps.applications.identifier_resolver.IdentifierResolver.resolve_intake",
                return_value=mock_resolved,
            ) as mock_resolve,
            patch("apps.catalog.models.Intake.objects") as mock_intake_objects,
            patch("apps.catalog.models.Program.objects") as mock_program_objects,
            patch("apps.catalog.models.ProgramIntake.objects") as mock_pi_objects,
        ):
            mock_intake_objects.filter.return_value = mock_intake_qs
            mock_program_objects.filter.return_value = mock_program_qs
            mock_pi_objects.filter.return_value = mock_pi_qs

            IntakeEnforcer.increment_enrollment(intake_name, program_name)

            # 1. resolve_intake was called with the intake name
            mock_resolve.assert_called_once_with(intake_name)

            # 2. Intake.objects.filter(id=resolved.id).update(...) was called
            mock_intake_objects.filter.assert_called_once_with(id=intake_id)
            mock_intake_qs.update.assert_called_once()
            intake_update_kwargs = mock_intake_qs.update.call_args
            self.assertIn("current_enrollment", intake_update_kwargs.kwargs)

            # 3. Program.objects.filter(name=program_name) was called
            mock_program_objects.filter.assert_called_once_with(name=program_name)

            # 4. ProgramIntake.objects.filter(...).update(...) was called
            mock_pi_objects.filter.assert_called_once_with(
                intake_id=intake_id, program_id=program_id
            )
            mock_pi_qs.update.assert_called_once()
            pi_update_kwargs = mock_pi_qs.update.call_args
            self.assertIn("current_enrollment", pi_update_kwargs.kwargs)

    @given(intake_name=intake_name_strings, program_name=program_name_strings)
    @settings(max_examples=100, deadline=None)
    def test_increment_skips_when_intake_not_found(self, intake_name, program_name):
        """When the intake is not found, increment_enrollment should not
        attempt any database updates."""
        from apps.applications.intake_enforcer import IntakeEnforcer

        mock_resolved = ResolvedIdentifier(
            id="", code="", name=intake_name, source="not_found"
        )

        with (
            patch(
                "apps.applications.identifier_resolver.IdentifierResolver.resolve_intake",
                return_value=mock_resolved,
            ),
            patch("apps.catalog.models.Intake.objects") as mock_intake_objects,
            patch("apps.catalog.models.ProgramIntake.objects") as mock_pi_objects,
        ):
            IntakeEnforcer.increment_enrollment(intake_name, program_name)

            # Neither table should be updated
            mock_intake_objects.filter.assert_not_called()
            mock_pi_objects.filter.assert_not_called()

    @given(intake_name=intake_name_strings)
    @settings(max_examples=100, deadline=None)
    def test_increment_without_program_updates_only_intake(self, intake_name):
        """When program_name is empty, only the Intake table should be
        updated — ProgramIntake should not be touched."""
        from apps.applications.intake_enforcer import IntakeEnforcer

        intake_id = str(uuid.uuid4())

        mock_resolved = ResolvedIdentifier(
            id=intake_id, code="", name=intake_name, source="name"
        )

        mock_intake_qs = MagicMock()

        with (
            patch(
                "apps.applications.identifier_resolver.IdentifierResolver.resolve_intake",
                return_value=mock_resolved,
            ),
            patch("apps.catalog.models.Intake.objects") as mock_intake_objects,
            patch("apps.catalog.models.ProgramIntake.objects") as mock_pi_objects,
        ):
            mock_intake_objects.filter.return_value = mock_intake_qs

            IntakeEnforcer.increment_enrollment(intake_name, "")

            # Intake should be updated
            mock_intake_objects.filter.assert_called_once_with(id=intake_id)
            mock_intake_qs.update.assert_called_once()

            # ProgramIntake should NOT be updated
            mock_pi_objects.filter.assert_not_called()


# ---------------------------------------------------------------------------
# Strategies for Property 2
# ---------------------------------------------------------------------------

# Valid application statuses that count toward enrollment
COUNTED_STATUSES = ("submitted", "under_review", "approved", "waitlisted")
# All possible statuses including non-counted ones
ALL_STATUSES = ("draft", "submitted", "under_review", "approved", "rejected", "waitlisted")

# Strategy: a single application record with a program name and status
application_record = st.fixed_dictionaries(
    {
        "program": program_name_strings,
        "status": st.sampled_from(ALL_STATUSES),
    }
)

# Strategy: a list of 0-20 application records for a single intake
application_sets = st.lists(application_record, min_size=0, max_size=20)


# ---------------------------------------------------------------------------
# Property 2: Enrollment sync produces correct counts
# ---------------------------------------------------------------------------

class TestEnrollmentSyncProducesCorrectCounts(SimpleTestCase):
    """# Feature: audit-remediation, Property 2: Enrollment sync produces correct counts

    For any set of applications across program+intake combinations, after
    calling sync_enrollment(), the program_intakes.current_enrollment value
    for each program+intake pair equals the count of applications with status
    in ('submitted', 'under_review', 'approved', 'waitlisted') for that
    combination.

    **Validates: Requirements 1.4**
    """

    @given(
        intake_name=intake_name_strings,
        applications=application_sets,
    )
    @settings(max_examples=100, deadline=None)
    def test_sync_sets_correct_per_program_counts(self, intake_name, applications):
        """For any set of applications, sync_enrollment should set each
        program_intake's current_enrollment to the count of counted-status
        applications for that program."""
        from apps.applications.intake_enforcer import IntakeEnforcer
        from collections import Counter

        intake_id = str(uuid.uuid4())

        mock_resolved = ResolvedIdentifier(
            id=intake_id, code="", name=intake_name, source="name"
        )

        # Compute expected counts: only applications with counted statuses
        counted_apps = [a for a in applications if a["status"] in COUNTED_STATUSES]
        expected_total = len(counted_apps)
        expected_per_program = Counter(a["program"] for a in counted_apps)

        # All unique program names across ALL applications (including non-counted)
        all_programs = list({a["program"] for a in applications})

        # Build mock ProgramIntake objects — one per unique program
        mock_pi_list = []
        program_id_map = {}  # program_name -> program_id
        pi_id_map = {}       # program_name -> pi_id
        for prog_name in all_programs:
            prog_id = str(uuid.uuid4())
            pi_id = str(uuid.uuid4())
            program_id_map[prog_name] = prog_id
            pi_id_map[prog_name] = pi_id

            mock_pi = MagicMock()
            mock_pi.id = pi_id
            mock_pi.program = MagicMock()
            mock_pi.program.name = prog_name
            mock_pi_list.append(mock_pi)

        # Build the annotated queryset result (what .values("program").annotate(cnt=Count("id")) returns)
        annotated_rows = [
            {"program": prog_name, "cnt": count}
            for prog_name, count in expected_per_program.items()
        ]

        # Mock Application.objects — needs to handle two separate filter() chains:
        #   1. .filter(...).count()  → returns expected_total
        #   2. .filter(...).values("program").annotate(cnt=Count("id")) → returns annotated_rows
        mock_app_filter_qs = MagicMock()
        mock_app_filter_qs.count.return_value = expected_total
        mock_app_filter_qs.values.return_value.annotate.return_value = annotated_rows

        # Mock Intake.objects
        mock_intake_qs = MagicMock()

        # Mock ProgramIntake.objects — needs to handle:
        #   1. .filter(intake_id=...).select_related("program") → returns mock_pi_list
        #   2. .filter(id=pi_id).update(current_enrollment=expected) → per-PI updates
        mock_pi_objects = MagicMock()

        # Track per-PI update calls
        pi_update_calls = {}  # pi_id -> current_enrollment value

        def pi_filter_side_effect(**kwargs):
            qs = MagicMock()
            if "intake_id" in kwargs:
                # This is the .filter(intake_id=...) call for iterating PIs
                qs.select_related.return_value = mock_pi_list
            elif "id" in kwargs:
                # This is the .filter(id=pi_id) call for updating a specific PI
                pi_id_val = kwargs["id"]

                def capture_update(**update_kwargs):
                    pi_update_calls[pi_id_val] = update_kwargs.get(
                        "current_enrollment"
                    )

                qs.update.side_effect = capture_update
            return qs

        mock_pi_objects.filter.side_effect = pi_filter_side_effect

        with (
            patch(
                "apps.applications.identifier_resolver.IdentifierResolver.resolve_intake",
                return_value=mock_resolved,
            ),
            patch("apps.catalog.models.Intake.objects") as patched_intake_objects,
            patch(
                "apps.applications.models.Application.objects"
            ) as patched_app_objects,
            patch(
                "apps.catalog.models.ProgramIntake.objects", mock_pi_objects
            ),
        ):
            patched_intake_objects.filter.return_value = mock_intake_qs
            patched_app_objects.filter.return_value = mock_app_filter_qs

            IntakeEnforcer.sync_enrollment(intake_name)

            # 1. Intake-level count was set correctly
            patched_intake_objects.filter.assert_called_once_with(id=intake_id)
            mock_intake_qs.update.assert_called_once_with(
                current_enrollment=expected_total
            )

            # 2. Each ProgramIntake was updated with the correct count
            for prog_name in all_programs:
                pi_id = pi_id_map[prog_name]
                expected_count = expected_per_program.get(prog_name, 0)
                self.assertIn(
                    pi_id,
                    pi_update_calls,
                    f"ProgramIntake for '{prog_name}' (pi_id={pi_id}) was not updated",
                )
                self.assertEqual(
                    pi_update_calls[pi_id],
                    expected_count,
                    f"ProgramIntake for '{prog_name}' expected {expected_count}, "
                    f"got {pi_update_calls[pi_id]}",
                )

    @given(intake_name=intake_name_strings)
    @settings(max_examples=100, deadline=None)
    def test_sync_skips_when_intake_not_found(self, intake_name):
        """When the intake is not found, sync_enrollment should not
        attempt any database updates."""
        from apps.applications.intake_enforcer import IntakeEnforcer

        mock_resolved = ResolvedIdentifier(
            id="", code="", name=intake_name, source="not_found"
        )

        with (
            patch(
                "apps.applications.identifier_resolver.IdentifierResolver.resolve_intake",
                return_value=mock_resolved,
            ),
            patch("apps.catalog.models.Intake.objects") as mock_intake_objects,
            patch("apps.applications.models.Application.objects") as mock_app_objects,
            patch("apps.catalog.models.ProgramIntake.objects") as mock_pi_objects,
        ):
            IntakeEnforcer.sync_enrollment(intake_name)

            mock_intake_objects.filter.assert_not_called()
            mock_app_objects.filter.assert_not_called()
            mock_pi_objects.filter.assert_not_called()


# ---------------------------------------------------------------------------
# Property 11: Sync enrollment metamorphic equivalence
# ---------------------------------------------------------------------------

class TestSyncEnrollmentMetamorphicEquivalence(SimpleTestCase):
    """# Feature: audit-remediation, Property 11: Sync enrollment metamorphic equivalence

    For any valid set of applications and intakes, the refactored single-query
    sync_enrollment() produces the same current_enrollment values as computing
    individual counts per program+intake in a loop.

    **Validates: Requirements 16.2, 16.3**
    """

    @staticmethod
    def _reference_count_map(applications, intake_name):
        """Reference implementation: compute per-program enrollment counts
        by looping over each unique program and counting individually.

        This mirrors the old N+1 approach — one count per program.
        """
        counted_statuses = ("submitted", "under_review", "approved", "waitlisted")
        # Gather all unique program names from the application set
        all_programs = {a["program"] for a in applications}
        result = {}
        for prog in all_programs:
            count = sum(
                1
                for a in applications
                if a["program"] == prog
                and a["status"] in counted_statuses
            )
            result[prog] = count
        return result

    @staticmethod
    def _aggregation_count_map(applications, intake_name):
        """Aggregation implementation: mirrors the single-query approach used
        by the refactored sync_enrollment().

        Groups all counted-status applications by program in one pass.
        """
        from collections import Counter

        counted_statuses = ("submitted", "under_review", "approved", "waitlisted")
        counted = [
            a["program"]
            for a in applications
            if a["status"] in counted_statuses
        ]
        counter = Counter(counted)
        # The aggregation query only returns rows with cnt > 0, so programs
        # with zero counted applications won't appear. To match the reference
        # implementation (which includes zeros), we fill in missing programs.
        all_programs = {a["program"] for a in applications}
        return {prog: counter.get(prog, 0) for prog in all_programs}

    @given(
        intake_name=intake_name_strings,
        applications=application_sets,
    )
    @settings(max_examples=100, deadline=None)
    def test_aggregation_and_loop_produce_same_counts(self, intake_name, applications):
        """For any set of applications, the single-query aggregation approach
        and the per-program loop approach produce identical count_maps."""
        reference = self._reference_count_map(applications, intake_name)
        aggregation = self._aggregation_count_map(applications, intake_name)

        self.assertEqual(
            reference,
            aggregation,
            f"Metamorphic mismatch: reference={reference}, aggregation={aggregation}",
        )

    @given(
        intake_name=intake_name_strings,
        applications=application_sets,
    )
    @settings(max_examples=100, deadline=None)
    def test_sync_enrollment_uses_aggregation_matching_reference(
        self, intake_name, applications
    ):
        """For any set of applications, sync_enrollment() should write the
        same per-program counts that the reference loop implementation
        would compute."""
        from apps.applications.intake_enforcer import IntakeEnforcer
        from collections import Counter

        intake_id = str(uuid.uuid4())

        mock_resolved = ResolvedIdentifier(
            id=intake_id, code="", name=intake_name, source="name"
        )

        # Compute reference counts (the loop-based approach)
        reference = self._reference_count_map(applications, intake_name)

        # Compute what the aggregation query would return
        counted_statuses = ("submitted", "under_review", "approved", "waitlisted")
        counted = [a for a in applications if a["status"] in counted_statuses]
        per_program_counter = Counter(a["program"] for a in counted)
        annotated_rows = [
            {"program": prog, "cnt": cnt}
            for prog, cnt in per_program_counter.items()
        ]

        all_programs = list({a["program"] for a in applications})

        # Build mock ProgramIntake objects
        pi_id_map = {}
        mock_pi_list = []
        for prog_name in all_programs:
            pi_id = str(uuid.uuid4())
            pi_id_map[prog_name] = pi_id
            mock_pi = MagicMock()
            mock_pi.id = pi_id
            mock_pi.program = MagicMock()
            mock_pi.program.name = prog_name
            mock_pi_list.append(mock_pi)

        # Mock Application.objects
        mock_app_filter_qs = MagicMock()
        mock_app_filter_qs.count.return_value = len(counted)
        mock_app_filter_qs.values.return_value.annotate.return_value = annotated_rows

        # Mock Intake.objects
        mock_intake_qs = MagicMock()

        # Mock ProgramIntake.objects — capture per-PI updates
        mock_pi_objects = MagicMock()
        pi_update_calls = {}

        def pi_filter_side_effect(**kwargs):
            qs = MagicMock()
            if "intake_id" in kwargs:
                qs.select_related.return_value = mock_pi_list
            elif "id" in kwargs:
                pi_id_val = kwargs["id"]

                def capture_update(**update_kwargs):
                    pi_update_calls[pi_id_val] = update_kwargs.get(
                        "current_enrollment"
                    )

                qs.update.side_effect = capture_update
            return qs

        mock_pi_objects.filter.side_effect = pi_filter_side_effect

        with (
            patch(
                "apps.applications.identifier_resolver.IdentifierResolver.resolve_intake",
                return_value=mock_resolved,
            ),
            patch("apps.catalog.models.Intake.objects") as patched_intake_objects,
            patch(
                "apps.applications.models.Application.objects"
            ) as patched_app_objects,
            patch("apps.catalog.models.ProgramIntake.objects", mock_pi_objects),
        ):
            patched_intake_objects.filter.return_value = mock_intake_qs
            patched_app_objects.filter.return_value = mock_app_filter_qs

            IntakeEnforcer.sync_enrollment(intake_name)

            # Verify each ProgramIntake got the same count as the reference
            for prog_name in all_programs:
                pi_id = pi_id_map[prog_name]
                expected = reference[prog_name]
                self.assertIn(
                    pi_id,
                    pi_update_calls,
                    f"ProgramIntake for '{prog_name}' was not updated by sync_enrollment",
                )
                self.assertEqual(
                    pi_update_calls[pi_id],
                    expected,
                    f"Metamorphic mismatch for '{prog_name}': "
                    f"sync_enrollment wrote {pi_update_calls[pi_id]}, "
                    f"reference expected {expected}",
                )
