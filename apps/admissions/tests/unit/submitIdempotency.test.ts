/**
 * @vitest-environment node
 *
 * Lost-submit-response recovery contract (admissions-v2 task 6.5).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` — R10.6, design §14.2.
 * Required_Evidence (tasks.md 6.5): "… and lost-submit-response browser
 * recovery".
 *
 * The backend replays a cached submit response only for the SAME command
 * identity `(idempotency_key, actor, method, path, body_hash)`. So recovery
 * depends on the client sending a *stable* key for the same submission — a
 * random per-attempt key makes every retry a brand-new command and the cached
 * success can never be replayed.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

import { buildSubmitIdempotencyKey } from '../../src/lib/submitIdempotency'

/**
 * The submit command as one surface, not as one file.
 *
 * The command was lifted verbatim out of `useWizardController` into
 * `wizard/useWizardSubmission.ts` when admissions-v2 task 11.2 finished MAINT-01's
 * split. The claims below are unchanged — a *stable* key, no random key, and exactly
 * one CORS-safe header — and reading both files keeps them true wherever the command
 * lives. Joining the sources also keeps "exactly once" a real count: a second
 * `Idempotency-Key` appearing in either file still fails.
 */
const controllerSource = [
  '../../src/pages/student/applicationWizard/hooks/useWizardController.ts',
  '../../src/pages/student/applicationWizard/hooks/wizard/useWizardSubmission.ts',
]
  .map((rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8'))
  .join('\n')

describe('buildSubmitIdempotencyKey', () => {
  it('is stable for the same application across calls', () => {
    const first = buildSubmitIdempotencyKey('a3f1c2d4-0000-4000-8000-000000000001')
    const second = buildSubmitIdempotencyKey('a3f1c2d4-0000-4000-8000-000000000001')

    expect(first).toBe(second)
  })

  it('is distinct per application', () => {
    expect(buildSubmitIdempotencyKey('app-1')).not.toBe(buildSubmitIdempotencyKey('app-2'))
  })

  it('includes the application id so the key is traceable', () => {
    expect(buildSubmitIdempotencyKey('app-42')).toContain('app-42')
  })
})

describe('wizard submit uses the stable key (not a random one)', () => {
  it('calls buildSubmitIdempotencyKey for the submit command', () => {
    expect(controllerSource).toContain('buildSubmitIdempotencyKey(applicationId)')
  })

  it('does not generate a random idempotency key for submit', () => {
    expect(controllerSource).not.toContain('generateIdempotencyKey(applicationId)')
  })

  it('still sends the CORS-safe Idempotency-Key header exactly once', () => {
    const matches = controllerSource.match(/['"]Idempotency-Key['"]/g)
    expect(matches).toHaveLength(1)
    expect(controllerSource.toLowerCase()).not.toContain('x-idempotency-key')
  })
})
