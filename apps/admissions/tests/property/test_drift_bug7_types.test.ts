/**
 * Bug 7 (MEDIUM) — Type drift in shared frontend DB types: Fix Checking Test
 *
 * fast-check property test verifying that:
 * 1. ApplicationGrade.grade is typed as number (matching backend IntegerField 1-9)
 * 2. ApplicationDocument includes document_name, verification_status, uploaded_at, system_generated
 * 3. file_path and file_name are still present (deprecated but not removed)
 *
 * **Validates: Requirements 2.17, 2.18**
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import type { ApplicationGrade, ApplicationDocument } from '@/types/database'

describe('Bug 7 — Type drift fix checking', () => {
  describe('ApplicationGrade.grade is number', () => {
    it('for all ECZ grade values (1-9), they are assignable to number type', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 9 }),
          (gradeValue) => {
            const grade: ApplicationGrade = {
              id: 'test-id',
              application_id: 'app-id',
              subject_id: 'sub-id',
              grade: gradeValue,
            }
            expect(typeof grade.grade).toBe('number')
            expect(grade.grade).toBeGreaterThanOrEqual(1)
            expect(grade.grade).toBeLessThanOrEqual(9)
          }
        ),
        { numRuns: 50 }
      )
    })
  })

  describe('ApplicationDocument has backend-aligned fields', () => {
    it('for all generated documents, new fields are accessible', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.uuid(),
            application_id: fc.uuid(),
            document_type: fc.constantFrom('nrc', 'passport', 'result_slip', 'transcript'),
            document_name: fc.string({ minLength: 1, maxLength: 100 }),
            verification_status: fc.constantFrom('pending', 'verified', 'rejected'),
            uploaded_at: fc.constant('2024-01-15T10:00:00Z'),
            system_generated: fc.boolean(),
          }),
          (doc) => {
            const appDoc: ApplicationDocument = doc
            // New fields are accessible
            expect(appDoc.document_name).toBe(doc.document_name)
            expect(appDoc.verification_status).toBe(doc.verification_status)
            expect(appDoc.uploaded_at).toBe(doc.uploaded_at)
            expect(appDoc.system_generated).toBe(doc.system_generated)
          }
        ),
        { numRuns: 50 }
      )
    })

    it('deprecated fields file_path and file_name are still present', () => {
      const doc: ApplicationDocument = {
        id: 'test-id',
        application_id: 'app-id',
        document_type: 'nrc',
        file_path: '/old/path',
        file_name: 'old-file.pdf',
      }
      expect(doc.file_path).toBe('/old/path')
      expect(doc.file_name).toBe('old-file.pdf')
    })
  })
})
