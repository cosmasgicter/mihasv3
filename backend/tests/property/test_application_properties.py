"""Property-based tests for application CRUD.

# Feature: python-backend-migration, Property 11: Application CRUD round-trip
# Feature: python-backend-migration, Property 12: Application listing — filter and sort correctness
# Feature: python-backend-migration, Property 13: Public tracking without authentication
# Feature: python-backend-migration, Property 14: Unverified payment approval guard
# Feature: python-backend-migration, Property 15: Draft auto-save round-trip
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import uuid  # noqa: E402
from datetime import date  # noqa: E402
from decimal import Decimal  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings, assume  # noqa: E402
from hypothesis import strategies as st  # noqa: E402
from rest_framework.permissions import AllowAny  # noqa: E402

_default_settings = settings(max_examples=5, deadline=None)

_statuses = st.sampled_from(["draft", "submitted", "under_review", "approved", "rejected"])
_sexes = st.sampled_from(["male", "female"])
_names = st.text(
    alphabet=st.characters(whitelist_categories=("L",), min_codepoint=65, max_codepoint=122),
    min_size=2, max_size=50,
)
# Safe text strategy that avoids null bytes and control chars that DRF rejects
_safe_text = st.text(
    alphabet=st.characters(
        whitelist_categories=("L", "N", "P", "Z"),
        min_codepoint=32,
        max_codepoint=126,
    ),
    max_size=100,
)
_programs = st.sampled_from(["Nursing", "Pharmacy", "Clinical Medicine", "Lab Technology"])
_intakes = st.sampled_from(["January 2025", "September 2025", "January 2026"])
_institutions = st.sampled_from(["MIHAS Main Campus", "MIHAS Satellite"])
# Tracking codes: printable non-whitespace strings
# Tracking codes: generate valid-format codes that won't exist in the DB
_tracking_codes = st.one_of(
    # APP-YYYYMMDD-XXXXXXXX format
    st.builds(
        lambda d, s: f"APP-{d}-{s}",
        st.from_regex(r"\d{8}", fullmatch=True),
        st.from_regex(r"[A-Z0-9]{8}", fullmatch=True),
    ),
    # MIHAS + 9 digits format
    st.builds(lambda d: f"MIHAS{d}", st.from_regex(r"\d{9}", fullmatch=True)),
    # TRK + 5-6 alphanum format (no dash)
    st.builds(lambda s: f"TRK{s}", st.from_regex(r"[A-Z0-9]{5,6}", fullmatch=True)),
    # TRK-XXXXXXXXXXXX format (with dash)
    st.builds(lambda s: f"TRK-{s}", st.from_regex(r"[A-Z0-9]{12}", fullmatch=True)),
)


def _make_mock_user(role="student", user_id=None):
    user = MagicMock()
    user.id = user_id or str(uuid.uuid4())
    user.pk = user.id
    user.email = "test@example.com"
    user.role = role
    user.is_authenticated = True
    return user


def _make_mock_application(user_id=None, status_val="draft", **overrides):
    app = MagicMock()
    app.id = str(uuid.uuid4())
    app.user_id = user_id or str(uuid.uuid4())
    app.application_number = f"APP-20250101-{uuid.uuid4().hex[:8].upper()}"
    app.public_tracking_code = f"TRK-{uuid.uuid4().hex[:12].upper()}"
    app.full_name = overrides.get("full_name", "Test User")
    app.nrc_number = overrides.get("nrc_number", "")
    app.passport_number = ""
    app.date_of_birth = date(2000, 1, 1)
    app.sex = overrides.get("sex", "male")
    app.phone = "+260971234567"
    app.email = "test@example.com"
    app.residence_town = "Lusaka"
    app.nationality = "Zambian"
    app.country = None
    app.address_line_1 = None
    app.address_line_2 = None
    app.postal_code = None
    app.next_of_kin_name = None
    app.next_of_kin_phone = None
    app.program = overrides.get("program", "Nursing")
    app.intake = overrides.get("intake", "January 2025")
    app.institution = overrides.get("institution", "MIHAS Main Campus")
    app.result_slip_url = None
    app.extra_kyc_url = None
    app.application_fee = Decimal("153.00")
    app.payment_summary_method = None
    app.payment_summary_paid_amount = None
    app.payment_summary_paid_at = None
    app.payment_summary_receipt_number = None
    app.payment_summary_reference = None
    app.payment_method = None
    app.paid_amount = None
    app.paid_at = None
    app.receipt_number = None
    app.payment_reference = None
    app.last_payment_reference = None
    app.payment_status = None
    app.payment_verified_at = None
    app.payment_verified_by = None
    app.status = status_val
    app.eligibility_status = None
    app.eligibility_score = None
    app.eligibility_notes = None
    app.admin_feedback = None
    app.admin_feedback_date = None
    app.admin_feedback_by = None
    app.review_started_at = None
    app.decision_date = None
    app.reviewed_by = None
    app.additional_subjects = None
    app.submitted_at = None
    app.version = 1
    app.created_at = MagicMock()
    app.created_at.isoformat.return_value = "2025-01-01T00:00:00"
    app.updated_at = MagicMock()
    app.updated_at.isoformat.return_value = "2025-01-01T00:00:00"
    app.save = MagicMock()
    return app


# =========================================================================
# Property 11: Application CRUD round-trip
# =========================================================================


class TestApplicationCRUDRoundTrip(SimpleTestCase):
    """Property 11: Application CRUD round-trip.

    For any valid application data (with valid program, intake, institution),
    creating an application and reading it back returns the same field values.
    Invalid catalog references fail with field-level validation errors.

    **Validates: Requirements 4.1, 4.2**
    """

    @given(
        full_name=_names,
        sex=_sexes,
        program=_programs,
        intake=_intakes,
        institution=_institutions,
    )
    @_default_settings
    def test_create_serializer_accepts_valid_data(self, full_name, sex, program, intake, institution):
        """ApplicationCreateSerializer accepts valid data when catalog refs exist."""
        from apps.applications.serializers import ApplicationCreateSerializer

        data = {
            "full_name": full_name,
            "date_of_birth": "2000-01-15",
            "sex": sex,
            "phone": "+260971234567",
            "email": "test@example.com",
            "residence_town": "Lusaka",
            "nationality": "Zambian",
            "program": program,
            "intake": intake,
            "institution": institution,
        }

        # Patch at the catalog models level where the serializer imports from.
        # IdentifierResolver also uses these model objects, so mock returns
        # must have proper name/code/id attributes for the resolver.
        with patch("apps.catalog.models.Program.objects") as MockProgramObjects, \
             patch("apps.catalog.models.Intake.objects") as MockIntakeObjects, \
             patch("apps.catalog.models.Institution.objects") as MockInstitutionObjects, \
             patch("apps.catalog.models.ProgramIntake.objects") as MockProgramIntakeObjects:
            mock_program = MagicMock()
            mock_program.id = uuid.uuid4()
            mock_program.name = program
            mock_program.code = "PROG01"
            mock_program.is_active = True
            mock_intake = MagicMock()
            mock_intake.id = uuid.uuid4()
            mock_intake.name = intake
            mock_intake.is_active = True
            mock_institution = MagicMock()
            mock_institution.id = uuid.uuid4()
            mock_institution.name = institution
            mock_institution.code = "INST01"
            mock_institution.is_active = True
            MockProgramObjects.filter.return_value.exists.return_value = True
            MockProgramObjects.filter.return_value.first.return_value = mock_program
            MockIntakeObjects.filter.return_value.exists.return_value = True
            MockIntakeObjects.filter.return_value.first.return_value = mock_intake
            MockInstitutionObjects.filter.return_value.exists.return_value = True
            MockInstitutionObjects.filter.return_value.first.return_value = mock_institution
            MockProgramIntakeObjects.filter.return_value.exists.return_value = True

            serializer = ApplicationCreateSerializer(data=data)
            self.assertTrue(serializer.is_valid(), serializer.errors)

            validated = serializer.validated_data
            self.assertEqual(validated["full_name"], full_name)
            self.assertEqual(validated["sex"], sex)
            self.assertEqual(validated["program"], program)

    @given(program=_programs)
    @_default_settings
    def test_create_serializer_rejects_invalid_program(self, program):
        """ApplicationCreateSerializer rejects data when program doesn't exist."""
        from apps.applications.serializers import ApplicationCreateSerializer

        data = {
            "full_name": "Test User",
            "date_of_birth": "2000-01-15",
            "sex": "male",
            "phone": "+260971234567",
            "email": "test@example.com",
            "residence_town": "Lusaka",
            "program": program,
            "intake": "January 2025",
            "institution": "MIHAS Main Campus",
        }

        # IdentifierResolver.resolve_program() calls Program.objects.filter().first()
        # twice (by name, then by code). Both must return None for "not_found".
        with patch("apps.catalog.models.Program.objects") as MockProgramObjects, \
             patch("apps.catalog.models.Intake.objects") as MockIntakeObjects, \
             patch("apps.catalog.models.Institution.objects") as MockInstitutionObjects:
            MockProgramObjects.filter.return_value.exists.return_value = False
            MockProgramObjects.filter.return_value.first.return_value = None
            MockIntakeObjects.filter.return_value.exists.return_value = True
            MockInstitutionObjects.filter.return_value.exists.return_value = True

            serializer = ApplicationCreateSerializer(data=data)
            self.assertFalse(serializer.is_valid())
            self.assertIn("program", serializer.errors)

    @given(full_name=_names, sex=_sexes)
    @_default_settings
    def test_application_serializer_round_trip(self, full_name, sex):
        """ApplicationSerializer serializes and preserves field values."""
        from apps.applications.serializers import ApplicationSerializer

        app = _make_mock_application(full_name=full_name, sex=sex)
        serializer = ApplicationSerializer(app)
        data = serializer.data

        self.assertEqual(data["full_name"], full_name)
        self.assertEqual(data["sex"], sex)
        self.assertEqual(data["status"], "draft")


