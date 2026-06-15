"""Property-based tests — backward compatibility for legacy applications.

Spec: ``multi-tenant-beanola-remediation`` — Property 25.

Feature: multi-tenant-beanola-remediation, Property 25: Legacy
null-canonical-ID applications remain readable — applications with null
canonical IDs return via their ``Legacy_String_Fields`` without error.

Background
----------
The ``applications`` table carries three immutable display-snapshot columns —
``applications.institution`` / ``applications.program`` / ``applications.intake``
(the ``Legacy_String_Fields``) — alongside four nullable canonical foreign keys
added by the multi-tenant migration:

    institution_ref   -> db column ``institution_id``
    canonical_program -> db column ``program_id``
    program_offering  -> db column ``program_offering_id``
    intake_ref        -> db column ``intake_id``

Pre-migration ("legacy") applications have one or more of those canonical IDs
``NULL`` while still carrying their string snapshots. Requirement 20.3 mandates
that such rows stay **readable** through the read paths using their
``Legacy_String_Fields`` values, without the read returning an error.

This module pins Property 25 by exercising the real read paths against legacy
rows:

  * the ORM read path (re-fetch + column access), and
  * the API read serializers
    (``ApplicationSerializer`` — application detail read,
     ``ApplicationListSerializer`` — admin/student list read,
     ``ApplicationTrackingSerializer`` — public tracking read).

Each property test runs with ``max_examples=25`` and a pinned seed
(``--hypothesis-seed=0`` on the CLI) per the spec's property-suite convention.

**Validates: Requirements 20.3**
"""

from __future__ import annotations

import uuid

import pytest
from django.utils import timezone
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from apps.applications.models import Application
from apps.applications.serializers import (
    ApplicationListSerializer,
    ApplicationSerializer,
    ApplicationTrackingSerializer,
)
from tests.tenant_fixtures import build_profile, build_tenant_world


# ---------------------------------------------------------------------------
# Shared strategies
# ---------------------------------------------------------------------------

# Legacy string snapshots are free-text display values copied from the
# pre-migration world (e.g. "MIHAS", "Diploma in Clinical Medicine",
# "January 2025"). Generate non-empty printable strings, excluding the NUL
# byte which Postgres text columns reject, so the read path is exercised over
# a realistic spread of legacy display values.
_LEGACY_ALPHABET = st.characters(
    blacklist_categories=("Cs", "Cc"),
    blacklist_characters="\x00",
)
LEGACY_STRING = (
    st.text(alphabet=_LEGACY_ALPHABET, min_size=1, max_size=120)
    .map(str.strip)
    .filter(bool)
)

# A spread of realistic legacy snapshots mixed with random text so the
# generator covers both the known production values and arbitrary input.
LEGACY_INSTITUTION = st.one_of(st.sampled_from(["MIHAS", "KATC"]), LEGACY_STRING)
LEGACY_PROGRAM = st.one_of(
    st.sampled_from(["Diploma in Clinical Medicine", "Diploma in Nursing", "CLM"]),
    LEGACY_STRING,
)
LEGACY_INTAKE = st.one_of(
    st.sampled_from(["January 2025", "July 2025", "January 2026"]),
    LEGACY_STRING,
)

# Application status values do not affect canonical-ID nullability; sample a
# representative spread so the read path is exercised across lifecycle states.
APPLICATION_STATUS = st.sampled_from(
    ["draft", "submitted", "under_review", "approved", "rejected", "enrolled"]
)

# The four canonical FK attribute names on the model. Used by the partial-null
# property to null out an arbitrary non-empty subset.
_CANONICAL_FK_ATTNAMES = [
    "institution_ref_id",
    "canonical_program_id",
    "program_offering_id",
    "intake_ref_id",
]

# Maps the model FK attname to the serializer output field name.
_SERIALIZER_FIELD_BY_ATTNAME = {
    "institution_ref_id": "institution_id",
    "canonical_program_id": "program_id",
    "program_offering_id": "program_offering_id",
    "intake_ref_id": "intake_id",
}

