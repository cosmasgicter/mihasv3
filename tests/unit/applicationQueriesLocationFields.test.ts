import { describe, expect, it } from 'vitest'

import { ApplicationQueries } from '../../lib/queries'

describe('ApplicationQueries.update', () => {
  it('persists nationality and country when application location data changes', () => {
    const query = ApplicationQueries.update('app-1', {
      residence_town: 'Ndola',
      country: 'Zambia',
      nationality: 'Zambian',
    } as any)

    expect(query.text).toContain('residence_town = $2')
    expect(query.text).toContain('country = $3')
    expect(query.text).toContain('nationality = $4')
    expect(query.values).toEqual(['app-1', 'Ndola', 'Zambia', 'Zambian'])
  })
})
