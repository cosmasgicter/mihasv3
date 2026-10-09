"""Regression tests for role-aware admin export redaction."""

from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from apps.accounts.admin_views import (
    _is_super_admin as user_export_is_super_admin,
    _redact_email as redact_user_email,
    _redact_name as redact_user_name,
)
from apps.applications.admin_views import (
    ApplicationExportView,
    _is_super_admin as app_export_is_super_admin,
    _redact_email as redact_application_email,
    _redact_name as redact_application_name,
    _redact_phone as redact_application_phone,
)
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
        import apps.applications.document_views as _document_views

        # Only patch the module-level name if it is still there. Task 7.3 moved
        # ``document_views`` onto the shared ``resolve_scoped_application`` seam and
        # dropped its module-level ``AccessScopeService`` import, at which point
        # this fixture began raising ``AttributeError`` **at setup** and every case
        # in this file errored rather than ran. Guarding the patch target (rather
        # than only the import) is what makes the fixture describe the code that
        # exists (admissions-v2 task 9.4).
        if hasattr(_document_views, "AccessScopeService"):
            targets.append("apps.applications.document_views.AccessScopeService")
    except Exception:
        pass
    targets.append("apps.catalog.services.AccessScopeService")
    import contextlib
    with contextlib.ExitStack() as stack:
        for t in targets:
            m = stack.enter_context(_patch(t))
            m.return_value.filter_applications.side_effect = lambda qs, _user: qs
            m.return_value.filters_for_user.return_value = __import__(
                "apps.catalog.services", fromlist=["ScopeFilters"]
            ).ScopeFilters(True, set(), set(), set())
        yield


class AdminExportHardeningTests(SimpleTestCase):
    def test_regular_admin_is_not_full_export_scope(self):
        user = SimpleNamespace(role="admin")

        self.assertFalse(app_export_is_super_admin(user))
        self.assertFalse(user_export_is_super_admin(user))

    def test_super_admin_is_full_export_scope(self):
        user = SimpleNamespace(role="super_admin")

        self.assertTrue(app_export_is_super_admin(user))
        self.assertTrue(user_export_is_super_admin(user))

    def test_application_export_redacts_direct_identifiers(self):
        self.assertEqual(redact_application_name("Jane Mary Doe"), "J*** M*** D***")
        self.assertEqual(redact_application_email("jane@example.com"), "j***@example.com")
        self.assertEqual(redact_application_phone("+260 971 123456"), "***3456")

    def test_user_export_redacts_direct_identifiers(self):
        self.assertEqual(redact_user_name("Jane"), "J***")
        self.assertEqual(redact_user_email("jane@example.com"), "j***@example.com")

    # ------------------------------------------------------------------
    # The two mocked view-internals cases these replaced (task 9.4)
    # ------------------------------------------------------------------
    #
    # ``test_regular_admin_application_export_is_redacted`` and
    # ``test_super_admin_application_export_is_full`` used to drive
    # ``ApplicationExportView().get(...)`` with five patched internals
    # (``Application.objects``, ``_with_payment_summary``, ``ApplicationFilter``,
    # ``StandardPagination``, ``ApplicationListSerializer``) and assert that the
    # view's *own* ``_redact_name`` / ``_redact_email`` / ``_redact_phone`` had
    # been applied to a hand-built row list.
    #
    # Admissions-v2 task 9.4 deleted that implementation: the route now delegates
    # to the one export path (``ApplicationQueryService`` +
    # ``AdminApplicationQueryView._export``), so there is no second redaction
    # implementation inside the view to patch around, and ``StandardPagination``
    # is not involved at all — an export is page-independent by contract.
    #
    # The behaviour those two cases protected is preserved and *strengthened*:
    #   * redaction by capability, against real rows and a real capability set —
    #     ``tests/unit/test_application_query_contract_9_1.py``
    #     (``TestExportIsACommand::test_export_is_redacted_by_capability``);
    #   * the delegation itself, page-independence, byte-identity with the roster
    #     export, the export capability, the audit record and tenant scoping —
    #     ``tests/unit/test_review_workspace_9_4.py::TestExportIsOnePath`` (5 cases).
    #
    # The redaction *helpers* are still exercised directly above
    # (``test_application_export_redacts_direct_identifiers``), because they remain
    # the platform's PII-masking primitives.

    def test_the_export_route_delegates_rather_than_redacting_twice(self):
        """The view holds no second redaction or pagination implementation.

        This is the pin that replaces the two mocked cases: it asserts the
        *absence* of the shape they were written against, which is the thing task
        9.4 changed. Behaviour is covered by the two suites named above.
        """
        import ast
        from pathlib import Path

        source = (
            Path(__file__).resolve().parents[1].parent
            / "apps"
            / "applications"
            / "admin_export_views.py"
        ).read_text()
        tree = ast.parse(source)
        export_view = next(
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.ClassDef) and node.name == "ApplicationExportView"
        )
        # Blank every string literal first: the class *documents* the shape it
        # replaced, so a dump that included its own docstring would fail on its
        # own prose rather than on the code.
        for node in ast.walk(export_view):
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                node.value = ""
        body = ast.dump(export_view)
        # No second redaction implementation inside the view...
        for forbidden in ("_redact_name", "_redact_email", "_redact_phone"):
            self.assertNotIn(forbidden, body, f"the export view redacts again: {forbidden}")
        # ...and no pagination: an export is the whole filtered set.
        self.assertNotIn("StandardPagination", body)
        self.assertNotIn("paginate_queryset", body)
        # It delegates to the one export path.
        self.assertIn("_export", body)


class _FakeQuerySet(list):
    def order_by(self, *_args):
        return self

    def filter(self, **_kwargs):
        return self