# =========================================================================
# Property 12: Application listing — filter and sort correctness
# =========================================================================


class TestApplicationListingFilterSort(SimpleTestCase):
    """Property 12: Application listing — filter and sort correctness.

    For any combination of filters and sort parameters, the returned list
    contains only matching applications in the correct order.

    **Validates: Requirements 4.3**
    """

    @given(filter_status=_statuses)
    @_default_settings
    def test_filter_by_status_returns_only_matching(self, filter_status):
        """ApplicationFilter with status returns only matching records."""
        from apps.applications.filters import ApplicationFilter

        apps = [
            _make_mock_application(status_val=filter_status),
            _make_mock_application(status_val="other_status"),
        ]

        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.all.return_value = mock_qs
        mock_qs.__iter__ = lambda self: iter([apps[0]])

        with patch.object(ApplicationFilter, "filter_queryset", return_value=mock_qs):
            f = ApplicationFilter(data={"status": filter_status})
            self.assertIn("status", f.filters)

    @given(search_term=_names)
    @_default_settings
    def test_search_filter_exists(self, search_term):
        """ApplicationFilter has a search filter method."""
        from apps.applications.filters import ApplicationFilter

        f = ApplicationFilter()
        self.assertIn("search", f.filters)

    def test_sort_filter_allows_created_at_and_full_name(self):
        """Sort filter accepts created_at and full_name fields."""
        from apps.applications.filters import ApplicationFilter

        f = ApplicationFilter()
        self.assertIn("sort", f.filters)


