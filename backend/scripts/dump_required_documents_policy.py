"""Emit the required-document policy mirror consumed by the admissions frontend.

Admissions-v2 task **7.2** (R11.6/R11.7, finding STU-13).

``apps/applications/required_documents.py`` is the authority. The admissions app
keeps a read-only policy mirror at
``apps/admissions/tests/unit/__fixtures__/requiredDocumentsBackendMirror.ts`` so
``tests/unit/requiredDocumentsDrift.test.ts`` can fail when the platform
allowlist, the upload ceiling, the extension table, the baseline requirements, or
the stable rejection vocabulary change on one side only.

Usage (from ``backend/``)::

    python scripts/dump_required_documents_policy.py \
        > ../apps/admissions/tests/unit/__fixtures__/requiredDocumentsBackendMirror.ts

Never hand-edit the generated file to make the drift test pass.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

import django  # noqa: E402

django.setup()

from apps.applications import required_documents as contract  # noqa: E402

HEADER = '''/**
 * Mirror of `backend/apps/applications/required_documents.py` — the platform
 * upload policy the client mirrors for fallback and hint rendering.
 *
 * Admissions-v2 task 7.2 (R11.6/R11.7, finding STU-13). The backend module is the
 * authority; `requiredDocumentsDrift.test.ts` compares this fixture against
 * `src/lib/requiredDocuments.ts` so a policy change cannot land on one side only.
 *
 * GENERATED — regenerate with:
 *   cd backend && python scripts/dump_required_documents_policy.py \\
 *     > ../apps/admissions/tests/unit/__fixtures__/requiredDocumentsBackendMirror.ts
 *
 * Do not hand-edit one side to make the test pass.
 */
'''


def _camel(baseline: dict) -> dict:
    return {
        "documentType": baseline["document_type"],
        "label": baseline["label"],
        "required": bool(baseline["required"]),
        "acceptsDocumentTypes": list(baseline["accepts_document_types"]),
    }


def main() -> None:
    out = [HEADER]
    out.append(
        "export const BACKEND_PLATFORM_ACCEPTED_MIME_TYPES: readonly string[] = "
        + json.dumps(list(contract.PLATFORM_ACCEPTED_MIME_TYPES), indent=2)
        + "\n"
    )
    out.append(
        f"export const BACKEND_PLATFORM_MAX_UPLOAD_BYTES = {contract.PLATFORM_MAX_UPLOAD_BYTES}\n"
    )
    out.append(
        f"export const BACKEND_MIN_CONFIGURABLE_MAX_BYTES = {contract.MIN_CONFIGURABLE_MAX_BYTES}\n"
    )
    out.append(
        "export const BACKEND_MIME_EXTENSIONS: Readonly<Record<string, readonly string[]>> = "
        + json.dumps(
            {mime: list(extensions) for mime, extensions in contract.MIME_EXTENSIONS.items()},
            indent=2,
        )
        + "\n"
    )
    out.append(
        "export const BACKEND_LEGACY_PLATFORM_DOCUMENT_TYPES: readonly string[] = "
        + json.dumps(list(contract.LEGACY_PLATFORM_DOCUMENT_TYPES), indent=2)
        + "\n"
    )
    out.append(
        "export const BACKEND_PLATFORM_BASELINE_REQUIREMENTS: ReadonlyArray<{\n"
        "  readonly documentType: string\n"
        "  readonly label: string\n"
        "  readonly required: boolean\n"
        "  readonly acceptsDocumentTypes: readonly string[]\n"
        "}> = "
        + json.dumps([_camel(row) for row in contract.PLATFORM_BASELINE_REQUIREMENTS], indent=2)
        + "\n"
    )
    out.append(
        "/** Stable rejection codes the upload command returns. */\n"
        "export const BACKEND_UPLOAD_REJECTION_CODES: readonly string[] = "
        + json.dumps(list(contract.UPLOAD_REJECTION_CODES), indent=2)
        + "\n"
    )
    sys.stdout.write("\n".join(out))


if __name__ == "__main__":
    main()
