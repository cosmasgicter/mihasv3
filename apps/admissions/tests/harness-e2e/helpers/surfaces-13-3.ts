/**
 * The surfaces task **13.3** sweeps, and the world they need.
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` phase 13, third bullet.
 * Requirements: **R16** (whole), **R18.2-R18.4**.
 * Findings: **STU-03** (wizard/bottom-nav competition), **STU-04** (the next
 * action obscured), **STU-05** (document action density), **STU-10** (native
 * confirms, sub-44 targets), **STU-14** (notification settings + mobile nav),
 * **STU-20** (settings autosave, static metrics), **STU-23** (one canonical
 * application workspace), **STU-24** (brand/support through tenant context).
 *
 * ## Which surfaces, and why these
 *
 * One surface per finding the bullet names, plus the public tracker, because
 * R16.7's *"no horizontal overflow, clipped text, hidden commands, overlapping
 * fixed surfaces, or layout shifts"* is a claim about the student's whole
 * journey and not about one page that happens to be well behaved. Every entry
 * carries the finding it serves so the report can attribute a measurement rather
 * than list it.
 *
 * ## What this deliberately does not re-derive
 *
 * Tasks 11.1-11.5 already screenshot `/student/dashboard`, the wizard,
 * `/student/history`, the admin record lists and the tracker at 320/375/390
 * (`docs/v2-evidence/11.1`-`11.5/screenshots/`), and 11.5 ran `/student/history`
 * at all six R16.7 widths plus a 400 % zoom. This world exists for the sweep
 * those did not do: **every** surface at **all six** widths with the numbers
 * recorded, plus the six dimensions no earlier task measured in a browser at all
 * (occlusion, CLS, safe-area insets, slow 3G, 200 % zoom, long strings).
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '../harness-fixtures';
import { evidenceDir } from './evidence-dir';
import {
  assignOffering,
  createDraftApplication,
  createFee,
  createIntake,
  freshContext,
  linkIntake,
  listCanonicalPrograms,
  persistMinimumGrades,
  superAdminContext,
  uploadDocument,
  type AuthedContext,
} from './api';

export interface Surface {
  id: string;
  /** Human label used in every assertion message and every screenshot name. */
  label: string;
  /** Resolved at call time, because two of them carry a draft id. */
  url: (world: StudentWorld) => string;
  auth: 'public' | 'student';
  /** The finding this surface is in the matrix for. */
  finding: string;
  /** A locator that proves the surface actually rendered before it is measured. */
  ready: (page: Page) => Promise<void>;
}

/**
 * The `beanola-preloader` overlay is painted by `index.html` before any JS loads.
 * Every geometry claim has to be made after it leaves, or the measurement is
 * about the boot screen.
 */
export async function settled(page: Page): Promise<void> {
  await expect(page.locator('.beanola-preloader')).toHaveCount(0, { timeout: 45_000 });
}

/** Wait for the app shell to have painted *something* the student can act on. */
async function readyByRole(page: Page, name: RegExp): Promise<void> {
  await expect(page.getByRole('heading', { name }).first()).toBeVisible({ timeout: 45_000 });
}

/**
 * `main` is present on every authenticated surface, so it is the fallback anchor
 * for pages whose heading text is data-dependent (a tenant's own program name, a
 * localized string) and therefore cannot be asserted by literal text here.
 */
async function readyByMain(page: Page): Promise<void> {
  await expect(page.locator('main').first()).toBeVisible({ timeout: 45_000 });
}

