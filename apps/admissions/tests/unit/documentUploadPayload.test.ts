import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestMock = vi.fn()

vi.mock('@/services/client', () => ({
  apiClient: {
    request: requestMock,
  },
}))

describe('document upload payloads', () => {
  beforeEach(() => {
    requestMock.mockReset()
  })

  it('uploads application files through the Django multipart document endpoint', async () => {
    requestMock.mockResolvedValue({
      id: 'doc-1',
      file_url: 'https://example.com/test.pdf',
    })

    const { uploadApplicationFile } = await import('@/lib/storage')
    const file = new File(['hello world'], 'result-slip.pdf', { type: 'application/pdf' })

    const result = await uploadApplicationFile(file, 'user-1', 'app-1', 'result_slip')

    expect(result.success).toBe(true)
    expect(requestMock).toHaveBeenCalledTimes(1)
    expect(requestMock.mock.calls[0]?.[0]).toBe('/documents/upload/')

    const requestInit = requestMock.mock.calls[0]?.[1] as { method: string; body: FormData }
    expect(requestInit.method).toBe('POST')
    expect(requestInit.body).toBeInstanceOf(FormData)

    const body = requestInit.body
    expect(body.get('application_id')).toBe('app-1')
    expect(body.get('document_type')).toBe('result_slip')
    expect(body.get('file')).toBe(file)
  })

  it('sends documentService uploads through the same multipart contract', async () => {
    requestMock.mockResolvedValue({ id: 'doc-2', file_url: 'u' })

    const { documentService } = await import('@/services/documents')
    const file = new File(['another file'], 'passport.png', { type: 'image/png' })

    await documentService.upload({
      file,
      fileType: 'passport',
      applicationId: 'app-2',
      userId: 'user-2',
    })

    expect(requestMock).toHaveBeenCalledTimes(1)
    expect(requestMock.mock.calls[0]?.[0]).toBe('/documents/upload/')

    const options = requestMock.mock.calls[0]?.[1] as { method: string; body: FormData }
    expect(options.method).toBe('POST')
    expect(options.body).toBeInstanceOf(FormData)
    expect(options.body.get('application_id')).toBe('app-2')
    expect(options.body.get('document_type')).toBe('passport')
    expect(options.body.get('file')).toBe(file)
  })
})
