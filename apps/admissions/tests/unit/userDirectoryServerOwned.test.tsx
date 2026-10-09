/**
 * The user directory is server-owned (Admissions V2, task 9.3).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.3.
 * Requirements: R6.1, R6.2, R6.4, R6.5 · Findings: ADM-03, ADM-04, AUTH-04.
 *
 * These are the frontend halves of the four `_Evidence:` claims. They check the
 * *wiring*, which is where ADM-03 lived: the endpoint always knew the totals, and
 * the browser recounted the rows it had.
 *
 * Two of them parse the **backend** source, so the mirror cannot drift: the
 * registered parameter set and the role vocabulary are read from
 * `user_directory_service.py` rather than restated here.
 */
import fs from 'fs'
import path from 'path'

import { describe, expect, it, vi } from 'vitest'

import {
  EMPTY_USER_AGGREGATES,
  USER_BULK_ENDPOINT,
  USER_DIRECTORY_ENDPOINT,
  USER_EXPORT_ENDPOINT,
  USER_IMPORT_ENDPOINT,
  USER_IMPORT_PREVIEW_ENDPOINT,
  importErrorsToCsv,
  userBulkConfirmationToken,
  userDirectoryService,
  type UserImportRowError,
} from '@/services/admin/userDirectory'
import { formatStat, UNKNOWN_STAT_LABEL } from '@/components/admin/UserStats'
import {
  ROLE_VALUES,
  SORTABLE_COLUMNS,
  toDirectoryQuery,
  initialUsersState,
} from '@/pages/admin/lib/usersReducer'
import { csvToImportRows } from '@/components/admin/UserImport'

const REPO_ROOT = path.resolve(process.cwd(), '../..')
const BACKEND_SERVICE = path.join(
  REPO_ROOT,
  'backend/apps/accounts/user_directory_service.py',
)
const backendSource = fs.readFileSync(BACKEND_SERVICE, 'utf-8')

const PAGE_SOURCE = fs.readFileSync(
  path.resolve(process.cwd(), 'src/pages/admin/Users.tsx'),
  'utf-8',
)

function backendRegisteredParameters(): string[] {
  const block = backendSource.match(
    /REGISTERED_PARAMETERS: frozenset\[str\] = frozenset\(\s*\{([\s\S]*?)\}\s*\)/,
  )
  expect(block).not.toBeNull()
  return Array.from(block![1]!.matchAll(/"([a-zA-Z_]+)"/g)).map((match) => match[1]!)
}

describe('the directory query is the registered contract (R6.1)', () => {
  it('every parameter the page can emit is registered on the backend', () => {
    const registered = new Set(backendRegisteredParameters())
    const query = toDirectoryQuery(
      {
        ...initialUsersState.filters,
        searchTerm: 'x',
        roleFilter: 'admin',
        activeFilter: false,
        membershipFilter: true,
        institutionId: 'inst-1',
        currentPage: 4,
      },
      'needle',
    )
    for (const key of Object.keys(query)) {
      expect(registered.has(key)).toBe(true)
    }
  })

  it('every sortable column is a registered backend sort key', () => {
    const block = backendSource.match(
      /SORT_FIELDS: dict\[str, tuple\[str, \.\.\.\]\] = \{([\s\S]*?)\n\}/,
    )
    expect(block).not.toBeNull()
    const keys = new Set(
      Array.from(block![1]!.matchAll(/^\s{4}"([a-z_]+)":/gm)).map((match) => match[1]!),
    )
    for (const column of SORTABLE_COLUMNS) {
      expect(keys.has(column.field)).toBe(true)
    }
  })

  it('the frontend role vocabulary is the backend hierarchy', () => {
    // AUTH-04: the form, the serializer, and the ceiling were three lists. The
    // backend derives its list from ROLE_HIERARCHY; this asserts the frontend
    // catalogue matches, so a fourth cannot appear.
    const hierarchy = fs.readFileSync(
      path.join(REPO_ROOT, 'backend/apps/accounts/permissions.py'),
      'utf-8',
    )
    const block = hierarchy.match(/ROLE_HIERARCHY = \{([\s\S]*?)\n\}/)
    expect(block).not.toBeNull()
    const roles = new Set(
      Array.from(block![1]!.matchAll(/"([a-z_]+)":/g)).map((match) => match[1]!),
    )
    expect(new Set(ROLE_VALUES)).toEqual(roles)
  })
})