export const SURFACES: Surface[] = [
  {
    id: 'tracker',
    label: '/track-application',
    url: () => '/track-application',
    auth: 'public',
    finding: 'STU-24',
    ready: (page) => readyByRole(page, /Track (your )?application/i),
  },
  {
    id: 'dashboard',
    label: '/student/dashboard',
    url: () => '/student/dashboard',
    auth: 'student',
    finding: 'STU-04',
    ready: async (page) => {
      await expect(page.getByTestId('student-next-action')).toBeVisible({ timeout: 45_000 });
    },
  },
  {
    id: 'wizard',
    label: '/student/application-wizard?mode=resume',
    url: (world) =>
      `/student/application-wizard?mode=resume&draftId=${world.draftApplicationId}`,
    auth: 'student',
    finding: 'STU-03',
    ready: async (page) => {
      await expect(page.getByTestId('wizard-action-bar')).toBeVisible({ timeout: 60_000 });
    },
  },
  {
    /*
      The **id-bearing** canonical workspace route, deliberately.

      The bare `/student/status` is a registered route, and measured, it renders
      *"Application Not Found"* even for a student who owns two applications — so a
      matrix that used it would have published an error state as if it were STU-23's
      canonical application workspace. That observation is recorded as
      GATE-13.3-09; the surface measured here is the one a student actually reaches.
    */
    id: 'status',
    label: '/student/application/{id}/status',
    url: (world) => `/student/application/${world.submittedApplicationId}/status`,
    auth: 'student',
    finding: 'STU-23',
    ready: readyByMain,
  },
  {
    id: 'payment',
    label: '/student/payment',
    url: () => '/student/payment',
    auth: 'student',
    finding: 'STU-24',
    ready: readyByMain,
  },
  {
    id: 'documents',
    label: '/student/history',
    url: () => '/student/history',
    auth: 'student',
    finding: 'STU-05',
    ready: readyByMain,
  },
  {
    id: 'notifications',
    label: '/student/notifications',
    url: () => '/student/notifications',
    auth: 'student',
    finding: 'STU-14',
    ready: readyByMain,
  },
  {
    id: 'settings',
    label: '/student/settings',
    url: () => '/student/settings',
    auth: 'student',
    finding: 'STU-20',
    ready: readyByMain,
  },
];

/** Every width R16.7 names, in the order the requirement names them. */
export const VIEWPORTS = [
  { label: '320x568', width: 320, height: 568 },
  { label: '375x667', width: 375, height: 667 },
  { label: '390x844', width: 390, height: 844 },
  { label: '768x1024', width: 768, height: 1024 },
  { label: '1280x800', width: 1280, height: 800 },
  { label: '1440x900', width: 1440, height: 900 },
] as const;

/** The first of them — the width R16.1 says the student experience is designed at. */
export const FIRST_MOBILE_VIEWPORT = VIEWPORTS[0];

export interface StudentWorld {
  admin: AuthedContext;
  stamp: string;
  canonicalProgramId: string;
  intakeId: string;
  offeringId: string;
  institutionId: string;
  studentEmail: string;
  studentPassword: string;
  /** Still `draft` — the wizard resumes this one and the dashboard names it. */
  draftApplicationId: string;
  /** `submitted` with a fee still owed — what `/student/payment` owns (R12.3). */
  submittedApplicationId: string;
}

/**
 * One student with **both** states the matrix needs.
 *
 * A draft, because the wizard has nothing to resume without one and the
 * dashboard's next action is only a real server-derived blocker when there is
 * something blocked; and a submitted application with an unpaid fee, because
 * `/student/payment` owns post-submission recovery and renders nothing for a
 * student who only has a draft (R12.3, STU-09). Two applications for the same
 * program + intake is legal under the default `unrestricted` multi-intake policy,
 * and 13.2's golden journey already established that.
 *
 * Everything is created over the platform's own capability-gated HTTP commands —
 * no seeded id, no direct database write, no fixture file.
 */
