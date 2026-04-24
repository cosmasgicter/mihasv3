import { describe, expect, it } from 'vitest'

import { selectLatestDocumentByType } from '@/pages/student/applicationWizard/lib/documentSelection'

describe('selectLatestDocumentByType', () => {
  it('returns the most recent matching document by uploaded timestamp', () => {
    const selected = selectLatestDocumentByType(
      [
        {
          id: 'older-slip',
          document_type: 'result_slip',
          uploaded_at: '2026-04-24T19:18:00.000Z',
        },
        {
          id: 'latest-slip',
          document_type: 'result_slip',
          uploaded_at: '2026-04-24T19:21:56.000Z',
        },
        {
          id: 'identity-doc',
          document_type: 'extra_kyc',
          uploaded_at: '2026-04-24T19:22:10.000Z',
        },
      ],
      'result_slip',
    )

    expect(selected?.id).toBe('latest-slip')
  })
})
