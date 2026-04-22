"""Property-based tests for SimpleTestCase DB isolation.

# Feature: production-readiness-hardening, Property 1: SimpleTestCase DB Isolation

Uses AST inspection to verify that all SimpleTestCase-based property tests
mock outbox and communication service DB paths, ensuring no Django ORM
operations are attempted during test execution.

**Validates: Requirements 1.2, 1.3, 1.4**
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
# Constants
# ---------------------------------------------------------------------------

PROPERTY_TESTS_DIR = Path(__file__).resolve().parent

# DB-hitting paths that must be mocked in SimpleTestCase-based tests.
# These are the outbox and communication service functions that trigger
# Django ORM operations (objects.create, objects.filter, etc.).
DB_PATHS = {
    # outbox.py DB paths
    "_record_outbox_event",
    "create_notification",
    "queue_email",
    # CommunicationService DB paths
    "CommunicationService.send",
    "CommunicationService.render_template",
}

# Modules whose direct calls indicate DB access
DB_MODULE_PREFIXES = (
    "apps.common.outbox",
    "apps.common.communication_service",
)

# ---------------------------------------------------------------------------
# AST Helpers
# ---------------------------------------------------------------------------


def _parse_file(path: Path) -> ast.Module | None:
    """Parse a Python file into an AST, returning None on failure."""
    try:
        source = path.read_text(encoding="utf-8")
        return ast.parse(source, filename=str(path))
    except (SyntaxError, UnicodeDecodeError):
        return None


def _get_property_test_files() -> list[Path]:
    """Return all .py test files in the property tests directory."""
    return sorted(
        p
        for p in PROPERTY_TESTS_DIR.glob("test_*.py")
        if p.name != "test_production_readiness_test_isolation.py"
    )


def _find_simple_test_case_classes(tree: ast.Module) -> list[ast.ClassDef]:
    """Find all class definitions that extend SimpleTestCase."""
    classes = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            for base in node.bases:
                base_name = _get_name(base)
                if base_name == "SimpleTestCase":
                    classes.append(node)
                    break
    return classes


def _get_name(node: ast.expr) -> str:
    """Extract a dotted name from an AST node."""
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        parent = _get_name(node.value)
        if parent:
            return f"{parent}.{node.attr}"
        return node.attr
    return ""


def _collect_direct_db_calls(class_node: ast.ClassDef) -> list[tuple[int, str]]:
    """Find direct calls to outbox/communication DB paths within a class.

    Returns list of (line_number, call_description) for unmocked DB calls.
    Only flags calls that appear in actual test method bodies (not inside
    mock.patch context managers or as patch target strings).
    """
    violations = []

    for method_node in ast.walk(class_node):
        if not isinstance(method_node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue

        # Collect all patch target strings in this method to know what's mocked
        mocked_targets = _collect_patch_targets(method_node)

        # Walk the method body looking for direct calls to DB paths
        for node in ast.walk(method_node):
            if isinstance(node, ast.Call):
                call_name = _get_name(node.func)
                if _is_unmocked_db_call(call_name, mocked_targets):
                    violations.append((node.lineno, call_name))

    return violations


def _collect_patch_targets(node: ast.AST) -> set[str]:
    """Collect all mock.patch target strings within an AST node.

    Looks for patterns like:
    - @patch("apps.common.outbox.create_notification")
    - patch("apps.common.outbox.create_notification")
    - @unittest.mock.patch(...)
    - mock.patch(...)
    """
    targets = set()

    for child in ast.walk(node):
        if isinstance(child, ast.Call):
            func_name = _get_name(child.func)
            # Match patch(), mock.patch(), unittest.mock.patch()
            if func_name.endswith("patch") or func_name.endswith("patch.object"):
                if child.args and isinstance(child.args[0], ast.Constant):
                    targets.add(child.args[0].value)

        # Also check decorator_list for @patch decorators
        if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            for decorator in child.decorator_list:
                targets.update(_extract_patch_targets_from_decorator(decorator))

    return targets


def _extract_patch_targets_from_decorator(node: ast.expr) -> set[str]:
    """Extract patch target strings from a decorator node."""
    targets = set()
    if isinstance(node, ast.Call):
        func_name = _get_name(node.func)
        if func_name.endswith("patch") or func_name.endswith("patch.object"):
            if node.args and isinstance(node.args[0], ast.Constant):
                targets.add(node.args[0].value)
    return targets


def _is_unmocked_db_call(call_name: str, mocked_targets: set[str]) -> bool:
    """Check if a call name represents an unmocked DB path.

    A call is considered a DB path if it matches one of the known DB function
    names AND is not covered by a mock.patch target in the same scope.
    """
    if not call_name:
        return False

    # Check if the call directly references a known DB function
    call_leaf = call_name.rsplit(".", 1)[-1] if "." in call_name else call_name

    # Only flag if the leaf name matches a known DB path function
    simple_db_funcs = {
        "_record_outbox_event",
        "create_notification",
        "queue_email",
    }

    is_comm_service_call = (
        "CommunicationService" in call_name
        and call_leaf in ("send", "render_template")
    )

    is_outbox_call = call_leaf in simple_db_funcs

    if not (is_outbox_call or is_comm_service_call):
        return False

    # Check if any mock target covers this call
    for target in mocked_targets:
        if call_leaf in target:
            return False
        if is_comm_service_call and "CommunicationService" in target:
            return False

    return True


def _scan_class_for_db_imports(class_node: ast.ClassDef, tree: ast.Module) -> list[str]:
    """Check if a SimpleTestCase class's file imports outbox/communication
    modules and uses them without mocking in test methods."""
    # This is handled by _collect_direct_db_calls
    return []


# ---------------------------------------------------------------------------
# Scan all property test files
# ---------------------------------------------------------------------------


def _scan_all_files() -> list[dict]:
    """Scan all property test files and return violation info.

    Returns a list of dicts with keys:
    - file: str (filename)
    - class_name: str
    - violations: list of (line, call_name)
    """
    results = []
    for path in _get_property_test_files():
        tree = _parse_file(path)
        if tree is None:
            continue

        stc_classes = _find_simple_test_case_classes(tree)
        for cls in stc_classes:
            violations = _collect_direct_db_calls(cls)
            if violations:
                results.append({
                    "file": path.name,
                    "class_name": cls.name,
                    "violations": violations,
                })
    return results


def _get_all_simple_test_case_info() -> list[dict]:
    """Get info about all SimpleTestCase classes across property test files.

    Returns a list of dicts with keys:
    - file: str (filename)
    - class_name: str
    - has_outbox_import: bool (file imports from outbox module)
    - has_comm_import: bool (file imports from communication_service)
    - mock_targets: set of patch target strings found in the class
    """
    results = []
    for path in _get_property_test_files():
        tree = _parse_file(path)
        if tree is None:
            continue

        # Check file-level imports
        has_outbox_import = False
        has_comm_import = False
        for node in ast.walk(tree):
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                import_str = ""
                if isinstance(node, ast.ImportFrom) and node.module:
                    import_str = node.module
                if "outbox" in import_str:
                    has_outbox_import = True
                if "communication_service" in import_str:
                    has_comm_import = True

        stc_classes = _find_simple_test_case_classes(tree)
        for cls in stc_classes:
            # Collect all mock targets in the class (decorators + body)
            mock_targets = _collect_patch_targets(cls)
            results.append({
                "file": path.name,
                "class_name": cls.name,
                "has_outbox_import": has_outbox_import,
                "has_comm_import": has_comm_import,
                "mock_targets": mock_targets,
            })
    return results


# =========================================================================
# Property 1: SimpleTestCase DB Isolation
# =========================================================================


class TestSimpleTestCaseDBIsolation(SimpleTestCase):
    """Property 1: SimpleTestCase DB Isolation.

    For any property test class that extends SimpleTestCase, all calls to
    outbox.create_notification, outbox.queue_email, outbox._record_outbox_event,
    and CommunicationService.send SHALL be mocked, ensuring no Django ORM
    operations are attempted during test execution.

    # Feature: production-readiness-hardening, Property 1: SimpleTestCase DB Isolation
    **Validates: Requirements 1.2, 1.3, 1.4**
    """

    def test_property_test_files_exist(self):
        """There should be property test files to scan."""
        files = _get_property_test_files()
        self.assertGreater(
            len(files), 0,
            "Expected property test files in backend/tests/property/",
        )

    def test_simple_test_case_classes_exist(self):
        """There should be SimpleTestCase-based classes in property tests."""
        info = _get_all_simple_test_case_info()
        self.assertGreater(
            len(info), 0,
            "Expected at least one SimpleTestCase class in property tests",
        )

    def test_no_unmocked_db_calls_in_simple_test_cases(self):
        """No SimpleTestCase class should have unmocked outbox/comm DB calls."""
        violations = _scan_all_files()
        if violations:
            msg_parts = []
            for v in violations:
                calls = ", ".join(
                    f"line {line}: {name}" for line, name in v["violations"]
                )
                msg_parts.append(
                    f"  {v['file']}::{v['class_name']}: {calls}"
                )
            self.fail(
                "SimpleTestCase classes with unmocked DB calls:\n"
                + "\n".join(msg_parts)
            )

    def test_outbox_imports_have_corresponding_mocks(self):
        """Files that import outbox and have SimpleTestCase classes should
        mock outbox DB paths if they call them."""
        info = _get_all_simple_test_case_info()
        for entry in info:
            if entry["has_outbox_import"]:
                # If the file imports outbox, check that any outbox usage
                # in the class is covered by mocks
                path = PROPERTY_TESTS_DIR / entry["file"]
                tree = _parse_file(path)
                if tree is None:
                    continue
                for cls in _find_simple_test_case_classes(tree):
                    if cls.name == entry["class_name"]:
                        violations = _collect_direct_db_calls(cls)
                        outbox_violations = [
                            (line, name) for line, name in violations
                            if name.split(".")[-1] in {
                                "_record_outbox_event",
                                "create_notification",
                                "queue_email",
                            }
                        ]
                        self.assertEqual(
                            outbox_violations, [],
                            f"{entry['file']}::{entry['class_name']} imports "
                            f"outbox but has unmocked calls: {outbox_violations}",
                        )

    def test_comm_service_imports_have_corresponding_mocks(self):
        """Files that import communication_service and have SimpleTestCase
        classes should mock CommunicationService DB paths if they call them."""
        info = _get_all_simple_test_case_info()
        for entry in info:
            if entry["has_comm_import"]:
                path = PROPERTY_TESTS_DIR / entry["file"]
                tree = _parse_file(path)
                if tree is None:
                    continue
                for cls in _find_simple_test_case_classes(tree):
                    if cls.name == entry["class_name"]:
                        violations = _collect_direct_db_calls(cls)
                        comm_violations = [
                            (line, name) for line, name in violations
                            if "CommunicationService" in name
                        ]
                        self.assertEqual(
                            comm_violations, [],
                            f"{entry['file']}::{entry['class_name']} imports "
                            f"communication_service but has unmocked calls: "
                            f"{comm_violations}",
                        )

    @given(file_index=st.integers(min_value=0, max_value=500))
    @settings(max_examples=20, deadline=None)
    def test_any_simple_test_case_class_has_no_unmocked_db_calls(self, file_index):
        """For any SimpleTestCase class selected by index, all outbox and
        CommunicationService DB paths are mocked.

        # Feature: production-readiness-hardening, Property 1: SimpleTestCase DB Isolation
        **Validates: Requirements 1.2, 1.3, 1.4**
        """
        all_info = _get_all_simple_test_case_info()
        if not all_info:
            return  # Vacuously true if no classes

        idx = file_index % len(all_info)
        entry = all_info[idx]

        path = PROPERTY_TESTS_DIR / entry["file"]
        tree = _parse_file(path)
        if tree is None:
            return

        for cls in _find_simple_test_case_classes(tree):
            if cls.name == entry["class_name"]:
                violations = _collect_direct_db_calls(cls)
                self.assertEqual(
                    violations, [],
                    f"{entry['file']}::{entry['class_name']} has unmocked "
                    f"DB calls: {violations}",
                )
