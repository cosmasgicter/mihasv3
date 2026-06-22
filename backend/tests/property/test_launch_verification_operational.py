"""Property-based test for the Gate 9 operational-readiness settings check.

# Feature: beanola-launch-verification, Property 15: The operational-readiness settings check passes iff every required setting satisfies its rule

This property targets the **pure decision core** of Gate 9 —
Operational_Readiness_Gate, in ``scripts/launch-verification/operational_eval.py``.
That module performs no I/O: it imports no Django, reads no environment, opens
no files, and makes no network calls. It only turns already-derived
configuration *facts* (a ``DEBUG`` value, a secret-key length + ``is_example``
flag, present/absent flags for the transport/origin settings, an HSTS max-age,
an endpoint->limit map, audit day-counts, backup RTO/RPO, an asset-upload
rejection outcome, and a break-glass-doc-present flag) into a pass/fail verdict.
So the predicate is a deterministic function of its inputs and can be
property-tested with no database and no Django at all.

Property 15: *For any* independently varied facts dict,
:func:`evaluate_operational` reports ``passed`` (status ``"passed"``) **iff
every** individual rule holds at once:

* ``DEBUG`` is the boolean ``False`` (:func:`debug_off`);
* the secret key is ``>= 50`` chars **and** not an example (:func:`secret_key_ok`);
* every R9.2 transport/origin setting is present/non-empty (:func:`is_present`);
* HSTS max-age is ``>= 31536000`` seconds (:func:`hsts_ok`);
* the per-user rate-limit map is non-empty and every limit ``> 0``
  (:func:`rate_limits_ok`);
* audit retention is exactly ``90`` / ``365`` days (:func:`audit_retention_ok`);
* the backup drill RTO ``<= 60`` min **and** RPO row-variance ``== 0``
  (:func:`backup_drill_ok`);
* tenant asset-upload validation rejects disallowed uploads;
* a super-admin break-glass doc is present.

The test also cross-checks that ``failed_settings`` names exactly the failing
settings (R9.9), and that **no credential value ever appears** in the emitted
evidence — every recorded string is a setting *name*, a check id, a closed-enum
``result``, an endpoint *name*, or a gate-envelope token, never a value
(R9.4, R9.9).
**Validates: Requirements 9.1, 9.2, 9.3, 9.5, 9.7**

Backend property-test conventions (spec ``beanola-launch-verification``):
``pytest`` + ``hypothesis``, >= 100 examples per property, tagged with the
Feature/Property marker above. The module under test is pure standard library,
so these run without a database and can also be driven directly via the
``__main__`` runner at the bottom of this file (the repo's pytest conftest pulls
in Postgres-backed Django fixtures that are unavailable in some sandboxes).
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from hypothesis import given, settings as hypothesis_settings
from hypothesis import strategies as st

# ---------------------------------------------------------------------------
# Import the operational predicate from
# scripts/launch-verification/operational_eval.py.
#
# operational_eval.py lives at the repo root (outside the ``backend`` import
# package) and is pure stdlib, so loading it by file path is sufficient. We
# register the module in sys.modules before exec so ``from __future__ import
# annotations`` (stringized annotations) can resolve the module by name if
# needed.
# ---------------------------------------------------------------------------

# test file = backend/tests/property/test_...py
#   parents[0]=property [1]=tests [2]=backend [3]=<repo root>
_REPO_ROOT = Path(__file__).resolve().parents[3]
_OPERATIONAL_PATH = (
    _REPO_ROOT / "scripts" / "launch-verification" / "operational_eval.py"
)


def _load_operational_eval():
    spec = importlib.util.spec_from_file_location(
        "launch_verification_operational_eval", _OPERATIONAL_PATH
    )
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader, (
        f"cannot load operational_eval module from {_OPERATIONAL_PATH}"
    )
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


_op = _load_operational_eval()

is_present = _op.is_present
debug_off = _op.debug_off
secret_key_ok = _op.secret_key_ok
hsts_ok = _op.hsts_ok
rate_limits_ok = _op.rate_limits_ok
audit_retention_ok = _op.audit_retention_ok
backup_drill_ok = _op.backup_drill_ok
evaluate_operational = _op.evaluate_operational

PASS = _op.PASS
FAIL = _op.FAIL
STATUS_PASSED = _op.STATUS_PASSED
STATUS_FAILED = _op.STATUS_FAILED
GATE_ID = _op.GATE_ID
REQUIREMENT = _op.REQUIREMENT
HSTS_MIN_SECONDS = _op.HSTS_MIN_SECONDS
SECRET_KEY_MIN_LEN = _op.SECRET_KEY_MIN_LEN
AUDIT_STANDARD_DAYS = _op.AUDIT_STANDARD_DAYS
AUDIT_SECURITY_DAYS = _op.AUDIT_SECURITY_DAYS
RTO_MAX_MINUTES = _op.RTO_MAX_MINUTES
RPO_MAX_ROW_VARIANCE = _op.RPO_MAX_ROW_VARIANCE
PRESENCE_SETTINGS = _op.PRESENCE_SETTINGS

# Run a meaningful campaign: >= 100 examples per property.
PBT_SETTINGS = hypothesis_settings(max_examples=200, deadline=None)

# ---------------------------------------------------------------------------
# Strategies — each setting is varied *independently*, spanning passing and
# failing values, so the conjunction "passes iff every rule holds" is exercised
# across the whole space (mostly-failing, mostly-passing, and all-passing).
# ---------------------------------------------------------------------------

# DEBUG: only the boolean ``False`` passes. Include truthy + ambiguous-falsy.
_DEBUG_VALUES = st.sampled_from([False, True, 0, 1, "", None, "false"])

# Secret-key length: span below and above the 50-char minimum (plus None).
_SECRET_KEY_LEN = st.one_of(st.integers(min_value=0, max_value=80), st.none())

# Presence facts: booleans plus a spread of empty/non-empty values so the
# is_present() logic is exercised, not just pre-computed booleans.
_PRESENCE_VALUE = st.one_of(
    st.booleans(),
    st.sampled_from(["", "   ", "configured", [], ["x"], {}, {"a": 1}, None, 0, 1]),
)

# HSTS max-age: span below and above the one-year minimum (plus None / bad).
_HSTS_VALUE = st.one_of(
    st.integers(min_value=0, max_value=2 * HSTS_MIN_SECONDS),
    st.sampled_from([None, HSTS_MIN_SECONDS - 1, HSTS_MIN_SECONDS]),
)

# Rate-limit endpoint name pool (names are *not* secret and may be echoed in
# failing_endpoints). Keeping a fixed pool lets the no-leak whitelist stay
# exact.
_RATE_ENDPOINTS = [
    "payment_initiate",
    "payment_mobile_money",
    "payment_verify",
    "auth_login",
    "auth_refresh",
    "ai_admin_summary",
    "ai_student_preview",
    "ai_document_extract",
]
# Limits: include values <= 0 (failing) and > 0 (passing), plus bad types.
_RATE_LIMIT_VALUE = st.one_of(
    st.integers(min_value=-5, max_value=120),
    st.sampled_from([0, -1, 30, 60, True, None, "60"]),
)
_RATE_LIMITS = st.one_of(
    st.dictionaries(
        keys=st.sampled_from(_RATE_ENDPOINTS),
        values=_RATE_LIMIT_VALUE,
        max_size=len(_RATE_ENDPOINTS),
    ),
    st.none(),  # nothing configured -> fails
)

# Audit retention: include the exact 90/365 plus wrong values.
_AUDIT_STD = st.sampled_from([90, 0, 30, 89, 91, 365, None])
_AUDIT_SEC = st.sampled_from([365, 0, 90, 180, 364, 366, None])

# Backup drill RTO (include > 60 and negative) and RPO (include != 0).
_BACKUP_RTO = st.one_of(
    st.integers(min_value=-10, max_value=120),
    st.sampled_from([0, 60, 61, -1, None]),
)
_BACKUP_RPO = st.sampled_from([0, 1, -1, 5, None])

# Asset-upload rejection outcome + break-glass presence.
_ASSET_UPLOAD = st.one_of(st.booleans(), st.sampled_from([None, 0, 1, ""]))
_BREAK_GLASS = st.one_of(st.booleans(), st.sampled_from([None, 0, 1, "", "doc"]))


@st.composite
def operational_facts(draw):
    """Generate a facts dict with every setting varied independently."""
    return {
        "debug": draw(_DEBUG_VALUES),
        "secret_key_len": draw(_SECRET_KEY_LEN),
        "secret_key_is_example": draw(st.booleans()),
        "secure_cookies": draw(_PRESENCE_VALUE),
        "trusted_origins": draw(_PRESENCE_VALUE),
        "cors_allowed_hosts": draw(_PRESENCE_VALUE),
        "csrf_allowed_hosts": draw(_PRESENCE_VALUE),
        "https_redirect": draw(_PRESENCE_VALUE),
        "csp": draw(_PRESENCE_VALUE),
        "hsts_max_age": draw(_HSTS_VALUE),
        "rate_limits": draw(_RATE_LIMITS),
        "audit_standard_days": draw(_AUDIT_STD),
        "audit_security_days": draw(_AUDIT_SEC),
        "backup_rto_minutes": draw(_BACKUP_RTO),
        "backup_rpo_row_variance": draw(_BACKUP_RPO),
        "asset_upload_rejects_disallowed": draw(_ASSET_UPLOAD),
        "break_glass_doc_present": draw(_BREAK_GLASS),
    }


# Map each emitted setting name -> the predicate that decides its pass, as a
# function of the facts dict. This is the single source of truth the rollup is
# checked against.
def _expected_setting_results(facts):
    rl_ok, _ = rate_limits_ok(facts.get("rate_limits"))
    return [
        ("DEBUG", debug_off(facts.get("debug"))),
        (
            "SECRET_KEY",
            secret_key_ok(
                facts.get("secret_key_len"),
                facts.get("secret_key_is_example", True),
            ),
        ),
        ("SECURE_COOKIES", is_present(facts.get("secure_cookies"))),
        ("CSRF_TRUSTED_ORIGINS", is_present(facts.get("trusted_origins"))),
        ("CORS_ALLOWED_ORIGINS", is_present(facts.get("cors_allowed_hosts"))),
        ("CSRF_ALLOWED_HOSTS", is_present(facts.get("csrf_allowed_hosts"))),
        ("SECURE_SSL_REDIRECT", is_present(facts.get("https_redirect"))),
        ("CONTENT_SECURITY_POLICY", is_present(facts.get("csp"))),
        ("SECURE_HSTS_SECONDS", hsts_ok(facts.get("hsts_max_age"))),
        ("PER_USER_RATE_LIMITS", rl_ok),
        (
            "AUDIT_RETENTION_DAYS",
            audit_retention_ok(
                facts.get("audit_standard_days"),
                facts.get("audit_security_days"),
            ),
        ),
        (
            "BACKUP_RESTORE_DRILL",
            backup_drill_ok(
                facts.get("backup_rto_minutes"),
                facts.get("backup_rpo_row_variance"),
            ),
        ),
        (
            "TENANT_ASSET_UPLOAD_VALIDATION",
            bool(facts.get("asset_upload_rejects_disallowed")),
        ),
        (
            "SUPER_ADMIN_BREAK_GLASS_DOC",
            is_present(facts.get("break_glass_doc_present")),
        ),
    ]


# The complete whitelist of strings allowed to appear anywhere in the emitted
# evidence. Anything outside this set would be a credential value leak.
_ALLOWED_CHECK_IDS = {
    "operational:debug",
    "operational:secret_key",
    "operational:secure_cookies",
    "operational:trusted_origins",
    "operational:cors_allowed_hosts",
    "operational:csrf_allowed_hosts",
    "operational:https_redirect",
    "operational:csp",
    "operational:hsts",
    "operational:rate_limits",
    "operational:audit_retention",
    "operational:backup_drill",
    "operational:asset_upload_validation",
    "operational:break_glass_doc",
}
_ALLOWED_SETTING_NAMES = {name for name, _ in _expected_setting_results({})}
_ALLOWED_ENVELOPE = {GATE_ID, REQUIREMENT, STATUS_PASSED, STATUS_FAILED, PASS, FAIL}
_ALLOWED_STRINGS = (
    _ALLOWED_CHECK_IDS
    | _ALLOWED_SETTING_NAMES
    | _ALLOWED_ENVELOPE
    | set(_RATE_ENDPOINTS)
)


def _collect_strings(value):
    """Recursively collect every string *value* appearing in a result structure.

    Dict *keys* are the module's own fixed schema field names (``gate_id``,
    ``setting``, ``result``, indicator labels, ...) — they are defined by the
    evaluator, never derived from caller input, so they are skipped. The leak
    concern is exclusively about emitted *values*.
    """
    found = []
    if isinstance(value, str):
        found.append(value)
    elif isinstance(value, dict):
        for v in value.values():
            found.extend(_collect_strings(v))
    elif isinstance(value, (list, tuple, set)):
        for item in value:
            found.extend(_collect_strings(item))
    return found


class TestProperty15OperationalSettingsCheck:
    """Feature: beanola-launch-verification, Property 15: The operational-readiness settings check passes iff every required setting satisfies its rule."""

    @PBT_SETTINGS
    @given(facts=operational_facts())
    def test_passes_iff_every_rule_holds(self, facts) -> None:
        """evaluate_operational passes iff EVERY individual setting rule holds."""
        expected = _expected_setting_results(facts)
        expected_pass = all(passed for _, passed in expected)

        result = evaluate_operational(facts)

        # Conservative rollup: passed iff every rule holds.
        assert result["passed"] is expected_pass
        assert result["status"] == (STATUS_PASSED if expected_pass else STATUS_FAILED)
        assert result["gate_id"] == GATE_ID
        assert result["requirement"] == REQUIREMENT

        # Every check row's result agrees with its predicate, in order.
        assert len(result["checks"]) == len(expected)
        for row, (name, passed) in zip(result["checks"], expected):
            assert row["setting"] == name
            assert row["result"] == (PASS if passed else FAIL)

        # failed_settings names exactly the failing settings, in order, by name
        # and never a value (R9.9).
        expected_failed_settings = [name for name, passed in expected if not passed]
        assert result["failed_settings"] == expected_failed_settings
        # failed (check ids) lines up one-for-one with failed_settings.
        assert len(result["failed"]) == len(expected_failed_settings)

    @PBT_SETTINGS
    @given(facts=operational_facts())
    def test_no_credential_value_ever_appears(self, facts) -> None:
        """Only names + present/derived indicators are emitted — never a value."""
        result = evaluate_operational(facts)

        # Every string anywhere in the evidence must be a known name / id /
        # closed-enum token / endpoint name. A credential value would not be in
        # the whitelist.
        for text in _collect_strings(result):
            assert text in _ALLOWED_STRINGS, f"unexpected string in evidence: {text!r}"

        # Every check row carries only a name + non-secret derived indicators:
        # the indicator values are booleans, ints, or lists of (name) strings.
        for row in result["checks"]:
            assert isinstance(row["id"], str)
            assert isinstance(row["setting"], str)
            assert row["result"] in (PASS, FAIL)
            for key, val in row.items():
                if key in ("id", "setting", "result"):
                    continue
                assert isinstance(val, (bool, int, list)), (
                    f"indicator {key!r} has non-derived type: {type(val)}"
                )
                if isinstance(val, list):
                    assert all(isinstance(x, str) for x in val)


class TestProperty15IndividualRules:
    """Per-rule predicates pinned to a hand-written truth (supports Property 15)."""

    @PBT_SETTINGS
    @given(value=_DEBUG_VALUES)
    def test_debug_off_iff_boolean_false(self, value) -> None:
        assert debug_off(value) == (value is False)

    @PBT_SETTINGS
    @given(
        length=st.one_of(st.integers(min_value=0, max_value=120), st.none()),
        is_example=st.booleans(),
    )
    def test_secret_key_ok_iff_long_and_not_example(self, length, is_example) -> None:
        expected = (
            isinstance(length, int)
            and length >= SECRET_KEY_MIN_LEN
            and not is_example
        )
        assert secret_key_ok(length, is_example) == expected

    @PBT_SETTINGS
    @given(max_age=st.one_of(st.integers(min_value=0, max_value=2 * HSTS_MIN_SECONDS), st.none()))
    def test_hsts_ok_iff_at_least_min(self, max_age) -> None:
        expected = isinstance(max_age, int) and max_age >= HSTS_MIN_SECONDS
        assert hsts_ok(max_age) == expected

    @PBT_SETTINGS
    @given(rate_limits=_RATE_LIMITS)
    def test_rate_limits_ok_iff_nonempty_and_all_positive(self, rate_limits) -> None:
        passed, failing = rate_limits_ok(rate_limits)
        if not isinstance(rate_limits, dict) or len(rate_limits) == 0:
            assert passed is False
            assert failing == []
        else:
            def _bad(limit):
                return (
                    isinstance(limit, bool)
                    or not isinstance(limit, (int, float))
                    or limit <= 0
                )

            expected_failing = [k for k, v in rate_limits.items() if _bad(v)]
            assert passed == (len(expected_failing) == 0)
            assert sorted(failing) == sorted(expected_failing)

    @PBT_SETTINGS
    @given(standard=_AUDIT_STD, security=_AUDIT_SEC)
    def test_audit_retention_ok_iff_exactly_90_365(self, standard, security) -> None:
        expected = standard == AUDIT_STANDARD_DAYS and security == AUDIT_SECURITY_DAYS
        assert audit_retention_ok(standard, security) == bool(expected)

    @PBT_SETTINGS
    @given(rto=_BACKUP_RTO, rpo=_BACKUP_RPO)
    def test_backup_drill_ok_iff_rto_and_rpo(self, rto, rpo) -> None:
        expected = (
            isinstance(rto, int)
            and not isinstance(rto, bool)
            and rto >= 0
            and rto <= RTO_MAX_MINUTES
            and isinstance(rpo, int)
            and not isinstance(rpo, bool)
            and rpo == RPO_MAX_ROW_VARIANCE
        )
        assert backup_drill_ok(rto, rpo) == bool(expected)


# ---------------------------------------------------------------------------
# Standalone runner — drives the hypothesis campaigns without pytest collection
# (the repo conftest pulls in Postgres-backed Django fixtures unavailable in
# some sandboxes). Each @given function runs its full campaign when called with
# no arguments.
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    rollup = TestProperty15OperationalSettingsCheck()
    rules = TestProperty15IndividualRules()
    campaigns = [
        ("passes_iff_every_rule_holds", rollup.test_passes_iff_every_rule_holds),
        ("no_credential_value_ever_appears", rollup.test_no_credential_value_ever_appears),
        ("debug_off_iff_boolean_false", rules.test_debug_off_iff_boolean_false),
        ("secret_key_ok_iff_long_and_not_example", rules.test_secret_key_ok_iff_long_and_not_example),
        ("hsts_ok_iff_at_least_min", rules.test_hsts_ok_iff_at_least_min),
        ("rate_limits_ok_iff_nonempty_and_all_positive", rules.test_rate_limits_ok_iff_nonempty_and_all_positive),
        ("audit_retention_ok_iff_exactly_90_365", rules.test_audit_retention_ok_iff_exactly_90_365),
        ("backup_drill_ok_iff_rto_and_rpo", rules.test_backup_drill_ok_iff_rto_and_rpo),
    ]
    for name, fn in campaigns:
        fn()
        print(f"PASS  {name}  (>=200 examples)")
    print("\nAll Property 15 campaigns passed.")
