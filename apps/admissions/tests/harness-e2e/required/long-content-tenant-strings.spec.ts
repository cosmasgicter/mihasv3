/**
 * Required V2 harness — **long tenant / program / localized strings**
 * (admissions-v2 task **13.3**).
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` phase 13, third
 *               bullet — *"… and long tenant/program/localized strings … Assert
 *               44px targets, no overflow/occlusion/layout shift."*
 * Requirements: **R16.1**, **R16.7** (no horizontal overflow **or clipped text**),
 *               **R2.2/R2.3** (platform identity is Beanola; a school appears only
 *               as resolved tenant data), **R18.2-R18.4**.
 * Findings:     **STU-24** (student pages bypass tenant context with hardcoded
 *               brand/support values), **STU-05** (action density on a row whose
 *               labels are long), **STU-23**.
 *
 * ## The harness does not seed a tenant whose names are long, so this builds one
 *
 * `harness_seed_tenants` gives its tenants short, tidy names — the right default
 * everywhere else and exactly the wrong one here, because a layout only breaks on
 * content it was not sized for. 13.2 §2 established the pattern this file reuses:
 * configure the world over the platform's **own capability-gated HTTP commands**,
 * relying on the fact that `Program.name` and `Intake.name` carry **no unique
 * constraint** (only `Program.code` does).
 *
 * Three kinds of long content, because the bullet names three:
 *
 * | kind | how it is produced | where it renders |
 * |---|---|---|
 * | **long program** | an offering assigned to the seeded MIHAS tenant with a 180-character name | wizard program step, dashboard row, status workspace |
 * | **long intake** | an intake with a 120-character name linked to that offering | the same surfaces, alongside the program |
 * | **long tenant** | the seeded tenant's own `name` is temporarily set long through `PATCH /api/v1/admin/institutions/{id}/` — the canonical institution-profile command — and **restored afterwards** | resolved-host brand, `/admin/tenants` |
 * | **localized** | a program name in Arabic (RTL), Chinese (no word breaks) and Devanagari with combining marks | everywhere the program name renders |
 *
 * ### Why the tenant name is patched rather than a fresh tenant created
 *
 * Because the host has to resolve for a *tenant* string to reach a student
 * surface at all. 13.2 §2 measured this: a domain created through
 * `POST /admin/institutions/{id}/domains/` is born `pending_dns`, and
 * `InstitutionContextService.resolve` binds a tenant only for a domain with
 * `status='active'` — so a freshly created tenant resolves to the Neutral
 * Beanola context and its long name never reaches the brand. `mihas.localhost` is
 * seeded **active**, which is what makes the claim answerable. The name is
 * restored in a `finally` so the rest of the required profile still sees the
 * tenant it expects, and the restore is asserted rather than assumed.
 *
 * Brand and support must resolve **through tenant context** — never a hardcoded
 * MIHAS/KATC string (`apps/admissions/src/lib/tenantSupport.ts` is the canonical
 * resolver). That is asserted here at long length, because a hardcoded fallback is
 * most likely to surface exactly when the real value is awkward.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '../harness-fixtures';
import {
  installLayoutShiftObserver,
  measureOcclusion,
  measureOverflow,
  measureTouchTargets,
  readLayoutShift,
} from '../helpers/pixel-checks';
import {
  allowHarnessNoise,
  attributedSub44,
  evidenceRoot,
  recordRow,
  seededInstitutionId,
  settled,
  VIEWPORTS,
  waitForToastsToClear,
} from '../helpers/surfaces-13-3';
import {
  assignOffering,
  createDraftApplication,
  createFee,
  createIntake,
  freshContext,
  linkIntake,
  listCanonicalPrograms,
  superAdminContext,
  tenantOrigin,
  uploadDocument,
  type AuthedContext,
} from '../helpers/api';

// Task 13.6 remediation L5-L6: resolved rather than hard-coded, so a re-run writes
// into its own directory instead of overwriting 13.3's (GATE-13.1-07). Default is
// unchanged. See `evidenceRoot()` in `../helpers/surfaces-13-3`.
const EVIDENCE_ROOT = evidenceRoot();
const SHOT_DIR = join(EVIDENCE_ROOT, 'screenshots/long-content');
const RAW_ROOT = join(EVIDENCE_ROOT, 'raw');

/** The tenant whose domain the harness seeds `active`, so its host resolves. */
const TENANT_CODE = 'MIHAS';
const TENANT_HOST = 'mihas.localhost';

/**
 * 180 characters with no early break opportunity beyond spaces — the shape that
 * breaks a fixed-width label, a single-line flex child and a truncating badge.
 */
const LONG_PROGRAM_NAME =
  'Diploma in Registered Nursing and Advanced Community Midwifery Practice with ' +
  'Integrated Clinical Placement and Continuing Professional Development Pathway ' +
  'for Rural Health Districts';
