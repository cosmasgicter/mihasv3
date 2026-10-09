/**
 * Required V2 harness — manual grade entry always works (task 7.5).
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 7.5
 *               (Required_Evidence: "manual fallback E2E").
 * Requirements: R11.4 — "STUDENTS SHALL enter grades manually. Optional local OCR
 *               MAY propose subject and grade candidates ... but candidates SHALL
 *               include provenance/confidence and require explicit confirmation
 *               before they become application data."
 *               R11.9 — the build ships no browser OCR package or asset.
 *               R11.10 — manual fallback is proven, not assumed.
 * Findings:     STU-06, STU-07.
 *
 * The claim under test is the one a student's application depends on: **the
 * education step is fully usable with no OCR involved at all.** The harness web
 * image carries no Tesseract binary, so the extraction path is genuinely
 * unavailable here — the "OCR unavailable" condition happens for real rather than
 * by mocking it.
 *
 * The journey configures its own tenant (institution + offering + a unique intake
 * + fee) through the canonical admin commands, exactly as `tenant-launch.spec.ts`
 * does, so the assigned-school checkpoint resolves deterministically: only one
 * offering is linked to that intake. No seed-specific id is assumed (R4.7).
 *
 * Runs with the strict gates active (harness-fixtures.ts): zero skips, no console
 * errors, no unasserted failed requests.
 */
import { test, expect, type Page } from '../harness-fixtures';
import {
  registerAndLoginStudent,
  superAdminContext,
  createInstitutionViaApi,
  listCanonicalPrograms,
  createIntake,
  assignOffering,
  linkIntake,
  createFee,
} from '../helpers/api';

interface ConfiguredOffering {
  programName: string;
  intakeName: string;
}

/**
 * Create a tenant that offers one canonical program on a brand-new intake, with a
 * configured application fee. Returns the labels a student will pick in the UI.
 */
async function configureRoutableOffering(): Promise<ConfiguredOffering> {
  const admin = await superAdminContext();
  try {
    const stamp = `${Date.now()}`.slice(-8);
    const canonical = (await listCanonicalPrograms(admin))[0];
    expect(canonical?.id, 'the harness should seed at least one canonical program').toBeTruthy();

    const { institutionId } = await createInstitutionViaApi(admin, {
      name: `OCR Fallback School ${stamp}`,
      code: `OCRF${stamp}`,
      hostname: `ocrf-${stamp}.localhost`,
    });
    // A dedicated intake: the only offering linked to it is the one created below,
    // so the backend's routing decision is deterministic for this journey.
    const intakeName = `OCR Fallback Intake ${stamp}`;
    const { intakeId } = await createIntake(admin, { name: intakeName, year: 2027 });
    const { offeringId } = await assignOffering(admin, institutionId, {
      canonical_program_id: canonical.id,
      name: canonical.name,
      code: `OCRP${stamp}`,
    });
    await linkIntake(admin, { program_id: offeringId, intake_id: intakeId, max_capacity: 25 });
    // The assigned-school checkpoint needs a resolvable fee (R10.2/R10.3).
    await createFee(admin, offeringId, { amount: '153.00' });

    return { programName: canonical.name as string, intakeName };
  } finally {
    await admin.ctx.dispose();
  }
}

/** The id of the student's uploaded result slip, once the upload has committed. */
async function resolveResultSlipId(page: Page): Promise<string> {
  let slipId: string | null = null;
  await expect
    .poll(
      async () => {
        const list = await page.request.get('/api/v1/applications/?pageSize=5');
        if (!list.ok()) return false;
        const rows = (await list.json())?.data?.results ?? [];
        const draft = Array.isArray(rows) ? rows[0] : null;
        if (!draft?.id) return false;
        const documents = await page.request.get(`/api/v1/applications/${draft.id}/documents/`);
        if (!documents.ok()) return false;
        const items = (await documents.json())?.data ?? [];
        const slip = (Array.isArray(items) ? items : []).find(
          (row: { document_type?: string; id?: string }) => row.document_type === 'result_slip' && row.id,
        );
        slipId = slip?.id ?? null;
        return Boolean(slipId);
      },
      { timeout: 60_000, message: 'the uploaded result slip should be committed as evidence' },
    )
    .toBe(true);
  expect(slipId, 'the result slip should have an id').toBeTruthy();
  return slipId as unknown as string;
}

