/**
 * R3 exploration: bounded OCR polling that stops when there is no job.
 *
 * Spec: student-journey-repair task 1.3, clause 1.14 (design R3-c, DEC-2).
 *
 * At HEAD the hook polls `GET /documents/{id}/info/` every 3 s for up to 30
 * polls, each poll retried 3 times by the API client (up to 120 requests against
 * a 20-per-10-minutes document budget), and it has no "no job exists" state, so
 * it keeps polling a document whose extract call was rejected.
 *
 * Every test asserts the expected behaviour and is wrapped in `it.fails`
 * (design "Marker scheme"); task 3.12 (the R3 checkpoint) removes the wrapper.
 */
import { act, renderHook } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getInfo = vi.fn()

vi.mock('@/services/documents', () => ({
  documentService: { getInfo: (...args: unknown[]) => getInfo(...args) },
}))

const { useOcrGradeExtraction } = await import(
  '@/pages/student/applicationWizard/hooks/useOcrGradeExtraction'
)

const DOC_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

/** Cumulative poll times from design R3-c: 2, 3, 5, 8, 13, then 15 s steps. */
const EXPECTED_POLL_TIMES_MS = [2000, 5000, 10000, 18000, 31000, 46000, 61000, 76000, 91000, 106000]

function info(overrides: Record<string, unknown> = {}) {
  return { id: DOC_ID, extracted_text: false, ocr_state: null, extraction: null, ...overrides }
}

function start() {
  const hook = renderHook(() => useOcrGradeExtraction(DOC_ID))
  act(() => {
    hook.result.current.startPolling(DOC_ID)
  })
  return hook
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  getInfo.mockReset()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('OCR polling (clause 1.14)', () => {
  it.fails('stops after one poll when the document has no job (ocr_state null)', async () => {
    getInfo.mockResolvedValue(info())
    const { result } = start()

    await advance(120_000)

    expect(getInfo).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('failed')
    expect(result.current.failureReason).toBe('not_started')
  })

  it.fails('polls at most 10 times on the backoff schedule, then times out', async () => {
    getInfo.mockResolvedValue(info({ ocr_state: 'ocr_processing' }))
    const startedAt = Date.now()
    const times: number[] = []
    getInfo.mockImplementation(async () => {
      times.push(Date.now() - startedAt)
      return info({ ocr_state: 'ocr_processing' })
    })
    const { result } = start()

    await advance(400_000)

    expect(times).toEqual(EXPECTED_POLL_TIMES_MS)
    expect(result.current.status).toBe('failed')
    expect(result.current.failureReason).toBe('timeout')
  })

  it.fails('reads the document without the client-level retries', async () => {
    getInfo.mockResolvedValue(info({ ocr_state: 'ocr_processing' }))
    start()

    await advance(10_000)

    expect(getInfo).toHaveBeenCalled()
    expect(getInfo).toHaveBeenCalledWith(DOC_ID, { retries: 0 })
  })

  it.fails('stops on a 429 and reports it as rate limited', async () => {
    getInfo.mockRejectedValue(Object.assign(new Error('Too many requests'), { status: 429 }))
    const { result } = start()

    await advance(120_000)

    expect(getInfo).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('failed')
    expect(result.current.failureReason).toBe('rate_limited')
  })

  it.fails('stops on a 404 and reports the document as missing', async () => {
    getInfo.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 }))
    const { result } = start()

    await advance(120_000)

    expect(getInfo).toHaveBeenCalledTimes(1)
    expect(result.current.failureReason).toBe('missing')
  })
})

describe('wizard controller wiring (clause 1.14)', () => {
  /**
   * A source-shape check, in the style of the repo's architecture guards: the
   * behaviour end to end belongs to the journey gate (task 4). At HEAD the
   * controller starts polling on the line after it fires extract(), whether or
   * not extract succeeded.
   */
  it.fails('starts OCR polling only after extract() resolves', () => {
    const source = readFileSync(
      resolve(
        __dirname,
        '../../src/pages/student/applicationWizard/hooks/useWizardController.ts',
      ),
      'utf8',
    )
    const start = source.indexOf('onUploaded: useCallback(')
    expect(start).toBeGreaterThan(-1)
    const block = source.slice(start, source.indexOf('requiredDocuments', start + 1) + 200)
    const extractAt = block.indexOf('.extract(')
    const pollAt = block.indexOf('startOcrPollingRef.current')
    expect(extractAt).toBeGreaterThan(-1)
    expect(pollAt).toBeGreaterThan(extractAt)
    // Polling must sit inside the success path: a `.then(` or an awaited call
    // between the extract() call and the poll start.
    const between = block.slice(extractAt, pollAt)
    expect(/\.then\(|await\s/.test(between)).toBe(true)
  })
})
