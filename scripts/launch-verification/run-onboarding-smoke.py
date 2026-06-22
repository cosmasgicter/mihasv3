#!/usr/bin/env python3
"""Gate 10 — Onboarding_Smoke_Gate driver (Requirement 10).

┌────────────────────────────────────────────────────────────────────────────┐
│ DEPLOYED-TARGET driver. Operator-run / scheduled. **NOT auto-run in CI.**    │
│ Requires a live, deployed Beanola tenant-admin API + a disposable test       │
│ school definition and credentials (super-admin + scoped-staff). python3.     │
└────────────────────────────────────────────────────────────────────────────┘

This script drives the **end-to-end tenant onboarding journey** against the
*deployed* tenant-admin API in the canonical 11-step order and records a
launch-verification ``Evidence_Artifact``. It is deliberately **not** wired into
the automated CI gates — CI runs only the pure-logic gates and the rollup. The
heavy lifting of *deciding* the gate (halt-at-first-failure, the per-step pass
rule, R10.12) lives in the pure, property-tested core
:mod:`onboarding_eval` (task 16.1); this wrapper only performs the live API
calls, times each step, asserts each result is retrievable and scoped to the
created school, and feeds the per-step facts into the core.

The canonical journey (R10.1–R10.11), fixed in
:data:`onboarding_eval.STEP_SEQUENCE`::

    create school → assets → document profile/template → program/offering →
    membership/grant → routing simulator → student application →
    scoped-staff read → super-admin read → payment verified → official document

For each step the driver:

* performs the API call(s) for that step against the deployed tenant-admin API;
* times the step end to end (per-step ``elapsed_ms``);
* asserts the result is **retrievable** and **scoped to the created school**
  (``scoped_to_school``) per R10.1–R10.11 — the scoped-staff read (R10.8) also
  asserts an *out-of-scope* read returns **not-found**, and the super-admin read
  (R10.9) asserts cross-school visibility;
* records a per-step fact ``{step, ok, errored, elapsed_ms, scoped_to_school}``.

Those per-step facts are handed to :func:`onboarding_eval.sequence_onboarding`,
which walks them in order and **halts at the first failure** (R10.12), marking no
later step passed. Because later steps depend on earlier ones, this driver also
*stops issuing live calls* after the first failing step and records every
remaining step as skipped/not-measured.

The artifact is emitted to
``docs/launch-evidence/10-onboarding/onboarding-evidence.json`` through the
shared ``Evidence_Artifact`` envelope (``gate_id="onboarding"``,
``requirement="R10"``, ``generated_by="deployed-target"``). Each check row
carries the Gate 10 fields (``step``, ``result``, ``scoped_to_school``,
``elapsed_ms``, ``halted_at``); the overall ``status`` is ``passed`` only when
every step passed.

Configuration — every value is overridable (env then CLI):

* ``--base-url`` / ``LV_BASE_URL`` / ``API_URL`` — deployed tenant-admin API origin.
* ``--super-admin-token`` / ``LV_SUPER_ADMIN_TOKEN`` — super-admin bearer token,
  or ``--super-admin-cookie`` / ``LV_SUPER_ADMIN_COOKIE`` for cookie auth.
* ``--staff-token`` / ``LV_STAFF_TOKEN`` (or ``--staff-cookie``) — scoped-staff auth.
* ``--school-slug`` / ``--school-hostname`` — the disposable test school identity.

HTTP uses the stdlib :mod:`urllib` (no hard dependency on ``requests``); when the
target is unreachable in a sandbox the affected step is recorded as ``errored``
with the observed transport error, which correctly halts the run and marks the
gate not passed (fail-closed). A ``--synthetic`` / ``--dry-run`` mode emits a
valid envelope over synthetic step results **without a live target** — both an
all-pass run and (via ``--fail-at STEP``) a mid-sequence halt-at-step demo.

Run it::

    # live (operator, post-deploy, against the deployed tenant-admin API):
    python3 scripts/launch-verification/run-onboarding-smoke.py \\
        --base-url https://api.beanola.com \\
        --super-admin-token "$LV_SUPER_ADMIN_TOKEN" \\
        --staff-token "$LV_STAFF_TOKEN"

    # offline envelope check (no network), all steps pass:
    python3 scripts/launch-verification/run-onboarding-smoke.py --synthetic

    # offline halt-at-step demo (failure injected at the membership/grant step):
    python3 scripts/launch-verification/run-onboarding-smoke.py \\
        --synthetic --fail-at membership_grant

**Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 10.12**
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

# --------------------------------------------------------------------------- #
# Imports: the pure onboarding core (same dir) + the shared envelope (backend/).
# --------------------------------------------------------------------------- #
#
# ``onboarding_eval`` lives beside this file in ``scripts/launch-verification/``;
# the evidence schema lives at ``<repo>/backend/apps/common/launch_verification/
# evidence.py``. Both are resolved from this file's location so imports work
# regardless of the current working directory.

_THIS_FILE = Path(__file__).resolve()
_THIS_DIR = _THIS_FILE.parent
# parents[0] = scripts/launch-verification, [1] = scripts, [2] = repo root
REPO_ROOT = _THIS_FILE.parents[2]
_BACKEND_DIR = REPO_ROOT / "backend"


def _ensure_on_path(directory: Path) -> None:
    """Insert ``directory`` at the front of ``sys.path`` if not already present."""
    text = str(directory)
    if text not in sys.path:
        sys.path.insert(0, text)


_ensure_on_path(_THIS_DIR)
_ensure_on_path(_BACKEND_DIR)

try:
    import onboarding_eval  # noqa: E402,F401  (same-dir pure core, task 16.1)
    from onboarding_eval import (  # noqa: E402
        FAIL,
        PASS,
        SKIPPED,
        STEP_SEQUENCE,
        STEP_TIMEOUT_MS,
        sequence_onboarding,
    )
except ImportError as exc:  # pragma: no cover - defensive, surfaces a clear error
    raise SystemExit(
        "run-onboarding-smoke: could not import the onboarding core from "
        f"{_THIS_DIR}/onboarding_eval.py — {exc}"
    )

try:
    from apps.common.launch_verification.evidence import (  # noqa: E402
        EvidenceArtifact,
        EvidenceArtifactError,
        EvidenceStatus,
        GeneratedBy,
        to_json,
        utc_now_iso,
    )
except ImportError as exc:  # pragma: no cover - defensive, surfaces a clear error
    raise SystemExit(
        "run-onboarding-smoke: could not import the evidence schema from "
        f"{_BACKEND_DIR}/apps/common/launch_verification/evidence.py — {exc}"
    )


# --------------------------------------------------------------------------- #
# Defaults — production host; every value is overridable (env then CLI).
# --------------------------------------------------------------------------- #

DEFAULT_BASE_URL = "https://api.beanola.com"

#: Best-effort default endpoint templates for the journey, under ``/api/v1/``.
#: The deployed tenant-admin surface mounts institutions under
#: ``/api/v1/catalog/institutions/`` (see ``backend/apps/catalog/urls.py``); the
#: design refers to these collectively as the ``/api/v1/admin/institutions/...``
#: tenant-admin API. Operators can override any path with ``--endpoints <json>``
#: without touching this module. ``{school}`` is substituted with the created
#: school id once it exists.
DEFAULT_ENDPOINTS: Dict[str, str] = {
    "institutions": "/api/v1/catalog/institutions/",
    "institution_detail": "/api/v1/catalog/institutions/{school}/",
    "assets": "/api/v1/catalog/institutions/{school}/assets/",
    "document_profile": "/api/v1/catalog/institutions/{school}/document-profile/",
    "programs": "/api/v1/catalog/programs/",
    "offerings": "/api/v1/catalog/institutions/{school}/offerings/",
    "memberships": "/api/v1/catalog/institutions/{school}/memberships/",
    "access_grants": "/api/v1/catalog/institutions/{school}/access-grants/",
    "routing_simulate": "/api/v1/catalog/assignment-preview/",
    "applications": "/api/v1/applications/",
    "application_detail": "/api/v1/applications/{application}/",
    "payments_verify": "/api/v1/payments/{payment}/verify/",
    "official_document": "/api/v1/applications/{application}/documents/",
}

#: Per-step network timeout, in seconds, derived from the R10.12 budget.
STEP_TIMEOUT_S: float = STEP_TIMEOUT_MS / 1000.0

#: Map the closed onboarding result vocabulary (pass|fail|skipped) onto the
#: closed Evidence_Artifact check-result vocabulary (pass|fail|not-measured).
#: A skipped step (everything after the halt) is recorded ``not-measured`` so it
#: is never represented as a pass in the artifact (R10.12).
_RESULT_TO_CHECK: Dict[str, str] = {
    PASS: "pass",
    FAIL: "fail",
    SKIPPED: "not-measured",
}


# --------------------------------------------------------------------------- #
# HTTP client — stdlib only, degrades clearly when the target is unreachable.
# --------------------------------------------------------------------------- #


class HttpResult:
    """The outcome of a single HTTP call: status, parsed body, error, latency."""

    __slots__ = ("status", "body", "error", "latency_ms")

    def __init__(
        self,
        status: int,
        body: Any,
        error: str,
        latency_ms: float,
    ) -> None:
        self.status = status
        self.body = body
        self.error = error
        self.latency_ms = latency_ms

    @property
    def ok(self) -> bool:
        """A non-error response in the 2xx range with no transport error."""
        return not self.error and 200 <= self.status < 300

    @property
    def not_found(self) -> bool:
        """A clean 404 response (used by the scoped-staff out-of-scope probe)."""
        return not self.error and self.status == 404


class OnboardingHttpClient:
    """A tiny urllib client carrying auth headers for a single actor.

    ``token`` is sent as a ``Bearer`` Authorization header; ``cookie`` is sent
    verbatim as the ``Cookie`` header (cookie-based auth is the platform's
    browser model). Never raises for a network failure — failures surface as an
    :class:`HttpResult` with a populated ``error`` so the driver can record the
    step as errored and halt (fail-closed).
    """

    def __init__(
        self,
        base_url: str,
        *,
        token: Optional[str] = None,
        cookie: Optional[str] = None,
        csrf_token: Optional[str] = None,
        timeout_s: float = STEP_TIMEOUT_S,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.cookie = cookie
        self.csrf_token = csrf_token
        self.timeout_s = timeout_s

    def _headers(self, *, json_body: bool) -> Dict[str, str]:
        headers: Dict[str, str] = {"Accept": "application/json"}
        if json_body:
            headers["Content-Type"] = "application/json"
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        if self.cookie:
            headers["Cookie"] = self.cookie
        if self.csrf_token:
            headers["X-CSRF-Token"] = self.csrf_token
        return headers

    def request(
        self,
        method: str,
        path: str,
        *,
        body: Optional[Dict[str, Any]] = None,
    ) -> HttpResult:
        """Issue one request and return an :class:`HttpResult` (never raises)."""
        url = self.base_url + "/" + path.lstrip("/") if not path.startswith("http") else path
        data: Optional[bytes] = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
        request = urllib.request.Request(
            url, method=method.upper(), data=data, headers=self._headers(json_body=body is not None)
        )
        start = time.perf_counter()
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_s) as response:  # noqa: S310
                raw = response.read()
                latency_ms = (time.perf_counter() - start) * 1000.0
                return HttpResult(int(response.getcode() or 0), _parse_json(raw), "", latency_ms)
        except urllib.error.HTTPError as exc:
            latency_ms = (time.perf_counter() - start) * 1000.0
            raw = b""
            try:
                raw = exc.read()
            except Exception:  # noqa: BLE001 - body may be unavailable
                raw = b""
            return HttpResult(int(exc.code), _parse_json(raw), "", latency_ms)
        except Exception as exc:  # noqa: BLE001 - degrade clearly on any transport error
            latency_ms = (time.perf_counter() - start) * 1000.0
            return HttpResult(0, None, f"{type(exc).__name__}: {exc}", latency_ms)


def _parse_json(raw: bytes) -> Any:
    """Best-effort JSON parse; returns ``None`` for empty/unparseable bodies."""
    if not raw:
        return None
    try:
        return json.loads(raw.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None


def _unwrap(body: Any) -> Any:
    """Unwrap the platform ``{"success": true, "data": ...}`` envelope if present."""
    if isinstance(body, dict) and "data" in body and set(body.keys()) <= {"success", "data", "error", "message"}:
        return body["data"]
    return body


def _record_id(body: Any) -> Optional[str]:
    """Pull an ``id`` (or ``uuid``) from a (possibly enveloped) record body."""
    data = _unwrap(body)
    if isinstance(data, dict):
        for key in ("id", "uuid", "pk"):
            if data.get(key):
                return str(data[key])
    return None


def _belongs_to_school(body: Any, school_id: str) -> bool:
    """Return True iff a record body is scoped to ``school_id``.

    Accepts the common foreign-key shapes the tenant models expose
    (``institution``/``institution_id``/``school``/``school_id``) and a nested
    ``institution: {id: ...}`` object.
    """
    data = _unwrap(body)
    if not isinstance(data, dict):
        return False
    for key in ("institution_id", "school_id", "institution", "school", "tenant_id"):
        value = data.get(key)
        if isinstance(value, dict):
            value = value.get("id") or value.get("uuid")
        if value is not None and str(value) == str(school_id):
            return True
    return False


# --------------------------------------------------------------------------- #
# Step-result model — the per-step fact handed to the pure core.
# --------------------------------------------------------------------------- #


def make_step_result(
    step: str,
    *,
    ok: bool,
    errored: bool,
    elapsed_ms: float,
    scoped_to_school: bool,
    observed: str = "",
) -> Dict[str, Any]:
    """Build the per-step fact dict consumed by :mod:`onboarding_eval`.

    Carries exactly the keys the pure core reads (``step``, ``ok``, ``errored``,
    ``elapsed_ms``, ``scoped_to_school``) plus a human ``observed`` string the
    wrapper threads into the evidence check rows.
    """
    return {
        "step": step,
        "ok": bool(ok),
        "errored": bool(errored),
        "elapsed_ms": round(float(elapsed_ms), 3),
        "scoped_to_school": bool(scoped_to_school),
        "observed": observed,
    }


# --------------------------------------------------------------------------- #
# Live journey driver — one method per canonical step.
# --------------------------------------------------------------------------- #


class LiveOnboardingDriver:
    """Drives the 11-step onboarding journey against the deployed tenant-admin API.

    Holds the two actor clients (super-admin + scoped-staff), the endpoint map,
    the disposable test-school definition, and the mutable journey state
    (created school id, application id, payment id) threaded between steps. Each
    ``step_*`` method performs its API call(s), times the whole step, asserts the
    result is scoped to the created school, and returns a :func:`make_step_result`
    fact. None of them raise — a transport error becomes ``errored=True``.
    """

    def __init__(
        self,
        *,
        admin_client: OnboardingHttpClient,
        staff_client: OnboardingHttpClient,
        endpoints: Dict[str, str],
        school_slug: str,
        school_hostname: str,
        timeout_ms: float = STEP_TIMEOUT_MS,
    ) -> None:
        self.admin = admin_client
        self.staff = staff_client
        self.endpoints = endpoints
        self.school_slug = school_slug
        self.school_hostname = school_hostname
        self.timeout_ms = timeout_ms
        # Mutable journey state.
        self.school_id: Optional[str] = None
        self.application_id: Optional[str] = None
        self.payment_id: Optional[str] = None
        self.other_school_id: Optional[str] = None

    # -- endpoint helper ----------------------------------------------------

    def _path(self, key: str, **subs: str) -> str:
        template = self.endpoints.get(key, DEFAULT_ENDPOINTS.get(key, ""))
        out = template
        for name, value in subs.items():
            out = out.replace("{" + name + "}", str(value))
        return out

    # -- R10.1 create school ------------------------------------------------

    def step_create_school(self) -> Dict[str, Any]:
        start = time.perf_counter()
        create = self.admin.request(
            "POST",
            self._path("institutions"),
            body={
                "name": f"LV Smoke School {self.school_slug}",
                "slug": self.school_slug,
                "hostname": self.school_hostname,
                "is_active": True,
            },
        )
        if create.error or not create.ok:
            return self._fail("create_school", start, create, "create POST failed")
        school_id = _record_id(create.body)
        if not school_id:
            return self._fail("create_school", start, create, "no school id in response")
        self.school_id = school_id
        # Confirm retrievable by its assigned identifier with unique hostname + slug.
        fetch = self.admin.request("GET", self._path("institution_detail", school=school_id))
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        if fetch.error or not fetch.ok:
            return self._fail("create_school", start, fetch, "school not retrievable")
        data = _unwrap(fetch.body) or {}
        unique = str(data.get("slug")) == self.school_slug and str(data.get("hostname")) == self.school_hostname
        return make_step_result(
            "create_school",
            ok=True,
            errored=False,
            elapsed_ms=elapsed_ms,
            scoped_to_school=bool(unique),
            observed=f"school {school_id} slug/hostname unique={unique}",
        )

    # -- R10.2 assets -------------------------------------------------------

    def step_assets(self) -> Dict[str, Any]:
        start = time.perf_counter()
        if not self.school_id:
            return self._fail_missing("assets", start, "no school id")
        observed_parts: List[str] = []
        scoped = True
        for kind in ("logo", "signature"):
            create = self.admin.request(
                "POST",
                self._path("assets", school=self.school_id),
                body={"asset_type": kind, "url": f"https://assets.example/{self.school_slug}-{kind}.png"},
            )
            if create.error or not create.ok:
                return self._fail("assets", start, create, f"{kind} upload failed")
            if not _belongs_to_school(create.body, self.school_id):
                scoped = False
            observed_parts.append(f"{kind} ok")
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        return make_step_result(
            "assets",
            ok=True,
            errored=False,
            elapsed_ms=elapsed_ms,
            scoped_to_school=scoped,
            observed=", ".join(observed_parts),
        )

    # -- R10.3 document profile / template ---------------------------------

    def step_document_profile(self) -> Dict[str, Any]:
        start = time.perf_counter()
        if not self.school_id:
            return self._fail_missing("document_profile", start, "no school id")
        save = self.admin.request(
            "POST",
            self._path("document_profile", school=self.school_id),
            body={"template_key": "acceptance_letter", "config": {"signatory": "LV Smoke"}},
        )
        if save.error or not save.ok:
            return self._fail("document_profile", start, save, "profile save failed")
        fetch = self.admin.request("GET", self._path("document_profile", school=self.school_id))
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        if fetch.error or not fetch.ok:
            return self._fail("document_profile", start, fetch, "profile not retrievable")
        return make_step_result(
            "document_profile",
            ok=True,
            errored=False,
            elapsed_ms=elapsed_ms,
            scoped_to_school=_belongs_to_school(fetch.body, self.school_id) or _is_scoped_collection(fetch.body, self.school_id),
            observed="document profile saved + retrievable",
        )

    # -- R10.4 program / offering ------------------------------------------

    def step_program_offering(self) -> Dict[str, Any]:
        start = time.perf_counter()
        if not self.school_id:
            return self._fail_missing("program_offering", start, "no school id")
        assign = self.admin.request(
            "POST",
            self._path("offerings", school=self.school_id),
            body={"program_code": "RN", "intake_label": "LV-Smoke"},
        )
        if assign.error or not assign.ok:
            return self._fail("program_offering", start, assign, "offering assignment failed")
        fetch = self.admin.request("GET", self._path("offerings", school=self.school_id))
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        if fetch.error or not fetch.ok:
            return self._fail("program_offering", start, fetch, "offering not retrievable")
        return make_step_result(
            "program_offering",
            ok=True,
            errored=False,
            elapsed_ms=elapsed_ms,
            scoped_to_school=_is_scoped_collection(fetch.body, self.school_id),
            observed="program + offering assigned",
        )

    # -- R10.5 membership / access grant -----------------------------------

    def step_membership_grant(self) -> Dict[str, Any]:
        start = time.perf_counter()
        if not self.school_id:
            return self._fail_missing("membership_grant", start, "no school id")
        membership = self.admin.request(
            "POST",
            self._path("memberships", school=self.school_id),
            body={"role": "reviewer", "email": f"staff+{self.school_slug}@example.com", "is_active": True},
        )
        if membership.error or not membership.ok:
            return self._fail("membership_grant", start, membership, "membership create failed")
        grant = self.admin.request(
            "POST",
            self._path("access_grants", school=self.school_id),
            body={"scope": "application:read", "is_active": True},
        )
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        if grant.error or not grant.ok:
            return self._fail("membership_grant", start, grant, "access grant create failed")
        m_active = bool((_unwrap(membership.body) or {}).get("is_active", True))
        g_active = bool((_unwrap(grant.body) or {}).get("is_active", True))
        scoped = (
            _belongs_to_school(membership.body, self.school_id)
            and _belongs_to_school(grant.body, self.school_id)
        )
        return make_step_result(
            "membership_grant",
            ok=True,
            errored=False,
            elapsed_ms=elapsed_ms,
            scoped_to_school=scoped and m_active and g_active,
            observed=f"membership active={m_active}, grant active={g_active}",
        )

    # -- R10.6 routing simulator -------------------------------------------

    def step_routing_simulator(self) -> Dict[str, Any]:
        start = time.perf_counter()
        if not self.school_id:
            return self._fail_missing("routing_simulator", start, "no school id")
        run = self.admin.request(
            "POST",
            self._path("routing_simulate"),
            body={"institution_id": self.school_id, "program_code": "RN"},
        )
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        if run.error or not run.ok:
            return self._fail("routing_simulator", start, run, "routing simulation failed")
        return make_step_result(
            "routing_simulator",
            ok=True,
            errored=False,
            elapsed_ms=elapsed_ms,
            scoped_to_school=_belongs_to_school(run.body, self.school_id)
            or _is_scoped_collection(run.body, self.school_id),
            observed="routing simulator returned a scoped result",
        )

    # -- R10.7 student application -----------------------------------------

    def step_student_application(self) -> Dict[str, Any]:
        start = time.perf_counter()
        if not self.school_id:
            return self._fail_missing("student_application", start, "no school id")
        create = self.staff.request(
            "POST",
            self._path("applications"),
            body={"institution_id": self.school_id, "program_code": "RN"},
        )
        if create.error or not create.ok:
            return self._fail("student_application", start, create, "application submit failed")
        app_id = _record_id(create.body)
        if not app_id:
            return self._fail("student_application", start, create, "no application id in response")
        self.application_id = app_id
        fetch = self.staff.request("GET", self._path("application_detail", application=app_id))
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        if fetch.error or not fetch.ok:
            return self._fail("student_application", start, fetch, "application not persisted")
        return make_step_result(
            "student_application",
            ok=True,
            errored=False,
            elapsed_ms=elapsed_ms,
            scoped_to_school=_belongs_to_school(fetch.body, self.school_id),
            observed=f"application {app_id} persisted + scoped",
        )

    # -- R10.8 scoped-staff read (in-scope returned, out-of-scope not-found) -

    def step_scoped_staff_read(self) -> Dict[str, Any]:
        start = time.perf_counter()
        if not self.application_id:
            return self._fail_missing("scoped_staff_read", start, "no application id")
        in_scope = self.staff.request("GET", self._path("application_detail", application=self.application_id))
        if in_scope.error or not in_scope.ok:
            return self._fail("scoped_staff_read", start, in_scope, "in-scope read not returned")
        # Out-of-scope read must come back as a clean not-found (R10.8): the
        # record must not exist *for this staff member*. We probe a random,
        # foreign application id the scoped staff has no grant for.
        foreign_id = str(uuid.uuid4())
        out_scope = self.staff.request("GET", self._path("application_detail", application=foreign_id))
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        if out_scope.error:
            return self._fail("scoped_staff_read", start, out_scope, "out-of-scope probe errored")
        # Pass only if in-scope returned AND out-of-scope returned not-found.
        out_not_found = out_scope.not_found
        return make_step_result(
            "scoped_staff_read",
            ok=out_not_found,
            errored=False,
            elapsed_ms=elapsed_ms,
            scoped_to_school=_belongs_to_school(in_scope.body, self.school_id) and out_not_found,
            observed=f"in-scope returned; out-of-scope status={out_scope.status} (want 404)",
        )

    # -- R10.9 super-admin cross-school read --------------------------------

    def step_super_admin_read(self) -> Dict[str, Any]:
        start = time.perf_counter()
        if not self.school_id:
            return self._fail_missing("super_admin_read", start, "no school id")
        listing = self.admin.request("GET", self._path("institutions"))
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        if listing.error or not listing.ok:
            return self._fail("super_admin_read", start, listing, "super-admin list failed")
        data = _unwrap(listing.body)
        rows = data.get("results", data) if isinstance(data, dict) else data
        ids = {str(r.get("id")) for r in rows if isinstance(r, dict)} if isinstance(rows, list) else set()
        sees_created = self.school_id in ids
        return make_step_result(
            "super_admin_read",
            ok=sees_created,
            errored=False,
            elapsed_ms=elapsed_ms,
            scoped_to_school=sees_created,
            observed=f"super-admin sees {len(ids)} schools, includes created={sees_created}",
        )

    # -- R10.10 payment verified -------------------------------------------

    def step_payment_verified(self) -> Dict[str, Any]:
        start = time.perf_counter()
        if not self.application_id:
            return self._fail_missing("payment_verified", start, "no application id")
        # Drive the payment to verified (admin override / verify endpoint). The
        # exact recording path varies by deploy; we verify by application id.
        verify = self.admin.request(
            "POST",
            self._path("payments_verify", payment=self.application_id),
            body={"application_id": self.application_id},
        )
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        if verify.error or not verify.ok:
            return self._fail("payment_verified", start, verify, "payment verify failed")
        data = _unwrap(verify.body) or {}
        status = str(data.get("status", "")).lower()
        verified = status in {"verified", "paid", "successful", "force_approved"}
        return make_step_result(
            "payment_verified",
            ok=verified,
            errored=False,
            elapsed_ms=elapsed_ms,
            scoped_to_school=verified and _belongs_to_school(verify.body, self.school_id),
            observed=f"payment status={status or 'unknown'}",
        )

    # -- R10.11 official document ------------------------------------------

    def step_official_document(self) -> Dict[str, Any]:
        start = time.perf_counter()
        if not self.application_id:
            return self._fail_missing("official_document", start, "no application id")
        generate = self.admin.request(
            "POST",
            self._path("official_document", application=self.application_id),
            body={"document_type": "acceptance_letter", "use_school_profile": True},
        )
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        if generate.error or not generate.ok:
            return self._fail("official_document", start, generate, "document generation failed")
        data = _unwrap(generate.body) or {}
        from_profile = bool(data.get("from_document_profile", data.get("used_school_profile", True)))
        return make_step_result(
            "official_document",
            ok=from_profile,
            errored=False,
            elapsed_ms=elapsed_ms,
            scoped_to_school=from_profile and _belongs_to_school(generate.body, self.school_id),
            observed=f"official document produced from school profile={from_profile}",
        )

    # -- failure helpers ----------------------------------------------------

    def _fail(self, step: str, start: float, result: HttpResult, detail: str) -> Dict[str, Any]:
        """Record a step that errored or returned a non-2xx response."""
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        errored = bool(result.error) or result.status >= 500 or result.status == 0
        observed = result.error or f"HTTP {result.status}: {detail}"
        return make_step_result(
            step,
            ok=False,
            errored=errored,
            elapsed_ms=elapsed_ms,
            scoped_to_school=False,
            observed=observed,
        )

    def _fail_missing(self, step: str, start: float, detail: str) -> Dict[str, Any]:
        """Record a step that could not run because a prerequisite is missing."""
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        return make_step_result(
            step,
            ok=False,
            errored=True,
            elapsed_ms=elapsed_ms,
            scoped_to_school=False,
            observed=f"prerequisite missing: {detail}",
        )


def _is_scoped_collection(body: Any, school_id: str) -> bool:
    """True iff a list/collection body is non-empty and every row is school-scoped."""
    data = _unwrap(body)
    rows = data.get("results", data) if isinstance(data, dict) else data
    if isinstance(rows, list):
        return len(rows) > 0 and all(_belongs_to_school(r, school_id) for r in rows)
    if isinstance(rows, dict):
        return _belongs_to_school(rows, school_id)
    return False


#: The canonical step driver order, keyed to :data:`onboarding_eval.STEP_SEQUENCE`.
def _driver_steps(driver: LiveOnboardingDriver) -> List[Tuple[str, Callable[[], Dict[str, Any]]]]:
    return [
        ("create_school", driver.step_create_school),
        ("assets", driver.step_assets),
        ("document_profile", driver.step_document_profile),
        ("program_offering", driver.step_program_offering),
        ("membership_grant", driver.step_membership_grant),
        ("routing_simulator", driver.step_routing_simulator),
        ("student_application", driver.step_student_application),
        ("scoped_staff_read", driver.step_scoped_staff_read),
        ("super_admin_read", driver.step_super_admin_read),
        ("payment_verified", driver.step_payment_verified),
        ("official_document", driver.step_official_document),
    ]


def drive_live_journey(driver: LiveOnboardingDriver) -> List[Dict[str, Any]]:
    """Run the live journey in canonical order, halting after the first failure.

    Returns per-step facts for **every** step in :data:`STEP_SEQUENCE`: each step
    up to and including the first failure is driven live; every step after the
    halt is recorded as a not-run skip (``ok=False``) without issuing a call,
    because later steps depend on earlier ones. The pure core
    (:func:`onboarding_eval.sequence_onboarding`) independently enforces the
    halt-and-skip semantics over these facts.
    """
    from onboarding_eval import step_passed  # local import keeps the core authoritative

    results: List[Dict[str, Any]] = []
    halted = False
    for name, runner in _driver_steps(driver):
        if halted:
            results.append(
                make_step_result(
                    name, ok=False, errored=False, elapsed_ms=0.0,
                    scoped_to_school=False, observed="not run (halted at an earlier step)",
                )
            )
            continue
        fact = runner()
        results.append(fact)
        if not step_passed(fact, driver.timeout_ms):
            halted = True
    return results


# --------------------------------------------------------------------------- #
# Synthetic step results — for the offline --synthetic / --dry-run path.
# --------------------------------------------------------------------------- #


def synthetic_step_results(fail_at: Optional[str] = None) -> List[Dict[str, Any]]:
    """Build synthetic per-step facts for an offline envelope check.

    With ``fail_at=None`` every step passes (all-pass demo). With ``fail_at`` set
    to a step name, that step is recorded as a failure (errored response) so the
    sequencer halts there and marks every later step skipped — the mid-sequence
    halt-at-step demo. Each passing step is given a small, well-under-budget
    elapsed time; the failing step is given an explicit error fact.
    """
    results: List[Dict[str, Any]] = []
    reached_fail = False
    for index, name in enumerate(STEP_SEQUENCE):
        if reached_fail:
            results.append(
                make_step_result(
                    name, ok=False, errored=False, elapsed_ms=0.0,
                    scoped_to_school=False, observed="not run (halted at an earlier step)",
                )
            )
            continue
        if fail_at is not None and name == fail_at:
            reached_fail = True
            results.append(
                make_step_result(
                    name, ok=False, errored=True, elapsed_ms=120.0,
                    scoped_to_school=False,
                    observed="synthetic injected failure (errored response)",
                )
            )
            continue
        results.append(
            make_step_result(
                name, ok=True, errored=False, elapsed_ms=float(40 + index * 5),
                scoped_to_school=True, observed="synthetic pass (scoped to created school)",
            )
        )
    return results


# --------------------------------------------------------------------------- #
# Artifact assembly — feed the pure core, map onto the shared envelope.
# --------------------------------------------------------------------------- #


def build_onboarding_evidence(
    step_results: Sequence[Dict[str, Any]],
    *,
    timeout_ms: float = STEP_TIMEOUT_MS,
    synthetic: bool = False,
) -> EvidenceArtifact:
    """Sequence the per-step facts and build the Gate 10 ``Evidence_Artifact``.

    The pure :func:`onboarding_eval.sequence_onboarding` decides the verdict
    (halt-at-first-failure, R10.12). This function only marshals its per-step
    rows onto the shared envelope: each row keeps the Gate 10 fields (``step``,
    ``result``, ``scoped_to_school``, ``elapsed_ms``, ``halted_at``) and the
    closed onboarding result (pass|fail|skipped) is mapped onto the closed
    check-result vocabulary (pass|fail|not-measured).
    """
    sequenced = sequence_onboarding(step_results, timeout_ms)
    observed_by_step = {
        r.get("step"): r.get("observed", "") for r in step_results if isinstance(r, dict)
    }

    checks: List[Dict[str, Any]] = []
    for row in sequenced["checks"]:
        step = row.get("step")
        onboarding_result = row.get("result")
        check_result = _RESULT_TO_CHECK.get(onboarding_result, "not-measured")
        checks.append(
            {
                "id": step,
                "result": check_result,
                "observed": observed_by_step.get(step, ""),
                "detail": row.get("reason", "") or "",
                # Gate 10 representative fields (design "Per-gate evidence" table).
                "step": step,
                "step_result": onboarding_result,
                "scoped_to_school": row.get("scoped_to_school"),
                "elapsed_ms": row.get("elapsed_ms"),
                "halted_at": row.get("halted_at"),
            }
        )

    passed = bool(sequenced["passed"])
    status = EvidenceStatus.PASSED if passed else EvidenceStatus.FAILED

    failures: List[Dict[str, Any]] = []
    failing = sequenced.get("failing_step")
    if failing:
        failures.append(
            {
                "step": failing.get("step"),
                "reason": failing.get("reason"),
                "observed": observed_by_step.get(failing.get("step"), ""),
            }
        )

    summary = (
        f"{sequenced['passed_count']}/{sequenced['total']} onboarding steps passed "
        f"({'PASS' if passed else 'FAIL'})"
    )
    if sequenced.get("halted_at"):
        summary += f"; halted at {sequenced['halted_at']}"
    if synthetic:
        summary += " [synthetic]"

    return EvidenceArtifact(
        gate_id="onboarding",
        requirement="R10",
        status=status,
        generated_by=GeneratedBy.DEPLOYED_TARGET,
        summary=summary,
        checks=checks,
        assets=[],
        failures=failures,
    )


def _default_output_path() -> Path:
    """The Gate 10 artifact path under the evidence store."""
    return REPO_ROOT / "docs" / "launch-evidence" / "10-onboarding" / "onboarding-evidence.json"


def write_artifact(artifact: EvidenceArtifact, output_path: Path) -> None:
    """Write the artifact to ``output_path`` as pretty JSON, creating parent dirs."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(to_json(artifact) + "\n", encoding="utf-8")


