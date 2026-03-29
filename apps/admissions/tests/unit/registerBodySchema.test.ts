import { describe, expect, it } from 'vitest'

import { registerBodySchema } from '../../lib/validation/auth'

describe('registerBodySchema', () => {
  it('accepts the full student profile payload used during sign up', () => {
    const parsed = registerBodySchema.parse({
      email: 'student@example.com',
      password: 'Password1',
      firstName: 'Jane',
      lastName: 'Student',
      phone: '+260971234567',
      date_of_birth: '2001-09-08',
      sex: 'Female',
      residence_town: 'Kitwe',
      country: 'Zambia',
      nationality: 'Zambian',
      next_of_kin_name: 'John Student',
      next_of_kin_phone: '+260977000000',
    })

    expect(parsed).toMatchObject({
      phone: '+260971234567',
      date_of_birth: '2001-09-08',
      sex: 'Female',
      residence_town: 'Kitwe',
      country: 'Zambia',
      nationality: 'Zambian',
      next_of_kin_name: 'John Student',
      next_of_kin_phone: '+260977000000',
    })
  })
})
