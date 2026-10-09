/**
 * Required V2 harness — the student dashboard is composed around the next action.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 11.1
 *               (Required_Evidence: "320/375/390 screenshots and task-first
 *               usability assertions").
 * Requirements: **R13.1** — "THE dashboard SHALL order each student's next
 *               required action before passive metrics and SHALL derive it from
 *               backend allowed-next-action data";
 *               **R16.1** (designed at 320 CSS pixels first),
 *               **R16.4** (restrained hierarchy, no nested cards),
 *               **R16.5** (no redundant metrics, no duplicate quick actions, no
 *               destructive shortcuts on a primary workflow),
 *               **R16.6** (dialogs are product components, never
 *               `window.confirm`),
 *               **R16.7** (no horizontal overflow at 320/375/390),
 *               **R16.8** (the next action stays understandable at 400% zoom).
 * Findings:     **STU-04**, **STU-12**, **MAINT-02**.
 *
 * Why a browser is required and not only unit tests. R13.1 is two claims that a
 * unit test cannot make together: that the action is the *platform's* and that it
 * is *first*. The first needs a real readiness evaluation against a real
 * application — the dashboard now reads task 6.5's
 * `GET /api/v2/student/applications/{id}/readiness/`, which resolves the
 * assignment, counts canonical grades, versions the document requirements, and
 * checks capacity — and the second is a fact about layout geometry at the widths
 * students actually use. Neither survives a mocked payload.
 *
 * The journeys:
 *
 * | Journey | Proves |
 * |---|---|
 * | **1. the blocker is the platform's, and it is first** | the readiness endpoint's own first blocker and first action are what the dashboard shows, its heading is above every other section's top edge, and the copy matches the payload byte-for-byte |
 * | **2. the action moves when the platform's answer moves** | clearing one blocker changes the dashboard's action to the next one the platform published — proof it is read, not derived |
 * | **3. nothing decorative survives** | no metric tile, no duplicate payment affordance, no invented timeline, and no clear-all on the page |
 * | **4. draft cleanup is scoped and dialog-confirmed** | deleting one of two drafts leaves the other, through a real dialog, with no `window.confirm` |
 * | **5. 320 / 375 / 390** | no horizontal overflow, the action is in the first viewport, every control meets 44 px, and a screenshot is captured at each width |
 * | **6. 400% zoom** | the next action and its blocker are still readable and reachable (R16.8) |
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
  persistMinimumGrades,
  registerAndLoginStudent,
  superAdminContext,
  uploadDocument,
  type AuthedContext,
} from '../helpers/api';

const DASHBOARD_URL = '/student/dashboard';
/**
 * Where this spec's screenshots go — **run-scoped by default**; task 11.1's own
 * `docs/v2-evidence/11.1/screenshots` only when a run explicitly asks for it
 * (`V2_EVIDENCE_TASK_DIRS=1`, or `V2_EVIDENCE_DIR=<repo-relative path>`).
 *
 * Task 13.6 remediation **L8** / **GATE-13.1-07**. The literal this replaced
 * (`'../../../../../docs/v2-evidence/11.1/screenshots'`) meant every ordinary run of the
 * required profile regenerated task 11.1's recorded screenshots — a task with no
 * interest in 11.1 at all, silently rewriting its Required_Evidence. See
 * `../helpers/evidence-dir` for the three cases and why the default is not a task
 * directory.
 */
const SHOT_DIR = join(evidenceDir('11.1'), 'screenshots');

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

/**
 * The same harness noise the other required journeys allow, for the same reasons
 * (documented in full in `payment-ownership-split.spec.ts`): the error reporter's
 * DSN host is unreachable in the harness, the neutral-context probe deliberately
 * requests an unknown tenant host, and Chromium echoes a blocked resource fetch as
 * a bare console line with no URL. The *request* channel is untouched, so a real
 * 4xx/5xx cannot hide behind the console allowance.
 */