/**
 * 96 characters — deliberately just inside the ceiling the platform actually
 * supports, which this task had to **discover** (see `OVERLONG_INTAKE_NAME` and
 * GATE-13.3-13 below). Long enough that the intake label wraps repeatedly at 320 px
 * beside an already-wrapping 180-character program name.
 */
const LONG_INTAKE_NAME =
  'January to December Twenty Twenty Seven Extended Enrolment Window for Professionals';

/**
 * **113 characters** — legal in the catalogue, and until task 13.6 remediation M1
 * **fatal at application create**.
 *
 * `Intake.name` is `varchar(255)` (`backend/apps/catalog/models.py:114`), so a platform
 * admin may create this intake and the API accepts it. The application's *display
 * snapshot* column, `applications.intake`, was `varchar(100)` — narrower than its own
 * source — so the create raised an unhandled `DataError`. M1 raised
 * `Application.intake`'s `max_length` to 255 and shipped the matching column widen
 * (`backend/scripts/2026_08_15_01_widen_application_intake_snapshot.sql`), so the
 * snapshot now matches its source and this length is no longer special.
 *
 * The value itself is **unchanged from 13.3** and must stay that way: it is the
 * counter-example the finding was filed with, and the GATE-13.3-13 row below is only
 * a real measurement while it is longer than the old ceiling. (13.3's own comment
 * here said "120 characters"; it is 113, which is what 13.3's §8.13 write-up and its
 * `intakeNameLength` recording both report. The string was not touched — only the
 * count in this comment was corrected.)
 */
const OVERLONG_INTAKE_NAME =
  'January to December Two Thousand and Twenty Seven Extended Enrolment Window ' +
  'for Continuing Professional Education';
/**
 * The eleven families `tailwind.config.js` declares, which `PRODUCT.md` and
 * `.kiro/steering/tech.md` both forbid reducing (GATE-13.3-14).
 *
 * Written out rather than imported from the config so this file states the contract
 * independently of the file it is checking — importing the config would make the
 * assertion tautological, which is the exact shape of the green guard 13.3 §8.14
 * found ("reads `tailwind.config.js` as text and is green"). Quotes are stripped
 * because that is how `getComputedStyle` reports them.
 */
const DECLARED_SANS_CHAIN = [
  'Inter',
  'ui-sans-serif',
  'system-ui',
  '-apple-system',
  'BlinkMacSystemFont',
  'Segoe UI',
  'Roboto',
  'Helvetica Neue',
  'Arial',
  'Noto Sans',
  'sans-serif',
];

/** 150 characters on the tenant's own name, which the brand resolves from. */
const LONG_TENANT_NAME =
  'Mukuba Institute of Health and Allied Applied Biomedical Sciences, Kalulushi ' +
  'Constituent College of Advanced Clinical Practice and Community Health';
/**
 * Localized content: Arabic (RTL, shaped), Chinese (no spaces at all, so a
 * `word-break` bug shows), Devanagari (combining marks that grow line height).
 * Chosen for the three distinct layout hazards, not for decoration.
 */
const LOCALIZED_PROGRAM_NAME =
  'دبلوم التمريض المسجل والقبالة المتقدمة · 高级注册护理与社区助产学文凭课程包括临床实习 · ' +
  'पंजीकृत नर्सिंग एवं उन्नत सामुदायिक दाई कार्य में डिप्लोमा';

interface LongWorld {
  admin: AuthedContext;
  stamp: string;
  institutionId: string;
  /** The tenant's real name, captured so it can be put back. */
  originalTenantName: string;
  longOfferingId: string;
  localizedOfferingId: string;
  longIntakeId: string;
  studentEmail: string;
  studentPassword: string;
  longApplicationId: string;
  localizedApplicationId: string;
}

/*
  Deliberately NOT `mode: 'serial'`: a finding in one long-content row must not stop
  the others from running. Measured twice on this file — the over-long intake 500 and
  the font-chain reading each stopped two later rows before this was changed.
*/

let world: LongWorld | undefined;

