import { describe, expect, it } from 'vitest'

import { createApplicationBodySchema } from '../../lib/validation/applications'

describe('createApplicationBodySchema contract', () => {
  it('accepts canonical catalog IDs for program and intake', () => {
    const result = createApplicationBodySchema.safeParse({
      application_number: 'MIHAS-2026-0001',
      public_tracking_code: 'TRK123ABC',
      full_name: 'Jane Student',
      nrc_number: '123456/78/9',
      date_of_birth: '2002-01-01',
      sex: 'Female',
      phone: '+260977123456',
      email: 'jane@example.com',
      residence_town: 'Kitwe',
      nationality: 'Zambian',
      next_of_kin_name: 'John Relative',
      next_of_kin_phone: '+260977111111',
      program: 'program-uuid-nursing',
      intake: 'intake-uuid-july-2026',
      institution: 'institution-uuid-mihas',
      status: 'draft',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.program).toBe('program-uuid-nursing')
      expect(result.data.intake).toBe('intake-uuid-july-2026')
    }
  })
})
