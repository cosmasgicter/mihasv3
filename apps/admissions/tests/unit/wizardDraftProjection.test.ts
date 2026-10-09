/**
 * The pure rules the draft machine decides with (task 6.3 — R10.2, R10.3,
 * R10.4).
 */
import { describe, expect, it } from 'vitest'

import {
  classifyLocalDraftOutbox,
  draftAssignmentKey,
  fingerprintDraftProjection,
  mergeDraftAnswerProjections,
  pendingDraftBase,
  restoreDraftBase,
  sameDraftProjection,
} from '@/lib/wizardDraftProjection'

describe('fingerprintDraftProjection', () => {
  it('ignores key order and undefined members, so equal bodies share a fingerprint', () => {
    expect(fingerprintDraftProjection({ a: 1, b: 'x', c: undefined })).toBe(
      fingerprintDraftProjection({ b: 'x', a: 1 }),
    )
    expect(sameDraftProjection({ a: 1 }, { a: 2 })).toBe(false)
    expect(fingerprintDraftProjection(null)).toBeNull()
  })
})

describe('mergeDraftAnswerProjections', () => {
  it('keeps the student’s changes and adopts everything else from the newer version', () => {
    const result = mergeDraftAnswerProjections({
      base: { town: 'Kabwe', kin: 'Old', phone: '1' },
      mine: { town: 'Mine', kin: 'Old', phone: '1' },
      theirs: { town: 'Kabwe', kin: 'Theirs', phone: '2' },
    })
    expect(result.merged).toEqual({ town: 'Mine', kin: 'Theirs', phone: '2' })
    expect(result.keptMine).toEqual(['town'])
    expect(result.adoptedTheirs).toEqual(['kin', 'phone'])
  })

  it('on a field both devices changed, the student’s explicit choice wins', () => {
    const result = mergeDraftAnswerProjections({
      base: { town: 'Kabwe' },
      mine: { town: 'Mine' },
      theirs: { town: 'Theirs' },
    })
    expect(result.merged).toEqual({ town: 'Mine' })
  })
})

describe('classifyLocalDraftOutbox', () => {
  const target = { userId: 'u1', applicationId: 'app-1', serverVersion: 5 }
  const record = (overrides: Record<string, unknown> = {}) => ({
    userId: 'u1',
    applicationId: 'app-1',
    serverVersion: 5,
    pending: true,
    ...overrides,
  })

  it('replays pending edits made on exactly the server’s version', () => {
    expect(classifyLocalDraftOutbox(record(), target, true)).toBe('replay')
  })

  it('treats pending edits made on an older version as a stale command (a conflict)', () => {
    expect(classifyLocalDraftOutbox(record({ serverVersion: 3 }), target, true)).toBe('stale')
    expect(classifyLocalDraftOutbox(record({ serverVersion: null }), target, true)).toBe('stale')
  })

  it('never replays a clean copy, another draft’s record, another user’s, or nothing at all', () => {
    expect(classifyLocalDraftOutbox(record({ pending: false }), target, true)).toBe('none')
    expect(classifyLocalDraftOutbox(record({ applicationId: 'app-2' }), target, true)).toBe('none')
    expect(classifyLocalDraftOutbox(record({ userId: 'u2' }), target, true)).toBe('none')
    expect(classifyLocalDraftOutbox(record(), target, false)).toBe('none')
    expect(classifyLocalDraftOutbox(null, target, true)).toBe('none')
  })

  // Task 6.3 M14 (design §8.2): the record is addressed by (user, application, assignment).
  it('never replays a record addressed to another assignment, even on the same version', () => {
    const addressed = { ...target, assignment: 'off-b|in-b' }
    expect(classifyLocalDraftOutbox(record({ assignment: 'off-a|in-a' }), addressed, true)).toBe('reassigned')
    expect(classifyLocalDraftOutbox(record({ assignment: 'off-a|in-a', serverVersion: 3 }), addressed, true)).toBe(
      'reassigned',
    )
    expect(classifyLocalDraftOutbox(record({ assignment: 'off-b|in-b' }), addressed, true)).toBe('replay')
  })

  it('judges a record without an assignment (written before M14), or a row without one, by version alone', () => {
    expect(classifyLocalDraftOutbox(record(), { ...target, assignment: 'off-b|in-b' }, true)).toBe('replay')
    expect(classifyLocalDraftOutbox(record({ assignment: 'off-a|in-a' }), { ...target, assignment: null }, true)).toBe(
      'replay',
    )
    expect(classifyLocalDraftOutbox(record({ serverVersion: 4 }), { ...target, assignment: 'off-b|in-b' }, true)).toBe(
      'stale',
    )
  })
})

describe('draftAssignmentKey', () => {
  it('is the canonical offering and intake a draft row reports, or null without both', () => {
    expect(draftAssignmentKey({ program_offering_id: 'off-1', intake_id: 'in-1', program: 'Nursing' })).toBe(
      'off-1|in-1',
    )
    expect(draftAssignmentKey({ program_offering_id: 'off-1' })).toBeNull()
    expect(draftAssignmentKey({ intake_id: 'in-1' })).toBeNull()
    expect(draftAssignmentKey({ program_offering_id: ' ', intake_id: 'in-1' })).toBeNull()
    expect(draftAssignmentKey(null)).toBeNull()
  })
})

describe('pendingDraftBase / restoreDraftBase', () => {
  it('records only the changed answers, with their acknowledged values, and round-trips through JSON', () => {
    const base = pendingDraftBase({ town: 'Kabwe', kin: undefined, phone: '1' }, { town: 'Mine', kin: 'New', phone: '1' })
    expect(base).toEqual({ town: 'Kabwe', kin: null })
    expect(restoreDraftBase(JSON.parse(JSON.stringify(base)))).toEqual({ town: 'Kabwe', kin: undefined })
    expect(pendingDraftBase(null, { town: 'x' })).toBeNull()
    expect(restoreDraftBase('not an object')).toBeNull()
  })
})
