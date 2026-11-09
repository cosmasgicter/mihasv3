/**
 * Required V2 harness — the document actions are one action, not a stack
 * (admissions-v2 task **11.3**).
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 11.3
 *               (Required_Evidence: "long-name/mobile snapshots and
 *               keyboard/screen-reader tests").
 * Requirements: **R13.1** (the next required action before passive detail),
 *               **R13.2** (official-document availability on the application
 *               surface), **R16.1** (320 CSS pixels first; a compact layout may
 *               not lose commands), **R16.2** (≥ 44 × 44 targets, keyboard order,
 *               visible focus, accessible names/descriptions/state), **R16.5**
 *               (no duplicate affordances), **R16.7** (no horizontal overflow, no
 *               clipped text, no hidden commands at the named widths).
 * Findings:     **STU-05** (*"Application document actions become a tall stack of
 *               equally prominent buttons on mobile"* — remedy: *"Present status
 *               first, one primary action, and an accessible overflow/menu for
 *               secondary document commands"*), **STU-18**.
 *
 * ## Why a browser, and what jsdom already settled
 *
 * `tests/unit/documentActionDensity.test.tsx` owns everything the DOM can answer:
 * how many prominent controls exist, what order the summary and the controls are
 * in, which element owns the live region, and whether the disclosure carries real
 * ARIA state. What it cannot answer is exactly what STU-05 is about:
 *
 * * **"a tall stack"** is geometry. Whether the action cluster is one control or
 *   seven, and whether each is 44 px, are measured layout boxes — jsdom lays
 *   nothing out and reports every rect as zero.
 * * **"on mobile"** is a viewport with a real layout engine. "No horizontal
 *   overflow at 320 px with a long name in it" cannot be faked.
 * * **a keyboard** operating a disclosure is a browser default action. jsdom
 *   synthesises no click from `Enter` on a focused `<button>`, so a jsdom
 *   "keyboard test" would only be re-asserting the click handler.
 * * **a screen reader** reads the accessibility tree. Whether the live region is
 *   *in* that tree while the sheet is closed is a computed-visibility question.
 *
 * ## The journeys
 *
 * | Journey | Proves |
 * |---|---|
 * | **1. one action at 320 / 375 / 390** | the workspace's document panel states what the platform has *before* any control, gives exactly one document a prominent control, hides the rest behind one **counted** disclosure, keeps every target ≥ 44 px, and does not overflow — with a long institution and intake name planted in the same page. A screenshot at each width |
 * | **2. the dashboard row is not a stack of stacks** | the row's next action precedes its documents, the row contributes exactly **one** document control, and no live region of its own — the "keep live status feedback outside dense rows" half. A screenshot at 320 |
 * | **3. a keyboard reaches every command** | the disclosure trigger is tabbable with visible focus, `Enter` opens it, every command it hid is then focusable and operable, and `Enter` closes it again |
 * | **4. a screen reader is told once, and told the platform's own words** | one live region for the whole surface, out of the tree while the sheet is closed, in it when open; each document named exactly once; `aria-expanded`/`aria-controls` resolve to the panel that holds the commands |
 *
 * ## On "long-name"
 *
 * The programme name a student sees is the **canonical** programme's name
 * (`assignment_resolution.py`: `program_name=canonical.name`), and canonical
 * programmes are platform records with no create route — so a journey cannot
 * plant a long one without inventing a write path that does not exist. The two
 * display snapshots a journey *can* author are the **institution** and the
 * **intake** name, and both render on the surfaces this task changed (the row's
 * details grid, the workspace's quick-information list). Those carry the
 * long-name stress here, alongside the counted disclosure label, and the
 * screenshots are taken with them in the page. Stated rather than quietly
 * substituted.
 *
 * Runs against the isolated local harness (task 0.4) with the strict gates active
 * (`harness-fixtures.ts`): zero skips, no console errors, no unhandled
 * exceptions, no unasserted failed requests. Both the desktop and the mobile
 * project run every journey.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { evidenceDir } from '../helpers/evidence-dir';
import { test, expect, type Locator, type Page } from '../harness-fixtures';
import {
  assignOffering,
  createDraftApplication,
  createFee,
  createInstitutionViaApi,
  createIntake,
  freshContext,
  linkIntake,
  listCanonicalPrograms,
  superAdminContext,
  type AuthedContext,
} from '../helpers/api';

/**
 * Where this spec's screenshots go — **run-scoped by default**; task 11.3's own
 * `docs/v2-evidence/11.3/screenshots` only when a run explicitly asks for it
 * (`V2_EVIDENCE_TASK_DIRS=1`, or `V2_EVIDENCE_DIR=<repo-relative path>`).
 *
 * Task 13.6 remediation **L8** / **GATE-13.1-07**. The literal this replaced
 * (`'../../../../../docs/v2-evidence/11.3/screenshots'`) meant every ordinary run of the
 * required profile regenerated task 11.3's recorded screenshots — a task with no
 * interest in 11.3 at all, silently rewriting its Required_Evidence. See
 * `../helpers/evidence-dir` for the three cases and why the default is not a task
 * directory.
 */
