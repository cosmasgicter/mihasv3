import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { STAGED_ADMIN_PAGE_MODULES } from '@/pages/admin/featureRegistry'

const ROUTE_CONFIG_PATH = path.resolve(process.cwd(), 'src/routes/config.tsx')
const ADMIN_PAGES_DIR = path.resolve(process.cwd(), 'src/pages/admin')

function getRouteReachableAdminModules(): Set<string> {
  const routeConfig = fs.readFileSync(ROUTE_CONFIG_PATH, 'utf8')
  const matches = routeConfig.matchAll(/import\('(@\/pages\/admin\/[^']+)'\)/g)
  return new Set(Array.from(matches, (match) => match[1]))
}

function getAdminPageModules(): string[] {
  return fs
    .readdirSync(ADMIN_PAGES_DIR)
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => `@/pages/admin/${file.replace(/\.tsx$/, '')}`)
}

describe('admin page route coverage', () => {
  it('keeps every admin page route-reachable or explicitly staged', () => {
    const routeReachable = getRouteReachableAdminModules()
    const staged = new Set(STAGED_ADMIN_PAGE_MODULES)
    const allowed = new Set([...routeReachable, ...staged])

    const uncoveredModules = getAdminPageModules().filter((modulePath) => !allowed.has(modulePath))

    expect(uncoveredModules, `Unreachable admin pages: ${uncoveredModules.join(', ')}`).toEqual([])
  })
})