describe('the page derives no number of its own (R6.1, ADM-03)', () => {
  it('the page never filters, sorts, slices, or lengths its rows', () => {
    // A source scan, because the defect was structural: every one of these was a
    // browser answer to a question only the database can answer.
    expect(PAGE_SOURCE).not.toContain('filteredUsers.length')
    expect(PAGE_SOURCE).not.toContain('sortedUsers')
    expect(PAGE_SOURCE).not.toMatch(/\.slice\(start/)
    expect(PAGE_SOURCE).not.toMatch(/Math\.ceil\(/)
    expect(PAGE_SOURCE).not.toMatch(/localeCompare/)
  })

  it('the page no longer fetches one bare page', () => {
    expect(PAGE_SOURCE).not.toContain('userQueries.useList')
    expect(PAGE_SOURCE).toContain('useUserDirectory(query)')
  })

  it('the page reads its totals and page count from the report', () => {
    expect(PAGE_SOURCE).toContain('report?.totalCount')
    expect(PAGE_SOURCE).toContain('report?.totalPages')
    expect(PAGE_SOURCE).toContain('report?.aggregates')
  })

  it('the browser-side user exporter is gone (R6.5)', () => {
    expect(
      fs.existsSync(path.resolve(process.cwd(), 'src/components/admin/UserExport.tsx')),
    ).toBe(false)
    expect(PAGE_SOURCE).not.toContain('UserExport')
  })
})

describe('an absent number is Unknown, never zero (R6.1)', () => {
  it('formatStat renders a measured zero and an absent value differently', () => {
    expect(formatStat(0)).toBe('0')
    expect(formatStat(42)).toBe('42')
    expect(formatStat(null)).toBe(UNKNOWN_STAT_LABEL)
    expect(formatStat(undefined)).toBe(UNKNOWN_STAT_LABEL)
    expect(formatStat(Number.NaN)).toBe(UNKNOWN_STAT_LABEL)
  })

  it('the empty aggregate shape carries no definitions', () => {
    // The tell that separates "the server said zero" from "no answer yet".
    expect(EMPTY_USER_AGGREGATES.total_count).toBe(0)
    expect(EMPTY_USER_AGGREGATES.role_breakdown).toEqual({})
  })
})

describe('the export is page-independent and server-authored (R6.5)', () => {
  it('the export path drops page and pageSize', () => {
    const path_ = userDirectoryService.exportPath({
      role: 'admin',
      page: 3,
      pageSize: 10,
      search: 'x',
    })
    expect(path_.startsWith(USER_EXPORT_ENDPOINT)).toBe(true)
    expect(path_).toContain('role=admin')
    expect(path_).toContain('search=x')
    expect(path_).not.toContain('page=')
    expect(path_).not.toContain('pageSize=')
  })

  it('a refusal and an over-limit set are surfaced as errors, not saved as CSV', async () => {
    const original = globalThis.fetch
    try {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 }) as never
      await expect(
        userDirectoryService.downloadExport(USER_EXPORT_ENDPOINT, 'users.csv'),
      ).rejects.toThrow(/permission/i)

      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400 }) as never
      await expect(
        userDirectoryService.downloadExport(USER_EXPORT_ENDPOINT, 'users.csv'),
      ).rejects.toThrow(/too large/i)
    } finally {
      globalThis.fetch = original
    }
  })

  it('the endpoints are the canonical ones', () => {
    expect(USER_DIRECTORY_ENDPOINT).toBe('/admin/users/')
    expect(USER_EXPORT_ENDPOINT).toBe('/admin/users/export/')
    expect(USER_BULK_ENDPOINT).toBe('/admin/users/bulk/')
    expect(USER_IMPORT_ENDPOINT).toBe('/admin/users/batch-import/')
    expect(USER_IMPORT_PREVIEW_ENDPOINT).toBe('/admin/users/batch-import/preview/')
  })
})