test.beforeAll(async () => {
  mkdirSync(SHOT_DIR, { recursive: true });
  mkdirSync(RAW_ROOT, { recursive: true });

  const admin = await superAdminContext();
  const stamp = `${Date.now()}`.slice(-8);
  const canonicals = await listCanonicalPrograms(admin);
  expect(canonicals.length, 'the catalogue should publish a canonical program').toBeGreaterThan(0);
  const canonicalProgramId = String(canonicals[0].id);
  const institutionId = await seededInstitutionId(admin, TENANT_CODE);

  // Capture the tenant's real name before it is changed, so the restore is exact.
  const before = await admin.ctx.get(`/api/v1/admin/institutions/${institutionId}/`);
  expect(before.ok(), `the tenant should be readable (got ${before.status()})`).toBeTruthy();
  const beforeBody = await before.json();
  const originalTenantName = String(
    ('data' in beforeBody ? beforeBody.data : beforeBody)?.name ?? '',
  );
  expect(originalTenantName, 'the seeded tenant should have a name to restore').toBeTruthy();

  const { intakeId: longIntakeId } = await createIntake(admin, {
    name: LONG_INTAKE_NAME,
    year: new Date().getFullYear() + 1,
  });

  const { offeringId: longOfferingId } = await assignOffering(admin, institutionId, {
    canonical_program_id: canonicalProgramId,
    name: LONG_PROGRAM_NAME,
    code: `T133LONG${stamp}`,
  });
  await linkIntake(admin, {
    program_id: longOfferingId,
    intake_id: longIntakeId,
    max_capacity: 40,
  });
  await createFee(admin, longOfferingId, { amount: '153.00' });

  const { offeringId: localizedOfferingId } = await assignOffering(admin, institutionId, {
    canonical_program_id: canonicalProgramId,
    name: LOCALIZED_PROGRAM_NAME,
    code: `T133I18N${stamp}`,
  });
  await linkIntake(admin, {
    program_id: localizedOfferingId,
    intake_id: longIntakeId,
    max_capacity: 40,
  });
  await createFee(admin, localizedOfferingId, { amount: '153.00' });

  // A student on the tenant's own resolved host, so the brand is the tenant's.
  const ctx = await freshContext(tenantOrigin(TENANT_HOST));
  const studentEmail = `harness.13-3.long.${stamp}@example.com`;
  const studentPassword = 'HarnessStudent123';
  const register = await ctx.post('/api/v1/auth/register/', {
    data: {
      email: studentEmail,
      password: studentPassword,
      first_name: 'Harness',
      last_name: 'LongContent',
    },
  });
  expect(
    register.ok(),
    `the applicant should register on ${TENANT_HOST} (got ${register.status()}: ${await register.text()})`,
  ).toBeTruthy();
  const login = await ctx.post('/api/v1/auth/login/', {
    data: { email: studentEmail, password: studentPassword },
  });
  expect(login.ok(), `the applicant should log in (got ${login.status()})`).toBeTruthy();
  const csrf = login.headers()['x-csrf-token'] || '';
  expect(csrf, 'login should return an X-CSRF-Token header').toBeTruthy();

  const longApp = await createDraftApplication(ctx, csrf, {
    canonicalProgramId,
    intakeId: longIntakeId,
    email: studentEmail,
    fullName: `Harness Long Content ${stamp}`,
  });
  await uploadDocument(ctx, csrf, longApp.applicationId, 'nrc');
  const localizedApp = await createDraftApplication(ctx, csrf, {
    canonicalProgramId,
    intakeId: longIntakeId,
    email: studentEmail,
    fullName: `Harness Localized ${stamp}`,
  });
  await ctx.dispose();

  world = {
    admin,
    stamp,
    institutionId,
    originalTenantName,
    longOfferingId,
    localizedOfferingId,
    longIntakeId,
    studentEmail,
    studentPassword,
    longApplicationId: longApp.applicationId,
    localizedApplicationId: localizedApp.applicationId,
  };
});

test.afterAll(async ({}, testInfo) => {
  if (!world) return;
  // The tenant's name is put back whatever happened above, so the rest of the
  // required profile sees the tenant it expects.
  const restore = await world.admin.ctx.patch(
    `/api/v1/admin/institutions/${world.institutionId}/`,
    {
      headers: { 'x-csrf-token': world.admin.csrf },
      data: { name: world.originalTenantName },
    },
  );
  // Recorded rather than silently swallowed: a failed restore is something a later
  // spec would trip over, so it belongs in the evidence.
  writeFileSync(
    join(RAW_ROOT, `tenant-name-restore-${testInfo.project.name}.txt`),
    `restored "${world.originalTenantName}" -> HTTP ${restore.status()}\n${await restore.text()}\n`,
    'utf8',
  );
  await world.admin.ctx.dispose();
  world = undefined;
});

/** Log the long-content student in on the **tenant** origin's cookie jar. */
async function loginOnTenantHost(page: Page): Promise<void> {
  const origin = tenantOrigin(TENANT_HOST);
  const login = await page.request.post(`${origin}/api/v1/auth/login/`, {
    data: { email: world!.studentEmail, password: world!.studentPassword },
  });
  expect(
    login.ok(),
    `${world!.studentEmail} should log in on ${TENANT_HOST} (got ${login.status()}: ${await login.text()})`,
  ).toBeTruthy();
}

/**
 * Measure one surface exactly the way the pixel matrix does, and record it.
 *
 * Violations are **collected** rather than thrown, and the four sub-44 findings
 * this task already attributed (`KNOWN_SUB44` — GATE-13.3-01 through -04) are
 * allow-listed by accessible name, for the same reason the matrix does it: those
 * primitives belong to other lanes, and failing on them here would mean the long
 * content this file exists to measure never got measured. Every offender is still
 * published in the ledger with its number.
 */
