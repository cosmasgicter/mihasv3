#!/usr/bin/env python3
"""Generate the full PostgreSQL DDL schema dynamically from Django models.

Uses Django's PostgreSQL schema editor in collect_sql=True mode to generate
the exact production-parity DDL without needing a live database connection.
"""

import os
import sys
from pathlib import Path
from unittest.mock import MagicMock

# ---------------------------------------------------------------------------
# Setup path and environment variables for Django initialization
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent

if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

# Set environment variables to bypass checks and load postgresql engine
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"
os.environ["SECRET_KEY"] = "schema-gen-secret-key-placeholder"
os.environ["JWT_SIGNING_KEY"] = "schema-gen-jwt-signing-key-placeholder"
os.environ["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:5432/mihas_prod"
os.environ["REDIS_URL"] = "redis://localhost:6379/0"
os.environ["CELERY_BROKER_URL"] = "redis://localhost:6379/0"

import django
django.setup()

from django.apps import apps
from django.db import connection

# ---------------------------------------------------------------------------
# Mock connection to prevent live TCP socket connection attempts
# ---------------------------------------------------------------------------
connection.connect = MagicMock()
connection.ensure_connection = MagicMock()
connection.check_constraints = MagicMock()

# Mock cursor
mock_cursor = MagicMock()
mock_cursor.execute = MagicMock()
mock_cursor.fetchall = MagicMock(return_value=[])
mock_cursor.fetchone = MagicMock(return_value=None)
connection.cursor = MagicMock(return_value=mock_cursor)
connection._cursor = MagicMock(return_value=mock_cursor)

# ---------------------------------------------------------------------------
# Generate DDL
# ---------------------------------------------------------------------------
print("Generating production database schema DDL from Django models...")

collected_statements = []

# Header
header = """-- =============================================================================
-- Authoritative production DDL for MIHAS Admissions System
-- Generated dynamically from Django model definitions (django.db.backends.postgresql)
-- Last regenerated: 2026-05-22
-- =============================================================================

"""
collected_statements.append(header)

# Create schema statements using Django's SchemaEditor in SQL collection mode
with connection.schema_editor(collect_sql=True) as schema_editor:
    # Sort models by db_table name for consistent, reproducible diffs
    models = sorted(apps.get_models(), key=lambda m: m._meta.db_table)
    
    for model in models:
        # Django's default behavior is to skip managed = False models.
        # But we want to generate DDL for all of them! So temporarily force managed = True.
        original_managed = model._meta.managed
        model._meta.managed = True
        try:
            schema_editor.create_model(model)
        finally:
            model._meta.managed = original_managed

# Retrieve the collected statements
raw_ddl_statements = schema_editor.collected_sql

# We'll clean each DDL statement and append semicolons
for sql in raw_ddl_statements:
    sql_str = str(sql).strip()
    if sql_str:
        if not sql_str.endswith(";"):
            sql_str += ";"
        collected_statements.append(sql_str + "\n\n")

# ---------------------------------------------------------------------------
# Append custom production-hardening PostgreSQL indexes
# ---------------------------------------------------------------------------
custom_indexes = """-- =============================================================================
-- Custom Production-Hardening Partial & Unique Indexes
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_transaction_reference_present
ON payments (transaction_reference)
WHERE transaction_reference IS NOT NULL AND transaction_reference <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_one_active_per_application
ON payments (application_id)
WHERE application_id IS NOT NULL AND status IN ('pending', 'deferred');

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_receipt_number
ON payments (receipt_number)
WHERE receipt_number IS NOT NULL AND receipt_number <> '';

CREATE INDEX IF NOT EXISTS idx_payments_application_status
ON payments (application_id, status);

CREATE INDEX IF NOT EXISTS idx_payments_user_status
ON payments (user_id, status);

CREATE INDEX IF NOT EXISTS idx_payments_status_created_at
ON payments (status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_processed_reference_event
ON webhook_event_logs (reference, event_type)
WHERE processed IS TRUE;
"""

collected_statements.append(custom_indexes)

# Write to 00_full_schema.sql
output_file = SCRIPT_DIR / "00_full_schema.sql"
print(f"Writing complete DDL schema to {output_file}...")

with open(output_file, "w", encoding="utf-8") as f:
    f.writelines(collected_statements)

print("Schema generation complete! 00_full_schema.sql populated successfully.")