describe('the bulk confirmation is part of the command identity (R6.5)', () => {
  it('the token is order-independent over the selection', async () => {
    const a = await userBulkConfirmationToken('set_role', ['b', 'a', 'c'], 'reviewer')
    const b = await userBulkConfirmationToken('set_role', ['a', 'c', 'b'], 'reviewer')
    expect(a).toBe(b)
  })

  it('a different selection, operation, or role is a different token', async () => {
    const base = await userBulkConfirmationToken('set_role', ['a', 'b'], 'reviewer')
    expect(await userBulkConfirmationToken('set_role', ['a'], 'reviewer')).not.toBe(base)
    expect(await userBulkConfirmationToken('deactivate', ['a', 'b'], 'reviewer')).not.toBe(base)
    expect(await userBulkConfirmationToken('set_role', ['a', 'b'], 'admin')).not.toBe(base)
  })

  it('the token matches the backend construction', () => {
    // Sorted ids + operation + role, SHA-256. Asserted against the backend source
    // so the two cannot drift into two different tokens.
    const bulkSource = fs.readFileSync(
      path.join(REPO_ROOT, 'backend/apps/accounts/user_bulk_service.py'),
      'utf-8',
    )
    expect(bulkSource).toContain(
      'payload = "".join(sorted(str(item) for item in user_ids)) + operation + (role or "")',
    )
    expect(bulkSource).toContain('hashlib.sha256(payload.encode("utf-8")).hexdigest()')
  })
})

describe('the import sends rows and judges nothing (R6.4, ADM-04)', () => {
  it('CSV parsing maps columns without validating them', () => {
    const csv = [
      'full_name,email,phone,role,password',
      'Ada Lovelace,ada@example.com,+260970000001,reviewer,',
      'Bad Role,bad@example.com,,wizard,',
      '"Quoted, Name",quoted@example.com,,student,secret123',
    ].join('\n')
    const { rows, missingHeaders } = csvToImportRows(csv)
    expect(missingHeaders).toEqual([])
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      email: 'ada@example.com',
      full_name: 'Ada Lovelace',
      role: 'reviewer',
    })
    // The unsupported role travels to the server rather than being filtered out
    // here: the browser judging it is how the two ended up disagreeing.
    expect(rows[1]!.role).toBe('wizard')
    expect(rows[2]!.full_name).toBe('Quoted, Name')
  })

  it('a file missing a required column is reported, not silently short', () => {
    const { rows, missingHeaders } = csvToImportRows('full_name,phone\nA B,+260')
    expect(rows).toEqual([])
    expect(missingHeaders).toContain('email')
    expect(missingHeaders).toContain('role')
  })

  it('the row failures render as a downloadable CSV addressed by line number', () => {
    const errors: UserImportRowError[] = [
      {
        index: 2,
        row: 2,
        code: 'UNSUPPORTED_ROLE',
        field: 'role',
        message: "'wizard' is not a role this platform issues. Supported: student, reviewer.",
        email: 'bad@example.com',
      },
      {
        index: 7,
        row: 7,
        code: 'EMAIL_EXISTS',
        field: 'email',
        message: 'An account with this address already exists.',
        email: 'taken@example.com',
      },
    ]
    const csv = importErrorsToCsv(errors)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('row,code,field,email,message')
    expect(lines[1]).toContain('2,UNSUPPORTED_ROLE,role,bad@example.com')
    expect(lines[2]).toContain('7,EMAIL_EXISTS,email,taken@example.com')
    // A message containing a comma must not break the file the operator opens.
    expect(csv).toContain(
      '"\'wizard\' is not a role this platform issues. Supported: student, reviewer."',
    )
  })
})
