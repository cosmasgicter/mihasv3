# Task 10.5 — Secure and correct public tracking

Evidence index for task **10.5** of `.kiro/specs/admissions-v2-canonical-rebuild/`.

```
- [-] 10.5 Secure and correct public tracking
  - Migrate to random hashed tracking secrets or second-factor verification.
  - Bind tenant host, rate-limit, align frontend/backend fields, and generate a
    valid share URL without PII/application number authority.
  - _Requirements: R2.3-R2.4, R13.12, R17.2, R17.7_
  - _Findings: STU-22, TEN-10_
  - _Evidence: enumeration/rate-limit/host-isolation/contract/share-link tests_
```

- Base commit: `bae29a28d9657f288b3339062adb31285959c966` (branch `main`); the
  candidate is working-tree changes on top of it (the whole admissions-v2 spec is
  in-flight/uncommitted; the orchestrator owns the commit).
- Captured: 2026-08-09 (UTC). An earlier dispatch of this task was interrupted
  before the browser gate and before this README existed. §11 records exactly what
  was inherited, what was **re-measured** against the current tree, and the two
  defects the browser gate then found **in this task's own code**.
- **STU-22 is four defects in one sentence**, and TEN-10 is the fifth:
  a sequential application number was accepted as a public credential; the tenant
  host binding did not hold; the frontend read fields the backend never sent (and
  rendered a reviewer-notes panel from three of them); and "Copy Link" shared a URL
  that tracked nothing.
- It reuses, rather than re-implements: task **4.4**'s `InstitutionContextService.resolve`
  + `DomainStatusMachine` for the host; the payment lane's
  `apps/common/throttling.py` for the budget; `TenantAuditService` for the audit
  and its SHA-256 IP/UA redaction; `apps/common/request_utils.get_client_ip` for
  the trusted-proxy identity; `apps/common/object_authorization.resolve_owned_application`
  for owner-only masking; and task 8.3's `freshContext`/tenant-origin harness
  helpers.
- **Schema: yes.** Unlike 10.1–10.4 this task ships one additive SQL script and its
  rollback sibling (§3), proven on Neon branch **`br-jolly-pine-ahybtg2e`**
  (`v2-task-3.2-rehearsal`) — never the Neon default branch, never production
  (§3.3, [`raw/neon-branch-rehearsal.txt`](raw/neon-branch-rehearsal.txt)).
- PBT: task 10.5 has **no numbered property-based-testing sub-task**
  (`tasks.meta.json` → `pbtResults` is `{}`), so nothing is recorded via
  `update_pbt_status` and no numbered spec property is claimed. It nonetheless adds
  **17 Hypothesis invariants** and **16 fast-check invariants** as *task*
  invariants over the credential's whole input space (§9.2) — the 8.3/10.3
  precedent.

## The Required_Evidence claim

The `_Evidence:` line names **five** things. Each has a backend class, and each has
a browser journey.

| Claim | Backend | Browser |
|---|---|---|
| **enumeration** | [`test_public_tracking_secret_10_5.py::TestEnumeration`](../../../backend/tests/unit/test_public_tracking_secret_10_5.py) (14) — an application number and a legacy `TRK-` code are not credentials; the refusal is identical whether or not the number names a real application; a legacy identifier never reaches the database; a live secret resolves; the plaintext is never stored; unknown selector / wrong verifier / revoked secret are one masked 404; issuing revokes; the verifier is compared in constant time | journey 1 |
| **rate-limit** | `…::TestRateLimit` (11) — failed attempts exhaust the budget; a valid holder never spends it; **a spent budget still answers a correct token**; a refused attempt does not extend the lockout; **the identity is not caller-controlled**; a legacy-identifier refusal is not charged; the budget is per client; the gate defaults on; a 429 is audited; the coarse middleware budget survives | journey 4 |
| **host-isolation** | `…::TestHostIsolation` (6) — a tenant host resolves its own application and masks another tenant's identically; the neutral portal resolves any tenant's by secret; a non-active domain fails closed to neutral; a mismatch is audited as such; `X-Forwarded-Host` is honoured | journey 3 |
| **contract** | `…::TestContract` (9) — the published field set is exactly the contract; no never-published field appears; the serializer declares the same contract; no applicant value leaks; the names are the ones the client reads; canonical-first with legacy fallback; a disclosure is audited without the token and with a redacted caller | journey 5 |
| **share-link** | `…::TestShareLink` (10) — the owner can issue; the URL carries only the token; the shared URL actually tracks; the URL is built from the request's own origin; reissuing reports the rotation; another student and an unknown id are masked; staff cannot issue the applicant's link; issuing is audited without the token; anonymous cannot issue | journey 2 |

Plus `TestMigration` (6) and `TestOneAuthority` (5) — **61 collected cases** in the
unit suite, and **17** Hypothesis properties beside it.

Why the browser is required and not only endpoint tests: **three of the five claims
are surfaces.** The field drift was invisible until something was drawn on a page —
the client read `program_name`, `intake_name` and `updated_at` that the backend
never sent, and rendered a "Message from Admissions" panel from `admin_feedback`.
The share link is a claim about what a *button* puts on the clipboard. And the
rate-limit's real-world failure mode — a shared address — only appears when many
clients hit one endpoint from one IP, which is exactly what a browser profile does
and what an endpoint test does not (§7).

### The 5 required journeys

[`public-tracking-secret.spec.ts`](../../../apps/admissions/tests/harness-e2e/required/public-tracking-secret.spec.ts)
— **5 journeys × 2 viewports = 10, all passing on a freshly wiped harness with zero
skips** ([`raw/harness-tracking-journeys.txt`](raw/harness-tracking-journeys.txt)):

| Journey | The claim it settles |
|---|---|
| **enumeration** | the application number printed on the student's own page is refused in the tracker with the reason and code `TRACKING_SECRET_REQUIRED`, **and no lookup is made**; the student then issues a link from their own application and the same page opens |
| **share link** | the share dialog offers the URL built from the token — never `window.location.href`, never the application number — and that URL re-opens the status in a **clean context with no session** |
| **host isolation** | a school's own host opens its own application; another school's token on that host is refused with a **byte-identical** body to a token that never existed; the neutral portal opens both. The two applications are proved to belong to two schools from their institution-coded application numbers before the claim is made |
| **rate limit** | a run of wrong tokens is 404 until the budget is spent and then 429 with `Retry-After`; a **correct** token still resolves from that same exhausted address; a spoofed `X-Forwarded-For` does **not** mint a fresh budget |
| **contract** | the published key set is exactly the seven fields; the page renders the program, intake and *Updated* date the server actually sent (never "Updated Not available"); the applicant's name and email appear nowhere in the body; and there is no "Message from Admissions" panel |

