"""Property-based tests for documents views error handling.

# Feature: tech-debt-remediation, Property 3: No str(e) in API error responses

Uses AST/source inspection to verify `documents/views.py` does not contain
`str(e)` in any Response construction.
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import ast  # noqa: E402
import re  # noqa: E402
from pathlib import Path  # noqa: E402

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

DOCUMENTS_VIEWS_PATH = (
    Path(__file__).resolve().parents[2] / "apps" / "documents" / "views.py"
)


def _read_source() -> str:
    """Read the raw source of documents/views.py."""
    return DOCUMENTS_VIEWS_PATH.read_text(encoding="utf-8")


def _parse_module() -> ast.Module:
    """Parse documents/views.py into an AST module node."""
    return ast.parse(_read_source(), filename=str(DOCUMENTS_VIEWS_PATH))


def _collect_response_calls(tree: ast.Module) -> list[ast.Call]:
    """Return every `Response(...)` call node in the module."""
    calls: list[ast.Call] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name) and func.id == "Response":
                calls.append(node)
    return calls


def _call_contains_str_e(call_node: ast.Call) -> bool:
    """Check whether a Response(...) call contains `str(e)` anywhere in its arguments.

    Looks for the pattern: Call(func=Name(id='str'), args=[Name(id='e')])
    nested at any depth within the call's arguments and keywords.
    """
    for node in ast.walk(call_node):
        if isinstance(node, ast.Call):
            func = node.func
            if (
                isinstance(func, ast.Name)
                and func.id == "str"
                and len(node.args) == 1
                and isinstance(node.args[0], ast.Name)
                and node.args[0].id == "e"
            ):
                return True
    return False


def _collect_except_handlers(tree: ast.Module) -> list[ast.ExceptHandler]:
    """Return every except handler in the module."""
    handlers: list[ast.ExceptHandler] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ExceptHandler):
            handlers.append(node)
    return handlers


def _handler_returns_str_e(handler: ast.ExceptHandler) -> bool:
    """Check whether an except handler body contains a Response with str(e)."""
    for node in ast.walk(handler):
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name) and func.id == "Response":
                if _call_contains_str_e(node):
                    return True
    return False


# =========================================================================
# Property 3: No str(e) in API error responses
# =========================================================================


class TestNoStrEInDocumentsResponses(SimpleTestCase):
    """Property 3: No str(e) in API error responses.

    For any exception in Documents_Views, the response SHALL NOT contain
    str(e). Generic messages only.

    **Validates: Requirements 11.1, 11.2**
    """

    def test_documents_views_file_exists(self):
        """documents/views.py must exist."""
        self.assertTrue(
            DOCUMENTS_VIEWS_PATH.exists(),
            f"Expected documents/views.py at {DOCUMENTS_VIEWS_PATH}",
        )

    def test_no_str_e_in_any_response_call(self):
        """No Response(...) call in documents/views.py should contain str(e)."""
        tree = _parse_module()
        response_calls = _collect_response_calls(tree)

        # Sanity: there should be Response calls in the file
        self.assertGreater(
            len(response_calls),
            0,
            "Expected at least one Response() call in documents/views.py",
        )

        offending_lines = [
            call.lineno
            for call in response_calls
            if _call_contains_str_e(call)
        ]

        self.assertEqual(
            offending_lines,
            [],
            f"Found str(e) in Response() at line(s) {offending_lines} "
            f"in documents/views.py",
        )

    def test_no_str_e_in_except_handler_responses(self):
        """No except handler should return a Response containing str(e)."""
        tree = _parse_module()
        handlers = _collect_except_handlers(tree)

        offending_lines = [
            handler.lineno
            for handler in handlers
            if _handler_returns_str_e(handler)
        ]

        self.assertEqual(
            offending_lines,
            [],
            f"Found Response(str(e)) in except handler(s) at line(s) "
            f"{offending_lines} in documents/views.py",
        )

    def test_source_does_not_contain_str_e_pattern(self):
        """Raw source should not contain 'str(e)' near Response construction."""
        source = _read_source()
        # Check that str(e) does not appear in the source at all
        matches = [
            (i + 1, line.strip())
            for i, line in enumerate(source.splitlines())
            if re.search(r'\bstr\(e\)', line)
        ]

        self.assertEqual(
            matches,
            [],
            f"Found str(e) in source at: {matches}",
        )

    @given(call_index=st.integers(min_value=0, max_value=100))
    @settings(max_examples=5, deadline=None)
    def test_every_response_call_free_of_str_e(self, call_index):
        """For any valid Response call index, the call does not contain str(e).

        Uses hypothesis to parameterize over Response call indices, ensuring
        the property holds regardless of which call is inspected.
        """
        tree = _parse_module()
        response_calls = _collect_response_calls(tree)

        if not response_calls:
            return  # No calls to check — vacuously true

        idx = call_index % len(response_calls)
        call = response_calls[idx]

        self.assertFalse(
            _call_contains_str_e(call),
            f"Response() at line {call.lineno} contains str(e)",
        )
