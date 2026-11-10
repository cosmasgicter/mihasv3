#!/usr/bin/env python3
"""Self-test for scripts/check_backend_image.py and scripts/check_requirements_lock.py
(platform-simplification tasks 5.2, 5.3). Standard library only."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

import check_backend_image as image  # noqa: E402
import check_requirements_lock as lock  # noqa: E402

IN_TEXT = """
# comment
Django>=5.0,<6.0   # trailing
uvicorn[standard]>=0.29,<1.0
PyJWT>=2.8,<3.0
-r other.in
-c constraints.txt
pywin32>=1; sys_platform == "win32"
openai>=1.40.0"""


class ParseNames(unittest.TestCase):
    def test_extras_specifiers_markers_comments_and_options_are_removed(self):
        self.assertEqual(
            image.parse_requirement_names(IN_TEXT),
            ["Django", "uvicorn", "PyJWT", "pywin32", "openai"],
        )


class ImageProblems(unittest.TestCase):
    def test_missing_package_is_named(self):
        problems = image.find_problems("definitely-not-installed-pkg-xyz>=1")
        self.assertTrue(any("definitely-not-installed-pkg-xyz" in p for p in problems))

    def test_importable_test_module_is_named(self):
        # unittest-only stdlib run: pytest is importable here, so it must be reported.
        import importlib.util

        if importlib.util.find_spec("pytest") is None:
            self.skipTest("pytest not installed in this interpreter")
        self.assertTrue(any("pytest" in p for p in image.find_problems("")))


class LockVersions(unittest.TestCase):
    RUNTIME = "django==5.2.1 \\\n    --hash=sha256:aa\nrequests==2.32.3 \\\n    --hash=sha256:bb\n"

    def test_agreeing_pins_pass(self):
        dev = "django==5.2.1 \\\n    --hash=sha256:aa\npytest==8.4.2 \\\n    --hash=sha256:cc\n"
        self.assertEqual(lock.version_conflicts(self.RUNTIME, dev), [])

    def test_two_versions_name_the_package(self):
        dev = "Django==5.2.2 \\\n    --hash=sha256:aa\n"
        conflicts = lock.version_conflicts(self.RUNTIME, dev)
        self.assertEqual(len(conflicts), 1)
        self.assertIn("django", conflicts[0])

    def test_name_normalisation(self):
        self.assertEqual(lock.pins("Foo_Bar==1.0 \\\n"), {"foo-bar": "1.0"})


if __name__ == "__main__":
    unittest.main()