## What this task establishes

1. **A sequential counter is not a credential.** R13.12's own sentence — "Sequential
   application numbers alone SHALL NOT authorize public disclosure" — was violated
   by the tracker accepting `application_number` (`{CODE}{YEAR}{SEQ5}`), so one
   leaked slip yielded its neighbours and a whole cohort was enumerable (§1).
2. **The credential is random, split, hashed, and revocable.**
   `TRK-{selector 8}-{verifier 20}` over Crockford base32: the selector is the
   indexed, non-secret lookup half and the verifier is a 100-bit secret stored only
   as SHA-256 and compared with `hmac.compare_digest` (§2).
3. **The lookup runs on the non-secret half.** So the SQL plan — an `Index Scan` on
   `uq_applications_tracking_selector`, measured (§3.3 step 4) — never depends on the
   secret, and the only comparison that does is constant-time.
4. **Both legacy identifiers survive, minus their authority.** `application_number`
   and `public_tracking_code` keep every display, search and template use they had.
   Nothing was migrated out and no column was altered or dropped (§3).
5. **A recognised-but-unauthorised identifier is answered from the string alone.**
   `classify()` is pure, so the tracker can say "that is an application number, here
   is where to get a link" *without a query* — which is what makes that answer
   impossible to use as an existence oracle, and why it costs the caller nothing (§4).
6. **Every other refusal is one refusal.** Unknown selector, wrong verifier, revoked
   secret and tenant-host mismatch return the same status, code and message; only the
   audit distinguishes them (§4.1).
7. **A trusted tenant host may reveal only its own tenant's application** (TEN-10,
   R2.4), and the neutral Beanola portal resolves by secret alone — with a
   non-active domain failing closed to neutral rather than to a guess (§5).
8. **The attempt budget counts failures, not requests** — so it can be far tighter
   than a request budget without breaking the legitimate reader, and the coarse
   `RateLimitMiddleware` 20/10m request budget is untouched (§6).
9. **The budget bounds the *refusal*, not the endpoint** — a spent budget never
   withholds a status from the holder of a correct token, because the address is
   shared. **This is a fix the browser gate forced** (§7.1).
10. **The budget's identity is not caller-controlled** — keyed through the repo's
    trusted-proxy helper, not DRF's `get_ident`, which would have keyed on the whole
    forwarded chain. **Also found while fixing 9** (§7.2).
11. **The published contract is the field set the client reads** — renamed to the
    client's names, and the three fields the client read but the backend never sent
    are gone from the client rather than added to the wire (§8).
12. **The share URL carries the random token and nothing else**, and it is built by
    the backend from the *request's own origin*, so a student on their school's host
    gets a link back to the only host that will resolve it (§8.2).
13. **The plaintext exists exactly once** — in the issue response. There is no read
    that can return it, which is why acquiring a link is a command and losing one is
    recoverable rather than terminal (§8.1).

## Files

```
docs/v2-evidence/10.5/
├── README.md                                  ← this index
└── raw/
    ├── candidate.txt                              (47 files: 8 failed / 473 passed / 3 errors)
    ├── baseline.txt                               (the SAME selection with only this task's edits removed: 8 / 394 / 3)
    ├── candidate-failing-set.txt                  (11 sorted entries)
    ├── baseline-failing-set.txt                   (11 sorted entries — comm both ways is empty)
    ├── baseline-reconstruction.py                 (how the baseline was produced: §10.1)
    ├── selection.txt                              (the 47 selected files)
    ├── neon-branch-rehearsal.txt                  (forward / idempotent / uniqueness / rollback / re-apply on br-jolly-pine-ahybtg2e)
    ├── authority-matrix.txt                       (the same 3 pre-existing failures)
    ├── frontend-test.txt                          (1 pre-existing failure / 4229 passed / 1 skipped, 480 files)
    ├── frontend-lint.txt                          (17 errors — one FEWER than 10.4)
    ├── frontend-lint-files.txt                    (14 files — 10.4's 15 minus the tracker hook)
    ├── frontend-build.txt                         (exit 0, incl. tsc + the CSP gate)
    ├── django-check.txt                           (no issues)
    ├── spectacular.txt                            (3 warnings / 116 errors — unchanged)
    ├── harness-tracking-journeys.txt              (10 passed — 5 journeys × desktop + mobile)
    ├── harness-required-suite.txt                 (the whole required profile: 144 passed / the 2 pre-existing tenant-launch failures)
    ├── harness-required-without-10-5.txt          (the same profile minus this task's journeys: 134 passed / the same 2)
    └── harness-admin-lane-isolated.txt            (the admin-lane flake, passing in isolation: §10.7)
```

Source of the change:

