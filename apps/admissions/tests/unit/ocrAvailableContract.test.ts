/**
 * `ocr_available` drift guard and wizard OCR gate (platform-simplification
 * task 18.2, decision D4 option B, Requirements 11.1 and 11.3).
 *
 * The backend required-documents contract publishes `ocr_available`; the client
 * parses it into `ocrAvailable`, defaulting to `false`. The wizard calls the
 * extract endpoint and polls only when it is `true`, and the manual grade form
 * renders before the upload controls on every tenant.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseRequiredDocumentsContract } from '@/lib/requiredDocuments'

const REPO = resolve(__dirname, '../../../..')
const read = (relative: string) => readFileSync(resolve(REPO, relative), 'utf8')

describe('ocr_available contract drift guard', () => {
  it('the backend contract, its schema serializer and the generated types all carry ocr_available', () => {
    expect(read('backend/apps/applications/required_documents.py')).toContain('"ocr_available": _ocr_available(application)')
    expect(read('backend/apps/applications/_view_helpers.py')).toMatch(/ocr_available = serializers\.BooleanField\(/)
    expect(read('apps/admissions/src/generated/api.d.ts')).toMatch(/readonly ocr_available: boolean;/)
  })

  it('parses ocrAvailable as true only when the server says true', () => {
    const base = { application_id: 'app-1', configuration_version: null, requirements: [] }
    expect(parseRequiredDocumentsContract({ success: true, data: { ...base, ocr_available: true } }).ocrAvailable).toBe(true)
    for (const value of [false, undefined, 'true', 1, null]) {
      expect(parseRequiredDocumentsContract({ success: true, data: { ...base, ocr_available: value } }).ocrAvailable).toBe(false)
    }
  })
})

describe('the wizard calls extract and polls only where OCR is on', () => {
  const controller = read('apps/admissions/src/pages/student/applicationWizard/hooks/useWizardController.ts')

  it('reads the flag from the contract', () => {
    expect(controller).toContain('const ocrAvailable = requiredDocuments.contract?.ocrAvailable === true')
    expect(controller).toContain('ocrAvailableRef.current = ocrAvailable')
  })

  it('the upload callback returns before extract() when OCR is off', () => {
    const start = controller.indexOf('onUploaded: useCallback(')
    const block = controller.slice(start, controller.indexOf('requiredDocuments', start + 1) + 400)
    const guardAt = block.indexOf('if (!ocrAvailableRef.current)')
    const extractAt = block.indexOf('.extract(')
    expect(guardAt).toBeGreaterThan(-1)
    expect(extractAt).toBeGreaterThan(guardAt)
  })

  it('draft restore and retry do not start OCR when it is off', () => {
    expect(controller).toMatch(/if \(ocrAvailable && ocrDocumentId && ocrStatus === 'idle'/)
    expect(controller).toMatch(/if \(!docId \|\| !ocrAvailableRef\.current\) return/)
  })

  it('no other wizard module calls the extract endpoint', () => {
    const wizardFiles = [
      'apps/admissions/src/pages/student/applicationWizard/hooks/useOcrGradeExtraction.ts',
      'apps/admissions/src/pages/student/applicationWizard/steps/EducationStep.tsx',
      'apps/admissions/src/pages/student/applicationWizard/index.tsx',
    ]
    for (const file of wizardFiles) {
      expect(read(file), file).not.toMatch(/\.extract\(/)
    }
  })
})

describe('manual grade entry comes first on every tenant (R11.1)', () => {
  it('the grade form renders before the document upload controls', () => {
    const step = read('apps/admissions/src/pages/student/applicationWizard/steps/EducationStep.tsx')
    const gradesAt = step.indexOf('Grade 12 Subjects')
    const uploadsAt = step.indexOf('<RequiredDocumentsPanel')
    expect(gradesAt).toBeGreaterThan(-1)
    expect(uploadsAt).toBeGreaterThan(gradesAt)
  })
})
