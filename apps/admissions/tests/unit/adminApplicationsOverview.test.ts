/**
 * The roster's overview numbers are the server's (task 9.1 supersedes ADM-01).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.1
 * Requirements: **R8.1**, **R8.6** · Findings: **ADM-01**.
 *
 * This file used to test `buildApplicationsOverview(applications, totalCount)` —
 * a browser function that filtered the **currently loaded page** to produce
 * "pending review", "decision queue", "accepted path", "today", and the four
 * payment tallies, then handed them to the roster as portfolio facts. That
 * function *is* finding ADM-01, so it was deleted along with its last consumer
 * rather than re-tested; `src/pages/admin/lib/applicationsOverview.ts` no longer
 * exists.
 *
 * None of its three claims was dropped. Each is restated here against the
 * contract that now answers it — an SQL aggregate over the whole filtered set
 * (`backend/apps/applications/query_service.py`), reached through
 * `GET /api/v1/admin/applications/`:
 *
 * | Old claim | Where it lives now |
 * |---|---|
 * | "prefers the API total count over the loaded page length" | `aggregates.total` **is** the count, and this file pins that a page of rows can never stand in for it |
 * | "counts updated drafts and submitted applications as active today" | `aggregates.today_activity_count`, computed from `activity_at` in SQL |
 * | "separates strict approval from the wider accepted path" | `aggregates.approved_count` vs `aggregates.accepted_count`, whose status set is drift-guarded against `ACCEPTED_APPLICATION_STATUSES` |
 *
 * The equality of those aggregates to an independent raw-SQL count over the same
 * filtered set is proven in
 * `backend/tests/unit/test_application_query_contract_9_1.py::TestAggregatesEqualIndependentSql`;
 * their page-independence in `tests/unit/applicationRosterServerOwned.test.tsx`.
 * What is pinned here is that the deleted derivation cannot come back.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  EMPTY_APPLICATION_AGGREGATES,
  type ApplicationAggregates,
} from '@/services/admin/applications'
import { ACCEPTED_APPLICATION_STATUSES } from '@/types/applicationStatus'

const repoRoot = resolve(__dirname, '../../../..')
const read = (relative: string) => readFileSync(resolve(repoRoot, relative), 'utf8')

describe('the page-derived overview builder is gone (ADM-01)', () => {
  it('no longer exists as a module', () => {
    expect(
      existsSync(resolve(repoRoot, 'apps/admissions/src/pages/admin/lib/applicationsOverview.ts')),
    ).toBe(false)
  })

  it('is referenced by nothing under src/', () => {
    const hits = [
      'apps/admissions/src/pages/admin/Applications.tsx',
      'apps/admissions/src/pages/admin/Dashboard.tsx',
      'apps/admissions/src/hooks/admin/useApplicationsData.ts',
      'apps/admissions/src/hooks/admin/index.ts',
    ].filter(path => read(path).includes('buildApplicationsOverview'))
    expect(hits).toEqual([])
  })
})

describe('the numbers it used to derive are now server aggregates', () => {
  it('publishes each of the three superseded claims as its own counter', () => {
    const keys = Object.keys(EMPTY_APPLICATION_AGGREGATES) as (keyof ApplicationAggregates)[]
    // total (was `total`/`loadedCount`), today (was `todaySubmissions`), and the
    // strict-vs-wider approval pair (was `approved`/`accepted`).
    expect(keys).toContain('total')
    expect(keys).toContain('today_activity_count')
    expect(keys).toContain('approved_count')
    expect(keys).toContain('accepted_count')
    // The payment tallies the browser used to count row by row.
    expect(keys).toContain('payment_resolved_count')
    expect(keys).toContain('payment_pending_count')
    expect(keys).toContain('payment_rejected_count')
    expect(keys).toContain('payment_unpaid_count')
    // And no `loadedCount`: how many rows arrived is a property of the page, not
    // a number an operator should read as a portfolio fact.
    expect(keys).not.toContain('loadedCount')
  })

  it('keeps the strict/wider distinction the old test asserted', () => {
    // `accepted` was "approved OR conditionally_approved OR enrolled"; the
    // backend counts the same set, and its membership is drift-guarded on the
    // Python side against this very constant.
    expect([...ACCEPTED_APPLICATION_STATUSES].sort()).toEqual(
      ['approved', 'conditionally_approved', 'enrolled'].sort(),
    )
    const backend = read('backend/apps/applications/query_service.py')
    const block = backend.split('ACCEPTED_STATUSES: tuple[str, ...] = (', 2)[1].split(')', 1)[0]
    for (const status of ACCEPTED_APPLICATION_STATUSES) {
      expect(block).toContain(`"${status}"`)
    }
  })

  it('distinguishes "the server said zero" from "there is no answer yet" (R8.6)', () => {
    // The empty shape exists only for a response with no aggregates block at
    // all, and it is recognisable: no definitions means no answer. The hook
    // itself returns `null` rather than this shape while loading or after a
    // failure, so a healthy zero cannot be invented.
    expect(EMPTY_APPLICATION_AGGREGATES.total).toBe(0)
    expect(EMPTY_APPLICATION_AGGREGATES.definitions).toEqual({})
    const hook = read('apps/admissions/src/hooks/admin/useApplicationsData.ts')
    expect(hook).toContain('report?.aggregates ?? null')
  })
})
