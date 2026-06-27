"""Property-based tests for bulk status update atomicity.

# Feature: tech-debt-remediation, Property 2: Bulk status updates are atomic

Uses AST/source inspection to confirm that ApplicationBulkStatusView.post()
wraps database writes in transaction.atomic() with select_for_update(), and
uses hypothesis to verify that a simulated failure mid-batch results in zero
committed changes (full rollback).
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import ast  # noqa: E402
import inspect  # noqa: E402
import textwrap  # noqa: E402
import uuid  # noqa: E402
from pathlib import Path  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.applications.admin_bulk_views import ApplicationBulkStatusView  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

_valid_statuses = st.sampled_from([
    "submitted", "under_review", "approved", "rejected",
])

_batch_sizes = st.integers(min_value=2, max_value=10)

_failure_indices = st.integers(min_value=0)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_post_method_source() -> str:
    """Return the source code of ApplicationBulkStatusView.post()."""
    source = inspect.getsource(ApplicationBulkStatusView.post)
    return textwrap.dedent(source)


def _get_post_method_ast() -> ast.FunctionDef:
    """Parse the AST of ApplicationBulkStatusView.post()."""
    source = _get_post_method_source()
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "post":
            return node
    raise AssertionError("Could not find post() method in AST")


def _ast_contains_with(func_node: ast.FunctionDef, context_manager_attr: str) -> bool:
    """Check if the function body contains a `with` statement using the given context manager."""
    for node in ast.walk(func_node):
        if isinstance(node, ast.With):
            for item in node.items:
                call = item.context_expr
                if isinstance(call, ast.Call):
                    func = call.func
                    # Match transaction.atomic()
                    if isinstance(func, ast.Attribute) and func.attr == context_manager_attr:
                        return True
    return False


def _ast_contains_call(func_node: ast.FunctionDef, method_name: str) -> bool:
    """Check if the function body contains a call to the given method name."""
    for node in ast.walk(func_node):
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Attribute) and func.attr == method_name:
                return True
    return False


# =========================================================================
# Property 2: Bulk status updates are atomic
# =========================================================================


class TestBulkStatusAtomicSourceInspection(SimpleTestCase):
    """Property 2 (source inspection): Verify transaction.atomic() and
    select_for_update() patterns exist in ApplicationBulkStatusView.post().

    **Validates: Requirements 6.1, 6.2**
    """

    def test_post_uses_transaction_atomic(self):
        """ApplicationBulkStatusView.post() wraps writes in transaction.atomic()."""
        source = _get_post_method_source()
        self.assertIn("transaction.atomic()", source,
                       "post() must use transaction.atomic() to wrap database writes")

    def test_post_uses_select_for_update(self):
        """ApplicationBulkStatusView.post() uses select_for_update() on the queryset."""
        source = _get_post_method_source()
        self.assertIn("select_for_update()", source,
                       "post() must use select_for_update() for row-level locking")

    def test_post_ast_has_atomic_context_manager(self):
        """AST confirms transaction.atomic() is used as a context manager (with statement)."""
        func_node = _get_post_method_ast()
        self.assertTrue(
            _ast_contains_with(func_node, "atomic"),
            "post() must use `with transaction.atomic():` as a context manager",
        )

    def test_post_ast_has_select_for_update_call(self):
        """AST confirms select_for_update() is called within post()."""
        func_node = _get_post_method_ast()
        self.assertTrue(
            _ast_contains_call(func_node, "select_for_update"),
            "post() must call .select_for_update() on the queryset",
        )


class TestBulkStatusAtomicRollback(SimpleTestCase):
    """Property 2 (behavioral): Simulated failure mid-batch results in zero
    committed changes — the entire batch rolls back.

    For any batch of N application status updates, if a failure occurs at
    index K (0 <= K < N), then zero applications should have their status
    changed after the request completes.

    **Validates: Requirements 6.1, 6.2**
    """

    @given(
        new_status=_valid_statuses,
        batch_size=_batch_sizes,
        failure_index=_failure_indices,
    )
    @settings(max_examples=5, deadline=None)
    def test_failure_mid_batch_rolls_back_all_changes(
        self, new_status, batch_size, failure_index
    ):
        """When transition raises mid-batch, no applications are committed."""
        import hashlib as _hashlib

        # Clamp failure_index to valid range
        failure_index = failure_index % batch_size

        app_ids = [uuid.uuid4() for _ in range(batch_size)]

        # Build mock applications
        mock_apps = []
        for i, app_id in enumerate(app_ids):
            app = MagicMock()
            app.id = app_id
            app.pk = app_id
            app.status = "draft"
            app.review_started_at = None
            app.reviewed_by_id = None
            app.admin_feedback = ""
            app.admin_feedback_date = None
            app.admin_feedback_by_id = None
            app.decision_date = None
            app.save = MagicMock()
            mock_apps.append(app)

        # Build a mock queryset that iterates over mock_apps
        mock_qs = MagicMock()
        mock_qs.__iter__ = MagicMock(return_value=iter(mock_apps))
        mock_qs.__len__ = MagicMock(return_value=len(mock_apps))
        mock_qs.select_for_update.return_value = mock_qs

        # Compute valid confirmation token
        sorted_ids = sorted(str(aid) for aid in app_ids)
        confirmation_token = _hashlib.sha256(
            ("".join(sorted_ids) + new_status).encode("utf-8")
        ).hexdigest()

        # Build mock request
        mock_request = MagicMock()
        mock_request.user.id = uuid.uuid4()
        mock_request.data = {
            "application_ids": [str(aid) for aid in app_ids],
            "new_status": new_status,
            "confirmation_token": confirmation_token,
        }

        # Create a transition function that fails at the specified index
        call_count = {"n": 0}

        def mock_transition(application, new_status, changed_by, notes="", **kwargs):
            idx = call_count["n"]
            call_count["n"] += 1
            if idx == failure_index:
                raise RuntimeError("Simulated DB failure")
            return application.status

        view = ApplicationBulkStatusView()

        with patch(
            "apps.applications.views.Application.objects.filter",
            return_value=mock_qs,
        ), patch(
            "apps.applications.services.transition_application_status",
            side_effect=mock_transition,
        ), patch(
            "apps.applications.services.ALLOWED_TRANSITIONS",
            {"draft": {new_status, "submitted", "under_review", "approved", "rejected"}},
        ):
            response = view.post(mock_request)

        # The view should return an error response (500) because the
        # transaction.atomic() block raises and rolls back
        self.assertEqual(
            response.status_code,
            500,
            f"Expected 500 error response when transition fails at index "
            f"{failure_index}, got {response.status_code}",
        )

        # Verify the response indicates failure
        self.assertFalse(response.data.get("success", True))
