import { describe, expect, it } from 'vitest'

import {
  createDevApiProxyConfig,
  resolveDevApiProxyTarget,
} from '@/lib/devApiProxy'

describe('devApiProxy', () => {
  it('defaults to the local API server on port 3001', () => {
    expect(resolveDevApiProxyTarget({})).toBe('http://127.0.0.1:3001')
  })

  it('uses explicit proxy target overrides when provided', () => {
    expect(resolveDevApiProxyTarget({
      VITE_DEV_API_PROXY_TARGET: 'http://localhost:4010/',
    })).toBe('http://localhost:4010')
  })

  it('supports overriding just the local API port', () => {
    expect(resolveDevApiProxyTarget({
      VITE_DEV_API_PORT: '3100',
    })).toBe('http://127.0.0.1:3100')
  })

  it('builds a vite proxy config for /api requests', () => {
    expect(createDevApiProxyConfig({
      VITE_DEV_API_PROXY_TARGET: 'http://localhost:3001',
    })).toEqual({
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      }
    })
  })
})
