"""Property-based tests for accounts views error handling.

# Feature: tech-debt-remediation, Property 7: No bare except:pass in accounts views

Uses AST inspection to verify every `except Exception` block in
accounts/views.py contains a `logger` call, not bare `pass`.
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import ast  # noqa: E402
from pathlib import Path  # noqa: E402

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ACCOUNTS_VIEWS_PATH = (
    Path(__file__).resolve().parents[2] / "apps" / "accounts" / "views.py"
)


def _read_source() -> str:
    """Read the raw source of accounts/views.py."""
    return ACCOUNTS_VIEWS_PATH.read_text(encoding="utf-8")


def _parse_module() -> ast.Module:
    """Parse accounts/views.py into an AST module node."""
    return ast.parse(_read_source(), filename=str(ACCOUNTS_VIEWS_PATH))


def _collect_except_handlers(tree: ast.Module) -> list[ast.ExceptHandler]:
    """Return every `except Exception` handler in the module."""
    handlers: list[ast.ExceptHandler] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ExceptHandler):
            # Match bare `except:` and `except Exception:`
            if node.type is None:
                handlers.append(node)
            elif isinstance(node.type, ast.Name) and node.type.id == "Exception":
                handlers.append(node)
    return handlers


def _handler_contains_logger_call(handler: ast.ExceptHandler) -> bool:
    """Check whether the handler body contains a call to `logger.*`."""
    for node in ast.walk(handler):
        if isinstance(node, ast.Call):
            func = node.func
            # logger.warning(...), logger.exception(...), logger.error(...), etc.
            if (
                isinstance(func, ast.Attribute)
                and isinstance(func.value, ast.Name)
                and func.value.id == "logger"
            ):
                return True
    return False


def _handler_is_bare_pass(handler: ast.ExceptHandler) -> bool:
    """Check whether the handler body is just `pass` (bare except-pass)."""
    if len(handler.body) == 1 and isinstance(handler.body[0], ast.Pass):
        return True
    return False


# =========================================================================
# Property 7: No bare except:pass in accounts views
# =========================================================================


class TestNoBarExceptPassInAccountsViews(SimpleTestCase):
    """Property 7: No bare except:pass in accounts views.

    Every `except Exception` block in accounts/views.py SHALL contain a
    `logger` call. No bare `pass` is allowed.

    **Validates: Requirements 10.1, 10.2, 10.3**
    """

    def test_accounts_views_file_exists(self):
        """accounts/views.py must exist."""
        self.assertTrue(
            ACCOUNTS_VIEWS_PATH.exists(),
            f"Expected accounts/views.py at {ACCOUNTS_VIEWS_PATH}",
        )

    def test_no_bare_except_pass_blocks(self):
        """No except handler in accounts/views.py should be a bare `pass`."""
        tree = _parse_module()
        handlers = _collect_except_handlers(tree)

        bare_pass_lines = [
            handler.lineno
            for handler in handlers
            if _handler_is_bare_pass(handler)
        ]

        self.assertEqual(
            bare_pass_lines,
            [],
            f"Found bare except:pass at line(s) {bare_pass_lines} in accounts/views.py",
        )

    def test_all_except_handlers_contain_logger_call(self):
        """Every except Exception handler must contain a logger.* call."""
        tree = _parse_module()
        handlers = _collect_except_handlers(tree)

        # There should be at least one except handler (sanity check)
        self.assertGreater(
            len(handlers),
            0,
            "Expected at least one except handler in accounts/views.py",
        )

        missing_logger_lines = [
            handler.lineno
            for handler in handlers
            if not _handler_contains_logger_call(handler)
        ]

        self.assertEqual(
            missing_logger_lines,
            [],
            f"except Exception handler(s) at line(s) {missing_logger_lines} "
            f"in accounts/views.py do not contain a logger call",
        )

    @given(handler_index=st.integers(min_value=0, max_value=100))
    @settings(max_examples=5, deadline=None)
    def test_every_handler_index_has_logger_call(self, handler_index):
        """For any valid handler index, the handler contains a logger call
        and is not a bare pass.

        Uses hypothesis to parameterize over handler indices, ensuring the
        property holds regardless of which handler is inspected.
        """
        tree = _parse_module()
        handlers = _collect_except_handlers(tree)

        if not handlers:
            return  # No handlers to check — vacuously true

        # Clamp index to valid range
        idx = handler_index % len(handlers)
        handler = handlers[idx]

        self.assertFalse(
            _handler_is_bare_pass(handler),
            f"Handler at line {handler.lineno} is a bare except:pass",
        )
        self.assertTrue(
            _handler_contains_logger_call(handler),
            f"Handler at line {handler.lineno} does not contain a logger call",
        )