# ≥ configured examples; deadline relaxed for DB-backed reads. Seed pinned via
# the CLI flag ``--hypothesis-seed=0``.
HYPOTHESIS_SETTINGS = settings(
    max_examples=25,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)


# ---------------------------------------------------------------------------
# Legacy-row builder
# ---------------------------------------------------------------------------


def build_legacy_application(*, institution, program, intake, status="submitted"):
    """Persist a pre-migration ``applications`` row directly.

    All four canonical FK columns (``institution_id`` / ``program_id`` /
    ``program_offering_id`` / ``intake_ref_id``) are left unset, so they
    default to ``NULL`` — exactly the shape of a legacy row created before the
    multi-tenant migration. The ``Legacy_String_Fields`` (``institution`` /
    ``program`` / ``intake``) carry the immutable display snapshots.

    Mirrors how ``backend/tests/unit/test_payment_backward_compatibility.py``
    creates legacy applications, rather than the canonical-ID-aware
    ``build_application`` fixture (which derives the legacy strings from linked
    rows and cannot represent a null-FK row).
    """
    student = build_profile(role="student")
    now = timezone.now()
    sfx = uuid.uuid4().hex[:8].upper()
    return Application.objects.create(
        id=uuid.uuid4(),
        application_number=f"APP-{now:%Y%m%d}-{sfx}",
        public_tracking_code=f"TRK-{uuid.uuid4().hex[:12].upper()}",
        user=student,
        full_name="Legacy Applicant",
        date_of_birth=now.date().replace(year=2000),
        sex="Female",
        phone="+260970000001",
        email=f"legacy-{sfx.lower()}@example.com",
        residence_town="Lusaka",
        nationality="Zambian",
        country="Zambia",
        # Legacy_String_Fields — populated; canonical FK columns left NULL.
        program=program,
        intake=intake,
        institution=institution,
        status=status,
        version=1,
        created_at=now,
        updated_at=now,
    )


# ---------------------------------------------------------------------------
# Assertion helpers
# ---------------------------------------------------------------------------


def _assert_orm_read_surfaces_legacy(app_id, *, institution, program, intake):
    """Re-fetch ``app_id`` via the ORM and assert the legacy read invariant.

    Returns the re-read instance so callers can pass it to the serializers.
    """
    # ORM read path must not raise for a null-canonical-ID row.
    reread = Application.objects.get(id=app_id)

    # The four canonical IDs that make this a "legacy" row are all NULL.
    assert reread.institution_ref_id is None
    assert reread.canonical_program_id is None
    assert reread.program_offering_id is None
    assert reread.intake_ref_id is None

    # The Legacy_String_Fields still carry the display snapshots verbatim.
    assert reread.institution == institution
    assert reread.program == program
    assert reread.intake == intake
    return reread


def _assert_read_serializers_surface_legacy(instance, *, institution, program, intake):
    """Every API read serializer renders the row using its legacy strings.

    Asserts no serializer raises, the canonical-ID output fields are ``None``
    (the row has no canonical IDs), and the legacy string snapshots are the
    values surfaced to the client.
    """
    # Detail read (full application serializer).
    detail = dict(ApplicationSerializer(instance).data)
    assert detail["institution"] == institution
    assert detail["program"] == program
    assert detail["intake"] == intake
    assert detail["institution_id"] is None
    assert detail["program_id"] is None
    assert detail["program_offering_id"] is None
    assert detail["intake_id"] is None

    # List read (admin/student roster serializer).
    listed = dict(ApplicationListSerializer(instance).data)
    assert listed["institution"] == institution
    assert listed["program"] == program
    assert listed["intake"] == intake
    assert listed["institution_id"] is None
    assert listed["program_id"] is None
    assert listed["program_offering_id"] is None
    assert listed["intake_id"] is None

    # Public tracking read (unauthenticated serializer).
    tracked = dict(ApplicationTrackingSerializer(instance).data)
    assert tracked["institution"] == institution
    assert tracked["program"] == program
    assert tracked["intake"] == intake