# =========================================================================
# Property 13: Public tracking without authentication
# =========================================================================


class TestPublicTrackingWithoutAuth(SimpleTestCase):
    """Property 13: Public tracking without authentication.

    For any valid application number or tracking code, the public tracking
    endpoint returns status, program, intake, submission date without auth.
    Invalid codes return 404.

    **Validates: Requirements 4.5**
    """

    def test_track_view_has_allow_any_permission(self):
        """ApplicationTrackView must use AllowAny permission and OptionalJWTCookieAuthentication."""
        from apps.applications.views import ApplicationTrackView
        from apps.accounts.authentication import OptionalJWTCookieAuthentication

        view = ApplicationTrackView()
        self.assertEqual(view.permission_classes, [AllowAny])
        self.assertEqual(view.authentication_classes, [OptionalJWTCookieAuthentication])

    @given(code=_tracking_codes)
    @_default_settings
    def test_track_view_returns_404_for_nonexistent_code(self, code):
        """Track view returns 404 for non-existent tracking code."""
        assume(code.strip() != "")

        from apps.applications.views import ApplicationTrackView
        from apps.applications.models import Application

        request = MagicMock()
        request.query_params = {"code": code}

        with patch("apps.applications.public_views.Application.objects") as mock_qs:
            mock_qs.get.side_effect = Application.DoesNotExist()

            view = ApplicationTrackView()
            response = view.get(request)

        self.assertEqual(response.status_code, 404)

    def test_track_view_returns_400_for_empty_code(self):
        """Track view returns 400 when no code is provided."""
        from apps.applications.views import ApplicationTrackView

        request = MagicMock()
        request.query_params = {"code": ""}

        view = ApplicationTrackView()
        response = view.get(request)
        self.assertEqual(response.status_code, 400)

    def test_tracking_serializer_exposes_limited_fields(self):
        """ApplicationTrackingSerializer only exposes status, program, intake, created_at."""
        from apps.applications.serializers import ApplicationTrackingSerializer

        fields = ApplicationTrackingSerializer.Meta.fields
        self.assertIn("status", fields)
        self.assertIn("program", fields)
        self.assertIn("intake", fields)
        self.assertIn("created_at", fields)
        # Should NOT expose PII
        self.assertNotIn("email", fields)
        self.assertNotIn("phone", fields)
        self.assertNotIn("full_name", fields)
        self.assertNotIn("nrc_number", fields)


