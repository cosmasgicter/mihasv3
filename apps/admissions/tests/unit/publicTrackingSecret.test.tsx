/**
 * Public tracking, client side (admissions-v2 task 10.5).
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/`
 * Requirements: R13.12, R2.4, R14
 * Findings:     STU-22 (frontend share/fields do not match the backend response)
 *
 * The backend half of this task lives in
 * `backend/tests/unit/test_public_tracking_secret_10_5.py`. What can only be
 * asserted here is the part STU-22 names last: the client's own contract. Three
 * things were wrong on this side, and each has cases below:
 *
 * 1. the tracker read `program_name` / `intake_name` / `updated_at` that the
 *    backend never sent (two were papered over with `??` fallbacks; `updated_at`
 *    rendered "Not available" forever);
 * 2. it read `feedback_summary` / `admin_feedback` / `admin_feedback_date` and
 *    rendered a "Message from Admissions" panel from them — reviewer notes on an
 *    unauthenticated page, waiting for someone to supply the missing field;
 * 3. "Copy Link" shared `window.location.href`, which for a result reached by
 *    typing the code is `/track-application` — a URL that tracks nothing — and
 *    "Copy Number" offered the application number as the thing to pass on.
 *
 * Validates: Requirements R13.12, R14.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  buildTrackerShareUrl,
  isTrackingSecret,
  normalizeSearchTerm,
  validateSearchTerm,
} from '@/pages/public/tracker/utils/trackerUtils'
import { ShareModal } from '@/pages/public/tracker/components/ShareModal'
import { ApplicationStatusDetails } from '@/pages/public/tracker/components/ApplicationStatusDetails'
import type { PublicApplicationStatus } from '@/pages/public/tracker/hooks/useApplicationTracker'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const REPO_ROOT = resolve(__dirname, '../../../..')
const VALID_SECRET = 'TRK-4KP2M9XT-9QW3RT7VZ2KDN8YH6JF4'

/** The whole published contract — mirrored from the backend serializer. */
const PUBLISHED_FIELDS = [
  'application_number',
  'status',
  'program_name',
  'intake_name',
  'institution',
  'submitted_at',
  'updated_at',
] as const

describe('the tracking secret shape (mirror of tracking_secret.py)', () => {
  it('accepts the platform’s own token shape', () => {
    expect(isTrackingSecret(VALID_SECRET)).toBe(true)
  })

  it('accepts it case-insensitively, because a student may retype it', () => {
    expect(isTrackingSecret(VALID_SECRET.toLowerCase())).toBe(true)
    expect(normalizeSearchTerm(VALID_SECRET.toLowerCase())).toBe(VALID_SECRET)
  })

  it('rejects an application number', () => {
    expect(isTrackingSecret('BNL202500001')).toBe(false)
    expect(isTrackingSecret('MIHAS202500042')).toBe(false)
  })

  it('rejects a legacy tracking code', () => {
    expect(isTrackingSecret('TRK-ABCDEF123456')).toBe(false)
    expect(isTrackingSecret('TRK-BNL2025ABCDEF')).toBe(false)
    expect(isTrackingSecret('TRK370990')).toBe(false)
  })

  it('rejects the ambiguous characters the alphabet excludes', () => {
    expect(isTrackingSecret('TRK-IIIIIIII-9QW3RT7VZ2KDN8YH6JF4')).toBe(false)
    expect(isTrackingSecret('TRK-4KP2M9XT-OOOOOOOOOOOOOOOOOOOO')).toBe(false)
  })

  it('keeps input validation permissive so a pasted number is explained, not scolded', () => {
    // The server decides authority; the client only rejects input that could not
    // be any identifier at all.
    expect(validateSearchTerm('BNL202500001')).toBe(true)
    expect(validateSearchTerm(VALID_SECRET)).toBe(true)
    expect(validateSearchTerm('has spaces and $')).toBe(false)
  })

  it('mirrors the backend pattern exactly', () => {
    const python = readFileSync(
      resolve(REPO_ROOT, 'backend/apps/applications/tracking_secret.py'),
      'utf8',
    )
    expect(python).toContain('SELECTOR_LENGTH = 8')
    expect(python).toContain('VERIFIER_LENGTH = 20')
    expect(python).toContain('ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"')
  })
})

