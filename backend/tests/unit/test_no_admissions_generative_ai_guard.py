"""The admissions/jobs-ops generative-AI boundary, as an executable guard.

Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task **12.4**
              ("Remove admissions AI/OCR/browser and other dead
              dependencies/assets" — *"retain jobs-ops dependencies only in its
              boundary"*).
Requirements: **R11.1** — "THE admissions runtime SHALL make no generative AI
              call for student summaries, reviewer summaries, document
              classification, grade extraction, eligibility, verification,
              routing, or decisions."
              **R11.9** — "THE build SHALL remove unused browser OCR
              packages/assets and admissions AI UI, endpoints, settings, caches,
              throttles, circuit breakers, prompts, and imports. **Any AI
              retained for another product SHALL be isolated outside the
              admissions boundary.**"
Findings:     **STU-06**, **MAINT-02**.

Why this file exists
--------------------
`config/settings/base.py` already told the reader this guard was here:

    ``tests/unit/test_no_admissions_generative_ai_guard.py`` fails the build if it
    does.

It did not exist. Task 7.4 did the removal and wrote the claim; the mechanism was
never committed. A comment that names a guard nobody wrote is worse than no
comment, because the next person to add an AI import to an admissions module
reads it and believes they are protected. Task 12.4 is the task whose whole
subject is *"retain jobs-ops dependencies only in its boundary"*, so it is the
task that owes the boundary a test.

What it measures, and what it deliberately does not
---------------------------------------------------
It is a **static** guard over source and configuration: imports, setting names,
module existence, route registration, and the two dependency manifests. It does
not attempt to prove at runtime that no socket opens — 7.5's
``test_admissions_extraction_path_makes_no_model_call`` and 9.4's
``test_no_generative_call_is_made`` cover the two paths where that question is
live. This one covers the whole surface, once, so a *new* admissions module
cannot reintroduce the dependency quietly.

It also asserts the retained half. `openai` stays, `pytesseract` and `Pillow`
stay, and `apps/jobs/ai_service.py` stays: an isolation guard that could be
satisfied by deleting the other product is not measuring isolation.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from django.conf import settings
from django.urls import get_resolver

BACKEND_ROOT = Path(__file__).resolve().parents[2]
APPS_ROOT = BACKEND_ROOT / "apps"
REPO_ROOT = BACKEND_ROOT.parent

# The admissions boundary, named exactly as `base.py`'s own comment names it.
ADMISSIONS_APPS = ("accounts", "applications", "catalog", "common", "documents")

# The jobs-ops boundary. Listed so a reader can see the split is total: every app
# under `backend/apps/` is on one side or the other, and the test proves it.
JOBS_OPS_APPS = ("analytics", "automation", "integrations", "jobs", "outreach")

#: Generative-client imports. `openai` is the SDK the Vercel AI Gateway speaks;
#: the others are here so a *different* provider is not a way around the rule.
AI_CLIENT_IMPORT = re.compile(
    r"^\s*(?:from\s+(openai|anthropic|google\.generativeai|litellm|cohere)\b"
    r"|import\s+(openai|anthropic|litellm|cohere)\b)",
    re.MULTILINE,
)

#: Settings that configure a generative model. Reading any of these from an
#: admissions module is the leak this guard is about, even without an import.
AI_SETTING_NAMES = (
    "JOBS_OPS_AI_GATEWAY_API_KEY",
    "JOBS_OPS_AI_GATEWAY_BASE_URL",
    "JOBS_OPS_AI_MODEL_FAST",
    "JOBS_OPS_AI_MODEL_ANALYSIS",
    "JOBS_OPS_AI_MODEL_SMART",
    "AI_GATEWAY_API_KEY",
    "AI_GATEWAY_BASE_URL",
    "AI_MODEL_FAST",
    "AI_MODEL_VISION",
    "AI_MODEL_ANALYSIS",
    "AI_MODEL_SMART",
)

#: Modules task 7.4 deleted with the admissions AI they served.
RETIRED_AI_MODULES = (
    "common/ai_service.py",
    "common/ai_cache.py",
    "common/ai_circuit_breaker.py",
    "common/ai_prompt_redactor.py",
)

#: Flags task 7.4 deleted. A flag that no longer exists must not be re-defined
#: on settings, because setting it would silently do nothing.
RETIRED_AI_FLAGS = (
    "AI_HARDENING_CIRCUIT_BREAKER",
    "AI_HARDENING_RATE_LIMITS",
    "AI_HARDENING_CACHE",
    "AI_HARDENING_REDACTION",
)

#: Routes task 7.4 deleted; task 12.2 de-registered the stale registry entries.
RETIRED_AI_ROUTES = ("admin-summary", "preview-summary")


def _python_files(app: str) -> list[Path]:
    root = APPS_ROOT / app
    return [
        path
        for path in sorted(root.rglob("*.py"))
        if "migrations" not in path.parts and "__pycache__" not in path.parts
    ]


def _relative(path: Path) -> str:
    return str(path.relative_to(BACKEND_ROOT))


# ── The boundary itself ──────────────────────────────────────────────────────


def test_the_app_split_is_total():
    """Every app is on one side of the boundary, so 'admissions' is not a subset."""
    present = {
        entry.name
        for entry in APPS_ROOT.iterdir()
        if entry.is_dir() and not entry.name.startswith("__")
    }
    classified = set(ADMISSIONS_APPS) | set(JOBS_OPS_APPS)
    unclassified = present - classified
    assert not unclassified, (
        "New backend app(s) are on neither side of the AI boundary: "
        f"{sorted(unclassified)}. Add them to ADMISSIONS_APPS or JOBS_OPS_APPS "
        "so this guard keeps covering the whole surface."
    )


def test_no_admissions_module_imports_a_generative_client():
    """R11.1/R11.9: the admissions boundary has no generative-client import."""
    offenders = []
    for app in ADMISSIONS_APPS:
        for path in _python_files(app):
            match = AI_CLIENT_IMPORT.search(path.read_text())
            if match:
                offenders.append(f"{_relative(path)}: {match.group(0).strip()}")
    assert offenders == [], (
        "Admissions modules must not import a generative client. "
        f"Offenders: {offenders}"
    )


def test_no_admissions_module_reads_a_generative_model_setting():
    """An import is not the only way in: a settings read is the other."""
    offenders = []
    for app in ADMISSIONS_APPS:
        for path in _python_files(app):
            source = path.read_text()
            for name in AI_SETTING_NAMES:
                # `settings.X` and `getattr(settings, "X", …)` both count; a
                # mention inside a comment does not.
                code = re.sub(r"#.*", "", source)
                if re.search(rf"(?:settings\s*,\s*[\"']{name}[\"']|settings\.{name}\b)", code):
                    offenders.append(f"{_relative(path)}: {name}")
    assert offenders == [], (
        "Admissions modules must not read a generative-model setting. "
        f"Offenders: {offenders}"
    )


def test_the_generative_client_has_exactly_one_importer_and_it_is_jobs_ops():
    """The retained dependency is retained *in its boundary*, and only there."""
    importers = []
    for app in ADMISSIONS_APPS + JOBS_OPS_APPS:
        for path in _python_files(app):
            if AI_CLIENT_IMPORT.search(path.read_text()):
                importers.append(_relative(path))
    assert importers == ["apps/jobs/ai_service.py"], (
        "`openai` must have exactly one importer in the backend, and it must be "
        f"the jobs-ops AI service. Measured: {importers}"
    )


def test_the_jobs_ops_ai_service_still_exists_and_reads_only_its_own_settings():
    """The retained half. Isolation proven by deletion is not isolation."""
    service = APPS_ROOT / "jobs" / "ai_service.py"
    assert service.exists(), "apps/jobs/ai_service.py is the jobs-ops AI boundary"
    source = service.read_text()
    assert "JOBS_OPS_AI_GATEWAY_API_KEY" in source
    # It must not reach for the un-namespaced settings task 7.4 moved, because
    # those names are what an admissions module would plausibly reuse.
    code = re.sub(r"#.*", "", source)
    for shared in ("settings.AI_GATEWAY_API_KEY", "settings.AI_MODEL_FAST"):
        assert shared not in code


# ── The removed half ─────────────────────────────────────────────────────────


@pytest.mark.parametrize("module", RETIRED_AI_MODULES)
def test_retired_admissions_ai_module_is_absent(module):
    assert not (APPS_ROOT / module).exists(), (
        f"apps/{module} was removed by admissions-v2 task 7.4 (R11.1). "
        "Reintroducing it puts a generative call back inside the admissions "
        "boundary."
    )


@pytest.mark.parametrize("flag", RETIRED_AI_FLAGS)
def test_retired_ai_hardening_flag_is_not_defined_on_settings(flag):
    assert not hasattr(settings, flag), (
        f"{flag} was removed with the admissions AI it hardened (task 7.4). A "
        "flag that exists but selects nothing is worse than an absent one: an "
        "operator can set it and believe something changed."
    )


def test_un_namespaced_ai_settings_are_not_defined():
    """Task 7.4 moved these into `JOBS_OPS_AI_*`; the old names must stay gone."""
    for name in ("AI_GATEWAY_API_KEY", "AI_MODEL_FAST", "AI_MODEL_VISION", "AI_MODEL_ANALYSIS"):
        assert not hasattr(settings, name), (
            f"settings.{name} is the pre-7.4 shared name. The env var of the same "
            "name is still read — deliberately, so no deployment is re-keyed — "
            "but only into the `JOBS_OPS_AI_*` Django settings."
        )


def test_no_retired_generative_route_is_registered():
    """The two routes 7.4 deleted and 12.2 de-registered are not served."""
    patterns = []

    def walk(resolver, prefix=""):
        for entry in resolver.url_patterns:
            if hasattr(entry, "url_patterns"):
                walk(entry, prefix + str(entry.pattern))
            else:
                patterns.append(prefix + str(entry.pattern))

    walk(get_resolver())
    offenders = [p for p in patterns if any(route in p for route in RETIRED_AI_ROUTES)]
    assert offenders == [], f"Retired generative routes are still served: {offenders}"


# ── The two manifests ────────────────────────────────────────────────────────


def test_requirements_scopes_the_generative_sdk_to_jobs_ops():
    """R11.9's isolation clause, at the dependency-declaration level."""
    # Task 5.1 split the manifest: `requirements.in` declares, `requirements.txt` is
    # the compiled lock (no comments, no sections). The declaration is what this
    # test reads; the unchanged assertions below still apply to it.
    requirements = (BACKEND_ROOT / "requirements.in").read_text()
    assert re.search(r"^openai", requirements, re.MULTILINE), (
        "openai is a live jobs-ops dependency and must stay declared"
    )
    # The declaration must sit under the jobs-ops marker, not in the general list.
    head, marker, tail = requirements.partition("# jobs-ops only")
    assert marker, "requirements.in must mark the jobs-ops-only section"
    assert not re.search(r"^openai", head, re.MULTILINE), (
        "openai must be declared inside the jobs-ops-only section, so a reader "
        "cannot mistake it for a platform dependency"
    )
    assert re.search(r"^openai", tail, re.MULTILINE)


