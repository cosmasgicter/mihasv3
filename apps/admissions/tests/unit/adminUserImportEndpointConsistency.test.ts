/**
 * The import's endpoints live in one service, not in the dialog (task 9.3).
 *
 * Requirement: R6.4 · Finding: ADM-04.
 *
 * This guard used to assert that `UserImport.tsx` contained the literal
 * `'/admin/users/batch-import/'`. That was the right check while the dialog held
 * the endpoint, the payload shape, and its own copy of the role vocabulary — and
 * it is the wrong check now, because the dialog holding any of those is the
 * finding. The endpoints are constants in `services/admin/userDirectory.ts`, so
 * that is where they are pinned, and the dialog is asserted *not* to hold a raw
 * endpoint of its own.
 */
import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const DIALOG_PATH = path.resolve(process.cwd(), 'src/components/admin/UserImport.tsx')
const SERVICE_PATH = path.resolve(process.cwd(), 'src/services/admin/userDirectory.ts')
const dialog = fs.readFileSync(DIALOG_PATH, 'utf-8')
const service = fs.readFileSync(SERVICE_PATH, 'utf-8')

describe('UserImport endpoint consistency', () => {
  it('the canonical import endpoints are declared once, in the service', () => {
    expect(service).toContain("USER_IMPORT_ENDPOINT = '/admin/users/batch-import/'")
    expect(service).toContain(
      "USER_IMPORT_PREVIEW_ENDPOINT = '/admin/users/batch-import/preview/'",
    )
  })

  it('no legacy query-parameter action route is used', () => {
    for (const source of [dialog, service]) {
      expect(source).not.toContain('?action=register')
      expect(source).not.toContain('?action=create-user')
    }
  })

  it('the dialog does not carry its own endpoint or its own role list', () => {
    // The dialog reads the file and posts the rows; every judgement about them is
    // the server's, so neither an endpoint literal nor a role vocabulary belongs
    // here (ADM-04 / AUTH-04).
    expect(dialog).not.toContain("'/admin/users/")
    expect(dialog).not.toContain('VALID_ROLES')
    expect(dialog).not.toContain("'super_admin'")
  })

  it('the dialog previews before it commits', () => {
    expect(dialog).toContain('useUserImportPreview')
    expect(dialog).toContain('useUserImportCommit')
    // The commit button is offered only once the server said the batch would
    // commit — otherwise the preview is decorative.
    expect(dialog).toContain('disabled={!preview?.would_commit}')
  })

  it('the dialog offers the row failures as a download', () => {
    // R6.4 asks for *downloadable* row-level failures; a list in a dialog the
    // operator then closes is not one.
    expect(dialog).toContain('downloadImportErrors')
  })
})
