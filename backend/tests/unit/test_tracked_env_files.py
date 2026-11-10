"""Guardrails for tracked environment files in git."""

from pathlib import Path
import subprocess

from django.test import SimpleTestCase


class TrackedEnvFilesTests(SimpleTestCase):
    def test_only_example_env_files_are_tracked(self):
        repo_root = Path(__file__).resolve().parents[3]
        result = subprocess.run(
            ["git", "ls-files"],
            cwd=repo_root,
            capture_output=True,
            text=True,
            check=True,
        )

        tracked_env_files = sorted(
            path
            for path in result.stdout.splitlines()
            if Path(path).name.startswith(".env") and (repo_root / path).exists()
        )
        allowed = sorted([
            ".env.example",
            ".env.scripts.example",
            "apps/admissions/.env.example",
            "backend/.env.example",
            "deploy/.env.prod.example",
        ])

        self.assertEqual(tracked_env_files, allowed)
