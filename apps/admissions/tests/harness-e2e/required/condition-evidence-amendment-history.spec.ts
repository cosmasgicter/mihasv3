/**
 * Required V2 harness — a conditional offer is something a student can act on,
 * and an amendment is something they can track (task 10.2).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 10.2 — "Implement
 * condition evidence and amendment history".
 * Requirements: **R13.2** (the application view shows conditions and amendments
 * with precise dates), **R13.3-R13.4** (a condition message goes through the one
 * delivery gate and lands in the durable communications history), **R13.9**
 * (per-condition evidence / comment / replacement / review / rejection reason /
 * reminders / history), **R13.10** (owner-scoped amendment list/detail status and
 * no second pending request for the same field).
 * Findings: **STU-16**, **STU-17**, **AUTH-06**.
 *
 * This file is the task's `_Evidence:` line: *condition rejection/replacement and
 * amendment approve/reject journeys*. It is also design §16.1's named journey
 * "Conditions/amendments/enrollment — rejection/replacement, duplicate pending".
 *
 * Why the browser is required and not only an endpoint test: **STU-16 is a
 * missing surface.** "A student can send evidence for a condition, be told what
 * was wrong with it, and send a replacement" is a claim about controls that have
 * to exist on screen — before this task the conditions card rendered a
 * description, a deadline and an upper-cased status, with no write path at all. An
 * endpoint test can prove the command works; only the browser can prove the
 * student is offered it. The same holds for STU-17: the amendment *request* form
 * already existed, and the defect was that nothing showed the student what
 * happened to it.
 *
 * The four journeys:
 *
 *   1. **rejection.** The student attaches evidence, a reviewer asks for something
 *      different with a reason, and the student sees that reason on their own page
 *      with a replacement control — not a dead end.
 *   2. **replacement.** The student sends a replacement, version 1 is kept, the
 *      reviewer accepts it, and the condition ends up satisfied.
 *   3. **amendment approved.** A request appears in the student's own history as
 *      pending, is approved by the school, and the student's history says so —
 *      with the new value applied to the application.
 *   4. **amendment rejected + duplicate pending.** A second pending request for
 *      the same field is refused while the first is open, the school declines it,
 *      the student's history says "rejected", and the field is then requestable
 *      again.
 *
 * Runs against the isolated local harness (task 0.4) with the strict gates active
 * (`harness-fixtures.ts`): zero skips, no console errors, no unasserted failed
 * requests. Both the desktop and the mobile project run every journey.
 */
import { test, expect, type APIRequestContext, type Page } from '../harness-fixtures';
import {
  assignOffering,
  createDraftApplication,
  createIntake,
  freshContext,
  linkIntake,
  listCanonicalPrograms,
  superAdminContext,
  type AuthedContext,
} from '../helpers/api';

/** The student's own application workspace (`routeRegistry` student.status alias). */
const APPLICATION_URL = (applicationId: string) => `/application/${applicationId}`;
const CONDITIONS_API = (applicationId: string) =>
  `/api/v1/applications/${applicationId}/conditions/`;
const AMENDMENTS_API = (applicationId: string) =>
  `/api/v1/applications/${applicationId}/amendments/`;

test.describe.configure({ mode: 'serial' });

interface SeededApplicant {
  ctx: APIRequestContext;
  email: string;
  password: string;
  csrf: string;
  applicationId: string;
}

interface SeededWorld {
  admin: AuthedContext;
  institutionId: string;
  canonicalProgramId: string;
  intakeId: string;
  /** The applicant whose conditional offer journeys 1 and 2 walk. */
  conditionApplicant: SeededApplicant;
  /** The condition journeys 1 and 2 act on. */
  conditionId: string;
  /** The applicant whose amendment journeys 3 and 4 walk. */
  amendmentApplicant: SeededApplicant;
}

let seeded: SeededWorld | undefined;

function unwrap(json: any): any {
  return json && typeof json === 'object' && 'data' in json ? json.data : json;
}

/** A 1x1 PNG: real bytes that pass magic-byte validation, with nothing in them. */
function evidenceBytes(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
    'base64',
  );
}

