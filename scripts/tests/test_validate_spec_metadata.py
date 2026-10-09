#!/usr/bin/env python3
"""
Tests for scripts/validate_spec_metadata.py (Admissions V2 task 0.1).

Runs with either `python3 -m pytest scripts/tests/test_validate_spec_metadata.py`
or plain `python3 scripts/tests/test_validate_spec_metadata.py` (falls back to
unittest). Standard library only; no Django and no third-party deps.

Covers:
- intentional failing fixture: duplicate live spec IDs -> error + exit 2;
- unique live spec IDs -> clean pass;
- invalid `.config.kiro` JSON -> error;
- archived (underscore-prefixed) specs are ignored;
- missing config / missing id -> warning, not error;
- real-repo regression guard: the actual `.kiro/specs/` has no duplicate ids
  (this is the GOV-03 closure assertion).
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

# Make the sibling module importable regardless of the working directory.
_SCRIPTS_DIR = Path(__file__).resolve().parent.parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

import validate_spec_metadata as vsm  # noqa: E402


def _make_spec(root: Path, name: str, config_text: str | None) -> None:
    spec_dir = root / name
    spec_dir.mkdir(parents=True, exist_ok=True)
    if config_text is not None:
        (spec_dir / ".config.kiro").write_text(config_text, encoding="utf-8")


def _cfg(spec_id: str) -> str:
    return json.dumps({"specId": spec_id, "workflowType": "requirements-first", "specType": "feature"})


class DuplicateDetectionTests(unittest.TestCase):
    def test_duplicate_live_ids_are_an_error(self):
        """Intentional failing fixture: two live specs sharing one id."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _make_spec(root, "alpha", _cfg("dup-id-xyz"))
            _make_spec(root, "beta", _cfg("dup-id-xyz"))

            result = vsm.validate(root)

            self.assertFalse(result["ok"])
            self.assertEqual(result["error_count"], 2)
            self.assertIn("dup-id-xyz", result["duplicate_ids"])
            self.assertCountEqual(result["duplicate_ids"]["dup-id-xyz"], ["alpha", "beta"])
            self.assertEqual(vsm.main(["--specs-root", str(root)]), 2)

    def test_unique_live_ids_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _make_spec(root, "alpha", _cfg("id-a"))
            _make_spec(root, "beta", _cfg("id-b"))

            result = vsm.validate(root)

            self.assertTrue(result["ok"])
            self.assertEqual(result["error_count"], 0)
            self.assertEqual(result["duplicate_ids"], {})
            self.assertEqual(vsm.main(["--specs-root", str(root)]), 0)

    def test_archived_specs_are_ignored(self):
        """An underscore-prefixed holding area is history, not a live spec."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _make_spec(root, "alpha", _cfg("shared"))
            # Same id inside _archived must NOT trigger a duplicate.
            archived = root / "_archived"
            _make_spec(archived, "old-spec", _cfg("shared"))

            result = vsm.validate(root)

            self.assertTrue(result["ok"])
            self.assertEqual(result["live_spec_count"], 1)


class ConfigIntegrityTests(unittest.TestCase):
    def test_invalid_json_is_an_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _make_spec(root, "broken", "{not valid json,,,}")

            result = vsm.validate(root)

            self.assertFalse(result["ok"])
            self.assertEqual(result["error_count"], 1)
            self.assertTrue(any("not valid JSON" in f["message"] for f in result["findings"]))

    def test_missing_config_is_a_warning(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _make_spec(root, "no-config", None)

            result = vsm.validate(root)

            self.assertTrue(result["ok"])  # warnings do not block
            self.assertEqual(result["warning_count"], 1)
            self.assertEqual(vsm.main(["--specs-root", str(root)]), 0)
            # --strict escalates warnings to a non-zero (1) exit.
            self.assertEqual(vsm.main(["--specs-root", str(root), "--strict"]), 1)

    def test_missing_id_field_is_a_warning(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _make_spec(root, "schema-variant", json.dumps({"name": "x", "type": "design-plan"}))

            result = vsm.validate(root)

            self.assertTrue(result["ok"])
            self.assertEqual(result["warning_count"], 1)

    def test_alternate_id_key_is_accepted(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _make_spec(root, "alpha", json.dumps({"spec_id": "underscore-id"}))

            result = vsm.validate(root)

            self.assertTrue(result["ok"])
            self.assertEqual(result["warning_count"], 0)
            self.assertEqual(result["specs"][0]["spec_id"], "underscore-id")


class RealRepoRegressionTests(unittest.TestCase):
    def test_repo_specs_have_no_duplicate_ids(self):
        """GOV-03 closure guard: the live repo specs carry unique ids."""
        specs_root = _SCRIPTS_DIR.parent / ".kiro" / "specs"
        if not specs_root.is_dir():
            self.skipTest("repo .kiro/specs not present")

        result = vsm.validate(specs_root)

        self.assertEqual(
            result["duplicate_ids"],
            {},
            msg=f"Duplicate live spec ids present: {result['duplicate_ids']}",
        )
        self.assertEqual(
            result["error_count"],
            0,
            msg=f"Spec metadata errors present: {[f for f in result['findings'] if f['severity'] == 'error']}",
        )

    def test_admissions_v2_spec_is_registered_and_unique(self):
        specs_root = _SCRIPTS_DIR.parent / ".kiro" / "specs"
        if not specs_root.is_dir():
            self.skipTest("repo .kiro/specs not present")

        result = vsm.validate(specs_root)
        names = [s["name"] for s in result["specs"]]
        self.assertIn("admissions-v2-canonical-rebuild", names)


if __name__ == "__main__":
    unittest.main(verbosity=2)