| Path | What it is |
|---|---|
| `backend/apps/applications/tracking_secret.py` | **new** — the one public-tracking credential authority: the token shape, the legacy-identifier pattern kept as a *pure* recogniser, `classify` / `parse` / `normalize` / `hash_verifier` / `matches` (constant-time), and the `issue` / `revoke` / `resolve` commands |
| `backend/apps/applications/student_tracking_views.py` | **new** — `ApplicationTrackingLinkView`, `POST /api/v1/applications/{id}/tracking-link/`: owner-only, masked 404 for anything else, rotation stated to the caller, plaintext returned once |
| `backend/apps/applications/public_views.py` | `ApplicationTrackView` rewritten around four things: the credential, the tenant host, the attempt budget, and one non-revealing refusal. `TRACKING_CODE_PATTERN` retained as the legacy recogniser only |
| `backend/apps/common/throttling.py` | **new** `PublicTrackingFailureThrottle` — a per-client *failed-attempt* budget that reads in `allow_request`, charges in `record_failure`, answers `is_exhausted`, and keys on the trusted-proxy client IP |
| `backend/apps/applications/serializers.py` | `ApplicationTrackingSerializer` republished under the names the client reads (`program_name`, `intake_name`, `updated_at`), canonical-first with legacy display fallback |
| `backend/apps/applications/models.py` | the four additive nullable columns, deliberately **without** `unique=True` (uniqueness is the partial index) |
| `backend/apps/applications/urls.py` | the one new route |
| `backend/apps/catalog/tenant_audit_service.py` | `record_public_tracking_attempt` + `record_tracking_link_issued` and their actions — attempts and issues are audited **without the token** |
| `backend/config/settings/base.py` | `public_tracking_failure: 10/hour` and `PUBLIC_TRACKING_RATE_LIMITS` (default **on**) |
| `backend/scripts/2026_08_09_01_application_tracking_secret.sql` | **new** — the additive expand script |
| `backend/scripts/2026_08_09_01_application_tracking_secret_rollback.sql` | **new** — the contract sibling |
| `backend/apps/common/management/commands/harness_bootstrap.py` | the partial unique index mirrored for the harness's model-built schema (§3.2) |
| `backend/tests/unit/test_public_tracking_secret_10_5.py` | **new** — 61 cases (§9) |
| `backend/tests/property/test_public_tracking_properties_10_5.py` | **new** — 17 Hypothesis invariants (§9.2) |
| `backend/tests/property/test_system_alignment_tracking_safe_fields.py` | moved onto the new published contract (§9.1) |
| `apps/admissions/src/services/publicTracking.ts` | **new** — the one domain service for both calls; the tracker hook no longer touches the raw transport |
| `apps/admissions/src/components/student/TrackingLinkAction.tsx` | **new** — "Get tracking link": the owner's own issuing control, stating rotation, one-time display, and what the link grants |
| `apps/admissions/src/pages/public/tracker/**` | the aligned field contract, the token-built share URL, the removed reviewer-notes panel, and the copy for a refused application number |
| `apps/admissions/tests/unit/architectureEnforcement.test.ts` | the tracker hook removed from `LEGACY_EXCEPTIONS` — it is migrated, so the allowlist shrinks (§10.4) |
| `apps/admissions/tests/harness-e2e/helpers/ops.ts` | `clearPublicTrackingFailureBudget` (§7.3) |
| `apps/admissions/tests/harness-e2e/required/public-tracking-secret.spec.ts` | **new** — the 5 required journeys, desktop and mobile |
| `apps/admissions/tests/unit/publicTrackingSecret.test.tsx` | **new** — 25 cases |
| `apps/admissions/tests/property/publicTrackingSecret.property.test.ts` | **new** — 16 fast-check invariants |

---

## 1. What was wrong (STU-22, TEN-10)

STU-22:

> Public tracking accepts guessable application numbers, host binding is
> unreliable, the frontend share/fields do not match the backend response.

The tracker's credential check was a **format** check:

```python
TRACKING_CODE_PATTERN = re.compile(r"^(APP-\d{8}-[A-Z0-9]{8}|[A-Z]{2,10}\d{9,14}|TRK-…)$")
```

Anything matching was looked up, and two of those branches are not secrets at all:

| Identifier | Shape | Why it authorises nothing |
|---|---|---|
| `application_number` | `{CODE}{YEAR}{SEQ5}` | a per-tenant **sequential counter**. One valid number yields its neighbours by arithmetic — the whole submitted cohort of a school from a single leaked slip |
| `public_tracking_code` | `TRK-{CODE}{YEAR}{6 hex}` | the stem is derivable from the school and the year, leaving **24 bits** (16.7M) — and it is printed on every document |

Both were also printed on slips and letters, i.e. the credential and the reference
were the same string.

R13.12 names the remedy and allows two forms — "a random non-PII tracking secret
**or** a second factor". This task takes the first (§2.3).

## 2. The credential (R13.12, design §12)

Design §12:

> Public tracking uses a random, revocable, hashed tracking secret and minimal
> response.

`TRK-{selector}-{verifier}`, both halves drawn from Crockford base32
(`0-9A-Z` minus `I`/`L`/`O`/`U`, so nothing read off a screen or over a phone is
ambiguous):

| Half | Length | Bits | Stored as | Role |
|---|---|---|---|---|
| selector | 8 | 40 | plaintext, partial-unique indexed | the lookup |
| verifier | 20 | 100 | SHA-256 hex only | the secret |

- **The lookup runs only on the selector.** So the query plan never depends on the
  secret half and cannot be a timing oracle over it, and the comparison that *does*
  touch the secret is `hmac.compare_digest` on two fixed-length digests — no
  content and no length side channel.
- **The plaintext is never stored, logged or recoverable** (R17.2). A database reader
  cannot track an application.
- **One live secret per application.** Issuing revokes the previous one — design
  §12's "revocable" — and a revoked secret is indistinguishable from one that never
  existed.
- **A miss still spends the hash** (`matches(None, verifier)`), so an unknown
  selector and a wrong verifier do the same work.

Two hyphens and two fixed lengths make the shape unambiguous against every legacy
identifier (each of which has at most one hyphen), which is what lets `classify` be
total and pure (§4).

### 2.3 Why not a second factor

R13.12 permits one. A second factor over an *unauthenticated* endpoint means asking
the public to post a date of birth or a surname — adding applicant PII to the
request in order to protect applicant PII in the response, and handing an
enumerator a place to test guesses about a person. The random secret discloses
nothing and is the only option that keeps the request body free of PII.

## 3. Schema (additive, expand-only)

`backend/scripts/2026_08_09_01_application_tracking_secret.sql` — four nullable
columns and one partial unique index:

```sql
ALTER TABLE applications ADD COLUMN IF NOT EXISTS tracking_selector          varchar(16) NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS tracking_secret_hash       varchar(64) NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS tracking_secret_issued_at  timestamptz NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS tracking_secret_revoked_at timestamptz NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_tracking_selector
    ON applications (tracking_selector) WHERE tracking_selector IS NOT NULL;
```

- **Old rows readable throughout.** No default, no backfill: a legacy row keeps four
  NULLs, which means exactly "no tracking secret yet", and its owner can issue one at
  any time. `test_a_legacy_row_stays_readable_with_every_column_null` and
  `test_many_rows_may_coexist_without_a_secret` assert it, and the Neon rehearsal
  measured it on **33 real legacy applications** at every step (§3.3).
- **Online-safe.** `ADD COLUMN` with no default is metadata-only on PG 11+, and the
  partial unique index is built on a brand-new, entirely-NULL column — zero rows to
  scan, which is why it needs no `CONCURRENTLY` split phase.