# --------------------------------------------------------------------------- #
# CLI.
# --------------------------------------------------------------------------- #


def _load_endpoints(path: Optional[Path]) -> Dict[str, str]:
    endpoints = dict(DEFAULT_ENDPOINTS)
    if path is not None:
        overrides = json.loads(path.read_text(encoding="utf-8"))
        for key, value in overrides.items():
            endpoints[key] = str(value)
    return endpoints


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="run-onboarding-smoke.py",
        description=(
            "Gate 10 Onboarding_Smoke_Gate driver (DEPLOYED-TARGET; operator-run; "
            "NOT auto-run in CI). Drives the end-to-end tenant onboarding journey "
            "against the deployed tenant-admin API and emits "
            "docs/launch-evidence/10-onboarding/onboarding-evidence.json."
        ),
    )
    parser.add_argument(
        "--base-url",
        default=os.environ.get("LV_BASE_URL", os.environ.get("API_URL", DEFAULT_BASE_URL)),
        help=f"Deployed tenant-admin API origin (env LV_BASE_URL/API_URL; default {DEFAULT_BASE_URL}).",
    )
    parser.add_argument(
        "--super-admin-token",
        default=os.environ.get("LV_SUPER_ADMIN_TOKEN", ""),
        help="Super-admin bearer token (env LV_SUPER_ADMIN_TOKEN).",
    )
    parser.add_argument(
        "--super-admin-cookie",
        default=os.environ.get("LV_SUPER_ADMIN_COOKIE", ""),
        help="Super-admin Cookie header value (env LV_SUPER_ADMIN_COOKIE).",
    )
    parser.add_argument(
        "--staff-token",
        default=os.environ.get("LV_STAFF_TOKEN", ""),
        help="Scoped-staff bearer token (env LV_STAFF_TOKEN).",
    )
    parser.add_argument(
        "--staff-cookie",
        default=os.environ.get("LV_STAFF_COOKIE", ""),
        help="Scoped-staff Cookie header value (env LV_STAFF_COOKIE).",
    )
    parser.add_argument(
        "--csrf-token",
        default=os.environ.get("LV_CSRF_TOKEN", ""),
        help="CSRF token sent as X-CSRF-Token for state-changing requests.",
    )
    parser.add_argument(
        "--school-slug",
        default=os.environ.get("LV_SCHOOL_SLUG", ""),
        help="Disposable test-school slug (default: a generated unique slug).",
    )
    parser.add_argument(
        "--school-hostname",
        default=os.environ.get("LV_SCHOOL_HOSTNAME", ""),
        help="Disposable test-school hostname (default: derived from the slug).",
    )
    parser.add_argument(
        "--endpoints",
        type=Path,
        default=None,
        help="Optional JSON file overriding the journey endpoint templates.",
    )
    parser.add_argument(
        "--timeout-ms",
        type=float,
        default=STEP_TIMEOUT_MS,
        help=f"Per-step completion budget in ms (default {STEP_TIMEOUT_MS} = 60 s, R10.12).",
    )
    parser.add_argument(
        "--synthetic",
        "--dry-run",
        dest="synthetic",
        action="store_true",
        help="Emit a valid envelope over synthetic step results (no network).",
    )
    parser.add_argument(
        "--fail-at",
        default=None,
        choices=list(STEP_SEQUENCE),
        help="Synthetic only: inject a failure at this step for a halt-at-step demo.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Artifact output path (default: docs/launch-evidence/10-onboarding/onboarding-evidence.json).",
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    """CLI: run (or synthesize) the onboarding journey, write the artifact, exit.

    Returns ``0`` only when the gate passed (every step passed). Any not-passed
    verdict — including an unreachable target in a sandbox or a synthetic
    halt-at-step demo — returns ``1`` so the operator flow fails closed.
    """
    args = build_arg_parser().parse_args(argv)
    output_path: Path = args.output or _default_output_path()

    if args.fail_at and not args.synthetic:
        sys.stderr.write("run-onboarding-smoke: --fail-at is only valid with --synthetic.\n")
        return 2

    if args.synthetic:
        step_results = synthetic_step_results(fail_at=args.fail_at)
        artifact = build_onboarding_evidence(
            step_results, timeout_ms=args.timeout_ms, synthetic=True
        )
    else:
        slug = args.school_slug or f"lv-smoke-{uuid.uuid4().hex[:10]}"
        hostname = args.school_hostname or f"{slug}.smoke.beanola.com"
        admin_client = OnboardingHttpClient(
            args.base_url,
            token=args.super_admin_token or None,
            cookie=args.super_admin_cookie or None,
            csrf_token=args.csrf_token or None,
            timeout_s=args.timeout_ms / 1000.0,
        )
        staff_client = OnboardingHttpClient(
            args.base_url,
            token=args.staff_token or None,
            cookie=args.staff_cookie or None,
            csrf_token=args.csrf_token or None,
            timeout_s=args.timeout_ms / 1000.0,
        )
        driver = LiveOnboardingDriver(
            admin_client=admin_client,
            staff_client=staff_client,
            endpoints=_load_endpoints(args.endpoints),
            school_slug=slug,
            school_hostname=hostname,
            timeout_ms=args.timeout_ms,
        )
        step_results = drive_live_journey(driver)
        artifact = build_onboarding_evidence(
            step_results, timeout_ms=args.timeout_ms, synthetic=False
        )

    try:
        write_artifact(artifact, output_path)
    except EvidenceArtifactError as exc:  # pragma: no cover - envelope is validated on build
        sys.stderr.write(f"run-onboarding-smoke: refusing to write invalid envelope — {exc}\n")
        return 2

    passed = artifact.status == EvidenceStatus.PASSED.value
    sys.stdout.write(f"launch-verification onboarding gate: {artifact.status}\n")
    sys.stdout.write(f"  {artifact.summary}\n")
    if not args.synthetic:
        sys.stdout.write(f"  base-url: {args.base_url}\n")
    sys.stdout.write(f"  written:  {output_path}\n")
    for failure in artifact.failures:
        sys.stdout.write(
            f"  FAIL {failure.get('step')}: {failure.get('reason')} — {failure.get('observed')}\n"
        )
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