const SHOT_DIR = join(evidenceDir('11.3'), 'screenshots');

/** The student's own application workspace (`routeRegistry` student.status alias). */
const APPLICATION_URL = (applicationId: string) => `/application/${applicationId}`;
const DASHBOARD_URL = '/student/dashboard';
const DOCUMENT_API = (applicationId: string, documentType: string) =>
  `/api/v1/applications/${applicationId}/official-documents/${documentType}/`;

const SLIP = 'application_slip';

/** The widths R16.7 names for the student surface. */
const VIEWPORTS = [
  { label: '320', width: 320, height: 568 },
  { label: '375', width: 375, height: 667 },
  { label: '390', width: 390, height: 844 },
];

/**
 * A name long enough to break a row that does not wrap, and made of real words so
 * a failure screenshot is readable rather than a wall of `x`.
 */
const LONG_INSTITUTION_NAME =
  'Beanola Metropolitan Institute of Advanced Clinical and Biomedical Sciences';
const LONG_INTAKE_NAME =
  'January 2027 Extended Late-Entry Intake for Returning and Transferring Applicants';

test.describe.configure({ mode: 'serial' });

interface SeededWorld {
  admin: AuthedContext;
  applicantEmail: string;
  applicantPassword: string;
  applicationId: string;
}

let seeded: SeededWorld | undefined;

function unwrap(json: any): any {
  return json && typeof json === 'object' && 'data' in json ? json.data : json;
}

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

