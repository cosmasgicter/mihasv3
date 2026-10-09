/**
 * Task 11.1 — a path that already names its API version keeps it.
 *
 * Requirements: R13.1, R14.4. Finding: STU-04.
 *
 * `toApiV1Path` prefixed `/api/v1` onto anything that was not already `/api/v1/`,
 * so the V2 namespace was unreachable from the shared client: task 6.5's
 * authoritative readiness lives at `/api/v2/student/applications/{id}/readiness/`
 * and would have been requested as `/api/v1/api/v2/...`. The dashboard is the
 * first student surface to consume a V2 contract, which is why this is 11.1's
 * change and not 1.4's.
 *
 * The second half of the file is the one that matters: the change must be
 * **observationally inert** for every path the app actually sends today. No
 * first-party caller passes a versioned path other than `/api/v1/`, and these
 * cases pin that the V1 behaviour — prefixing, idempotence, slash
 * deduplication, absolute-URL passthrough — is unchanged.
 */
import { describe, expect, it } from 'vitest'

import { toApiV1Path, getServiceName } from '@/services/apiHelpers'
import { studentReadinessPath } from '@/services/studentReadiness'

describe('a versioned path is left alone', () => {
  it('keeps /api/v2 rather than nesting a second version under v1', () => {
    expect(toApiV1Path('/api/v2/student/applications/abc/readiness/')).toBe(
      '/api/v2/student/applications/abc/readiness/',
    )
  })

  it('routes task 6.5\u2019s readiness read to the path the backend serves', () => {
    // `backend/apps/common/v2/urls.py` mounts
    // `student/applications/<uuid:application_id>/readiness/` under `/api/v2/`.
    expect(toApiV1Path(studentReadinessPath('11111111-1111-1111-1111-111111111111'))).toBe(
      '/api/v2/student/applications/11111111-1111-1111-1111-111111111111/readiness/',
    )
  })

  it('is idempotent for a versioned path', () => {
    const once = toApiV1Path('/api/v2/auth/session/')
    expect(toApiV1Path(once)).toBe(once)
  })

  it('encodes a hostile application id into a single path segment', () => {
    const path = studentReadinessPath('a/../../admin')
    expect(path).toBe('/api/v2/student/applications/a%2F..%2F..%2Fadmin/readiness/')
    expect(toApiV1Path(path)).toBe(path)
  })

  it('names the resource for logging on either version', () => {
    expect(getServiceName('/api/v1/applications/1/')).toBe('applications')
    expect(getServiceName('/api/v2/student/applications/1/readiness/')).toBe('student')
  })
})

describe('V1 behaviour is unchanged', () => {
  it('still prefixes an unversioned path', () => {
    expect(toApiV1Path('/applications/')).toBe('/api/v1/applications/')
    expect(toApiV1Path('applications/')).toBe('/api/v1/applications/')
  })

  it('still passes an /api/v1 path through, including the bare query form', () => {
    expect(toApiV1Path('/api/v1/applications/')).toBe('/api/v1/applications/')
    expect(toApiV1Path('/api/v1?mine=true')).toBe('/api/v1?mine=true')
  })

  it('still deduplicates consecutive slashes', () => {
    expect(toApiV1Path('//applications//1//')).toBe('/api/v1/applications/1/')
  })

  it('still passes absolute URLs through untouched', () => {
    expect(toApiV1Path('https://api.beanola.com/api/v1/applications/')).toBe(
      'https://api.beanola.com/api/v1/applications/',
    )
  })

  it('does not treat a resource that merely starts with "v" as a version', () => {
    expect(toApiV1Path('/verify/')).toBe('/api/v1/verify/')
    expect(toApiV1Path('/api/version/')).toBe('/api/v1/api/version/')
  })
})
