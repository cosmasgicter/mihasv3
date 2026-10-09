/**
 * Required-document contract parsing + per-requirement validation (task 7.2).
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task **7.2**
 * Requirements: R11.6 (controls rendered from the versioned snapshot), R11.7
 *               (type/size validation)
 * Findings:     STU-13
 * Design:       §9.3 (Required Documents)
 *
 * The client half of the "custom tenant requirement" evidence: a requirement the
 * client has never heard of parses into a renderable, validated control, and an
 * unreadable payload becomes an explicit error instead of a fabricated empty
 * list (which is the fail-open behaviour STU-13 flagged).
 */
import { describe, it, expect } from 'vitest'

import {
  PLATFORM_ACCEPTED_MIME_TYPES,
  PLATFORM_MAX_UPLOAD_BYTES,
  RequiredDocumentsContractError,
  acceptAttribute,
  constraintHint,
  formatConstraintSize,
  parseRequiredDocumentsContract,
  unsatisfiedRequirements,
  validateFileForRequirement,
  type RequiredDocumentRequirement,
} from '@/lib/requiredDocuments'

function serverRequirement(overrides: Record<string, unknown> = {}) {
  return {
    document_type: 'nursing_council_letter',
    label: 'Nursing Council clearance letter',
    required: true,
    description: 'Signed clearance from the council.',
    source: 'tenant',
    accepts_document_types: ['nursing_council_letter'],
    accepted_mime_types: ['application/pdf'],
    accepted_extensions: ['.pdf'],
    max_size_bytes: 2 * 1024 * 1024,
    constraints_source: 'tenant',
    constraints_narrowed: true,
    state: 'missing',
    document: null,
    ...overrides,
  }
}

function envelope(requirements: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      application_id: 'app-1',
      application_status: 'draft',
      configuration_version: 'cfg-abc123',
      requirements,
      missing_required: [],
      satisfied: false,
      policy: {
        max_size_bytes: PLATFORM_MAX_UPLOAD_BYTES,
        accepted_mime_types: [...PLATFORM_ACCEPTED_MIME_TYPES],
      },
      ...overrides,
    },
  }
}

function requirement(overrides: Partial<RequiredDocumentRequirement> = {}): RequiredDocumentRequirement {
  return {
    documentType: 'nursing_council_letter',
    label: 'Council letter',
    required: true,
    description: null,
    source: 'tenant',
    acceptsDocumentTypes: ['nursing_council_letter'],
    acceptedMimeTypes: ['application/pdf'],
    acceptedExtensions: ['.pdf'],
    maxSizeBytes: 2 * 1024 * 1024,
    state: 'missing',
    document: null,
    history: [],
    ...overrides,
  }
}

function file(name: string, type: string, size: number): File {
  const blob = new File(['x'], name, { type })
  Object.defineProperty(blob, 'size', { value: size })
  return blob
}