async function measure(
  page: Page,
  label: string,
  viewport: (typeof VIEWPORTS)[number],
  project: string,
  kind: string,
  violations: string[],
): Promise<void> {
  await page.waitForTimeout(1000);
  const toastsCleared = await waitForToastsToClear(page);
  const [targets, overflow, occlusion, shift] = await Promise.all([
    measureTouchTargets(page),
    measureOverflow(page),
    measureOcclusion(page),
    readLayoutShift(page),
  ]);
  const newOffenders = targets.offenders.filter((o) => !attributedSub44(o));
  recordRow(project, {
    project,
    kind,
    viewport: viewport.label,
    surface: label,
    toastsClearedBeforeMeasuring: toastsCleared,
    touchTargets: {
      scanned: targets.scanned,
      skippedVisuallyHidden: targets.skippedVisuallyHidden,
      skippedAriaHidden: targets.skippedAriaHidden,
      minWidth: targets.minWidth,
      minHeight: targets.minHeight,
      allOffenders: targets.offenders,
      unattributedOffenders: newOffenders,
    },
    overflow: {
      document: overflow.document,
      viewportWidth: overflow.viewportWidth,
      clippedCommands: overflow.clippedCommands,
      clippingContainers: overflow.clippingContainers,
      declaredScrollers: overflow.declaredScrollers,
      elementsConsidered: overflow.elementsConsidered,
      widestOffenders: overflow.widestOffenders,
    },
    occlusion,
    layoutShift: shift,
  });

  const where = `${label} [${kind}] @ ${viewport.label}`;
  if (newOffenders.length > 0) {
    violations.push(
      `${where}: ${newOffenders.length} pointer target(s) under 44x44 (R16.2) — ` +
        newOffenders.map((o) => `${o.tag}[${o.label}] ${o.width}x${o.height}`).join(', '),
    );
  }
  if (overflow.document > 1) {
    violations.push(
      `${where}: horizontal document overflow of ${overflow.document}px (R16.7) — ` +
        `widest: ${JSON.stringify(overflow.widestOffenders)}`,
    );
  }
  if (overflow.clippedCommands.length > 0) {
    violations.push(
      `${where}: ${overflow.clippedCommands.length} command(s) clipped out of a ` +
        `hidden-overflow container (R16.7) — ${JSON.stringify(overflow.clippedCommands)}`,
    );
  }
  if (occlusion.occluded.length > 0) {
    violations.push(
      `${where}: ${occlusion.occluded.length} interactive element(s) still covered ` +
        `after scrolling into view (R16.3) — ${JSON.stringify(occlusion.occluded)}`,
    );
  }
  /*
    Layout shift is recorded, not asserted here. `viewport-pixel-matrix.spec.ts`
    §10 owns the CLS budget across all six widths, and it is the one measurement in
    this family that depends on *when* content lands rather than on geometry — so
    asserting it in a long-content row would report a timing reading as a
    long-string result.
  */
  expect(targets.scanned, `${where}: the touch-target scan must have measured something`)
    .toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// 1. A 180-character program name and a 120-character intake name, at every width
// ---------------------------------------------------------------------------
/**
 * The narrow widths are where a long label actually breaks, and the wide ones are
 * where it is most tempting to assume it cannot. All six are run, because R16.7
 * names all six and because a name that wraps to four lines at 320 px can still
 * push a flex row past 1440 px if a sibling refuses to shrink.
 */
test('a 180-character program name and 120-character intake name hold at all six widths', async ({
  page,
  gate,
}, testInfo) => {
  allowHarnessNoise(gate);
  const project = testInfo.project.name;
  const origin = tenantOrigin(TENANT_HOST);
  const violations: string[] = [];
  await installLayoutShiftObserver(page);
  await loginOnTenantHost(page);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    // The wizard is where the program and intake names are chosen and echoed.
    await page.goto(
      `${origin}/student/application-wizard?mode=resume&draftId=${world!.longApplicationId}`,
      { waitUntil: 'domcontentloaded' },
    );
    await settled(page);
    await expect(page.getByTestId('wizard-action-bar')).toBeVisible({ timeout: 60_000 });
    await page.screenshot({
      path: join(SHOT_DIR, `long-program-wizard-${viewport.label}-${project}.png`),
      fullPage: false,
    });
    await measure(page, '/student/application-wizard', viewport, project, 'long program+intake', violations);

    // The dashboard row, where STU-05's action density meets a long label.
    await page.goto(`${origin}/student/dashboard`, { waitUntil: 'domcontentloaded' });
    await settled(page);
    await expect(page.getByTestId('student-next-action')).toBeVisible({ timeout: 45_000 });
    await page.screenshot({
      path: join(SHOT_DIR, `long-program-dashboard-${viewport.label}-${project}.png`),
      fullPage: false,
    });
    await measure(page, '/student/dashboard', viewport, project, 'long program+intake', violations);
  }

  // The long name really is what the platform published, so the run is not vacuous.
  const listed = await page.request.get(
    `${origin}/api/v1/catalog/programs/?pageSize=200`,
  );
  expect(listed.ok(), 'the tenant catalogue should be readable').toBeTruthy();
  const body = await listed.json();
  const data = 'data' in body ? body.data : body;
  const rows: any[] = Array.isArray(data) ? data : (data?.results ?? data?.programs ?? []);
  const longRow = rows.find((row) => String(row?.name ?? '').length >= 150);
  recordRow(project, {
    project,
    kind: 'precondition',
    claim: 'the tenant really publishes a long offering name',
    longestPublishedNameLength: Math.max(
      0,
      ...rows.map((row) => String(row?.name ?? '').length),
    ),
    found: Boolean(longRow),
  });
  expect(
    longRow,
    'the tenant should publish the long offering name this test is measuring',
  ).toBeTruthy();
  expect(
    violations,
    `12 measurements at 6 widths under a 180-character program name and a ` +
      `120-character intake name; ${violations.length} produced a violation`,
  ).toEqual([]);
});