describe('the share URL carries the token and nothing else (STU-22)', () => {
  it('is built from the tracking secret, not the address bar', () => {
    const url = buildTrackerShareUrl(VALID_SECRET, 'https://apply.example.edu')
    expect(url).toBe(`https://apply.example.edu/track-application?code=${VALID_SECRET}`)
  })

  it('carries no application number, name or email', () => {
    const url = buildTrackerShareUrl(VALID_SECRET, 'https://apply.example.edu')
    for (const pii of ['BNL202500001', 'Jane', 'jane@example.com']) {
      expect(url).not.toContain(pii)
    }
    // The only query parameter is the token.
    expect(new URL(url).searchParams.get('code')).toBe(VALID_SECRET)
    expect([...new URL(url).searchParams.keys()]).toEqual(['code'])
  })

  it('round-trips through the tracker’s own normaliser', () => {
    const url = buildTrackerShareUrl(VALID_SECRET.toLowerCase(), 'https://apply.example.edu')
    const code = new URL(url).searchParams.get('code') as string
    expect(isTrackingSecret(code)).toBe(true)
  })
})

describe('the published contract is the one the client declares (R14)', () => {
  it('declares exactly the backend serializer’s field set', () => {
    const source = readFileSync(
      resolve(REPO_ROOT, 'apps/admissions/src/services/publicTracking.ts'),
      'utf8',
    )
    const block = source.split('export interface PublicTrackingStatus {')[1].split('}')[0]
    const declared = [...block.matchAll(/^\s*(\w+)\??:/gm)].map((match) => match[1]).sort()
    expect(declared).toEqual([...PUBLISHED_FIELDS].sort())
  })

  it('no longer declares the fields the backend never sent', () => {
    const source = readFileSync(
      resolve(REPO_ROOT, 'apps/admissions/src/services/publicTracking.ts'),
      'utf8',
    )
    const block = source.split('export interface PublicTrackingStatus {')[1].split('}')[0]
    for (const ghost of [
      'feedback_summary',
      'admin_feedback',
      'admin_feedback_date',
      'public_tracking_code',
      'created_at',
    ]) {
      expect(block).not.toContain(ghost)
    }
  })

  it('names the stable server codes it branches on', () => {
    const source = readFileSync(
      resolve(
        REPO_ROOT,
        'apps/admissions/src/pages/public/tracker/hooks/useApplicationTracker.ts',
      ),
      'utf8',
    )
    for (const code of [
      'VALIDATION_ERROR',
      'INVALID_FORMAT',
      'TRACKING_SECRET_REQUIRED',
      'NOT_FOUND',
      'RATE_LIMITED',
    ]) {
      expect(source).toContain(code)
    }
  })

  it('explains that an application number is not a credential', () => {
    const source = readFileSync(
      resolve(
        REPO_ROOT,
        'apps/admissions/src/pages/public/tracker/hooks/useApplicationTracker.ts',
      ),
      'utf8',
    )
    const copy = source.split('TRACKING_SECRET_REQUIRED:')[1].split(',\n')[0]
    expect(copy.toLowerCase()).toContain('application number')
    expect(copy.toLowerCase()).toContain('tracking link')
  })
})

// ---------------------------------------------------------------------------
// Rendered surfaces
// ---------------------------------------------------------------------------

