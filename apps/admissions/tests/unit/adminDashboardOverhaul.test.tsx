import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DashboardActivityFeed } from '@/components/admin/dashboard/DashboardActivityFeed'
import { normalizeRecentActivity } from '@/services/admin/dashboard'
import { formatFeeAmount, validateFeeAmount } from '@/pages/admin/ProgramFees'
import { validateSetting } from '@/pages/admin/Settings'

describe('admin dashboard overhaul unit coverage', () => {
  it('normalizes new dashboard recent activity types without falling back to application', () => {
    const activity = normalizeRecentActivity([
      {
        id: 'status-1',
        type: 'status_change',
        application_number: 'APP-001',
        old_status: 'submitted',
        new_status: 'under_review',
        timestamp: '2026-04-18T08:00:00.000Z',
        actor_name: 'Admin User',
        message: 'APP-001: submitted -> under_review',
      },
      {
        id: 'payment-1',
        type: 'payment',
        application_number: 'APP-002',
        new_status: 'paid',
        timestamp: '2026-04-18T09:00:00.000Z',
        message: 'APP-002: Payment paid',
      },
    ])

    expect(activity).toHaveLength(2)
    expect(activity[0]).toMatchObject({
      type: 'status_change',
      application_number: 'APP-001',
      actor_name: 'Admin User',
    })
    expect(activity[1]).toMatchObject({
      type: 'payment',
      application_number: 'APP-002',
      new_status: 'paid',
    })
  })

  it('renders activity empty state and actor details', () => {
    const emptyHtml = renderToStaticMarkup(<DashboardActivityFeed items={[]} />)
    expect(emptyHtml).toContain('No recent activity')

    const activityHtml = renderToStaticMarkup(
      <DashboardActivityFeed
        items={[
          {
            id: '1',
            type: 'status_change',
            application_number: 'APP-001',
            message: 'APP-001: submitted -> approved',
            timestamp: '2026-04-18T09:00:00.000Z',
            actor_name: 'Admissions Officer',
          },
        ]}
      />
    )

    expect(activityHtml).toContain('APP-001')
    expect(activityHtml).toContain('APP-001: submitted -&gt; approved')
    expect(activityHtml).toContain('Admissions Officer')
  })

  it('validates and formats program fee amounts consistently', () => {
    expect(validateFeeAmount('')).toBe('Amount must be a valid positive number')
    expect(validateFeeAmount('0')).toBe('Amount must be a valid positive number')
    expect(validateFeeAmount('-1')).toBe('Amount must be a valid positive number')
    expect(validateFeeAmount('not-a-number')).toBe('Amount must be a valid positive number')
    expect(validateFeeAmount('153')).toBeNull()
    expect(formatFeeAmount('ZMW', '153')).toBe('ZMW 153.00')
  })

  it('validates setting values by declared value type', () => {
    expect(validateSetting({ key: '', value: 'true' }, 'boolean')).toContain('Setting key is required')
    expect(validateSetting({ key: 'feature_enabled', value: 'TRUE' }, 'boolean')).toEqual([])
    expect(validateSetting({ key: 'retry_count', value: '1.5' }, 'integer')).toContain('Integer value must be a whole number')
    expect(validateSetting({ key: 'fee_amount', value: 'abc' }, 'decimal')).toContain('Decimal value must be a valid number')
  })
})