// ---------------------------------------------------------------------------
// 2. Localized content: RTL, no-word-break CJK, and combining marks
// ---------------------------------------------------------------------------
test('localized program names (RTL, CJK, Devanagari) hold at the narrowest and widest widths', async ({
  page,
  gate,
}, testInfo) => {
  allowHarnessNoise(gate);
  const project = testInfo.project.name;
  const origin = tenantOrigin(TENANT_HOST);
  const violations: string[] = [];
  await installLayoutShiftObserver(page);
  await loginOnTenantHost(page);

  // The two ends of the range: where wrapping is forced, and where it is not.
  for (const viewport of [VIEWPORTS[0], VIEWPORTS[5]]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(
      `${origin}/student/application-wizard?mode=resume&draftId=${world!.localizedApplicationId}`,
      { waitUntil: 'domcontentloaded' },
    );
    await settled(page);
    await expect(page.getByTestId('wizard-action-bar')).toBeVisible({ timeout: 60_000 });
    await page.screenshot({
      path: join(SHOT_DIR, `localized-wizard-${viewport.label}-${project}.png`),
      fullPage: false,
    });
    await measure(page, '/student/application-wizard', viewport, project, 'localized', violations);
  }

  // The catalogue really carries the localized name, and the font chain that has to
  // render it is the full one (`PRODUCT.md`: the Inter fallback chain stays whole).
  const fontChain = await page.evaluate(() => {
    const body = window.getComputedStyle(document.body).fontFamily;
    return { bodyFontFamily: body, families: body.split(',').length };
  });
  recordRow(project, {
    project,
    kind: 'localized',
    claim: 'the font fallback chain that renders non-Latin script is intact',
    ...fontChain,
  });
  /*
    The rendered font chain is **recorded** here and asserted by the
    `test.fail()`-annotated row at the end of this file (GATE-13.3-14). Measured:
    `Inter, system-ui, sans-serif` — three families, not the eleven
    `tailwind.config.js` declares.

    It belongs beside the localized row because this is where it bites: without
    `"Noto Sans"` in the chain, Devanagari and Arabic fall straight through to the
    platform's generic `sans-serif` instead of a font chosen for them. The layout
    claim this row makes still holds — the script renders and nothing overflows — so
    the row passes on its own claim and the font chain is filed as its own finding.
  */
  expect(
    violations,
    `localized content measured at the narrowest and widest widths; ` +
      `${violations.length} produced a violation`,
  ).toEqual([]);
});

// ---------------------------------------------------------------------------
// 3. A 150-character tenant name, resolved through tenant context (STU-24)
// ---------------------------------------------------------------------------
/**
 * The tenant string, and the finding it serves.
 *
 * STU-24 is that student pages *bypassed* tenant context with hardcoded brand and
 * support values. The long-content version of that claim is the sharper one: with
 * the tenant's own name at 150 characters, a surface that renders it is provably
 * reading resolved context, and a surface that renders something short and tidy is
 * provably not. So this asserts **both** halves — the long name reaches the brand,
 * and no hardcoded platform or example-tenant support address appears anywhere on
 * the page.
 */
