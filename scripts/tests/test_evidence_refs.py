"""scripts/evidence_refs.py finds references to untracked raw evidence (task 11.3, R4.3).

    python3 scripts/tests/test_evidence_refs.py
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import evidence_refs as er  # noqa: E402

RAW = {
    "docs/v2-evidence/12.3/raw/a.txt",
    "docs/v2-evidence/12.3/raw/b.txt",
    "docs/v2-evidence/5.1/shot.png",
}


class EvidenceRefsTest(unittest.TestCase):
    def test_raw_types_are_classified(self) -> None:
        for name in ("a.zip", "a.png", "a.txt", "a.log", "a.jsonl", "a.err", "a.exit", "a.xml",
                     "a.html", "a.js", "a.css", "a.ttf", "a.svg", "a.webmanifest", "a.before", "a.after"):
            self.assertTrue(er.is_raw(f"docs/v2-evidence/1.1/{name}"), name)
        for name in ("README.md", "a.json", "a.yaml", "a.csv", "a.py", "a.sh", "a.ts"):
            self.assertFalse(er.is_raw(f"docs/v2-evidence/1.1/{name}"), name)
        self.assertFalse(er.is_raw("docs/other/a.txt"))

    def test_backticked_path_and_link_are_found(self) -> None:
        text = "see `docs/v2-evidence/12.3/raw/a.txt` and [shot](../5.1/shot.png)"
        refs = er.references("docs/v2-evidence/12.3/README.md", text, RAW)
        self.assertEqual(len(refs), 2)

    def test_path_relative_to_the_file_is_found(self) -> None:
        refs = er.references("docs/v2-evidence/12.3/README.md", "`raw/a.txt`", RAW)
        self.assertEqual(refs, ["raw/a.txt"])

    def test_glob_reference_is_found(self) -> None:
        refs = er.references("docs/runbooks/x.md", "`docs/v2-evidence/12.3/raw/*.txt`", RAW)
        self.assertEqual(refs, ["docs/v2-evidence/12.3/raw/*.txt"])

    def test_tracked_files_and_urls_are_not_references(self) -> None:
        text = "`docs/v2-evidence/12.3/README.md` [x](https://example.com/raw/a.txt) `scripts/a.txt`"
        self.assertEqual(er.references("docs/runbooks/x.md", text, RAW), [])

    def test_note_is_idempotent(self) -> None:
        line = er.note_line("2026-11-09", "abc", "https://example.invalid/tree/abc/docs/v2-evidence")
        self.assertIn(er.NOTE_MARKER, line)
        self.assertIn("2026-11-09", line)


if __name__ == "__main__":
    unittest.main()
