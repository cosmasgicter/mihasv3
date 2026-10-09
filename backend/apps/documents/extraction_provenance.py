"""Read-only reader for *historical* document-extraction provenance.

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/`` task **7.4**
Requirements: R11.1, R11.9 (remove admissions generative AI), R11.7 (structured
              evidence, no analysis overloaded into human verification notes)
Findings:     STU-06, MAINT-02
Design:       §9.1 ("Admissions V2 removes generative AI from student and
              reviewer workflows"), §18 risk register ("De-AI removal loses
              useful data → preserve historical extraction as labeled
              provenance").

Before task 7.4, ``extract_document_text_task`` wrote the output of a generative
document classifier into ``ApplicationDocument.verification_notes`` as
``{"ai_analysis": {...}}``. That call is gone, so **no new blob is ever written**
and every blob still in the column is, by construction, historical.

The task's instruction is to *preserve* that data as labeled read-only
provenance until a migration policy allows cleanup — so this module deliberately
only **reads**. It never writes, never rewrites, and never deletes a row, and it
never lets a historical value re-enter the application as authority: callers
surface it as provenance next to the human verification fields.

This is also the single reader for the shape. Six ``documents`` view modules each
carried a private copy of the same parser after the module split; the copies are
gone and this is the one implementation.
"""

from __future__ import annotations

import json
from typing import Any

#: Marks the provenance payload as historical, produced by the pre-7.4
#: generative classifier that no longer exists in the runtime.
HISTORICAL_SOURCE = "historical_ai_extraction"

__all__ = [
    "HISTORICAL_SOURCE",
    "historical_analysis",
    "provenance_payload",
]


def historical_analysis(verification_notes: str | None) -> dict[str, Any] | None:
    """Return the historical extraction blob stored in *verification_notes*.

    Returns ``None`` for the (now normal) case of a human-authored or empty
    note — a free-text reviewer note is not JSON and must never be reported as
    machine provenance.
    """
    if not verification_notes:
        return None
    try:
        data = json.loads(verification_notes)
    except (json.JSONDecodeError, TypeError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    analysis = data.get("ai_analysis")
    return analysis if isinstance(analysis, dict) else None


def provenance_payload(document) -> dict[str, Any] | None:
    """Labeled read-only provenance for *document*, or ``None`` when there is none.

    The label is the point: a consumer can tell at a glance that the values are
    a historical machine extraction with no current authority, rather than a
    verified fact or a fresh suggestion.
    """
    analysis = historical_analysis(getattr(document, "verification_notes", None))
    if analysis is None:
        return None
    return {
        "source": HISTORICAL_SOURCE,
        "read_only": True,
        "authoritative": False,
        "analysis": analysis,
    }
