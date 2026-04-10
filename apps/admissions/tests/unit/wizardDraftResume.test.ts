import { describe, expect, it } from 'vitest'

import {
  deriveDraftResumeUploads,
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
      { subject_id: 'math', grade: 1 },
      { subject_id: 'eng', grade: 4 },
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

  it('resumes to the payment step when education requirements are complete but payment is not verified', () => {
    const grades = normalizeDraftResumeGrades([
      { subject_id: 's1', grade: 1 },
      { subject_id: 's2', grade: 2 },
      { subject_id: 's3', grade: 3 },
      { subject_id: 's4', grade: 4 },
      { subject_id: 's5', grade: 5 },
    ])

    const stepId = resolveDraftResumeStepId(
      {
        full_name: 'Jane Student',
        program: 'Registered Nursing',
        result_slip_url: '/result.pdf',
        extra_kyc_url: '/nrc.pdf',
        payment_status: 'pending_review',
      },
      grades
    )

    expect(stepId).toBe(3)
  })

  it('resumes to the review step when payment is already verified', () => {
    const grades = normalizeDraftResumeGrades([
      { subject_id: 's1', grade: 1 },
      { subject_id: 's2', grade: 2 },
      { subject_id: 's3', grade: 3 },
      { subject_id: 's4', grade: 4 },
      { subject_id: 's5', grade: 5 },
    ])

    const stepId = resolveDraftResumeStepId(
      {
        full_name: 'Jane Student',
        program: 'Registered Nursing',
        result_slip_url: '/result.pdf',
        extra_kyc_url: '/nrc.pdf',
        payment_status: 'verified',
      },
      grades
    )

    expect(stepId).toBe(4)
  })

  it('stays on the education step when grades or documents are incomplete', () => {
    const stepId = resolveDraftResumeStepId(
      {
        full_name: 'Jane Student',
        program: 'Registered Nursing',
        result_slip_url: '/result.pdf',
        extra_kyc_url: null,
        payment_status: null,
      },
      normalizeDraftResumeGrades([
        { subject_id: 's1', grade: 1 },
        { subject_id: 's2', grade: 2 },
      ])
    )

    expect(stepId).toBe(2)
  })
})

