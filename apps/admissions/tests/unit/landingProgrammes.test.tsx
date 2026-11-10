import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { buildLandingProgrammeRows, isIntakeOpen } from '@/lib/landingProgrammes'
import type { Intake, Program } from '@/types/database'

const NOW = new Date('2026-11-10T09:00:00Z')
const intake = (over: Partial<Intake>): Intake => ({ id: 'i1', name: 'January 2027', ...over })
const programme = (over: Partial<Program>): Program => ({ id: 'p1', name: 'Diploma in Nursing', ...over })

describe('landing programme rows (task 29.2)', () => {
  it('treats an intake as open until its deadline passes, and an inactive one as closed', () => {
    expect(isIntakeOpen(intake({ application_deadline: '2026-12-01' }), NOW)).toBe(true)
    expect(isIntakeOpen(intake({ application_deadline: '2026-10-01' }), NOW)).toBe(false)
    expect(isIntakeOpen(intake({}), NOW)).toBe(true)
    expect(isIntakeOpen(intake({ is_active: false }), NOW)).toBe(false)
  })

  it('makes one row per programme and open intake, with the catalogue school and closing date', () => {
    const rows = buildLandingProgrammeRows(
      [intake({ application_deadline: '2026-12-01' }), intake({ id: 'i0', name: 'July 2026', application_deadline: '2026-06-01' })],
      {
        i1: [
          programme({
            id: 'p2',
            name: 'Diploma in Pharmacy',
            available_offerings: [
              programme({ id: 'o1', institutions: { id: 's1', name: 'School A' } }),
              programme({ id: 'o2', institutions: { id: 's2', name: 'School B' } }),
              programme({ id: 'o3', institutions: { id: 's1', name: 'School A' } }),
            ],
          }),
          programme({ institutions: { id: 's1', name: 'School A', full_name: 'School A of Health' } }),
        ],
        i0: [programme({ id: 'p9', name: 'Closed one' })],
      },
      NOW,
    )
    expect(rows.map(r => r.programmeName)).toEqual(['Diploma in Nursing', 'Diploma in Pharmacy'])
    expect(rows[0]!.schoolNames).toEqual(['School A of Health'])
    expect(rows[1]!.schoolNames).toEqual(['School A', 'School B'])
    expect(rows[1]!.closesOn).toBe('2026-12-01')
    expect(rows.every(r => r.intakeName === 'January 2027')).toBe(true)
  })

  it('shows no school rather than a guess when the catalogue names none', () => {
    const [row] = buildLandingProgrammeRows([intake({})], { i1: [programme({})] }, NOW)
    expect(row!.schoolNames).toEqual([])
  })
})

const hook = vi.hoisted(() => ({ state: { rows: [] as unknown[], isLoading: false, errorMessage: null as string | null, retry: () => {} } }))
vi.mock('@/hooks/useLandingProgrammes', () => ({ useLandingProgrammes: () => hook.state }))
vi.mock('@/hooks/usePortalBrand', () => ({
  usePortalBrand: () => ({ brandName: 'Beanola Admissions', supportEmail: null, offeringInstitutionId: undefined, isLoading: false }),
}))
vi.mock('@/lib/routePreload', () => ({ preloadAuthRoutes: () => Promise.resolve() }))

import { LandingPageSections } from '@/components/landing/LandingPageSections'

const renderSections = () =>
  render(
    <MemoryRouter>
      <LandingPageSections />
    </MemoryRouter>,
  )

describe('programmes section on the landing (task 29.2)', () => {
  it('gives every Apply link a description naming its programme and school, with the label unchanged', () => {
    hook.state = {
      ...hook.state,
      rows: [
        { key: 'a:i1', programmeName: 'Diploma in Nursing', schoolNames: ['School A'], intakeId: 'i1', intakeName: 'January 2027', closesOn: '2026-12-01' },
        { key: 'b:i1', programmeName: 'Diploma in Pharmacy', schoolNames: [], intakeId: 'i1', intakeName: 'January 2027', closesOn: null },
      ],
    }
    renderSections()
    const links = screen.getAllByRole('link', { name: 'Apply' })
    expect(links).toHaveLength(2)
    for (const link of links) {
      expect(link.getAttribute('href')).toBe('/auth/signup')
      const ids = (link.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)
      expect(ids.length).toBeGreaterThan(0)
      const description = ids.map(id => document.getElementById(id)?.textContent ?? '').join(' ')
      expect(description).toMatch(/Diploma in (Nursing|Pharmacy)/)
    }
    expect(links[0]!.getAttribute('aria-describedby')).toContain('school')
    expect(screen.getByRole('heading', { name: 'Open programmes' })).toBeTruthy()
    expect(screen.queryByText(/three diplomas/i)).toBeNull()
  })

  it('says applications are closed, with Track and Contact links, when there is no open programme', () => {
    hook.state = { ...hook.state, rows: [] }
    renderSections()
    const section = document.getElementById('programs')!
    expect(within(section).getByText(/Applications are closed right now/)).toBeTruthy()
    expect(within(section).getByRole('link', { name: 'Track an application' }).getAttribute('href')).toBe('/track-application')
    expect(within(section).getByRole('link', { name: 'Contact admissions' }).getAttribute('href')).toBe('/contact')
    expect(within(section).queryByRole('link', { name: 'Apply' })).toBeNull()
  })

  it('shows a rate-limit message with a retry, never an empty list, on an error', () => {
    hook.state = { ...hook.state, rows: [], errorMessage: 'Too many requests right now. Try again in about 1 minute.' }
    renderSections()
    const section = document.getElementById('programs')!
    expect(within(section).getByRole('alert').textContent).toContain('Too many requests')
    expect(within(section).getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(within(section).queryByText(/closed right now/)).toBeNull()
  })
})