def test_server_side_ocr_dependencies_are_retained():
    """The bullet is about *dead* dependencies. Backend OCR is alive (task 7.5)."""
    # Declarations live in `requirements.in` since task 5.1 (the lock lowercases names).
    requirements = (BACKEND_ROOT / "requirements.in").read_text()
    for package in ("pytesseract", "Pillow"):
        assert re.search(rf"^{package}", requirements, re.MULTILINE), (
            f"{package} backs `extract_document_text_task`, which task 7.5 kept "
            "as optional deterministic assistance. Removing it would delete a "
            "live student-facing affordance, not dead weight."
        )


def test_the_admissions_frontend_declares_no_ai_or_browser_ocr_package():
    """The other half of R11.9, on the surface a student downloads."""
    import json

    manifest = json.loads((REPO_ROOT / "apps" / "admissions" / "package.json").read_text())
    declared = {**manifest.get("dependencies", {}), **manifest.get("devDependencies", {})}
    forbidden = [
        name
        for name in declared
        if any(
            marker in name.lower()
            for marker in ("tesseract", "openai", "anthropic", "langchain", "@ai-sdk", "ai-sdk")
        )
    ]
    assert forbidden == [], (
        f"The admissions frontend must declare no AI or browser-OCR package: {forbidden}"
    )