export async function buildStudentWorld(label: string): Promise<StudentWorld> {
  const admin = await superAdminContext();
  const stamp = `${Date.now()}`.slice(-8);

  const canonicals = await listCanonicalPrograms(admin);
  expect(
    canonicals.length,
    'the harness catalogue should publish at least one canonical program',
  ).toBeGreaterThan(0);
  const canonicalProgramId = String(canonicals[0].id);

  const { intakeId } = await createIntake(admin, {
    name: `Task 13.3 ${label} Intake ${stamp}`,
    year: new Date().getFullYear() + 1,
  });

  const institutionId = await seededInstitutionId(admin, 'MIHAS');
  const { offeringId } = await assignOffering(admin, institutionId, {
    canonical_program_id: canonicalProgramId,
    name: `Task 13.3 ${label} Offering ${stamp}`,
    code: `T133${label.slice(0, 2).toUpperCase()}${stamp}`,
  });
  await linkIntake(admin, { program_id: offeringId, intake_id: intakeId, max_capacity: 60 });
  await createFee(admin, offeringId, { amount: '153.00' });

  const ctx = await freshContext();
  const studentEmail = `harness.13-3.${label}.${stamp}@example.com`;
  const studentPassword = 'HarnessStudent123';
  const register = await ctx.post('/api/v1/auth/register/', {
    data: {
      email: studentEmail,
      password: studentPassword,
      first_name: 'Harness',
      last_name: 'Thirteen',
    },
  });
  expect(
    register.ok(),
    `the applicant should register (got ${register.status()}: ${await register.text()})`,
  ).toBeTruthy();
  const login = await ctx.post('/api/v1/auth/login/', {
    data: { email: studentEmail, password: studentPassword },
  });
  expect(login.ok(), `the applicant should log in (got ${login.status()})`).toBeTruthy();
  const csrf = login.headers()['x-csrf-token'] || '';
  expect(csrf, 'login should return an X-CSRF-Token header').toBeTruthy();

  // 1. The draft the wizard resumes. One document uploaded, so the readiness
  //    evaluator has cleared one gate and names another — the dashboard then shows
  //    a real mid-flight blocker instead of the very first one every time.
  const draft = await createDraftApplication(ctx, csrf, {
    canonicalProgramId,
    intakeId,
    email: studentEmail,
    fullName: `Harness Thirteen Three ${stamp}`,
  });
  await uploadDocument(ctx, csrf, draft.applicationId, 'nrc');

  // 2. The submitted application `/student/payment` owns. Grades and documents
  //    first, so submission is a real one rather than a forced status write.
  const submitted = await createDraftApplication(ctx, csrf, {
    canonicalProgramId,
    intakeId,
    email: studentEmail,
    fullName: `Harness Thirteen Three ${stamp}`,
  });
  await persistMinimumGrades(ctx, csrf, submitted.applicationId);
  await uploadDocument(ctx, csrf, submitted.applicationId, 'nrc');
  await uploadDocument(ctx, csrf, submitted.applicationId, 'result_slip');
  const review = await admin.ctx.post(`/api/v1/applications/${submitted.applicationId}/review/`, {
    headers: { 'x-csrf-token': admin.csrf },
    data: { new_status: 'submitted', notes: 'harness 13.3 viewport-matrix setup' },
  });
  expect(
    review.ok(),
    `submission should succeed (got ${review.status()}: ${await review.text()})`,
  ).toBeTruthy();

  await ctx.dispose();

  return {
    admin,
    stamp,
    canonicalProgramId,
    intakeId,
    offeringId,
    institutionId,
    studentEmail,
    studentPassword,
    draftApplicationId: draft.applicationId,
    submittedApplicationId: submitted.applicationId,
  };
}

// ---------------------------------------------------------------------------
// Where these four specs write — resolvable, because GATE-13.1-07 is a live finding
// ---------------------------------------------------------------------------
/**
 * The evidence directory this run writes into.
 *
 * Overridden by **`V2_EVIDENCE_DIR`** (a path relative to the repository root) so a
 * later task re-measuring these same surfaces writes into **its own** directory.
 *
 * Added by task 13.6 remediation L5-L6, which re-runs all four of 13.3's specs to
 * verify its own fixes. Without this the re-run would overwrite 13.3's
 * `measurements-*.jsonl`, its screenshots and its `playwright-report.json` — which is
 * precisely **GATE-13.1-07**, the live finding that three instruments overwrite an
 * earlier task's Required_Evidence. 13.2 and 13.3 both avoided it by pointing their
 * own Playwright config at their own `outputDir`; a config cannot redirect a path
 * computed inside a spec, so the path is parameterised here instead.
 *
 * **Task 13.6 remediation L8 changed the default.** L5-L6 defaulted this to
 * `docs/v2-evidence/13.3`, which kept re-running 13.3 *as* 13.3 free but also left the
 * hazard in place: these four specs live under `required/`, so an ordinary
 * `playwright.harness.config.ts` run — a run with no interest in 13.3 at all — rewrote
 * 13.3's recorded artifacts. The default is now **run-scoped** (see
 * `./evidence-dir`), and regenerating 13.3's own directory is the explicit
 * `V2_EVIDENCE_TASK_DIRS=1` (or `V2_EVIDENCE_DIR=docs/v2-evidence/13.3`) case. The
 * override branch is byte-for-byte the behaviour L5-L6 relied on, so its config and its
 * recorded run are unaffected.
 *
 * One definition, not two: this delegates to `evidenceDir()` rather than restating the
 * rule, because the resolution now has three branches and two spellings of a
 * three-branch rule is how it drifts.
 */
