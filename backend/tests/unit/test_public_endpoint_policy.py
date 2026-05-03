"""Guardrails for unauthenticated API exposure."""

import ast
from pathlib import Path

from apps.common.public_endpoint_policy import PUBLIC_ENDPOINT_CATEGORIES, PUBLIC_ENDPOINT_CLASSIFICATIONS

BACKEND_ROOT = Path(__file__).resolve().parents[2]
APPS_ROOT = BACKEND_ROOT / "apps"

ALLOWED_CATEGORIES = {
    "health_meta_catalog_public_read",
    "auth_password_public_flow",
    "signed_webhook",
    "public_tracking_minimized",
    "error_reporting_capped_throttled",
}


def _module_path(path: Path) -> str:
    relative = path.relative_to(BACKEND_ROOT).with_suffix("")
    return ".".join(relative.parts)


def _uses_allow_any(node: ast.Assign) -> bool:
    for target in node.targets:
        if isinstance(target, ast.Name) and target.id == "permission_classes":
            return any(isinstance(elt, ast.Name) and elt.id == "AllowAny" for elt in getattr(node.value, "elts", []))
    return False


def _allow_any_view_classes() -> set[str]:
    classes: set[str] = set()
    for path in APPS_ROOT.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        module = _module_path(path)
        for node in ast.walk(tree):
            if not isinstance(node, ast.ClassDef):
                continue
            if any(isinstance(item, ast.Assign) and _uses_allow_any(item) for item in node.body):
                classes.add(f"{module}.{node.name}")
    return classes


def test_every_allow_any_view_has_public_endpoint_classification():
    assert _allow_any_view_classes() - set(PUBLIC_ENDPOINT_CLASSIFICATIONS) == set()


def test_public_endpoint_classifications_use_known_categories():
    assert set(PUBLIC_ENDPOINT_CATEGORIES) <= ALLOWED_CATEGORIES


def test_public_tracking_serializer_remains_privacy_minimized():
    from apps.applications.serializers import ApplicationTrackingSerializer

    fields = set(ApplicationTrackingSerializer.Meta.fields)
    assert fields == {
        "application_number",
        "public_tracking_code",
        "status",
        "program",
        "intake",
        "institution",
        "created_at",
        "submitted_at",
    }
    assert "payment_status" not in fields
    assert "email" not in fields
    assert "paid_amount" not in fields