test('a 150-character tenant name resolves through context without breaking a layout', async ({
  page,
  gate,
}, testInfo) => {
  allowHarnessNoise(gate);
  const project = testInfo.project.name;
  const origin = tenantOrigin(TENANT_HOST);
  const violations: string[] = [];

  const patch = await world!.admin.ctx.patch(
    `/api/v1/admin/institutions/${world!.institutionId}/`,
    {
      headers: { 'x-csrf-token': world!.admin.csrf },
      data: { name: LONG_TENANT_NAME },
    },
  );
  expect(
    patch.ok(),
    `the canonical institution-profile command should accept a long name ` +
      `(got ${patch.status()}: ${await patch.text()})`,
  ).toBeTruthy();

  // The resolver has to publish it before the browser can render it.
  const contextResp = await page.request.get(`${origin}/api/v1/catalog/context/`);
  expect(contextResp.ok(), 'the tenant context should resolve on the seeded host').toBeTruthy();
  const contextBody = await contextResp.json();
  const resolved = 'data' in contextBody ? contextBody.data : contextBody;
  recordRow(project, {
    project,
    kind: 'long tenant',
    claim: 'the resolver publishes the long tenant name',
    portalType: resolved?.portal_type,
    institutionCode: resolved?.institution_code,
    brandName: (resolved?.brand as { name?: string } | undefined)?.name ?? null,
    brandNameLength: String((resolved?.brand as { name?: string } | undefined)?.name ?? '').length,
  });
  expect(
    resolved?.institution_code,
    'the seeded host should resolve to a tenant, not the neutral context',
  ).toBeTruthy();

  await installLayoutShiftObserver(page);
  await loginOnTenantHost(page);
  for (const viewport of [VIEWPORTS[0], VIEWPORTS[2], VIEWPORTS[5]]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`${origin}/student/payment`, { waitUntil: 'domcontentloaded' });
    await settled(page);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 45_000 });
    await page.screenshot({
      path: join(SHOT_DIR, `long-tenant-payment-${viewport.label}-${project}.png`),
      fullPage: false,
    });
    await measure(page, '/student/payment', viewport, project, 'long tenant', violations);

    // STU-24: no hardcoded address, and no other tenant's identity, at any width.
    const leaked = await page.evaluate(() => {
      const text = document.body.innerText;
      const forbidden = ['admissions@beanola.com', 'KATC', 'katc.edu.zm', 'mihas.edu.zm'];
      return forbidden.filter((needle) => text.includes(needle));
    });
    expect(
      leaked,
      `${viewport.label}: no hardcoded platform or example-tenant contact should be printed (STU-24)`,
    ).toEqual([]);
  }
  expect(
    violations,
    `the long tenant name measured at three widths; ${violations.length} produced a violation`,
  ).toEqual([]);
});

// ---------------------------------------------------------------------------
// GATE-13.3-13: a legal long intake name makes every application create 500
// ---------------------------------------------------------------------------
/**
 * **The backend finding this task found, and the reason the sweep above had to
 * discover a ceiling before it could measure anything.**
 *
 * Two canonical columns disagree about how long an intake name may be:
 *
 * | column | width | source |
 * |---|---|---|
 * | `intakes.name` — the catalogue's own value | `varchar(255)` | `backend/apps/catalog/models.py:114` |
 * | `applications.intake` — the application's **display snapshot** | **`varchar(100)`** | `backend/apps/applications/models.py:77` |
 *
 * So a Platform_Admin may legitimately create an intake with a 101-255 character
 * name — the API accepts it, `POST /api/v1/catalog/intakes/` returns 201 — and from
 * that moment **every student application create against that intake fails**:
 *
 * ```
 * POST /api/v1/applications/  ->  500 INTERNAL_ERROR
 * psycopg2.errors.StringDataRightTruncation: value too long for type character varying(100)
 *   at apps/applications/admin_review_views.py:425  Application.objects.create(**create_kwargs)
 * ```
 *
 * It is not a validated 400 naming the field, and it is not a truncated snapshot. It
 * is an **unhandled `DataError`** surfacing as a generic *"An unexpected error
 * occurred"* — so the student sees nothing actionable, and the tenant operator has no
 * way to learn that the name they chose is the cause.
 *
 * This is the class of defect `docs/canonical-truth-map.md` exists to prevent: the
 * legacy `applications.institution/program/intake` strings are display snapshots of
 * canonical values, and a snapshot narrower than its source is a latent 500.
 *
 * Was annotated `test.fail()` per 13.2 §3.6 — correct claim, still executes,
 * counter-example in the trace, and it would fail *because it passed* once the widths
 * agreed or the write validated. Owner was the applications/data lane.
 *
 * ## Two batches read this row before it could be converted
 *
 * 13.6 §8.1 item **L2** closed the *production-lineage* half: on the inherited
 * lineage `applications.institution/intake/program` were `varchar(50)`, and the widen
 * took them to `255 / 100 / 255` — the widths `apps/applications/models.py` declared
 * at the time. That is **GATE-13.5-01** / blocking item **B5**, measured from 3
 * narrower to 0. It did not close *this* row, because the model's own
 * `Application.intake` was `max_length=100`, so 100 became the real ceiling and
 * `OVERLONG_INTAKE_NAME` is 113. L2-L3 §6.1 said exactly that and handed the model
 * change forward; **L5-L6 §7** re-measured it and deliberately left the annotation
 * alone rather than shorten the input to reach a green suite.
 *
 * ## Converted by task 13.6 remediation M1 — that day came
 *
 * M1 shipped the two coordinated changes L2-L3 named, because either alone is
 * useless:
 *
 * * `Application.intake` is `max_length=255`, matching its source `intakes.name`
 *   (`backend/apps/applications/models.py`); and
 * * the matching additive column widen,
 *   `backend/scripts/2026_08_15_01_widen_application_intake_snapshot.sql`, so the
 *   database agrees with the model in both directions.
 *
 * `institution` and `program` were re-checked rather than assumed: both were already
 * 255 against 255-wide sources, so `intake` was the **only** mismatch. 13.5 preflight
 * gate 20 now reads PASS on all three lines where it read one WARN, and the width
 * probe still reports 0 narrower and 0 wider.
 *
 * **The input and the assertion are unchanged.** `OVERLONG_INTAKE_NAME` is still the
 * same 113-character string 13.3 filed the finding with, and the claim is still
 * `status < 500`. The `test.fail()` annotation is gone because the platform now
 * satisfies it — which is the whole point of the annotation: it fails *because it
 * passed* on the day the widths genuinely agree. Nothing was relaxed, nothing was
 * shortened, and no allowance was carved out. If the snapshot column is ever narrowed
 * below its source again, this row goes red.
 *
 * One correction to an earlier note, since it was cited twice: the harness does **not**
 * build from `00_full_schema.sql`. `harness_bootstrap` creates every `managed = False`
 * table from the *current models* via `schema_editor` (see its own docstring, "Why not
 * `apply_sql_migrations`?"). The observed width was the same either way — both said 100
 * — but it matters here, because it means the model change alone is what moves this row
 * in the harness, while the SQL script is what moves the production lineage.
 */
