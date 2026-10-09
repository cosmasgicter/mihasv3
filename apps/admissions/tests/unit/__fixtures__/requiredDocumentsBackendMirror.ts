/**
 * Mirror of `backend/apps/applications/required_documents.py` — the platform
 * upload policy the client mirrors for fallback and hint rendering.
 *
 * Admissions-v2 task 7.2 (R11.6/R11.7, finding STU-13). The backend module is the
 * authority; `requiredDocumentsDrift.test.ts` compares this fixture against
 * `src/lib/requiredDocuments.ts` so a policy change cannot land on one side only.
 *
 * GENERATED — regenerate with:
 *   cd backend && python scripts/dump_required_documents_policy.py \
 *     > ../apps/admissions/tests/unit/__fixtures__/requiredDocumentsBackendMirror.ts
 *
 * Do not hand-edit one side to make the test pass.
 */

export const BACKEND_PLATFORM_ACCEPTED_MIME_TYPES: readonly string[] = [
  "application/pdf",
  "image/jpeg",
  "image/png"
]

export const BACKEND_PLATFORM_MAX_UPLOAD_BYTES = 10485760

export const BACKEND_MIN_CONFIGURABLE_MAX_BYTES = 1024

export const BACKEND_MIME_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  "application/pdf": [
    ".pdf"
  ],
  "image/jpeg": [
    ".jpg",
    ".jpeg"
  ],
  "image/png": [
    ".png"
  ]
}

export const BACKEND_LEGACY_PLATFORM_DOCUMENT_TYPES: readonly string[] = [
  "nrc",
  "passport",
  "result_slip",
  "extra_kyc",
  "application_slip",
  "transcript",
  "certificate",
  "other"
]

export const BACKEND_PLATFORM_BASELINE_REQUIREMENTS: ReadonlyArray<{
  readonly documentType: string
  readonly label: string
  readonly required: boolean
  readonly acceptsDocumentTypes: readonly string[]
}> = [
  {
    "documentType": "result_slip",
    "label": "Grade 12 result slip",
    "required": true,
    "acceptsDocumentTypes": [
      "result_slip"
    ]
  },
  {
    "documentType": "extra_kyc",
    "label": "NRC or passport",
    "required": true,
    "acceptsDocumentTypes": [
      "nrc",
      "passport",
      "extra_kyc"
    ]
  }
]

/** Stable rejection codes the upload command returns. */
export const BACKEND_UPLOAD_REJECTION_CODES: readonly string[] = [
  "DOCUMENT_TYPE_NOT_REQUIRED",
  "EMPTY_FILE",
  "FILE_TOO_LARGE",
  "INVALID_FILE_TYPE",
  "UNSAFE_FILE_CONTENT"
]
