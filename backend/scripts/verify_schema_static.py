#!/usr/bin/env python
"""Static schema verification script.

Verifies that all 30 expected Neon database tables have corresponding Django
model definitions, checks foreign key relationships, and reports on index
coverage — all without requiring a live database connection.

For live database verification, use verify_migration.py instead.

Usage:
    python backend/scripts/verify_schema_static.py
"""

import os
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Django setup
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent

if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

import django  # noqa: E402
django.setup()

from django.apps import apps  # noqa: E402

# ---------------------------------------------------------------------------
# Expected schema
# ---------------------------------------------------------------------------

EXPECTED_TABLES = [
    "profiles",
    "applications",
    "application_documents",
    "application_grades",
    "application_status_history",
    "application_drafts",
    "application_interviews",
    "programs",
    "intakes",
    "program_intakes",
    "course_requirements",
    "subjects",
    "institutions",
    "payments",
    "notifications",
    "user_notification_preferences",
    "email_queue",
    "device_sessions",
    "csrf_tokens",
    "password_reset_tokens",
    "login_attempts",
    "audit_logs",
    "idempotency_keys",
    "settings",
    "user_permission_overrides",
    "migration_history",
    "program_fees",
    "webhook_event_logs",
    "error_logs",
    "sse_events",
]

# Expected foreign key relationships: (child_table.column -> parent_table)
EXPECTED_FK_RELATIONSHIPS = [
    ("applications.user_id", "profiles"),
    ("application_documents.application_id", "applications"),
    ("application_documents.verified_by", "profiles"),
    ("application_grades.application_id", "applications"),
    ("application_grades.subject_id", "subjects"),
    ("application_status_history.application_id", "applications"),
    ("application_status_history.changed_by", "profiles"),
    ("application_drafts.application_id", "applications"),
    ("application_drafts.user_id", "profiles"),
    ("application_interviews.application_id", "applications"),
    ("application_interviews.created_by", "profiles"),
    ("application_interviews.updated_by", "profiles"),
    ("applications.payment_verified_by", "profiles"),
    ("applications.admin_feedback_by", "profiles"),
    ("applications.reviewed_by", "profiles"),
    ("payments.application_id", "applications"),
    ("payments.user_id", "profiles"),
    ("payments.verified_by", "profiles"),
    ("programs.institution_id", "institutions"),
    ("program_intakes.program_id", "programs"),
    ("program_intakes.intake_id", "intakes"),
    ("course_requirements.program_id", "programs"),
    ("course_requirements.subject_id", "subjects"),
    ("device_sessions.user_id", "profiles"),
    ("csrf_tokens.user_id", "profiles"),
    ("password_reset_tokens.user_id", "profiles"),
    ("notifications.user_id", "profiles"),
    ("user_notification_preferences.user_id", "profiles"),
    ("user_permission_overrides.user_id", "profiles"),
    ("program_fees.program_id", "programs"),
]

# Expected indexes for commonly filtered columns
EXPECTED_INDEXES = [
    "applications.user_id",
    "applications.status",
    "applications.program",
    "applications.institution",
    "audit_logs.entity_type",
    "audit_logs.actor_id",
    "device_sessions.user_id",
    "notifications.user_id",
]


def get_model_by_table(table_name: str):
    """Find the Django model class for a given db_table name."""
    for model in apps.get_models():
        if getattr(model._meta, 'db_table', None) == table_name:
            return model
    return None


def verify_tables() -> tuple[list[str], list[str]]:
    """Check all 26 expected tables have Django model definitions."""
    found = []
    missing = []
    for table in EXPECTED_TABLES:
        model = get_model_by_table(table)
        if model:
            found.append(table)
        else:
            missing.append(table)
    return found, missing


def verify_foreign_keys() -> tuple[list[str], list[str]]:
    """Check FK relationships match Django model ForeignKey definitions."""
    matched = []
    mismatched = []

    for fk_spec, expected_parent_table in EXPECTED_FK_RELATIONSHIPS:
        child_table, child_column = fk_spec.split(".")
        child_model = get_model_by_table(child_table)
        if not child_model:
            mismatched.append(
                f"  {fk_spec} -> {expected_parent_table}: "
                f"child model for '{child_table}' not found"
            )
            continue

        # Find the field by db_column or field name
        fk_field = None
        for field in child_model._meta.get_fields():
            if hasattr(field, 'column') and field.column == child_column:
                fk_field = field
                break
            if hasattr(field, 'attname') and field.attname == child_column:
                fk_field = field
                break

        if not fk_field:
            # Try matching by field name (Django appends _id for FK columns)
            field_name = child_column.replace('_id', '') if child_column.endswith('_id') else child_column
            try:
                fk_field = child_model._meta.get_field(field_name)
            except Exception:
                pass

        if not fk_field:
            mismatched.append(
                f"  {fk_spec} -> {expected_parent_table}: "
                f"column '{child_column}' not found on model"
            )
            continue

        if not hasattr(fk_field, 'related_model') or fk_field.related_model is None:
            mismatched.append(
                f"  {fk_spec} -> {expected_parent_table}: "
                f"field '{child_column}' is not a ForeignKey"
            )
            continue

        actual_parent_table = fk_field.related_model._meta.db_table
        if actual_parent_table == expected_parent_table:
            matched.append(f"  {fk_spec} -> {expected_parent_table}")
        else:
            mismatched.append(
                f"  {fk_spec} -> expected '{expected_parent_table}', "
                f"got '{actual_parent_table}'"
            )

    return matched, mismatched


