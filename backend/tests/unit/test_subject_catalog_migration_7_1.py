"""The canonical subject catalogue migration and its no-drift contract.

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/`` — task **7.1**.
Requirements: R11.4, R11.5
Findings:     STU-11
Design:       §9.2 (Grades — "The subject catalog is seeded and versioned by the
              backend.")

``backend/scripts/2026_07_25_01_canonical_subject_catalog.sql`` is what Neon and
production actually apply; :mod:`apps.catalog.subject_catalog` is what the API,
the selector, and the alias catalogue read. If those two drift, the deployed
catalogue stops matching the code that validates against it — so the first tests
here parse the migration and compare it to the Python authority row for row.

The remaining tests apply the real migration to the ephemeral test database and
prove the three behaviours the live-data inventory demanded: idempotence, the
duplicate merge with its reference repointing, and the collision case where one
application already holds both the legacy and the canonical subject.

**Validates: Requirements R11.4, R11.5**
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path

import pytest
from django.db import connection

from apps.catalog.models import CourseRequirement, Subject
from apps.catalog.subject_catalog import (
    CANONICAL_SUBJECTS,
    LEGACY_DUPLICATE_CODES,
    SUBJECT_CATEGORIES,
)
from apps.documents.models import ApplicationGrade
from tests.tenant_fixtures import build_subject, build_tenant_world

_SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
MIGRATION = _SCRIPTS / "2026_07_25_01_canonical_subject_catalog.sql"
ROLLBACK = _SCRIPTS / "2026_07_25_01_canonical_subject_catalog_rollback.sql"

_CATALOGUE_ROW_RE = re.compile(
    r"\(\s*'(?P<code>[^']+)'\s*,\s*'(?P<name>[^']+)'\s*,\s*'(?P<category>[^']+)'\s*,"
    r"\s*(?P<is_core>true|false)\s*,\s*'(?P<curriculum>[^']+)'\s*\)"
)
_PAIR_LIST_RE = re.compile(r"\(VALUES (\('[A-Z_]+', '[A-Z_]+'\)(?:, \('[A-Z_]+', '[A-Z_]+'\))*)\)")


def _migration_catalogue() -> list[tuple[str, str, str, bool, str]]:
    """Parse the canonical ``VALUES`` seed rows out of the migration body."""
    body = MIGRATION.read_text()
    start = body.index("INSERT INTO subjects")
    end = body.index("ON CONFLICT (code)", start)
    return [
        (
            match.group("code"),
            match.group("name"),
            match.group("category"),
            match.group("is_core") == "true",
            match.group("curriculum"),
        )
        for match in _CATALOGUE_ROW_RE.finditer(body[start:end])
    ]


def _apply(path: Path) -> None:
    """Run a migration script body inside the current test transaction.

    ``BEGIN``/``COMMIT`` are stripped so the statements join the test's
    transaction (and roll back with it) instead of committing through it. Every
    other statement — and therefore every behaviour under test — is the file
    ``apply_sql_migrations`` runs verbatim in production.
    """
    body = path.read_text()
    body = re.sub(r"(?im)^\s*(BEGIN|COMMIT)\s*;\s*$", "", body)
    with connection.cursor() as cursor:
        cursor.execute(body)


def _subject(code: str) -> Subject | None:
    return Subject.objects.filter(code=code).first()


# ---------------------------------------------------------------------------
# 1. No drift between the deployed SQL and the Python authority
# ---------------------------------------------------------------------------


class TestNoDriftBetweenSqlAndPython:
    def test_the_migration_seeds_exactly_the_python_catalogue(self):
        from_sql = sorted(_migration_catalogue())
        from_python = sorted(
            (entry.code, entry.name, entry.category, entry.is_core, entry.curriculum_type)
            for entry in CANONICAL_SUBJECTS
        )
        assert from_sql == from_python

    def test_every_duplicate_pair_list_matches_the_inventoried_duplicates(self):
        """The repeated pair list must be identical everywhere and match the code."""
        occurrences = _PAIR_LIST_RE.findall(MIGRATION.read_text())
        assert occurrences, "the duplicate-merge pair list was not found"
        assert len(set(occurrences)) == 1, f"pair list drifted between statements: {set(occurrences)}"
        pairs = dict(re.findall(r"\('([A-Z_]+)', '([A-Z_]+)'\)", occurrences[0]))
        assert pairs == LEGACY_DUPLICATE_CODES

    def test_no_canonical_code_is_also_a_retired_duplicate(self):
        canonical_codes = {entry.code for entry in CANONICAL_SUBJECTS}
        assert canonical_codes.isdisjoint(LEGACY_DUPLICATE_CODES)
        assert set(LEGACY_DUPLICATE_CODES.values()) <= canonical_codes

    def test_every_category_is_in_the_canonical_vocabulary(self):
        for entry in CANONICAL_SUBJECTS:
            assert entry.category in SUBJECT_CATEGORIES, entry

    def test_a_rollback_sibling_exists(self):
        assert ROLLBACK.exists()


# ---------------------------------------------------------------------------
# 2. Applying the migration
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestMigrationBehaviour:
    def _catalogue_state(self) -> dict[str, tuple]:
        return {
            row.code: (row.name, row.category, row.is_core, row.is_active, row.curriculum_type)
            for row in Subject.objects.filter(
                code__in=[entry.code for entry in CANONICAL_SUBJECTS]
            )
        }

    def test_it_seeds_the_catalogue_and_is_idempotent(self):
        _apply(MIGRATION)
        first = self._catalogue_state()

        assert len(first) == len(CANONICAL_SUBJECTS)
        for entry in CANONICAL_SUBJECTS:
            assert first[entry.code] == (
                entry.name,
                entry.category,
                entry.is_core,
                True,
                entry.curriculum_type,
            )

        _apply(MIGRATION)
        assert self._catalogue_state() == first
        assert (
            Subject.objects.filter(code__in=[e.code for e in CANONICAL_SUBJECTS]).count()
            == len(CANONICAL_SUBJECTS)
        ), "a re-run must not duplicate rows"

    def test_it_repairs_a_drifted_canonical_row(self):
        """The live ``PHYS`` row had ``is_core = true`` and a title-case category."""
        build_subject(name="Physics", code="PHY", category="Sciences", is_core=True)

        _apply(MIGRATION)

        repaired = _subject("PHY")
        assert repaired.category == "sciences"
        assert repaired.is_core is False
        assert repaired.is_active is True

    def test_it_repoints_references_off_a_legacy_duplicate_and_deactivates_it(self):
        """The live-data case: the legacy row holds every real reference."""
        world = build_tenant_world(application_status="draft")
        legacy = build_subject(name="Physics", code="PHYS", category="Sciences", is_core=True)
        grade = ApplicationGrade.objects.create(
            id=uuid.uuid4(),
            application_id=world.application.id,
            subject_id=legacy.id,
            grade=3,
        )
        requirement = CourseRequirement.objects.create(
            id=uuid.uuid4(),
            program=world.offering,
            subject=legacy,
            minimum_grade=5,
            is_mandatory=True,
        )

        _apply(MIGRATION)

        canonical = _subject("PHY")
        assert canonical is not None
        grade.refresh_from_db()
        requirement.refresh_from_db()
        assert str(grade.subject_id) == str(canonical.id)
        assert str(requirement.subject_id) == str(canonical.id)
        assert grade.grade == 3, "the student's grade value is never rewritten"

        legacy.refresh_from_db()
        assert legacy.is_active is False, "the duplicate row is retired, not deleted"
        assert _subject("PHYS") is not None, "history stays readable"

    def test_a_collision_keeps_one_row_and_the_better_grade(self):
        """An application holding both variants must not violate the unique index.

        ``application_grades_application_id_subject_id_key`` is
        ``UNIQUE (application_id, subject_id)``, so a blind repoint would fail. The
        migration keeps the better ECZ grade (lower is better) on the canonical
        row and drops the legacy one.
        """
        world = build_tenant_world(application_status="draft")
        canonical = build_subject(name="Music", code="MUSIC", category="practical")
        legacy = build_subject(name="Music", code="MUS", category="Arts")
        ApplicationGrade.objects.create(
            id=uuid.uuid4(),
            application_id=world.application.id,
            subject_id=canonical.id,
            grade=6,
        )
        ApplicationGrade.objects.create(
            id=uuid.uuid4(),
            application_id=world.application.id,
            subject_id=legacy.id,
            grade=2,
        )

        _apply(MIGRATION)

        rows = list(
            ApplicationGrade.objects.filter(application_id=world.application.id).values(
                "subject_id", "grade"
            )
        )
        assert len(rows) == 1, rows
        assert str(rows[0]["subject_id"]) == str(canonical.id)
        assert rows[0]["grade"] == 2, "the better of the two grades survives"

    def test_a_retired_duplicate_is_no_longer_selectable_but_still_resolvable(self):
        legacy = build_subject(name="Additional Mathematics", code="ADD_MATH", category="Sciences")

        _apply(MIGRATION)

        from apps.catalog.subject_catalog import active_subjects_queryset, resolve_code

        selectable = set(active_subjects_queryset().values_list("id", flat=True))
        assert legacy.id not in selectable
        assert _subject("ADDMATH").id in selectable
        assert resolve_code("ADD_MATH") == "ADDMATH"

    def test_the_rollback_preserves_the_duplicate_identity_correction(self):
        build_subject(name="Additional Mathematics", code="ADD_MATH", category="Sciences")
        _apply(MIGRATION)
        assert _subject("ADD_MATH").is_active is False

        _apply(ROLLBACK)
        assert _subject("ADD_MATH").is_active is False