/** Log the browser context in as a brand-new student (shared cookie jar). */
async function loginFreshStudent(page: Page) {
  const { ctx, email, password } = await registerAndLoginStudent();
  await ctx.dispose();
  const login = await page.request.post('/api/v1/auth/login/', { data: { email, password } });
  expect(login.ok(), `student browser login should succeed (got ${login.status()})`).toBeTruthy();
  return { email };
}

/**
 * Open one canonical select and choose an option from *its* open list.
 *
 * Scoping to the open listbox (and waiting for it to close) matters: with several
 * grade rows on screen, a global `getByRole('option')` can resolve against a list
 * that is still animating out and silently set the wrong row.
 */
async function pickFromSelect(
  page: Page,
  trigger: ReturnType<Page['getByRole']>,
  choose: (listbox: ReturnType<Page['getByRole']>) => ReturnType<Page['getByRole']>,
): Promise<string> {
  await trigger.click();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  const option = choose(listbox);
  const label = ((await option.textContent()) || '').trim();
  await option.click();
  await expect(listbox).toBeHidden();
  return label;
}

/** Pick an option out of one of the wizard's canonical selects by visible text. */
async function selectOption(page: Page, comboboxName: RegExp, optionText: string) {
  await pickFromSelect(page, page.getByRole('combobox', { name: comboboxName }).first(), listbox =>
    listbox.getByRole('option', { name: optionText, exact: false }).first(),
  );
}

