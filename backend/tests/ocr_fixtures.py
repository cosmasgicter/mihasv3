"""Test helper: opt institutions in to OCR (platform-simplification task 18.1, D4).

OCR is off for every institution until the ``documents.ocr_enabled_institution_ids``
setting names it. Tests that exercise extraction itself opt their institution in
first, the same way an operator would through ``/api/v1/admin/documents/ocr-opt-in/``.
"""

from __future__ import annotations

from typing import Any

from django.utils import timezone


def opt_in_ocr(*institutions: Any) -> list[str]:
    """Add each institution (model or id) to the OCR opt-in list; return the list."""
    from apps.common.models import Setting
    from apps.documents.ocr_policy import (
        OCR_OPT_IN_SETTING_CATEGORY,
        OCR_OPT_IN_SETTING_KEY,
        opted_in_institution_ids,
    )

    ids = list(opted_in_institution_ids())
    for institution in institutions:
        value = str(getattr(institution, "id", institution))
        if value not in ids:
            ids.append(value)
    now = timezone.now()
    Setting.objects.update_or_create(
        key=OCR_OPT_IN_SETTING_KEY,
        defaults={
            "value": ids,
            "category": OCR_OPT_IN_SETTING_CATEGORY,
            "is_public": False,
            "updated_at": now,
            "created_at": now,
        },
    )
    return ids
