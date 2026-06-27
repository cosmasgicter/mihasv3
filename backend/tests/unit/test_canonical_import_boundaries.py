"""Import-boundary guards for canonical split modules."""

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_runtime_url_modules_do_not_import_view_reexport_shims():
    """Production URL routing must point at canonical split view modules."""

    checked_files = [
        REPO_ROOT / "backend/apps/applications/urls.py",
        REPO_ROOT / "backend/apps/documents/urls.py",
    ]
    deprecated_imports = (
        "from apps.applications.views import",
        "import apps.applications.views",
        "from apps.documents.views import",
        "import apps.documents.views",
    )

    violations: list[str] = []
    for path in checked_files:
        text = path.read_text(encoding="utf-8")
        for line_number, line in enumerate(text.splitlines(), start=1):
            if any(deprecated in line for deprecated in deprecated_imports):
                rel = path.relative_to(REPO_ROOT).as_posix()
                violations.append(f"{rel}:{line_number}: {line.strip()}")

    assert violations == []


def test_remaining_view_reexport_shims_have_owner_and_removal_condition():
    """Compatibility shims must be intentional and removable."""

    shim_files = [
        REPO_ROOT / "backend/apps/accounts/admin_views.py",
        REPO_ROOT / "backend/apps/applications/views.py",
        REPO_ROOT / "backend/apps/documents/views.py",
    ]

    violations: list[str] = []
    for path in shim_files:
        text = path.read_text(encoding="utf-8")
        rel = path.relative_to(REPO_ROOT).as_posix()
        if "COMPATIBILITY_OWNER" not in text:
            violations.append(f"{rel}: missing COMPATIBILITY_OWNER")
        if "REMOVAL_CONDITION" not in text:
            violations.append(f"{rel}: missing REMOVAL_CONDITION")
        if "canonical-multi-tenant-alignment task 29" not in text:
            violations.append(f"{rel}: missing task 29 tracking reference")

    assert violations == []