# ---------------------------------------------------------------------------
# Property 25
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestLegacyNullCanonicalReadable:
    """Property 25: legacy null-canonical-ID applications remain readable.

    **Validates: Requirements 20.3**
    """

    def test_fully_legacy_application_reads_without_error(self, db):
        """Concrete check: a row with all four canonical IDs NULL but populated
        Legacy_String_Fields reads cleanly through the ORM and every API read
        serializer."""
        app = build_legacy_application(
            institution="MIHAS",
            program="Diploma in Clinical Medicine",
            intake="January 2025",
            status="submitted",
        )
        reread = _assert_orm_read_surfaces_legacy(
            app.id,
            institution="MIHAS",
            program="Diploma in Clinical Medicine",
            intake="January 2025",
        )
        _assert_read_serializers_surface_legacy(
            reread,
            institution="MIHAS",
            program="Diploma in Clinical Medicine",
            intake="January 2025",
        )

    @HYPOTHESIS_SETTINGS
    @given(
        institution=LEGACY_INSTITUTION,
        program=LEGACY_PROGRAM,
        intake=LEGACY_INTAKE,
        status=APPLICATION_STATUS,
    )
    def test_all_null_canonical_ids_remain_readable(
        self, db, institution, program, intake, status
    ):
        """P25 (property): *for any* legacy application whose four canonical IDs
        are all NULL, the ORM read path and every API read serializer return the
        row using its ``Legacy_String_Fields`` values without raising.

        The builder leaves the four canonical FK columns NULL while always
        persisting the legacy ``institution`` / ``program`` / ``intake``
        snapshots, exactly modelling a pre-migration row.
        """
        app = build_legacy_application(
            institution=institution,
            program=program,
            intake=intake,
            status=status,
        )

        reread = _assert_orm_read_surfaces_legacy(
            app.id, institution=institution, program=program, intake=intake
        )
        _assert_read_serializers_surface_legacy(
            reread, institution=institution, program=program, intake=intake
        )

    @HYPOTHESIS_SETTINGS
    @given(null_attnames=st.sets(st.sampled_from(_CANONICAL_FK_ATTNAMES), min_size=1))
    def test_partial_null_canonical_ids_remain_readable(self, db, null_attnames):
        """P25 (property): *for any* non-empty subset of the four canonical IDs
        set to NULL on an otherwise fully-linked application, the read paths
        still return the row using its ``Legacy_String_Fields`` without error.

        This covers the design's "one or more null canonical IDs" phrasing: a
        partially-migrated row (some canonical FKs populated, others NULL) must
        remain readable. The nulled IDs surface as ``None``; the legacy string
        snapshots are always present and surfaced.
        """
        world = build_tenant_world(with_canonical_ids=True)
        app = world.application
        assert app is not None

        # Snapshot the legacy strings the fixture wrote for this world.
        legacy_institution = app.institution
        legacy_program = app.program
        legacy_intake = app.intake

        # Null out the generated subset of canonical FK columns.
        null_attnames = list(null_attnames)
        for attname in null_attnames:
            setattr(app, attname, None)
        app.save(update_fields=null_attnames)

        # ORM read must not raise and the nulled IDs must read back as None.
        reread = Application.objects.get(id=app.id)
        for attname in null_attnames:
            assert getattr(reread, attname) is None

        # Legacy string snapshots are intact regardless of which IDs are null.
        assert reread.institution == legacy_institution
        assert reread.program == legacy_program
        assert reread.intake == legacy_intake

        # Every API read serializer renders without error and surfaces the
        # legacy strings; nulled canonical IDs surface as None.
        for serializer_cls in (ApplicationSerializer, ApplicationListSerializer):
            data = dict(serializer_cls(reread).data)
            assert data["institution"] == legacy_institution
            assert data["program"] == legacy_program
            assert data["intake"] == legacy_intake
            for attname in null_attnames:
                assert data[_SERIALIZER_FIELD_BY_ATTNAME[attname]] is None

        tracked = dict(ApplicationTrackingSerializer(reread).data)
        assert tracked["institution"] == legacy_institution
        assert tracked["program"] == legacy_program
        assert tracked["intake"] == legacy_intake