- **Idempotent.** Every statement is guarded, so a re-run converges (§3.3 step 2).
- **The index is not decorative.** An unauthenticated endpoint that sequential-scans
  `applications` is a denial-of-service lever as well as a slow read; the measured
  plan is an `Index Scan` (§3.3 step 4). Partial, so the legacy NULL rows cost
  nothing.
- **The runner picks up the forward script and not the rollback**, and the forward
  script is additive by the runner's **own** lint —
  `_find_non_additive_violations(forward) == []` while the rollback would report
  `DROP COLUMN`, which is why the `_rollback.sql` suffix exclusion in
  `_iter_migration_files` matters (§3.3 step 8).

### 3.1 Why the model does not declare `unique=True`

Uniqueness is **partial** — over issued secrets only. Declaring `unique=True` on the
field would emit a second, different column-level constraint covering every legacy
NULL row and make the model schema and the SQL script disagree. The field is plain;
the index is the constraint.

### 3.2 The harness needed the index stated once more

`harness_bootstrap` builds the `managed = False` schema from the current *models*
(deliberately — see its docstring), so `add_field` emits the column but not a
partial index the model does not declare. Without it a selector collision would
produce two rows one public lookup could resolve to, so the same index is mirrored
there beside the other partial indexes.

### 3.3 Proven on a Neon branch, not on the default branch and not on production

Full log: [`raw/neon-branch-rehearsal.txt`](raw/neon-branch-rehearsal.txt). Project
`mihasApplication` (`wild-bar-37055823`), branch **`br-jolly-pine-ahybtg2e`**
(`v2-task-3.2-rehearsal`), `branchId` passed explicitly on every call.

| Step | Result |
|---|---|
| 0. the Neon **default** branch | `tracking_%` columns on `applications`: **0** — untouched |
| 1. pre-state on the branch | 33 legacy applications; `application_number` and `public_tracking_code` populated on all 33; all four new columns NULL on all 33 |
| 2. forward re-run | no error, 4 columns — converged, no duplicate object |
| 3. the partial index constrains | a second live `tracking_selector` with the same value is rejected (`unique_violation`) **while 31 rows hold NULL selectors simultaneously**; run inside a `DO` block whose final `RAISE` aborts it, so nothing persisted (verified: 0 selectors after) |
| 4. the lookup plan | `Index Scan` on `uq_applications_tracking_selector`, `Index Cond` on the selector, 0.017 ms — no sequential-scan fallback |
| 5. rollback | index and four columns dropped; **33 rows survive with both legacy identifiers intact** |
| 6. rollback re-run | no error — converged |
| 7. forward re-apply from the rolled-back state | four columns, all `is_nullable=YES` with `column_default` NULL, the partial index rebuilt, 33 rows readable with all four NULL |
| 8. the boot sweep | forward discovered, rollback excluded, forward additive by the runner's own lint, no `CONCURRENTLY` needed |

The rollback destroys only a set of SHA-256 digests whose plaintexts the platform
never held — i.e. it revokes every issued tracking link, which is the intended
meaning of rolling this back.

**Not done here:** the Neon **default** branch was not migrated, and production was
not contacted. Promoting the script (backup first, Neon default second, production
last) is the operator step in `.kiro/steering/infrastructure.md`.

## 4. One refusal, and one that costs nothing (R13.12, R17.7)

`classify()` is a pure function of the string with **no** database access, returning
exactly one of three kinds. That purity is the security property: the tracker's
answer to an application number must not depend on whether that number exists.

| Submitted | Answer | Charged? | Query? |
|---|---|---|---|
| nothing | 400 `VALIDATION_ERROR` | no | no |
| a legacy identifier (application number, legacy `TRK-`) | 400 `TRACKING_SECRET_REQUIRED` + where to get a link | **no** | **no** |
| anything else unrecognised | 400 `INVALID_FORMAT` | no | no |
| a well-formed secret that resolved nothing | 404 `NOT_FOUND` | yes | yes |
| a well-formed secret on the wrong tenant host | **the same** 404 `NOT_FOUND` | yes | yes |
| a live secret | 200 + the published contract | no | yes |

The pre-10.5 stable codes `VALIDATION_ERROR` and `INVALID_FORMAT` are **unchanged**.
`TRACKING_SECRET_REQUIRED` is **new and deliberate**: it is the one place the
endpoint says something specific, and it can, because it is derived from the string
alone. Charging for it would let a student pasting the number from their own slip
lock themselves out by doing the obvious thing.

### 4.1 Unknown, revoked, wrong, and foreign are one answer

All four arrive at `_refuse` and leave with the same status, code and message. The
*audit* distinguishes them (`not_found`, `host_mismatch`, `rate_limited`), because
an operator needs to; the response does not, because a caller must not.
`test_the_refusal_messages_are_constants` pins the messages as constants so they
cannot start varying with the database.

## 5. Tenant host binding (TEN-10, R2.3-R2.4, design §12)

> An institution domain can reveal only an application for that same tenant.

The host is resolved through task 4.4's `InstitutionContextService.resolve`, which
resolves a tenant **only** when exactly one `active`/`is_active` domain on an active
institution matches:

- **a resolved white-label host** may reveal only its own tenant's application; any
  other tenant's token is the byte-identical masked 404, so a school's portal cannot
  be used to confirm that a code belongs *somewhere else*;
- **the neutral Beanola portal** resolves any tenant's application by secret alone —
  there the secret is the whole authority (design §12), and the response carries no
  tenant data beyond the school's display name;
- **an unknown, multi-match or non-active host fails closed to neutral** (R2.3)
  rather than to a guess — `test_a_non_active_domain_fails_closed_to_the_neutral_context`.

`X-Forwarded-Host or get_host()` is the repo's established resolution pattern
(`catalog/views.py`, `student_draft_views.py`, `admin_review_views.py`), reused
unchanged. It is not an escalation vector: host binding only ever *narrows* what a
token can open.

## 6. The attempt budget (R13.12, R17.7)

`RateLimitMiddleware` already bounds *requests* to `/api/v1/applications/track/` at
20/10m per IP, and that stays (`test_the_coarse_middleware_budget_is_still_declared`).
It cannot be the enumeration control, because it spends the same budget on a student
refreshing their own status as on someone searching: tight enough to stop a search
breaks the legitimate use, loose enough for the legitimate use leaves a search
affordable.

