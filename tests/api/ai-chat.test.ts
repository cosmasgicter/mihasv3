import { vi, describe, it, expect, beforeEach } from 'vitest'
import path from 'path'

const supabaseClientPath = path.resolve(__dirname, '../../functions/_lib/supabaseClient.js')
const cloudflareAIPath = path.resolve(__dirname, '../../functions/_lib/cloudflareAI.js')

describe('AI Chat endpoint', () => {
  beforeEach(() => {
    vi.resetModules()
    // Mock supabase admin client
    vi.doMock(supabaseClientPath, () => {
      return {
        supabaseAdminClient: (url, key) => ({
          auth: {
            getUser: async (token) => ({ data: { user: { id: 'user-test' } }, error: null })
          }
        })
      }
    })

    // Mock CloudflareAI to return a predictable chat result
    vi.doMock(cloudflareAIPath, () => {
      return {
        CloudflareAI: class {
          constructor(env) { this.env = env }
          async chat(message, context) {
            return { response: `Echo: ${message}`, suggestions: ['Try uploading documents', 'Check eligibility'] }
          }
        }
      }
    })
  })

  it('returns model response on POST with valid token', async () => {
    const { onRequest } = await import('../../functions/api/ai/chat.js')

    const req = new Request('https://example.com/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ message: 'Hello AI', context: { foo: 'bar' } })
    })

    const res = await onRequest({ request: req, env: {} })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.response).toBe('Echo: Hello AI')
    expect(Array.isArray(data.suggestions)).toBe(true)
    expect(data.suggestions.length).toBeGreaterThan(0)
  })

  it('responds 401 when Authorization header missing', async () => {
    const { onRequest } = await import('../../functions/api/ai/chat.js')
    const req = new Request('https://example.com/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const res = await onRequest({ request: req, env: {} })
    expect(res.status).toBe(401)
  })

  it('supports OPTIONS preflight', async () => {
    const { onRequest } = await import('../../functions/api/ai/chat.js')
    const req = new Request('https://example.com/api/ai/chat', { method: 'OPTIONS' })
    const res = await onRequest({ request: req, env: {} })
    expect([204, 204]).toContain(res.status)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
})
