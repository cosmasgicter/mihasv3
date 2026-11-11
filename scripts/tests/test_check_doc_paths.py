#!/usr/bin/env python3
"""Self-test for scripts/check_doc_paths.py (platform-simplification task 3.3).

Runs with `python3 scripts/tests/test_check_doc_paths.py` or pytest. Standard
library only. Fixtures cover each exclusion and resolution rule, a dangling
symlink, a missing `.agents/skills.json` path, and the allowlist's own rules.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

import check_doc_paths as cdp  # noqa: E402


def tree(*files: str, root: Path | None = None) -> cdp.Tree:
    return cdp.Tree(files, root or Path("/nonexistent"))


class CandidateRules(unittest.TestCase):
    def cands(self, text: str) -> list[str]:
        return cdp.extract_candidates(text)

    def test_backticked_paths_and_link_targets_are_candidates(self):
        self.assertEqual(self.cands("see `backend/apps/x.py` and [doc](docs/a.md)"), ["backend/apps/x.py", "docs/a.md"])

    def test_api_routes_urls_home_and_npm_scopes_are_skipped(self):
        for token in ("/api/v1/applications/", "https://x.test/a.md", "~/notes.md", "@/lib/api.ts", "@scope/pkg"):
            self.assertEqual(self.cands(f"`{token}`"), [], token)

    def test_wildcards_placeholders_ellipsis_and_whitespace_are_skipped(self):
        for token in ("apps/*/x.py", "apps/<app>/x.py", "apps/{a}/x.py", "a/…/b.py", "a/.../b.py", "bun run test.ts", "a?b/c.py"):
            self.assertEqual(self.cands(f"`{token}`"), [], token)

    def test_tailwind_opacity_utility_is_skipped(self):
        self.assertEqual(self.cands("`bg-primary/50`"), [])

    def test_a_token_needs_a_slash_or_a_known_extension(self):
        self.assertEqual(self.cands("`config.settings.dev` `word`"), [])
        self.assertEqual(self.cands("`package.json`"), ["package.json"])

    def test_extension_alone_is_not_a_file(self):
        self.assertEqual(self.cands("`.pem`"), [])

    def test_decorations_are_stripped(self):
        self.assertEqual(self.cands("`./scripts/a.py`"), ["scripts/a.py"])
        self.assertEqual(self.cands("`scripts/a.py:42`"), ["scripts/a.py"])
        self.assertEqual(self.cands("`scripts/a.ts:someSymbol`"), ["scripts/a.ts"])
        self.assertEqual(self.cands("`tests/t.py::test_x`"), ["tests/t.py"])
        self.assertEqual(self.cands("[x](docs/a.md#section)"), ["docs/a.md"])
        self.assertEqual(self.cands("`scripts/a.py`,"), ["scripts/a.py"])

    def test_directory_keeps_its_trailing_slash(self):
        self.assertEqual(self.cands("`src/`"), ["src/"])


class Resolution(unittest.TestCase):
    def test_file_and_directory_relative_to_each_root(self):
        t = tree("backend/apps/a.py", "apps/admissions/src/lib/x.ts", "apps/jobs-ops/src/y.ts", "README.md")
        self.assertTrue(t.resolves("backend/apps/a.py"))
        self.assertTrue(t.resolves("apps/a.py"))  # relative to backend/
        self.assertTrue(t.resolves("lib/x.ts"))  # relative to apps/admissions/src/
        self.assertTrue(t.resolves("src/lib/x.ts"))  # relative to apps/admissions/
        self.assertTrue(t.resolves("src/y.ts"))  # relative to apps/jobs-ops/
        self.assertTrue(t.resolves("apps/admissions/src/lib/"))  # a directory that holds a tracked file
        self.assertFalse(t.resolves("lib/missing.ts"))

    def test_bare_file_name_matches_any_tracked_file_with_that_name(self):
        t = tree("deep/inside/tokens.json")
        self.assertTrue(t.resolves("tokens.json"))
        self.assertFalse(t.resolves("other.json"))

    def test_untracked_path_does_not_resolve(self):
        self.assertFalse(tree("a.md").resolves("docs/guide.md"))


class DocCheck(unittest.TestCase):
    def run_check(self, docs: dict[str, str], tracked: list[str], allowlist=None):
        t = tree(*tracked)
        t.ignored = lambda candidate: candidate == "backend/.env"  # type: ignore[method-assign]
        return cdp.check_docs(t, docs.__getitem__, allowlist or [], list(docs), [])

    def test_missing_path_is_reported_with_file_and_path(self):
        findings, problems = self.run_check({"PRODUCT.md": "see `docs/gone.md`"}, ["PRODUCT.md"])
        self.assertEqual([(f.file, f.path) for f in findings], [("PRODUCT.md", "docs/gone.md")])
        self.assertEqual(problems, [])

    def test_existing_and_ignored_paths_pass(self):
        findings, _ = self.run_check({"PRODUCT.md": "`docs/a.md` `backend/.env`"}, ["PRODUCT.md", "docs/a.md"])
        self.assertEqual(findings, [])

    def test_allowlisted_absent_path_passes(self):
        entry = {"file": "PRODUCT.md", "path": "api/", "reason": "named so it is not assumed"}
        findings, problems = self.run_check({"PRODUCT.md": "do not assume `api/`"}, ["PRODUCT.md"], [entry])
        self.assertEqual((findings, problems), ([], []))

    def test_allowlist_entry_whose_path_now_exists_is_stale(self):
        entry = {"file": "PRODUCT.md", "path": "docs/a.md", "reason": "was absent"}
        _, problems = self.run_check({"PRODUCT.md": "`docs/a.md`"}, ["PRODUCT.md", "docs/a.md"], [entry])
        self.assertEqual(len(problems), 1)

    def test_allowlist_entry_the_file_no_longer_names_is_stale(self):
        entry = {"file": "PRODUCT.md", "path": "api/", "reason": "x"}
        _, problems = self.run_check({"PRODUCT.md": "nothing here"}, ["PRODUCT.md"], [entry])
        self.assertEqual(len(problems), 1)

    def test_allowlist_entry_needs_a_reason(self):
        _, problems = self.run_check({"PRODUCT.md": ""}, ["PRODUCT.md"], [{"file": "PRODUCT.md", "path": "a/", "reason": " "}])
        self.assertEqual(len(problems), 1)

    def test_skill_only_files_check_just_skill_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".kiro/skills/real").mkdir(parents=True)
            t = tree(root=root)
            texts = {".kiro/hooks/h.hook": "uses .kiro/skills/real and .kiro/skills/gone and docs/other.md"}
            findings, _ = cdp.check_docs(t, texts.__getitem__, [], [], list(texts))
            self.assertEqual([f.path for f in findings], [".kiro/skills/gone"])


class SkillLinks(unittest.TestCase):
    def test_dangling_symlink_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".kiro/skills").mkdir(parents=True)
            os.symlink(root / "missing-target", root / ".kiro/skills/broken")
            os.symlink(root, root / ".kiro/skills/fine")
            findings, problems = cdp.check_skill_links(
                root, [".kiro/skills/broken", ".kiro/skills/fine"], None, []
            )
            self.assertEqual([f.path for f in findings], [".kiro/skills/broken"])
            self.assertEqual(problems, [])

    def test_baselined_dangling_symlink_passes_and_a_fixed_one_is_stale(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".kiro/skills").mkdir(parents=True)
            os.symlink(root / "missing", root / ".kiro/skills/broken")
            os.symlink(root, root / ".kiro/skills/fine")
            baseline = [
                {"path": ".kiro/skills/broken", "reason": "D6"},
                {"path": ".kiro/skills/fine", "reason": "was dangling"},
            ]
            findings, problems = cdp.check_skill_links(
                root, [".kiro/skills/broken", ".kiro/skills/fine"], None, baseline
            )
            self.assertEqual(findings, [])
            self.assertEqual(len(problems), 1)
            self.assertIn(".kiro/skills/fine", problems[0])

    def test_skills_manifest_path_that_names_no_directory_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".agents").mkdir()
            (root / ".kiro/skills").mkdir(parents=True)
            manifest = {"entries": [{"path": "../.kiro/skills"}, {"path": ".kiro/skills"}, {"path": "nowhere/skills"}]}
            findings, _ = cdp.check_skill_links(root, [], manifest, [])
            self.assertEqual([f.path for f in findings], ["nowhere/skills"])

    def test_symlink_entries_come_from_git_mode_120000(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            (root / ".kiro/skills").mkdir(parents=True)
            (root / ".kiro/skills/plain.md").write_text("x")
            os.symlink(root / "gone", root / ".kiro/skills/broken")
            subprocess.run(["git", "add", "-A", "-f", "."], cwd=root, check=True)
            self.assertEqual(cdp.list_symlink_entries(root), [".kiro/skills/broken"])


class RealRepository(unittest.TestCase):
    def test_the_repository_passes_its_own_check(self):
        findings, problems = cdp.run()
        self.assertEqual([str(f) for f in findings] + problems, [])


if __name__ == "__main__":
    unittest.main()
