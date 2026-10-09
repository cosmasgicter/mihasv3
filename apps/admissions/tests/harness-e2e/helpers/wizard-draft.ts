/**
 * Shared instruments for the wizard draft journeys added by task 6.3 M14
 * (`wizard-draft-refresh-each-step.spec.ts`, `wizard-draft-slow-network.spec.ts`).
 *
 * The earlier draft journeys (two-tab, offline-outbox) keep their own local
 * copies of the same helpers; they are unchanged so their evidence stays
 * comparable run to run.
 */
import { expect, type Page, type Request } from '@playwright/test';
import {
  assignOffering,
  createFee,
  createInstitutionViaApi,
  createIntake,
  linkIntake,
  listCanonicalPrograms,
  registerAndLoginStudent,
  type AuthedContext,
} from './api';

/** The harness noise every required wizard journey allows (see the characterisation spec). */
export function allowHarnessNoise(gate: {
  allowRequest: (p: string | RegExp) => unknown;
  allowConsole: (p: string | RegExp) => unknown;
}): void {
  gate.allowRequest('glitchtip');
  gate.allowRequest('harness-invalid.localhost');
  gate.allowConsole('Content Security Policy');
  gate.allowConsole('Failed to load resource');
}

export interface WizardOffering {
  canonicalProgramId: string;
  programName: string;
  intakeId: string;
  intakeName: string;
  schoolName: string;
}

/** A tenant offering one canonical program on its own intake, with a fee. */
export async function configureWizardOffering(
  admin: AuthedContext,
  label: string,
  codePrefix: string,
): Promise<WizardOffering> {
  const stamp = `${Date.now()}`.slice(-8);
  const canonical = (await listCanonicalPrograms(admin))[0];
  expect(canonical?.id, 'the harness should seed at least one canonical program').toBeTruthy();
  const schoolName = `${label} School ${stamp}`;
  const { institutionId } = await createInstitutionViaApi(admin, {
    name: schoolName,
    code: `${codePrefix}${stamp}`,
    hostname: `${codePrefix.toLowerCase()}-${stamp}.localhost`,
  });
  const intakeName = `${label} Intake ${stamp}`;
  const { intakeId } = await createIntake(admin, { name: intakeName, year: 2027 });
  const { offeringId } = await assignOffering(admin, institutionId, {
    canonical_program_id: canonical.id,
    name: canonical.name,
    code: `${codePrefix}P${stamp}`,
  });
  await linkIntake(admin, { program_id: offeringId, intake_id: intakeId, max_capacity: 25 });
  await createFee(admin, offeringId, { amount: '153.00' });
  return {
    canonicalProgramId: canonical.id as string,
    programName: canonical.name as string,
    intakeId,
    intakeName,
    schoolName,
  };
}

/** Register a fresh student and sign this page's browser context in as them. */
export async function loginStudentInPage(page: Page): Promise<{ email: string; csrf: string }> {
  const { ctx, email, password } = await registerAndLoginStudent();
  await ctx.dispose();
  const login = await page.request.post('/api/v1/auth/login/', { data: { email, password } });
  expect(login.ok(), `student browser login should succeed (got ${login.status()})`).toBeTruthy();
  const csrf = login.headers()['x-csrf-token'] || '';
  expect(csrf, 'login should return an X-CSRF-Token header').toBeTruthy();
  return { email, csrf };
}

export function unwrapEnvelope(json: unknown): Record<string, unknown> {
  const body = (json ?? {}) as { data?: unknown };
  return ((body.data ?? body) as Record<string, unknown>) ?? {};
}

/** The canonical draft row, read as the signed-in student. */
export async function readDraftRecord(page: Page, applicationId: string): Promise<Record<string, unknown>> {
  const response = await page.request.get(`/api/v1/applications/drafts/${applicationId}/`);
  expect(response.ok(), `the canonical draft should be readable (got ${response.status()})`).toBeTruthy();
  return unwrapEnvelope(await response.json());
}

/** The ids of every draft the signed-in student has. */
export async function listDraftIds(page: Page): Promise<string[]> {
  const response = await page.request.get('/api/v1/applications/drafts/?pageSize=100');
  expect(response.ok(), `the draft list should be readable (got ${response.status()})`).toBeTruthy();
  const body = unwrapEnvelope(await response.json()) as { results?: Array<{ id?: unknown }> } | Array<{ id?: unknown }>;
  const rows = Array.isArray(body) ? body : (body.results ?? []);
  return rows.map((row) => String(row.id));
}

/**
 * Wait until the page has stopped fetching (same instrument as
 * wizard-draft-offline-outbox.spec.ts), so a measurement window or a reload
 * starts from a settled page.
 */
export async function waitForNetworkQuiet(page: Page, quietMs = 2_500, timeoutMs = 60_000): Promise<void> {
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
    throw new Error(`the page was still fetching after ${timeoutMs}ms`);
  } finally {
    page.off('request', onRequest);
    page.off('requestfinished', onSettled);
    page.off('requestfailed', onSettled);
  }
}

/**
 * A write to the application/draft resource: any non-GET under the draft, the
 * generic application row, its grades, or the reroute command. What hydration
 * and a refresh must never send.
 */
export function isApplicationWrite(request: Request): boolean {
  if (request.method() === 'GET' || request.method() === 'HEAD' || request.method() === 'OPTIONS') return false;
  const path = new URL(request.url()).pathname;
  return path.startsWith('/api/v1/applications/') || path.startsWith('/api/v2/student/applications/');
}

/** The local draft records this browser context holds (keys only — values are encrypted). */
export function storedDraftRecordKeys(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Object.keys(localStorage).filter((key) => key.startsWith('beanola_secure_applicationWizardDraft:')),
  );
}

/** The wizard's own "Step N of 6" line. */
export function wizardStepLine(page: Page) {
  return page.getByTestId('wizard-progress-summary').locator('p').first();
}

/** Navigate a resumed draft from its derived resume step to Personal (F3's helper). */
export async function openPersonalStep(page: Page): Promise<void> {
  const summary = page.getByTestId('wizard-progress-summary');
  const town = page.getByLabel(/town|city/i).first();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await expect(summary).toContainText(/Step [234] of 6/, { timeout: 60_000 });
    const currentStep = await summary.locator('p').first().textContent();
    if (currentStep?.includes('Step 2 of 6')) {
      const continueToPersonal = page.getByRole('button', { name: /continue to personal/i });
      await expect(continueToPersonal).toBeEnabled({ timeout: 60_000 });
      await continueToPersonal.click();
    } else if (!currentStep?.includes('Step 3 of 6')) {
      const personalStep = page.getByRole('button', { name: /Step 3: Personal/i });
      await expect(personalStep).toBeEnabled({ timeout: 60_000 });
      await personalStep.click();
    }
    try {
      await expect(town).toBeVisible({ timeout: 10_000 });
      await expect(summary).toContainText('Step 3 of 6');
      return;
    } catch {
      // A transient resume step may have painted before the authoritative one.
    }
  }
  await expect(town).toBeVisible({ timeout: 60_000 });
}
