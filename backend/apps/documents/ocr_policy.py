"""Which institutions have opted in to OCR grade assistance (decision D4, option B).

platform-simplification task 18.1 (Requirements 11.2, 11.4). Server-side
Tesseract extraction stays assistive (Requirement 11.5); this module only decides
*where* it may run.

The opt-in is one ``settings`` row (:class:`apps.common.models.Setting`):

* key ``documents.ocr_enabled_institution_ids``, category ``documents``,
  ``is_public`` false;
* value: a JSON array of institution UUID strings.

A missing row means an empty list, so OCR is off everywhere. That is the default
("freeze"). A malformed value (not a list, or an entry that is not a UUID) is
treated as empty and logs one WARNING per process naming the key, never the value.

The row is written only by the dedicated opt-in command
(:mod:`apps.documents.ocr_opt_in_views`); the generic admin settings endpoints
neither list, return nor write it (:data:`OCR_OPT_IN_SETTING_KEY` is in
:data:`MANAGED_ELSEWHERE_SETTING_KEYS`).
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Optional

logger = logging.getLogger(__name__)

OCR_OPT_IN_SETTING_KEY = "documents.ocr_enabled_institution_ids"
OCR_OPT_IN_SETTING_CATEGORY = "documents"
OCR_OPT_IN_SETTING_DESCRIPTION = (
    "Institutions whose students get OCR grade suggestions after uploading a result "
    "slip (decision D4). Changed only through /api/v1/admin/documents/ocr-opt-in/."
)

#: Setting keys the generic ``/api/v1/admin/settings/`` endpoints must not list,
#: return, write, import or reset, because a dedicated command owns them.
MANAGED_ELSEWHERE_SETTING_KEYS: frozenset[str] = frozenset({OCR_OPT_IN_SETTING_KEY})

#: Stable error code: the extract endpoint was called for a document whose
#: institution has not opted in (409).
OCR_NOT_ENABLED = "OCR_NOT_ENABLED"
OCR_NOT_ENABLED_MESSAGE = (
    "Automatic grade reading is not turned on for this school. Enter your grades by hand."
)

_warned_malformed = False


def _warn_malformed_once() -> None:
    global _warned_malformed
    if not _warned_malformed:
        _warned_malformed = True
        logger.warning(
            "Setting %s has a malformed value; OCR is treated as off for every institution",
            OCR_OPT_IN_SETTING_KEY,
        )


def normalise_institution_ids(value: Any) -> Optional[list[str]]:
    """Return the value as a list of canonical UUID strings, or ``None`` if malformed."""
    if not isinstance(value, list):
        return None
    result: list[str] = []
    for entry in value:
        if not isinstance(entry, str):
            return None
        try:
            result.append(str(uuid.UUID(entry)))
        except (ValueError, AttributeError):
            return None
    return result


def opted_in_institution_ids() -> list[str]:
    """The opted-in institution ids, in stored order. Empty when unset or malformed."""
    from apps.common.models import Setting

    row = Setting.objects.filter(key=OCR_OPT_IN_SETTING_KEY).only("value").first()
    if row is None:
        return []
    ids = normalise_institution_ids(row.value)
    if ids is None:
        _warn_malformed_once()
        return []
    return ids


def is_ocr_enabled_for_institution(institution_id: Any) -> bool:
    """True only when ``institution_id`` is a UUID in the opt-in list."""
    if institution_id is None or institution_id == "":
        return False
    try:
        wanted = str(uuid.UUID(str(institution_id)))
    except (ValueError, AttributeError):
        return False
    return wanted in opted_in_institution_ids()


def is_ocr_enabled_for_application(application: Any) -> bool:
    """True when the application's canonical institution has opted in.

    A legacy snapshot-only row (no ``institution_id``) counts as not opted in.
    """
    if application is None:
        return False
    return is_ocr_enabled_for_institution(getattr(application, "institution_ref_id", None))
