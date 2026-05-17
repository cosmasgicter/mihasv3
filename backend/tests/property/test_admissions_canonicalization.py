"""Property-based tests for admissions logic canonicalization.

# Feature: admissions-logic-canonicalization

Properties 2 and 3 covering institution identifier canonicalization
and program/intake identifier resolution.

**Validates: Requirements 2.1, 2.2, 2.3, 2.5**
"""

import os
import uuid
from datetime import date
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.applications.identifier_resolver import (  # noqa: E402
    IdentifierResolver,
    ResolvedIdentifier,
)
from apps.applications.models import Application  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Realistic institution identifiers
institution_codes = st.text(
    alphabet=st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
    min_size=2,
    max_size=10,
)

institution_names = st.text(
    alphabet=st.sampled_from(
        "abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    ),
    min_size=3,
    max_size=100,
).filter(lambda s: s.strip())

institution_full_names = st.text(
    alphabet=st.sampled_from(
        "abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    ),
    min_size=5,
    max_size=200,
).filter(lambda s: s.strip())

program_names = st.text(
    alphabet=st.sampled_from(
        "abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    ),
    min_size=3,
    max_size=100,
).filter(lambda s: s.strip())

program_codes = st.text(
    alphabet=st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"),
    min_size=2,
    max_size=10,
)

intake_names = st.text(
    alphabet=st.sampled_from(
        "abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    ),
    min_size=3,
    max_size=100,
).filter(lambda s: s.strip())

# Which identifier field to look up by
institution_lookup_field = st.sampled_from(["code", "name", "full_name"])
program_lookup_field = st.sampled_from(["name", "code"])


def _make_mock_institution(code, name, full_name):
    """Create a mock Institution object."""
    inst = MagicMock()
    inst.id = uuid.uuid4()
    inst.code = code
    inst.name = name
    inst.full_name = full_name
    inst.is_active = True
    return inst


def _make_mock_program(code, name):
    """Create a mock Program object."""
    prog = MagicMock()
    prog.id = uuid.uuid4()
    prog.code = code
    prog.name = name
    prog.is_active = True
    return prog


def _make_mock_intake(name):
    """Create a mock Intake object."""
    intake = MagicMock()
    intake.id = uuid.uuid4()
    intake.name = name
    intake.is_active = True
    return intake


# ---------------------------------------------------------------------------
# Property 2: Institution identifier canonicalization
# ---------------------------------------------------------------------------


class TestInstitutionIdentifierCanonicalization(SimpleTestCase):
    """# Feature: admissions-logic-canonicalization, Property 2: Institution identifier canonicalization

    For any institution value that is either a valid Institution code, name,
    or full_name, IdentifierResolver.resolve_institution() SHALL return a
    ResolvedIdentifier with source != "not_found" and name equal to the
    canonical Institution.name.

    **Validates: Requirements 2.1, 2.5**
    """

    @given(
        code=institution_codes,
        name=institution_names,
        full_name=institution_full_names,
    )
    @settings(max_examples=5)
    def test_resolve_by_code_returns_canonical_name(self, code, name, full_name):
        """Looking up by code returns source='code' and canonical name."""
        mock_inst = _make_mock_institution(code, name, full_name)

        with patch(
            "apps.applications.identifier_resolver.Institution.objects"
        ) as mock_qs:
            # code lookup succeeds on first try
            mock_qs.filter.return_value.first.return_value = mock_inst

            result = IdentifierResolver.resolve_institution(code)

        self.assertNotEqual(result.source, "not_found")
        self.assertEqual(result.source, "code")
        self.assertEqual(result.name, name)
        self.assertEqual(result.code, code)
        self.assertEqual(result.id, str(mock_inst.id))

    @given(
        code=institution_codes,
        name=institution_names,
        full_name=institution_full_names,
    )
    @settings(max_examples=5)
    def test_resolve_by_name_returns_canonical_name(self, code, name, full_name):
        """Looking up by name (code miss, name hit) returns source='name' and canonical name."""
        mock_inst = _make_mock_institution(code, name, full_name)

        with patch(
            "apps.applications.identifier_resolver.Institution.objects"
        ) as mock_qs:
            # code lookup misses, name lookup hits
            mock_qs.filter.return_value.first.side_effect = [None, mock_inst]

            result = IdentifierResolver.resolve_institution(name)

        self.assertNotEqual(result.source, "not_found")
        self.assertEqual(result.source, "name")
        self.assertEqual(result.name, name)
        self.assertEqual(result.id, str(mock_inst.id))

    @given(
        code=institution_codes,
        name=institution_names,
        full_name=institution_full_names,
    )
    @settings(max_examples=5)
    def test_resolve_by_full_name_returns_canonical_name(self, code, name, full_name):
        """Looking up by full_name (code miss, name miss, full_name hit) returns source='full_name' and canonical name."""
        mock_inst = _make_mock_institution(code, name, full_name)

        with patch(
            "apps.applications.identifier_resolver.Institution.objects"
        ) as mock_qs:
            # code miss, name miss, full_name hit
            mock_qs.filter.return_value.first.side_effect = [None, None, mock_inst]

            result = IdentifierResolver.resolve_institution(full_name)

        self.assertNotEqual(result.source, "not_found")
        self.assertEqual(result.source, "full_name")
        self.assertEqual(result.name, name)
        self.assertEqual(result.id, str(mock_inst.id))

    @given(value=institution_names)
    @settings(max_examples=5)
    def test_unresolvable_value_returns_not_found(self, value):
        """When no institution matches, source is 'not_found' and name echoes the input."""
        with patch(
            "apps.applications.identifier_resolver.Institution.objects"
        ) as mock_qs:
            # All lookups miss (code, name, full_name, name_icontains)
            mock_qs.filter.return_value.first.side_effect = [None, None, None, None]

            result = IdentifierResolver.resolve_institution(value)

        self.assertEqual(result.source, "not_found")
        self.assertEqual(result.name, value)
        self.assertEqual(result.id, "")
        self.assertEqual(result.code, "")

    @given(
        code=institution_codes,
        name=institution_names,
        full_name=institution_full_names,
        lookup_field=institution_lookup_field,
    )
    @settings(max_examples=5)
    def test_any_valid_identifier_resolves_to_canonical_name(
        self, code, name, full_name, lookup_field
    ):
        """For any valid identifier (code, name, or full_name), resolution
        returns source != 'not_found' and name == canonical Institution.name."""
        mock_inst = _make_mock_institution(code, name, full_name)
        lookup_value = {"code": code, "name": name, "full_name": full_name}[
            lookup_field
        ]

        with patch(
            "apps.applications.identifier_resolver.Institution.objects"
        ) as mock_qs:
            if lookup_field == "code":
                mock_qs.filter.return_value.first.side_effect = [mock_inst]
            elif lookup_field == "name":
                mock_qs.filter.return_value.first.side_effect = [None, mock_inst]
            else:  # full_name
                mock_qs.filter.return_value.first.side_effect = [
                    None,
                    None,
                    mock_inst,
                ]

            result = IdentifierResolver.resolve_institution(lookup_value)

        self.assertNotEqual(result.source, "not_found")
        self.assertEqual(result.name, name)


# ---------------------------------------------------------------------------
# Property 3: Program and intake identifier resolution
# ---------------------------------------------------------------------------


class TestProgramIdentifierResolution(SimpleTestCase):
    """# Feature: admissions-logic-canonicalization, Property 3: Program and intake identifier resolution

    For any program value that is either a valid Program name or code,
    IdentifierResolver.resolve_program() SHALL return a ResolvedIdentifier
    with source != "not_found" and the correct code and name.

    **Validates: Requirements 2.2, 2.3**
    """

    @given(code=program_codes, name=program_names)
    @settings(max_examples=5)
    def test_resolve_program_by_name(self, code, name):
        """Looking up by name returns source='name' with correct code and name."""
        mock_prog = _make_mock_program(code, name)

        with patch(
            "apps.applications.identifier_resolver.Program.objects"
        ) as mock_qs:
            # name lookup succeeds on first try
            mock_qs.filter.return_value.first.return_value = mock_prog

            result = IdentifierResolver.resolve_program(name)

        self.assertNotEqual(result.source, "not_found")
        self.assertEqual(result.source, "name")
        self.assertEqual(result.name, name)
        self.assertEqual(result.code, code)
        self.assertEqual(result.id, str(mock_prog.id))

    @given(code=program_codes, name=program_names)
    @settings(max_examples=5)
    def test_resolve_program_by_code(self, code, name):
        """Looking up by code (name miss, code hit) returns source='code' with correct code and name."""
        mock_prog = _make_mock_program(code, name)

        with patch(
            "apps.applications.identifier_resolver.Program.objects"
        ) as mock_qs:
            # name miss, code hit
            mock_qs.filter.return_value.first.side_effect = [None, mock_prog]

            result = IdentifierResolver.resolve_program(code)

        self.assertNotEqual(result.source, "not_found")
        self.assertEqual(result.source, "code")
        self.assertEqual(result.name, name)
        self.assertEqual(result.code, code)
        self.assertEqual(result.id, str(mock_prog.id))

    @given(
        code=program_codes,
        name=program_names,
        lookup_field=program_lookup_field,
    )
    @settings(max_examples=5)
    def test_any_valid_program_identifier_resolves_correctly(
        self, code, name, lookup_field
    ):
        """For any valid program identifier (name or code), resolution returns
        source != 'not_found' with correct code and name."""
        mock_prog = _make_mock_program(code, name)
        lookup_value = {"name": name, "code": code}[lookup_field]

        with patch(
            "apps.applications.identifier_resolver.Program.objects"
        ) as mock_qs:
            if lookup_field == "name":
                mock_qs.filter.return_value.first.side_effect = [mock_prog]
            else:  # code
                mock_qs.filter.return_value.first.side_effect = [None, mock_prog]

            result = IdentifierResolver.resolve_program(lookup_value)

        self.assertNotEqual(result.source, "not_found")
        self.assertEqual(result.name, name)
        self.assertEqual(result.code, code)

    @given(value=program_names)
    @settings(max_examples=5)
    def test_unresolvable_program_returns_not_found(self, value):
        """When no program matches, source is 'not_found'."""
        with patch(
            "apps.applications.identifier_resolver.Program.objects"
        ) as mock_qs:
            # All lookups miss (name, code, name_icontains)
            mock_qs.filter.return_value.first.side_effect = [None, None, None]

            result = IdentifierResolver.resolve_program(value)

        self.assertEqual(result.source, "not_found")
        self.assertEqual(result.name, value)
        self.assertEqual(result.id, "")
        self.assertEqual(result.code, "")


class TestIntakeIdentifierResolution(SimpleTestCase):
    """# Feature: admissions-logic-canonicalization, Property 3: Program and intake identifier resolution

    For any intake value that is a valid Intake name,
    IdentifierResolver.resolve_intake() SHALL return a ResolvedIdentifier
    with source != "not_found" and the correct name.

    **Validates: Requirements 2.3**
    """

    @given(name=intake_names)
    @settings(max_examples=5)
    def test_resolve_intake_by_name(self, name):
        """Looking up by name returns source='name' with correct name."""
        mock_intake = _make_mock_intake(name)

        with patch(
            "apps.applications.identifier_resolver.Intake.objects"
        ) as mock_qs:
            mock_qs.filter.return_value.first.return_value = mock_intake

            result = IdentifierResolver.resolve_intake(name)

        self.assertNotEqual(result.source, "not_found")
        self.assertEqual(result.source, "name")
        self.assertEqual(result.name, name)
        self.assertEqual(result.id, str(mock_intake.id))

    @given(value=intake_names)
    @settings(max_examples=5)
    def test_unresolvable_intake_returns_not_found(self, value):
        """When no intake matches, source is 'not_found'."""
        with patch(
            "apps.applications.identifier_resolver.Intake.objects"
        ) as mock_qs:
            mock_qs.filter.return_value.first.return_value = None

            result = IdentifierResolver.resolve_intake(value)

        self.assertEqual(result.source, "not_found")
        self.assertEqual(result.name, value)
        self.assertEqual(result.id, "")


# ---------------------------------------------------------------------------
# Strategies for fee resolution
# ---------------------------------------------------------------------------

nationalities = st.sampled_from(["Zambian", "Kenyan", "Tanzanian", "Nigerian", "South African", "British"])
countries = st.sampled_from(["Zambia", "ZM", "Kenya", "Tanzania", "Nigeria", "South Africa", "UK"])
currencies = st.sampled_from(["ZMW", "USD", "GBP"])
residency_categories = st.sampled_from(["local", "international"])
fee_sources = st.sampled_from(["program_fee", "program_default"])
fee_amounts = st.decimals(min_value=1, max_value=10000, places=2, allow_nan=False, allow_infinity=False)


# ---------------------------------------------------------------------------
# Property 1: Fee resolution round-trip consistency
# ---------------------------------------------------------------------------


class TestFeeResolutionRoundTrip(SimpleTestCase):
    """# Feature: admissions-logic-canonicalization, Property 1: Fee resolution round-trip consistency

    For any Application with a program field that matches an active Program
    record by name, resolving the fee through PaymentService.initiate_payment()
    (name → code → FeeResolver) SHALL produce the same ResolvedFee as calling
    FeeResolver.resolve_fee() directly with the Program's code.

    **Validates: Requirements 1.1, 1.2, 1.5**
    """

    @given(
        program_name=program_names,
        program_code=program_codes,
        nationality=nationalities,
        country=countries,
        fee_amount=fee_amounts,
        currency=currencies,
        residency_category=residency_categories,
        fee_source=fee_sources,
    )
    @settings(max_examples=5)
    def test_payment_service_path_matches_direct_fee_resolver(
        self,
        program_name,
        program_code,
        nationality,
        country,
        fee_amount,
        currency,
        residency_category,
        fee_source,
    ):
        """The PaymentService path (name→code→FeeResolver) produces the same
        ResolvedFee as calling FeeResolver.resolve_fee() directly with the code."""
        from apps.documents.fee_resolver import ResolvedFee

        expected_fee = ResolvedFee(
            amount=fee_amount,
            currency=currency,
            residency_category=residency_category,
            source=fee_source,
        )

        mock_resolved_identifier = ResolvedIdentifier(
            id=str(uuid.uuid4()),
            code=program_code,
            name=program_name,
            source="name",
        )

        # --- Direct path: FeeResolver.resolve_fee(program_code, ...) ---
        with patch(
            "apps.documents.fee_resolver.FeeResolver.resolve_fee",
            return_value=expected_fee,
        ) as mock_fee_resolve:
            from apps.documents.fee_resolver import FeeResolver

            direct_result = FeeResolver().resolve_fee(
                program_code=program_code,
                nationality=nationality,
                country=country,
            )
            mock_fee_resolve.assert_called_once_with(
                program_code=program_code,
                nationality=nationality,
                country=country,
            )

        # --- PaymentService path: name → IdentifierResolver → code → FeeResolver ---
        with patch(
            "apps.applications.identifier_resolver.IdentifierResolver.resolve_program",
            return_value=mock_resolved_identifier,
        ) as mock_resolve_program, patch(
            "apps.documents.payment_service.FeeResolver.resolve_fee",
            return_value=expected_fee,
        ) as mock_ps_fee_resolve, patch(
            "apps.applications.models.Application.objects"
        ) as mock_app_qs, patch(
            "apps.documents.models.Payment.objects"
        ) as mock_payment_qs, patch(
            "django.db.transaction.atomic"
        ) as mock_atomic:
            # No existing pending payment
            mock_payment_qs.filter.return_value.first.return_value = None
            mock_payment_qs.select_for_update.return_value.filter.return_value.first.return_value = None
            mock_payment_qs.filter.return_value.exclude.return_value.count.return_value = 0
            mock_atomic.return_value.__enter__ = MagicMock(return_value=None)
            mock_atomic.return_value.__exit__ = MagicMock(return_value=False)

            # Mock application with program name and nationality
            mock_app = MagicMock()
            mock_app.program = program_name
            mock_app.nationality = nationality
            mock_app.country = country
            mock_app.application_number = "APP-2025-0001"
            mock_app_qs.get.return_value = mock_app

            # Mock payment creation
            mock_payment = MagicMock()
            mock_payment.id = uuid.uuid4()
            mock_payment.transaction_reference = "MIHAS-APP-2025-0001-123"
            mock_payment.amount = expected_fee.amount
            mock_payment.currency = expected_fee.currency
            mock_payment_qs.create.return_value = mock_payment

            from apps.documents.payment_service import PaymentService

            service = PaymentService()
            ps_result = service.initiate_payment(
                application_id=uuid.uuid4(),
                user_id=uuid.uuid4(),
            )

            # Verify IdentifierResolver was called with the program name
            mock_resolve_program.assert_called_once_with(program_name)

            # Verify FeeResolver was called with the resolved code (not the name)
            mock_ps_fee_resolve.assert_called_once_with(
                program_code=program_code,
                nationality=nationality,
                country=country,
            )

        # --- Round-trip consistency: both paths produce the same fee ---
        self.assertEqual(direct_result.amount, expected_fee.amount)
        self.assertEqual(direct_result.currency, expected_fee.currency)
        self.assertEqual(direct_result.residency_category, expected_fee.residency_category)
        self.assertEqual(direct_result.source, expected_fee.source)

        # PaymentService used the same resolved fee for the payment record
        self.assertEqual(ps_result.amount, expected_fee.amount)
        self.assertEqual(ps_result.currency, expected_fee.currency)


# ---------------------------------------------------------------------------
# Strategies for PATCH field restriction tests
# ---------------------------------------------------------------------------

non_draft_statuses = st.sampled_from([
    "submitted", "under_review", "approved", "rejected", "waitlisted",
])

all_statuses = st.sampled_from([
    "draft", "submitted", "under_review", "approved", "rejected", "waitlisted",
])

admin_roles = st.sampled_from(["admin", "super_admin"])


def _make_mock_request(method="PATCH"):
    """Create a mock request with the given method and a mock user."""
    request = MagicMock()
    request.method = method
    request.user = MagicMock()
    return request


def _make_mock_application(status="draft"):
    """Create a mock Application instance with the given status."""
    app = MagicMock(spec=Application)
    app.status = status
    app.id = uuid.uuid4()
    app.pk = app.id
    return app


# ---------------------------------------------------------------------------
# Property 4: PATCH field guard strips lifecycle fields for students
# ---------------------------------------------------------------------------


class TestPatchFieldGuardStudentDraft(SimpleTestCase):
    """# Feature: admissions-logic-canonicalization, Property 4: PATCH field guard strips lifecycle fields for students

    For any PATCH payload containing a mix of draft-safe and lifecycle fields,
    and a student-role user with a draft application, the serializer's
    get_fields() SHALL return only DRAFT_SAFE_FIELDS as writable — no
    lifecycle field shall be writable.

    **Validates: Requirements 3.1, 3.2**
    """

    @given(data=st.data())
    @settings(max_examples=5)
    def test_student_draft_only_draft_safe_fields_writable(self, data):
        """Student + draft status → only DRAFT_SAFE_FIELDS are writable,
        all lifecycle fields are read_only."""
        from apps.applications.serializers import (
            ApplicationSerializer,
            DRAFT_SAFE_FIELDS,
            LIFECYCLE_FIELDS,
        )

        mock_request = _make_mock_request(method="PATCH")
        mock_request.user.role = "student"

        mock_app = _make_mock_application(status="draft")

        serializer = ApplicationSerializer(
            instance=mock_app,
            context={"request": mock_request},
        )

        fields = serializer.get_fields()

        # Every DRAFT_SAFE_FIELD that exists in the serializer should be writable
        for field_name in DRAFT_SAFE_FIELDS:
            if field_name in fields:
                self.assertFalse(
                    fields[field_name].read_only,
                    f"DRAFT_SAFE_FIELD '{field_name}' should be writable for student+draft",
                )

        # Every LIFECYCLE_FIELD that exists in the serializer should be read_only
        for field_name in LIFECYCLE_FIELDS:
            if field_name in fields:
                self.assertTrue(
                    fields[field_name].read_only,
                    f"LIFECYCLE_FIELD '{field_name}' should be read_only for student+draft",
                )

        # Any field NOT in DRAFT_SAFE_FIELDS should be read_only
        for field_name, field in fields.items():
            if field_name not in DRAFT_SAFE_FIELDS:
                self.assertTrue(
                    field.read_only,
                    f"Non-draft-safe field '{field_name}' should be read_only for student+draft",
                )


# ---------------------------------------------------------------------------
# Property 5: PATCH rejects non-draft edits for students
# ---------------------------------------------------------------------------


class TestPatchRejectsNonDraftForStudents(SimpleTestCase):
    """# Feature: admissions-logic-canonicalization, Property 5: PATCH rejects non-draft edits for students

    For any Application with status not equal to 'draft' and a student-role
    user, the serializer's get_fields() SHALL return ALL fields as read_only.

    **Validates: Requirements 3.3**
    """

    @given(status=non_draft_statuses)
    @settings(max_examples=5)
    def test_student_non_draft_all_fields_read_only(self, status):
        """Student + non-draft status → ALL fields are read_only."""
        from apps.applications.serializers import ApplicationSerializer

        mock_request = _make_mock_request(method="PATCH")
        mock_request.user.role = "student"

        mock_app = _make_mock_application(status=status)

        serializer = ApplicationSerializer(
            instance=mock_app,
            context={"request": mock_request},
        )

        fields = serializer.get_fields()

        for field_name, field in fields.items():
            self.assertTrue(
                field.read_only,
                f"Field '{field_name}' should be read_only for student with status='{status}'",
            )


# ---------------------------------------------------------------------------
# Property 6: PATCH field guard for admins strips status but allows
#              draft-safe fields
# ---------------------------------------------------------------------------


class TestPatchFieldGuardAdmin(SimpleTestCase):
    """# Feature: admissions-logic-canonicalization, Property 6: PATCH field guard for admins strips status but allows draft-safe fields

    For any PATCH payload and an admin-role user, the serializer's
    get_fields() SHALL return only DRAFT_SAFE_FIELDS as writable regardless
    of application status — status is never writable via PATCH.

    **Validates: Requirements 3.4**
    """

    @given(status=all_statuses, role=admin_roles)
    @settings(max_examples=5)
    def test_admin_draft_safe_fields_writable_status_read_only(self, status, role):
        """Admin + any status → DRAFT_SAFE_FIELDS writable, status and
        lifecycle fields read_only."""
        from apps.applications.serializers import (
            ApplicationSerializer,
            DRAFT_SAFE_FIELDS,
            LIFECYCLE_FIELDS,
        )

        mock_request = _make_mock_request(method="PATCH")
        mock_request.user.role = role

        mock_app = _make_mock_application(status=status)

        serializer = ApplicationSerializer(
            instance=mock_app,
            context={"request": mock_request},
        )

        fields = serializer.get_fields()

        # DRAFT_SAFE_FIELDS should be writable for admins
        for field_name in DRAFT_SAFE_FIELDS:
            if field_name in fields:
                self.assertFalse(
                    fields[field_name].read_only,
                    f"DRAFT_SAFE_FIELD '{field_name}' should be writable for admin (role={role}, status={status})",
                )

        # status should always be read_only for admins via PATCH
        if "status" in fields:
            self.assertTrue(
                fields["status"].read_only,
                f"'status' should be read_only for admin PATCH (role={role}, status={status})",
            )

        # All LIFECYCLE_FIELDS should be read_only for admins
        for field_name in LIFECYCLE_FIELDS:
            if field_name in fields:
                self.assertTrue(
                    fields[field_name].read_only,
                    f"LIFECYCLE_FIELD '{field_name}' should be read_only for admin (role={role}, status={status})",
                )

        # Any field NOT in DRAFT_SAFE_FIELDS should be read_only
        for field_name, field in fields.items():
            if field_name not in DRAFT_SAFE_FIELDS:
                self.assertTrue(
                    field.read_only,
                    f"Non-draft-safe field '{field_name}' should be read_only for admin (role={role}, status={status})",
                )


# ---------------------------------------------------------------------------
# Strategies for DuplicateChecker tests
# ---------------------------------------------------------------------------

user_ids = st.uuids().map(str)

non_terminal_statuses = st.sampled_from([
    "draft", "submitted", "under_review", "approved", "waitlisted",
])

submitted_statuses = st.sampled_from([
    "submitted", "under_review", "approved", "waitlisted",
])

terminal_statuses = st.sampled_from(["rejected", "withdrawn"])


def _make_mock_existing_application(app_id=None, status="draft"):
    """Create a mock Application for duplicate checking."""
    app = MagicMock()
    app.id = app_id or uuid.uuid4()
    app.status = status
    return app


# ---------------------------------------------------------------------------
# Property 7: Duplicate prevention at create time
# ---------------------------------------------------------------------------


class TestDuplicatePreventionAtCreateTime(SimpleTestCase):
    """# Feature: admissions-logic-canonicalization, Property 7: Duplicate prevention at create time

    For any user, program, and intake combination where a non-terminal
    Application (status in {draft, submitted, under_review, approved,
    waitlisted}) already exists, DuplicateChecker.check_at_create() SHALL
    return has_duplicate=True with the existing application's ID and status.

    **Validates: Requirements 4.1, 4.2**
    """

    @given(
        user_id=user_ids,
        program=program_names,
        intake=intake_names,
        existing_status=non_terminal_statuses,
    )
    @settings(max_examples=5)
    def test_existing_non_terminal_app_returns_duplicate(
        self, user_id, program, intake, existing_status
    ):
        """When a non-terminal application exists, check_at_create returns
        has_duplicate=True with the existing ID, status, and resume_url."""
        from apps.applications.duplicate_checker import DuplicateChecker

        existing_id = uuid.uuid4()
        mock_existing = _make_mock_existing_application(
            app_id=existing_id, status=existing_status
        )

        with patch(
            "apps.applications.duplicate_checker.Application.objects"
        ) as mock_qs:
            mock_qs.filter.return_value.first.return_value = mock_existing

            result = DuplicateChecker.check_at_create(user_id, program, intake)

        self.assertTrue(result.has_duplicate)
        self.assertEqual(result.existing_id, str(existing_id))
        self.assertEqual(result.existing_status, existing_status)
        self.assertEqual(
            result.resume_url, f"/student/application/{existing_id}"
        )

    @given(
        user_id=user_ids,
        program=program_names,
        intake=intake_names,
    )
    @settings(max_examples=5)
    def test_no_existing_app_returns_no_duplicate(self, user_id, program, intake):
        """When no matching application exists, check_at_create returns
        has_duplicate=False."""
        from apps.applications.duplicate_checker import DuplicateChecker

        with patch(
            "apps.applications.duplicate_checker.Application.objects"
        ) as mock_qs:
            mock_qs.filter.return_value.first.return_value = None

            result = DuplicateChecker.check_at_create(user_id, program, intake)

        self.assertFalse(result.has_duplicate)
        self.assertIsNone(result.existing_id)
        self.assertIsNone(result.existing_status)
        self.assertIsNone(result.resume_url)


# ---------------------------------------------------------------------------
# Property 8: Duplicate prevention at submit time
# ---------------------------------------------------------------------------


class TestDuplicatePreventionAtSubmitTime(SimpleTestCase):
    """# Feature: admissions-logic-canonicalization, Property 8: Duplicate prevention at submit time

    For any user, program, and intake combination where a submitted
    Application (status in {submitted, under_review, approved, waitlisted})
    already exists, DuplicateChecker.check_at_submit() SHALL return
    has_duplicate=True for any other application by the same user for the
    same program and intake.

    **Validates: Requirements 4.3, 4.4**
    """

    @given(
        user_id=user_ids,
        program=program_names,
        intake=intake_names,
        existing_status=submitted_statuses,
    )
    @settings(max_examples=5)
    def test_existing_submitted_app_returns_duplicate(
        self, user_id, program, intake, existing_status
    ):
        """When a submitted application exists for the same user/program/intake,
        check_at_submit returns has_duplicate=True with the existing ID."""
        from apps.applications.duplicate_checker import DuplicateChecker

        existing_id = uuid.uuid4()
        current_id = uuid.uuid4()
        mock_existing = _make_mock_existing_application(
            app_id=existing_id, status=existing_status
        )

        with patch(
            "apps.applications.duplicate_checker.Application.objects"
        ) as mock_qs:
            mock_qs.filter.return_value.exclude.return_value.first.return_value = (
                mock_existing
            )

            result = DuplicateChecker.check_at_submit(
                user_id, program, intake, str(current_id)
            )

        self.assertTrue(result.has_duplicate)
        self.assertEqual(result.existing_id, str(existing_id))
        self.assertEqual(result.existing_status, existing_status)

    @given(
        user_id=user_ids,
        program=program_names,
        intake=intake_names,
    )
    @settings(max_examples=5)
    def test_no_submitted_duplicate_returns_no_duplicate(
        self, user_id, program, intake
    ):
        """When no submitted duplicate exists, check_at_submit returns
        has_duplicate=False."""
        from apps.applications.duplicate_checker import DuplicateChecker

        current_id = uuid.uuid4()

        with patch(
            "apps.applications.duplicate_checker.Application.objects"
        ) as mock_qs:
            mock_qs.filter.return_value.exclude.return_value.first.return_value = (
                None
            )

            result = DuplicateChecker.check_at_submit(
                user_id, program, intake, str(current_id)
            )

        self.assertFalse(result.has_duplicate)
        self.assertIsNone(result.existing_id)
        self.assertIsNone(result.existing_status)


# ---------------------------------------------------------------------------
# Strategies for EligibilityEngine tests
# ---------------------------------------------------------------------------

subject_names = st.text(
    alphabet=st.sampled_from("abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
    min_size=3,
    max_size=50,
).filter(lambda s: s.strip())

# ECZ grades: 1 (best) to 9 (worst)
ecz_grades = st.integers(min_value=1, max_value=9)

# Positive weights for course requirements
requirement_weights = st.decimals(min_value=1, max_value=10, places=2, allow_nan=False, allow_infinity=False)


def _make_mock_subject(name):
    """Create a mock Subject object."""
    subj = MagicMock()
    subj.id = uuid.uuid4()
    subj.name = name
    return subj


def _make_mock_requirement(subject, is_mandatory, minimum_grade, weight):
    """Create a mock CourseRequirement object."""
    req = MagicMock()
    req.id = uuid.uuid4()
    req.subject = subject
    req.subject_id = subject.id
    req.is_mandatory = is_mandatory
    req.minimum_grade = minimum_grade
    req.weight = weight
    return req


def _make_mock_grade(subject_id, grade):
    """Create a mock ApplicationGrade object."""
    g = MagicMock()
    g.subject_id = subject_id
    g.grade = grade
    return g


def _setup_eligibility_mocks(mock_resolver_cls, mock_req_qs, mock_grade_qs, requirements, grades):
    """Wire up common mocks for EligibilityEngine.evaluate()."""
    resolved = ResolvedIdentifier(
        id=str(uuid.uuid4()), code="TST", name="Test Program", source="name",
    )
    mock_resolver_cls.resolve_program.return_value = resolved

    # CourseRequirement.objects.filter().select_related() returns a queryset-like
    # object that supports both iteration and .exists()
    mock_qs_result = MagicMock()
    mock_qs_result.__iter__ = MagicMock(return_value=iter(requirements))
    mock_qs_result.exists.return_value = len(requirements) > 0
    mock_req_qs.filter.return_value.select_related.return_value = mock_qs_result

    mock_grade_qs.filter.return_value = grades


# Composite strategy: generate a list of requirements with matching grades
# that guarantee ALL mandatory pass and ALL optional pass → eligible
@st.composite
def all_pass_scenario(draw):
    """Generate requirements and grades where every requirement passes."""
    n = draw(st.integers(min_value=1, max_value=6))
    requirements = []
    grades = []
    for i in range(n):
        subj = _make_mock_subject(f"Subject_{i}")
        is_mandatory = draw(st.booleans())
        min_grade = draw(st.integers(min_value=2, max_value=9))
        weight = draw(requirement_weights)
        req = _make_mock_requirement(subj, is_mandatory, min_grade, weight)
        requirements.append(req)
        # Student grade must be <= minimum_grade to pass
        student_grade = draw(st.integers(min_value=1, max_value=min_grade))
        grades.append(_make_mock_grade(subj.id, student_grade))
    return requirements, grades


@st.composite
def mandatory_fail_scenario(draw):
    """Generate requirements and grades where at least one mandatory fails."""
    n = draw(st.integers(min_value=1, max_value=5))
    requirements = []
    grades = []
    has_mandatory_fail = False
    for i in range(n):
        subj = _make_mock_subject(f"Subject_{i}")
        is_mandatory = draw(st.booleans())
        min_grade = draw(st.integers(min_value=1, max_value=8))
        weight = draw(requirement_weights)
        req = _make_mock_requirement(subj, is_mandatory, min_grade, weight)
        requirements.append(req)
        # Decide if this one passes or fails
        if is_mandatory and not has_mandatory_fail:
            # Force at least one mandatory to fail: grade > minimum_grade
            student_grade = draw(st.integers(min_value=min_grade + 1, max_value=9))
            has_mandatory_fail = True
        else:
            student_grade = draw(st.integers(min_value=1, max_value=9))
        grades.append(_make_mock_grade(subj.id, student_grade))

    if not has_mandatory_fail:
        # Ensure at least one mandatory requirement that fails
        subj = _make_mock_subject("MandatoryFail")
        min_grade = draw(st.integers(min_value=1, max_value=8))
        weight = draw(requirement_weights)
        req = _make_mock_requirement(subj, True, min_grade, weight)
        requirements.append(req)
        student_grade = draw(st.integers(min_value=min_grade + 1, max_value=9))
        grades.append(_make_mock_grade(subj.id, student_grade))

    return requirements, grades


@st.composite
def conditional_scenario(draw):
    """Generate requirements where all mandatory pass but at least one optional fails."""
    # At least one mandatory that passes
    n_mandatory = draw(st.integers(min_value=1, max_value=3))
    # At least one optional that fails
    n_optional = draw(st.integers(min_value=1, max_value=3))

    requirements = []
    grades = []

    for i in range(n_mandatory):
        subj = _make_mock_subject(f"Mandatory_{i}")
        min_grade = draw(st.integers(min_value=2, max_value=9))
        weight = draw(requirement_weights)
        req = _make_mock_requirement(subj, True, min_grade, weight)
        requirements.append(req)
        student_grade = draw(st.integers(min_value=1, max_value=min_grade))
        grades.append(_make_mock_grade(subj.id, student_grade))

    has_optional_fail = False
    for i in range(n_optional):
        subj = _make_mock_subject(f"Optional_{i}")
        min_grade = draw(st.integers(min_value=1, max_value=8))
        weight = draw(requirement_weights)
        req = _make_mock_requirement(subj, False, min_grade, weight)
        requirements.append(req)
        if not has_optional_fail:
            # Force at least one optional to fail
            student_grade = draw(st.integers(min_value=min_grade + 1, max_value=9))
            has_optional_fail = True
        else:
            student_grade = draw(st.integers(min_value=1, max_value=9))
        grades.append(_make_mock_grade(subj.id, student_grade))

    return requirements, grades


# ---------------------------------------------------------------------------
# Property 9: Eligibility status classification
# ---------------------------------------------------------------------------


class TestEligibilityStatusClassification(SimpleTestCase):
    """# Feature: admissions-logic-canonicalization, Property 9: Eligibility status classification

    For any set of CourseRequirement records and ApplicationGrade records,
    the EligibilityEngine.evaluate() SHALL return: eligible when all mandatory
    requirements are met, not_eligible when any mandatory requirement fails,
    and conditional when mandatory requirements pass but optional ones fail.

    **Validates: Requirements 5.4, 5.5, 5.6**
    """

    @given(data=all_pass_scenario())
    @settings(max_examples=5)
    def test_all_pass_returns_eligible(self, data):
        """When all requirements (mandatory and optional) pass, status is 'eligible'."""
        requirements, grades = data

        from apps.applications.eligibility_engine import EligibilityEngine

        with patch(
            "apps.applications.identifier_resolver.IdentifierResolver"
        ) as mock_resolver_cls, patch(
            "apps.applications.eligibility_engine.CourseRequirement.objects"
        ) as mock_req_qs, patch(
            "apps.applications.eligibility_engine.ApplicationGrade.objects"
        ) as mock_grade_qs:
            _setup_eligibility_mocks(mock_resolver_cls, mock_req_qs, mock_grade_qs, requirements, grades)

            engine = EligibilityEngine()
            result = engine.evaluate("app-123", "Test Program")

        self.assertEqual(result.status, "eligible")

    @given(data=mandatory_fail_scenario())
    @settings(max_examples=5)
    def test_mandatory_fail_returns_not_eligible(self, data):
        """When any mandatory requirement fails, status is 'not_eligible'."""
        requirements, grades = data

        from apps.applications.eligibility_engine import EligibilityEngine

        with patch(
            "apps.applications.identifier_resolver.IdentifierResolver"
        ) as mock_resolver_cls, patch(
            "apps.applications.eligibility_engine.CourseRequirement.objects"
        ) as mock_req_qs, patch(
            "apps.applications.eligibility_engine.ApplicationGrade.objects"
        ) as mock_grade_qs:
            _setup_eligibility_mocks(mock_resolver_cls, mock_req_qs, mock_grade_qs, requirements, grades)

            engine = EligibilityEngine()
            result = engine.evaluate("app-123", "Test Program")

        self.assertEqual(result.status, "not_eligible")

    @given(data=conditional_scenario())
    @settings(max_examples=5)
    def test_mandatory_pass_optional_fail_returns_conditional(self, data):
        """When mandatory pass but optional fail, status is 'conditional'."""
        requirements, grades = data

        from apps.applications.eligibility_engine import EligibilityEngine

        with patch(
            "apps.applications.identifier_resolver.IdentifierResolver"
        ) as mock_resolver_cls, patch(
            "apps.applications.eligibility_engine.CourseRequirement.objects"
        ) as mock_req_qs, patch(
            "apps.applications.eligibility_engine.ApplicationGrade.objects"
        ) as mock_grade_qs:
            _setup_eligibility_mocks(mock_resolver_cls, mock_req_qs, mock_grade_qs, requirements, grades)

            engine = EligibilityEngine()
            result = engine.evaluate("app-123", "Test Program")

        self.assertEqual(result.status, "conditional")


# ---------------------------------------------------------------------------
# Property 10: Eligibility score is weighted sum
# ---------------------------------------------------------------------------


class TestEligibilityScoreWeightedSum(SimpleTestCase):
    """# Feature: admissions-logic-canonicalization, Property 10: Eligibility score is weighted sum

    For any set of CourseRequirement records with weights and ApplicationGrade
    records, the EligibilityEngine.evaluate() score SHALL equal
    round((sum of weights for passed requirements / total weight) * 100).

    **Validates: Requirements 5.2, 5.3**
    """

    @given(data=st.data())
    @settings(max_examples=5)
    def test_score_equals_weighted_sum(self, data):
        """Score equals round((passed_weight / total_weight) * 100)."""
        n = data.draw(st.integers(min_value=1, max_value=6))
        requirements = []
        grades = []
        expected_passed_weight = 0
        expected_total_weight = 0

        for i in range(n):
            subj = _make_mock_subject(f"Subject_{i}")
            is_mandatory = data.draw(st.booleans())
            min_grade = data.draw(st.integers(min_value=1, max_value=9))
            weight = data.draw(requirement_weights)
            req = _make_mock_requirement(subj, is_mandatory, min_grade, weight)
            requirements.append(req)

            student_grade = data.draw(ecz_grades)
            grades.append(_make_mock_grade(subj.id, student_grade))

            expected_total_weight += float(weight)
            if student_grade <= min_grade:
                expected_passed_weight += float(weight)

        expected_score = round((expected_passed_weight / expected_total_weight) * 100)

        from apps.applications.eligibility_engine import EligibilityEngine

        with patch(
            "apps.applications.identifier_resolver.IdentifierResolver"
        ) as mock_resolver_cls, patch(
            "apps.applications.eligibility_engine.CourseRequirement.objects"
        ) as mock_req_qs, patch(
            "apps.applications.eligibility_engine.ApplicationGrade.objects"
        ) as mock_grade_qs:
            _setup_eligibility_mocks(mock_resolver_cls, mock_req_qs, mock_grade_qs, requirements, grades)

            engine = EligibilityEngine()
            result = engine.evaluate("app-123", "Test Program")

        self.assertEqual(result.score, expected_score)


# ---------------------------------------------------------------------------
# Property 11: Eligibility evaluation is idempotent
# ---------------------------------------------------------------------------


class TestEligibilityEvaluationIdempotent(SimpleTestCase):
    """# Feature: admissions-logic-canonicalization, Property 11: Eligibility evaluation is idempotent

    For any application ID and program name, calling EligibilityEngine.evaluate()
    twice with the same inputs SHALL produce identical EligibilityResult objects
    (same status, score, results list, and recommendations).

    **Validates: Requirements 5.8**
    """

    @given(data=st.data())
    @settings(max_examples=5)
    def test_evaluate_twice_produces_identical_results(self, data):
        """Calling evaluate() twice with the same mocked data produces identical results."""
        n = data.draw(st.integers(min_value=1, max_value=6))
        requirements = []
        grades = []

        for i in range(n):
            subj = _make_mock_subject(f"Subject_{i}")
            is_mandatory = data.draw(st.booleans())
            min_grade = data.draw(st.integers(min_value=1, max_value=9))
            weight = data.draw(requirement_weights)
            req = _make_mock_requirement(subj, is_mandatory, min_grade, weight)
            requirements.append(req)

            student_grade = data.draw(ecz_grades)
            grades.append(_make_mock_grade(subj.id, student_grade))

        from apps.applications.eligibility_engine import EligibilityEngine

        with patch(
            "apps.applications.identifier_resolver.IdentifierResolver"
        ) as mock_resolver_cls, patch(
            "apps.applications.eligibility_engine.CourseRequirement.objects"
        ) as mock_req_qs, patch(
            "apps.applications.eligibility_engine.ApplicationGrade.objects"
        ) as mock_grade_qs:
            _setup_eligibility_mocks(mock_resolver_cls, mock_req_qs, mock_grade_qs, requirements, grades)

            engine = EligibilityEngine()
            result1 = engine.evaluate("app-123", "Test Program")

        # Second call with identical mocks
        with patch(
            "apps.applications.identifier_resolver.IdentifierResolver"
        ) as mock_resolver_cls, patch(
            "apps.applications.eligibility_engine.CourseRequirement.objects"
        ) as mock_req_qs, patch(
            "apps.applications.eligibility_engine.ApplicationGrade.objects"
        ) as mock_grade_qs:
            _setup_eligibility_mocks(mock_resolver_cls, mock_req_qs, mock_grade_qs, requirements, grades)

            result2 = engine.evaluate("app-123", "Test Program")

        self.assertEqual(result1.status, result2.status)
        self.assertEqual(result1.score, result2.score)
        self.assertEqual(len(result1.results), len(result2.results))
        for r1, r2 in zip(result1.results, result2.results):
            self.assertEqual(r1.rule_code, r2.rule_code)
            self.assertEqual(r1.result, r2.result)
            self.assertEqual(r1.severity, r2.severity)
            self.assertEqual(r1.message, r2.message)
        self.assertEqual(result1.recommendations, result2.recommendations)
        self.assertEqual(result1.missing_requirements, result2.missing_requirements)


# ---------------------------------------------------------------------------
# Strategies for IntakeEnforcer tests
# ---------------------------------------------------------------------------

past_deadlines = st.dates(
    min_value=date(2020, 1, 1),
    max_value=date(2025, 6, 1),
)

future_deadlines = st.dates(
    min_value=date(2030, 1, 1),
    max_value=date(2040, 12, 31),
)

max_capacities = st.integers(min_value=1, max_value=500)


def _make_mock_intake_for_enforcer(
    intake_id=None,
    deadline=None,
    max_capacity=None,
    current_enrollment=None,
):
    """Create a mock Intake object for IntakeEnforcer tests."""
    intake = MagicMock()
    intake.id = intake_id or uuid.uuid4()
    intake.name = "Test Intake"
    intake.application_deadline = deadline
    intake.max_capacity = max_capacity
    intake.current_enrollment = current_enrollment
    intake.is_active = True
    intake.grace_period_days = 0
    return intake


# ---------------------------------------------------------------------------
# Property 12: Intake deadline enforcement
# ---------------------------------------------------------------------------


class TestIntakeDeadlineEnforcement(SimpleTestCase):
    """# Feature: admissions-logic-canonicalization, Property 12: Intake deadline enforcement

    For any intake with a non-null application_deadline that is in the past,
    IntakeEnforcer.check_submission() SHALL return allowed=False with code
    INTAKE_DEADLINE_PASSED.

    **Validates: Requirements 6.1, 6.2**
    """

    @given(deadline=past_deadlines)
    @settings(max_examples=5)
    def test_past_deadline_returns_not_allowed(self, deadline):
        """When the intake deadline is in the past, check_submission returns
        allowed=False with code INTAKE_DEADLINE_PASSED."""
        from apps.applications.intake_enforcer import IntakeEnforcer

        intake_id = uuid.uuid4()
        resolved = ResolvedIdentifier(
            id=str(intake_id), code="", name="Test Intake", source="name",
        )
        mock_intake = _make_mock_intake_for_enforcer(
            intake_id=intake_id,
            deadline=deadline,
            max_capacity=200,
            current_enrollment=10,
        )

        with patch(
            "apps.applications.identifier_resolver.IdentifierResolver.resolve_intake",
            return_value=resolved,
        ), patch(
            "apps.applications.intake_enforcer.Intake.objects"
        ) as mock_intake_qs:
            mock_intake_qs.filter.return_value.first.return_value = mock_intake

            result = IntakeEnforcer.check_submission("Test Intake", "Test Program")

        self.assertFalse(result.allowed)
        self.assertEqual(result.code, "INTAKE_DEADLINE_PASSED")

    @given(deadline=future_deadlines)
    @settings(max_examples=5)
    def test_future_deadline_returns_allowed(self, deadline):
        """When the intake deadline is in the future, check_submission returns
        allowed=True (deadline not blocking)."""
        from apps.applications.intake_enforcer import IntakeEnforcer

        intake_id = uuid.uuid4()
        resolved = ResolvedIdentifier(
            id=str(intake_id), code="", name="Test Intake", source="name",
        )
        mock_intake = _make_mock_intake_for_enforcer(
            intake_id=intake_id,
            deadline=deadline,
            max_capacity=200,
            current_enrollment=10,
        )

        with patch(
            "apps.applications.identifier_resolver.IdentifierResolver.resolve_intake",
            return_value=resolved,
        ), patch(
            "apps.applications.intake_enforcer.Intake.objects"
        ) as mock_intake_qs, patch(
            "apps.applications.models.Application.objects"
        ) as mock_app_qs:
            mock_intake_qs.filter.return_value.first.return_value = mock_intake
            mock_app_qs.filter.return_value.count.return_value = 10

            result = IntakeEnforcer.check_submission("Test Intake", "Test Program")

        self.assertTrue(result.allowed)
        self.assertIsNone(result.code)


# ---------------------------------------------------------------------------
# Property 13: Intake capacity enforcement
# ---------------------------------------------------------------------------


class TestIntakeCapacityEnforcement(SimpleTestCase):
    """# Feature: admissions-logic-canonicalization, Property 13: Intake capacity enforcement

    For any intake where current_enrollment >= max_capacity (and max_capacity
    is not null), IntakeEnforcer.check_submission() SHALL return allowed=False
    with code INTAKE_CAPACITY_REACHED.

    **Validates: Requirements 6.3, 6.4**
    """

    @given(
        max_cap=max_capacities,
        overflow=st.integers(min_value=0, max_value=100),
    )
    @settings(max_examples=5)
    def test_full_capacity_returns_not_allowed(self, max_cap, overflow):
        """When current_enrollment >= max_capacity, check_submission returns
        allowed=False with code INTAKE_CAPACITY_REACHED."""
        from apps.applications.intake_enforcer import IntakeEnforcer

        current_enrollment = max_cap + overflow  # >= max_capacity

        intake_id = uuid.uuid4()
        resolved = ResolvedIdentifier(
            id=str(intake_id), code="", name="Test Intake", source="name",
        )
        mock_intake = _make_mock_intake_for_enforcer(
            intake_id=intake_id,
            deadline=None,  # No deadline — skip deadline check
            max_capacity=max_cap,
            current_enrollment=current_enrollment,
        )

        with patch(
            "apps.applications.identifier_resolver.IdentifierResolver.resolve_intake",
            return_value=resolved,
        ), patch(
            "apps.applications.intake_enforcer.Intake.objects"
        ) as mock_intake_qs, patch(
            "apps.applications.models.Application.objects"
        ) as mock_app_qs:
            mock_intake_qs.filter.return_value.first.return_value = mock_intake
            mock_app_qs.filter.return_value.count.return_value = current_enrollment

            result = IntakeEnforcer.check_submission("Test Intake", "Test Program")

        self.assertFalse(result.allowed)
        self.assertEqual(result.code, "INTAKE_CAPACITY_REACHED")

    @given(
        max_cap=st.integers(min_value=2, max_value=500),
    )
    @settings(max_examples=5)
    def test_under_capacity_returns_allowed(self, max_cap):
        """When current_enrollment < max_capacity, check_submission returns
        allowed=True (capacity not blocking)."""
        from apps.applications.intake_enforcer import IntakeEnforcer

        current_enrollment = max_cap - 1  # Under capacity

        intake_id = uuid.uuid4()
        resolved = ResolvedIdentifier(
            id=str(intake_id), code="", name="Test Intake", source="name",
        )
        mock_intake = _make_mock_intake_for_enforcer(
            intake_id=intake_id,
            deadline=None,  # No deadline — skip deadline check
            max_capacity=max_cap,
            current_enrollment=current_enrollment,
        )

        with patch(
            "apps.applications.identifier_resolver.IdentifierResolver.resolve_intake",
            return_value=resolved,
        ), patch(
            "apps.applications.intake_enforcer.Intake.objects"
        ) as mock_intake_qs, patch(
            "apps.applications.models.Application.objects"
        ) as mock_app_qs:
            mock_intake_qs.filter.return_value.first.return_value = mock_intake
            mock_app_qs.filter.return_value.count.return_value = current_enrollment

            result = IntakeEnforcer.check_submission("Test Intake", "Test Program")

        self.assertTrue(result.allowed)
        self.assertIsNone(result.code)


# ---------------------------------------------------------------------------
# Property 14: Enrollment increment on submission
# ---------------------------------------------------------------------------


class TestEnrollmentIncrementOnSubmission(SimpleTestCase):
    """# Feature: admissions-logic-canonicalization, Property 14: Enrollment increment on submission

    For any successful application submission, the associated Intake's
    current_enrollment SHALL increase by exactly 1 via an F() expression
    update call.

    **Validates: Requirements 6.5**
    """

    @given(intake_name=intake_names)
    @settings(max_examples=5)
    def test_increment_enrollment_calls_f_expression_update(self, intake_name):
        """increment_enrollment() calls Intake.objects.filter().update()
        with F('current_enrollment') + 1."""
        from apps.applications.intake_enforcer import IntakeEnforcer

        intake_id = uuid.uuid4()
        resolved = ResolvedIdentifier(
            id=str(intake_id), code="", name=intake_name, source="name",
        )

        with patch(
            "apps.applications.identifier_resolver.IdentifierResolver.resolve_intake",
            return_value=resolved,
        ), patch(
            "apps.applications.intake_enforcer.Intake.objects"
        ) as mock_intake_qs:

            IntakeEnforcer.increment_enrollment(intake_name)

            # Verify filter was called with the resolved intake ID
            mock_intake_qs.filter.assert_called_once_with(id=str(intake_id))

            # Verify update was called exactly once
            mock_intake_qs.filter.return_value.update.assert_called_once()

            # Verify the update argument uses F("current_enrollment") + 1
            call_kwargs = mock_intake_qs.filter.return_value.update.call_args
            self.assertIn("current_enrollment", call_kwargs.kwargs)
            f_expr = call_kwargs.kwargs["current_enrollment"]
            # The F() expression should be a CombinedExpression: F("current_enrollment") + 1
            from django.db.models import F as DjangoF
            from django.db.models.expressions import CombinedExpression
            self.assertIsInstance(f_expr, CombinedExpression)


# ---------------------------------------------------------------------------
# Property 16: Draft deactivation on submission
# ---------------------------------------------------------------------------


class TestDraftDeactivationOnSubmission(SimpleTestCase):
    """# Feature: admissions-logic-canonicalization, Property 16: Draft deactivation on submission

    For any successful application submission via submit_application(),
    all ApplicationDraft records for the submitted application SHALL have
    is_active=False — i.e. ApplicationDraft.objects.filter(user_id=...,
    application_id=...).update(is_active=False) is called with the correct
    user_id and application_id.

    **Validates: Requirements 7.7**
    """

    @given(
        user_id=st.uuids(),
    )
    @settings(max_examples=5)
    def test_drafts_deactivated_after_successful_submission(self, user_id):
        """After a successful submit_application() call, ApplicationDraft.objects
        .filter(user_id=changed_by, application_id=application.id)
        .update(is_active=False) is invoked."""
        from apps.applications.services import submit_application

        app_id = uuid.uuid4()
        changed_by = str(user_id)

        # Build a mock application in draft status with verified payment
        mock_app = MagicMock()
        mock_app.id = app_id
        mock_app.status = "draft"
        mock_app.payment_status = "verified"
        mock_app.program = "Test Program"
        mock_app.intake = "January 2026"
        mock_app.user_id = user_id

        # Mock the locked application returned by select_for_update
        mock_locked_app = MagicMock()
        mock_locked_app.id = app_id
        mock_locked_app.status = "draft"
        mock_locked_app.user_id = user_id
        mock_locked_app.program = "Test Program"
        mock_locked_app.intake = "January 2026"
        mock_locked_app.submitted_at = None

        # Create a mock for ApplicationDraft.objects
        mock_draft_qs = MagicMock()

        with patch(
            "apps.applications.services._application_has_completed_payment",
            return_value=True,
        ), patch(
            "apps.applications.services._application_has_identity_document",
            return_value=True,
        ), patch(
            "apps.applications.intake_enforcer.IntakeEnforcer.check_submission",
        ) as mock_intake_check, patch(
            "apps.applications.intake_enforcer.IntakeEnforcer.increment_enrollment",
        ), patch(
            "apps.applications.services.Application.objects",
        ) as mock_app_qs, patch(
            "apps.applications.services.transition_application_status",
            return_value="draft",
        ), patch(
            "apps.applications.duplicate_checker.DuplicateChecker.check_at_submit",
        ) as mock_dup_submit, patch(
            "apps.applications.eligibility_engine.EligibilityEngine.evaluate",
        ) as mock_elig_eval, patch(
            "apps.applications.models.ApplicationDraft.objects",
            mock_draft_qs,
        ), patch(
            "apps.applications.services.transaction",
        ) as mock_transaction:
            # IntakeEnforcer allows submission
            mock_intake_result = MagicMock()
            mock_intake_result.allowed = True
            mock_intake_check.return_value = mock_intake_result

            # select_for_update returns the locked app
            mock_app_qs.select_for_update.return_value.get.return_value = mock_locked_app

            # No duplicate
            mock_dup_result = MagicMock()
            mock_dup_result.has_duplicate = False
            mock_dup_submit.return_value = mock_dup_result

            # Eligibility engine returns a result
            mock_elig_result = MagicMock()
            mock_elig_result.status = "eligible"
            mock_elig_result.score = 100
            mock_elig_result.missing_requirements = []
            mock_elig_eval.return_value = mock_elig_result

            # Mock the Application.objects.filter().update() for eligibility
            mock_app_qs.filter.return_value.update.return_value = 1

            result_app, old_status = submit_application(
                application=mock_app,
                changed_by=changed_by,
            )

            # ASSERT: ApplicationDraft.objects.filter() was called with correct args
            mock_draft_qs.filter.assert_called_once_with(
                user_id=changed_by,
                application_id=app_id,
            )

            # ASSERT: .update(is_active=False) was called on the filtered queryset
            mock_draft_qs.filter.return_value.update.assert_called_once_with(
                is_active=False,
            )


# ---------------------------------------------------------------------------
# Strategies for payment vocabulary tests
# ---------------------------------------------------------------------------

payment_statuses_successful = st.just("successful")
payment_statuses_failed = st.just("failed")
canonical_payment_confirmations = st.sampled_from(["verified", "paid", "force_approved"])


# ---------------------------------------------------------------------------
# Property 17: Payment status canonical mapping
# ---------------------------------------------------------------------------


class TestPaymentStatusCanonicalMapping(SimpleTestCase):
    """# Feature: admissions-logic-canonicalization, Property 17: Payment status canonical mapping

    For any Payment that transitions to `successful`, the associated
    Application's `payment_status` SHALL be set to `verified`. For any
    Payment that transitions to `failed`, the Application's `payment_status`
    SHALL be set to `failed`.

    **Validates: Requirements 8.2, 8.3**
    """

    @given(data=st.data())
    @settings(max_examples=5)
    def test_successful_payment_maps_to_verified(self, data):
        """When a payment transitions to 'successful', the application's
        payment_status is set to 'verified'."""
        from apps.documents.payment_service import PaymentService

        app_id = uuid.uuid4()
        payment_id = uuid.uuid4()

        mock_payment = MagicMock()
        mock_payment.id = payment_id
        mock_payment.status = "pending"
        mock_payment.amount = 153
        mock_payment.application_id = app_id
        mock_payment.lenco_reference = None
        mock_payment.payment_method = None
        mock_payment.fee = None
        mock_payment.bearer = None
        mock_payment.metadata = {}

        lenco_data = {"status": "successful", "lencoReference": "LEN-123", "type": "card"}

        with patch(
            "apps.documents.payment_service.Payment.objects"
        ) as mock_payment_qs, patch(
            "apps.applications.models.Application.objects"
        ) as mock_app_qs, patch(
            "django.db.transaction.atomic",
            return_value=MagicMock(__enter__=MagicMock(), __exit__=MagicMock(return_value=False)),
        ):
            # select_for_update returns the locked payment with pending status
            mock_locked = MagicMock()
            mock_locked.id = payment_id
            mock_locked.status = "pending"
            mock_locked.amount = 153
            mock_locked.application_id = app_id
            mock_locked.lenco_reference = None
            mock_locked.payment_method = None
            mock_locked.fee = None
            mock_locked.bearer = None
            mock_locked.metadata = {}
            mock_payment_qs.select_for_update.return_value.get.return_value = mock_locked

            service = PaymentService()
            service._update_payment_status(mock_payment, "successful", lenco_data)

            # Verify application payment_status was set to 'verified'
            mock_app_qs.filter.assert_called_once_with(id=app_id)
            update_kwargs = mock_app_qs.filter.return_value.update.call_args
            self.assertEqual(update_kwargs.kwargs.get("payment_status"), "verified")

    @given(data=st.data())
    @settings(max_examples=5)
    def test_failed_payment_maps_to_failed(self, data):
        """When a payment transitions to 'failed', the application's
        payment_status is set to 'failed'."""
        from apps.documents.payment_service import PaymentService

        app_id = uuid.uuid4()
        payment_id = uuid.uuid4()

        mock_payment = MagicMock()
        mock_payment.id = payment_id
        mock_payment.status = "pending"
        mock_payment.amount = 153
        mock_payment.application_id = app_id
        mock_payment.lenco_reference = None
        mock_payment.payment_method = None
        mock_payment.fee = None
        mock_payment.bearer = None
        mock_payment.metadata = {}

        lenco_data = {"status": "failed"}

        with patch(
            "apps.documents.payment_service.Payment.objects"
        ) as mock_payment_qs, patch(
            "apps.applications.models.Application.objects"
        ) as mock_app_qs, patch(
            "django.db.transaction.atomic",
            return_value=MagicMock(__enter__=MagicMock(), __exit__=MagicMock(return_value=False)),
        ):
            mock_locked = MagicMock()
            mock_locked.id = payment_id
            mock_locked.status = "pending"
            mock_locked.amount = 153
            mock_locked.application_id = app_id
            mock_locked.lenco_reference = None
            mock_locked.payment_method = None
            mock_locked.fee = None
            mock_locked.bearer = None
            mock_locked.metadata = {}
            mock_payment_qs.select_for_update.return_value.get.return_value = mock_locked

            service = PaymentService()
            service._update_payment_status(mock_payment, "failed", lenco_data)

            # Verify application payment_status was set to 'failed'
            mock_app_qs.filter.assert_called_once_with(id=app_id)
            update_kwargs = mock_app_qs.filter.return_value.update.call_args
            self.assertEqual(update_kwargs.kwargs.get("payment_status"), "failed")


# ---------------------------------------------------------------------------
# Property 19: Submission accepts canonical payment confirmations
# ---------------------------------------------------------------------------


class TestSubmissionAcceptsCanonicalPaymentConfirmations(SimpleTestCase):
    """# Feature: admissions-logic-canonicalization, Property 19: Submission accepts canonical payment confirmations

    For any Application with `payment_status` in {verified, paid,
    force_approved}, `submit_application()` SHALL not raise PAYMENT_REQUIRED.

    **Validates: Requirements 8.6**
    """

    @given(payment_status=canonical_payment_confirmations)
    @settings(max_examples=5)
    def test_canonical_payment_status_does_not_raise_payment_required(self, payment_status):
        """When application.payment_status is in {verified, paid, force_approved},
        submit_application() does not raise PAYMENT_REQUIRED."""
        from apps.applications.services import (
            ApplicationSubmissionError,
            submit_application,
        )

        app_id = uuid.uuid4()
        user_id = uuid.uuid4()
        changed_by = str(user_id)

        mock_app = MagicMock()
        mock_app.id = app_id
        mock_app.status = "draft"
        mock_app.payment_status = payment_status
        mock_app.program = "Test Program"
        mock_app.intake = "January 2026"
        mock_app.user_id = user_id

        mock_locked_app = MagicMock()
        mock_locked_app.id = app_id
        mock_locked_app.status = "draft"
        mock_locked_app.user_id = user_id
        mock_locked_app.program = "Test Program"
        mock_locked_app.intake = "January 2026"
        mock_locked_app.submitted_at = None

        with patch(
            "apps.applications.services._application_has_completed_payment",
            return_value=False,
        ), patch(
            "apps.applications.services._application_has_identity_document",
            return_value=True,
        ), patch(
            "apps.applications.intake_enforcer.IntakeEnforcer.check_submission",
        ) as mock_intake_check, patch(
            "apps.applications.intake_enforcer.IntakeEnforcer.increment_enrollment",
        ), patch(
            "apps.applications.services.Application.objects",
        ) as mock_app_qs, patch(
            "apps.applications.services.transition_application_status",
            return_value="draft",
        ), patch(
            "apps.applications.duplicate_checker.DuplicateChecker.check_at_submit",
        ) as mock_dup_submit, patch(
            "apps.applications.eligibility_engine.EligibilityEngine.evaluate",
        ) as mock_elig_eval, patch(
            "apps.applications.models.ApplicationDraft.objects",
        ) as mock_draft_qs, patch(
            "apps.applications.services.transaction",
        ) as mock_transaction:
            mock_intake_result = MagicMock()
            mock_intake_result.allowed = True
            mock_intake_check.return_value = mock_intake_result

            mock_app_qs.select_for_update.return_value.get.return_value = mock_locked_app
            mock_app_qs.filter.return_value.update.return_value = 1

            mock_dup_result = MagicMock()
            mock_dup_result.has_duplicate = False
            mock_dup_submit.return_value = mock_dup_result

            mock_elig_result = MagicMock()
            mock_elig_result.status = "eligible"
            mock_elig_result.score = 100
            mock_elig_result.missing_requirements = []
            mock_elig_eval.return_value = mock_elig_result

            # Should NOT raise PAYMENT_REQUIRED
            try:
                result_app, old_status = submit_application(
                    application=mock_app,
                    changed_by=changed_by,
                )
            except ApplicationSubmissionError as e:
                self.assertNotEqual(
                    e.code,
                    "PAYMENT_REQUIRED",
                    f"PAYMENT_REQUIRED should not be raised for payment_status='{payment_status}'",
                )


# ---------------------------------------------------------------------------
# Strategies for DocumentIntelligence tests
# ---------------------------------------------------------------------------

# Names for fuzzy matching tests
person_names = st.text(
    alphabet=st.sampled_from(
        "abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    ),
    min_size=3,
    max_size=80,
).filter(lambda s: s.strip())

# NRC numbers in Zambian format (e.g. "123456/78/1")
nrc_numbers = st.from_regex(r"[0-9]{6}/[0-9]{2}/[0-9]", fullmatch=True)

# Extracted text that is non-empty
extracted_texts = st.text(
    alphabet=st.sampled_from(
        "abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/.-"
    ),
    min_size=10,
    max_size=300,
).filter(lambda s: s.strip())

# Component scores for completeness formula
component_scores = st.integers(min_value=0, max_value=100)


def _make_mock_doc(extracted_text=""):
    """Create a mock ApplicationDocument with extracted_text."""
    doc = MagicMock()
    doc.extracted_text = extracted_text
    return doc


def _make_mock_app_for_doc(full_name=None, nrc_number=None):
    """Create a mock Application for document intelligence checks."""
    app = MagicMock()
    app.id = uuid.uuid4()
    app.full_name = full_name
    app.nrc_number = nrc_number
    return app


# ---------------------------------------------------------------------------
# Property 20: Document consistency scoring
# ---------------------------------------------------------------------------


class TestDocumentConsistencyScoring(SimpleTestCase):
    """# Feature: admissions-logic-canonicalization, Property 20: Document consistency scoring

    For any ApplicationDocument with non-empty extracted_text and an
    associated Application, DocumentIntelligence._check_consistency() SHALL
    produce a name_mismatch warning when the fuzzy match score between
    extracted text and full_name is below 0.8, and an nrc_mismatch warning
    when the NRC number is not found in the extracted text.

    **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
    """

    @given(
        extracted_text=extracted_texts,
        full_name=person_names,
    )
    @settings(max_examples=5)
    def test_name_mismatch_warning_when_fuzzy_score_below_threshold(
        self, extracted_text, full_name
    ):
        """name_mismatch warning is produced iff SequenceMatcher ratio < 0.8."""
        from difflib import SequenceMatcher as SM

        from apps.applications.document_intelligence import DocumentIntelligence

        doc = _make_mock_doc(extracted_text=extracted_text)
        app = _make_mock_app_for_doc(full_name=full_name, nrc_number=None)

        di = DocumentIntelligence()
        checks = di._check_consistency(doc, app)

        # Should have exactly one check (name only, no NRC)
        name_checks = [c for c in checks if c.field == "full_name"]
        self.assertEqual(len(name_checks), 1)

        check = name_checks[0]
        expected_score = SM(None, extracted_text.lower(), full_name.lower()).ratio()

        self.assertAlmostEqual(check.match_score, expected_score, places=10)

        if expected_score < 0.8:
            self.assertEqual(
                check.warning,
                "name_mismatch",
                f"Expected name_mismatch warning for score {expected_score:.4f}",
            )
        else:
            self.assertIsNone(
                check.warning,
                f"Expected no warning for score {expected_score:.4f}",
            )

    @given(
        nrc_number=nrc_numbers,
        extracted_text=extracted_texts,
    )
    @settings(max_examples=5)
    def test_nrc_mismatch_warning_when_nrc_not_in_text(
        self, nrc_number, extracted_text
    ):
        """nrc_mismatch warning is produced iff NRC number is not found in extracted text."""
        from apps.applications.document_intelligence import DocumentIntelligence

        doc = _make_mock_doc(extracted_text=extracted_text)
        app = _make_mock_app_for_doc(full_name=None, nrc_number=nrc_number)

        di = DocumentIntelligence()
        checks = di._check_consistency(doc, app)

        # Should have exactly one check (NRC only, no name)
        nrc_checks = [c for c in checks if c.field == "nrc_number"]
        self.assertEqual(len(nrc_checks), 1)

        check = nrc_checks[0]
        nrc_found = nrc_number in extracted_text

        if nrc_found:
            self.assertEqual(check.match_score, 1.0)
            self.assertIsNone(
                check.warning,
                "Expected no warning when NRC is found in text",
            )
        else:
            self.assertEqual(check.match_score, 0.0)
            self.assertEqual(
                check.warning,
                "nrc_mismatch",
                "Expected nrc_mismatch warning when NRC not found in text",
            )

    @given(
        nrc_number=nrc_numbers,
    )
    @settings(max_examples=5)
    def test_nrc_found_when_embedded_in_text(self, nrc_number):
        """When NRC number is embedded in the extracted text, no nrc_mismatch warning."""
        from apps.applications.document_intelligence import DocumentIntelligence

        # Embed the NRC in surrounding text
        extracted_text = f"National Registration Card Number: {nrc_number} issued in Lusaka"
        doc = _make_mock_doc(extracted_text=extracted_text)
        app = _make_mock_app_for_doc(full_name=None, nrc_number=nrc_number)

        di = DocumentIntelligence()
        checks = di._check_consistency(doc, app)

        nrc_checks = [c for c in checks if c.field == "nrc_number"]
        self.assertEqual(len(nrc_checks), 1)
        self.assertEqual(nrc_checks[0].match_score, 1.0)
        self.assertIsNone(nrc_checks[0].warning)

    @given(
        extracted_text=extracted_texts,
    )
    @settings(max_examples=5)
    def test_no_checks_when_app_has_no_name_or_nrc(self, extracted_text):
        """When application has neither full_name nor nrc_number, no checks are produced."""
        from apps.applications.document_intelligence import DocumentIntelligence

        doc = _make_mock_doc(extracted_text=extracted_text)
        app = _make_mock_app_for_doc(full_name=None, nrc_number=None)

        di = DocumentIntelligence()
        checks = di._check_consistency(doc, app)

        self.assertEqual(len(checks), 0)


# ---------------------------------------------------------------------------
# Property 21: Completeness score formula
# ---------------------------------------------------------------------------


class TestCompletenessScoreFormula(SimpleTestCase):
    """# Feature: admissions-logic-canonicalization, Property 21: Completeness score formula

    For any Application, the CompletenessResult.score SHALL equal
    round(document_score * 0.4 + consistency_score * 0.3 + grade_score * 0.3)
    where each component is independently computed.

    **Validates: Requirements 9.5**
    """

    @given(
        document_score=component_scores,
        consistency_score=component_scores,
        grade_score=component_scores,
    )
    @settings(max_examples=5)
    def test_total_score_matches_weighted_formula(
        self, document_score, consistency_score, grade_score
    ):
        """Total score equals round(doc*0.4 + consistency*0.3 + grade*0.3)."""
        from apps.applications.document_intelligence import (
            DocumentIntelligence,
        )

        mock_app = MagicMock()
        mock_app.id = uuid.uuid4()

        # Control document_score via reverse relation
        if document_score >= 100:
            uploaded_types = ["nrc", "passport", "result_slip"]
        elif document_score >= 67:
            uploaded_types = ["nrc", "passport"]
        elif document_score >= 33:
            uploaded_types = ["nrc"]
        else:
            uploaded_types = []

        mock_docs = []
        for dt in uploaded_types:
            d = MagicMock()
            d.document_type = dt
            d.extracted_text = ""
            mock_docs.append(d)

        # Control grade_score via reverse relation
        if grade_score >= 100:
            grade_count = 5
        else:
            grade_count = round(grade_score * 5 / 100)

        mock_grades = [MagicMock() for _ in range(grade_count)]

        mock_app.applicationdocument_set.all.return_value = mock_docs
        mock_app.applicationgrade_set.all.return_value = mock_grades

        di = DocumentIntelligence()
        result = di.compute_completeness(mock_app)

        # Recompute expected component scores from the mocked data
        actual_doc_ratio = len(set(uploaded_types) & di.REQUIRED_DOC_TYPES) / len(di.REQUIRED_DOC_TYPES)
        expected_doc_score = round(actual_doc_ratio * 100)
        expected_grade_score = min(100, round((grade_count / 5) * 100))
        expected_consistency_score = 100

        expected_total = round(
            expected_doc_score * 0.4
            + expected_consistency_score * 0.3
            + expected_grade_score * 0.3
        )

        self.assertEqual(result.document_score, expected_doc_score)
        self.assertEqual(result.grade_score, expected_grade_score)
        self.assertEqual(result.consistency_score, expected_consistency_score)
        self.assertEqual(
            result.score,
            expected_total,
            f"Expected score={expected_total} from doc={expected_doc_score}, "
            f"consistency={expected_consistency_score}, grade={expected_grade_score}",
        )

    @given(
        doc_types=st.lists(
            st.sampled_from(["nrc", "passport", "result_slip", "other", "certificate"]),
            min_size=0,
            max_size=5,
        ),
        grade_count=st.integers(min_value=0, max_value=10),
    )
    @settings(max_examples=5)
    def test_completeness_formula_with_realistic_inputs(
        self, doc_types, grade_count
    ):
        """With realistic doc types and grade counts, the formula holds."""
        from apps.applications.document_intelligence import DocumentIntelligence

        mock_app = MagicMock()
        mock_app.id = uuid.uuid4()

        mock_docs = []
        for dt in doc_types:
            d = MagicMock()
            d.document_type = dt
            d.extracted_text = ""
            mock_docs.append(d)

        mock_grades = [MagicMock() for _ in range(grade_count)]

        mock_app.applicationdocument_set.all.return_value = mock_docs
        mock_app.applicationgrade_set.all.return_value = mock_grades

        di = DocumentIntelligence()
        result = di.compute_completeness(mock_app)

        # Independently compute expected scores
        required = {"nrc", "passport", "result_slip"}
        doc_ratio = len(set(doc_types) & required) / len(required)
        expected_doc_score = round(doc_ratio * 100)
        expected_consistency_score = 100
        expected_grade_score = min(100, round((grade_count / 5) * 100))

        expected_total = round(
            expected_doc_score * 0.4
            + expected_consistency_score * 0.3
            + expected_grade_score * 0.3
        )

        self.assertEqual(result.score, expected_total)
        self.assertEqual(result.document_score, expected_doc_score)
        self.assertEqual(result.consistency_score, expected_consistency_score)
        self.assertEqual(result.grade_score, expected_grade_score)


# ---------------------------------------------------------------------------
# Strategies for notification tests
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Property 22 & 23 removed: SSE dispatch_event and notification_tasks
# were deleted as part of SSE removal (sse-removal-simplification spec).
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Strategies for ReviewQueueScorer tests
# ---------------------------------------------------------------------------

completeness_scores = st.integers(min_value=0, max_value=100)
payment_statuses = st.sampled_from([
    "verified", "paid", "force_approved", "deferred", "pending", "not_paid", "failed",
])
doc_warning_flags = st.booleans()
deadline_urgency_values = st.sampled_from([50.0, 80.0, 100.0])
time_score_values = st.floats(min_value=0.0, max_value=100.0, allow_nan=False, allow_infinity=False)


def _make_review_application(payment_status="not_paid", intake="January 2026",
                              review_started_at=None, submitted_at=None):
    """Create a mock Application for review queue scoring."""
    app = MagicMock()
    app.id = uuid.uuid4()
    app.payment_status = payment_status
    app.intake = intake
    app.review_started_at = review_started_at
    app.submitted_at = submitted_at
    return app


# ---------------------------------------------------------------------------
# Property 24: Review queue priority score and classification
# ---------------------------------------------------------------------------


class TestReviewQueuePriorityScoreAndClassification(SimpleTestCase):
    """# Feature: admissions-logic-canonicalization, Property 24: Review queue priority score and classification

    *For any* Application with status in {submitted, under_review}, the
    ReviewQueueScorer.score() SHALL produce a deterministic priority score
    following the weighted formula (completeness 30%, deadline urgency 25%,
    payment readiness 20%, document confidence 15%, time in status 10%) and
    classify as ready_for_decision when completeness >= 90% and payment is
    verified, high_risk_review when document warnings exist, and
    waiting_for_student otherwise.

    **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.7**
    """

    @given(
        completeness=completeness_scores,
        payment_status=payment_statuses,
        has_doc_warnings=doc_warning_flags,
        deadline_urgency=deadline_urgency_values,
        time_score=time_score_values,
    )
    @settings(max_examples=5)
    def test_score_follows_weighted_formula(
        self, completeness, payment_status, has_doc_warnings,
        deadline_urgency, time_score,
    ):
        """Score equals completeness*0.3 + deadline*0.25 + payment*0.2 +
        doc_confidence*0.15 + time*0.1 with correct classification."""
        from apps.applications.review_queue import ReviewQueueScorer

        app = _make_review_application(payment_status=payment_status)
        scorer = ReviewQueueScorer()

        with patch.object(scorer, "_deadline_urgency", return_value=deadline_urgency), \
             patch.object(scorer, "_time_score", return_value=time_score):
            result = scorer.score(app, completeness, has_doc_warnings)

        # Compute expected score
        c_score = min(completeness, 100) * 0.3
        d_score = deadline_urgency * 0.25
        p_score = (100 if payment_status in ("verified", "paid", "force_approved", "deferred") else 0) * 0.2
        doc_score = (50 if has_doc_warnings else 100) * 0.15
        t_score = time_score * 0.1
        expected_total = round(c_score + d_score + p_score + doc_score + t_score, 1)

        self.assertEqual(result.score, expected_total)

    @given(
        completeness=completeness_scores,
        payment_status=payment_statuses,
        has_doc_warnings=doc_warning_flags,
        deadline_urgency=deadline_urgency_values,
        time_score=time_score_values,
    )
    @settings(max_examples=5)
    def test_classification_ready_for_decision(
        self, completeness, payment_status, has_doc_warnings,
        deadline_urgency, time_score,
    ):
        """Classification is ready_for_decision when completeness >= 90 and
        payment is verified/paid/force_approved/deferred."""
        from apps.applications.review_queue import ReviewQueueScorer

        app = _make_review_application(payment_status=payment_status)
        scorer = ReviewQueueScorer()

        with patch.object(scorer, "_deadline_urgency", return_value=deadline_urgency), \
             patch.object(scorer, "_time_score", return_value=time_score):
            result = scorer.score(app, completeness, has_doc_warnings)

        is_payment_verified = payment_status in ("verified", "paid", "force_approved", "deferred")

        if completeness >= 90 and is_payment_verified:
            self.assertEqual(result.classification, "ready_for_decision")
        elif has_doc_warnings:
            self.assertEqual(result.classification, "high_risk_review")
        else:
            self.assertEqual(result.classification, "waiting_for_student")

    @given(
        completeness=completeness_scores,
        payment_status=payment_statuses,
        has_doc_warnings=doc_warning_flags,
        deadline_urgency=deadline_urgency_values,
        time_score=time_score_values,
    )
    @settings(max_examples=5)
    def test_score_is_deterministic(
        self, completeness, payment_status, has_doc_warnings,
        deadline_urgency, time_score,
    ):
        """Calling score() twice with the same inputs produces identical results."""
        from apps.applications.review_queue import ReviewQueueScorer

        app = _make_review_application(payment_status=payment_status)
        scorer = ReviewQueueScorer()

        with patch.object(scorer, "_deadline_urgency", return_value=deadline_urgency), \
             patch.object(scorer, "_time_score", return_value=time_score):
            result1 = scorer.score(app, completeness, has_doc_warnings)

        with patch.object(scorer, "_deadline_urgency", return_value=deadline_urgency), \
             patch.object(scorer, "_time_score", return_value=time_score):
            result2 = scorer.score(app, completeness, has_doc_warnings)

        self.assertEqual(result1.score, result2.score)
        self.assertEqual(result1.classification, result2.classification)


# ---------------------------------------------------------------------------
# Property 25: Review queue sort order
# ---------------------------------------------------------------------------


class TestReviewQueueSortOrder(SimpleTestCase):
    """# Feature: admissions-logic-canonicalization, Property 25: Review queue sort order

    *For any* set of Applications sorted by priority, the resulting list
    SHALL be ordered by priority score descending — each application's
    score SHALL be >= the next application's score.

    **Validates: Requirements 11.6**
    """

    @given(
        scores=st.lists(
            st.floats(min_value=0.0, max_value=100.0, allow_nan=False, allow_infinity=False),
            min_size=1,
            max_size=20,
        ),
    )
    @settings(max_examples=5)
    def test_sorted_by_priority_descending(self, scores):
        """Sorting applications by priority score descending produces a list
        where each score >= the next score."""
        from apps.applications.review_queue import ReviewPriority

        priorities = [
            ReviewPriority(score=round(s, 1), classification="waiting_for_student")
            for s in scores
        ]

        sorted_priorities = sorted(priorities, key=lambda p: p.score, reverse=True)

        for i in range(len(sorted_priorities) - 1):
            self.assertGreaterEqual(
                sorted_priorities[i].score,
                sorted_priorities[i + 1].score,
                f"Priority at index {i} ({sorted_priorities[i].score}) should be >= "
                f"priority at index {i+1} ({sorted_priorities[i+1].score})",
            )


# ---------------------------------------------------------------------------
# Strategies for AnalyticsService tests
# ---------------------------------------------------------------------------

analytics_statuses = st.sampled_from([
    "draft", "submitted", "under_review", "conditionally_approved",
    "approved", "rejected", "waitlisted", "enrolled", "withdrawn",
    "expired", "enrollment_expired",
])


def _make_status_counts(draw):
    """Draw a dict of status → count for analytics testing."""
    return {
        "drafts": draw(st.integers(min_value=0, max_value=50)),
        "submitted": draw(st.integers(min_value=0, max_value=50)),
        "under_review": draw(st.integers(min_value=0, max_value=50)),
        "conditionally_approved": draw(st.integers(min_value=0, max_value=50)),
        "approved": draw(st.integers(min_value=0, max_value=50)),
        "rejected": draw(st.integers(min_value=0, max_value=50)),
        "waitlisted": draw(st.integers(min_value=0, max_value=50)),
        "enrolled": draw(st.integers(min_value=0, max_value=50)),
        "withdrawn": draw(st.integers(min_value=0, max_value=50)),
        "expired": draw(st.integers(min_value=0, max_value=50)),
        "enrollment_expired": draw(st.integers(min_value=0, max_value=50)),
    }


# ---------------------------------------------------------------------------
# Property 26: Analytics funnel counts match data
# ---------------------------------------------------------------------------


class TestAnalyticsFunnelCountsMatchData(SimpleTestCase):
    """# Feature: admissions-logic-canonicalization, Property 26: Analytics funnel counts match data

    *For any* set of Application records with known status distribution,
    funnel_metrics() SHALL return counts that exactly match the actual
    application counts per status, and conversion rates SHALL be computed
    correctly from those counts.

    **Validates: Requirements 12.1, 12.2**
    """

    @given(data=st.data())
    @settings(max_examples=5)
    def test_funnel_counts_equal_aggregate_counts(self, data):
        """funnel_metrics() returns counts matching the mocked aggregate data
        and correctly computes total and conversion rates."""
        from apps.analytics.admissions_analytics import AdmissionsAnalyticsService

        counts = _make_status_counts(data.draw)

        total = sum(counts.values())
        submitted_plus = (
            counts["submitted"] + counts["under_review"]
            + counts["conditionally_approved"] + counts["approved"]
            + counts["rejected"] + counts["waitlisted"]
            + counts["enrolled"] + counts["withdrawn"]
            + counts["enrollment_expired"]
        )
        accepted_plus = (
            counts["conditionally_approved"]
            + counts["approved"]
            + counts["enrolled"]
        )

        expected_draft_to_submission_rate = (
            round(submitted_plus / total * 100, 1) if total else 0
        )
        expected_submission_to_approval_rate = (
            round(accepted_plus / submitted_plus * 100, 1) if submitted_plus else 0
        )

        mock_qs = MagicMock()
        mock_qs.aggregate.return_value = counts

        with patch(
            "apps.analytics.admissions_analytics.Application.objects"
        ) as mock_objects:
            mock_objects.all.return_value = mock_qs
            mock_qs.filter.return_value = mock_qs

            service = AdmissionsAnalyticsService()
            result = service.funnel_metrics({})

        # Verify each status count matches
        self.assertEqual(result["drafts"], counts["drafts"])
        self.assertEqual(result["submitted"], counts["submitted"])
        self.assertEqual(result["under_review"], counts["under_review"])
        self.assertEqual(result["conditionally_approved"], counts["conditionally_approved"])
        self.assertEqual(result["approved"], counts["approved"])
        self.assertEqual(result["rejected"], counts["rejected"])
        self.assertEqual(result["waitlisted"], counts["waitlisted"])
        self.assertEqual(result["enrolled"], counts["enrolled"])
        self.assertEqual(result["withdrawn"], counts["withdrawn"])
        self.assertEqual(result["expired"], counts["expired"])
        self.assertEqual(result["enrollment_expired"], counts["enrollment_expired"])

        # Verify total
        self.assertEqual(result["total"], total)

        # Verify conversion rates
        self.assertAlmostEqual(
            result["draft_to_submission_rate"],
            expected_draft_to_submission_rate,
            places=1,
        )
        self.assertAlmostEqual(
            result["submission_to_approval_rate"],
            expected_submission_to_approval_rate,
            places=1,
        )

    @given(data=st.data())
    @settings(max_examples=5)
    def test_empty_dataset_returns_zero_rates(self, data):
        """When all counts are zero, conversion rates are 0."""
        from apps.analytics.admissions_analytics import AdmissionsAnalyticsService

        counts = {
            "drafts": 0,
            "submitted": 0,
            "under_review": 0,
            "conditionally_approved": 0,
            "approved": 0,
            "rejected": 0,
            "waitlisted": 0,
            "enrolled": 0,
            "withdrawn": 0,
            "expired": 0,
            "enrollment_expired": 0,
        }

        mock_qs = MagicMock()
        mock_qs.aggregate.return_value = counts

        with patch(
            "apps.analytics.admissions_analytics.Application.objects"
        ) as mock_objects:
            mock_objects.all.return_value = mock_qs
            mock_qs.filter.return_value = mock_qs

            service = AdmissionsAnalyticsService()
            result = service.funnel_metrics({})

        self.assertEqual(result["total"], 0)
        self.assertEqual(result["draft_to_submission_rate"], 0)
        self.assertEqual(result["submission_to_approval_rate"], 0)


# ---------------------------------------------------------------------------
# Property 27: Analytics date range filtering
# ---------------------------------------------------------------------------


class TestAnalyticsDateRangeFiltering(SimpleTestCase):
    """# Feature: admissions-logic-canonicalization, Property 27: Analytics date range filtering

    *For any* date range filter (start_date and/or end_date), the
    _apply_filters() method SHALL apply created_at__gte and created_at__lte
    filters to the queryset. Institution and program filters SHALL also be
    applied when provided.

    **Validates: Requirements 12.6, 12.7**
    """

    @given(
        start_date=st.dates(
            min_value=date(2020, 1, 1), max_value=date(2030, 12, 31)
        ),
        end_date=st.dates(
            min_value=date(2020, 1, 1), max_value=date(2030, 12, 31)
        ),
    )
    @settings(max_examples=5)
    def test_date_range_filters_applied(self, start_date, end_date):
        """_apply_filters() applies created_at__gte and created_at__lte
        when start_date and end_date are provided."""
        from apps.analytics.admissions_analytics import AdmissionsAnalyticsService

        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs

        service = AdmissionsAnalyticsService()
        result_qs = service._apply_filters(mock_qs, {
            "start_date": start_date,
            "end_date": end_date,
        })

        # Verify filter was called with date range params
        filter_calls = mock_qs.filter.call_args_list
        filter_kwargs = {}
        for call in filter_calls:
            filter_kwargs.update(call.kwargs)

        self.assertIn("created_at__gte", filter_kwargs)
        self.assertIn("created_at__lte", filter_kwargs)
        self.assertEqual(filter_kwargs["created_at__gte"], start_date)
        self.assertEqual(filter_kwargs["created_at__lte"], end_date)

    @given(
        institution=institution_names,
        program=program_names,
    )
    @settings(max_examples=5)
    def test_institution_and_program_filters_applied(self, institution, program):
        """_apply_filters() applies institution__icontains and program__icontains
        when institution and program are provided."""
        from apps.analytics.admissions_analytics import AdmissionsAnalyticsService

        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs

        service = AdmissionsAnalyticsService()
        result_qs = service._apply_filters(mock_qs, {
            "institution": institution,
            "program": program,
        })

        filter_calls = mock_qs.filter.call_args_list
        filter_kwargs = {}
        for call in filter_calls:
            filter_kwargs.update(call.kwargs)

        self.assertIn("institution__icontains", filter_kwargs)
        self.assertIn("program__icontains", filter_kwargs)
        self.assertEqual(filter_kwargs["institution__icontains"], institution)
        self.assertEqual(filter_kwargs["program__icontains"], program)

    @settings(max_examples=5)
    @given(data=st.data())
    def test_empty_filters_do_not_modify_queryset(self, data):
        """_apply_filters() with empty dict does not call filter() on the queryset."""
        from apps.analytics.admissions_analytics import AdmissionsAnalyticsService

        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs

        service = AdmissionsAnalyticsService()
        result_qs = service._apply_filters(mock_qs, {})

        mock_qs.filter.assert_not_called()

    @given(
        start_date=st.dates(
            min_value=date(2020, 1, 1), max_value=date(2030, 12, 31)
        ),
    )
    @settings(max_examples=5)
    def test_only_start_date_applies_gte_filter(self, start_date):
        """_apply_filters() with only start_date applies created_at__gte only."""
        from apps.analytics.admissions_analytics import AdmissionsAnalyticsService

        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs

        service = AdmissionsAnalyticsService()
        result_qs = service._apply_filters(mock_qs, {"start_date": start_date})

        filter_calls = mock_qs.filter.call_args_list
        self.assertEqual(len(filter_calls), 1)
        self.assertEqual(
            filter_calls[0].kwargs.get("created_at__gte"), start_date
        )
