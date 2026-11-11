"""LOCAL-TESTING.md shows harness/bin/local-setup.sh verbatim (task 11.1, R1.1).

Standard library only; run from the repository root:
    python3 scripts/tests/test_local_setup_doc.py
"""
from __future__ import annotations

import re
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DOC = REPO_ROOT / "LOCAL-TESTING.md"
SCRIPT = REPO_ROOT / "harness" / "bin" / "local-setup.sh"
MARKER = "<!-- local-setup -->"


def documented_block() -> str:
    text = DOC.read_text(encoding="utf-8")
    assert text.count(MARKER) == 1, f"expected exactly one {MARKER} marker"
    after = text.split(MARKER, 1)[1]
    match = re.match(r"\s*```bash\n(.*?)\n```", after, re.DOTALL)
    assert match, "the marker must be followed by a ```bash fenced block"
    return match.group(1)


class LocalSetupDocTest(unittest.TestCase):
    def test_script_exists_and_is_executable(self) -> None:
        self.assertTrue(SCRIPT.is_file())
        self.assertTrue(SCRIPT.stat().st_mode & 0o111, "local-setup.sh must be executable")

    def test_documented_block_equals_script(self) -> None:
        self.assertEqual(documented_block(), SCRIPT.read_text(encoding="utf-8").rstrip("\n"))

    def test_document_names_the_one_command(self) -> None:
        self.assertIn("bash harness/bin/local-setup.sh", DOC.read_text(encoding="utf-8"))

    def test_document_states_each_concern_destination(self) -> None:
        text = DOC.read_text(encoding="utf-8")
        for concern in ("Storage", "Email", "Payment API", "Card widget", "Error reporting"):
            self.assertRegex(text, rf"\|\s*{re.escape(concern)}\s*\|")

    def test_document_presents_no_other_stack(self) -> None:
        text = DOC.read_text(encoding="utf-8")
        for name in ("docker-compose.local-test.yml", "docker-compose.local-real.yml", "mihas-localtest"):
            self.assertNotIn(name, text)


if __name__ == "__main__":
    unittest.main()