So `PublicTrackingFailureThrottle` counts **only lookups that resolved nothing**,
at `10/hour` per client. A holder of a valid link never touches it. The failure
classes are merged on purpose — a differentiated budget would leak which failure
happened.

The gate `PUBLIC_TRACKING_RATE_LIMITS` defaults **on**, unlike the payment and
document-extract throttles: this is the boundary of an unauthenticated endpoint, not
an abuse control on an authenticated one, so an operator can disable it but not by
omission.

## 7. The two defects the browser gate found in this task's own code

The first browser run was **8 failed / 2 passed**, and neither failure was a test
artifact.

### 7.1 A spent budget refused the holder of a valid link

`allow_request` returned `len(history) < num_requests`, and DRF checks throttles in
`initial()` — *before* the view runs. So once an address had 10 failed attempts in
an hour, **every** request from it was 429, including a correct token. The failing
assertion said it exactly: `a valid holder should never spend the failure budget
(got 429)`.

That is not a harness artifact, it is the shared-address case: a school computer
room, an internet café, any NAT is one client here. One person mistyping ten times
locks everyone behind that address out of their own status for an hour — and it buys
nothing, because the verifier is 100 random bits, so answering a correct token
discloses nothing to whoever was guessing.

**The budget now gates the refusal, not the request.** `allow_request` never returns
`False` (it only loads the history so `wait()` stays correct); the view asks
`is_exhausted` **after** a lookup has already failed and raises `Throttled` then. An
enumerator gets at most 10 informative refusals per window and nothing but 429s
after that; the holder is never affected. A refused attempt is **not** charged, so a
client that keeps knocking cannot extend its own lockout
(`test_a_refused_attempt_does_not_extend_the_lockout`).

The pre-existing unit case `test_a_valid_holder_never_spends_the_failure_budget` did
not catch this because it only ever made *valid* requests, so the bucket never
filled. `test_a_spent_budget_still_answers_a_correct_token` is the case that pins
the real invariant, and it names the browser journey that found it.

### 7.2 The budget's identity was caller-controlled

Found while fixing 7.1. `SimpleRateThrottle.get_ident` reads
`api_settings.NUM_PROXIES` — from the **`REST_FRAMEWORK`** dict, which does not
define it. With DRF's default of `None` and an `X-Forwarded-For` present, `get_ident`
keys on the **whole forwarded chain**, so one spoofed header per request mints a
fresh budget and the whole control is decorative.

The key now comes from `apps.common.request_utils.get_client_ip`, the repo's
canonical trusted-proxy helper, which counts `NUM_PROXIES` (default 1) entries from
the **right**. `test_the_budget_identity_is_not_caller_controlled` sends three
spoofed chains and asserts 429 each time, and the browser journey asserts it through
the edge.

### 7.3 What the harness needed, and what it did not

The budget is keyed on the client address, and every Playwright context in this
harness — every project, every `freshContext()` — reaches the backend from one
address through Caddy. That is the property under test (§7.2), not a harness
limitation, so a "different client" cannot be simulated and the journey's original
step 2 ("the holder in the exhausted context is still refused") was asserting the
defect. It now asserts the fix.

`clearPublicTrackingFailureBudget` (`helpers/ops.ts`) is the one new lever, in the
established shape: it deletes the platform's **own** cache bucket, named by the
platform's own `cache_format` and `make_key`, so the endpoint's later decisions are
the ones it makes from an empty history. What is compressed is the *wait* — the
one-hour window — not any behaviour. There is deliberately no HTTP lever for this;
one would be the first thing an enumerator called.

### 7.4 And one defect in the journey's own seed

With the budget fixed, one journey still failed: another tenant's token opened on
this tenant's host. The cause was the seed, not the product —
`seedApplicant` created every applicant from the **neutral** origin, so all three
applications routed to the same school and the "foreign" token was not foreign.
Applicants are now created from their own school's host, and `seedWorld` **proves**
the binding from the institution-coded application numbers before journey 3 relies
on it. Without that assertion the host-isolation journey could pass while asserting
nothing.

## 8. The contract and the share link (STU-22, R13.12, R14.3)

The published field set is exactly seven:

```
application_number, status, program_name, intake_name, institution, submitted_at, updated_at
```

Two halves of the drift:

- **the names.** The page read `program_name`, `intake_name` and `updated_at`; the
  serializer published `program`, `intake` and `created_at`. The client papered over
  two with `??` fallbacks and rendered *"Updated Not available"* forever. The names
  are now the client's, so a future divergence is a failure rather than a blank.
- **the fields that were never there.** The page also read `feedback_summary`,
  `admin_feedback` and `admin_feedback_date` and rendered a **"Message from
  Admissions"** panel from them. The backend has never sent those — which is the only
  reason an unauthenticated page was not publishing reviewer notes. The panel is gone
  from the client, and the serializer states the whole contract so it cannot come back
  by accident.

Still deliberately absent: every applicant identifier and contact field, the payment
status, the eligibility notes, and `public_tracking_code` — which post-10.5
authorises nothing and so has no reason to be echoed to an unauthenticated caller.
`test_no_applicant_value_leaks_into_the_response` asserts it from the values' side
and journey 5 asserts it from the rendered page's.

### 8.1 Acquiring a link is a command

