"""Property-based tests for the migration-history report freshness engine (3.6).

Pure-function properties over ``apps.common.migration_history_report`` — no DB,
no env gating, no skips. They complement the example-based freshness tests in
``backend/tests/unit/test_migration_history_report_freshness.py``.

Properties:

* **Freshness completeness** — for any partition of a forward-script set into
  "recorded in the report" and "omitted", ``check_report_freshness`` flags
  exactly the June-2026+ omitted scripts and never a pre-June one.
* **June tagging round-trip** — ``build_report_from_manifest`` tags every row's
  ``june_2026_plus`` to agree with ``is_june_2026_or_later``.
* **Non-secret identity never leaks** — a ``host=... db=...`` identity built
  from ordinary hostname/db characters never trips the secret guardrail.

Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 3.6
Requirements: R1.5, R15.8
Findings: DATA-09, GOV-05
"""

from __future__ import annotations

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")

import django  # noqa: E402

django.setup()

from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.common.migration_history_report import (  # noqa: E402
    build_report_from_manifest,
    check_report_freshness,
    find_secret_leaks,
    is_june_2026_or_later,
)


# A migration filename with a YYYY_MM_DD date prefix spanning the June-2026
# boundary in both directions.
_dated_name = st.builds(
    lambda y, m, d, slug: f"{y}_{m:02d}_{d:02d}_{slug}.sql",
    st.integers(min_value=2025, max_value=2027),
    st.integers(min_value=1, max_value=12),
    st.integers(min_value=1, max_value=28),
    st.text(alphabet="abcdefghijklmnopqrstuvwxyz_", min_size=3, max_size=10),
)

_script_sets = st.lists(_dated_name, min_size=1, max_size=12, unique=True)


def _manifest(names):
    return {
        "meta": {
            "label": "prop",
            "environment_identity": "host=h db=d",
            "schema_fingerprint": "sha256:" + "a" * 64,
            "vendor": "postgresql",
        },
        "migrations": [
            {"migration_name": n, "checksum": "a" * 64, "applied_at": "2026-07-01T00:00:00+00:00"}
            for n in names
        ],
    }


@given(names=_script_sets, mask=st.data())
@settings(max_examples=150, deadline=None)
def test_freshness_flags_exactly_omitted_june_scripts(names, mask):
    """The report records a random subset; freshness flags exactly the
    June-2026+ scripts that are on disk but omitted from the report."""
    on_disk = sorted(set(names))
    included = [n for n in on_disk if mask.draw(st.booleans())]
    report = build_report_from_manifest(_manifest(included))

    findings = check_report_freshness(report, on_disk)
    flagged = {f.object for f in findings if f.category == "june_migration_missing_from_report"}

    expected = {n for n in on_disk if is_june_2026_or_later(n) and n not in included}
    assert flagged == expected
    # A pre-June omission is never flagged.
    assert not any(not is_june_2026_or_later(n) for n in flagged)


@given(names=_script_sets)
@settings(max_examples=100, deadline=None)
def test_build_report_tags_june_flag_consistently(names):
    report = build_report_from_manifest(_manifest(names))
    for row in report["migrations"]:
        assert row["june_2026_plus"] == is_june_2026_or_later(row["migration_name"])
    assert report["june_2026_plus_count"] == sum(
        1 for n in names if is_june_2026_or_later(n)
    )


@given(
    host=st.text(alphabet="abcdefghijklmnopqrstuvwxyz0123456789.-", min_size=1, max_size=40),
    db=st.text(alphabet="abcdefghijklmnopqrstuvwxyz0123456789_", min_size=1, max_size=30),
)
@settings(max_examples=100, deadline=None)
def test_non_secret_identity_never_leaks(host, db):
    report = build_report_from_manifest(
        {
            "meta": {
                "environment_identity": f"host={host} db={db}",
                "schema_fingerprint": "sha256:" + "a" * 64,
            },
            "migrations": [],
        }
    )
    assert find_secret_leaks(report) == []
