#!/usr/bin/env python3
"""Reconstruct the pre-10.5 state of exactly the files task 10.5 touched.

The worktree carries the whole admissions-v2 spec, so `git stash` cannot separate
this task's edits from other lanes' uncommitted work on the same files. Instead we
remove *this task's own inserted blocks* by exact string match, which is
deterministic and leaves every other lane's change in place.

  python3 /tmp/task105_baseline.py save     # snapshot the candidate
  python3 /tmp/task105_baseline.py baseline # produce the pre-10.5 state
  python3 /tmp/task105_baseline.py restore  # put the candidate back
"""
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path("/home/cosmas/Downloads/mihasv3")
SNAP = Path("/tmp/task105-candidate")

NEW_FILES = [
    "backend/apps/applications/tracking_secret.py",
    "backend/apps/applications/student_tracking_views.py",
    "backend/scripts/2026_08_09_01_application_tracking_secret.sql",
    "backend/scripts/2026_08_09_01_application_tracking_secret_rollback.sql",
]

MODIFIED = [
    "backend/apps/applications/models.py",
    "backend/apps/applications/public_views.py",
    "backend/apps/applications/serializers.py",
    "backend/apps/applications/urls.py",
    "backend/apps/common/throttling.py",
    "backend/apps/catalog/tenant_audit_service.py",
    "backend/config/settings/base.py",
    "backend/tests/unit/test_view_auth_classification.py",
    "scripts/authority_matrix_registry.py",
]

ALL = NEW_FILES + MODIFIED


def save():
    if SNAP.exists():
        shutil.rmtree(SNAP)
    for rel in ALL:
        dst = SNAP / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / rel, dst)
    print(f"saved {len(ALL)} files to {SNAP}")


def restore():
    for rel in ALL:
        src = SNAP / rel
        shutil.copy2(src, ROOT / rel)
    print(f"restored {len(ALL)} files")


def _cut(rel: str, needle: str, replacement: str = "") -> None:
    p = ROOT / rel
    text = p.read_text()
    if needle not in text:
        raise SystemExit(f"NOT FOUND in {rel}: {needle[:80]!r}")
    p.write_text(text.replace(needle, replacement, 1))


