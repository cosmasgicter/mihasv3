"""SJR task 4 (design R9-a..e): the journey gate's configuration cannot drift quietly.

The gate is only worth having if the switches that make the harness look like
production stay switched, the workflow stays blocking, and the required checks keep
reporting on changes that do not need a journey. None of that shows when the gate is
green, so this reads the sources (and runs the workflow's own relevance script).

Clauses 2.43, 2.45, 2.46, 2.47 and 3.22 (the broad matrix keeps today's settings).
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest
import yaml

REPO = Path(__file__).resolve().parents[3]
WORKFLOW = REPO / ".github" / "workflows" / "student-journey-gate.yml"
COMPOSE = REPO / "harness" / "docker-compose.harness.yml"
HARNESS_SCRIPT = REPO / "harness" / "bin" / "harness"
HARNESS_SETTINGS = REPO / "backend" / "config" / "settings" / "harness.py"
EDGE_CHECK = REPO / "harness" / "checks" / "edge_two_clients.py"
MIDDLEWARE = REPO / "backend" / "apps" / "common" / "middleware.py"


def _workflow() -> dict:
    return yaml.safe_load(WORKFLOW.read_text())


def _triggers(workflow: dict) -> dict:
    # PyYAML reads the bare key `on` as the boolean True.
    return workflow.get("on") or workflow.get(True)


# --- R9-a: the harness switches ---------------------------------------------------


def test_harness_limiter_is_off_by_default_and_on_with_the_switch():
    source = HARNESS_SETTINGS.read_text()
    assert re.search(
        r'^RATELIMIT_ENABLE = os\.environ\.get\("HARNESS_RATELIMIT_ENABLE", "0"\)', source, re.MULTILINE
    ), "the harness limiter must be read from HARNESS_RATELIMIT_ENABLE with an off default (3.22)"
    assert "RATELIMIT_ENABLE = False" not in re.sub(r"``[^`]*``", "", source), "no hard-coded off"


def test_compose_passes_the_gate_switches_with_todays_defaults():
    compose = COMPOSE.read_text()
    assert "S3_SIGNED_URL_TTL_SECONDS: ${S3_SIGNED_URL_TTL_SECONDS:-900}" in compose
    assert "S3_PUBLIC_ENDPOINT_URL: ${S3_PUBLIC_ENDPOINT_URL:-}" in compose
    assert "HARNESS_RATELIMIT_ENABLE: ${HARNESS_RATELIMIT_ENABLE:-0}" in compose
    assert "HARNESS_BUCKET_ANONYMOUS:-download" in compose, "the broad matrix keeps its download policy"
    assert "mc anonymous set $${HARNESS_BUCKET_ANONYMOUS:-download} local/harness" in compose


def test_journey_gate_command_exports_the_four_values_and_runs_every_stage_in_order():
    script = HARNESS_SCRIPT.read_text()
    switches = re.search(r"export_gate_switches\(\) \{(.*?)\n\}", script, re.DOTALL)
    assert switches, "export_gate_switches is missing"
    body = switches.group(1)
    for line in (
        "export HARNESS_RATELIMIT_ENABLE=1",
        "export S3_SIGNED_URL_TTL_SECONDS=20",
        "export S3_PUBLIC_ENDPOINT_URL=http://localhost:59000",
        "export HARNESS_BUCKET_ANONYMOUS=none",
    ):
        assert line in body
    command = re.search(r"\n  journey-gate\)\n(.*?)\n    ;;", script, re.DOTALL)
    assert command, "the journey-gate command is missing"
    stages = [
        line.strip()
        for line in command.group(1).splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    # Platform-simplification task 11.1 (decision D2): the gate brings the stack up through
    # the documented setup script, once, in place of its own build_spa, compose_up and
    # wait_healthy. The four exported values reach it through the environment.
    assert stages[:6] == [
        "export_gate_switches",
        'bash "${HARNESS_DIR}/bin/local-setup.sh"',
        "ensure_browser",
        "storage_check",
        "edge_check",
        "run_journey_gate",
    ]
    for own_bring_up in ("build_spa", "compose_up", "wait_healthy"):
        assert own_bring_up not in stages, "the stack must be brought up once, by local-setup.sh"
    assert "drain_check" in stages


def test_the_other_commands_do_not_export_the_gate_switches():
    script = HARNESS_SCRIPT.read_text()
    smoke = re.search(r"\n  smoke\)\n(.*?)\n    ;;", script, re.DOTALL)
    assert smoke and "export_gate_switches" not in smoke.group(1)


def test_gate_evidence_never_goes_to_docs_v2_evidence():
    config = (REPO / "apps" / "admissions" / "playwright.journey-gate.config.ts").read_text()
    assert "delete process.env.V2_EVIDENCE_TASK_DIRS" in config
    assert "retries: 0" in config and "workers: 1" in config
    assert "trace: 'on'" in config
    assert "browserName: 'chromium'" in config, "the throttle needs CDP"
    assert "statusAwareDefaults: true" in config


# --- R9-c: the edge check mirrors the real budgets ---------------------------------


def test_edge_check_limits_match_the_middleware_table():
    middleware = MIDDLEWARE.read_text()
    table = middleware[middleware.index("SCOPE_LIMITS = ["): middleware.index("VIEW_MANAGED_PAYMENT_PREFIXES")]
    budgets = dict(re.findall(r'\("(/api/v1/auth/(?:login|register)/)", "(\d+)/5m"\)', table))
    edge = EDGE_CHECK.read_text()
    assert re.search(r'login/",\s*lambda:.*?\n\s*(\d+),', edge, re.DOTALL).group(1) == budgets["/api/v1/auth/login/"]
    assert re.search(r'register/", lambda: \{[^}]*\}, (\d+)\)', edge).group(1) == budgets["/api/v1/auth/register/"]
    assert "urllib.request" in edge and "import requests" not in edge, "the adapters image is stdlib only"


# --- R9-e: the workflow ------------------------------------------------------------


def test_workflow_triggers_have_no_path_filter():
    triggers = _triggers(_workflow())
    assert set(triggers) == {"pull_request", "push", "workflow_dispatch"}
    for name, value in triggers.items():
        assert not (isinstance(value, dict) and ("paths" in value or "paths-ignore" in value)), name
    assert triggers["push"] == {"branches": ["main"]}


def test_workflow_has_the_two_required_jobs_and_never_continues_on_error():
    workflow = _workflow()
    assert set(workflow["jobs"]) == {"journey-gate"}
    assert workflow["jobs"]["journey-gate"]["timeout-minutes"] == 45
    assert "continue-on-error" not in WORKFLOW.read_text()
    for job in workflow["jobs"].values():
        assert "continue-on-error" not in job
        for step in job["steps"]:
            assert "continue-on-error" not in step


def test_every_step_after_the_relevance_step_is_conditional_on_it():
    for name, job in _workflow()["jobs"].items():
        steps = job["steps"]
        ids = [step.get("id") for step in steps]
        assert ids[1] == "changes", f"{name}: the relevance step must come right after checkout"
        assert steps[0]["uses"].startswith("actions/checkout@v4") and steps[0]["with"]["fetch-depth"] == 0
        for step in steps[2:]:
            assert "steps.changes.outputs.relevant == 'true'" in step["if"], f"{name}: {step.get('name')}"


def test_workflow_adds_no_new_third_party_action():
    allowed = {"actions/checkout@v4", "oven-sh/setup-bun@v2", "actions/upload-artifact@v4"}
    used = {step["uses"] for job in _workflow()["jobs"].values() for step in job["steps"] if "uses" in step}
    assert used <= allowed, used - allowed


def test_gate_job_runs_the_command_uploads_evidence_and_tears_down():
    steps = {step.get("name"): step for step in _workflow()["jobs"]["journey-gate"]["steps"]}
    assert steps["Run the student journey gate"]["run"] == "bash harness/bin/harness journey-gate"
    assert steps["Upload journey gate evidence"]["if"].startswith("always()")
    assert steps["Tear the harness down"]["if"].startswith("always()")
    assert steps["Dump harness logs on failure"]["if"].startswith("failure()")


# --- the relevance script: both required checks report on unrelated changes -----------


@pytest.mark.skipif(shutil.which("git") is None, reason="git is required")
@pytest.mark.parametrize("job", ["journey-gate"])
@pytest.mark.parametrize(
    "changed, expected",
    [
        (["docs/guide.md", "apps/jobs-ops/src/a.ts"], "false"),
        ([".github/workflows/ci.yml"], "false"),
        (["backend-notes/x.md", "apps/admissions-old/x.txt"], "false"),
        (["docs/guide.md", "backend/apps/x.py"], "true"),
        (["apps/admissions/src/a.ts"], "true"),
        (["harness/bin/harness"], "true"),
        ([".github/workflows/student-journey-gate.yml"], "true"),
    ],
)
def test_relevance_step_reports_relevant_only_for_gate_paths(job, changed, expected):
    step = next(s for s in _workflow()["jobs"][job]["steps"] if s.get("id") == "changes")
    with tempfile.TemporaryDirectory() as tmp:

        def git(*args):
            subprocess.run(["git", *args], cwd=tmp, check=True, capture_output=True)

        git("init", "-q", "-b", "main")
        git("config", "user.email", "ci@example.invalid")
        git("config", "user.name", "ci")
        Path(tmp, "README").write_text("base")
        git("add", ".")
        git("commit", "-qm", "base")
        git("update-ref", "refs/remotes/origin/main", "HEAD")
        git("checkout", "-qb", "pr")
        for name in changed:
            target = Path(tmp, name)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("changed")
        git("add", "-A")
        git("commit", "-qm", "pr")
        output = Path(tmp, "github-output")
        env = {**os.environ, "EVENT_NAME": "pull_request", "BASE_REF": "main", "BEFORE_SHA": "", "GITHUB_OUTPUT": str(output)}
        subprocess.run(["bash", "-c", step["run"]], cwd=tmp, env=env, check=True, capture_output=True)
        assert output.read_text().strip() == f"relevant={expected}"


@pytest.mark.skipif(shutil.which("git") is None, reason="git is required")
@pytest.mark.parametrize("event, before", [("workflow_dispatch", ""), ("push", "0" * 40), ("push", "")])
def test_relevance_step_runs_the_gate_for_dispatch_and_for_a_push_without_a_usable_base(event, before):
    step = next(s for s in _workflow()["jobs"]["journey-gate"]["steps"] if s.get("id") == "changes")
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["git", "init", "-q", "-b", "main"], cwd=tmp, check=True, capture_output=True)
        output = Path(tmp, "github-output")
        env = {**os.environ, "EVENT_NAME": event, "BASE_REF": "", "BEFORE_SHA": before, "GITHUB_OUTPUT": str(output)}
        subprocess.run(["bash", "-c", step["run"]], cwd=tmp, env=env, check=True, capture_output=True)
        assert output.read_text().strip() == "relevant=true"
