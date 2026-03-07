import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestMock = vi.fn()
const fetchMock = vi.fn()

vi.mock('@/services/client', () => ({
  apiClient: {
    request: requestMock,
  },
}))

describe('document upload payloads', () => {
  beforeEach(() => {
    requestMock.mockReset()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('uploads application files as JSON with base64 content', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          path: 'user-1/app-1/result_slip/test.pdf',
          url: 'https://example.com/test.pdf',
        },
      }),
    })

    const { uploadApplicationFile } = await import('@/lib/storage')
    const file = new File(['hello world'], 'result-slip.pdf', { type: 'application/pdf' })

    const result = await uploadApplicationFile(file, 'user-1', 'app-1', 'result_slip')

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/documents?action=upload')

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(requestInit.method).toBe('POST')
    expect(requestInit.credentials).toBe('include')
    expect(requestInit.headers).toMatchObject({ 'Content-Type': 'application/json' })

    const body = JSON.parse(String(requestInit.body))
    expect(body.applicationId).toBe('app-1')
    expect(body.documentType).toBe('result_slip')
    expect(body.fileName).toBe('result-slip.pdf')
    expect(body.contentType).toBe('application/pdf')
    expect(typeof body.file).toBe('string')
    expect(body.file.length).toBeGreaterThan(0)
  })

  it('sends documentService uploads through the same JSON contract', async () => {
    requestMock.mockResolvedValue({ path: 'p', url: 'u' })

    const { documentService } = await import('@/services/documents')
    const file = new File(['another file'], 'passport.png', { type: 'image/png' })

    await documentService.upload({
      file,
      fileType: 'passport',
      applicationId: 'app-2',
      userId: 'user-2',
    })

    expect(requestMock).toHaveBeenCalledTimes(1)
    expect(requestMock.mock.calls[0]?.[0]).toBe('/documents?action=upload')

    const options = requestMock.mock.calls[0]?.[1] as { method: string; body: string }
    expect(options.method).toBe('POST')

    const body = JSON.parse(options.body)
    expect(body.applicationId).toBe('app-2')
    expect(body.documentType).toBe('passport')
    expect(body.userId).toBe('user-2')
    expect(body.fileName).toBe('passport.png')
    expect(body.contentType).toBe('image/png')
    expect(typeof body.file).toBe('string')
  })
})