def verify_indexes() -> tuple[list[str], list[str]]:
    """Check if Meta.indexes are defined for commonly filtered columns.

    Since all models use managed=False, Django does not create or manage
    indexes. This check reports which expected indexes have NO corresponding
    Meta.indexes entry — meaning they must exist in the Neon schema directly
    (created by SQL migrations) and can only be verified with a live DB.
    """
    covered = []
    not_covered = []

    for idx_spec in EXPECTED_INDEXES:
        table, column = idx_spec.split(".")
        model = get_model_by_table(table)
        if not model:
            not_covered.append(f"  {idx_spec}: model for '{table}' not found")
            continue

        # Check Meta.indexes
        meta_indexes = getattr(model._meta, 'indexes', [])
        has_meta_index = False
        for idx in meta_indexes:
            if column in [f.name if hasattr(f, 'name') else f for f in idx.fields]:
                has_meta_index = True
                break

        # Check if the column is a ForeignKey (Postgres auto-indexes FK targets
        # only on the referenced side; the referencing FK column is NOT auto-indexed
        # by Postgres, but Django's managed=True would create one)
        is_fk = False
        field_name = column.replace('_id', '') if column.endswith('_id') else column
        try:
            field = model._meta.get_field(field_name)
            if hasattr(field, 'related_model') and field.related_model is not None:
                is_fk = True
        except Exception:
            pass

        if has_meta_index:
            covered.append(f"  {idx_spec}: Meta.indexes defined")
        elif is_fk:
            not_covered.append(
                f"  {idx_spec}: ForeignKey field — index likely exists in Neon "
                f"schema (created by SQL migration), but no Meta.indexes entry "
                f"(managed=False). Verify with live DB."
            )
        else:
            not_covered.append(
                f"  {idx_spec}: NOT a ForeignKey, no Meta.indexes entry. "
                f"Index must be created by SQL migration. Verify with live DB."
            )

    return covered, not_covered


def main() -> int:
    print("=" * 70)
    print("STATIC SCHEMA VERIFICATION REPORT")
    print("Django Models vs Expected Neon Database Schema")
    print("=" * 70)
    print()

    # --- Step 1: Table existence ---
    print("STEP 1: Table Existence (Django model db_table mapping)")
    print("-" * 50)
    found_tables, missing_tables = verify_tables()
    for t in found_tables:
        model = get_model_by_table(t)
        app = model._meta.app_label
        name = model.__name__
        managed = model._meta.managed
        print(f"  [OK]   {t:40s} -> {app}.{name} (managed={managed})")

    if missing_tables:
        for t in missing_tables:
            print(f"  [MISS] {t:40s} -> NO DJANGO MODEL FOUND")

    print()
    print(f"  Result: {len(found_tables)}/{len(EXPECTED_TABLES)} tables have "
          f"Django model definitions")
    if missing_tables:
        print(f"  ⚠ MISSING: {', '.join(missing_tables)}")
    else:
        print("  ✓ All tables accounted for")
    print()

    # --- Step 2: Foreign key relationships ---
    print("STEP 2: Foreign Key Relationships")
    print("-" * 50)
    matched_fks, mismatched_fks = verify_foreign_keys()
    for fk in matched_fks:
        print(f"  [OK]  {fk}")
    for fk in mismatched_fks:
        print(f"  [ERR] {fk}")

    print()
    print(f"  Result: {len(matched_fks)}/{len(EXPECTED_FK_RELATIONSHIPS)} FK "
          f"relationships match")
    if mismatched_fks:
        print(f"  ⚠ {len(mismatched_fks)} FK relationship(s) have issues")
    else:
        print("  ✓ All FK relationships match Django model definitions")
    print()

    # --- Step 3: Index coverage ---
    print("STEP 3: Index Coverage for Commonly Filtered Columns")
    print("-" * 50)
    print("  NOTE: All models use managed=False. Django does not create or")
    print("  manage indexes. Indexes must exist in the Neon schema (created")
    print("  by SQL migrations). This check is informational only.")
    print()
    covered_idx, not_covered_idx = verify_indexes()
    for idx in covered_idx:
        print(f"  [OK]  {idx}")
    for idx in not_covered_idx:
        print(f"  [INFO]{idx}")

    print()
    print(f"  Result: {len(covered_idx)} indexes confirmed via Meta.indexes, "
          f"{len(not_covered_idx)} require live DB verification")
    print()

    # --- Summary ---
    print("=" * 70)
    print("SUMMARY")
    print("=" * 70)
    errors = len(missing_tables) + len(mismatched_fks)
    print(f"  Tables:  {len(found_tables)}/{len(EXPECTED_TABLES)} defined")
    print(f"  FKs:     {len(matched_fks)}/{len(EXPECTED_FK_RELATIONSHIPS)} match")
    print(f"  Indexes: {len(covered_idx)}/{len(EXPECTED_INDEXES)} confirmed "
          f"(rest need live DB)")
    print(f"  Errors:  {errors}")
    print()

    if errors == 0:
        print("  ✓ Static verification PASSED — all tables and FK relationships")
        print("    match Django model definitions.")
        print()
        print("  NEXT STEPS:")
        print("  - Run `python backend/scripts/verify_migration.py` against the")
        print("    live Neon database to confirm tables exist, row counts, FK")
        print("    integrity, and index presence.")
        print("  - The expected indexes for commonly filtered columns are:")
        for idx in EXPECTED_INDEXES:
            print(f"      - {idx}")
    else:
        print("  ✗ Static verification found issues. See details above.")

    print()
    return 1 if errors > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
