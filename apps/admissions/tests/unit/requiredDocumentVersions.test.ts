/**
 * Immutable-version identity in the client contract (admissions-v2 task **7.3**).
 *
 * Requirements: R11.7 (an uploaded document is an immutable version carrying a
 *               checksum and a lifecycle state), R11.8 (prior evidence is
 *               preserved as history; exactly one version is current).
 * Findings:     **STU-19** — "'Replace' may clear only local UI state."
 * Design:       §9.3.
 *
 * The server publishes `document.version`, `document.checksum`,
 * `document.lifecycle_state` and a per-requirement `history` array. Before 7.3
 * the parser dropped all four, so the client had no way to tell a *new server
 * record* from a re-rendered local file name — which is exactly the confusion
 * STU-19 describes. These tests pin the parse, including the pre-7.3 payload
 * shape, which must keep working with nulls rather than throwing.
 *
 * Validates: Requirements R11.7, R11.8
 */
import { describe, expect, it } from 'vitest'

import { parseRequiredDocumentsContract } from '@/lib/requiredDocuments'

const APPLICATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function payload(requirement: Record<string, unknown>) {
  return {
    success: true,
    data: {
      application_id: APPLICATION_ID,
      configuration_version: 'cfg-7-3',
      requirements: [
        {
          document_type: 'result_slip',
          label: 'Grade 12 result slip',
          required: true,
          source: 'platform',
          accepts_document_types: ['result_slip'],
          accepted_mime_types: ['application/pdf'],
          accepted_extensions: ['.pdf'],
          max_size_bytes: 2 * 1024 * 1024,
          state: 'uploaded',
          ...requirement,
        },
      ],
    },
  }
}

const CURRENT_DOCUMENT = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  document_type: 'result_slip',
  document_name: 'slip-v2.pdf',
  verification_status: 'pending',
  file_size: 2048,
  mime_type: 'application/pdf',
  uploaded_at: '2026-07-26T09:30:00Z',
  version: 2,
  lifecycle_state: 'ready_for_review',
  checksum: 'b'.repeat(64),
}

const PRIOR_VERSION = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  document_type: 'result_slip',
  version: 1,
  lifecycle_state: 'superseded',
  uploaded_at: '2026-07-26T09:00:00Z',
  superseded_at: '2026-07-26T09:30:00Z',
}

describe('required-document version identity (R11.7, R11.8)', () => {
  it('parses the immutable identity of the current version', () => {
    const contract = parseRequiredDocumentsContract(payload({ document: CURRENT_DOCUMENT }))
    const evidence = contract.requirements[0].document

    expect(evidence).not.toBeNull()
    expect(evidence!.version).toBe(2)
    expect(evidence!.lifecycleState).toBe('ready_for_review')
    expect(evidence!.checksum).toBe('b'.repeat(64))
  })

  it('parses preserved prior versions, newest first', () => {
    const contract = parseRequiredDocumentsContract(
      payload({
        document: CURRENT_DOCUMENT,
        history: [
          PRIOR_VERSION,
          { ...PRIOR_VERSION, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', version: 3 },
        ],
      }),
    )
    const history = contract.requirements[0].history

    expect(history.map((entry) => entry.version)).toEqual([3, 1])
    expect(history[1].lifecycleState).toBe('superseded')
    expect(history[1].supersededAt).toBe('2026-07-26T09:30:00Z')
  })

  it('drops a history entry with no identity rather than rendering a blank row', () => {
    const contract = parseRequiredDocumentsContract(
      payload({ document: CURRENT_DOCUMENT, history: [PRIOR_VERSION, {}, null, 'nope'] }),
    )
    expect(contract.requirements[0].history.map((entry) => entry.id)).toEqual([PRIOR_VERSION.id])
  })

  it('reads a pre-7.3 payload with no version fields as nulls, not an error', () => {
    const contract = parseRequiredDocumentsContract(
      payload({
        document: {
          id: CURRENT_DOCUMENT.id,
          document_type: 'result_slip',
          document_name: 'slip.pdf',
          verification_status: 'verified',
          file_size: 1024,
          mime_type: 'application/pdf',
          uploaded_at: '2026-07-20T09:00:00Z',
        },
      }),
    )
    const evidence = contract.requirements[0].document

    expect(evidence!.version).toBeNull()
    expect(evidence!.checksum).toBeNull()
    expect(evidence!.lifecycleState).toBeNull()
    expect(contract.requirements[0].history).toEqual([])
  })

  it('never treats a superseded version as the requirement evidence', () => {
    // The server publishes exactly one current document plus history; a client
    // that merged them would show a replaced file as still on file.
    const contract = parseRequiredDocumentsContract(
      payload({ document: CURRENT_DOCUMENT, history: [PRIOR_VERSION] }),
    )
    expect(contract.requirements[0].document!.id).toBe(CURRENT_DOCUMENT.id)
    expect(contract.requirements[0].history.every((entry) => entry.id !== CURRENT_DOCUMENT.id)).toBe(
      true,
    )
  })
})
