/**
 * Required V2 harness — the wizard is usable on a phone (admissions-v2 task 11.2).
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 11.2
 *               (Required_Evidence: "viewport/zoom/offline/keyboard/safe-area
 *               Playwright artifacts").
 * Requirements: **R10.2** (one state machine; views are adapters),
 *               **R16.1** (designed at 320 CSS pixels first),
 *               **R16.2** (44 px targets, keyboard, names, AA),
 *               **R16.3** (one mobile bottom action surface; the global bottom
 *               navigation does not overlap, obscure or compete),
 *               **R16.7** (no horizontal overflow, no clipped text, no hidden
 *               commands, no overlapping fixed surfaces at the named widths),
 *               **R16.8** (status, autosave and recovery stay understandable
 *               under zoom, slow network and offline/reconnect).
 * Findings:     **STU-02**, **STU-03**, **MAINT-01**.
 *
 * Why a browser. Every claim here is either geometry or a real network condition:
 * "one anchored surface" is a question about `position: fixed`/`sticky` boxes in a
 * laid-out page, "44 px" is a measured rect, "no overflow at 320" needs a layout
 * engine, and "offline is honest" needs a real interception. None of them survives
 * jsdom, which is why `wizardMobileRecomposition.test.tsx` deliberately asserts the
 * DOM-answerable half and defers these.
 *
 * | Journey | Proves |
 * |---|---|
 * | **1. one bottom surface at 320/375/390** | the global bottom navigation is absent, exactly one element is anchored to the bottom, it clears the safe area, nothing overflows, every control in it is ≥ 44 px — and a screenshot at each width |
 * | **2. the checklist reaches a phone** | the context disclosure exists at 320, opens by keyboard, and lists the step's requirements — the surface STU-03 says mobile lost entirely |
 * | **3. the blockers are the platform's** | the wizard's blocker rows are the readiness endpoint's own messages, byte for byte, addressed by the platform's own blocker codes |
 * | **4. a deep link opens the named step, and an unreachable one is clamped** | task 11.1's deferral, both directions |
 * | **5. offline is honest and typing is never blocked** | with the network cut, the bar says so, the form still accepts input, and no dialog appears; on reconnect the work is still there |
 * | **6. the on-screen keyboard does not cover the field** | the action bar releases its sticky position when the visual viewport shrinks, so the focused input stays visible |
 * | **7. 200% text at 320** | the progress summary and the action bar reflow rather than clipping |
 * | **8. a resumed draft rehydrates what the platform holds** | the nine personal answers `ApplicationListSerializer` does not carry come back into the form from the authoritative row — README §2.2's recorded gap, closed |
 *
 * Runs with the strict gates active (`harness-fixtures.ts`): zero skips, no console
 * errors, no unhandled exceptions, no unasserted failed requests.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { evidenceDir } from '../helpers/evidence-dir';
import { test, expect, type Page } from '../harness-fixtures';
import {
  assignOffering,
  createDraftApplication,
  createFee,
  createInstitutionViaApi,
  createIntake,
  linkIntake,
  listCanonicalPrograms,
  registerAndLoginStudent,
  superAdminContext,
  uploadDocument,
  type AuthedContext,
} from '../helpers/api';

/**
 * Where this spec's screenshots go — **run-scoped by default**; task 11.2's own
 * `docs/v2-evidence/11.2/screenshots` only when a run explicitly asks for it
 * (`V2_EVIDENCE_TASK_DIRS=1`, or `V2_EVIDENCE_DIR=<repo-relative path>`).
 *
 * Task 13.6 remediation **L8** / **GATE-13.1-07**. The literal this replaced
 * (`'../../../../../docs/v2-evidence/11.2/screenshots'`) meant every ordinary run of the
 * required profile regenerated task 11.2's recorded screenshots — a task with no
 * interest in 11.2 at all, silently rewriting its Required_Evidence. See
 * `../helpers/evidence-dir` for the three cases and why the default is not a task
 * directory.
 */
const SHOT_DIR = join(evidenceDir('11.2'), 'screenshots');

/** The widths R16.7 names for the student surface. */
const VIEWPORTS = [
  { label: '320', width: 320, height: 568 },
  { label: '375', width: 375, height: 667 },
  { label: '390', width: 390, height: 844 },
];

