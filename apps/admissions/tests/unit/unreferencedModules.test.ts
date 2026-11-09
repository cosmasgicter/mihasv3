// @vitest-environment node
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  ENTRY,
  evaluate,
  globToRegExp,
  isOk,
  reachableFrom,
  type GraphNode,
} from '../../../../scripts/unreferenced-modules'

// Task 3.2 / 3.5: the unreachable-module check and its list rules (Requirements 2.4, 2.5).

const node = (path: string, ...imports: string[]): GraphNode => ({ path, imports })

describe('reachableFrom', () => {
  it('follows imports transitively from the entry', () => {
    const nodes = [node('main.tsx', 'a.ts'), node('a.ts', 'b.ts'), node('b.ts'), node('c.ts')]
    expect([...reachableFrom(nodes, ['main.tsx'])].sort()).toEqual(['a.ts', 'b.ts', 'main.tsx'])
  })

  it('does not treat a test file as a way to reach a module', () => {
    const nodes = [node('main.tsx', 'a.test.ts'), node('a.test.ts', 'b.ts'), node('b.ts')]
    expect(reachableFrom(nodes, ['main.tsx']).has('b.ts')).toBe(false)
  })

  it('survives an import cycle', () => {
    const nodes = [node('main.tsx', 'a.ts'), node('a.ts', 'b.ts'), node('b.ts', 'a.ts')]
    expect(reachableFrom(nodes, ['main.tsx']).size).toBe(3)
  })
})

describe('globToRegExp', () => {
  it('matches a suffix glob and nothing else', () => {
    const re = globToRegExp('apps/x/*.d.ts')
    expect(re.test('apps/x/vite-env.d.ts')).toBe(true)
    expect(re.test('apps/x/vite-env-dts')).toBe(false)
  })
})

describe('evaluate', () => {
  const graph = [node(ENTRY, 'a.ts'), node('a.ts'), node('orphan.ts'), node('types.d.ts')]

  it('reports an unreachable module that is on no list', () => {
    const v = evaluate(graph, [ENTRY], [], [])
    expect(v.offenders).toEqual(['orphan.ts', 'types.d.ts'])
    expect(isOk(v)).toBe(false)
  })

  it('accepts an allowlisted glob and a baselined module', () => {
    const v = evaluate(
      graph,
      [ENTRY],
      [{ module: '*.d.ts', reason: 'ambient' }],
      [{ module: 'orphan.ts', reason: 'awaiting D15' }]
    )
    expect(v.offenders).toEqual([])
    expect(isOk(v)).toBe(true)
  })

  it('rejects an entry without a reason', () => {
    const v = evaluate(graph, [ENTRY], [], [{ module: 'orphan.ts', reason: ' ' }])
    expect(v.invalidEntries).toHaveLength(1)
    expect(isOk(v)).toBe(false)
  })

  it('fails an allowlist entry that matches no module', () => {
    const v = evaluate(graph, [ENTRY], [{ module: 'gone/*.d.ts', reason: 'x' }], [])
    expect(v.staleAllowlist).toHaveLength(1)
  })

  it('does not exempt test files from being ignored', () => {
    const v = evaluate([node(ENTRY), node('a.test.ts')], [ENTRY], [], [])
    expect(v.offenders).toEqual([])
  })
})

describe('Property 5: stale baseline entries fail (TypeScript check)', () => {
  // **Validates: Requirements 2.5, 19.4**
  const name = fc.stringMatching(/^[a-z]{1,6}\.ts$/)

  it('a baseline entry for a module that is gone fails', () => {
    fc.assert(
      fc.property(fc.uniqueArray(name, { minLength: 1, maxLength: 6 }), name, (modules, ghost) => {
        fc.pre(!modules.includes(ghost) && ghost !== ENTRY)
        const nodes = [node(ENTRY), ...modules.map((m) => node(m))]
        const v = evaluate(nodes, [ENTRY], [], [{ module: ghost, reason: 'r' }])
        return v.staleBaseline.length === 1 && !isOk(v)
      })
    )
  })

  it('a baseline entry for a module that became reachable fails', () => {
    fc.assert(
      fc.property(fc.uniqueArray(name, { minLength: 1, maxLength: 6 }), (modules) => {
        fc.pre(!modules.includes(ENTRY))
        const nodes = [node(ENTRY, ...modules), ...modules.map((m) => node(m))]
        const v = evaluate(nodes, [ENTRY], [], [{ module: modules[0], reason: 'r' }])
        return v.staleBaseline.length === 1 && !isOk(v)
      })
    )
  })

  it('a baseline entry that still matches an unreachable module passes', () => {
    fc.assert(
      fc.property(fc.uniqueArray(name, { minLength: 1, maxLength: 6 }), (modules) => {
        fc.pre(!modules.includes(ENTRY))
        const nodes = [node(ENTRY), ...modules.map((m) => node(m))]
        const v = evaluate(nodes, [ENTRY], [], modules.map((m) => ({ module: m, reason: 'r' })))
        return isOk(v)
      })
    )
  })
})
