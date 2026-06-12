import React, { act } from 'react'
import { createRoot, Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  useAdminOfficialDocuments,
  ADMIN_OFFICIAL_DOCUMENT_TYPES,
  type UseAdminOfficialDocumentsResult,
} from '@/hooks/useAdminOfficialDocuments'

// The admin panel hook drives generation + listing through the backend-scoped
// official-document service (R17.4/R17.5) — never a client PDF generator.
const listMock = vi.fn()
const generateMock = vi.fn()
const getMock = vi.fn()
const downloadMock = vi.fn()

vi.mock('@/services/officialDocuments', () => ({
  officialDocumentService: {
    listOfficialDocuments: (...args: unknown[]) => listMock(...args),
    generateOfficialDocument: (...args: unknown[]) => generateMock(...args),
    getOfficialDocument: (...args: unknown[]) => getMock(...args),
    downloadOfficialDocument: (...args: unknown[]) => downloadMock(...args),
  },
}))

const APP_ID = 'app-123'

function readyDoc(type: string) {
  return {
    document_id: `doc-${type}`,
    document_type: type,
    status: 'ready' as const,
    download_url: `https://files.example/${type}.pdf`,
    generated_at: '2026-06-09T00:00:00.000Z',
    template_version: 2,
    institution_id: 'inst-1',
  }
}

function Harness({ onReady }: { onReady: (api: UseAdminOfficialDocumentsResult) => void }) {
  const api = useAdminOfficialDocuments(APP_ID)
  onReady(api)
  return null
}

let container: HTMLDivElement
let root: Root
let latest: UseAdminOfficialDocumentsResult

async function mountHarness() {
  await act(async () => {
    root.render(<Harness onReady={(api) => { latest = api }} />)
  })
}

beforeEach(() => {
  listMock.mockReset()
  generateMock.mockReset()
  getMock.mockReset()
  downloadMock.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

describe('useAdminOfficialDocuments', () => {
  it('lists the latest official document per type from the backend (R17.4)', async () => {
    listMock.mockResolvedValue([readyDoc('acceptance_letter')])
    await mountHarness()

    // One row per generatable type.
    expect(latest.rows).toHaveLength(ADMIN_OFFICIAL_DOCUMENT_TYPES.length)
    expect(listMock).toHaveBeenCalledWith(APP_ID)

    const acceptance = latest.rows.find((r) => r.type === 'acceptance_letter')!
    expect(acceptance.latest?.status).toBe('ready')
    expect(acceptance.uiState).toBe('ready')

    const slip = latest.rows.find((r) => r.type === 'application_slip')!
    expect(slip.latest).toBeNull()
    expect(slip.uiState).toBe('idle')
    expect(latest.isLoading).toBe(false)
  })

  it('queues generation then reflects ready after the backend settles (R17.4)', async () => {
    vi.useFakeTimers()
    listMock.mockResolvedValueOnce([]) // initial load: nothing yet
    await mountHarness()

    // generate() queues, then we poll → ready, then refresh shows the record.
    generateMock.mockResolvedValueOnce({ document_type: 'application_slip', status: 'queued' })
    getMock.mockResolvedValueOnce({ document_type: 'application_slip', status: 'ready' })
    listMock.mockResolvedValueOnce([readyDoc('application_slip')])

    let result: Promise<boolean>
    await act(async () => {
      result = latest.generate('application_slip')
    })
    // advance the single poll interval
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    const ok = await act(async () => result)

    expect(ok).toBe(true)
    expect(generateMock).toHaveBeenCalledWith(APP_ID, 'application_slip')
    const slip = latest.rows.find((r) => r.type === 'application_slip')!
    expect(slip.uiState).toBe('ready')
    expect(slip.latest?.download_url).toContain('application_slip.pdf')
  })

  it('downloads the stored backend record (R17.6, no client PDF)', async () => {
    listMock.mockResolvedValue([readyDoc('payment_receipt')])
    downloadMock.mockResolvedValue(undefined)
    await mountHarness()

    const ok = await act(async () => latest.download('payment_receipt'))
    expect(ok).toBe(true)
    expect(downloadMock).toHaveBeenCalledWith(APP_ID, 'payment_receipt')
  })

  it('surfaces a load error when the scoped list call rejects', async () => {
    listMock.mockRejectedValue(new Error('Document not found'))
    await mountHarness()

    expect(latest.loadError).toBe('Document not found')
    expect(latest.isLoading).toBe(false)
  })
})