def baseline():
    for rel in NEW_FILES:
        (ROOT / rel).unlink(missing_ok=True)

    # public_views.py is byte-identical to HEAD before this task (checked).
    head = subprocess.run(
        ["git", "show", "HEAD:backend/apps/applications/public_views.py"],
        cwd=ROOT, capture_output=True, text=True, check=True,
    ).stdout
    (ROOT / "backend/apps/applications/public_views.py").write_text(head)

    # models.py — the four tracking columns
    _cut(
        "backend/apps/applications/models.py",
        """    # Public-tracking credential (admissions-v2 task 10.5, R13.12 / STU-22).
    # A split token: ``tracking_selector`` is the non-secret indexed lookup half,
    # ``tracking_secret_hash`` is the SHA-256 of the secret half. The plaintext is
    # returned to the owner once at issue time and is never stored, so a database
    # reader cannot track an application. Issuing a new link revokes the previous
    # one (``tracking_secret_revoked_at``); a revoked secret resolves to the same
    # masked 404 an unknown one does.
    #
    # All four are NULL on legacy rows, which means exactly "no tracking secret
    # issued yet" — ``application_number`` and ``public_tracking_code`` remain in
    # the table and keep every non-authority use they had, but neither is a
    # credential any more. See
    # backend/scripts/2026_08_09_01_application_tracking_secret.sql and
    # apps/applications/tracking_secret.py.
    tracking_selector = models.CharField(max_length=16, null=True, blank=True, unique=True)
    tracking_secret_hash = models.CharField(max_length=64, null=True, blank=True)
    tracking_secret_issued_at = models.DateTimeField(null=True, blank=True)
    tracking_secret_revoked_at = models.DateTimeField(null=True, blank=True)
""",
    )

    # serializers.py — the rewritten tracking serializer + the typing import
    sp = ROOT / "backend/apps/applications/serializers.py"
    text = sp.read_text()
    start = text.index("class ApplicationTrackingSerializer(serializers.ModelSerializer):")
    end = text.index("class ApplicationDraftSerializer(serializers.ModelSerializer):")
    original = '''class ApplicationTrackingSerializer(serializers.ModelSerializer):
    """Public tracking serializer - no auth required.

    Keep this response intentionally small: it is exposed to anyone who knows
    an application number or tracking code.
    """

    class Meta:
        model = Application
        fields = [
            "application_number", "public_tracking_code", "status",
            "program", "intake", "institution",
            "created_at", "submitted_at",
        ]


'''
    text = text[:start] + original + text[end:]
    text = text.replace("from datetime import date\nfrom typing import Optional\n",
                        "from datetime import date\n", 1)
    sp.write_text(text)

    # urls.py — the import and the route
    _cut("backend/apps/applications/urls.py",
         "\nfrom apps.applications.student_tracking_views import ApplicationTrackingLinkView")
    _cut("backend/apps/applications/urls.py",
         """
    # admissions-v2 task 10.5 (R13.12, STU-22): the owner issues their own public
    # tracking link. The secret is stored hashed, so this command is the only way
    # the plaintext ever exists — and issuing revokes the previous link.
    path(
        "<uuid:application_id>/tracking-link/",
        ApplicationTrackingLinkView.as_view(),
        name="application-tracking-link",
    ),""")

    # throttling.py — the import widening, __all__, and the appended class
    tp = ROOT / "backend/apps/common/throttling.py"
    text = tp.read_text()
    text = text.replace(
        "from rest_framework.throttling import ScopedRateThrottle, SimpleRateThrottle",
        "from rest_framework.throttling import ScopedRateThrottle", 1)
    text = text.replace(
        '''__all__ = [
    "PaymentUserScopedRateThrottle",
    "DocumentExtractUserScopedRateThrottle",
    "PublicTrackingFailureThrottle",
]''',
        '__all__ = ["PaymentUserScopedRateThrottle", "DocumentExtractUserScopedRateThrottle"]', 1)
    marker = "\n\nclass PublicTrackingFailureThrottle(SimpleRateThrottle):"
    text = text[: text.index(marker)] + "\n"
    tp.write_text(text)

    # tenant_audit_service.py — the two action constants and the two recorders
    ap = ROOT / "backend/apps/catalog/tenant_audit_service.py"
    text = ap.read_text()
    start = text.index("#: A public tracking lookup was answered (admissions-v2 task 10.5")
    end = text.index("#: Free-text reason/notes recorded on an Audit_Event are bounded")
    text = text[:start] + text[end:]
    start = text.index("    # ------------------------------------------------------------------\n    # Public tracking (R13.12, R17.2 — admissions-v2 task 10.5)")
    end = text.index("    # ------------------------------------------------------------------\n    # Access-scope denials (R13.1)")
    text = text[:start] + text[end:]
    ap.write_text(text)

    # base.py — the throttle rate and the gate
    _cut("backend/config/settings/base.py",
         """        # Public-tracker FAILED attempts per IP (admissions-v2 task 10.5,
        # R13.12 / STU-22). A holder of a valid tracking link never spends this
        # budget — only lookups that resolved nothing do — so it can be far
        # tighter than the coarse 20/10m request budget RateLimitMiddleware
        # already applies to the same path.
        "public_tracking_failure": "10/10m",
""")
    _cut("backend/config/settings/base.py",
         """
# ---------------------------------------------------------------------------
# Public-tracker failed-attempt gate (admissions-v2 task 10.5, R13.12 / STU-22)
# ---------------------------------------------------------------------------
# Defaults to **True**, unlike the two gates above. Those harden authenticated
# endpoints, so shipping them off and flipping them on is a rollout choice; this
# one is the boundary of an *unauthenticated* endpoint, so its absence must not
# be the same as its disablement. An operator can still turn it off explicitly.
PUBLIC_TRACKING_RATE_LIMITS = os.environ.get(
    "PUBLIC_TRACKING_RATE_LIMITS", "true"
).lower() in ("1", "true", "yes")""")

    # test_view_auth_classification.py — the one classification entry
    _cut("backend/tests/unit/test_view_auth_classification.py",
         """        # admissions-v2 task 10.5 (R13.12, STU-22): the owner issues their own
        # public tracking link. Owner-only with the shared 404 mask — the same
        # bucket as withdraw, and deliberately NOT staff-accessible, because
        # issuing revokes the applicant's live link.
        "apps.applications.student_tracking_views.ApplicationTrackingLinkView",
""")

    # authority_matrix_registry.py — restore the original track entry, drop the new one
    rp = ROOT / "scripts/authority_matrix_registry.py"
    text = rp.read_text()
    start = text.index('_register("/api/v1/applications/track/", public(')
    end = text.index("\n", text.index('_register("/api/v1/applications/<uuid:application_id>/tracking-link/"'))
    text = (
        text[:start]
        + '_register("/api/v1/applications/track/", public(auth="optional", finding="STU-22", tenant_object_path="trusted host tenant", disclosure="public", notes="Public tracking; STU-22 hardens to random tracking secret + host binding (10.5)."))'
        + text[end:]
    )
    text = text.replace(
        '_register("/api/v1/applications/track/", public(auth="optional", finding="STU-22", tenant_object_path="trusted host tenant", disclosure="public", notes="Public tracking; STU-22 hardens to random tracking secret + host binding (10.5)."))\n\n\n',
        '_register("/api/v1/applications/track/", public(auth="optional", finding="STU-22", tenant_object_path="trusted host tenant", disclosure="public", notes="Public tracking; STU-22 hardens to random tracking secret + host binding (10.5)."))\n',
        1,
    )
    rp.write_text(text)

    print("baseline state written")


if __name__ == "__main__":
    {"save": save, "baseline": baseline, "restore": restore}[sys.argv[1]]()