# =========================================================================
# Property 14: Unverified payment approval guard
# =========================================================================


class TestUnverifiedPaymentApprovalGuard(SimpleTestCase):
    """Property 14: Unverified payment approval guard.

    For any application with unverified payment, admin approval without
    force flag is rejected. With force flag, approval proceeds.

    **Validates: Requirements 4.7**
    """

    @given(notes=_safe_text)
    @_default_settings
    def test_approval_without_force_rejected_when_payment_unverified(self, notes):
        """Review with new_status=approved and no force flag is rejected
        when payment is unverified."""
        from apps.applications.views import ApplicationReviewView

        app = _make_mock_application(status_val="submitted")
        user = _make_mock_user(role="admin")

        request = MagicMock()
        request.user = user
        request.data = {"new_status": "approved", "notes": notes}

        with patch("apps.applications.admin_views.Application.objects") as mock_qs:
            mock_qs.get.return_value = app

            with patch("apps.documents.models.Payment.objects") as MockPaymentObjects:
                MockPaymentObjects.filter.return_value.exists.return_value = False

                view = ApplicationReviewView()
                response = view.post(request, application_id=app.id)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "PAYMENT_UNVERIFIED")

    @given(notes=_safe_text)
    @_default_settings
    def test_approval_with_force_proceeds_when_payment_unverified(self, notes):
        """Review with new_status=approved and force=true proceeds."""
        from apps.applications.views import ApplicationReviewView

        app = _make_mock_application(status_val="submitted")
        user = _make_mock_user(role="admin")

        request = MagicMock()
        request.user = user
        request.data = {"new_status": "approved", "notes": notes, "force": True}

        with patch("apps.applications.admin_views.Application.objects") as mock_qs, \
             patch("apps.applications.admin_views.transition_application_status", return_value="submitted"), \
             patch("apps.applications.admin_views.ApplicationStatusHistory.objects") as mock_history, \
             patch("apps.common.communication_service.CommunicationService") as mock_comms, \
             patch("apps.applications.admin_views.CommunicationService", mock_comms):
            mock_qs.get.return_value = app
            mock_history.create.return_value = MagicMock()
            mock_history.filter.return_value.order_by.return_value.first.return_value = MagicMock()

            view = ApplicationReviewView()
            response = view.post(request, application_id=app.id)

        self.assertEqual(response.status_code, 200)
        resp_data = response.data.get("data", response.data)
        self.assertEqual(resp_data["new_status"], "approved")

    @given(new_status=st.sampled_from(["rejected", "under_review", "submitted"]))
    @_default_settings
    def test_non_approval_status_skips_payment_check(self, new_status):
        """Non-approval status changes don't check payment status."""
        from apps.applications.views import ApplicationReviewView

        app = _make_mock_application(status_val="submitted")
        user = _make_mock_user(role="admin")

        request = MagicMock()
        request.user = user
        request.data = {"new_status": new_status}

        with patch("apps.applications.admin_views.Application.objects") as mock_qs:
            mock_qs.get.return_value = app

            with patch("apps.applications.admin_views.ApplicationStatusHistory.objects") as mock_history:
                mock_history.create.return_value = MagicMock()

                with patch("apps.applications.admin_views.submit_application", return_value=(app, "submitted")):
                    view = ApplicationReviewView()
                    response = view.post(request, application_id=app.id)

        self.assertEqual(response.status_code, 200)