async function seedWorld(): Promise<SeededWorld> {
  if (seeded) return seeded;
  const admin = await superAdminContext();
  const stamp = `${Date.now()}`.slice(-8);

  const canonicals = await listCanonicalPrograms(admin);
  expect(
    canonicals.length,
    'the harness catalogue should publish at least one canonical program',
  ).toBeGreaterThan(0);
  const canonicalProgramId = canonicals[0].id as string;

  // The long display snapshots this task can honestly author (see the header note).
  const { institutionId } = await createInstitutionViaApi(admin, {
    name: `${LONG_INSTITUTION_NAME} ${stamp}`,
    code: `DEN${stamp}`,
    hostname: `den113-${stamp}.localhost`,
  });
  const { intakeId } = await createIntake(admin, {
    name: `${LONG_INTAKE_NAME} ${stamp}`,
    year: new Date().getFullYear() + 1,
  });
  const { offeringId } = await assignOffering(admin, institutionId, {
    canonical_program_id: canonicalProgramId,
    name: `Density Offering ${stamp}`,
    code: `DP${stamp}`,
  });
  await linkIntake(admin, { program_id: offeringId, intake_id: intakeId, max_capacity: 50 });
  await createFee(admin, offeringId, { amount: '153.00' });

  const ctx = await freshContext();
  const applicantEmail = `harness.density.${stamp}@example.com`;
  const applicantPassword = 'HarnessStudent123';
  const reg = await ctx.post('/api/v1/auth/register/', {
    data: { email: applicantEmail, password: applicantPassword, first_name: 'Harness', last_name: 'Density' },
  });
  expect(reg.ok(), `applicant should register (got ${reg.status()}: ${await reg.text()})`).toBeTruthy();
  const login = await ctx.post('/api/v1/auth/login/', {
    data: { email: applicantEmail, password: applicantPassword },
  });
  expect(login.ok(), `applicant should log in (got ${login.status()})`).toBeTruthy();
  const csrf = login.headers()['x-csrf-token'] || '';
  expect(csrf, 'login should return an X-CSRF-Token header').toBeTruthy();

  const { applicationId } = await createDraftApplication(ctx, csrf, {
    canonicalProgramId,
    intakeId,
    email: applicantEmail,
    fullName: `Harness Density ${stamp}`,
  });

  // The densest state the student document surface has: `approved` **with a
  // verified fee**, which offers the acceptance letter, the slip *and* the
  // receipt — the three-equally-prominent-downloads-plus-three-emails state
  // STU-05 names. Every step is the platform's own audited command, and the fee is
  // resolved by the platform's payment-verification command
  // (`tenant.payment.verify`, task 9.4) rather than skipped with `force`: a forced
  // approval leaves the payment unverified, so the receipt never appears and the
  // journey would quietly prove the one-primary-control claim against a *thinner*
  // surface than the finding describes.
  for (const body of [
    { new_status: 'submitted', notes: 'harness 11.3 density setup' },
    { paymentStatus: 'verified', notes: 'harness 11.3 density setup: fee settled offline' },
    { new_status: 'under_review', notes: 'harness 11.3 density setup' },
    { new_status: 'approved', notes: 'harness 11.3 density setup' },
  ]) {
    const resp = await admin.ctx.post(`/api/v1/applications/${applicationId}/review/`, {
      headers: { 'x-csrf-token': admin.csrf },
      data: body,
    });
    expect(
      resp.ok(),
      `review ${JSON.stringify(body)} should succeed (got ${resp.status()}: ${await resp.text()})`,
    ).toBeTruthy();
  }

  // The setup is only setup if it actually reached that state, so it is read back
  // from the platform rather than assumed from four 200s.
  const readback = unwrap(await (await ctx.get(`/api/v1/applications/${applicationId}/`)).json());
  expect(readback?.status, 'the density journey needs an approved application').toBe('approved');
  expect(
    ['verified', 'paid', 'successful', 'force_approved'],
    `and a resolved fee (got ${readback?.payment_status})`,
  ).toContain(String(readback?.payment_status));
  await ctx.dispose();

  seeded = { admin, applicantEmail, applicantPassword, applicationId };
  return seeded;
}

test.beforeAll(async () => {
  mkdirSync(SHOT_DIR, { recursive: true });
  await seedWorld();
});

test.afterAll(async () => {
  if (!seeded) return;
  await seeded.admin.ctx.dispose();
  seeded = undefined;
});

async function loginApplicant(page: Page): Promise<string> {
  const world = seeded!;
  const login = await page.request.post('/api/v1/auth/login/', {
    data: { email: world.applicantEmail, password: world.applicantPassword },
  });
  expect(
    login.ok(),
    `${world.applicantEmail} should log in (got ${login.status()}: ${await login.text()})`,
  ).toBeTruthy();
  return login.headers()['x-csrf-token'] || '';
}

/** Wait for the boot overlay to leave, so every geometry claim is about the product. */
async function settled(page: Page): Promise<void> {
  await expect(page.locator('.beanola-preloader')).toHaveCount(0, { timeout: 30_000 });
}

async function openWorkspace(page: Page, applicationId: string): Promise<void> {
  await page.goto(APPLICATION_URL(applicationId), { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /^Application #/ }).first()).toBeVisible({
    timeout: 30_000,
  });
  await settled(page);
  await expect(page.getByTestId('application-document-actions')).toBeVisible({ timeout: 30_000 });
}