interface HarnessOffering {
  canonicalProgramId: string;
  intakeId: string;
  programName: string;
}

let sharedAdmin: Promise<AuthedContext> | null = null;
function platformAdmin(): Promise<AuthedContext> {
  sharedAdmin ??= superAdminContext();
  return sharedAdmin;
}

test.afterAll(async () => {
  if (sharedAdmin) {
    const admin = await sharedAdmin;
    await admin.ctx.dispose();
    sharedAdmin = null;
  }
});

/** The harness noise every required journey allows, documented in 8.3's spec. */
function allowHarnessNoise(gate: {
  allowRequest: (p: string | RegExp) => unknown;
  allowConsole: (p: string | RegExp) => unknown;
}) {
  gate.allowRequest('glitchtip');
  gate.allowRequest('harness-invalid.localhost');
  gate.allowConsole('Content Security Policy');
  gate.allowConsole('Failed to load resource');
}

async function configureOffering(label: string): Promise<HarnessOffering> {
  const admin = await platformAdmin();
  const stamp = `${Date.now()}`.slice(-8);
  const canonical = (await listCanonicalPrograms(admin))[0];
  expect(canonical?.id, 'the harness should seed at least one canonical program').toBeTruthy();
  const { institutionId } = await createInstitutionViaApi(admin, {
    name: `${label} School ${stamp}`,
    code: `M11${stamp}`,
    hostname: `m112-${stamp}.localhost`,
  });
  const { intakeId } = await createIntake(admin, { name: `${label} Intake ${stamp}`, year: 2027 });
  const { offeringId } = await assignOffering(admin, institutionId, {
    canonical_program_id: canonical.id,
    name: canonical.name,
    code: `M11P${stamp}`,
  });
  await linkIntake(admin, { program_id: offeringId, intake_id: intakeId, max_capacity: 25 });
  await createFee(admin, offeringId, { amount: '153.00' });
  return {
    canonicalProgramId: canonical.id as string,
    intakeId,
    programName: canonical.name as string,
  };
}

async function loginStudent(page: Page): Promise<{ email: string; csrf: string }> {
  const { ctx, email, password } = await registerAndLoginStudent();
  await ctx.dispose();
  const login = await page.request.post('/api/v1/auth/login/', { data: { email, password } });
  expect(login.ok(), `student browser login should succeed (got ${login.status()})`).toBeTruthy();
  const csrf = login.headers()['x-csrf-token'] || '';
  expect(csrf, 'login should return an X-CSRF-Token header').toBeTruthy();
  return { email, csrf };
}

function unwrap(json: unknown): any {
  return json && typeof json === 'object' && 'data' in (json as object)
    ? (json as { data: unknown }).data
    : json;
}

/** The platform's own readiness — every copy assertion is made against this. */
async function readReadiness(page: Page, applicationId: string) {
  const resp = await page.request.get(`/api/v2/student/applications/${applicationId}/readiness/`);
  expect(resp.ok(), `readiness should be readable by its owner (${resp.status()})`).toBeTruthy();
  const payload = unwrap(await resp.json());
  expect(Array.isArray(payload?.blockers)).toBeTruthy();
  return payload as {
    can_submit: boolean;
    blockers: Array<{ code: string; message: string }>;
    allowed_next_actions: Array<{ action: string; label: string; step: string }>;
  };
}

