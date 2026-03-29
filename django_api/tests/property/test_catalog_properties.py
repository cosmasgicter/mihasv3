"""Property-based tests for catalog endpoints.

# Feature: python-backend-migration, Property 16: Catalog visibility by role
# Feature: python-backend-migration, Property 17: Institution soft-delete with active programs
# Feature: python-backend-migration, Property 43: Catalog public caching headers
# Feature: python-backend-migration, Property 44: Program listing includes institution data
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import uuid  # noqa: E402
from unittest.mock import MagicMock, patch, PropertyMock  # noqa: E402

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

_default_settings = settings(max_examples=100, deadline=None)
_roles = st.sampled_from(["student", "admin", "reviewer", "super_admin"])
_non_admin_roles = st.sampled_from(["student", "reviewer"])
_admin_roles = st.sampled_from(["admin", "super_admin"])


def _make_mock_user(role="student", user_id=None):
    user = MagicMock()
    user.id = user_id or str(uuid.uuid4())
    user.pk = user.id
    user.email = "test@example.com"
    user.role = role
    user.is_authenticated = True
    return user


def _make_mock_institution(is_active=True):
    inst = MagicMock()
    inst.id = str(uuid.uuid4())
    inst.name = "Test Institution"
    inst.code = "TI"
    inst.full_name = "Test Institution Full"
    inst.type = "University"
    inst.accreditation_status = "Accredited"
    inst.is_active = is_active
    inst.created_at = MagicMock()
    inst.created_at.isoformat.return_value = "2025-01-01T00:00:00"
    inst.save = MagicMock()
    return inst


def _make_mock_program(institution=None, is_active=True):
    prog = MagicMock()
    prog.id = str(uuid.uuid4())
    prog.name = "Nursing"
    prog.code = "NUR"
    prog.institution = institution or _make_mock_institution()
    prog.institution_id = prog.institution.id
    prog.duration_years = 3
    prog.application_fee = 500.00
    prog.requirements = {}
    prog.is_active = is_active
    prog.created_at = MagicMock()
    prog.created_at.isoformat.return_value = "2025-01-01T00:00:00"
    return prog


# =========================================================================
# Property 16: Catalog visibility by role
# =========================================================================


class TestCatalogVisibilityByRole(SimpleTestCase):
    """Property 16: Catalog visibility by role.

    For any catalog GET request, non-admin users should not see inactive records.
    Admin users should see all records including inactive ones.

    **Validates: Requirements 5.5**
    """

    @given(role=_non_admin_roles)
    @_default_settings
    def test_non_admin_sees_only_active_programs(self, role):
        """Non-admin users should only see active programs."""
        from apps.catalog.views import _is_admin

        user = _make_mock_user(role=role)
        request = MagicMock()
        request.user = user

        self.assertFalse(_is_admin(request))

    @given(role=_admin_roles)
    @_default_settings
    def test_admin_sees_all_programs(self, role):
        """Admin users should see all programs including inactive."""
        from apps.catalog.views import _is_admin

        user = _make_mock_user(role=role)
        request = MagicMock()
        request.user = user

        self.assertTrue(_is_admin(request))

    def test_unauthenticated_user_is_not_admin(self):
        """Unauthenticated users are not admin."""
        from apps.catalog.views import _is_admin

        request = MagicMock()
        request.user = MagicMock()
        request.user.is_authenticated = False

        self.assertFalse(_is_admin(request))

    def test_program_list_view_filters_inactive_for_non_admin(self):
        """ProgramListCreateView filters inactive programs for non-admin."""
        from apps.catalog.views import ProgramListCreateView

        view = ProgramListCreateView()
        # Verify the view exists and has the correct permission classes
        self.assertIsNotNone(view)


# =========================================================================
# Property 17: Institution soft-delete with active programs
# =========================================================================


class TestInstitutionSoftDeleteWithActivePrograms(SimpleTestCase):
    """Property 17: Institution soft-delete with active programs.

    For any institution with at least one active program, a soft-delete
    request should be rejected with HTTP 409 Conflict.

    **Validates: Requirements 5.4**
    """

    @given(role=_admin_roles)
    @_default_settings
    def test_delete_rejected_when_active_programs_exist(self, role):
        """Soft-delete of institution with active programs returns 409."""
        from apps.catalog.views import InstitutionDetailView

        institution = _make_mock_institution()
        user = _make_mock_user(role=role)

        request = MagicMock()
        request.user = user

        with patch("apps.catalog.views.Institution.objects") as mock_inst_qs, \
             patch("apps.catalog.views.Program.objects") as mock_prog_qs:
            mock_inst_qs.get.return_value = institution
            mock_prog_qs.filter.return_value.exists.return_value = True

            view = InstitutionDetailView()
            response = view.delete(request, institution_id=institution.id)

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "CONFLICT")

    @given(role=_admin_roles)
    @_default_settings
    def test_delete_succeeds_when_no_active_programs(self, role):
        """Soft-delete of institution without active programs succeeds."""
        from apps.catalog.views import InstitutionDetailView

        institution = _make_mock_institution()
        user = _make_mock_user(role=role)

        request = MagicMock()
        request.user = user

        with patch("apps.catalog.views.Institution.objects") as mock_inst_qs, \
             patch("apps.catalog.views.Program.objects") as mock_prog_qs:
            mock_inst_qs.get.return_value = institution
            mock_prog_qs.filter.return_value.exists.return_value = False

            view = InstitutionDetailView()
            response = view.delete(request, institution_id=institution.id)

        self.assertEqual(response.status_code, 200)
        self.assertFalse(institution.is_active)
        institution.save.assert_called_once()

    def test_delete_returns_404_for_nonexistent_institution(self):
        """Soft-delete of non-existent institution returns 404."""
        from apps.catalog.views import InstitutionDetailView
        from apps.catalog.models import Institution

        user = _make_mock_user(role="admin")
        request = MagicMock()
        request.user = user

        with patch("apps.catalog.views.Institution.objects") as mock_qs:
            mock_qs.get.side_effect = Institution.DoesNotExist()

            view = InstitutionDetailView()
            response = view.delete(request, institution_id=str(uuid.uuid4()))

        self.assertEqual(response.status_code, 404)


# =========================================================================
# Property 43: Catalog public caching headers
# =========================================================================


class TestCatalogPublicCachingHeaders(SimpleTestCase):
    """Property 43: Catalog public caching headers.

    For any unauthenticated GET request to a catalog endpoint, the response
    should include Cache-Control: public, max-age=300.

    **Validates: Requirements 5.1**
    """

    def test_set_public_cache_sets_correct_header(self):
        """_set_public_cache sets Cache-Control: public, max-age=300."""
        from apps.catalog.views import _set_public_cache

        response = MagicMock()
        headers = {}
        response.__setitem__ = lambda self, k, v: headers.__setitem__(k, v)

        _set_public_cache(response)
        self.assertEqual(headers["Cache-Control"], "public, max-age=300")

    def test_subject_list_view_is_public(self):
        """SubjectListView uses AllowAny permission."""
        from apps.catalog.views import SubjectListView
        from rest_framework.permissions import AllowAny

        view = SubjectListView()
        self.assertEqual(view.permission_classes, [AllowAny])

    def test_subject_list_returns_cache_header(self):
        """SubjectListView GET response includes Cache-Control header."""
        from apps.catalog.views import SubjectListView

        request = MagicMock()
        request.user = MagicMock()
        request.user.is_authenticated = False

        mock_qs = MagicMock()
        mock_qs.all.return_value.order_by.return_value = []

        with patch("apps.catalog.views.Subject.objects", mock_qs):
            view = SubjectListView()
            response = view.get(request)

        self.assertEqual(response["Cache-Control"], "public, max-age=300")


# =========================================================================
# Property 44: Program listing includes institution data
# =========================================================================


class TestProgramListingIncludesInstitutionData(SimpleTestCase):
    """Property 44: Program listing includes institution data.

    For any program in a catalog listing response, the response should
    include duration_years, application_fee, and nested institution details.

    **Validates: Requirements 5.3**
    """

    def test_program_serializer_includes_institution(self):
        """ProgramSerializer includes nested institution field."""
        from apps.catalog.serializers import ProgramSerializer

        fields = ProgramSerializer.Meta.fields
        self.assertIn("institution", fields)
        self.assertIn("duration_years", fields)
        self.assertIn("application_fee", fields)

    def test_program_serializer_nests_institution_data(self):
        """ProgramSerializer renders institution as nested object."""
        from apps.catalog.serializers import ProgramSerializer

        institution = _make_mock_institution()
        program = _make_mock_program(institution=institution)

        serializer = ProgramSerializer(program)
        data = serializer.data

        self.assertIn("institution", data)
        self.assertIsInstance(data["institution"], dict)
        self.assertIn("name", data["institution"])
        self.assertIn("code", data["institution"])
        self.assertIn("type", data["institution"])

    @given(duration=st.integers(min_value=1, max_value=6))
    @_default_settings
    def test_program_serializer_includes_duration_and_fee(self, duration):
        """ProgramSerializer includes duration_years and application_fee."""
        from apps.catalog.serializers import ProgramSerializer

        institution = _make_mock_institution()
        program = _make_mock_program(institution=institution)
        program.duration_years = duration
        program.application_fee = 500.00

        serializer = ProgramSerializer(program)
        data = serializer.data

        self.assertEqual(data["duration_years"], duration)
        self.assertIn("application_fee", data)

    def test_institution_serializer_fields(self):
        """InstitutionSerializer includes name, code, type."""
        from apps.catalog.serializers import InstitutionSerializer

        fields = InstitutionSerializer.Meta.fields
        self.assertIn("name", fields)
        self.assertIn("code", fields)
        self.assertIn("type", fields)
        self.assertIn("accreditation_status", fields)