function allowHarnessNoise(gate: {
  allowRequest: (p: string | RegExp) => unknown;
  allowConsole: (p: string | RegExp) => unknown;
}) {
  gate.allowRequest('glitchtip');
  gate.allowRequest('harness-invalid.localhost');
  gate.allowConsole('Content Security Policy');
  gate.allowConsole('Failed to load resource');
}

/**
 * A tenant offering one canonical program on its own brand-new intake, with a fee.
 *
 * A dedicated intake makes assignment resolution deterministic — exactly one
 * offering is linked to it — so the canonical create resolves without assuming a
 * seeded id (R4.7). The fee has to exist because task 8.1's quote fails closed
 * rather than inventing one, and a missing fee would surface as
 * `FEE_NOT_CONFIGURED` — a blocker about the school's setup rather than the
 * student's work.
 */
async function configureOffering(label: string): Promise<HarnessOffering> {
  const admin = await platformAdmin();
  const stamp = `${Date.now()}`.slice(-8);
  const canonical = (await listCanonicalPrograms(admin))[0];
  expect(canonical?.id, 'the harness should seed at least one canonical program').toBeTruthy();

  const { institutionId } = await createInstitutionViaApi(admin, {
    name: `${label} School ${stamp}`,
    code: `T11${stamp}`,
    hostname: `t111-${stamp}.localhost`,
  });
  const { intakeId } = await createIntake(admin, { name: `${label} Intake ${stamp}`, year: 2027 });
  const { offeringId } = await assignOffering(admin, institutionId, {
    canonical_program_id: canonical.id,
    name: canonical.name,
    code: `T11P${stamp}`,
  });
  await linkIntake(admin, { program_id: offeringId, intake_id: intakeId, max_capacity: 25 });
  await createFee(admin, offeringId, { amount: '153.00' });

  return {
    canonicalProgramId: canonical.id as string,
    intakeId,
    programName: canonical.name as string,
  };
}

/** Register this journey's student and log the browser context in as them. */
async function loginStudent(page: Page): Promise<{ email: string; csrf: string }> {
  const { ctx, email, password } = await registerAndLoginStudent();
  await ctx.dispose();
  const login = await page.request.post('/api/v1/auth/login/', { data: { email, password } });
  expect(
    login.ok(),
    `student browser login should succeed (got ${login.status()}: ${await login.text()})`,
  ).toBeTruthy();
  const csrf = login.headers()['x-csrf-token'] || '';
  expect(csrf, 'login should return an X-CSRF-Token header').toBeTruthy();
  return { email, csrf };
}

function unwrap(json: unknown): any {
  return json && typeof json === 'object' && 'data' in (json as object)
    ? (json as { data: unknown }).data
    : json;
}

/**
 * The platform's own readiness for this application — the exact payload the
 * dashboard reads. Every assertion about the dashboard's copy is made against
 * this, never against a string this file chose.
 */
async function readReadiness(page: Page, applicationId: string) {
  const resp = await page.request.get(
    `/api/v2/student/applications/${applicationId}/readiness/`,
  );
  expect(
    resp.ok(),
    `readiness should be readable by its owner (got ${resp.status()}: ${await resp.text()})`,
  ).toBeTruthy();
  const payload = unwrap(await resp.json());
  expect(Array.isArray(payload?.allowed_next_actions)).toBeTruthy();
  expect(
    payload.allowed_next_actions.length,
    'the platform never dead-ends a student: at least one action',
  ).toBeGreaterThan(0);
  return payload as {
    can_submit: boolean;
    blockers: Array<{ code: string; message: string }>;
    allowed_next_actions: Array<{ action: string; label: string; blocker_code: string | null }>;
  };
}

/** Open the dashboard and wait for the next-action panel to settle. */
async function openDashboard(page: Page) {
  await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
  const panel = page.getByTestId('student-next-action');
  await expect(panel).toBeVisible({ timeout: 60_000 });
  return panel;
}

