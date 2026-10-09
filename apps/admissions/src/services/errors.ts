/**
 * Errors the service layer throws across its own boundary.
 *
 * ## Why this module exists
 *
 * `AuthenticationError` was defined in `services/authInterceptor.ts` — one of the
 * transport-internal modules the R14.3 architecture rule forbids a page or component
 * from importing (`eslint.config.js`, and its grep twin in
 * `tests/unit/architectureEnforcement.test.ts`). So a page that wanted to *handle* an
 * unrecoverable 401 had no way to name the error without importing transport, and two
 * wizard modules did exactly that:
 * `applicationWizard/hooks/useSmartAutoSave.ts` and
 * `applicationWizard/hooks/wizard/wizardControllerUtils.ts`.
 *
 * `architectureEnforcement.test.ts` records the same problem in prose against
 * `ApplicationStatus.tsx`: *"`AuthenticationError` is the shared client's error class,
 * which the applications domain service does not re-export. Inventing a re-export to
 * satisfy a grep would be worse than saying so here."* That is right about a
 * re-export, and this is not one — the class is **defined here**, and
 * `authInterceptor.ts` and `client.ts` re-export it so their existing importers and
 * every `instanceof` check keep working against a single definition.
 *
 * An error thrown out of the service layer is part of that layer's contract, not an
 * internal of its transport: a caller that must react to a 401 is doing its job.
 * Giving that contract its own module removes the reason a page reached past the
 * boundary, which is the cause the rule was written to prevent.
 *
 * Task 13.6 remediation L12. Evidence:
 * `docs/v2-evidence/13.6/remediation/L12/README.md` §4.
 *
 * @module services/errors
 */

/**
 * Thrown when the API client meets an unrecoverable 401 — the token refresh failed,
 * or a second 401 arrived after the retry.
 *
 * Callers catch this to clean up their own UI (drop a dirty draft's autosave loop,
 * stop a poll, surface a re-authentication prompt). It carries `status = 401` so a
 * caller that only inspects a status still sees the right one.
 */
export class AuthenticationError extends Error {
  public readonly status = 401;
  constructor(message: string = 'Authentication required. Please sign in again.') {
    super(message);
    this.name = 'AuthenticationError';
  }
}