/** Register + log in one applicant and create their draft application. */
async function seedApplicant(
  label: string,
  canonicalProgramId: string,
  intakeId: string,
): Promise<SeededApplicant> {
  const ctx = await freshContext();
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
  const email = `harness.${label}.${stamp}@example.com`;
  const password = 'HarnessStudent123';

  const reg = await ctx.post('/api/v1/auth/register/', {
    data: { email, password, first_name: 'Harness', last_name: label },
  });
  expect(reg.ok(), `${label} should register (got ${reg.status()}: ${await reg.text()})`).toBeTruthy();
  const login = await ctx.post('/api/v1/auth/login/', { data: { email, password } });
  expect(login.ok(), `${label} should log in (got ${login.status()})`).toBeTruthy();
  const csrf = login.headers()['x-csrf-token'] || '';
  expect(csrf, 'login should return an X-CSRF-Token header').toBeTruthy();

  const { applicationId } = await createDraftApplication(ctx, csrf, {
    canonicalProgramId,
    intakeId,
    email,
    fullName: `Harness ${label} ${stamp}`,
  });
  return { ctx, email, password, csrf, applicationId };
}

/** Move an application through the platform's own review command. */
async function review(
  admin: AuthedContext,
  applicationId: string,
  body: Record<string, unknown>,
): Promise<any> {
  const response = await admin.ctx.post(`/api/v1/applications/${applicationId}/review/`, {
    headers: { 'x-csrf-token': admin.csrf },
    data: body,
  });
  expect(
    response.ok(),
    `review ${JSON.stringify(body.new_status)} should succeed (got ${response.status()}: ${await response.text()})`,
  ).toBeTruthy();
  return unwrap(await response.json());
}

async function seedWorld(): Promise<SeededWorld> {
  if (seeded) return seeded;
  const admin = await superAdminContext();
  const stamp = `${Date.now()}`.slice(-8);

  const institutions = unwrap(
    await (await admin.ctx.get('/api/v1/admin/institutions/?pageSize=5')).json(),
  );
  const rows: any[] = Array.isArray(institutions)
    ? institutions
    : Array.isArray(institutions?.results)
      ? institutions.results
      : [];
  const institution = rows[0];
  expect(institution?.id, 'the harness should have at least one institution').toBeTruthy();

  const canonicals = await listCanonicalPrograms(admin);
  expect(
    canonicals.length,
    'the harness catalogue should publish at least one canonical program',
  ).toBeGreaterThan(0);
  const canonicalProgramId = canonicals[0].id;
  const { intakeId } = await createIntake(admin, {
    name: `Condition Evidence Intake ${stamp}`,
    year: new Date().getFullYear() + 1,
  });
  const offering = await assignOffering(admin, institution.id, {
    canonical_program_id: canonicalProgramId,
    name: `Condition Evidence Offering ${stamp}`,
    code: `CE${stamp}`,
  });
  await linkIntake(admin, {
    program_id: offering.offeringId,
    intake_id: intakeId,
    max_capacity: 100,
  });

  const conditionApplicant = await seedApplicant('condition', canonicalProgramId, intakeId);
  const amendmentApplicant = await seedApplicant('amendment', canonicalProgramId, intakeId);

  // A conditional offer is only reachable through the platform's own state
  // machine: draft -> submitted -> under_review -> conditionally_approved with
  // conditions. Nothing is inserted directly — a condition the platform did not
  // assign would prove only that the table exists.
  await review(admin, conditionApplicant.applicationId, {
    new_status: 'submitted',
    notes: 'harness 10.2 condition-journey setup',
  });
  await review(admin, conditionApplicant.applicationId, {
    new_status: 'under_review',
    notes: 'harness 10.2 condition-journey setup',
  });
  const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await review(admin, conditionApplicant.applicationId, {
    new_status: 'conditionally_approved',
    notes: 'harness 10.2 condition-journey setup',
    conditions: [
      {
        description: 'Certified copy of your final transcript',
        condition_type: 'document',
        deadline,
      },
    ],
  });

  // An amendment is a post-submission command, so this applicant only needs to be
  // submitted.
  await review(admin, amendmentApplicant.applicationId, {
    new_status: 'submitted',
    notes: 'harness 10.2 amendment-journey setup',
  });

  const conditionsResponse = await admin.ctx.get(
    CONDITIONS_API(conditionApplicant.applicationId),
  );
  expect(
    conditionsResponse.ok(),
    `conditions read should succeed (got ${conditionsResponse.status()})`,
  ).toBeTruthy();
  const conditions = unwrap(await conditionsResponse.json());
  expect(Array.isArray(conditions) && conditions.length === 1, 'one condition should exist').toBeTruthy();
  const conditionId = conditions[0].id;
  expect(conditions[0].status, 'a fresh condition is open').toBe('pending');

  seeded = {
    admin,
    institutionId: institution.id,
    canonicalProgramId,
    intakeId,
    conditionApplicant,
    conditionId,
    amendmentApplicant,
  };
  return seeded;
}