/**
 * Wait until the panel's primary control carries the label the platform published.
 *
 * The dashboard reads applications and readiness on mount and re-reads on the
 * polling tick, so the label a journey is looking for arrives after the panel
 * itself. Polling for the *server's own* string is the assertion, not a
 * workaround: it is only satisfiable if the dashboard renders the payload.
 */
async function expectPrimaryAction(page: Page, label: string) {
  const primary = page.getByTestId('next-action-primary');
  await expect(primary).toBeVisible({ timeout: 60_000 });
  await expect(primary).toContainText(label, { timeout: 60_000 });
  return primary;
}

test.describe('The student dashboard is composed around the next action (R13.1)', () => {
  // ---------------------------------------------------------------------------
  // 1. The blocker is the platform's, and it is first
  // ---------------------------------------------------------------------------
  test('the dashboard shows the platform\u2019s own first blocker, above everything else', async ({
    page,
    gate,
  }) => {
    test.setTimeout(240_000);
    allowHarnessNoise(gate);

    const offering = await configureOffering('Task First');
    const { email, csrf } = await loginStudent(page);
    const { applicationId } = await createDraftApplication(page.request, csrf, {
      canonicalProgramId: offering.canonicalProgramId,
      intakeId: offering.intakeId,
      email,
    });

    // What the platform says, asked directly. This is the source of truth for
    // every string asserted below.
    const readiness = await readReadiness(page, applicationId);
    const expectedAction = readiness.allowed_next_actions[0]!;
    const expectedBlocker = readiness.blockers.find(
      (blocker) => blocker.code === expectedAction.blocker_code,
    );
    expect(
      expectedBlocker,
      'a fresh draft should be blocked, and the first action should clear a named blocker',
    ).toBeTruthy();

    const panel = await openDashboard(page);
    await expectPrimaryAction(page, expectedAction.label);

    // The blocker sentence is the platform's, verbatim.
    await expect(panel.getByTestId('next-action-detail')).toHaveText(expectedBlocker!.message);

    // …and it is FIRST. Geometry, not source order.
    //
    // Every box comes from **one** layout pass inside a single `evaluate`. Reading
    // them one locator at a time let the dashboard's polling refresh re-render
    // between two measurements, and the mobile run duly reported a section 2 px
    // above the panel — a race in the assertion rather than a fact about the page.
    const ordering = await page.evaluate(() => {
      const panelEl = document.querySelector('[data-testid="student-next-action"]');
      if (!panelEl) return null;
      const panelTop = panelEl.getBoundingClientRect().top + window.scrollY;
      const others: Array<{ top: number; label: string }> = [];
      for (const el of Array.from(document.querySelectorAll('main section'))) {
        if (el === panelEl || panelEl.contains(el)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        others.push({
          top: rect.top + window.scrollY,
          label: (el.textContent || '').trim().slice(0, 40),
        });
      }
      return { panelTop, others, viewportHeight: window.innerHeight };
    });
    expect(ordering, 'the next-action panel should be laid out').toBeTruthy();
    expect(
      ordering!.others.length,
      'the dashboard should render more than the panel',
    ).toBeGreaterThan(0);
    const above = ordering!.others.filter((section) => section.top < ordering!.panelTop);
    expect(above, 'nothing is laid out above the next action').toEqual([]);

    // The panel is in the first viewport, not below the fold.
    expect(ordering!.panelTop).toBeLessThan(ordering!.viewportHeight * 0.9);
  });

  // ---------------------------------------------------------------------------
  // 2. The action moves when the platform's answer moves
  // ---------------------------------------------------------------------------
  test('clearing one blocker changes the action to the next one the platform published', async ({
    page,
    gate,
  }) => {
    test.setTimeout(300_000);
    allowHarnessNoise(gate);

    const offering = await configureOffering('Blocker Moves');
    const { email, csrf } = await loginStudent(page);
    const { applicationId } = await createDraftApplication(page.request, csrf, {
      canonicalProgramId: offering.canonicalProgramId,
      intakeId: offering.intakeId,
      email,
    });

    const before = await readReadiness(page, applicationId);
    await openDashboard(page);
    await expectPrimaryAction(page, before.allowed_next_actions[0]!.label);

    // Clear the grade blocker through the student's own canonical endpoint.
    await persistMinimumGrades(page.request, csrf, applicationId);
    const after = await readReadiness(page, applicationId);
    expect(
      after.blockers.map((b) => b.code),
      'saving the minimum grades should remove a blocker the platform had named',
    ).not.toEqual(before.blockers.map((b) => b.code));

    const nextLabel = after.allowed_next_actions[0]!.label;
    // A dashboard that derived its own action would not move; one that reads the
    // platform's answer does.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectPrimaryAction(page, nextLabel);
    const detail = page.getByTestId('next-action-detail');
    const shownDetail = ((await detail.textContent()) || '').trim();
    const serverMessages = after.blockers.map((blocker) => blocker.message);
    expect(
      serverMessages,
      'the detail sentence should be one the platform sent, not one the browser wrote',
    ).toContain(shownDetail);
  });

  // ---------------------------------------------------------------------------
  // 3. Nothing decorative survives
  // ---------------------------------------------------------------------------
  test('no metric tile, no duplicate payment affordance, and no clear-all', async ({
    page,
    gate,
  }) => {
    test.setTimeout(240_000);
    allowHarnessNoise(gate);

    const offering = await configureOffering('No Fluff');
    const { email, csrf } = await loginStudent(page);
    await createDraftApplication(page.request, csrf, {
      canonicalProgramId: offering.canonicalProgramId,
      intakeId: offering.intakeId,
      email,
    });

    await openDashboard(page);

    const body = (await page.locator('main').innerText()).toLowerCase();
    // Labels that only ever existed as a metric tile or a duplicate card. Two of
    // the removed labels — "Submitted applications" and "Action needed" — are
    // ordinary English that legitimately appears in prose ("Submitted applications
    // appear here"), so they are covered structurally below instead of by
    // substring, which is the difference between asserting a design decision and
    // asserting a word.
    for (const removed of [
      'profile completion',
      'payment action required',
      'total applications',
      'latest application status',
      'quick actions',
      'application timeline',
    ]) {
      expect(body, `"${removed}" should no longer be on the dashboard`).not.toContain(removed);
    }

    // The structural half: `PageShell` renders `metrics` as a grid of
    // label/value/helper tiles between the page title and its children. No tile
    // means no metric above the action, whatever the labels say.
    const metricTiles = await page.evaluate(() => {
      const header = document.querySelector('header');
      if (!header) return -1;
      return header.querySelectorAll('div.grid > div').length;
    });
    expect(metricTiles, 'the page header renders no metric tiles').toBe(0);

    // R16.5's "destructive shortcuts": there is no clear-all anywhere on the page.
    for (const label of [/clear all/i, /delete all/i]) {
      expect(await page.getByRole('button', { name: label }).count()).toBe(0);
    }

    // The payment affordance is offered by the platform, once. Before this task
    // the next-action card, the QuickActions card and the payment alert all
    // pointed at `/student/payment` from one screen.
    const paymentLinks = await page.locator('main a[href^="/student/payment"]').count();
    expect(paymentLinks, 'a fee is offered once, not three times').toBeLessThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // 4. Draft cleanup is scoped and dialog-confirmed
  // ---------------------------------------------------------------------------
  test('deleting one of two drafts leaves the other, through a real dialog', async ({
    page,
    gate,
  }) => {
    test.setTimeout(300_000);
    allowHarnessNoise(gate);

    const first = await configureOffering('Scoped A');
    const second = await configureOffering('Scoped B');
    const { email, csrf } = await loginStudent(page);
    const { applicationId: keepId } = await createDraftApplication(page.request, csrf, {
      canonicalProgramId: first.canonicalProgramId,
      intakeId: first.intakeId,
      email,
    });
    const { applicationId: dropId } = await createDraftApplication(page.request, csrf, {
      canonicalProgramId: second.canonicalProgramId,
      intakeId: second.intakeId,
      email,
    });

    // A `window.confirm` would block the run rather than open a dialog: nothing
    // dismisses it, so this listener would fire and the assertion below would fail.
    let nativeConfirmSeen = false;
    page.on('dialog', async (dialog) => {
      nativeConfirmSeen = true;
      await dialog.dismiss();
    });

    await openDashboard(page);
    const drafts = page.getByTestId('draft-management');
    await expect(drafts).toBeVisible({ timeout: 60_000 });
    await expect(drafts.getByTestId('draft-row')).toHaveCount(2, { timeout: 60_000 });

    // Delete exactly one, by its own control.
    const rows = drafts.getByTestId('draft-row');
    const rowCount = await rows.count();
    let clicked = false;
    for (let index = 0; index < rowCount; index += 1) {
      const row = rows.nth(index);
      const continueHref = await row.locator('a').first().getAttribute('href');
      if (!continueHref?.includes(dropId)) continue;
      await row.getByRole('button', { name: /delete draft/i }).click();
      clicked = true;
      break;
    }
    expect(clicked, 'the draft to delete should have its own delete control').toBeTruthy();

    // R16.6: a product dialog with role=alertdialog, describing the consequence.
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog).toContainText('Your other drafts are not affected.');
    await dialog.getByRole('button', { name: /delete draft/i }).click();

    // One row survives, and it is the one that was kept.
    await expect(drafts.getByTestId('draft-row')).toHaveCount(1, { timeout: 60_000 });
    const survivingHref = await drafts
      .getByTestId('draft-row')
      .first()
      .locator('a')
      .first()
      .getAttribute('href');
    expect(survivingHref).toContain(keepId);

    // The platform agrees: the other draft is still the student's.
    const list = await page.request.get('/api/v1/applications/?mine=true&status=draft&pageSize=50');
    expect(list.ok()).toBeTruthy();
    const payload = unwrap(await list.json());
    const ids: string[] = (payload?.results ?? payload?.applications ?? []).map((row: any) =>
      String(row.id),
    );
    expect(ids).toContain(keepId);
    expect(ids).not.toContain(dropId);

    expect(nativeConfirmSeen, 'no window.confirm may own this workflow (R16.6)').toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 5. 320 / 375 / 390
  // ---------------------------------------------------------------------------
  test('holds at 320, 375 and 390 with the action in the first viewport', async ({
    page,
    gate,
  }, testInfo) => {
    test.setTimeout(300_000);
    allowHarnessNoise(gate);
    mkdirSync(SHOT_DIR, { recursive: true });

    const offering = await configureOffering('Narrow');
    const { email, csrf } = await loginStudent(page);
    const { applicationId } = await createDraftApplication(page.request, csrf, {
      canonicalProgramId: offering.canonicalProgramId,
      intakeId: offering.intakeId,
      email,
    });
    // A document upload means the readiness has cleared one gate and named
    // another, so the screenshots show a real mid-flight state rather than the
    // first blocker every time.
    await uploadDocument(page.request, csrf, applicationId, 'nrc');
    const readiness = await readReadiness(page, applicationId);
    const expectedLabel = readiness.allowed_next_actions[0]!.label;

    const project = testInfo.project.name;
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const panel = await openDashboard(page);
      await expectPrimaryAction(page, expectedLabel);

      // R16.7: no horizontal overflow.
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(
        overflow.scrollWidth,
        `no horizontal overflow at ${viewport.width}px`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);

      // R13.1 + R16.1: the action is in the first viewport at the narrowest width.
      const panelBox = await panel.boundingBox();
      expect(panelBox!.y, `the action is above the fold at ${viewport.width}px`).toBeLessThan(
        viewport.height,
      );

      // R16.2: every interactive element inside the panel and the draft card
      // meets 44 px. Measured from the layout box, not inferred from a class name.
      //
      // The 0.5 px tolerance is layout rounding, not a relaxed rule: Chromium
      // reports fractional boxes (a `min-height: 44px` inline-flex measures
      // 43.996 at some device pixel ratios), and the failing size is printed with
      // three decimals so a real regression reads as one.
      const undersized = await page.evaluate(() => {
        const scopes = Array.from(
          document.querySelectorAll(
            '[data-testid="student-next-action"], [data-testid="draft-management"]',
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

      await page.screenshot({
        path: join(SHOT_DIR, `dashboard-${viewport.label}-${project}.png`),
        fullPage: true,
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 6. Zoom (R16.8)
  // ---------------------------------------------------------------------------
  /**
   * Two zoom claims, because WCAG asks two different questions and the browser
   * answers them differently.
   *
   * **Reflow (1.4.10)** is 400% page zoom, which is *defined* as equivalent to a
   * 320 CSS-pixel viewport at 100%. That is exactly what journey 5 measures, so it
   * is not repeated here.
   *
   * **Resize text (1.4.4)** is a text-only enlargement, and the interesting case
   * for this panel is what happens when every rem-based size grows and the
   * viewport does not. At 320 px with a 32 px root font (200%), the shell's
   * `px-4` and the panel's `p-5` each double, leaving very little line width — so
   * this is the case that proves the panel *wraps* rather than being clipped by
   * the page shell's `overflow-x-hidden`.
   *
   * The claim is made against the **panel's own** box, not `document.scrollWidth`:
   * at these font sizes the app shell's focus-only "Skip to main content" anchor
   * (a `position: absolute` element translated off-screen) is the widest thing in
   * the document, and it belongs to the shell rather than to this surface.
   */
  test('the next action wraps rather than clipping at 200% text size', async ({ page, gate }) => {
    test.setTimeout(240_000);
    allowHarnessNoise(gate);

    const offering = await configureOffering('Zoomed');
    const { email, csrf } = await loginStudent(page);
    const { applicationId } = await createDraftApplication(page.request, csrf, {
      canonicalProgramId: offering.canonicalProgramId,
      intakeId: offering.intakeId,
      email,
    });
    const readiness = await readReadiness(page, applicationId);
    const expectedLabel = readiness.allowed_next_actions[0]!.label;

    await page.setViewportSize({ width: 320, height: 800 });
    const panel = await openDashboard(page);
    await expectPrimaryAction(page, expectedLabel);

    await page.addStyleTag({ content: 'html { font-size: 32px !important; }' });
    await page.waitForTimeout(400);

    // The action, its reason, and its control are all still on the page.
    await expect(panel.getByRole('heading', { level: 2 })).toBeVisible();
    await expect(panel.getByTestId('next-action-detail')).toBeVisible();
    await expect(page.getByTestId('next-action-primary')).toBeVisible();

    // Nothing inside the panel extends past the panel: the text reflowed.
    const clipped = await page.evaluate(() => {
      const scope = document.querySelector('[data-testid="student-next-action"]');
      if (!scope) return ['panel missing'];
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
    });
    expect(clipped, 'the panel reflows rather than clipping at 200% text size').toEqual([]);

    // And the heading is genuinely readable, not collapsed to a sliver.
    const headingBox = await panel.getByRole('heading', { level: 2 }).boundingBox();
    expect(headingBox!.width, 'the heading keeps usable line width').toBeGreaterThan(40);

    mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(SHOT_DIR, 'dashboard-320-text200.png'), fullPage: true });
  });
});
