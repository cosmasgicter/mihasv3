/* TEMPORARY diagnostic — delete before finishing task 11.2. */
import { test, expect, type Page } from '@playwright/test';
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
  type AuthedContext,
} from '../helpers/api';

let sharedAdmin: Promise<AuthedContext> | null = null;
function platformAdmin(): Promise<AuthedContext> {
  sharedAdmin ??= superAdminContext();
  return sharedAdmin;
}

async function configureOffering(label: string) {
  const admin = await platformAdmin();
  const stamp = `${Date.now()}`.slice(-8);
  const canonical = (await listCanonicalPrograms(admin))[0];
  const { institutionId } = await createInstitutionViaApi(admin, {
    name: `${label} School ${stamp}`,
    code: `D11${stamp}`,
    hostname: `d112-${stamp}.localhost`,
  });
  const intakeName = `${label} Intake ${stamp}`;
  const { intakeId } = await createIntake(admin, { name: intakeName, year: 2027 });
  const { offeringId } = await assignOffering(admin, institutionId, {
    canonical_program_id: canonical.id,
    name: canonical.name,
    code: `D11P${stamp}`,
  });
  await linkIntake(admin, { program_id: offeringId, intake_id: intakeId, max_capacity: 25 });
  await createFee(admin, offeringId, { amount: '153.00' });
  return {
    canonicalProgramId: canonical.id as string,
    intakeId,
    intakeName,
    programName: canonical.name as string,
  };
}

async function loginStudent(page: Page): Promise<{ email: string; csrf: string }> {
  const { ctx, email, password } = await registerAndLoginStudent();
  await ctx.dispose();
  const login = await page.request.post('/api/v1/auth/login/', { data: { email, password } });
  const csrf = login.headers()['x-csrf-token'] || '';
  return { email, csrf };
}

