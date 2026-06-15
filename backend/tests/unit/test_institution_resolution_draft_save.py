"""Regression: institution resolution + draft-save institution fallback.

Covers the production bug where a valid draft application failed to save with
"Institution: Invalid institution reference." because:
  1. IdentifierResolver.resolve_institution could not resolve a UUID (the
     white-label / assigned-school path sends the institution primary key), and
  2. the wizard's cosmetic fallback label ("Beanola Admissions") did not match
     any real institution, and the serializer hard-rejected it instead of
     deriving the institution from the chosen program.
"""

from __future__ import annotations

import uuid

import pytest

from apps.applications.identifier_resolver import IdentifierResolver
from apps.applications.serializers import (
    ApplicationSerializer,
    _institution_name_for_program,
)

pytestmark = pytest.mark.django_db


def _make_institution(**kwargs):
    from apps.catalog.models import Institution

    defaults = dict(
        id=uuid.uuid4(), code="TST", name="Test Institute",
        full_name="Test Institute", is_active=True,
    )
    defaults.update(kwargs)
    return Institution.objects.create(**defaults)


def _make_program(institution, **kwargs):
    from apps.catalog.models import Program

    defaults = dict(
        id=uuid.uuid4(), name="Test Diploma", code="TDP",
        is_active=True, institution=institution,
    )
    defaults.update(kwargs)
    return Program.objects.create(**defaults)


def test_resolve_institution_by_uuid():
    """resolve_institution accepts the institution primary key (white-label path)."""
    inst = _make_institution(code="UUI", name="UUID School", full_name="UUID School")
    resolved = IdentifierResolver.resolve_institution(str(inst.id))
    assert resolved.source == "id"
    assert resolved.name == "UUID School"


def test_resolve_institution_by_code_and_name_still_work():
    inst = _make_institution(code="ABC", name="ABC College", full_name="ABC College Full")
    assert IdentifierResolver.resolve_institution("ABC").source == "code"
    assert IdentifierResolver.resolve_institution("ABC College").source == "name"
    assert IdentifierResolver.resolve_institution("ABC College Full").source == "full_name"


def test_resolve_institution_unknown_is_not_found():
    assert IdentifierResolver.resolve_institution("Beanola Admissions").source == "not_found"


def test_institution_name_for_program_derives_from_program():
    inst = _make_institution(code="OWN", name="Owning School")
    prog = _make_program(inst, name="Owned Program", code="OWP")
    assert _institution_name_for_program("Owned Program") == "Owning School"
    assert _institution_name_for_program(str(prog.id)) == "Owning School"


def test_update_serializer_accepts_unresolvable_institution_when_program_valid():
    """A cosmetic 'Beanola Admissions' label no longer blocks a draft save:
    the institution is derived from the program's owning school."""
    inst = _make_institution(code="DRV", name="Derived School")
    _make_program(inst, name="Derived Program", code="DRVP")

    serializer = ApplicationSerializer(
        instance=None,
        data={"institution": "Beanola Admissions", "program": "Derived Program"},
        partial=True,
    )
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data["institution"] == "Derived School"


def test_update_serializer_rejects_unresolvable_institution_with_no_program():
    """With neither a resolvable institution nor a program to derive from, the
    serializer still rejects an invalid institution reference."""
    serializer = ApplicationSerializer(
        instance=None,
        data={"institution": "Nonexistent School XYZ"},
        partial=True,
    )
    assert not serializer.is_valid()
    assert "institution" in serializer.errors
