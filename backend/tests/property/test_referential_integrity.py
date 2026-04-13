"""Property-based tests for referential integrity across child tables.

# Feature: pre-launch-audit, Property 4: Referential integrity across child tables

For any record in a child table (applications, application_documents,
application_grades, payments, application_status_history,
application_interviews), the parent foreign key should reference an existing
row in the parent table.

This test validates the FK MAPPING LOGIC and parent-child relationship
structure — it does NOT require a live database connection.

**Validates: Requirements 2.1, 2.2**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

import uuid  # noqa: E402
from dataclasses import dataclass  # noqa: E402

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

# ---------------------------------------------------------------------------
# Parent-child FK relationship definitions (from Django models)
# ---------------------------------------------------------------------------

# Each entry: (child_table, fk_column, parent_table, parent_pk_column)
FK_RELATIONSHIPS: list[tuple[str, str, str, str]] = [
    ("applications", "user_id", "profiles", "id"),
    ("application_documents", "application_id", "applications", "id"),
    ("application_grades", "application_id", "applications", "id"),
    ("application_grades", "subject_id", "subjects", "id"),
    ("payments", "application_id", "applications", "id"),
    ("payments", "user_id", "profiles", "id"),
    ("application_status_history", "application_id", "applications", "id"),
    ("application_interviews", "application_id", "applications", "id"),
    ("program_fees", "program_id", "programs", "id"),
]

# All known parent tables
PARENT_TABLES = {"profiles", "applications", "subjects", "programs"}

# All known child tables from the audit scope
CHILD_TABLES = {
    "applications",
    "application_documents",
    "application_grades",
    "payments",
    "application_status_history",
    "application_interviews",
    "program_fees",
}


# ---------------------------------------------------------------------------
# Referential integrity checker (pure logic, no DB)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class FKRecord:
    """A simulated child record with a foreign key value."""

    child_table: str
    fk_column: str
    fk_value: str  # UUID as string
    parent_table: str


def check_referential_integrity(
    record: FKRecord, parent_ids: dict[str, set[str]]
) -> bool:
    """Return True if the FK value exists in the parent table's ID set.

    This is the core logic that a live DB audit would use: for each child
    record, verify the FK points to an existing parent row.
    """
    parent_set = parent_ids.get(record.parent_table, set())
    return record.fk_value in parent_set


def find_orphans(
    records: list[FKRecord], parent_ids: dict[str, set[str]]
) -> list[FKRecord]:
    """Return all records whose FK value does not exist in the parent table."""
    return [r for r in records if not check_referential_integrity(r, parent_ids)]


def categorize_orphans(
    orphans: list[FKRecord],
) -> dict[str, int]:
    """Group orphan counts by child table."""
    counts: dict[str, int] = {}
    for orphan in orphans:
        counts[orphan.child_table] = counts.get(orphan.child_table, 0) + 1
    return counts


# ---------------------------------------------------------------------------
# Hypothesis strategies
# ---------------------------------------------------------------------------

uuid_st = st.uuids().map(str)

fk_relationship_st = st.sampled_from(FK_RELATIONSHIPS)


def parent_id_set_st(
    min_size: int = 1, max_size: int = 20
) -> st.SearchStrategy[set[str]]:
    """Generate a set of parent UUIDs."""
    return st.frozensets(uuid_st, min_size=min_size, max_size=max_size).map(set)


# ---------------------------------------------------------------------------
# Test class
# ---------------------------------------------------------------------------


class TestReferentialIntegrity(SimpleTestCase):
    """Property 4: Referential integrity across child tables.

    For any record in a child table, the parent FK should reference an
    existing row in the parent table.

    **Validates: Requirements 2.1, 2.2**
    """

    # ------------------------------------------------------------------
    # Property: valid FK always passes integrity check
    # ------------------------------------------------------------------

    @given(
        rel=fk_relationship_st,
        parent_ids=parent_id_set_st(min_size=1, max_size=20),
    )
    @settings(max_examples=200)
    def test_valid_fk_passes_integrity_check(
        self, rel: tuple[str, str, str, str], parent_ids: set[str]
    ):
        """For any child record whose FK value exists in the parent set,
        the integrity check should return True."""
        child_table, fk_column, parent_table, _ = rel
        # Pick a valid parent ID
        valid_id = next(iter(parent_ids))
        record = FKRecord(
            child_table=child_table,
            fk_column=fk_column,
            fk_value=valid_id,
            parent_table=parent_table,
        )
        all_parents = {parent_table: parent_ids}
        self.assertTrue(
            check_referential_integrity(record, all_parents),
            f"Valid FK {valid_id} in {child_table}.{fk_column} → "
            f"{parent_table} should pass integrity check",
        )

    # ------------------------------------------------------------------
    # Property: orphaned FK always fails integrity check
    # ------------------------------------------------------------------

    @given(
        rel=fk_relationship_st,
        parent_ids=parent_id_set_st(min_size=1, max_size=20),
        orphan_id=uuid_st,
    )
    @settings(max_examples=200)
    def test_orphaned_fk_fails_integrity_check(
        self,
        rel: tuple[str, str, str, str],
        parent_ids: set[str],
        orphan_id: str,
    ):
        """For any child record whose FK value does NOT exist in the parent
        set, the integrity check should return False."""
        child_table, fk_column, parent_table, _ = rel
        # Ensure orphan_id is not in parent set
        if orphan_id in parent_ids:
            return  # skip — collision with valid ID
        record = FKRecord(
            child_table=child_table,
            fk_column=fk_column,
            fk_value=orphan_id,
            parent_table=parent_table,
        )
        all_parents = {parent_table: parent_ids}
        self.assertFalse(
            check_referential_integrity(record, all_parents),
            f"Orphaned FK {orphan_id} in {child_table}.{fk_column} → "
            f"{parent_table} should fail integrity check",
        )

    # ------------------------------------------------------------------
    # Property: find_orphans returns only actual orphans
    # ------------------------------------------------------------------

    @given(
        rel=fk_relationship_st,
        parent_ids=parent_id_set_st(min_size=2, max_size=10),
        extra_ids=st.lists(uuid_st, min_size=1, max_size=10),
    )
    @settings(max_examples=200)
    def test_find_orphans_returns_only_orphans(
        self,
        rel: tuple[str, str, str, str],
        parent_ids: set[str],
        extra_ids: list[str],
    ):
        """find_orphans should return exactly the records whose FK values
        are not in the parent set."""
        child_table, fk_column, parent_table, _ = rel
        all_parents = {parent_table: parent_ids}

        # Build a mix of valid and potentially orphaned records
        records = []
        for pid in list(parent_ids)[:3]:
            records.append(
                FKRecord(child_table, fk_column, pid, parent_table)
            )
        for eid in extra_ids:
            records.append(
                FKRecord(child_table, fk_column, eid, parent_table)
            )

        orphans = find_orphans(records, all_parents)

        for orphan in orphans:
            self.assertNotIn(
                orphan.fk_value,
                parent_ids,
                f"find_orphans returned a record with valid FK: {orphan.fk_value}",
            )

        orphan_values = {o.fk_value for o in orphans}
        for record in records:
            if record.fk_value not in parent_ids:
                self.assertIn(
                    record.fk_value,
                    orphan_values,
                    f"Orphaned record {record.fk_value} not found in orphans list",
                )

    # ------------------------------------------------------------------
    # Property: categorize_orphans counts are correct
    # ------------------------------------------------------------------

    @given(
        data=st.data(),
        num_orphans=st.integers(min_value=0, max_value=15),
    )
    @settings(max_examples=100)
    def test_categorize_orphans_counts_match(
        self, data: st.DataObject, num_orphans: int
    ):
        """For any list of orphan records, categorize_orphans should return
        correct counts per child table."""
        orphans = []
        for _ in range(num_orphans):
            rel = data.draw(fk_relationship_st)
            oid = data.draw(uuid_st)
            orphans.append(
                FKRecord(rel[0], rel[1], oid, rel[2])
            )

        counts = categorize_orphans(orphans)

        total = sum(counts.values())
        self.assertEqual(
            total,
            num_orphans,
            f"Total orphan count {total} != expected {num_orphans}",
        )

        # Verify per-table counts
        for table, count in counts.items():
            actual = sum(1 for o in orphans if o.child_table == table)
            self.assertEqual(
                count,
                actual,
                f"Count for {table}: {count} != actual {actual}",
            )

    # ------------------------------------------------------------------
    # Structural: FK relationships cover all required child tables
    # ------------------------------------------------------------------

    def test_fk_relationships_cover_required_child_tables(self):
        """The FK_RELATIONSHIPS list must cover all child tables from the
        audit scope."""
        required_child_tables = {
            "applications",
            "application_documents",
            "application_grades",
            "payments",
            "application_status_history",
            "application_interviews",
        }
        covered = {rel[0] for rel in FK_RELATIONSHIPS}
        missing = required_child_tables - covered
        self.assertEqual(
            missing,
            set(),
            f"FK_RELATIONSHIPS missing child tables: {missing}",
        )

    def test_fk_relationships_reference_known_parent_tables(self):
        """Every parent table in FK_RELATIONSHIPS must be a known table."""
        for child, fk_col, parent, _ in FK_RELATIONSHIPS:
            self.assertIn(
                parent,
                PARENT_TABLES,
                f"Unknown parent table {parent!r} in FK for "
                f"{child}.{fk_col}",
            )

    def test_empty_parent_set_means_all_orphans(self):
        """When the parent set is empty, every child record is an orphan."""
        records = [
            FKRecord("applications", "user_id", str(uuid.uuid4()), "profiles")
            for _ in range(5)
        ]
        orphans = find_orphans(records, {"profiles": set()})
        self.assertEqual(len(orphans), 5)