export function evidenceRoot(): string {
  return evidenceDir('13.3');
}

/** Resolve one seeded institution id by its code, through the catalogue. */
export async function seededInstitutionId(
  admin: AuthedContext,
  code: string,
): Promise<string> {
  const resp = await admin.ctx.get('/api/v1/catalog/institutions/?pageSize=100');
  expect(resp.ok(), `the institution catalogue should be readable (got ${resp.status()})`).toBeTruthy();
  const payload = await resp.json();
  const data = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
  const rows: any[] = Array.isArray(data) ? data : (data?.results ?? []);
  const row = rows.find((item) => item?.code === code);
  expect(row?.id, `the harness should seed the ${code} tenant`).toBeTruthy();
  return String(row.id);
}

/** Sign the world's student in through the browser context's own cookie jar. */
export async function loginStudent(page: Page, world: StudentWorld): Promise<void> {
  const login = await page.request.post('/api/v1/auth/login/', {
    data: { email: world.studentEmail, password: world.studentPassword },
  });
  expect(
    login.ok(),
    `${world.studentEmail} should log in (got ${login.status()}: ${await login.text()})`,
  ).toBeTruthy();
}

/** The harness noise every required journey allows, established by 8.3's specs. */
export function allowHarnessNoise(gate: {
  allowRequest: (p: string | RegExp) => unknown;
  allowConsole: (p: string | RegExp) => unknown;
}): void {
  gate.allowRequest('glitchtip');
  gate.allowRequest('harness-invalid.localhost');
  gate.allowConsole('Content Security Policy');
  gate.allowConsole('Failed to load resource');
}

// ---------------------------------------------------------------------------
// The sub-44 px controls task 13.3 found — ALL SEVEN NOW FIXED, list EMPTY
// ---------------------------------------------------------------------------
/**
 * **Empty, and that is the assertion.**
 *
 * Task 13.3 found seven distinct sub-44 controls and allow-listed each one *by
 * accessible name or element `id`, with its measured size*, so that the six
 * per-viewport matrix rows could go on measuring everything else while the owning
 * lanes fixed their primitives. The list was the record of what was known-bad.
 *
 * Task 13.6 remediation **L6** fixed all seven, so the list is empty. Emptying it
 * is the substance of the conversion, not a tidy-up: while an entry remained, a
 * *regression* of that control would have been silently attributed instead of
 * failing. Now every offender at every width is unattributed, and an unattributed
 * offender fails its row. The `test.fail()` rows that stated the unweakened R16.2
 * claim are `test()` rows in the same commit, for the same reason.
 *
 * What was fixed, with 13.3's measurement and the change:
 *
 * | finding | control | 13.3 measured | fix |
 * |---|---|---|---|
 * | **GATE-13.3-01** | authenticated mobile header, every route | 40.000 x 40.000 (x86) | `min-h-touch min-w-touch` — `navigation/AppLayout.tsx` |
 * | **GATE-13.3-02** | mobile wizard step row at 320 px | 18-20 x 40/48 | 44 px + `shrink-0` + `flex-wrap`, connectors `hidden xs:block` — `EnhancedProgressIndicator.tsx` |
 * | **GATE-13.3-03** | shared `Switch` — inert 44 px `div` around a 44 x 24 control | 44 x 24 (x36) | the `Root` **is** the 44 px target; the track is a `span` inside it — `ui/switch.tsx` |
 * | **GATE-13.3-04** | `ErrorDisplay`'s links, every error state in the product | 126.797 x 20 | `min-h-touch` on all three controls — `ui/ErrorDisplay.tsx` |
 * | **GATE-13.3-05** | desktop sidebar collapse, 7 of 8 surfaces >= 768 px | 36 x 36 (x42) | `min-h-touch min-w-touch` — `navigation/DesktopSidebar.tsx` |
 * | **GATE-13.3-06** | wizard floating shortcuts button >= 1280 px | 40 x 44 | `min-h-touch min-w-touch` — `KeyboardShortcutsHelp.tsx` |
 * | **GATE-13.3-15** | amendment form's own fields, >= 768 px only | 37 / 38 px tall | `min-h-touch` on the control, not on a media query — `AmendmentForm.tsx` |
 *
 * The shape stays exported and typed so a *future* finding can be recorded the same
 * way, with its number and its owner, rather than by loosening a threshold.
 */