test('diagnostic hydration race', async ({ page }) => {
  test.setTimeout(300_000);
  const t0 = Date.now();
  const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  const lines: string[] = [];
  const log = (s: string) => {
    lines.push(`[${at()}] ${s}`);
    console.log(`DIAG [${at()}] ${s}`);
  };

  page.on('request', (req) => {
    const u = req.url();
    if (!u.includes('/api/v1/')) return;
    if (u.includes('/applications') || u.includes('/documents') || u.includes('/grades')) {
      let body = '';
      try {
        body = (req.postData() || '').slice(0, 260);
      } catch {
        body = '';
      }
      log(`REQ  ${req.method()} ${u.replace('http://localhost:8090', '')} ${body}`);
    }
  });
  page.on('response', (res) => {
    const u = res.url();
    if (!u.includes('/api/v1/')) return;
    if (res.status() >= 400) log(`RESP ${res.status()} ${res.request().method()} ${u.replace('http://localhost:8090', '')}`);
  });
  page.on('console', (msg) => {
    const text = msg.text();
    if (/DIAG|Draft|draft|hydrat|Restor|rror/.test(text)) log(`CONSOLE ${msg.type()}: ${text.slice(0, 400)}`);
  });

  const offering = await configureOffering('Diag');
  const { email, csrf } = await loginStudent(page);
  const { applicationId } = await createDraftApplication(page.request, csrf, {
    canonicalProgramId: offering.canonicalProgramId,
    intakeId: offering.intakeId,
    email,
  });
  log(`draft created ${applicationId}`);

  await page.goto(`/student/application-wizard?mode=resume&draftId=${applicationId}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByTestId('education-step')).toBeVisible({ timeout: 60_000 });
  log('education-step visible');

  await page.getByRole('button', { name: /^(previous|go back to )/i }).first().click();
  const town = page.getByLabel(/town|city/i).first();
  await expect(town).toBeVisible({ timeout: 60_000 });
  log('personal step visible');

  await page.getByLabel(/full name/i).first().fill('Characterisation Student');
  await page.getByLabel(/nrc number/i).first().fill('123456/78/9');
  await page.getByLabel(/date of birth/i).first().fill('2004-05-04');
  const emailField = page.getByLabel(/email address/i).first();
  if (!(await emailField.inputValue())) await emailField.fill(email);
  await page.getByLabel(/phone number/i).first().fill('+260971234567');
  await town.fill('Kabwe');
  log('typed; town=Kabwe');

  // Watch the field for 14 s.
  for (let i = 0; i < 28; i += 1) {
    await page.waitForTimeout(500);
    const values = await page.evaluate(() => {
      const v = (name: string) => {
        const el = document.querySelector<HTMLInputElement>(`[name="${name}"]`);
        return el ? el.value : '<absent>';
      };
      return {
        town: v('residence_town'),
        nrc: v('nrc_number'),
        phone: v('phone'),
        name: v('full_name'),
        heading: document.querySelector('h1,h2')?.textContent?.slice(0, 40) ?? '',
      };
    });
    log(`FORM town=${values.town} nrc=${values.nrc} phone=${values.phone} name=${values.name} h=${values.heading}`);
  }

  const readDiag = () => page.evaluate(() => {
    const all = ((globalThis as Record<string, unknown>).__DIAG as string[]) ?? [];
    const armed = all.filter((l) => l.includes('interval armed')).length;
    const renders = ((globalThis as Record<string, unknown>).__DIAG_RENDERS as { n: number } | undefined)?.n ?? -1;
    return { total: all.length, armed, renders, interesting: all.filter((l) => !l.includes('interval armed')) };
  });
  const before = await readDiag();
  log(`__DIAG before save renders=${before.renders} total=${before.total} armed=${before.armed} interesting=${JSON.stringify(before.interesting.slice(-12))}`);

  const saveButtons = page.getByRole('button', { name: /save now/i });
  log(`save-now matches: ${await saveButtons.count()}`);
  for (let i = 0; i < (await saveButtons.count()); i += 1) {
    log(`  [${i}] ${(await saveButtons.nth(i).evaluate((el) => el.outerHTML)).slice(0, 200)}`);
  }
  await saveButtons.first().click();
  log('clicked save now');
  await page.waitForTimeout(2000);
  const mid = await readDiag();
  log(`__DIAG mid total=${mid.total} interesting=${JSON.stringify(mid.interesting.slice(-6))}`);
  // Second attempt: dispatch the DOM click directly, bypassing hit-testing.
  await saveButtons.first().evaluate((el: HTMLElement) => el.click());
  log('dispatched el.click()');
  await page.waitForTimeout(2000);
  const after = await readDiag();
  log(`__DIAG after save renders=${after.renders} total=${after.total} armed=${after.armed} interesting=${JSON.stringify(after.interesting.slice(-12))}`);
  for (let i = 0; i < 20; i += 1) {
    await page.waitForTimeout(1000);
    const resp = await page.request.get(`/api/v1/applications/${applicationId}/`);
    const body = (await resp.json()) as { data?: Record<string, unknown> };
    const payload = (body.data ?? body) as Record<string, unknown>;
    const app = (payload.application ?? payload) as Record<string, unknown>;
    const formValues = await page.evaluate(() => {
      const v = (name: string) => document.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? '<absent>';
      return `${v('residence_town')}|${v('nrc_number')}|${v('phone')}`;
    });
    log(`SERVER town=${String(app.residence_town)} nrc=${String(app.nrc_number)} phone=${String(app.phone)} || FORM ${formValues}`);
    if (app.residence_town === 'Kabwe') {
      log('SERVER CONVERGED');
      break;
    }
  }

  // §2.2's question: does a saved town come back on the next resume?
  await page.goto(`/student/application-wizard?mode=resume&draftId=${applicationId}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByTestId('education-step')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /^(previous|go back to )/i }).first().click();
  await expect(page.getByLabel(/town|city/i).first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  const rehydrated = await page.evaluate(() => {
    const v = (name: string) => document.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? '<absent>';
    return `${v('residence_town')}|${v('nrc_number')}|${v('phone')}|${v('full_name')}`;
  });
  log(`RESUME REHYDRATED town|nrc|phone|name = ${rehydrated}`);

  console.log('\n========= DIAG TIMELINE =========');
  console.log(lines.join('\n'));
  console.log('========= END =========\n');
});

test.afterAll(async () => {
  if (sharedAdmin) {
    const admin = await sharedAdmin;
    await admin.ctx.dispose();
    sharedAdmin = null;
  }
});