test.beforeAll(async () => {
  await seedWorld();
});

test.afterAll(async () => {
  if (!seeded) return;
  await seeded.conditionApplicant.ctx.dispose();
  await seeded.amendmentApplicant.ctx.dispose();
});

/** Log the browser context in as a seeded applicant. */
async function loginAs(page: Page, applicant: SeededApplicant): Promise<void> {
  const login = await page.request.post('/api/v1/auth/login/', {
    data: { email: applicant.email, password: applicant.password },
  });
  expect(
    login.ok(),
    `${applicant.email} should log in (got ${login.status()}: ${await login.text()})`,
  ).toBeTruthy();
}

/** Open the student's own application workspace and wait for it to render. */
async function openApplication(page: Page, applicationId: string): Promise<void> {
  await page.goto(APPLICATION_URL(applicationId), { waitUntil: 'domcontentloaded' });
  // The page's own h1 is the application number, which is also the proof that the
  // student's *own* application loaded rather than an empty shell.
  await expect(page.getByRole('heading', { name: /^Application #/ }).first()).toBeVisible({
    timeout: 30_000,
  });
}

/** Attach a file to the condition's own upload control and send it. */
async function sendEvidence(
  page: Page,
  conditionId: string,
  fileName: string,
  comment: string,
  label: RegExp,
): Promise<void> {
  const input = page.locator(`#condition-evidence-${conditionId}`);
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.setInputFiles({ name: fileName, mimeType: 'image/png', buffer: evidenceBytes() });
  if (comment) {
    await page.locator(`#condition-comment-${conditionId}`).fill(comment);
  }
  await page.getByRole('button', { name: label }).click();
}

// ---------------------------------------------------------------------------
// 1. The rejection journey (STU-16, R13.9)
// ---------------------------------------------------------------------------
test('a student sends condition evidence, is asked for something different, and is told why', async ({
  page,
  gate,
}) => {
  const world = seeded!;
  const { conditionApplicant: applicant, conditionId } = world;
  await loginAs(page, applicant);
  await openApplication(page, applicant.applicationId);

  // The control exists at all — the STU-16 surface.
  await expect(page.getByText('Certified copy of your final transcript')).toBeVisible({
    timeout: 30_000,
  });
  await sendEvidence(page, conditionId, 'wrong-page.png', 'Sending the transcript.', /send evidence/i);

  // The server's state, read back on the student's own page.
  await expect(page.getByText('EVIDENCE SUBMITTED')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/wrong-page\.png/)).toBeVisible();

  // The school asks for something different, with a reason.
  const reason = 'That is page 1 of 2 — please send the page carrying the official stamp.';
  const reviewed = await world.admin.ctx.post(
    `/api/v1/applications/${applicant.applicationId}/conditions/${conditionId}/review/`,
    {
      headers: { 'x-csrf-token': world.admin.csrf },
      data: { outcome: 'changes_required', reason },
    },
  );
  expect(
    reviewed.ok(),
    `review should succeed (got ${reviewed.status()}: ${await reviewed.text()})`,
  ).toBeTruthy();
  expect(unwrap(await reviewed.json()).status).toBe('changes_required');

  // The student reloads and is told what to do about it — the dead end STU-16
  // named is now a reason plus a control.
  await openApplication(page, applicant.applicationId);
  await expect(page.getByText('CHANGES REQUIRED')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(reason, { exact: false })).toBeVisible();
  await expect(page.locator(`#condition-evidence-${conditionId}`)).toBeVisible();

  // And the outcome reached them as a durable message with its delivery state.
  await expect
    .poll(
      async () => {
        const response = await page.request.get('/api/v1/notifications/?pageSize=50');
        if (!response.ok()) return [];
        const payload = unwrap(await response.json());
        const rows = Array.isArray(payload) ? payload : (payload?.results ?? []);
        return rows.filter((row: any) => /condition/i.test(row.title || ''));
      },
      { timeout: 30_000 },
    )
    .not.toEqual([]);

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

// ---------------------------------------------------------------------------
// 2. The replacement journey (STU-16, R13.9, R11.8)
// ---------------------------------------------------------------------------
test('a replacement supersedes the first version and can then be accepted', async ({
  page,
  gate,
}) => {
  const world = seeded!;
  const { conditionApplicant: applicant, conditionId } = world;
  await loginAs(page, applicant);
  await openApplication(page, applicant.applicationId);

  await sendEvidence(
    page,
    conditionId,
    'stamped-page.png',
    'Stamped page attached.',
    /send evidence|send a replacement/i,
  );

  await expect(page.getByText('EVIDENCE SUBMITTED')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/stamped-page\.png/)).toBeVisible();
  // The earlier version is kept, not overwritten (R11.8) — and the student is
  // told so on the page.
  await expect(page.getByText(/earlier version/i)).toBeVisible();

  // The server agrees: two immutable versions, exactly one current.
  const conditionRead = await page.request.get(
    `${CONDITIONS_API(applicant.applicationId)}${conditionId}/`,
  );
  expect(conditionRead.ok(), `condition read should succeed (got ${conditionRead.status()})`).toBeTruthy();
  const condition = unwrap(await conditionRead.json());
  expect(condition.evidence.version).toBe(2);
  expect(condition.evidence_versions).toBe(2);
  expect(condition.superseded_evidence.length).toBe(1);
  expect(condition.superseded_evidence[0].version).toBe(1);
  // Both submissions and the rejection survive in the append-only history.
  const historyStates = (condition.history || []).map((entry: any) => entry.to_state);
  expect(historyStates).toContain('changes_required');
  expect(historyStates.filter((state: string) => state === 'evidence_submitted').length).toBe(2);

  // The school accepts it.
  const accepted = await world.admin.ctx.post(
    `/api/v1/applications/${applicant.applicationId}/conditions/${conditionId}/review/`,
    {
      headers: { 'x-csrf-token': world.admin.csrf },
      data: { outcome: 'met' },
    },
  );
  expect(
    accepted.ok(),
    `accepting should succeed (got ${accepted.status()}: ${await accepted.text()})`,
  ).toBeTruthy();

  await openApplication(page, applicant.applicationId);
  // The condition is satisfied, and no control is offered for it any more.
  const satisfied = await page.request.get(
    `${CONDITIONS_API(applicant.applicationId)}${conditionId}/`,
  );
  const satisfiedData = unwrap(await satisfied.json());
  expect(satisfiedData.status).toBe('met');
  expect(satisfiedData.allowed_actions).toEqual([]);
  await expect(page.locator(`#condition-evidence-${conditionId}`)).toHaveCount(0);

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

// ---------------------------------------------------------------------------
// 3. The amendment approve journey (STU-17, R13.9-R13.10)
// ---------------------------------------------------------------------------
test('an amendment appears in the student history, is approved, and the history says so', async ({
  page,
  gate,
}) => {
  const world = seeded!;
  const applicant = world.amendmentApplicant;
  await loginAs(page, applicant);
  await openApplication(page, applicant.applicationId);

  // Submit through the form the student actually has.
  await page.locator('#amend-field').selectOption('phone');
  await page.locator('#amend-value').fill('+260970000123');
  await page.locator('#amend-reason').fill('I changed my number after moving house.');
  await page.getByRole('button', { name: /submit amendment request/i }).click();

  // The tracking STU-17 asked for: the request is on the page, pending, with the
  // server's own definition of what pending means.
  const history = page.getByRole('heading', { name: /your amendment requests/i });
  await expect(history).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('PENDING').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/\+260970000123/)).toBeVisible();
  await expect(page.getByText(/waiting for the admissions team/i)).toBeVisible();

  // The school approves it.
  const listed = await page.request.get(AMENDMENTS_API(applicant.applicationId));
  expect(listed.ok(), `amendment list should succeed (got ${listed.status()})`).toBeTruthy();
  const listedData = unwrap(await listed.json());
  expect(listedData.totalCount).toBeGreaterThan(0);
  const amendmentId = listedData.results[0].id;

  const approved = await world.admin.ctx.post(
    `${AMENDMENTS_API(applicant.applicationId)}${amendmentId}/review/`,
    {
      headers: { 'x-csrf-token': world.admin.csrf },
      data: { status: 'approved' },
    },
  );
  expect(
    approved.ok(),
    `approval should succeed (got ${approved.status()}: ${await approved.text()})`,
  ).toBeTruthy();

  // The student's own history reflects the decision, and the value is applied.
  await openApplication(page, applicant.applicationId);
  await expect(page.getByText('APPROVED').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/approved and applied to your application/i)).toBeVisible();

  const detail = await page.request.get(
    `${AMENDMENTS_API(applicant.applicationId)}${amendmentId}/`,
  );
  expect(detail.ok(), `amendment detail should succeed (got ${detail.status()})`).toBeTruthy();
  const detailData = unwrap(await detail.json());
  expect(detailData.status).toBe('approved');
  expect(detailData.is_terminal).toBe(true);
  expect(detailData.reviewed_at).toBeTruthy();
  expect(detailData.reason).toBe('I changed my number after moving house.');
  // The decision is the student's business; who made it is the school's record.
  expect(Object.keys(detailData)).not.toContain('reviewed_by');

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

// ---------------------------------------------------------------------------
// 4. The amendment reject journey + same-field pending uniqueness (STU-17)
// ---------------------------------------------------------------------------
test('a second pending request for the same field is refused, and a rejection is visible', async ({
  page,
  gate,
}) => {
  const world = seeded!;
  const applicant = world.amendmentApplicant;
  await loginAs(page, applicant);

  const csrfResponse = await page.request.get('/api/v1/auth/session/?refresh_csrf=1');
  expect(csrfResponse.ok(), 'session bootstrap should succeed').toBeTruthy();
  const csrf = csrfResponse.headers()['x-csrf-token'] || '';
  expect(csrf, 'the session should issue a CSRF token').toBeTruthy();

  const first = await page.request.post(AMENDMENTS_API(applicant.applicationId), {
    headers: { 'x-csrf-token': csrf },
    data: {
      field_name: 'residence_town',
      new_value: 'Ndola',
      reason: 'I moved to a different town.',
    },
  });
  expect(
    first.status(),
    `the first request should be accepted (got ${first.status()}: ${await first.text()})`,
  ).toBe(201);
  const firstId = unwrap(await first.json()).amendment_id;

  // The duplicate is this journey's asserted error path (R18.4).
  gate.allowRequest(AMENDMENTS_API(applicant.applicationId));
  const duplicate = await page.request.post(AMENDMENTS_API(applicant.applicationId), {
    headers: { 'x-csrf-token': csrf },
    data: {
      field_name: 'residence_town',
      new_value: 'Kitwe',
      reason: 'Actually a different town again.',
    },
  });
  expect(duplicate.status(), 'a second pending request for one field is a conflict').toBe(409);
  const duplicateBody = await duplicate.json();
  expect(duplicateBody.code).toBe('AMENDMENT_ALREADY_PENDING');
  // The refusal names the request already in flight, so the student can act on it.
  expect(duplicateBody.details.pending_amendment_id).toBe(firstId);

  // A different field is unaffected: the rule is about the same question being
  // asked twice, not about a cap.
  const otherField = await page.request.post(AMENDMENTS_API(applicant.applicationId), {
    headers: { 'x-csrf-token': csrf },
    data: {
      field_name: 'next_of_kin_phone',
      new_value: '+260970000999',
      reason: 'My next of kin changed their number.',
    },
  });
  expect(otherField.status(), 'a different field is still requestable').toBe(201);

  // The school declines the first one.
  const rejected = await world.admin.ctx.post(
    `${AMENDMENTS_API(applicant.applicationId)}${firstId}/review/`,
    {
      headers: { 'x-csrf-token': world.admin.csrf },
      data: { status: 'rejected' },
    },
  );
  expect(
    rejected.ok(),
    `rejection should succeed (got ${rejected.status()}: ${await rejected.text()})`,
  ).toBeTruthy();

  // The student sees the decision on their own page rather than guessing.
  await openApplication(page, applicant.applicationId);
  await expect(page.getByText('REJECTED').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/declined by the admissions team/i)).toBeVisible();

  // And the field is requestable again, because the question is now closed.
  const again = await page.request.post(AMENDMENTS_API(applicant.applicationId), {
    headers: { 'x-csrf-token': csrf },
    data: {
      field_name: 'residence_town',
      new_value: 'Kitwe',
      reason: 'Trying again after the first was declined.',
    },
  });
  expect(again.status(), 'a closed question can be asked again').toBe(201);

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});
