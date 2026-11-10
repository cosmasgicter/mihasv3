#!/usr/bin/env python3
"""Self-test for scripts/skill_keep_list.py (platform-simplification task 8.2). Standard library only."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
import skill_keep_list as kl  # noqa: E402


class References(unittest.TestCase):
    def test_path_backtick_and_bold_count_but_a_bare_word_does_not(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "a.md").write_text("see .kiro/skills/alpha and `beta` and **gamma**; seo is a word\n")
            refs = kl.references(["alpha", "beta", "gamma", "seo", "alph"], ["a.md"], root)
            self.assertEqual(sorted(refs), ["alpha", "beta", "gamma"])

    def test_a_longer_name_does_not_match_its_prefix(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "a.md").write_text(".kiro/skills/playwright-best-practices\n")
            self.assertEqual(kl.references(["playwright"], ["a.md"], root), {})


class Layout(unittest.TestCase):
    def test_symlink_real_copy_and_dangling_are_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".kiro/skills/real").mkdir(parents=True)
            (root / ".agents/skills/target").mkdir(parents=True)
            (root / ".agents/skills/only").mkdir(parents=True)
            (root / ".kiro/skills/linked").symlink_to("../../.agents/skills/target")
            (root / ".kiro/skills/broken").symlink_to("../../.agents/skills/missing")
            skills = kl.skill_dirs(root)
            self.assertEqual(skills["real"]["real_copy"], ".kiro/skills/real")
            self.assertEqual(skills["linked"]["real_copy"], ".agents/skills/target")
            self.assertTrue(skills["broken"]["dangling"])
            self.assertEqual(skills["only"]["kind"], "agents-only")


class RealRepository(unittest.TestCase):
    def test_design_skills_and_the_two_dangling_links_are_found(self):
        data = kl.build()
        for name in ("impeccable", "ui-ux-pro-max", "design-for-ai", "a11y-audit"):
            self.assertIn(name, data["keep"])
        self.assertNotIn("playwright", data["keep"])
        self.assertEqual(data["always_keep_missing_from_tree"], [])


if __name__ == "__main__":
    unittest.main()
