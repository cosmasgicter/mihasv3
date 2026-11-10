"""local-setup.sh checks its prerequisites before starting anything (task 11.1, R1.10).

Each case runs the script with a PATH made only of stub executables that lacks one
tool, so the result does not depend on the tools of the machine running it.

    python3 scripts/tests/test_local_setup_prereqs.py
"""
from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "harness" / "bin" / "local-setup.sh"
BASH = "/bin/bash" if Path("/bin/bash").exists() else "/usr/bin/bash"
TOOLS = ("docker", "bun", "git", "curl", "python3")


def make_stubs(directory: Path, missing: str | None, bun_exit: int = 0) -> Path:
    log = directory / "calls.log"
    for tool in TOOLS:
        if tool == missing:
            continue
        stub = directory / tool
        code = bun_exit if tool == "bun" else 0
        stub.write_text(f'#!{BASH}\necho "{tool} $*" >> "{log}"\nexit {code}\n')
        stub.chmod(0o755)
    return log


def run(directory: Path) -> subprocess.CompletedProcess[str]:
    env = {"PATH": str(directory), "HOME": str(directory)}
    return subprocess.run(
        [BASH, str(SCRIPT)], cwd=REPO_ROOT, env=env, capture_output=True, text=True, timeout=60
    )


class LocalSetupPrereqTest(unittest.TestCase):
    def test_each_missing_tool_exits_3_naming_it_before_anything_starts(self) -> None:
        for tool in TOOLS:
            with self.subTest(missing=tool), tempfile.TemporaryDirectory() as tmp:
                d = Path(tmp)
                log = make_stubs(d, missing=tool)
                result = run(d)
                self.assertEqual(result.returncode, 3, result.stderr)
                self.assertIn(tool, result.stderr)
                calls = log.read_text() if log.exists() else ""
                self.assertNotIn("bun install", calls)
                self.assertNotIn("compose up", calls)

    def test_compose_v2_missing_exits_3(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            make_stubs(d, missing=None)
            (d / "docker").write_text(f'#!{BASH}\n[ "$1 $2" = "compose version" ] && exit 1\nexit 0\n')
            result = run(d)
            self.assertEqual(result.returncode, 3)
            self.assertIn("docker compose", result.stderr)

    def test_all_tools_present_reaches_the_install_step(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            log = make_stubs(d, missing=None, bun_exit=7)
            result = run(d)
            self.assertEqual(result.returncode, 7, result.stderr)
            self.assertIn("bun install --frozen-lockfile", log.read_text())


if __name__ == "__main__":
    unittest.main()