describe('parseRequiredDocumentsContract', () => {
  it('renders a custom tenant document type the client has never heard of', () => {
    const contract = parseRequiredDocumentsContract(envelope([serverRequirement()]))

    expect(contract.requirements).toHaveLength(1)
    const [row] = contract.requirements
    expect(row.documentType).toBe('nursing_council_letter')
    expect(row.label).toBe('Nursing Council clearance letter')
    expect(row.required).toBe(true)
    expect(row.acceptedMimeTypes).toEqual(['application/pdf'])
    expect(row.maxSizeBytes).toBe(2 * 1024 * 1024)
    expect(contract.configurationVersion).toBe('cfg-abc123')
  })

  it('unwraps the response envelope and a bare payload identically', () => {
    const wrapped = parseRequiredDocumentsContract(envelope([serverRequirement()]))
    const bare = parseRequiredDocumentsContract(envelope([serverRequirement()]).data)
    expect(bare).toEqual(wrapped)
  })

  it('derives missingRequired from required rows that have no evidence', () => {
    const contract = parseRequiredDocumentsContract(
      envelope([
        serverRequirement(),
        serverRequirement({ document_type: 'result_slip', label: 'Result slip', state: 'uploaded' }),
        serverRequirement({ document_type: 'optional_extra', required: false }),
      ]),
    )

    expect(contract.missingRequired.map((row) => row.documentType)).toEqual([
      'nursing_council_letter',
    ])
    expect(contract.satisfied).toBe(false)
  })

  it('reports satisfied when every required row has evidence', () => {
    const contract = parseRequiredDocumentsContract(
      envelope([
        serverRequirement({ state: 'uploaded', document: { id: 'doc-1' } }),
        serverRequirement({ document_type: 'optional_extra', required: false }),
      ]),
    )
    expect(contract.satisfied).toBe(true)
  })

  it('keeps the uploaded document identity so replace targets a server record', () => {
    const contract = parseRequiredDocumentsContract(
      envelope([
        serverRequirement({
          state: 'uploaded',
          document: {
            id: 'doc-9',
            document_type: 'nursing_council_letter',
            document_name: 'clearance.pdf',
            verification_status: 'pending',
            file_size: 4096,
            mime_type: 'application/pdf',
            uploaded_at: '2026-07-26T00:00:00Z',
            version: 2,
            lifecycle_state: 'ready_for_review',
            checksum: 'b'.repeat(64),
          },
          history: [
            {
              id: 'doc-8',
              document_type: 'nursing_council_letter',
              version: 1,
              lifecycle_state: 'superseded',
              uploaded_at: '2026-07-25T00:00:00Z',
              superseded_at: '2026-07-26T00:00:00Z',
            },
          ],
        }),
      ]),
    )

    expect(contract.requirements[0].document).toEqual({
      id: 'doc-9',
      documentType: 'nursing_council_letter',
      documentName: 'clearance.pdf',
      verificationStatus: 'pending',
      fileSize: 4096,
      mimeType: 'application/pdf',
      uploadedAt: '2026-07-26T00:00:00Z',
      version: 2,
      lifecycleState: 'ready_for_review',
      checksum: 'b'.repeat(64),
    })
    expect(contract.requirements[0].history).toEqual([
      {
        id: 'doc-8',
        documentType: 'nursing_council_letter',
        version: 1,
        lifecycleState: 'superseded',
        uploadedAt: '2026-07-25T00:00:00Z',
        supersededAt: '2026-07-26T00:00:00Z',
      },
    ])
  })

  it('throws instead of inventing an empty requirement list', () => {
    expect(() => parseRequiredDocumentsContract(null)).toThrow(RequiredDocumentsContractError)
    expect(() => parseRequiredDocumentsContract({ success: true })).toThrow(
      RequiredDocumentsContractError,
    )
    expect(() => parseRequiredDocumentsContract({ data: { requirements: 'nope' } })).toThrow(
      RequiredDocumentsContractError,
    )
  })

  it('accepts a legitimately empty requirement list', () => {
    const contract = parseRequiredDocumentsContract(envelope([]))
    expect(contract.requirements).toEqual([])
    expect(contract.satisfied).toBe(true)
  })

  it('drops malformed rows without discarding the readable ones', () => {
    const contract = parseRequiredDocumentsContract(
      envelope([serverRequirement(), { label: 'no type' }, null, 'garbage']),
    )
    expect(contract.requirements.map((row) => row.documentType)).toEqual([
      'nursing_council_letter',
    ])
  })

  it('de-duplicates repeated document types', () => {
    const contract = parseRequiredDocumentsContract(
      envelope([serverRequirement(), serverRequirement({ label: 'Duplicate' })]),
    )
    expect(contract.requirements).toHaveLength(1)
    expect(contract.requirements[0].label).toBe('Nursing Council clearance letter')
  })

  it('never lets a server row widen the platform limits', () => {
    const contract = parseRequiredDocumentsContract(
      envelope([
        serverRequirement({
          accepted_mime_types: ['application/x-msdownload', 'image/png'],
          accepted_extensions: [],
          max_size_bytes: 999_999_999,
        }),
      ]),
    )
    const [row] = contract.requirements
    expect(row.acceptedMimeTypes).toEqual(['image/png'])
    expect(row.acceptedExtensions).toEqual(['.png'])
    expect(row.maxSizeBytes).toBe(PLATFORM_MAX_UPLOAD_BYTES)
  })

  it('falls back to the platform allowlist when a row publishes no usable type', () => {
    const contract = parseRequiredDocumentsContract(
      envelope([serverRequirement({ accepted_mime_types: [], accepted_extensions: [] })]),
    )
    expect(contract.requirements[0].acceptedMimeTypes).toEqual([...PLATFORM_ACCEPTED_MIME_TYPES])
    expect(contract.requirements[0].acceptedExtensions).toEqual(['.pdf', '.jpg', '.jpeg', '.png'])
  })
})

