/**
 * The dashboard's draft routes stay explicit about intent.
 *
 * The claim here predates admissions-v2 and belongs to the draft lifecycle rule in
 * `.kiro/steering/enterprise-tenancy.md` → Student Draft Lifecycle: start-new and
 * resume are **explicit** modes (`?mode=new`, `?mode=resume&draftId=…`,
 * `?localDraft=true`), never a silent pick of the newest draft by timestamp.
 *
 * It used to be asserted against `NextActionCard`, the component that derived the
 * dashboard's next action from three browser booleans. Task 11.1 deleted that
 * component; the routes it built are now built by `studentNextAction.ts`'s route
 * table (for the platform's own pre-submission actions) and by
 * `DraftManagementCard` (for continuing or starting a draft), so the same claim is
 * asserted against both.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { DraftManagementCard } from '@/components/student/dashboard/DraftManagementCard'
import { routeForStudentNextAction } from '@/lib/studentNextAction'
import type { Application } from '@/types/database'

function draft(overrides: Partial<Application> = {}): Application {
  return {
    id: 'draft-1',
    user_id: 'u-1',
    status: 'draft',
    draft_name: 'Nursing, January',
    updated_at: '2026-08-01T10:00:00Z',
    ...overrides,
  } as Application
}

function renderDrafts(props: Partial<Parameters<typeof DraftManagementCard>[0]> = {}) {
  return render(
    <MemoryRouter>
      <DraftManagementCard
        drafts={[draft()]}
        hasLocalOnlyDraft={false}
        userId="u-1"
        onDeleted={() => {}}
        {...props}
      />
    </MemoryRouter>,
  )
}

describe('student dashboard draft routes are explicit about intent', () => {
  it('resumes a server draft by id', () => {
    renderDrafts()
    const link = screen.getByRole('link', { name: /continue/i }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/student/application-wizard?mode=resume&draftId=draft-1')
  })

  it('resumes a local-only draft without adopting a server draft id', () => {
    renderDrafts({ drafts: [], hasLocalOnlyDraft: true })
    const link = screen.getByRole('link', { name: /continue/i }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/student/application-wizard?localDraft=true')
  })

  it('starting another application declares new intent', () => {
    renderDrafts()
    const link = screen.getByRole('link', { name: /start another/i }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/student/application-wizard?mode=new')
  })

  it('a platform action on a draft resumes that draft, never an unqualified wizard visit', () => {
    // A bare `/student/application-wizard` would let the wizard choose a draft by
    // timestamp, which is exactly what the draft-lifecycle rule forbids.
    for (const verb of ['complete-profile', 'add-grades', 'upload-required-documents', 'submit-application']) {
      const href = routeForStudentNextAction(verb, {
        applicationId: 'draft-1',
        isDraft: true,
        relatedApplicationId: null,
      })
      expect(href, verb).toBe('/student/application-wizard?mode=resume&draftId=draft-1')
    }
  })
})