/** Every measurable box of a control, from the laid-out page. */
async function boxOf(locator: Locator): Promise<{ width: number; height: number }> {
  const box = await locator.boundingBox();
  expect(box, 'a visible control should have a layout box').not.toBeNull();
  return { width: box!.width, height: box!.height };
}

/** The document surface's own controls that are visible on this viewport. */
function visibleButtons(scope: Locator): Locator {
  return scope.locator('button:visible');
}

/** `chromium` / `mobile` — the project a screenshot belongs to. */
function projectLabel(): string {
  return test.info().project.name.replace('-required', '');
}

/** Whether the page scrolls sideways — R16.7's overflow claim, measured. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

// ---------------------------------------------------------------------------
// 1. One action at 320 / 375 / 390 (Required_Evidence: long-name/mobile snapshots)
// ---------------------------------------------------------------------------
test('the document panel is status, then one action, then one counted sheet', async ({
  page,
  gate,
}) => {
  allowHarnessNoise(gate);
  const world = seeded!;
  await loginApplicant(page);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openWorkspace(page, world.applicationId);

    const panel = page.getByTestId('application-document-actions');

    // Status first — and it is the platform's inventory, not a label.
    const summary = panel.getByTestId('document-status-summary');
    await expect(summary).toBeVisible();
    // SJR task 3.20 (R5-f): "ready" only for an issued document, else "can be
    // prepared now". The seeded application may or may not have an issued slip.
    await expect(summary).toContainText(/(can be prepared now|is ready to open)/i);

    // Exactly one prominent control. This is STU-05's whole sentence: the state
    // that used to produce three equally prominent downloads plus three email
    // affordances produces one button.
    const prominent = await panel.evaluate((root) =>
      Array.from(root.querySelectorAll('button'))
        .filter((el) => el.className.includes('bg-primary text-primary-foreground'))
        .map((el) => (el.textContent || '').trim()),
    );
    expect(
      prominent,
      `exactly one prominent document control at ${viewport.label}`,
    ).toHaveLength(1);

    // …against the state the finding actually describes. Three documents, so
    // "exactly one prominent control" is a real reduction rather than a surface
    // that only ever had one thing to show.
    await expect(
      panel.locator('[data-testid^="official-document-"]'),
      'the seeded application should offer all three student documents',
    ).toHaveCount(3);

    // The sheet says how much it holds, so a phone student can tell it is not an
    // empty box — the pre-11.3 mobile disclosure was labelled "Documents" and
    // could have held nothing. The count is the surface's own arithmetic over what
    // the platform published; the assertion is that it is *honest*, because
    // opening it yields exactly that many commands.
    const trigger = panel.getByTestId('document-options-trigger');
    await expect(trigger).toBeVisible();
    const label = ((await trigger.textContent()) || '').trim();
    const claimed = Number(/\((\d+)\)/.exec(label)?.[1]);
    expect(claimed, `the sheet label should carry a count (got "${label}")`).toBe(5);
    expect(await trigger.getAttribute('aria-expanded')).toBe('false');

    // Before opening: the sheet's commands are not reachable, which is the point
    // of the density fix — and the one primary control *is*.
    const beforeOpen = await visibleButtons(panel).count();
    expect(
      beforeOpen,
      `the closed panel offers the primary plus the sheet trigger at ${viewport.label}`,
    ).toBe(2);

    // The required artifact: the resting surface, which is the state STU-05 is
    // about. Taken *before* the sheet is opened, and framed on the panel so the
    // screenshot shows what a student meets rather than the top of the page.
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: join(SHOT_DIR, `documents-${viewport.label}-${projectLabel()}-required.png`),
      fullPage: false,
    });

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const sheet = panel.getByTestId('document-options-panel');
    await expect(sheet).toBeVisible();
    expect(
      await visibleButtons(sheet).count(),
      'the sheet holds exactly the commands its label claimed',
    ).toBe(claimed);

    // Every target, measured from its own layout box (R16.2). 44 is the floor the
    // steering names; the tokens are `min-h-touch` / `min-h-touch-lg`.
    for (const button of await visibleButtons(panel).all()) {
      const box = await boxOf(button);
      const name = ((await button.textContent()) || '').trim() || '(icon only)';
      expect(
        box.height,
        `"${name}" should be ≥ 44 px tall at ${viewport.label} (got ${box.height})`,
      ).toBeGreaterThanOrEqual(44);
      expect(
        box.width,
        `"${name}" should be ≥ 44 px wide at ${viewport.label} (got ${box.width})`,
      ).toBeGreaterThanOrEqual(44);
    }

    // R16.7, with the long institution and intake names in the same page.
    await expect(page.getByText(new RegExp(LONG_INSTITUTION_NAME.slice(0, 40), 'i')).first()).toBeVisible();
    expect(
      await horizontalOverflow(page),
      `no horizontal overflow at ${viewport.label} with a long institution and intake name`,
    ).toBeLessThanOrEqual(1);

    // And the other half of the claim, at the narrowest width the spec names:
    // the sheet open, holding every command the resting surface did not show.
    if (viewport.label === '320') {
      await panel.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: join(SHOT_DIR, `documents-320-open-${projectLabel()}-required.png`),
        fullPage: false,
      });
    }
  }

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

// ---------------------------------------------------------------------------
// 2. The dashboard row is not a stack of stacks (task 11.3's bullet)
// ---------------------------------------------------------------------------
test('the dashboard row leads with the next action and contributes one document control', async ({
  page,
  gate,
}) => {
  allowHarnessNoise(gate);
  await loginApplicant(page);

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
  await settled(page);

  const row = page.getByTestId('application-document-actions').first();
  await expect(row).toBeVisible({ timeout: 60_000 });
  expect(
    await row.getAttribute('data-density'),
    'a list row renders the document surface at row density',
  ).toBe('row');

  // R13.1, in the row: the thing the student has to *do* comes before the passive
  // detail and before the documents. An approved application with a settled fee is
  // waiting on an enrollment confirmation, so the server's own next action is
  // there to be placed — this is not a conditional assertion.
  const nextAction = page.getByTestId('application-row-next-action').first();
  await expect(nextAction).toBeVisible({ timeout: 60_000 });
  expect(
    await page.evaluate(() => {
      const action = document.querySelector('[data-testid="application-row-next-action"]');
      const documents = document.querySelector('[data-testid="application-document-actions"]');
      if (!action || !documents) return null;
      return Boolean(
        action.compareDocumentPosition(documents) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }),
    'the next action precedes the document actions in the row',
  ).toBe(true);
  // And it is above them on screen, not merely earlier in the markup.
  const actionBox = await nextAction.boundingBox();
  const documentsBox = await row.boundingBox();
  expect(actionBox, 'the next action should have a layout box').not.toBeNull();
  expect(documentsBox, 'the document actions should have a layout box').not.toBeNull();
  expect(actionBox!.y, 'the next action is rendered above the documents').toBeLessThan(
    documentsBox!.y,
  );

  // The row keeps the status sentence — de-densified, not made mute.
  await expect(row.getByTestId('document-status-summary')).toBeVisible();

  // No prominent document control in a list row: one per application is exactly
  // STU-05's stack, multiplied by the number of applications on the page.
  const prominent = await row.evaluate((root) =>
    Array.from(root.querySelectorAll('button')).filter((el) =>
      el.className.includes('bg-primary text-primary-foreground'),
    ).length,
  );
  expect(prominent, 'a list row adds no prominent document button').toBe(0);

  // One control, and it is the counted sheet.
  const trigger = row.getByTestId('document-options-trigger');
  await expect(trigger).toBeVisible();
  expect(await visibleButtons(row).count(), 'the row contributes exactly one document control').toBe(1);

  // R16.7 at the narrowest width the spec names, with the long intake snapshot in
  // the same row.
  expect(await horizontalOverflow(page), 'no horizontal overflow at 320').toBeLessThanOrEqual(1);

  // The required artifact, in the row's resting state — which is the state a
  // dashboard of applications is actually in.
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(SHOT_DIR, `dashboard-row-320-${projectLabel()}-required.png`),
    fullPage: false,
  });

  // "Live status feedback outside dense rows": while the sheet is shut the row's
  // polite region is not in the accessibility tree at all, so a page of
  // applications cannot accumulate one region per row.
  const liveStatus = row.getByTestId('document-live-status');
  await expect(liveStatus).toBeHidden();
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(liveStatus).toBeAttached();
  expect(
    await row.evaluate((root) => {
      const region = root.querySelector('[data-testid="document-live-status"]');
      return region ? (region as HTMLElement).getAttribute('aria-live') : null;
    }),
    'and when it is reachable it is a polite region',
  ).toBe('polite');

  // Opening it did not turn the row into a stack either: still no prominent
  // control, and the download the sheet holds is one of its listed commands.
  expect(
    await row.evaluate((root) =>
      Array.from(root.querySelectorAll('button')).filter((el) =>
        el.className.includes('bg-primary text-primary-foreground'),
      ).length,
    ),
    'an opened row sheet still adds no prominent document button',
  ).toBe(0);
  expect(await horizontalOverflow(page), 'no horizontal overflow at 320 with the sheet open').toBeLessThanOrEqual(1);

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

// ---------------------------------------------------------------------------
// 3. A keyboard reaches every command (R16.2)
// ---------------------------------------------------------------------------
test('every command the sheet hides is reachable and operable by keyboard', async ({
  page,
  gate,
}) => {
  allowHarnessNoise(gate);
  const world = seeded!;
  await loginApplicant(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page, world.applicationId);

  const panel = page.getByTestId('application-document-actions');
  const trigger = panel.getByTestId('document-options-trigger');
  await expect(trigger).toBeVisible();

  // Focusable, with a focus ring that is actually rendered — R16.2 asks for
  // *visible* focus, so the assertion is on the computed outline/ring, not just on
  // `document.activeElement`.
  await trigger.focus();
  await expect(trigger).toBeFocused();
  const focusVisible = await trigger.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      matchesFocusVisible: el.matches(':focus-visible'),
      shadow: style.boxShadow,
      outlineWidth: style.outlineWidth,
    };
  });
  expect(
    focusVisible.matchesFocusVisible,
    'a keyboard-focused trigger should match :focus-visible',
  ).toBe(true);
  expect(
    focusVisible.shadow !== 'none' || parseFloat(focusVisible.outlineWidth || '0') > 0,
    `focus should be visible (box-shadow: ${focusVisible.shadow}, outline: ${focusVisible.outlineWidth})`,
  ).toBe(true);

  // `Enter` opens it. This is the browser's own default action on a `<button>`,
  // which is the whole reason the pre-11.3 `<details>`/`<summary>` was replaced
  // with a real ARIA disclosure rather than styled differently.
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const sheet = panel.getByTestId('document-options-panel');
  await expect(sheet).toBeVisible();

  // Every command inside is now genuinely operable from the keyboard: tab order
  // reaches it, and it is not `disabled`.
  const commands = await visibleButtons(sheet).all();
  expect(commands.length, 'the sheet should hold the commands it counted').toBeGreaterThan(0);
  for (const command of commands) {
    const name = ((await command.textContent()) || '').trim();
    await command.focus();
    await expect(command, `"${name}" should take keyboard focus`).toBeFocused();
    expect(
      await command.isEnabled(),
      `"${name}" should be operable, not a disabled placeholder`,
    ).toBe(true);
  }

  // Tab order is forward from the trigger into the sheet — the sheet follows its
  // own trigger in the DOM, so it follows it in the focus order too.
  await trigger.focus();
  await page.keyboard.press('Tab');
  const firstAfterTrigger = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    return active ? (active.textContent || '').trim() : null;
  });
  const firstCommand = commands[0];
  expect(firstCommand, 'the sheet should hold at least one command').toBeTruthy();
  const firstCommandName = ((await firstCommand!.textContent()) || '').trim();
  expect(
    firstAfterTrigger,
    'Tab from the trigger lands on the first command it revealed',
  ).toBe(firstCommandName);

  // And `Enter` closes it again, so a keyboard user is not trapped in an expanded
  // sheet they cannot collapse.
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(sheet).toBeHidden();

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

// ---------------------------------------------------------------------------
// 4. A screen reader is told once, in the platform's own words (R16.2, STU-18)
// ---------------------------------------------------------------------------
test('one live region, one name per document, and the platform authors the words', async ({
  page,
  gate,
}) => {
  allowHarnessNoise(gate);
  const world = seeded!;
  const csrf = await loginApplicant(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page, world.applicationId);
  const panel = page.getByTestId('application-document-actions');

  // One polite region for the whole surface. Before 11.3 each control carried its
  // own `aria-live`, so this state — three documents — had six regions bolted to
  // elements whose accessible names were themselves changing.
  const regions = panel.locator('[aria-live]');
  await expect(regions).toHaveCount(1);
  const region = regions.first();
  expect(await region.getAttribute('role')).toBe('status');
  expect(await region.getAttribute('aria-live')).toBe('polite');
  expect(await region.getAttribute('aria-atomic')).toBe('true');
  // At panel density it is outside the sheet: a region inside a collapsed
  // container is out of the tree, and the panel's own status must not be.
  expect(
    await panel.evaluate((root) => {
      const sheet = root.querySelector('[data-testid="document-options-panel"]');
      const live = root.querySelector('[data-testid="document-live-status"]');
      return !!sheet && !!live && sheet.contains(live);
    }),
    'the panel keeps its live region outside the sheet',
  ).toBe(false);

  // Each document is named exactly once in the accessibility tree — the duplicate
  // render meant a screen reader met every heading, note and alert twice.
  for (const documentType of ['acceptance_letter', SLIP, 'payment_receipt']) {
    await expect(
      panel.locator(`[data-testid="official-document-${documentType}"]`),
      `${documentType} should be rendered once`,
    ).toHaveCount(1);
  }

  // `aria-controls` resolves to the element that actually holds the commands.
  const trigger = panel.getByTestId('document-options-trigger');
  const controls = await trigger.getAttribute('aria-controls');
  expect(controls, 'the trigger names what it controls').toBeTruthy();
  expect(
    await page.evaluate((id) => {
      const target = document.getElementById(id!);
      return target?.getAttribute('data-testid') ?? null;
    }, controls),
    'and it is the sheet',
  ).toBe('document-options-panel');

  // The words are the platform's. Ask the surface to prepare a document and the
  // one region says so — and it says it about the document the platform is
  // actually working on, named the way the platform's own copy names it.
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const slip = panel.locator(`[data-testid="official-document-${SLIP}"]`);
  // SJR task 3.17/3.20: the control that asks for a document is "Prepare".
  await slip.getByRole('button', { name: /Prepare Application Slip/i }).click();
  await expect
    .poll(async () => ((await region.textContent()) || '').trim(), {
      timeout: 60_000,
      message: 'the single live region should narrate the work',
    })
    .toMatch(/application slip/i);

  // And a document the platform already issued is announced as an issued copy
  // rather than as today's state (STU-18) — read from the platform, then read on
  // the screen, so the two cannot drift.
  await expect
    .poll(
      async () => {
        const resp = await page.request.get(DOCUMENT_API(world.applicationId, SLIP));
        if (!resp.ok()) return null;
        return unwrap(await resp.json())?.status ?? null;
      },
      { timeout: 90_000, message: 'the slip should settle' },
    )
    .toBe('ready');
  const settledStatus = unwrap(
    await (await page.request.get(DOCUMENT_API(world.applicationId, SLIP))).json(),
  );
  expect(
    await slip.getAttribute('data-historical'),
    'a live application serves current documents, not issued copies',
  ).toBe(String(settledStatus.historical === true));

  expect(csrf, 'the session issued a CSRF token').toBeTruthy();
  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});
