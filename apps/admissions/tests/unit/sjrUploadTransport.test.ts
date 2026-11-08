/**
 * R2 exploration: the client upload transport.
 *
 * Spec: student-journey-repair task 1.2, clauses 1.5-1.7, 1.10 (design R2-a, R2-d).
 *
 * At HEAD a document upload goes through the fetch-based `apiClient.request`:
 * a total 30 s timeout aborts a slow transfer, the client retries up to three
 * times and the hook retries once more (8 POSTs for one failure), no
 * `Idempotency-Key` is sent, there is no byte progress, and the final message
 * comes from the LAST failure rather than the first.
 *
 * Every test here asserts the expected behaviour, so each fails at HEAD and is
 * wrapped in `it.fails` (design "Marker scheme"; the group's checkpoint, task
 * 3.8, removes the wrapper). Counterexamples are recorded from an unwrapped run.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.fn()
const upload = vi.fn()

vi.mock('@/services/client', async () => ({
  // `upload` is the method design R2-a adds; the mock stands in for it so the
  // service and hook seams can be tested before it exists.
  apiClient: {
    request: (...args: unknown[]) => request(...args),
    upload: (...args: unknown[]) => upload(...args),
  },
}))

const { useRequiredDocuments } = await import('@/hooks/useRequiredDocuments')
const { requiredDocumentsService } = await import('@/services/requiredDocuments')

const APPLICATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function contract() {
  return {
    application_id: APPLICATION_ID,
    configuration_version: 'cfg-sjr',
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
        state: 'missing',
        document: null,
      },
    ],
  }
}

function pdf() {
  return new File([new Uint8Array(1024)], 'slip.pdf', { type: 'application/pdf' })
}

function failure(code: string, message: string, status = 503) {
  return Object.assign(new Error(message), { code, status, retryable: true })
}

async function loadedHook() {
  const hook = renderHook(() => useRequiredDocuments({ applicationId: APPLICATION_ID }))
  await waitFor(() => expect(hook.result.current.requirements).toHaveLength(1))
  return hook
}

beforeEach(() => {
  request.mockReset()
  upload.mockReset()
  request.mockImplementation(async (endpoint: string) => {
    if (endpoint.endsWith('/required-documents/')) return contract()
    // HEAD uploads through request(); every attempt there fails the same way.
    if (endpoint === '/documents/upload/') throw failure('STORAGE_ERROR', 'Storage is down')
    return null
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('upload seam (R2-d)', () => {
  it.fails('requiredDocumentsService.upload goes through apiClient.upload with a key', async () => {
    upload.mockResolvedValue({ id: 'doc-1' })

    await requiredDocumentsService.upload({
      applicationId: APPLICATION_ID,
      documentType: 'result_slip',
      file: pdf(),
      idempotencyKey: 'sjr-key-0001',
    } as never)

    expect(upload).toHaveBeenCalledTimes(1)
    const [endpoint, body, options] = upload.mock.calls[0]
    expect(endpoint).toBe('/documents/upload/')
    expect(body).toBeInstanceOf(FormData)
    expect(options).toMatchObject({ idempotencyKey: 'sjr-key-0001' })
    // The fetch path must not also carry the multipart body.
    expect(
      request.mock.calls.filter(([endpoint]) => endpoint === '/documents/upload/'),
    ).toHaveLength(0)
  })
})

describe('hook retry and progress (R2-a)', () => {
  it.fails('one failure leads to at most two POSTs carrying the same Idempotency-Key', async () => {
    upload.mockRejectedValue(failure('NETWORK_ERROR', 'Offline'))
    const { result } = await loadedHook()
    vi.useFakeTimers()

    await act(async () => {
      const pending = result.current.selectFile('result_slip', pdf())
      await vi.advanceTimersByTimeAsync(10_000)
      await pending
    })

    // Exactly one automatic retry, keyed identically. HEAD never calls upload()
    // (0 calls) and the fetch client multiplies the attempts instead.
    expect(upload).toHaveBeenCalledTimes(2)
    const keys = upload.mock.calls.map(([, , options]) => options?.idempotencyKey)
    expect(typeof keys[0]).toBe('string')
    expect(keys[0].length).toBeGreaterThanOrEqual(8)
    expect(keys[1]).toBe(keys[0])
  })

  it.fails('reports determinate byte progress while uploading', async () => {
    let release: (value: unknown) => void = () => undefined
    upload.mockImplementation(
      (_endpoint: string, _body: FormData, options: { onProgress?: (p: object) => void }) =>
        new Promise((resolve) => {
          options.onProgress?.({ loaded: 512, total: 1024 })
          release = resolve
        }),
    )
    const { result } = await loadedHook()

    await act(async () => {
      void result.current.selectFile('result_slip', pdf())
    })

    await waitFor(() => expect(result.current.uploadStates.result_slip?.progress).toBe(50))
    await act(async () => {
      release({ id: 'doc-1' })
    })
  })

  it.fails('shows the FIRST failure\'s code after the retry also fails', async () => {
    // Both transports draw from one queue, so the assertion isolates the
    // message rule: HEAD reaches the same two failures through request().
    const queue = [
      failure('UPLOAD_STALLED', 'The upload stopped.', 0),
      failure('STORAGE_ERROR', 'Storage is down'),
    ]
    upload.mockImplementation(async () => {
      throw queue.shift()
    })
    request.mockImplementation(async (endpoint: string) => {
      if (endpoint.endsWith('/required-documents/')) return contract()
      if (endpoint === '/documents/upload/') throw queue.shift()
      return null
    })
    const { result } = await loadedHook()
    vi.useFakeTimers()

    await act(async () => {
      const pending = result.current.selectFile('result_slip', pdf())
      await vi.advanceTimersByTimeAsync(10_000)
      await pending
    })

    expect(result.current.uploadStates.result_slip?.status).toBe('failed')
    expect(result.current.uploadStates.result_slip?.errorCode).toBe('UPLOAD_STALLED')
  })
})

// --- Real transport against a fake XMLHttpRequest ------------------------

type Listener = (event?: unknown) => void

class FakeUpload {
  onprogress: Listener | null = null
  onload: Listener | null = null
  private listeners = new Map<string, Listener[]>()
  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  removeEventListener() {}
  emit(type: 'progress' | 'load', event: unknown = {}) {
    const handler = type === 'progress' ? this.onprogress : this.onload
    handler?.(event)
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

class FakeXhr {
  static instances: FakeXhr[] = []
  upload = new FakeUpload()
  headers: Record<string, string> = {}
  method = ''
  url = ''
  status = 0
  responseText = ''
  response: unknown = ''
  responseType = ''
  readyState = 0
  withCredentials = false
  timeout = 0
  aborted = false
  sent = 0
  onload: Listener | null = null
  onerror: Listener | null = null
  onabort: Listener | null = null
  ontimeout: Listener | null = null
  responseHeaders: Record<string, string> = {}
  private listeners = new Map<string, Listener[]>()
  constructor() {
    FakeXhr.instances.push(this)
  }
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value
  }
  getResponseHeader(name: string) {
    return this.responseHeaders[name.toLowerCase()] ?? null
  }
  getAllResponseHeaders() {
    return Object.entries(this.responseHeaders)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\r\n')
  }
  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  removeEventListener() {}
  send() {
    this.sent += 1
  }
  abort() {
    this.aborted = true
    this.fire('abort')
  }
  private fire(type: 'load' | 'error' | 'abort' | 'timeout') {
    const handler = { load: this.onload, error: this.onerror, abort: this.onabort, timeout: this.ontimeout }[type]
    handler?.({})
    for (const listener of this.listeners.get(type) ?? []) listener({})
  }
  respond(status: number, body: unknown) {
    this.status = status
    this.readyState = 4
    this.responseText = JSON.stringify(body)
    this.response = this.responseText
    this.fire('load')
  }
}

describe('transport against a fake XMLHttpRequest (R2-a)', () => {
  const realXhr = globalThis.XMLHttpRequest

  beforeEach(() => {
    FakeXhr.instances = []
    ;(globalThis as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr
  })
  afterEach(() => {
    ;(globalThis as { XMLHttpRequest: unknown }).XMLHttpRequest = realXhr
  })

  async function realClient() {
    const actual = await vi.importActual<typeof import('@/services/client')>('@/services/client')
    return actual.apiClient as unknown as {
      upload: (
        endpoint: string,
        body: FormData,
        options: { idempotencyKey: string; onProgress?: (p: { loaded: number; total: number }) => void },
      ) => Promise<{ id: string }>
    }
  }

  it.fails('does not abort a transfer that keeps reporting progress for 90 s', async () => {
    vi.useFakeTimers()
    const client = await realClient()
    const form = new FormData()
    form.append('file', pdf())

    const pending = client.upload('/documents/upload/', form, { idempotencyKey: 'sjr-key-0002' })
    const xhr = FakeXhr.instances[0]
    for (let elapsed = 10; elapsed <= 90; elapsed += 10) {
      await vi.advanceTimersByTimeAsync(10_000)
      xhr.upload.emit('progress', { lengthComputable: true, loaded: elapsed, total: 100 })
    }
    expect(xhr.aborted).toBe(false)

    xhr.upload.emit('load')
    xhr.respond(201, { success: true, data: { id: 'doc-1' } })
    await expect(pending).resolves.toMatchObject({ id: 'doc-1' })
    expect(xhr.headers['idempotency-key']).toBe('sjr-key-0002')
  })

  it.fails('aborts after 30 s without any progress and raises UPLOAD_STALLED', async () => {
    vi.useFakeTimers()
    const client = await realClient()
    const form = new FormData()
    form.append('file', pdf())

    const pending = client.upload('/documents/upload/', form, { idempotencyKey: 'sjr-key-0003' })
    const caught = pending.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(31_000)

    expect(FakeXhr.instances[0].aborted).toBe(true)
    expect(await caught).toMatchObject({ code: 'UPLOAD_STALLED', retryable: true })
  })
})