export const KNOWN_SUB44: {
  /** Matched against the accessible label. */
  match?: RegExp;
  /** Matched against the element's `id` — precise where a label is absent. */
  id?: RegExp;
  finding: string;
  owner: string;
  measured: string;
}[] = [];

/** The finding an offender belongs to, or `undefined` if this run did not find it. */
export function attributedSub44(offender: { label: string; id?: string }) {
  return KNOWN_SUB44.find(
    (known) =>
      (known.match ? known.match.test(offender.label) : false) ||
      (known.id ? known.id.test(offender.id ?? '') : false),
  );
}

/**
 * **Empty — GATE-13.3-07 is fixed (task 13.6 remediation L6).**
 *
 * Task 13.3 measured the dashboard's first paint over Core Web Vitals' 0.100
 * budget at two widths and proved it was not flake: **0.1164 @ 375 x 667** and
 * **0.1050 @ 390 x 844**, with 375 px reading 0.1172 / 0.1188 / 0.1164 / 0.1164
 * across four separate runs. Every other width was inside budget (320 = 0.0869,
 * 768 = 0.0899, 1280 = 0.0551, 1440 = 0.0489) and the wizard was inside at all
 * six, so it was one surface at two widths.
 *
 * Two insertions at the top of the page, both now removed:
 *
 * 1. `NextActionPanel` rendered an eyebrow and a heading while readiness was in
 *    flight and then **grew by a two-line blocker sentence plus a 68 px primary
 *    control** when it landed — ~90 px appearing above everything else at
 *    t ~ 600 ms, which against a 667 px viewport is the 0.11 that was measured. The
 *    loading state now occupies the resolved state's box.
 * 2. The dashboard's refresh progress bar was the first child of a `space-y-6`
 *    stack, so every poll inserted and removed ~28 px at the top of the content.
 *    It is `absolute` now and contributes nothing to layout.
 *
 * As with `KNOWN_SUB44`, emptying this is the assertion: an over-budget reading at
 * any width on any surface is now unattributed, and the CLS row fails on any
 * unattributed reading.
 */
export const KNOWN_CLS_OVER_BUDGET: { surface: string; viewport: string; finding: string }[] = [];

export function attributedCls(reading: { surface: string; viewport: string }) {
  return KNOWN_CLS_OVER_BUDGET.find(
    (known) => known.surface === reading.surface && known.viewport === reading.viewport,
  );
}

/**
 * Append one measurement to this task's evidence file, **as it is taken**.
 *
 * Not accumulated in memory and written in `afterAll`, and the reason is measured:
 * Playwright tears down and replaces the worker process after a failed test, which
 * resets module state and re-runs `afterAll` — so an accumulate-then-overwrite
 * ledger published only the rows from whichever worker happened to finish last. The
 * first full run took 20 measurements and the file held **2**.
 *
 * JSON Lines, appended, one row per measurement: durable across a worker restart,
 * and a partial run still leaves behind everything it actually measured.
 */
export function recordRow(project: string, row: Record<string, unknown>): void {
  // `evidenceRoot()` rather than a hard-coded `13.3` — see its own docblock, and
  // GATE-13.1-07.
  const dir = join(evidenceRoot(), 'raw');
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, `measurements-${project}.jsonl`), `${JSON.stringify(row)}\n`, 'utf8');
}

/**
 * Wait out any transient toast before geometry is measured.
 *
 * The first recorded run reported four wizard header controls "painted over" by
 * `div.pointer-events-auto rounded-lg border shadow-lg p-4 min-w-[280px]` — a
 * `Toast`. A toast is *supposed* to sit above the page and it dismisses itself, so
 * measuring while one is up makes the occlusion number a fact about timing rather
 * than about layout. Bounded, and the outcome is returned so a toast that never
 * clears is recorded instead of hidden.
 */
