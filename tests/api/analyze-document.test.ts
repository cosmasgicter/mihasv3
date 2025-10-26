import { vi, describe, it, expect, beforeEach } from 'vitest'
import path from 'path'

const supabaseClientPath = path.resolve(__dirname, '../../functions/_lib/supabaseClient.js')
const cloudflareAIPath = path.resolve(__dirname, '../../functions/_lib/cloudflareAI.js')

describe('AI analyze-document endpoint', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock(supabaseClientPath, () => {
      return {
        supabaseAdminClient: (url, key) => ({
          auth: {
            getUser: async (token) => ({ data: { user: { id: 'user-test' } }, error: null })
          }
        })
      }
    })

    vi.doMock(cloudflareAIPath, () => {
      return {
        CloudflareAI: class {
          constructor(env) { this.env = env }
          async analyzeDocument(text, documentType) {
            return { type: documentType, summary: `Parsed ${documentType}: ${String(text).slice(0,20)}` }
          }
        }
      }
    })
  })

  it('returns parsed JSON for valid request', async () => {
    const { onRequest } = await import('../../functions/api/ai/analyze-document.js')
    const req = new Request('https://example.com/api/ai/analyze-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ text: 'This is a result slip with ID 12345', documentType: 'result_slip' })
    })

    const res = await onRequest({ request: req, env: {} })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.type).toBe('result_slip')
    expect(typeof data.summary).toBe('string')
  })

  it('returns 401 when not authorized', async () => {
    const { onRequest } = await import('../../functions/api/ai/analyze-document.js')
    const req = new Request('https://example.com/api/ai/analyze-document', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const res = await onRequest({ request: req, env: {} })
    expect(res.status).toBe(401)
  })

  it('supports OPTIONS', async () => {
    const { onRequest } = await import('../../functions/api/ai/analyze-document.js')
    const req = new Request('https://example.com/api/ai/analyze-document', { method: 'OPTIONS' })
    const res = await onRequest({ request: req, env: {} })
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
})