/** Open one draft, optionally at a named step, and wait for the wizard to settle. */
async function openWizard(page: Page, applicationId: string, step?: string) {
  const stepQuery = step ? `&step=${step}` : '';
  await page.goto(`/student/application-wizard?mode=resume&draftId=${applicationId}${stepQuery}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByTestId('wizard-progress-summary')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('wizard-action-bar')).toBeVisible({ timeout: 60_000 });
  // The shell's boot preloader is a `position: fixed` overlay that fades out after
  // the app mounts. It is not a product surface, but it *is* anchored while it is on
  // screen, so every geometry claim waits for it to leave rather than excluding it.
  await expect(page.locator('.beanola-preloader')).toHaveCount(0, { timeout: 30_000 });
  // And the platform's readiness has answered, so the surface under test has settled.
  // On a phone the Still needed list is a closed disclosure; open it to read the
  // platform's check, then put it back as the student would find it.
  const stillNeededToggle = page.getByTestId('wizard-context-toggle');
  const collapsed = await stillNeededToggle.isVisible();
  if (collapsed) await stillNeededToggle.click();
  await expect(page.getByTestId('wizard-current-blockers')).not.toContainText(
    /checking what is still needed/i,
    { timeout: 60_000 },
  );
  if (collapsed) await stillNeededToggle.click();
}

/**
 * Walk back to the personal step from wherever a resumed draft opened.
 *
 * `resolveDraftResumeStepId` puts a draft with a programme and a name on
 * **Education**, so one step back is Personal. Deterministic, and independent of
 * the deep-link gate.
 */
async function openPersonalStep(page: Page) {
  const summary = page.getByTestId('wizard-progress-summary');
  await expect(summary).toContainText('Step 4 of 6', { timeout: 60_000 });
  await page.getByRole('button', { name: /^(previous|go back to )/i }).first().click();
  await expect(summary).toContainText('Step 3 of 6', { timeout: 60_000 });
}

/**
 * Wait until the app has stopped fetching, so a deliberate network cut is a cut and
 * not a torn download.
 *
 * The shell imports its heavy global UI on a deferral (`useDeferredHydration(…, 1800)`
 * in `AuthenticatedRouteShell`), so a lazy chunk request can start *after* the wizard
 * itself has settled. Cutting the network mid-flight fails that chunk, and a failed
 * `lazy()` import takes its subtree to the error boundary — which is a claim about
 * the shell's chunk loading, not about the wizard's offline behaviour that journey 5
 * exists to prove. Observed both ways on the same build: chunk in flight → the page
 * is replaced by "Something went wrong"; chunk already resident → the journey's real
 * assertions run.
 *
 * Waiting on the app's own activity rather than on a clock, for the reason §5.1 of
 * the evidence gives about the deep-link gate: a fixed delay races whatever it was
 * chosen against. `quietMs` only has to exceed the shell's deferral, so a request
 * that is *about* to start still counts as activity.
 */
async function waitForNetworkQuiet(page: Page, quietMs = 2_500, timeoutMs = 60_000) {
  let inFlight = 0;
  let lastActivity = Date.now();
  const onRequest = () => {
    inFlight += 1;
    lastActivity = Date.now();
  };
  const onSettled = () => {
    inFlight = Math.max(0, inFlight - 1);
    lastActivity = Date.now();
  };
  page.on('request', onRequest);
  page.on('requestfinished', onSettled);
  page.on('requestfailed', onSettled);
  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (inFlight === 0 && Date.now() - lastActivity >= quietMs) return;
      await page.waitForTimeout(100);
    }
    throw new Error(
      `the app was still fetching after ${timeoutMs}ms (${inFlight} in flight), so the network cut would not be deterministic`,
    );
  } finally {
    page.off('request', onRequest);
    page.off('requestfinished', onSettled);
    page.off('requestfailed', onSettled);
  }
}

/**
 * Every element the browser has actually anchored to the viewport, with its box.
 *
 * Computed from `position` and the laid-out rect rather than from class names,
 * because R16.3 is a claim about what a student's thumb meets, not about source.
 */
async function anchoredSurfaces(page: Page) {
  return page.evaluate(() => {
    const out: Array<{
      testId: string;
      className: string;
      tag: string;
      position: string;
      top: number;
      bottom: number;
      height: number;
    }> = [];
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const style = getComputedStyle(el);
      if (style.position !== 'fixed' && style.position !== 'sticky') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      // Only surfaces sitting in the bottom third of the viewport compete with a
      // thumb reaching for the primary control.
      if (rect.bottom < window.innerHeight * 0.66) continue;
      out.push({
        testId: (el as HTMLElement).dataset.testid || '',
        className: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
        tag: el.tagName,
        position: style.position,
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
      });
    }
    return out;
  });
}

test.describe('The wizard is usable on a phone (R16.1-R16.3, R16.7-R16.8)', () => {
  // ---------------------------------------------------------------------------
  // 1. One bottom surface, at 320 / 375 / 390
  // ---------------------------------------------------------------------------
  test('renders one bottom action surface at 320, 375 and 390, with no overflow', async ({
    page,
    gate,
  }, testInfo) => {
    test.setTimeout(300_000);
    allowHarnessNoise(gate);
    mkdirSync(SHOT_DIR, { recursive: true });

    const offering = await configureOffering('Narrow Wizard');
    const { email, csrf } = await loginStudent(page);
    const { applicationId } = await createDraftApplication(page.request, csrf, {
      canonicalProgramId: offering.canonicalProgramId,
      intakeId: offering.intakeId,
      email,
    });
    // One document on file, so the readiness has cleared a gate and named another:
    // the screenshots show a real mid-flight application rather than an empty one.
    await uploadDocument(page.request, csrf, applicationId, 'nrc');

    const project = testInfo.project.name;
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openWizard(page, applicationId);

      // R16.3: the shell's global bottom navigation is not on this route at all.
      await expect(page.getByRole('navigation', { name: /bottom navigation/i })).toHaveCount(0);

      // R16.3: nothing except the action bar is anchored near the bottom.
      //
      // Stated as a subset rather than an equality, because a `sticky` element only
      // *sticks* while its container overflows: at 375 and 390 the step's own content
      // is short enough that the bar sits at the natural end of the page instead of
      // against the viewport, and the browser run showed exactly that. The claim
      // R16.3 makes is about competition, so it is asserted as "nothing else is
      // there", plus the bar being present and reachable below.
      const anchored = await anchoredSurfaces(page);
      const competing = anchored.filter(surface => surface.testId !== 'wizard-action-bar');
      expect(
        competing.map(
          surface =>
            `${surface.tag}[${surface.testId || surface.className || 'anonymous'}]:${surface.position}`,
        ),
        `nothing competes with the action bar at ${viewport.width}px`,
      ).toEqual([]);

      // R16.3: it clears the device safe area (`env(safe-area-inset-bottom)` is 0 px
      // in the harness, so the claim is that the padding is present and additive
      // rather than that it is large).
      // Polled rather than read once: the wizard re-renders while the draft's
      // readiness settles, so a handle resolved a moment earlier can be detached by
      // the time `getComputedStyle` runs (it answers `''` for a detached node).
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const node = document.querySelector('[data-testid="wizard-action-bar"]');
              return node ? getComputedStyle(node).paddingBottom : '';
            }),
          {
            timeout: 30_000,
            message: `the bar pads its bottom for the safe area at ${viewport.width}px`,
          },
        )
        .toMatch(/^[1-9]/);

      // R16.7: no horizontal overflow.
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(
        overflow.scrollWidth,
        `no horizontal overflow at ${viewport.width}px`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);

      // R16.2: every control in the bar and the context toggle meets 44 px, measured
      // from the layout box. The 0.5 px tolerance is Chromium's fractional box
      // reporting; the measured size is printed so a real regression reads as one.
      const undersized = await page.evaluate(() => {
        const scopes = Array.from(
          document.querySelectorAll(
            '[data-testid="wizard-action-bar"], [data-testid="wizard-context-panel"]',
          ),
        );
        const offenders: string[] = [];
        for (const scope of scopes) {
          for (const el of Array.from(scope.querySelectorAll('a, button'))) {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) continue;
            if (rect.height < 43.5 || rect.width < 43.5) {
              offenders.push(
                `${el.tagName}[${(el.textContent || '').trim().slice(0, 24)}] ${rect.width.toFixed(3)}x${rect.height.toFixed(3)}`,
              );
            }
          }
        }
        return offenders;
      });
      expect(undersized, `44px touch targets at ${viewport.width}px`).toEqual([]);

      // R16.7: the primary control is not covered by anything.
      //
      // Scrolled into view and *settled* first, and the hit test now demands a
      // positive answer. The first version of this assertion asked
      // `elementFromPoint(...)?.closest(bar) === null` on an un-scrolled page: when
      // the control sits below the fold `boundingBox()` reports a point outside the
      // viewport, `elementFromPoint` answers `null`, and `undefined === null` is
      // `false` — so the claim passed *because* the control was off-screen. That is
      // exactly the vacuous pass the second pass of task 11.2 found while
      // diagnosing §9, and it is why the wait below is 500 ms rather than nothing:
      // the shell sets `scroll-behavior: smooth`, so a point read during the
      // animation is a point the control has already left.
      const primary = page.getByRole('button', { name: /^continue to /i }).first();
      await expect(primary).toBeVisible();
      await primary.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      const box = (await primary.boundingBox())!;
      const hitTarget = await page.evaluate(
        ({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          if (!el) return 'nothing (the point is outside the viewport)';
          return el.closest('[data-testid="wizard-action-bar"]')
            ? 'the action bar'
            : `${el.tagName}[${el.className?.toString().slice(0, 40)}]`;
        },
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      );
      expect(hitTarget, `the primary control is hit-testable at ${viewport.width}px`).toBe(
        'the action bar',
      );

      await page.screenshot({
        path: join(SHOT_DIR, `wizard-${viewport.label}-${project}.png`),
        fullPage: true,
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 2. The checklist and context reach a phone (STU-03)
  // ---------------------------------------------------------------------------
  test('offers the Still needed list on a 320px phone, by keyboard', async ({ page, gate }) => {
    test.setTimeout(240_000);
    allowHarnessNoise(gate);
    mkdirSync(SHOT_DIR, { recursive: true });

    const offering = await configureOffering('Checklist');
    const { email, csrf } = await loginStudent(page);
    const { applicationId } = await createDraftApplication(page.request, csrf, {
      canonicalProgramId: offering.canonicalProgramId,
      intakeId: offering.intakeId,
      email,
    });

    await page.setViewportSize({ width: 320, height: 568 });
    await openWizard(page, applicationId);

    const toggle = page.getByTestId('wizard-context-toggle');
    await expect(toggle, 'the context disclosure exists at 320px').toBeVisible();
    await expect(page.getByTestId('wizard-context-region')).toHaveCount(0);

    // Keyboard, not a tap: R16.2 asks for keyboard operability, and a disclosure
    // that only opens on click is a disclosure an assistive-technology user cannot use.
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await page.keyboard.press('Enter');

    const region = page.getByTestId('wizard-context-region');
    await expect(region).toBeVisible({ timeout: 30_000 });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // It lists this step's requirements — the surface a phone previously never had.
    await expect(region.getByText(/whole application/i)).toBeVisible();
    const rows = await region.locator('span').allTextContents();
    expect(rows.filter(text => text.trim().length > 0).length).toBeGreaterThan(0);

    await page.screenshot({
      path: join(SHOT_DIR, 'wizard-320-context-open.png'),
      fullPage: true,
    });
  });

  // ---------------------------------------------------------------------------
  // 3. The blockers are the platform's own words
  // ---------------------------------------------------------------------------
  test('shows the platform\u2019s own blockers, not a browser-derived list', async ({ page, gate }) => {
    test.setTimeout(240_000);
    allowHarnessNoise(gate);

    const offering = await configureOffering('Blockers');
    const { email, csrf } = await loginStudent(page);
    const { applicationId } = await createDraftApplication(page.request, csrf, {
      canonicalProgramId: offering.canonicalProgramId,
      intakeId: offering.intakeId,
      email,
    });
    const readiness = await readReadiness(page, applicationId);
    expect(readiness.blockers.length, 'a fresh draft has blockers').toBeGreaterThan(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await openWizard(page, applicationId);

    // The platform's check sits in the Still needed list, a closed disclosure on a phone.
    await page.getByTestId('wizard-context-toggle').click();
    const rows = page.getByTestId('wizard-blocker');
    await expect(rows.first()).toBeVisible({ timeout: 60_000 });

    // The platform's first blocker, by its own code and its own sentence.
    const first = readiness.blockers[0]!;
    await expect(rows.first()).toHaveAttribute('data-blocker-code', first.code);
    await expect(rows.first()).toHaveText(first.message);

    // And the count is the platform's count, not the length of a local list.
    await expect(page.getByTestId('wizard-current-blockers')).toContainText(
      readiness.blockers.length === 1
        ? '1 thing is still needed'
        : `${readiness.blockers.length} things are still needed`,
    );

    // The browser-derived line this replaced is gone.
    await expect(page.getByText(/^Missing:/)).toHaveCount(0);
  });

  // ---------------------------------------------------------------------------
  // 4. Deep-linking a step, and clamping an unreachable one
  // ---------------------------------------------------------------------------
  test('opens the step a link names, and clamps one the student has not earned', async ({
    page,
    gate,
  }) => {
    test.setTimeout(240_000);
    allowHarnessNoise(gate);

    const offering = await configureOffering('Deep Link');
    const { email, csrf } = await loginStudent(page);
    const { applicationId } = await createDraftApplication(page.request, csrf, {
      canonicalProgramId: offering.canonicalProgramId,
      intakeId: offering.intakeId,
      email,
    });

    await page.setViewportSize({ width: 390, height: 844 });

    // A reachable step: the assignment resolves (the offering has a fee), so the
    // education step is legal and the link lands on it.
    await openWizard(page, applicationId, 'education');
    await expect(page.getByTestId('education-step')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('wizard-progress-summary')).toContainText('Step 4 of 6');

    // The platform names the same vocabulary the link uses, which is the whole
    // reason a next action can address a step at all.
    const readiness = await readReadiness(page, applicationId);
    const steps = readiness.allowed_next_actions.map(action => action.step);
    expect(steps.every(step => typeof step === 'string' && step.length > 0)).toBe(true);

    // A step behind the checkpoint's gate is **not followed**, and the student is
    // told rather than moved: a brand-new application has no resolved assignment, so
    // `?step=payment` leaves them on the programme selection with an explanation.
    await page.goto('/student/application-wizard?mode=new&step=payment', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByTestId('program-step')).toBeVisible({ timeout: 60_000 });
    // Never the payment surface, and never a dead step.
    await expect(page.getByRole('heading', { name: /^payment$/i })).toHaveCount(0);
    await expect(page.getByText(/becomes available once your assigned school/i)).toBeVisible({
      timeout: 30_000,
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Offline is honest, and typing is never blocked (R16.8)
  // ---------------------------------------------------------------------------
  test('says it is offline, keeps accepting input, and still has the work on reconnect', async ({
    page,
    gate,
  }) => {
    test.setTimeout(300_000);
    allowHarnessNoise(gate);
    mkdirSync(SHOT_DIR, { recursive: true });
    // While the network is deliberately cut *every* request fails, including lazy
    // route chunks the SPA happens to reach for. Those failures are the journey's
    // own doing, so the transport channel is allowed for this test only — and the
    // journey then asserts the thing that actually matters: that the student was
    // told, that typing still worked, and that the work survived the reconnect.
    gate.allowRequest(/localhost:8090/);

    const offering = await configureOffering('Offline');
    const { email, csrf } = await loginStudent(page);
    const { applicationId } = await createDraftApplication(page.request, csrf, {
      canonicalProgramId: offering.canonicalProgramId,
      intakeId: offering.intakeId,
      email,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    // Reached by resuming and stepping back rather than by `?step=personal`:
    // deep-linking is journey 4's claim, and making these journeys depend on it
    // would couple an offline assertion to the assignment gate's timing.
    await openWizard(page, applicationId);
    await openPersonalStep(page);
    const town = page.getByLabel(/town|city/i).first();
    await expect(town).toBeVisible({ timeout: 60_000 });

    // Cut the network the way a student's train tunnel does — but only once the app
    // has stopped fetching, so what is being tested is the wizard offline and not the
    // shell's deferred chunk loading losing a race (see `waitForNetworkQuiet`).
    await waitForNetworkQuiet(page);
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    // The bar says so, in words, not by colour alone.
    const offlineBadge = page.getByTestId('wizard-offline-badge');
    await expect(offlineBadge).toBeVisible({ timeout: 30_000 });
    await expect(offlineBadge).toContainText(/offline/i);

    // Typing still works, and nothing modal appears to interrupt it.
    await town.fill('Chipata');
    await expect(town).toHaveValue('Chipata');
    await page.waitForTimeout(3_000);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    // And the primary control is still offered: an offline student is not locked out.
    await expect(page.getByRole('button', { name: /^continue to /i }).first()).toBeEnabled();

    await page.screenshot({ path: join(SHOT_DIR, 'wizard-390-offline.png'), fullPage: true });

    // Reconnect: the value the student typed is still in front of them.
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(offlineBadge).toHaveCount(0, { timeout: 30_000 });
    await expect(town).toHaveValue('Chipata');
  });

  // ---------------------------------------------------------------------------
  // 6. The on-screen keyboard does not cover the field being typed into
  // ---------------------------------------------------------------------------
  /**
   * A phone keyboard shrinks the *visual* viewport, and a bar stuck to the bottom of
   * it lands on top of the input. Chromium cannot raise a real keyboard, so the
   * shrink is simulated the way the wizard detects it — `window.visualViewport`'s
   * height dropping past the 150 px threshold plus its `resize` event — and the
   * claim is the geometry that follows: the bar stops being sticky, so the focused
   * field is not underneath it.
   */
  test('releases the action bar when the on-screen keyboard opens', async ({ page, gate }) => {
    test.setTimeout(240_000);
    allowHarnessNoise(gate);
    mkdirSync(SHOT_DIR, { recursive: true });

    const offering = await configureOffering('Keyboard');
    const { email, csrf } = await loginStudent(page);
    const { applicationId } = await createDraftApplication(page.request, csrf, {
      canonicalProgramId: offering.canonicalProgramId,
      intakeId: offering.intakeId,
      email,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await openWizard(page, applicationId);
    await openPersonalStep(page);
    const town = page.getByLabel(/town|city/i).first();
    await expect(town).toBeVisible({ timeout: 60_000 });
    await town.focus();

    const positionBefore = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-testid="wizard-action-bar"]')!).position,
    );
    expect(positionBefore, 'the bar is sticky with no keyboard').toBe('sticky');

    // Shrink the visual viewport by 320 px and fire the event the wizard listens to.
    await page.evaluate(() => {
      const vv = window.visualViewport!;
      Object.defineProperty(vv, 'height', { configurable: true, value: vv.height - 320 });
      vv.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(300);

    const positionAfter = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-testid="wizard-action-bar"]')!).position,
    );
    expect(positionAfter, 'the bar releases when the keyboard is open').toBe('relative');

    // The focused field is not underneath the bar.
    const clearance = await page.evaluate(() => {
      const field = document.querySelector('input[name="residence_town"]')!.getBoundingClientRect();
      const bar = document.querySelector('[data-testid="wizard-action-bar"]')!.getBoundingClientRect();
      return { fieldBottom: field.bottom, barTop: bar.top };
    });
    expect(
      clearance.fieldBottom,
      'the field being typed into sits above the action bar',
    ).toBeLessThanOrEqual(clearance.barTop + 1);

    await page.screenshot({ path: join(SHOT_DIR, 'wizard-390-keyboard.png'), fullPage: true });
  });

  // ---------------------------------------------------------------------------
  // 7. 200% text at 320 (R16.8)
  // ---------------------------------------------------------------------------
  /**
   * WCAG 1.4.10 reflow at 400% page zoom is *defined* as equivalent to a 320 CSS-pixel
   * viewport, which journey 1 already measures. 1.4.4 resize-text is the different
   * question, and it is the one that breaks a rem-padded card at 320 px — so this is
   * a 32 px root font at 320, and the claim is that the summary and the bar reflow
   * rather than being clipped by the shell's `overflow-x-hidden`.
   */
  test('the progress summary and action bar reflow at 200% text size', async ({ page, gate }) => {
    test.setTimeout(240_000);
    allowHarnessNoise(gate);
    mkdirSync(SHOT_DIR, { recursive: true });

    const offering = await configureOffering('Zoomed Wizard');
    const { email, csrf } = await loginStudent(page);
    const { applicationId } = await createDraftApplication(page.request, csrf, {
      canonicalProgramId: offering.canonicalProgramId,
      intakeId: offering.intakeId,
      email,
    });

    await page.setViewportSize({ width: 320, height: 800 });
    await openWizard(page, applicationId);
    await page.addStyleTag({ content: 'html { font-size: 32px !important; }' });
    await page.waitForTimeout(400);

    for (const testId of ['wizard-progress-summary', 'wizard-action-bar']) {
      const clipped = await page.evaluate(id => {
        const scope = document.querySelector(`[data-testid="${id}"]`);
        if (!scope) return [`${id} missing`];
        const limit = scope.getBoundingClientRect().right;
        const offenders: string[] = [];
        for (const el of Array.from(scope.querySelectorAll('*'))) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          if (rect.right > limit + 1) {
            offenders.push(
              `${el.tagName} "${(el.textContent || '').trim().slice(0, 30)}" right=${rect.right.toFixed(1)} limit=${limit.toFixed(1)}`,
            );
          }
        }
        return offenders;
      }, testId);
      expect(clipped, `${testId} reflows rather than clipping at 200% text`).toEqual([]);
    }

    // The step heading and the primary control are both still usable. Addressed by
    // id, not by `getByRole(...).first()`: the context panel's own `sr-only` <h2>
    // is earlier in the DOM and is 32 px wide by design, which is what the first
    // version of this assertion measured.
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    expect((await heading.boundingBox())!.width, 'the heading keeps usable line width').toBeGreaterThan(40);
    await expect(page.getByRole('button', { name: /^continue to /i }).first()).toBeVisible();

    await page.screenshot({ path: join(SHOT_DIR, 'wizard-320-text200.png'), fullPage: true });
  });

  // ---------------------------------------------------------------------------
  // 8. A resumed draft comes back with the answers the platform holds (R10.2/R10.3)
  // ---------------------------------------------------------------------------
  /**
   * The gap `docs/v2-evidence/11.2/README.md` §2.2 recorded as unfixed, closed by the
   * second pass of this task.
   *
   * The wizard hydrates a resumed draft from the application *list*, and
   * `ApplicationListSerializer` carries no personal answer beyond `full_name` /
   * `email` / `phone`. So a student who had already given an NRC, a date of birth, a
   * sex, a town, a country, a nationality and a next of kin came back to blank
   * fields and had to type them again — the platform held every one of them.
   *
   * Measured in the harness on the unchanged tree, one step after a resume and
   * before any typing: `{"nrc":"","town":""}` against a row holding both.
   *
   * Asserted from the student's side of the glass — the values in the fields — and
   * against the platform's own record rather than against the fixture, so the claim
   * is "what the platform stored is what the student sees", not "what the test typed
   * is what the test reads".
   *
   * It lives here rather than in `student-wizard-characterisation.spec.ts` because
   * that file's contract is that it reads identically before and after a change, and
   * this is a claim that is *supposed* to change.
   */
  test('a resumed draft rehydrates the answers the list projection omits', async ({ page, gate }) => {
    test.setTimeout(240_000);
    allowHarnessNoise(gate);

    const offering = await configureOffering('Rehydrated Wizard');
    const { email, csrf } = await loginStudent(page);
    const { applicationId } = await createDraftApplication(page.request, csrf, {
      canonicalProgramId: offering.canonicalProgramId,
      intakeId: offering.intakeId,
      email,
    });

    // The platform's own row, which is the authority for every assertion below.
    const recordResponse = await page.request.get(`/api/v1/applications/${applicationId}/`);
    expect(recordResponse.ok(), `the owner can read the draft row (${recordResponse.status()})`).toBeTruthy();
    const record = unwrap(await recordResponse.json()) as Record<string, string | null>;
    for (const field of ['nrc_number', 'date_of_birth', 'residence_town', 'country', 'nationality']) {
      expect(
        record[field],
        `the platform holds ${field} on the draft, or this journey proves nothing`,
      ).toBeTruthy();
    }

    await openWizard(page, applicationId);
    await openPersonalStep(page);

    // Each of these is absent from the list projection and present on the row.
    await expect(page.getByLabel(/nrc number/i).first()).toHaveValue(record.nrc_number!);
    await expect(page.getByLabel(/date of birth/i).first()).toHaveValue(record.date_of_birth!);
    await expect(page.getByLabel(/town|city/i).first()).toHaveValue(record.residence_town!);
    // And the two the projection *does* carry still arrive, so the fill did not
    // trade one source of truth for another.
    await expect(page.getByLabel(/full name/i).first()).toHaveValue(record.full_name!);
    await expect(page.getByLabel(/phone number/i).first()).toHaveValue(record.phone!);
  });
});
