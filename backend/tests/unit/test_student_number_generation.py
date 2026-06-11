"""Unit tests for student-number generation on full acceptance.

Covers:
  * `_generate_student_number` format + fallback path (SQLite has no SQL helper)
  * `assign_student_number_if_needed` idempotence
  * `transition_application_status` assigns a number only on 'enrolled'
  * the serializer exposes `student_number` read-only

These tests use mocks/patches in the style of test_enrollment.py and do not
require the real Postgres SQL helper function.
"""

import re
import uuid
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def _noop_atomic_for_sql_helper():
    """Make the savepoint wrapper in the SQL-helper path a no-op.

    ``_generate_application_number`` / ``_generate_student_number`` wrap their
    ``SELECT next_*()`` call in ``transaction.atomic()`` (savepoint) so a
    missing function rolls back without poisoning the outer transaction. These
    tests patch a fake ``connection`` and never touch a real DB, so the real
    ``transaction.atomic`` (which would require DB access) is replaced with a
    passthrough context manager.
    """
    import contextlib
    from unittest.mock import patch as _patch

    @contextlib.contextmanager
    def _passthrough(*a, **k):
        yield

    with _patch("django.db.transaction.atomic", _passthrough):
        yield


import pytest


@pytest.fixture(autouse=True)
def _passthrough_access_scope_autouse():
    """Neutralise multi-tenant application scoping for these tests.

    The admin review / document / export paths now route through
    ``AccessScopeService().filter_applications`` (multi-tenant Beanola). These
    tests predate that scoping and assert review/notification/export behaviour
    for an admin actor, so the scope service returns the queryset unchanged
    (document_views imports it at module level; other call sites import it
    lazily from apps.catalog.services).
    """
    from unittest.mock import patch as _patch
    targets = []
    try:
        import apps.applications.document_views  # noqa: F401
        targets.append("apps.applications.document_views.AccessScopeService")
    except Exception:
        pass
    targets.append("apps.catalog.services.AccessScopeService")
    mocks = []
    import contextlib
    with contextlib.ExitStack() as stack:
        for t in targets:
            m = stack.enter_context(_patch(t))
            m.return_value.filter_applications.side_effect = lambda qs, _user: qs
            m.return_value.filters_for_user.return_value = __import__(
                "apps.catalog.services", fromlist=["ScopeFilters"]
            ).ScopeFilters(True, set(), set(), set())
        yield



_VH = "apps.applications._view_helpers"
STUDENT_NUMBER_RE = re.compile(r"^[A-Z]+/\d{2}/\d{5}$")


def _mock_app(status="approved", student_number=None, aid=None):
    a = MagicMock()
    a.id = aid or uuid.uuid4()
    a.status = status
    a.institution = "Mukuba Institute of Health and Applied Sciences"
    a.student_number = student_number
    a.program = "Diploma in Registered Nursing"
    a.intake = "July 2026 Intake"
    return a


class TestGenerateStudentNumber:
    def test_format_via_fallback(self):
        """With no SQL helper (SQLite), the fallback yields {CODE}/{YY}/{SEQ5}."""
        from apps.applications._view_helpers import _generate_student_number

        with patch(f"{_VH}._resolve_institution_code", return_value="MIHAS"), \
             patch(f"{_VH}.Application.objects") as objs, \
             patch("django.db.connection") as conn:
            # Force the SQL-helper path to fail so we exercise the fallback.
            conn.cursor.side_effect = Exception("no SQL helper on sqlite")
            objs.filter.return_value.count.return_value = 0
            objs.filter.return_value.exists.return_value = False

            number = _generate_student_number("Mukuba Institute of Health and Applied Sciences")

        assert STUDENT_NUMBER_RE.match(number), number
        assert number.startswith("MIHAS/")
        assert number.endswith("/00001")

    def test_uses_sql_helper_when_available(self):
        from apps.applications._view_helpers import _generate_student_number

        cursor = MagicMock()
        cursor.fetchone.return_value = ("MIHAS/26/00042",)
        cursor_cm = MagicMock()
        cursor_cm.__enter__.return_value = cursor

        with patch(f"{_VH}._resolve_institution_code", return_value="MIHAS"), \
             patch("django.db.connection") as conn:
            conn.cursor.return_value = cursor_cm
            number = _generate_student_number("MIHAS")

        assert number == "MIHAS/26/00042"


class TestAssignIdempotence:
    def test_returns_existing_number_unchanged(self):
        from apps.applications._view_helpers import assign_student_number_if_needed

        app = _mock_app(status="enrolled", student_number="MIHAS/26/00007")
        with patch(f"{_VH}.Application.objects") as objs:
            result = assign_student_number_if_needed(app)
            # Already has one → no DB write, returns the existing value.
            objs.filter.return_value.update.assert_not_called()
        assert result == "MIHAS/26/00007"

    def test_assigns_and_persists_when_missing(self):
        from apps.applications import _view_helpers as vh

        app = _mock_app(status="enrolled", student_number=None)
        with patch(f"{_VH}._generate_student_number", return_value="MIHAS/26/00009"), \
             patch(f"{_VH}.Application.objects") as objs:
            result = vh.assign_student_number_if_needed(app)
            objs.filter.assert_called_once_with(id=app.id)
            objs.filter.return_value.update.assert_called_once_with(student_number="MIHAS/26/00009")
        assert result == "MIHAS/26/00009"
        assert app.student_number == "MIHAS/26/00009"


class TestTransitionAssignsOnEnrolledOnly:
    """transition_application_status assigns a number on 'enrolled' only."""

    def _transition(self, app, new_status):
        from apps.applications.services import transition_application_status
        with patch("apps.applications.services.ApplicationStatusHistory.objects"), \
             patch("apps.applications.services.Application.objects"):
            return transition_application_status(
                application=app,
                new_status=new_status,
                changed_by=str(uuid.uuid4()),
            )

    def test_assigns_on_enrolled(self):
        app = _mock_app(status="approved", student_number=None)
        app.save = MagicMock()
        with patch(f"{_VH}.assign_student_number_if_needed") as assign:
            self._transition(app, "enrolled")
            assign.assert_called_once()

    def test_not_assigned_on_approved(self):
        app = _mock_app(status="submitted", student_number=None)
        app.save = MagicMock()
        app.enrollment_confirmation_deadline = None
        with patch(f"{_VH}.assign_student_number_if_needed") as assign, \
             patch("apps.applications.enrollment_service.EnrollmentService.compute_deadline", return_value=None):
            self._transition(app, "approved")
            assign.assert_not_called()

    def test_not_reassigned_when_already_present(self):
        app = _mock_app(status="approved", student_number="MIHAS/26/00001")
        app.save = MagicMock()
        with patch(f"{_VH}.assign_student_number_if_needed") as assign:
            self._transition(app, "enrolled")
            assign.assert_not_called()


class TestSerializerExposesStudentNumber:
    def test_field_present_and_read_only(self):
        from apps.applications.serializers import ApplicationSerializer

        ser = ApplicationSerializer()
        assert "student_number" in ser.Meta.fields
        assert "student_number" in ser.Meta.read_only_fields