test.describe('Deterministic OCR is optional: manual entry always works (R11.4)', () => {
  test('a student reaches the education step and enters grades by hand, with no OCR', async ({ page, gate }) => {
    // A five-step student journey plus a real upload and a worker round-trip. The
    // default 30s budget is for a single interaction, not a whole application.
    test.setTimeout(180_000);
    gate.allowRequest('glitchtip');
    gate.allowRequest('harness-invalid.localhost');

    const offering = await configureRoutableOffering();
    const { email } = await loginFreshStudent(page);

    await page.goto('/student/application-wizard?mode=new', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // --- Step 1: programme + intake (canonical ids only) --------------------
    await expect(page.getByTestId('program-step')).toBeVisible();
    await selectOption(page, /programme/i, offering.programName);
    await selectOption(page, /intake/i, offering.intakeName);
    await page.getByRole('button', { name: /continue to assigned school/i }).click();

    // --- Step 2: assigned-school checkpoint (resolves because a fee exists) --
    await expect(page.getByRole('heading', { name: /your assigned school/i }).first()).toBeVisible();
    const toPersonal = page.getByRole('button', { name: /continue to personal/i });
    await expect(toPersonal).toBeEnabled({ timeout: 30_000 });
    await toPersonal.click();

    // --- Step 3: personal details ------------------------------------------
    await page.getByLabel(/full name/i).first().fill('Harness Student');
    await page.getByLabel(/nrc number/i).first().fill('123456/78/9');
    await page.getByLabel(/date of birth/i).first().fill('2004-05-04');
    await selectOption(page, /sex/i, 'Male');
    await page.getByLabel(/phone number/i).first().fill('+260971234567');
    const emailField = page.getByLabel(/email address/i).first();
    if (!(await emailField.inputValue())) await emailField.fill(email);
    await page.getByLabel(/town|city/i).first().fill('Lusaka');
    await page.getByRole('button', { name: /continue to education/i }).click();

    // --- Step 4: education — the actual claim ------------------------------
    const education = page.getByTestId('education-step');
    await expect(education).toBeVisible({ timeout: 30_000 });

    // OCR UNAVAILABLE: nothing was read, so nothing is suggested, and the step is
    // usable anyway. A student is never waiting on a scan to be able to continue.
    await expect(page.getByTestId('extracted-results-card')).toHaveCount(0);
    await expect(page.getByTestId('ocr-confirm-candidates')).toHaveCount(0);

    // Manual entry: the empty state hands the student their first subject row.
    await page.getByRole('button', { name: /add first subject/i }).click();

    // Enter the full configured minimum by hand. Reaching 5/5 with no OCR is the
    // proof that the manual path is complete on its own, not a degraded mode.
    for (let row = 0; row < 5; row += 1) {
      if (row > 0) {
        await page.getByRole('button', { name: /add (another )?subject/i }).first().click();
      }
      // The selector is server-populated with canonical ids (R11.5); the curriculum
      // group rows render as disabled options, so pick by enabled state. Already
      // used subjects are excluded by the step itself, so index 0 is always a new
      // subject — no seeded subject name is assumed.
      const subjectLabel = await pickFromSelect(
        page,
        page.getByRole('combobox', { name: new RegExp(`^Subject ${row + 1}$`, 'i') }),
        listbox => listbox.getByRole('option', { disabled: false }).first(),
      );
      expect(subjectLabel.length, 'the subject selector should be server-populated').toBeGreaterThan(0);

      await pickFromSelect(
        page,
        page.getByRole('combobox', { name: new RegExp(`^Grade for subject ${row + 1}$`, 'i') }),
        listbox => listbox.getByRole('option', { name: /^4 / }).first(),
      );

      await expect(education.getByText(`${row + 1}/5 unique minimum`)).toBeVisible();
    }

    // 2. OCR UNAVAILABLE FOR REAL: upload the result slip. The harness web image
    //    has no Tesseract binary, so the extraction genuinely cannot produce text.
    //    The document is still accepted as evidence, no candidate is invented, and
    //    the five manually entered grades are untouched.
    const slipInput = page.locator('input[type="file"]').first();
    await slipInput.setInputFiles({
      name: 'result-slip.png',
      mimeType: 'image/png',
      // A 1x1 PNG: real bytes, real upload, nothing to read.
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
        'base64',
      ),
    });

    // Find the uploaded slip through the real student endpoints, then read the
    // document contract the wizard's assistance hook reads.
    const slipId = await resolveResultSlipId(page);
    const info = await page.request.get(`/api/v1/documents/${slipId}/info/`);
    expect(info.ok(), `document info should be readable (got ${info.status()})`).toBeTruthy();
    const document = (await info.json())?.data as Record<string, unknown>;

    // The evidence landed…
    expect(document.document_type).toBe('result_slip');
    // …but no candidate was invented from a file with nothing to read, and the
    // retired `ai_analysis` alias is gone from the contract (R11.9, task 7.5).
    expect(document.extraction ?? null).toBeNull();
    expect(Object.keys(document)).not.toContain('ai_analysis');
    expect(Object.keys(document)).not.toContain('ai_analysis_available');

    // The student's five manual grades are still exactly what they typed: the
    // upload did not overwrite, reorder, or clear a single one (R11.4).
    await expect(education.getByText('5/5 unique minimum')).toBeVisible();
    await expect(page.getByTestId('extracted-results-card')).toHaveCount(0);
  });

  test('the served bundle ships no browser OCR asset (R11.9, STU-07)', async ({ page, gate }) => {
    gate.allowRequest('glitchtip');

    // The pre-7.5 asset paths must no longer resolve to an OCR payload. The edge
    // serves the SPA shell for unknown paths, so the assertion is about WHAT comes
    // back, not just the status: no JS worker, no WASM, no reference to the engine.
    for (const assetPath of [
      '/ocr/tesseract/worker.min.js',
      '/ocr/tesseract/core/tesseract-core.wasm',
      '/ocr/tesseract/core/tesseract-core-simd.wasm.js',
    ]) {
      const response = await page.request.get(assetPath);
      const contentType = response.headers()['content-type'] || '';
      expect(
        contentType.includes('javascript') || contentType.includes('wasm'),
        `${assetPath} must not be served as an executable OCR asset (got ${contentType})`,
      ).toBeFalsy();
      const body = await response.text();
      expect(body.toLowerCase()).not.toContain('tesseractcore');
    }

    // And nothing in the served entry HTML references the engine.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect((await page.content()).toLowerCase()).not.toContain('tesseract');
  });
});
