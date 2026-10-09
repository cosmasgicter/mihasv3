/**
 * Frontend ↔ backend drift guard for the required-document upload policy.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` — task **7.2**.
 * Requirements: R11.6, R11.7
 * Findings:     STU-13
 *
 * `backend/apps/applications/required_documents.py` is the authority (registered
 * in `docs/canonical-truth-map.md`). The client keeps a *policy mirror* in
 * `src/lib/requiredDocuments.ts` for two jobs only:
 *
 * * clamping a server row so a payload can never widen the platform limits, and
 * * rendering an `accept` attribute / constraint hint when the server omits an
 *   optional constraint field.
 *
 * Neither job invents a requirement — the requirement list always comes from the
 * contract. But if the platform allowlist, the ceiling, or the extension table
 * drifted on one side only, the client would either refuse a file the server
 * accepts or advertise a type the server refuses. This guard fails on any such
 * divergence.
 *
 * Regenerate the fixture with the snippet in `docs/v2-evidence/7.2/README.md`.
 *
 * Validates: Requirements R11.6, R11.7
 */
import { describe, expect, it } from 'vitest'

import {
  MIME_EXTENSIONS,
  PLATFORM_ACCEPTED_MIME_TYPES,
  PLATFORM_MAX_UPLOAD_BYTES,
  UPLOAD_REJECTION_CODES,
  parseRequiredDocumentsContract,
  validateFileForRequirement,
} from '@/lib/requiredDocuments'

import {
  BACKEND_LEGACY_PLATFORM_DOCUMENT_TYPES,
  BACKEND_MIME_EXTENSIONS,
  BACKEND_PLATFORM_ACCEPTED_MIME_TYPES,
  BACKEND_PLATFORM_BASELINE_REQUIREMENTS,
  BACKEND_PLATFORM_MAX_UPLOAD_BYTES,
  BACKEND_UPLOAD_REJECTION_CODES,
} from './__fixtures__/requiredDocumentsBackendMirror'

describe('required-document policy drift guard', () => {
  it('mirrors the backend platform MIME allowlist exactly, in order', () => {
    expect([...PLATFORM_ACCEPTED_MIME_TYPES]).toEqual([...BACKEND_PLATFORM_ACCEPTED_MIME_TYPES])
  })

  it('mirrors the backend platform upload ceiling', () => {
    expect(PLATFORM_MAX_UPLOAD_BYTES).toBe(BACKEND_PLATFORM_MAX_UPLOAD_BYTES)
  })

  it('mirrors the backend MIME → extension table', () => {
    expect(MIME_EXTENSIONS).toEqual(BACKEND_MIME_EXTENSIONS)
    // Every advertised MIME type must have at least one extension, or the
    // `accept` attribute for that type would be empty and the control unusable.
    for (const mime of BACKEND_PLATFORM_ACCEPTED_MIME_TYPES) {
      expect((MIME_EXTENSIONS[mime] ?? []).length).toBeGreaterThan(0)
    }
  })

  it('publishes exactly the stable rejection codes the server can return', () => {
    // The client may reject locally only with a code the server also uses, so a
    // client-side refusal is never a code the operator has never seen.
    expect([...UPLOAD_REJECTION_CODES].sort()).toEqual([...BACKEND_UPLOAD_REJECTION_CODES].sort())
  })

  it('agrees with the backend baseline on the identity requirement aliases', () => {
    // The baseline `extra_kyc` row accepts an `nrc`/`passport` already on file.
    // The client must not narrow that, or a student with an NRC on record would
    // be shown an unsatisfied requirement the server considers satisfied.
    const identity = BACKEND_PLATFORM_BASELINE_REQUIREMENTS.find(
      (row) => row.documentType === 'extra_kyc',
    )
    expect(identity).toBeTruthy()
    const contract = parseRequiredDocumentsContract({
      success: true,
      data: {
        application_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        requirements: [
          {
            document_type: identity!.documentType,
            label: identity!.label,
            required: identity!.required,
            source: 'platform',
            accepts_document_types: identity!.acceptsDocumentTypes,
            state: 'missing',
          },
        ],
      },
    })
    expect(contract.requirements[0]!.acceptsDocumentTypes).toEqual([
      ...identity!.acceptsDocumentTypes,
    ])
  })

  it('accepts every platform document type the backend still serves', () => {
    // A legacy platform type must survive a contract round-trip untouched: the
    // client has no allowlist of its own to drop it against.
    const contract = parseRequiredDocumentsContract({
      success: true,
      data: {
        application_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        requirements: BACKEND_LEGACY_PLATFORM_DOCUMENT_TYPES.map((documentType) => ({
          document_type: documentType,
          label: documentType,
          required: false,
          source: 'platform',
          state: 'missing',
        })),
      },
    })
    expect(contract.requirements.map((row) => row.documentType)).toEqual([
      ...BACKEND_LEGACY_PLATFORM_DOCUMENT_TYPES,
    ])
  })

  it('never accepts client-side a file the platform allowlist excludes', () => {
    const contract = parseRequiredDocumentsContract({
      success: true,
      data: {
        application_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        requirements: [
          {
            document_type: 'result_slip',
            label: 'Result slip',
            required: true,
            source: 'platform',
            state: 'missing',
          },
        ],
      },
    })
    const requirement = contract.requirements[0]!
    // A GIF is in the backend's magic-byte table but *not* in the platform
    // allowlist the contract publishes — the client must refuse it too.
    const gif = new File([new Uint8Array([0x47, 0x49, 0x46])], 'scan.gif', { type: 'image/gif' })
    expect(validateFileForRequirement(gif, requirement)?.code).toBe('INVALID_FILE_TYPE')
  })
})
