/**
 * Deterministic OCR assistance is *assistance* — confirmation-gated, never
 * authority.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 7.5.
 * Requirements: R11.4 — candidates "SHALL include provenance/confidence and
 *               require explicit confirmation before they become application
 *               data"; R11.10 — low-confidence handling, tamper rejection, and
 *               "no automatic authority for extracted values".
 * Findings:     STU-06.
 *
 * The regression these tests exist for: the pre-7.5 hook applied grades the
 * moment a payload arrived, so "the student agreed to this" was never true. Each
 * test below pins one half of the new contract — the payload reader refuses
 * anything unconfirmable, and the confirm path only ever returns what was ticked.
 *
 * Validates: Requirements R11.4, R11.10
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { readExtractionPayload, useOcrGradeExtraction } from '@/pages/student/applicationWizard/hooks/useOcrGradeExtraction'
import { ExtractedResultsCard } from '@/components/student/ExtractedResultsCard'

const MATH_ID = '11111111-1111-4111-8111-111111111111'
const BIO_ID = '22222222-2222-4222-8222-222222222222'

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    raw_label: 'Mathematics',
    grade: 4,
    subject_code: 'MATH',
    subject_name: 'Mathematics',
    subject_id: MATH_ID,
    match: 'canonical',
    matched_alias: null,
    confidence: 0.95,
    status: 'suggested',
    source_line: 7,
    source_text: '1. Mathematics 4',
    provenance: 'deterministic_ocr',
    confirmable: true,
    ...overrides,
  }
}

function payload(candidates: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) {
  return {
    parser_version: 'ecz-slip-2026-07-1',
    catalog_version: 'ecz-62-abc',
    provenance: 'deterministic_ocr',
    requires_confirmation: true,
    authoritative: false,
    exam_number: '1234567001',
    exam_year: 2023,
    mean_confidence: 0.95,
    candidates,
    ...extra,
  }
}

describe('readExtractionPayload (R11.4)', () => {
  it('offers a candidate that carries a canonical id, a 1-9 grade, and provenance', () => {
    const parsed = readExtractionPayload(payload([candidate()]))
    expect(parsed?.candidates).toHaveLength(1)
    expect(parsed?.candidates[0]).toMatchObject({
      subject_id: MATH_ID,
      grade: 4,
      confidence: 0.95,
      match: 'canonical',
      source_line: 7,
      provenance: 'deterministic_ocr',
    })
    expect(parsed?.meta).toMatchObject({ examNumber: '1234567001', year: '2023' })
  })

  it('withholds a low-confidence candidate instead of offering it', () => {
    const parsed = readExtractionPayload(
      payload([candidate({ status: 'low_confidence', confidence: 0.65, confirmable: false })]),
    )
    expect(parsed?.candidates).toHaveLength(0)
    expect(parsed?.withheld).toEqual([
      expect.objectContaining({ status: 'low_confidence', raw_label: 'Mathematics' }),
    ])
  })

  it.each([
    ['an out-of-scale grade', { grade: 11, status: 'invalid_grade', confirmable: false }],
    ['a grade of zero', { grade: 0, status: 'invalid_grade', confirmable: false }],
    ['an unresolved subject', { subject_id: null, subject_code: null, status: 'unresolved', confirmable: false }],
    ['a duplicate reading', { status: 'duplicate', confirmable: false }],
    ['a non-canonical subject id', { subject_id: 'fallback-math', confirmable: true }],
    ['a server that forgot the confirmable flag', { confirmable: false }],
  ])('never offers %s', (_label, overrides) => {
    const parsed = readExtractionPayload(payload([candidate(overrides)]))
    expect(parsed?.candidates).toEqual([])
  })

  it('offers the same subject only once even if the payload repeats it', () => {
    const parsed = readExtractionPayload(payload([candidate(), candidate({ grade: 9 })]))
    expect(parsed?.candidates).toHaveLength(1)
    expect(parsed?.candidates[0]?.grade).toBe(4)
  })

  it('returns null for a document with no stored candidate set', () => {
    expect(readExtractionPayload(null)).toBeNull()
    expect(readExtractionPayload(undefined)).toBeNull()
    expect(readExtractionPayload({ candidates: 'nope' })).toBeNull()
  })
})

describe('useOcrGradeExtraction confirmation gate (R11.4)', () => {
  it('confirms only the subjects the student selected', () => {
    const { result } = renderHook(() => useOcrGradeExtraction(null))
    // Status starts idle and no candidate is ever applied without a call.
    expect(result.current.status).toBe('idle')
    expect(result.current.candidates).toEqual([])

    let confirmed: Array<{ subject_id: string; grade: number }> = []
    act(() => {
      confirmed = result.current.confirmCandidates([MATH_ID])
    })
    // With no candidates loaded, confirming selects nothing — a caller cannot
    // fabricate an application value through the confirm path.
    expect(confirmed).toEqual([])
    expect(result.current.status).toBe('idle')
  })

  it('dismissing clears the suggestions and leaves the student on manual entry', () => {
    const { result } = renderHook(() => useOcrGradeExtraction(null))
    act(() => {
      result.current.dismissCandidates()
    })
    expect(result.current.status).toBe('dismissed')
    expect(result.current.candidates).toEqual([])
  })
})

describe('ExtractedResultsCard (R11.4, R11.10)', () => {
  const candidates = [
    {
      subject_id: MATH_ID,
      subject_code: 'MATH',
      subject_name: 'Mathematics',
      grade: 4,
      confidence: 0.95,
      match: 'canonical' as const,
      matched_alias: null,
      source_line: 7,
      source_text: '1. Mathematics 4',
      provenance: 'deterministic_ocr',
      raw_label: 'Mathematics',
    },
    {
      subject_id: BIO_ID,
      subject_code: 'BIO',
      subject_name: 'Biology',
      grade: 6,
      confidence: 0.8,
      match: 'alias' as const,
      matched_alias: 'bio',
      source_line: 8,
      source_text: '2. Bio 6',
      provenance: 'deterministic_ocr',
      raw_label: 'Bio',
    },
  ]

  it('renders nothing without candidates, so the grid stands alone', () => {
    const { container } = render(
      <ExtractedResultsCard candidates={[]} onConfirm={vi.fn()} onDismiss={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows confidence and provenance for every candidate', () => {
    render(<ExtractedResultsCard candidates={candidates} onConfirm={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByText(/name matched the subject catalogue exactly/)).toBeTruthy()
    expect(screen.getByText(/matched "bio" in the subject catalogue/)).toBeTruthy()
    expect(screen.getByText(/High confidence \(95%\)/)).toBeTruthy()
    expect(screen.getByText(/Good confidence \(80%\)/)).toBeTruthy()
    expect(screen.getByText(/slip line 7/)).toBeTruthy()
  })

  it('calls onConfirm only when the student presses confirm, with their selection', () => {
    const onConfirm = vi.fn()
    render(<ExtractedResultsCard candidates={candidates} onConfirm={onConfirm} onDismiss={vi.fn()} />)
    // Rendering alone must never confirm anything.
    expect(onConfirm).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('ocr-candidate-BIO'))
    fireEvent.click(screen.getByTestId('ocr-confirm-candidates'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith([MATH_ID])
  })

  it('cannot confirm an empty selection', () => {
    const onConfirm = vi.fn()
    render(<ExtractedResultsCard candidates={candidates} onConfirm={onConfirm} onDismiss={vi.fn()} />)
    fireEvent.click(screen.getByTestId('ocr-candidate-MATH'))
    fireEvent.click(screen.getByTestId('ocr-candidate-BIO'))
    const confirm = screen.getByTestId('ocr-confirm-candidates') as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.click(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('offers an always-available manual escape hatch', () => {
    const onDismiss = vi.fn()
    render(<ExtractedResultsCard candidates={candidates} onConfirm={vi.fn()} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByTestId('ocr-dismiss-candidates'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('names the withheld rows the student has to type themselves', () => {
    render(
      <ExtractedResultsCard
        candidates={candidates}
        withheld={[
          { raw_label: 'Engl1sh Language', grade: 5, status: 'unresolved', subject_name: null, confidence: 0, source_line: 6 },
          { raw_label: 'Chemistry', grade: null, status: 'invalid_grade', subject_name: 'Chemistry', confidence: 0.95, source_line: 9 },
        ]}
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByText(/Engl1sh Language \(grade 5\) — not a subject we recognise/)).toBeTruthy()
    expect(screen.getByText(/Chemistry — grade outside the 1–9 scale/)).toBeTruthy()
  })

  it('states that the read is deterministic and not AI', () => {
    render(
      <ExtractedResultsCard
        candidates={candidates}
        parserVersion="ecz-slip-2026-07-1"
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByText(/deterministic text recognition/)).toBeTruthy()
    expect(screen.getByText(/no AI/)).toBeTruthy()
  })
})