export async function waitForToastsToClear(page: Page): Promise<boolean> {
  return page
    .waitForFunction(
      () => (document.querySelector('.toast-container')?.children.length ?? 0) === 0,
      undefined,
      { timeout: 12_000 },
    )
    .then(() => true)
    .catch(() => false);
}

/**
 * The heading-structure defects this run **found**, attributed rather than fixed.
 *
 * **GATE-13.3-08.** The student dashboard's measured heading sequence is:
 *
 * ```
 * h2 "Dashboard"                        <- precedes the h1
 * h1 "Welcome back, Harness"
 * h2 "Checking what is outstanding"
 * h2 "Your draft"
 * h2 "My applications"
 * h4 "Diploma in Registered Nursing"    <- skips h3
 * h2 "Intake deadlines"
 * h2 "Your details"
 * ```
 *
 * Two WCAG 1.3.1 / 2.4.6 problems, and only one of them is fully traced:
 *
 * * the `h4` is `src/components/student/ApplicationListItem.tsx:151`, confirmed in
 *   source — a level-4 heading rendered directly inside a level-2 section; and
 * * the `h2 "Dashboard"` that precedes the `h1` was **measured in the browser but
 *   not traced to its component**. Saying so is the honest form: it is in the
 *   published sequence above and in `raw/aria-snapshots-*.txt`, and no source claim
 *   is made about it.
 *
 * Worth recording alongside: `PageShell` already ships a heading-hierarchy
 * validator (`validateHeadingHierarchy`, `src/components/ui/PageShell.tsx:57`) that
 * checks for exactly these two conditions. It did not stop either one — it is
 * scoped to the shell's own subtree and it warns rather than fails. So the platform
 * knows the rule and has an instrument for it; what it lacks is one that runs
 * against the whole document in a browser, which is what this row is.
 *
 * Owner: the dashboard lane (task 11.1) for the `h4`, and the shell lane for the
 * pre-`h1` heading. Not repaired here.
 */
/**
 * **Empty — GATE-13.3-08 is fixed (task 13.6 remediation L6).**
 *
 * Both halves, and the untraced one turned out to be one line:
 *
 * * **the pre-`h1` heading.** 13.3 measured it on three surfaces and said honestly
 *   that it had *not* traced it to a component. It is `ui/MobilePageHeader.tsx`,
 *   which rendered the page title as an `h2` in a bar the shell mounts **before**
 *   `main` — so every authenticated surface opened `h2 -> h1`. One shell cause,
 *   three surfaces, exactly as 13.3 predicted by keying it to `/student/` rather
 *   than to a route. It is a `<p>` now: `PageShell` already renders the page's one
 *   accessible title as the `h1`, and this bar restates it for orientation, which
 *   is a label's job. The visible text is unchanged.
 * * **the `h2 -> h4` skip** is `student/ApplicationListItem.tsx`, now `h3`. The
 *   size came from `text-sm`/`sm:text-base`, never from the tag, so nothing moved.
 * * **the `h1 -> h3` skip** on the status error state was `ui/ErrorDisplay.tsx`'s
 *   hardcoded `h3`; it takes a `headingLevel` prop defaulting to `h2` now, so a
 *   page-level error follows the page's `h1` and a caller nesting it inside a
 *   `SectionCard` (itself an `h2`) can still pass `h3`.
 */
export const KNOWN_HEADING_ISSUES: { surface: RegExp; issue: RegExp; finding: string }[] = [];

export function attributedHeadingIssue(surface: string, issue: string) {
  return KNOWN_HEADING_ISSUES.find(
    (known) => known.surface.test(surface) && known.issue.test(issue),
  );
}