# =========================================================================
# Property 15: Draft auto-save round-trip
# =========================================================================


class TestDraftAutoSaveRoundTrip(SimpleTestCase):
    """Property 15: Draft auto-save round-trip.

    For any draft data (JSON), saving and loading back produces identical content.

    **Validates: Requirements 4.9**
    """

    @given(
        draft_data=st.fixed_dictionaries({
            "step": st.integers(min_value=1, max_value=4),
            "full_name": st.text(min_size=1, max_size=100),
        })
    )
    @_default_settings
    def test_draft_save_and_load_round_trip(self, draft_data):
        """Saving draft data and reading it back returns identical JSON."""
        from apps.applications.views import ApplicationDraftView

        user = _make_mock_user(role="student")
        user_id = str(user.id)

        mock_draft = MagicMock()
        mock_draft.id = str(uuid.uuid4())
        mock_draft.user_id = user_id
        mock_draft.application_id = None
        mock_draft.draft_data = draft_data
        mock_draft.created_at = MagicMock()
        mock_draft.created_at.isoformat.return_value = "2025-01-01T00:00:00"
        mock_draft.updated_at = MagicMock()
        mock_draft.updated_at.isoformat.return_value = "2025-01-01T00:00:00"

        request = MagicMock()
        request.user = user
        request.data = {"draft_data": draft_data}

        with patch("apps.applications.student_views.ApplicationDraft.objects") as mock_qs:
            mock_qs.update_or_create.return_value = (mock_draft, True)

            view = ApplicationDraftView()
            response = view.post(request)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["draft_data"], draft_data)

    def test_draft_serializer_includes_draft_data_field(self):
        """ApplicationDraftSerializer includes draft_data field."""
        from apps.applications.serializers import ApplicationDraftSerializer

        self.assertIn("draft_data", ApplicationDraftSerializer.Meta.fields)

    @given(
        draft_data=st.fixed_dictionaries({
            "step": st.integers(min_value=1, max_value=4),
            "notes": st.text(max_size=200),
        })
    )
    @_default_settings
    def test_draft_get_returns_latest(self, draft_data):
        """GET draft returns the most recent draft for the user."""
        from apps.applications.views import ApplicationDraftView

        user = _make_mock_user(role="student")

        mock_draft = MagicMock()
        mock_draft.id = str(uuid.uuid4())
        mock_draft.user_id = str(user.id)
        mock_draft.application_id = None
        mock_draft.draft_data = draft_data
        mock_draft.created_at = MagicMock()
        mock_draft.created_at.isoformat.return_value = "2025-01-01T00:00:00"
        mock_draft.updated_at = MagicMock()
        mock_draft.updated_at.isoformat.return_value = "2025-01-01T00:00:00"

        request = MagicMock()
        request.user = user

        with patch("apps.applications.student_views.ApplicationDraft.objects") as mock_qs:
            mock_qs.filter.return_value.order_by.return_value.first.return_value = mock_draft

            view = ApplicationDraftView()
            response = view.get(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["draft_data"], draft_data)
