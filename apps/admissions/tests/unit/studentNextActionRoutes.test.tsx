import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { NextActionCard } from '@/components/student/dashboard/NextActionCard'

function renderCard(props: Partial<Parameters<typeof NextActionCard>[0]> = {}) {
  return render(
    <MemoryRouter>
      <NextActionCard
        totalDraftCount={0}
        hasPendingPayment={false}
        hasScheduledInterview={false}
        scheduledInterviewsCount={0}
        submittedCount={0}
        latestDraftId={null}
        {...props}
      />
    </MemoryRouter>,
  )
}

describe('student dashboard next-action routes', () => {
  it('uses explicit new mode when no draft exists', () => {
    renderCard()

    const link = screen.getByRole('link', { name: /start application/i }) as HTMLAnchorElement

    expect(link.getAttribute('href')).toBe('/student/application-wizard?mode=new')
  })

  it('uses explicit resume mode when a server draft id exists', () => {
    renderCard({ totalDraftCount: 1, latestDraftId: 'draft-1' })

    const link = screen.getByRole('link', { name: /continue draft/i }) as HTMLAnchorElement

    expect(link.getAttribute('href')).toBe('/student/application-wizard?mode=resume&draftId=draft-1')
  })

  it('uses local-draft resume mode without clearing local state', () => {
    renderCard({ totalDraftCount: 1, latestDraftId: null })

    const link = screen.getByRole('link', { name: /continue draft/i }) as HTMLAnchorElement

    expect(link.getAttribute('href')).toBe('/student/application-wizard?localDraft=true')
  })
})
