/**
 * Deterministic submit idempotency key (admissions-v2 task 6.5).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` — R10.6, design §14.2.
 *
 * Why deterministic
 * ----------------
 * The backend keys a command on `(idempotency_key, actor, method, path,
 * body_hash)` and caches the response of a successful command. The submit body
 * is constant (`{ confirm_submission: true }`), so a key derived from the
 * application id is stable across retries, reloads and tabs. That is what makes
 * a *lost submit response* recoverable: when the student's connection drops
 * after the server committed the submission, the retry carries the same key and
 * replays the cached success response instead of surfacing an error. A random
 * per-attempt key cannot do that — it is a new command every time.
 *
 * Two more consequences, both wanted:
 *  - a genuine concurrent double-submit (two tabs) is refused with
 *    `IDEMPOTENCY_PENDING` rather than racing into the submission transaction;
 *  - a refused submit (a readiness blocker) is *not* cached by the backend, so
 *    the student can fix the blocker and retry with the same key.
 */
export function buildSubmitIdempotencyKey(applicationId: string): string {
  return `submit-${applicationId}`
}
