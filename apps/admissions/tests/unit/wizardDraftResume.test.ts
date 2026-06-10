import { describe, expect, it } from 'vitest'

import {
  deriveDraftResumeUploads,
  mergeDraftResumeUploads,
  normalizeDraftResumeGrades,
  resolveDraftResumeStepId,
} from '@/pages/student/applicationWizard/lib/draftResume'

describe('wizard draft resume helpers', () => {
  it('normalizes and filters restored grades', () => {
    const result = normalizeDraftResumeGrades([
      { subject_id: 'math', grade: '1' },
      { subject_id: 'eng', grade: 4 },
      { subject_id: '', grade: 5 },
      { subject_id: 'bad-grade', grade: 15 },
      null,
    ])

    expect(result).toEqual([
      { row_id: 'restored-0-math', subject_id: 'math', grade: 1 },
      { row_id: 'restored-1-eng', subject_id: 'eng', grade: 4 },
    ])
  })

  it('derives uploaded document flags from restored application urls', () => {
    expect(
      deriveDraftResumeUploads({
        result_slip_url: 'https://files.example.com/result.pdf',
        extra_kyc_url: '',
      })
    ).toEqual({
      result_slip: true,
      extra_kyc: false,
    })
  })

  it('keeps application document urls when server document hydration is empty', () => {
    expect(
      mergeDraftResumeUploads(
        {
          result_slip_url: 'https://files.example.com/result.pdf',
          extra_kyc_url: 'https://files.example.com/nrc.pdf',
        },
        {
          result_slip: false,
          extra_kyc: false,
        }
      )
    ).toEqual({
      result_slip: true,
      extra_kyc: true,
    })
  })

  it('keeps server document flags when application urls are missing', () => {
    expect(
      mergeDraftResumeUploads(
        {
          result_slip_url: '',
          extra_kyc_url: null,
        },
        {
          result_slip: true,
          extra_kyc: false,
        }
      )
    ).toEqual({
      result_slip: true,
      extra_kyc: false,
    })
  })

  it('resumes to the payment step when education requirements are complete but payment is not verified', () => {
    const grades = normalizeDraftResumeGrades([
      { subject_id: 's1', grade: 1 },
      { subject_id: 's2', grade: 2 },
      { subject_id: 's3', grade: 3 },
      { subject_id: 's4', grade: 4 },
      { subject_id: 's5', grade: 5 },
    ])

    const application = {
      full_name: 'Jane Student',
      program: 'Registered Nursing',
      result_slip_url: '/result.pdf',
      extra_kyc_url: '/nrc.pdf',
      payment_status: 'pending_review',
    }

    const stepId = resolveDraftResumeStepId(
      application,
      grades,
      deriveDraftResumeUploads(application)
    )

    // 6-step model (R10.1): payment is step 5.
    expect(stepId).toBe(5)
  })

  it('resumes to the review step when payment is already verified', () => {
    const grades = normalizeDraftResumeGrades([
      { subject_id: 's1', grade: 1 },
      { subject_id: 's2', grade: 2 },
      { subject_id: 's3', grade: 3 },
      { subject_id: 's4', grade: 4 },
      { subject_id: 's5', grade: 5 },
    ])

    const application = {
      full_name: 'Jane Student',
      program: 'Registered Nursing',
      result_slip_url: '/result.pdf',
      extra_kyc_url: '/nrc.pdf',
      payment_status: 'verified',
    }

    const stepId = resolveDraftResumeStepId(
      application,
      grades,
      deriveDraftResumeUploads(application)
    )

    // 6-step model (R10.1): review/submit is step 6.
    expect(stepId).toBe(6)
  })

  it('stays on the education step when grades or documents are incomplete', () => {
    const application = {
      full_name: 'Jane Student',
      program: 'Registered Nursing',
      result_slip_url: '/result.pdf',
      extra_kyc_url: null,
      payment_status: null,
    }

    const stepId = resolveDraftResumeStepId(
      application,
      normalizeDraftResumeGrades([
        { subject_id: 's1', grade: 1 },
        { subject_id: 's2', grade: 2 },
      ]),
      deriveDraftResumeUploads(application)
    )

    // 6-step model (R10.1): education is step 4.
    expect(stepId).toBe(4)
  })
})