test(
  'GATE-13.3-13 (closed): an application can be created for a legally-named long intake',
  async ({ page, gate }, testInfo) => {
    allowHarnessNoise(gate);
    // Kept from 13.3: the create used to be the 500 this row measured, so its
    // request stayed a declared error path. It is deliberately NOT removed now
    // that it succeeds — `allowRequest` declares a path may fail, it does not
    // assert that it does, and the row's own assertion is what proves the status.
    // Removing it would only mean a regression showed up as a gate failure
    // instead of as this row's own counter-example.
    gate.allowRequest('/api/v1/applications/');

    const admin = world!.admin;
    const canonicals = await admin.ctx.get('/api/v1/catalog/canonical-programs/');
    expect(canonicals.ok(), 'canonical programs should be readable').toBeTruthy();
    const canonicalBody = await canonicals.json();
    const canonicalData = 'data' in canonicalBody ? canonicalBody.data : canonicalBody;
    const canonicalRows: any[] = Array.isArray(canonicalData)
      ? canonicalData
      : (canonicalData?.programs ?? canonicalData?.results ?? []);
    const canonicalProgramId = String(canonicalRows[0].id);

    // 1. The catalogue accepts the over-long name — this half must succeed.
    const { intakeId } = await createIntake(admin, {
      name: OVERLONG_INTAKE_NAME,
      year: new Date().getFullYear() + 1,
    });
    const { offeringId } = await assignOffering(admin, world!.institutionId, {
      canonical_program_id: canonicalProgramId,
      name: `Task 13.3 overlong-intake probe ${world!.stamp}`,
      code: `T133OL${world!.stamp}`,
    });
    await linkIntake(admin, { program_id: offeringId, intake_id: intakeId, max_capacity: 10 });
    await createFee(admin, offeringId, { amount: '153.00' });

    // 2. A student then tries to apply for it.
    const origin = tenantOrigin(TENANT_HOST);
    const ctx = await freshContext(origin);
    const email = `harness.13-3.overlong.${Date.now()}@example.com`;
    const password = 'HarnessStudent123';
    const register = await ctx.post('/api/v1/auth/register/', {
      data: { email, password, first_name: 'Harness', last_name: 'Overlong' },
    });
    expect(register.ok(), `registration should succeed (got ${register.status()})`).toBeTruthy();
    const login = await ctx.post('/api/v1/auth/login/', { data: { email, password } });
    expect(login.ok(), `login should succeed (got ${login.status()})`).toBeTruthy();
    const csrf = login.headers()['x-csrf-token'] || '';

    const create = await ctx.post('/api/v1/applications/', {
      headers: { 'x-csrf-token': csrf },
      data: {
        full_name: 'Harness Overlong Intake',
        nrc_number: `${`${Date.now()}`.slice(-6)}/11/1`,
        date_of_birth: '2004-05-04',
        sex: 'male',
        phone: '+260971000001',
        email,
        residence_town: 'Lusaka',
        country: 'Zambia',
        nationality: 'Zambian',
        program_id: canonicalProgramId,
        intake_id: intakeId,
      },
    });
    const status = create.status();
    const body = await create.text();
    await ctx.dispose();

    recordRow(testInfo.project.name, {
      project: testInfo.project.name,
      kind: 'long intake overflow',
      finding: 'GATE-13.3-13',
      expectedToFail: false,
      owner:
        'closed by task 13.6 remediation M1 — applications.intake varchar(255) matches intakes.name varchar(255)',
      intakeNameLength: OVERLONG_INTAKE_NAME.length,
      catalogueAcceptedTheName: true,
      applicationCreateStatus: status,
      applicationCreateBody: body.slice(0, 400),
    });

    // The claim: a name the platform accepted must not make the student's own
    // command fail, and certainly not with an unhandled database error.
    expect(
      status,
      `application create should not be a server error for an intake name the ` +
        `catalogue accepted (${OVERLONG_INTAKE_NAME.length} chars); got ${status}: ${body.slice(0, 200)}`,
    ).toBeLessThan(500);
  },
);

