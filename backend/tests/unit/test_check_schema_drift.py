"""Tests for the check_schema_drift management command.

Verifies:
- Reports no drift when every managed=False model's fields map to
  existing DB columns.
- Reports drift and exits non-zero when a declared column is missing.
- Missing tables trigger a warning by default, fatal with --strict.
"""
from __future__ import annotations

from io import StringIO

import pytest
from django.core.management import call_command
from django.db import connection


def _count_unmanaged_models() -> int:
    from django.apps import apps
    return sum(
        1 for m in apps.get_models()
        if getattr(m._meta, "managed", True) is False
    )


@pytest.mark.django_db
def test_passes_when_schema_matches():
    """Happy path: every managed=False model has all expected columns."""
    out = StringIO()
    # Should exit cleanly. If any managed=False model has genuine drift
    # already, this surfaces it — which is the whole point of the command.
    try:
        call_command("check_schema_drift", stdout=out)
    except SystemExit as exc:
        # If this fires, the live schema has drift — surface that
        # as a test failure with the captured output.
        pytest.fail(f"check_schema_drift reported drift: {out.getvalue()}")

    text = out.getvalue()
    assert "No schema drift" in text
    # At least one managed=False model exists in this codebase
    # (ApplicationDocument, Payment, ApplicationGrade, etc.).
    assert _count_unmanaged_models() >= 1


@pytest.mark.django_db
def test_detects_missing_column(monkeypatch):
    """Introduce a fake declared column on an existing model and verify drift is caught."""
    from django.db import models
    from apps.documents.models import ApplicationDocument

    # Monkey-patch a fake field onto the model's _meta for the duration
    # of the test. Easier than building a full throwaway model class
    # because Django's app registry resists runtime additions.
    fake_field = models.CharField(max_length=10, null=True, db_column="__fake_drift_col__")
    fake_field.name = "__fake_drift_col__"
    fake_field.concrete = True
    fake_field.many_to_many = False
    fake_field.column = "__fake_drift_col__"

    original_fields = ApplicationDocument._meta.get_fields()
    monkeypatch.setattr(
        ApplicationDocument._meta,
        "get_fields",
        lambda *a, **kw: list(original_fields) + [fake_field],
    )

    out = StringIO()
    with pytest.raises(SystemExit) as exc:
        call_command("check_schema_drift", stdout=out)
    assert exc.value.code == 1

    text = out.getvalue()
    assert "Schema drift detected" in text
    assert "__fake_drift_col__" in text
    assert "apply_sql_migrations" in text


@pytest.mark.django_db
def test_missing_table_warns_without_strict(monkeypatch):
    """Default behaviour: missing tables are warnings, not failures."""
    from apps.documents.models import ApplicationDocument

    monkeypatch.setattr(
        ApplicationDocument._meta,
        "db_table",
        "__does_not_exist__",
    )

    out = StringIO()
    try:
        call_command("check_schema_drift", stdout=out)
    except SystemExit:
        pytest.fail(
            f"check_schema_drift should not have exited without --strict. Output:\n{out.getvalue()}"
        )
    assert "Missing tables" in out.getvalue()


@pytest.mark.django_db
def test_missing_table_fatal_with_strict(monkeypatch):
    from apps.documents.models import ApplicationDocument

    monkeypatch.setattr(
        ApplicationDocument._meta,
        "db_table",
        "__also_does_not_exist__",
    )

    out = StringIO()
    with pytest.raises(SystemExit) as exc:
        call_command("check_schema_drift", "--strict", stdout=out)
    assert exc.value.code == 1