function renderComponent(element: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(element)
  })
  return {
    container,
    cleanup: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('the share dialog', () => {
  let rendered: ReturnType<typeof renderComponent> | null = null

  afterEach(() => {
    rendered?.cleanup()
    rendered = null
  })

  it('shows the tracking link and no application number', () => {
    const shareUrl = buildTrackerShareUrl(VALID_SECRET, 'https://apply.example.edu')
    rendered = renderComponent(
      <ShareModal show shareUrl={shareUrl} onClose={() => {}} onCopyLink={() => {}} />,
    )
    const text = document.body.textContent || ''
    expect(text).toContain(shareUrl)
    expect(text).not.toContain('Application Number')
    expect(text).not.toContain('Copy Number')
  })

  it('copies the link the dialog is showing', () => {
    const shareUrl = buildTrackerShareUrl(VALID_SECRET, 'https://apply.example.edu')
    const onCopyLink = vi.fn()
    rendered = renderComponent(
      <ShareModal show shareUrl={shareUrl} onClose={() => {}} onCopyLink={onCopyLink} />,
    )
    const button = [...document.querySelectorAll('button')].find((element) =>
      (element.textContent || '').includes('Copy link'),
    )
    expect(button).toBeTruthy()
    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onCopyLink).toHaveBeenCalledTimes(1)
  })

  it('warns that the link is a credential', () => {
    rendered = renderComponent(
      <ShareModal
        show
        shareUrl={buildTrackerShareUrl(VALID_SECRET, 'https://apply.example.edu')}
        onClose={() => {}}
        onCopyLink={() => {}}
      />,
    )
    const text = (document.body.textContent || '').toLowerCase()
    expect(text).toContain('anyone with this link')
  })
})

describe('the status panel publishes no reviewer notes', () => {
  let rendered: ReturnType<typeof renderComponent> | null = null

  afterEach(() => {
    rendered?.cleanup()
    rendered = null
  })

  const application: PublicApplicationStatus = {
    application_number: 'BNL202500001',
    status: 'under_review',
    program_name: 'Diploma in Clinical Medicine',
    intake_name: 'January 2026',
    institution: 'Example College',
    submitted_at: '2026-01-15T10:30:00Z',
    updated_at: '2026-02-01T14:00:00Z',
  }

  it('renders the status without a "Message from Admissions" panel', () => {
    rendered = renderComponent(<ApplicationStatusDetails application={application} />)
    const text = document.body.textContent || ''
    expect(text).toContain('UNDER REVIEW')
    expect(text).not.toContain('Message from Admissions')
  })

  it('ignores an admin_feedback field even if a server ever sent one', () => {
    // Defence in depth: the field is not in the type, and the component has no
    // branch that could render it.
    const withGhostField = {
      ...application,
      admin_feedback: 'internal reviewer note',
    } as PublicApplicationStatus
    rendered = renderComponent(<ApplicationStatusDetails application={withGhostField} />)
    expect(document.body.textContent || '').not.toContain('internal reviewer note')
  })
})

describe('the owner’s tracking-link command', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('POSTs the canonical route and returns the issued link', async () => {
    const request = vi.fn().mockResolvedValue({
      code: VALID_SECRET,
      url: `https://apply.example.edu/track-application?code=${VALID_SECRET}`,
      path: `/track-application?code=${VALID_SECRET}`,
      issued_at: '2026-08-09T00:00:00Z',
      replaced_previous: false,
    })
    vi.doMock('@/services/client', () => ({ apiClient: { request } }))
    const { publicTrackingService } = await import('@/services/publicTracking')

    const issued = await publicTrackingService.issueLink('app-1')

    expect(request).toHaveBeenCalledWith('/applications/app-1/tracking-link/', {
      method: 'POST',
    })
    expect(issued.code).toBe(VALID_SECRET)
    expect(isTrackingSecret(issued.code)).toBe(true)
  })

  it('refuses a response that carries no credential', async () => {
    const request = vi.fn().mockResolvedValue({ url: 'https://apply.example.edu' })
    vi.doMock('@/services/client', () => ({ apiClient: { request } }))
    vi.doMock('@/lib/apiErrorLogger', () => ({ logApiError: vi.fn() }))
    const { publicTrackingService } = await import('@/services/publicTracking')

    await expect(publicTrackingService.issueLink('app-1')).rejects.toThrow()
  })

  it('has no read path for the credential — a hash cannot be re-read', async () => {
    vi.doMock('@/services/client', () => ({ apiClient: { request: vi.fn() } }))
    const module = await import('@/services/publicTracking')
    // `track` reads a status with a credential; nothing returns the credential.
    expect(Object.keys(module.publicTrackingService).sort()).toEqual(['issueLink', 'track'])
  })
})