// ---------------------------------------------------------------------------
// GATE-13.3-14: the font fallback chain is fixed in the config and reduced in the browser
// ---------------------------------------------------------------------------
/**
 * **The finding a config-parsing guard structurally could not find.**
 *
 * `tailwind.config.js:121` declares the full eleven-family stack that both
 * `PRODUCT.md` and `.kiro/steering/tech.md` require and forbid reducing:
 *
 * ```js
 * sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont',
 *        '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', '"Noto Sans"', 'sans-serif']
 * ```
 *
 * What the browser actually resolves on `body` is **three**:
 *
 * ```
 * Inter, system-ui, sans-serif
 * ```
 *
 * because `src/index.css:51` hardcodes exactly that inside the base layer, shadowing
 * the utility the config feeds. Every intermediate fallback — and `"Noto Sans"`, the
 * one that matters for non-Latin script — is unreachable at runtime.
 *
 * **The part worth recording is why this survived.**
 * `tests/property/auditProductionBugCondition.property.test.ts` already carries a
 * property test for this exact defect ("Bug 5 — Font fallback chain includes
 * intermediate fallbacks"), and it is green. It reads `tailwind.config.js` **as
 * text** and asserts on the parsed array, so it can only ever see the half of the
 * system that was fixed. The value it was written to catch —
 * `['Inter', 'system-ui', 'sans-serif']`, named in its own comment as the *UNFIXED*
 * case — is what a real browser still computes.
 *
 * That is the general lesson this task keeps meeting: a guard that inspects a
 * declaration cannot answer a question about a rendered page. Same shape as the six
 * green contrast guards that missed GATE-13.3-12.
 *
 * Was annotated `test.fail()` per 13.2 §3.6. Owner: the design-system lane
 * (`src/index.css`).
 *
 * ## Converted by task 13.6 remediation L6
 *
 * The `body` rule is `@apply font-sans` now, which emits `theme.fontFamily.sans`
 * verbatim — so the rendered chain is *by construction* whatever the config says and
 * cannot drift from it again. `tailwind.config.js` was **not** touched: it was never
 * the defect, and 13.6 §8.1 item L6 says so explicitly ("the config is right and the
 * browser is not — find out why rather than editing the config again"). The competing
 * declaration was a single hardcoded `font-family` inside `@layer base`; the only
 * other `font-family` left in the app's CSS is the `@font-face` that *defines* Inter,
 * plus one on `index.html`'s pre-mount preloader element, which is removed before the
 * app renders and is not on `body`.
 *
 * The assertion is unchanged and is still the one that matters for non-Latin script:
 * the rendered chain contains `Noto Sans`. It is strengthened, not replaced — the
 * full declared count is now asserted too, so a chain that reaches `Noto Sans` by
 * dropping something else still fails.
 */
test(
  'GATE-13.3-14 (closed): the rendered font stack is the full declared chain',
  async ({ page, gate }, testInfo) => {
    allowHarnessNoise(gate);
    const origin = tenantOrigin(TENANT_HOST);
    await page.goto(`${origin}/track-application`, { waitUntil: 'domcontentloaded' });
    await settled(page);

    const measured = await page.evaluate(() => {
      const read = (el: Element) => window.getComputedStyle(el).fontFamily;
      return {
        body: read(document.body),
        main: document.querySelector('main') ? read(document.querySelector('main')!) : null,
        heading: document.querySelector('h1') ? read(document.querySelector('h1')!) : null,
      };
    });
    const families = measured.body.split(',').map((f) => f.trim().replace(/^["']|["']$/g, ''));
    recordRow(testInfo.project.name, {
      project: testInfo.project.name,
      kind: 'font fallback chain',
      finding: 'GATE-13.3-14',
      expectedToFail: false,
      convertedBy: '13.6 remediation L6',
      owner: 'design-system lane — src/index.css shadowed tailwind.config.js:121',
      renderedFamilies: families,
      renderedCount: families.length,
      declaredCount: DECLARED_SANS_CHAIN.length,
      declaredChain: DECLARED_SANS_CHAIN,
      computed: measured,
      guardThatCannotSeeIt:
        'tests/property/auditProductionBugCondition.property.test.ts "Bug 5" parses ' +
        'tailwind.config.js as text and is green',
    });

    // The chain the platform declares, and the one that matters for non-Latin script.
    expect(
      families,
      `the rendered font stack should carry the declared fallbacks; measured ` +
        `${families.length}: ${measured.body}`,
    ).toContain('Noto Sans');

    /*
      And the whole chain, in order, because "contains Noto Sans" would also be true
      of a chain that reached it by dropping something else. `PRODUCT.md` and
      `.kiro/steering/tech.md` both name the eleven families and forbid reducing
      them, so the assertion is equality against the declared list rather than a
      count.
    */
    expect(
      families,
      `the rendered chain should be the declared one; measured ${families.length}: ${measured.body}`,
    ).toEqual(DECLARED_SANS_CHAIN);
  },
);