The secret is stored only as a SHA-256, so no read can return it. `POST
/api/v1/applications/{id}/tracking-link/` is the one place a secret comes into
existence: owner-only (staff are **not** admitted — issuing would silently revoke the
applicant's link), masked 404 for anything else, and the response is the one moment
the plaintext exists outside the owner's hands. Issuing rotates, and that is stated
to the caller (`replaced_previous`) and to the student, because a student acting on
the wrong assumption is the failure mode. A student who over-shared a link, or lost
it, issues another (R13.6) rather than reaching a dead end.

### 8.2 The share URL

`/track-application?code=<token>` — the random token and nothing else: no
application number, no name, no email. The absolute URL is built by the backend from
the **request's own origin**, so a student on their school's white-label host gets a
link back to the only host that will resolve it (§5) and nothing about a tenant is
guessed or hardcoded.

`window.location.href` could not serve this: a result reached by *typing* the code
into the box leaves the address bar at `/track-application`, so the pre-10.5 "Copy
Link" shared a URL that tracked nothing at all. Journey 2 settles it by opening the
copied URL in a clean context with no session.

## 9. The task's own suites

`backend/tests/unit/test_public_tracking_secret_10_5.py` — **61 cases**, all passing:

| Class | Cases | What it holds |
|---|---|---|
| `TestEnumeration` | 14 | §1, §2, §4 |
| `TestRateLimit` | 11 | §6, §7.1, §7.2 |
| `TestHostIsolation` | 6 | §5 |
| `TestContract` | 9 | §8 |
| `TestShareLink` | 10 | §8.1, §8.2 |
| `TestMigration` | 6 | the forward script ships, is additive and guarded; the rollback ships and is guarded; the columns exist and are nullable; the uniqueness is partial; a legacy row stays readable with every column NULL; many rows coexist without a secret |
| `TestOneAuthority` | 5 | one secret pattern; the view holds no credential comparison; no role string is compared in the tracking service; the endpoint is still classified `public_tracking_minimized`; the refusal messages are constants |

`apps/admissions/tests/unit/publicTrackingSecret.test.tsx` — **25 cases**: the
issuing control's three statements, the token-built share URL, the aligned fields,
and the absent reviewer-notes panel.

### 9.1 Pre-existing tests moved onto the new truth

- `backend/tests/property/test_system_alignment_tracking_safe_fields.py` — the
  published safe-field set updated to the renamed contract (§8). It asserted the
  *old* names, which were the drift.
- `apps/admissions/tests/unit/page-verification/public-tracker.test.tsx` — the
  Django-response fixtures use the published names, and one case was added:
  *"explains that an application number no longer opens tracking"*.
- `apps/admissions/tests/unit/architectureEnforcement.test.ts` — the tracker hook
  removed from `LEGACY_EXCEPTIONS` (§10.4).

### 9.2 Property tests (task invariants, not numbered spec properties)

There is no numbered PBT sub-task for 10.5 (`pbtResults` is `{}`), so nothing is
recorded via `update_pbt_status`. **17 Hypothesis invariants** ship anyway, over the
credential's whole input space:

| Group | Invariant |
|---|---|
| T1 classification is total and pure | every string has exactly one kind; classification is deterministic; a generated secret classifies as a secret; an application number and a legacy `TRK-` code **never** do |
| T2 secret round-trip | `parse` inverts `build`; the stored hash verifies the verifier; a **single-character** change never verifies; a missing stored hash never verifies; the hash is a SHA-256 hex digest |
| T3 alphabet is unambiguous | no issued code contains an ambiguous character; every code is URL-safe |
| T4 normalisation is stable | idempotent; a lower-case code still parses; surrounding whitespace is tolerated |
| T5 refusal vocabulary is closed | a non-secret never parses; a secret always parses |

`apps/admissions/tests/property/publicTrackingSecret.property.test.ts` — **16
fast-check invariants** over the client mirror: the pattern agrees with the backend's,
the share URL contains the token and no PII, and normalisation is idempotent.

## 10. Verification (verbatim)

### 10.1 Backend suites, against a measured baseline

```
cd backend && DATABASE_URL=<mihas_localtest 5433> TESTING=1 REDIS_URL=<local 6380> \
  .venv/bin/python3 -m pytest $(cat raw/selection.txt) -q --tb=no -rfE -p no:randomly
```

against the isolated `mihas_localtest` Postgres (`backend-postgres-1` on
`127.0.0.1:5433`). Neon and production were not touched. The selection is the
tracking / tenant-context / throttle / serializer-contract / audit lane —
[`selection.txt`](raw/selection.txt).

| Run | Files | Result |
|---|---|---|
| **baseline** — the same 47 files with only *this task's* edits removed | 46 | **8 failed, 394 passed**, 3 errors |
| **10.5 (candidate)** | 47 | **8 failed, 473 passed**, 3 errors |

[`candidate.txt`](raw/candidate.txt) / [`baseline.txt`](raw/baseline.txt), with the
sorted failing+erroring sets in
[`candidate-failing-set.txt`](raw/candidate-failing-set.txt) and
[`baseline-failing-set.txt`](raw/baseline-failing-set.txt).

- **New failures: 0.** `comm -13` over the two sorted sets (**11 entries each**) is
  empty. `comm -23` is also empty — nothing was fixed either, which is the honest
  reading: this task claims no repair of another lane's failure.
- **+79 passing**: 61 + 17 from this task's own suites, plus 1 net in the two
  pre-existing files §9.1 moved onto the new truth.

**How the baseline was produced.** The worktree carries the whole admissions-v2 spec,
so `git stash` cannot separate this task's edits from other lanes' uncommitted work
on the same files (`models.py`, `serializers.py`, `urls.py`, `throttling.py`,
`tenant_audit_service.py`, `base.py` are all shared). Instead
[`baseline-reconstruction.py`](raw/baseline-reconstruction.py) removes *this task's
own inserted blocks* by exact string match and restores the four new files — 
deterministic, and it leaves every other lane's change in place. This is stated
rather than glossed: it is a reconstruction, not a checkout.

The 8 failures and 3 errors present in **both** runs are pre-existing clusters and
are **not** this task's:

```
FAILED tests/contract/test_serializer_response_contract.py::TestAdminDashboardContract::test_admin_dashboard_envelope_and_keys
FAILED tests/property/test_application_properties.py::TestUnverifiedPaymentApprovalGuard::test_non_approval_status_skips_payment_check
FAILED tests/property/test_cross_tenant_invisibility.py::TestProperty4CrossTenantInvisibility::test_no_tenant_b_token_on_any_scoped_surface
FAILED tests/unit/test_applications_serializers.py::test_admin_views_declare_serializer_class
FAILED tests/unit/test_applications_serializers.py::test_student_views_declare_serializer_class
FAILED tests/unit/test_cross_tenant_isolation.py::TestEndpointExportIsolation::test_export_excludes_other_school_application_number
FAILED tests/unit/test_cross_tenant_isolation.py::TestEndpointGrantScopeFidelityHttp::test_application_grant_does_not_widen_to_sibling
FAILED tests/unit/test_public_endpoint_policy.py::test_every_allow_any_view_has_public_endpoint_classification
3 ERROR tests/unit/test_application_number_generator.py  (SQL-function format invariants)
```

They matter for this lane specifically, because 10.5 touches the tracking
serializer, the public-endpoint classification and the cross-tenant surface. They
appear **byte-identically** in `baseline-failing-set.txt`, which is what makes them
attributable elsewhere rather than here — and the neighbouring suites that would
have caught a regression (`test_institution_context.py`,
`test_scenario_domain_routing.py`, `test_scenario_domain_fail_closed.py`,
`test_domain_resolution_fail_closed.py`, `test_tenant_audit_pii_redaction.py`,
`test_payment_throttling.py`, `test_rate_limiting.py`) appear in **neither** set:
they pass on both sides.

### 10.2 The authority matrix and the view classification

`tests/unit/test_authority_matrix_v2.py` + `test_view_auth_classification.py`:
**3 failed / 37 passed** — [`authority-matrix.txt`](raw/authority-matrix.txt). The
same three [10.4 §10.2](../10.4/README.md) recorded, including the stale
`preview-summary` registry entry task 7.4's lane left behind. This task's new route
is registered and the tracker is still classified `public_tracking_minimized`
(`test_the_endpoint_is_still_classified_as_public_tracking`).

### 10.3 Frontend gates

| Gate | Result | Artifact |
|---|---|---|
| `bun run test` | **1 failed / 4229 passed / 1 skipped** (480 files) — the single failure is the pre-existing `authPageFormMarkup` copy conflict | [`frontend-test.txt`](raw/frontend-test.txt) |
| `bun run lint` | **17 errors, 0 warnings** across **14 files** | [`frontend-lint.txt`](raw/frontend-lint.txt), [`frontend-lint-files.txt`](raw/frontend-lint-files.txt) |
| `bun run build` | **exit 0** (includes `tsc -p tsconfig.build.json --noEmit`, `vite build`, and the CSP gate) | [`frontend-build.txt`](raw/frontend-build.txt) |

The pre-10.5 frontend baseline is [10.4 §10.3](../10.4/README.md): **1 failed /
4195 passed / 1 skipped** across 478 files, **18** lint errors across **15** files.
So: **+34 passing, +2 test files, the same single pre-existing failure, and one
lint error fewer**.

The lint delta is attributable, not incidental: the file that dropped out is
`src/pages/public/tracker/hooks/useApplicationTracker.ts`, whose single error was the
R14.3 violation *"Pages and components must not import the raw API client"* — and
this task moved that hook onto `services/publicTracking`. `diff` against 10.4's file
list is exactly that one line.

### 10.4 The architecture guard this closed

Removing that import made the hook's entry in `architectureEnforcement.test.ts`'s
`LEGACY_EXCEPTIONS` **stale**, and the second guard there ("the allowlist only
shrinks") failed with:

```
- src/pages/public/tracker/hooks/useApplicationTracker.ts — no longer imports the
  raw client; it has been migrated, so remove it from LEGACY_EXCEPTIONS
```

The entry is removed. The allowlist shrank by one, which is the direction R14.5
requires, and this is the guard working rather than a failure to route elsewhere.

### 10.5 Django system checks

`cd backend && .venv/bin/python3 manage.py check`

```
LENCO_API_SECRET_KEY is not set — payment processing will be unavailable.
System check identified no issues (1 silenced).
CHECK_EXIT=0
```

[`django-check.txt`](raw/django-check.txt). The LENCO line is the expected local-dev
notice — this machine holds no provider credential.

> **`manage.py check` must run with the repo's own environment.** Exporting a
> `TESTING=1` or a substitute `REDIS_URL` first flips `CACHES` to `LocMemCache`
> (`base.py` `_is_testing`) and the check then reports
> `django_ratelimit.E003 — not a shared cache`. That is the override talking, not
> the platform (recorded by 8.3 §7.7 through 10.4 §10.4; re-confirmed here).

### 10.6 OpenAPI schema

`cd backend && .venv/bin/python3 manage.py spectacular --file /tmp/schema-105.yaml`

```
Warnings: 3 (3 unique)
Errors:   116 (26 unique)
SPECTACULAR_EXIT=0
```

[`spectacular.txt`](raw/spectacular.txt) — **identical counts** to 8.2 through 10.4,
despite this task adding an operation and rewriting another's parameters. The new
`applications_issue_tracking_link` is fully annotated (201/404/503) and
`applications_track` declares `auth=[]`, its `code` parameter and its
200/400/404/429 responses, so neither introduces a warning. The three remaining
warnings are the pre-existing collisions on `/api/v1/admin/intakes/`,
`/api/v2/admin/change-requests/` and `/api/v2/admin/onboarding/`.

### 10.7 Browser journeys

```
cd apps/admissions && HARNESS_PW_CHANNEL=chrome PLAYWRIGHT_BASE_URL=http://localhost:8090 \
  bunx playwright test -c playwright.harness.config.ts \
  --project=chromium-required --project=mobile-required \
  tests/harness-e2e/required/public-tracking-secret.spec.ts
```

```
Running 10 tests using 1 worker
  … 10 passed (32.1s)
```

[`harness-tracking-journeys.txt`](raw/harness-tracking-journeys.txt). Run against the
task-0.4 isolated harness with the strict `harness-fixtures.ts` gates active: zero
skips, no console errors, no unhandled exceptions, no unasserted failed requests.
`HARNESS_PW_CHANNEL=chrome` is the config's documented escape hatch (Playwright's
bundled Chromium has no build for this machine); it changes the browser binary, not
the assertions. The harness was brought up **fresh** (`harness/bin/harness up`, which
wipes volumes, rebuilds the backend image and runs `bun run build`) before the runs
below, and torn down (`harness/bin/harness down`) after.

**The whole required profile**, freshly wiped, no spec filter:

```
2 failed
  [chromium-required] › required/tenant-launch.spec.ts:139:5 › … the wizard exposes program / intake / fee / routing steps on mobile
  [mobile-required]   › required/tenant-launch.spec.ts:139:5 › … the wizard exposes program / intake / fee / routing steps on mobile
144 passed (9.8m)
```

[`harness-required-suite.txt`](raw/harness-required-suite.txt). The two failures are
the locator-ambiguity failures [10.1 §6.5](../10.1/slice-2-frontend.md) already
measured as pre-existing (`getByText('Fees', …).first()` resolving to the admin
sidebar's hidden "Program Fees" item). 10.4's profile was **134 passed / the same 2
failed**; this one is **144 passed / the same 2 failed** — the +10 being this task's
journeys, with every earlier lane's journeys re-run and passing.

**The admin-lane flake, and why it is not this task's.** Two earlier attempts at the
same profile reported 2–3 *additional* failures, and a different set each time
(`admin-applications-roster:325`, `admin-dashboard-metrics:356`,
`admin-user-directory:227`). Three facts settle the attribution, and they are
recorded rather than smoothed over:

1. those specs run **strictly before** `public-tracking-secret.spec.ts` in file order
   within each project, so this task's state cannot reach them;
2. they **pass in isolation**, including the exact two cases that failed
   ([`harness-admin-lane-isolated.txt`](raw/harness-admin-lane-isolated.txt), 13
   passed);
3. the same profile **minus this task's journeys** is 134 passed / the same 2 failures
   / nothing skipped ([`harness-required-without-10-5.txt`](raw/harness-required-without-10-5.txt))
   — identical to 10.4's number — and the final full run with the journeys included is
   clean.

### 10.8 Failures introduced by this task

**Zero**, against measured baselines rather than assertion:

| Scope | Evidence |
|---|---|
| Backend tracking/tenant-context/throttle/serializer/audit suites | baseline 8 failed / 394 passed → 8 / **473**; the new-failure diff is empty over 11 entries each side (§10.1) |
| Authority matrix / view classification | the same 3 pre-existing failures, with this task's route registered and its endpoint still classified (§10.2) |
| Frontend | the same single pre-existing failure; **17** lint errors across **14** files — one **fewer** than 10.4, and the removed one is attributable to this task's own migration (§10.3) |
| Build / check / schema | exit 0, no issues, **3 warnings / 116 errors** unchanged with one operation added and one rewritten (§10.3–10.6) |
| Browser | 10/10 on a freshly wiped harness, both viewports, zero skips; the whole required profile 144 passed with the same 2 pre-existing failures (§10.7) |
| Schema | 33 real legacy rows readable through forward → re-run → rollback → re-run → re-apply on a Neon branch (§3.3) |

The failures this lane deliberately did **not** touch, because they belong elsewhere:
the 8 backend failures and 3 errors above, the pre-existing `authPageFormMarkup`
frontend failure, the 17 lint errors, the 3 authority-matrix failures, and the 2
`tenant-launch` browser failures.

## 11. What was inherited, and what was re-measured

An earlier dispatch of this task was interrupted after the backend, frontend and
test code were written but **before** any browser run and before this README existed.
Everything below was re-run against the current tree.

| Inherited from the interrupted dispatch | Status now |
|---|---|
| the backend service, view, throttle, serializer, model columns, SQL scripts, routes, audit methods | present; **two defects found and fixed** (§7.1, §7.2) |
| the frontend service, component, tracker changes | present; one stale architecture-allowlist entry closed (§10.4) |
| `baseline.txt` / `selection.txt` / the reconstruction script | reused as-is; the candidate was **re-run** (§10.1) |
| `django-check` / `spectacular` / `authority-matrix` / `frontend-*` artifacts | all **re-captured** after the fixes |
| the browser journeys | **never run before**; run here, which is what found §7.1 / §7.2 / §7.4 |
| the Neon rehearsal | the forward script had been applied to the branch; the **full** forward → idempotent → uniqueness → rollback → idempotent → re-apply sequence was rehearsed and captured here (§3.3) |

Two post-snapshot corrections to the inherited code are worth naming because they
were wrong as written: the throttle rate was `10/10m`, which
`SimpleRateThrottle.parse_rate` cannot parse (it reads `period[0]`, so `"10m"` →
`'1'` → `KeyError`) and is now `10/hour`; and the model field carried `unique=True`,
which contradicts the partial index (§3.1).

## 12. Not claimed here

- **The migration is not on the Neon default branch or production.** It is proven on
  `br-jolly-pine-ahybtg2e` (§3.3). Promotion is the operator step in
  `.kiro/steering/infrastructure.md`: backup, Neon default, then production.
- **No existing tracking secret was backfilled**, and none could be: the platform
  cannot mint a secret for an applicant it will not hand it to. Every legacy
  application starts with four NULLs and its owner issues a link when they want one.
  A student who *only* ever had their application number now needs one round trip
  through their own account — which is the point of the finding, but it is a real
  behaviour change for anyone holding a printed slip.
- **`public_tracking_code` is not removed.** It authorises nothing after this task
  and is not echoed by the tracker, but it is still generated, stored, printed and
  searchable. Retiring the column belongs with the R13.5 measurement window, not
  here.
- **No second factor.** R13.12 allows one; §2.3 says why the random secret is the
  option that discloses nothing. If a future requirement wants a second factor
  *as well*, `classify` is the seam.
- **The tracking secret has no expiry.** It is revocable (issuing rotates), but a
  link that is never replaced stays live indefinitely. A TTL is a policy question —
  what happens to a student who tracks a two-year-old application — and it needs a
  requirement, not a default invented here.
- **There is no self-service revoke.** Issuing a new link revokes the old one, which
  covers "I shared it too widely", but there is no "turn tracking off" control. The
  service exposes `revoke()`; no endpoint calls it.
- **R17.3's tracking metrics are not added.** Attempts, refusals and 429s are
  observable through the audit trail (`application.tracking_attempted` with its
  outcome) and the logs; a counter family is a metrics-lane change with its own label
  policy (`payment_metrics`' PII guardrail is the precedent).
- **The coarse middleware budget was not retuned.** 20/10m per IP on the same path
  stays exactly as it was; this task adds a second, failure-scoped budget beside it.
- **A role string still appears in the tracker's neighbourhood.** The tracking
  *service* compares none (`test_no_role_string_is_compared_in_the_tracking_service`
  AST-asserts it), and the issue endpoint resolves ownership through
  `resolve_owned_application`. Staff exclusion there is a deliberate ownership rule,
  not an authority check.
- **`X-Forwarded-Host` is still trusted for tenant resolution.** That is the repo's
  established pattern and it only ever *narrows* what a token opens, but it is a
  caller-supplied input feeding a tenant decision, and unifying it with
  `get_client_ip`'s trusted-proxy discipline is a cross-cutting change to every
  resolution site, not this task's.
- **The admin-lane browser flake is not fixed.** §10.7 attributes it and leaves it;
  three specs in that lane fail intermittently in a long profile and pass in
  isolation.
- **No new capability or role.** The catalogue stays at 17 `platform.*` + 17
  `tenant.*`. The one new route is owner-authorised, not capability-gated.
