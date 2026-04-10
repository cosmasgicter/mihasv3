import { describe, expect, it } from 'vitest'

import { routes } from '@/routes/config'

describe('student route smoke coverage', () => {
  it('declares the core student wizard and payment routes', () => {
    const routeMap = new Map(routes.map((route) => [route.path, route]))

    expect(routeMap.get('/student/application-wizard')).toMatchObject({
      guard: 'student',
      skeletonType: 'wizard',
    })

    expect(routeMap.get('/student/payment')).toMatchObject({
      guard: 'student',
      skeletonType: 'detail',
    })

    expect(routeMap.get('/student/application/:id/status')).toMatchObject({
      guard: 'student',
      skeletonType: 'detail',
    })

    expect(routeMap.get('/student/application/:id')).toMatchObject({
      guard: 'student',
      skeletonType: 'detail',
    })
  })
})