describe('validateFileForRequirement', () => {
  it('accepts a file that matches the published constraints', () => {
    expect(validateFileForRequirement(file('letter.pdf', 'application/pdf', 1024), requirement())).toBeNull()
  })

  it('rejects a file above the requirement limit, naming that limit', () => {
    const rejection = validateFileForRequirement(
      file('letter.pdf', 'application/pdf', 3 * 1024 * 1024),
      requirement({ label: 'Council letter', maxSizeBytes: 2 * 1024 * 1024 }),
    )
    expect(rejection?.code).toBe('FILE_TOO_LARGE')
    expect(rejection?.message).toContain('2MB')
    expect(rejection?.message).toContain('Council letter')
  })

  it('rejects a type the requirement does not accept', () => {
    const rejection = validateFileForRequirement(
      file('photo.png', 'image/png', 1024),
      requirement(),
    )
    expect(rejection?.code).toBe('INVALID_FILE_TYPE')
    expect(rejection?.message).toContain('PDF')
  })

  it('rejects an extension/MIME mismatch even when the MIME type is accepted', () => {
    const rejection = validateFileForRequirement(
      file('letter.exe', 'application/pdf', 1024),
      requirement(),
    )
    expect(rejection?.code).toBe('INVALID_FILE_TYPE')
  })

  it('rejects a file the browser reports no MIME type for, matching the server', () => {
    // The upload command validates the *declared* MIME type before the
    // magic-byte check, so accepting a typeless file here would only move the
    // same refusal to the network round trip.
    const rejection = validateFileForRequirement(file('letter.pdf', '', 1024), requirement())
    expect(rejection?.code).toBe('INVALID_FILE_TYPE')
  })

  it('rejects an empty file', () => {
    const rejection = validateFileForRequirement(
      file('letter.pdf', 'application/pdf', 0),
      requirement(),
    )
    expect(rejection?.code).toBe('EMPTY_FILE')
  })

  it('honours a widened requirement (three accepted types)', () => {
    const wide = requirement({
      acceptedMimeTypes: [...PLATFORM_ACCEPTED_MIME_TYPES],
      acceptedExtensions: ['.pdf', '.jpg', '.jpeg', '.png'],
      maxSizeBytes: PLATFORM_MAX_UPLOAD_BYTES,
    })
    expect(validateFileForRequirement(file('a.png', 'image/png', 2048), wide)).toBeNull()
    expect(validateFileForRequirement(file('a.jpeg', 'image/jpeg', 2048), wide)).toBeNull()
    expect(validateFileForRequirement(file('a.pdf', 'application/pdf', 2048), wide)).toBeNull()
  })
})

describe('presentation helpers', () => {
  it('builds an accept attribute from the published extensions', () => {
    expect(acceptAttribute(requirement({ acceptedExtensions: ['.pdf', '.png'] }))).toBe('.pdf,.png')
  })

  it('describes the constraint in the same words as the validation message', () => {
    expect(constraintHint(requirement({ acceptedExtensions: ['.pdf'], maxSizeBytes: 2097152 }))).toBe(
      'PDF up to 2MB',
    )
    // `.jpeg` collapses into JPG: to a student they are one format, and listing
    // both read like two separate choices.
    expect(
      constraintHint(
        requirement({ acceptedExtensions: ['.pdf', '.jpg', '.jpeg', '.png'], maxSizeBytes: 10485760 }),
      ),
    ).toBe('PDF, JPG or PNG up to 10MB')
  })

  it('formats sizes without fake precision', () => {
    expect(formatConstraintSize(0)).toBe('0 KB')
    expect(formatConstraintSize(2048)).toBe('2KB')
    expect(formatConstraintSize(2 * 1024 * 1024)).toBe('2MB')
    expect(formatConstraintSize(1.5 * 1024 * 1024)).toBe('1.5MB')
  })

  it('lists only unsatisfied required rows, in render order', () => {
    const contract = parseRequiredDocumentsContract(
      envelope([
        serverRequirement({ document_type: 'a', required: true, state: 'uploaded' }),
        serverRequirement({ document_type: 'b', required: true, state: 'missing' }),
        serverRequirement({ document_type: 'c', required: false, state: 'missing' }),
        serverRequirement({ document_type: 'd', required: true, state: 'missing' }),
      ]),
    )
    expect(unsatisfiedRequirements(contract).map((row) => row.documentType)).toEqual(['b', 'd'])
    expect(unsatisfiedRequirements(null)).toEqual([])
  })
})