/**
 * The blocking axe violations this run **found**, attributed rather than fixed.
 *
 * **GATE-13.3-11 — the bottom navigation is unlabelled at the design width.**
 *
 * `src/components/ui/BottomNavigation.tsx:221` computes
 * `isNarrowViewport = viewportWidth < 360` and passes it as `iconOnly`, which drops
 * the visible label:
 *
 * ```tsx
 * {!iconOnly && (
 *   <span className="mt-1 max-w-full truncate text-[10px] font-semibold">{item.label}</span>
 * )}
 * ```
 *
 * Nothing replaces it. There is no `aria-label` on the `Link` in that path, and the
 * icon is decorative, so axe reports `link-name` (**serious**, WCAG 2.4.4 / 4.1.2)
 * on all four items — measured at **320 x 568 only**, because that is the one width
 * in R16.7's list below the 360 px threshold.
 *
 * The sharpest part of the finding is where it lands: R16.1 says the student
 * experience *"SHALL be designed at 320 CSS pixels first"*, and 320 px is precisely
 * the width at which the primary navigation stops telling a screen-reader user
 * where each item goes. Every wider viewport passes.
 *
 * Owner: the shell/navigation lane. Not repaired here.
 */
/**
 * **GATE-13.3-12 — colour contrast below WCAG AA on three surfaces.**
 *
 * `color-contrast` (serious, WCAG 1.4.3) at several widths, on elements that are all
 * raw-palette or low-alpha token usage rather than the approved token pairs:
 *
 * | surface | element | source |
 * |---|---|---|
 * | wizard, Education step | `.text-red-500` on the *"n/5 unique minimum"* counter | `applicationWizard/steps/EducationStep.tsx:293` |
 * | wizard, Education step | `.bg-primary/10 .text-primary` subject chips (x5) | `applicationWizard/steps/EducationStep.tsx:335` |
 * | wizard | `.p-3 > h4` | same step's panel |
 * | bottom navigation | the `text-[10px]` label in `text-primary` on the active item | `components/ui/BottomNavigation.tsx` |
 * | bottom navigation | the `text-[10px]` label on the *More* overflow button | same |
 *
 * Two of these are also `DESIGN.md` violations independently of contrast:
 * `text-red-500` is a **raw Tailwind palette step** on a status message, where the
 * guardrail is an approved token *and* a non-colour cue; and a `10px` label is below
 * the type scale's floor.
 *
 * Worth noting for the report: `tests/unit/productDesignDeFluff.test.tsx` already
 * carries six contrast guards, and they are all green. They check specific
 * token pairs in jsdom; none of them computes a rendered contrast ratio, which is
 * why a browser sweep was needed to find these.
 *
 * Owners: the wizard lane (Education step) and the shell/navigation lane (bottom
 * navigation). Not repaired here.
 */
/**
 * **Empty — GATE-13.3-11 and GATE-13.3-12 are fixed (task 13.6 remediation L6).**
 *
 * * **GATE-13.3-11** — `BottomNavigation` now carries `aria-label` on every item
 *   *unconditionally*, not only when `iconOnly` drops the visible span, because a
 *   name that matches the visible text is correct at every width and a conditional
 *   one is a second code path that can regress on its own. The icon and the label
 *   span are `aria-hidden`, so the accessible name is exactly one string. The badge
 *   count is folded into that name instead of carrying its own `aria-label` on a
 *   decorative `span`.
 * * **GATE-13.3-12** — all nine rows came from two token misuses, and both are
 *   replaced by a token pair the design system already had for a tinted surface,
 *   `accent` / `accent-foreground` (#dbeafe / #1e40af = 7.2 : 1):
 *   `bg-primary/10 text-primary` (4.49 : 1 — the bottom-nav active label, the
 *   *More* label, and the five Education-step chips) and
 *   `text-primary-foreground` on `bg-primary/5` (white on near-white, ~1.1 : 1 —
 *   the recommended-subjects heading). The `text-red-500` / `text-green-600`
 *   counter on the same step became `text-destructive` / `text-success` **with an
 *   icon**, since a status must never be colour alone. The two `text-[10px]`
 *   labels became `text-xs`, the type scale's own floor.
 *
 * No token was invented: every value above is already in
 * `src/styles/design-tokens.css`.
 */
export const KNOWN_AXE_BLOCKING: {
  viewport: RegExp;
  surface: RegExp;
  ruleId: string;
  finding: string;
}[] = [];

export function attributedAxeViolation(viewport: string, surface: string, ruleId: string) {
  return KNOWN_AXE_BLOCKING.find(
    (known) =>
      known.viewport.test(viewport) && known.surface.test(surface) && known.ruleId === ruleId,
  );
}
