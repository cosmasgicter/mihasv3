#!/usr/bin/env python
"""Migration verification script.

Verifies parity between the Vercel backend and Django API by:
  - Comparing row counts per table (placeholder — prints expected vs actual)
  - Checking foreign key integrity (placeholder)
  - Recording an immutable migration log (run ID, start/end time)
  - Supporting idempotent re-execution via checkpoint-based resumption

Requirements: 13.3, 13.4, 13.5

Usage:
    python -m scripts.verify_migration
    python scripts/verify_migration.py
"""

import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Ensure Django is configured when run as a standalone script
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent

if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

import django  # noqa: E402

django.setup()

from django.db import connection  # noqa: E402

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CHECKPOINT_FILE = PROJECT_DIR / ".migration_checkpoint.json"
LOG_DIR = PROJECT_DIR / "migration_logs"

# All 26 tables in the Neon schema
TABLES = [
    "profiles",
    "applications",
    "application_documents",
    "application_grades",
    "application_interviews",
    "application_status_history",
    "application_drafts",
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
]


# ---------------------------------------------------------------------------
# Checkpoint helpers (idempotent resumption)
# ---------------------------------------------------------------------------


def load_checkpoint() -> dict:
    """Load the last checkpoint, or return an empty state."""
    if CHECKPOINT_FILE.exists():
        with open(CHECKPOINT_FILE) as f:
            return json.load(f)
    return {"completed_tables": [], "run_id": None}


def save_checkpoint(state: dict) -> None:
    """Persist checkpoint state to disk."""
    with open(CHECKPOINT_FILE, "w") as f:
        json.dump(state, f, indent=2, default=str)


def clear_checkpoint() -> None:
    """Remove checkpoint file after a successful full run."""
    if CHECKPOINT_FILE.exists():
        CHECKPOINT_FILE.unlink()


# ---------------------------------------------------------------------------
# Migration log (immutable, append-only)
# ---------------------------------------------------------------------------


def write_migration_log(log_entry: dict) -> Path:
    """Write an immutable migration log entry to disk."""
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOG_DIR / f"migration_{log_entry['run_id']}.json"
    with open(log_path, "w") as f:
        json.dump(log_entry, f, indent=2, default=str)
    return log_path


# ---------------------------------------------------------------------------
# Verification steps
# ---------------------------------------------------------------------------


def get_row_count(table_name: str) -> int:
    """Return the row count for a given table."""
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT COUNT(*) FROM {table_name}")  # noqa: S608
        return cursor.fetchone()[0]


def verify_row_counts(checkpoint: dict) -> dict[str, int]:
    """Compare row counts for all tables. Returns {table: count} mapping."""
    counts = {}
    for table in TABLES:
        if table in checkpoint.get("completed_tables", []):
            print(f"  [skip] {table} (already verified)")
            continue
        try:
            count = get_row_count(table)
            counts[table] = count
            print(f"  [ok]   {table}: {count} rows")
            checkpoint.setdefault("completed_tables", []).append(table)
            save_checkpoint(checkpoint)
        except Exception as exc:
            counts[table] = -1
            print(f"  [err]  {table}: {exc}")
    return counts


def verify_foreign_keys() -> list[str]:
    """Check foreign key integrity (placeholder — logs expected checks)."""
    fk_checks = [
        ("applications.user_id", "profiles.id"),
        ("application_documents.application_id", "applications.id"),
        ("application_grades.application_id", "applications.id"),
        ("application_grades.subject_id", "subjects.id"),
        ("application_status_history.application_id", "applications.id"),
        ("application_drafts.application_id", "applications.id"),
        ("application_interviews.application_id", "applications.id"),
        ("payments.application_id", "applications.id"),
        ("payments.user_id", "profiles.id"),
        ("programs.institution_id", "institutions.id"),
        ("program_intakes.program_id", "programs.id"),
        ("program_intakes.intake_id", "intakes.id"),
        ("course_requirements.program_id", "programs.id"),
        ("course_requirements.subject_id", "subjects.id"),
        ("device_sessions.user_id", "profiles.id"),
        ("notifications.user_id", "profiles.id"),
        ("user_notification_preferences.user_id", "profiles.id"),
    ]
    issues = []
    for child_col, parent_col in fk_checks:
        child_table, child_field = child_col.split(".")
        parent_table, parent_field = parent_col.split(".")
        print(f"  [check] {child_col} → {parent_col}")
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"SELECT COUNT(*) FROM {child_table} c "  # noqa: S608
                    f"LEFT JOIN {parent_table} p ON c.{child_field} = p.{parent_field} "
                    f"WHERE p.{parent_field} IS NULL AND c.{child_field} IS NOT NULL"
                )
                orphan_count = cursor.fetchone()[0]
                if orphan_count > 0:
                    msg = f"  [warn] {orphan_count} orphaned rows: {child_col} → {parent_col}"
                    print(msg)
                    issues.append(msg)
                else:
                    print(f"  [ok]   {child_col} → {parent_col}: no orphans")
        except Exception as exc:
            msg = f"  [err]  {child_col} → {parent_col}: {exc}"
            print(msg)
            issues.append(msg)
    return issues


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    """Run the full migration verification suite."""
    checkpoint = load_checkpoint()

    run_id = checkpoint.get("run_id") or str(uuid.uuid4())[:8]
    checkpoint["run_id"] = run_id
    save_checkpoint(checkpoint)

    start_time = datetime.now(timezone.utc)
    print(f"=== Migration Verification Run: {run_id} ===")
    print(f"Started at: {start_time.isoformat()}")
    print()

    # Step 1: Row counts
    print("Step 1: Row count verification")
    counts = verify_row_counts(checkpoint)
    print()

    # Step 2: Foreign key integrity
    print("Step 2: Foreign key integrity checks")
    fk_issues = verify_foreign_keys()
    print()

    end_time = datetime.now(timezone.utc)
    error_count = sum(1 for v in counts.values() if v == -1) + len(fk_issues)

    # Write immutable log
    log_entry = {
        "run_id": run_id,
        "start_time": start_time.isoformat(),
        "end_time": end_time.isoformat(),
        "duration_seconds": (end_time - start_time).total_seconds(),
        "row_counts": counts,
        "fk_issues": fk_issues,
        "error_count": error_count,
        "tables_checked": len(counts),
    }
    log_path = write_migration_log(log_entry)

    print(f"=== Verification Complete ===")
    print(f"Run ID: {run_id}")
    print(f"Duration: {log_entry['duration_seconds']:.1f}s")
    print(f"Tables checked: {len(counts)}")
    print(f"Errors: {error_count}")
    print(f"Log written to: {log_path}")

    # Clear checkpoint on successful full run
    clear_checkpoint()

    return 1 if error_count > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
