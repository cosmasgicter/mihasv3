// @vitest-environment node
// Feature: production-stability-hardening — PWA cleanup verification
// Validates: Requirements 4.1, 4.2, 5.1, 5.2, 5.5, 6.2, 6.5

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const resolve = (...segments: string[]) => path.resolve(root, ...segments)

describe('PWA package removal verification', () => {
  it('package.json has no vite-plugin-pwa in dependencies', () => {
    const pkg = JSON.parse(fs.readFileSync(resolve('package.json'), 'utf-8'))
    const deps = pkg.dependencies ?? {}
    expect(deps).not.toHaveProperty('vite-plugin-pwa')
  })

  it('package.json has no workbox-* packages in devDependencies', () => {
    const pkg = JSON.parse(fs.readFileSync(resolve('package.json'), 'utf-8'))
    const devDeps = Object.keys(pkg.devDependencies ?? {})
    const workboxPkgs = devDeps.filter((d) => d.startsWith('workbox-'))
    expect(workboxPkgs).toEqual([])
  })

  it('vite-env.d.ts has no vite-plugin-pwa/client reference', () => {
    const content = fs.readFileSync(resolve('src', 'vite-env.d.ts'), 'utf-8')
    expect(content).not.toContain('vite-plugin-pwa/client')
  })

  it('tsconfig.build.json has no vite-plugin-pwa/client in types array', () => {
    const content = fs.readFileSync(resolve('tsconfig.build.json'), 'utf-8')
    expect(content).not.toContain('vite-plugin-pwa/client')
  })

  it('deleted test file serviceWorkerCache.test.ts does not exist', () => {
    expect(fs.existsSync(resolve('tests', 'unit', 'serviceWorkerCache.test.ts'))).toBe(false)
  })

  it('deleted test file swAuthEndpointsNeverCached.property.test.ts does not exist', () => {
    expect(
      fs.existsSync(resolve('tests', 'property', 'swAuthEndpointsNeverCached.property.test.ts')),
    ).toBe(false)
  })

  it('pushNotificationManager.ts has @deprecated annotation', () => {
    const content = fs.readFileSync(
      resolve('src', 'services', 'pushNotificationManager.ts'),
      'utf-8',
    )
    expect(content).toContain('@deprecated')
  })

  it('main.tsx still contains SW unregistration block', () => {
    const content = fs.readFileSync(resolve('src', 'main.tsx'), 'utf-8')
    expect(content).toContain('serviceWorker')
    expect(content).toContain('getRegistrations')
    expect(content).toContain('unregister')
  })
})
