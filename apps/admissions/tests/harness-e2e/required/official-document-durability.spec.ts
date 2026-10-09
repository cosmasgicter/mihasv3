/**
 * Required V2 harness — official-document work is durable, and an issued
 * document stays readable (task 10.4).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 10.4 — "Make
 * official-document work durable and historically readable".
 * Requirements: **R13.11** (persist durable work before 202 or return
 * `GENERATION_UNAVAILABLE`; reading an already issued artifact is not disabled
 * merely because the application later becomes terminal), **R13.5** (one
 * idempotent official-document API family owns generation, status, email and
 * download), **R13.2** (official-document availability on the application
 * surface), **R17.1** / **R17.4** (transaction boundary, retry policy, durable
 * reconciliation, honest degraded state).
 * Findings: **STU-18**, **API-04**.
 * Design: §11.3 ("A 202 response is returned only after a durable generation job
 * is committed. Broker outage after commit is recovered by the dispatcher…
 * Issuance eligibility and read-existing eligibility are different policies")
 * and §17 ("'Queued' means a committed durable record exists").
 *
 * This file is the task's `_Evidence:` line — *broker-down recovery, terminal
 * artifact read, email/download E2E* — in the browser, plus the student half of
 * part 3 (neutral recovery) and its staff half (the setup alert).
 *
 * Why the browser is required and not only endpoint tests. All three clauses of
 * STU-18 are *surfaces*:
 *
 * * a phantom `queued` is only a defect because **something polls it**. The hook
 *   mapped every unknown status to a poll, so a document nothing had recorded was
 *   polled twenty times and then declared failed. An endpoint test can prove the
 *   status string; only the browser can prove the poll ends;
 * * "existing documents are hidden after terminal status" was **half a frontend
 *   rule**. The backend read-existing policy is new here, but the student surface
 *   gated every action on `isOfficialDocumentOffered` — the *issuance* mirror — so
 *   an enrolled student with an issued offer letter was still shown no control at
 *   all. The endpoint can serve it; only the browser can prove it is offered;
 * * "student errors expose tenant setup instructions" is **copy on a screen**.
 *
 * The four journeys:
 *
 *   1. **broker-down recovery.** A generation request whose dispatch never
 *      happened is still a committed record; the student's read says `queued`
 *      backed by that record; the platform's own dispatcher sweep serves it; the
 *      document becomes downloadable. And the negative that makes `queued` mean
 *      something: a document nobody requested reads `not_requested`, has no row,
 *      and the surface offers no queue to poll.
 *   2. **terminal artifact read.** A slip issued while the application was live
 *      stays readable, and stays *offered*, once the application is terminal —
 *      while a **new** artifact is refused with the same masked 404 as before.
 *   3. **email/download.** The one canonical per-type email route sends the
 *      stored record to the applicant's own address, the send lands in the
 *      student's own communications history with a classified category and
 *      per-channel state, a replay converges, and another address is refused.
 *   4. **neutral recovery + staff alert.** A document that cannot be issued
 *      because the school's configuration is incomplete shows the applicant a
 *      neutral sentence, a route to a human, and no retry the server says cannot
 *      work — while the school's own staff get the work item that names the
 *      configuration.
 *
 * Runs against the isolated local harness (task 0.4) with the strict gates active
 * (`harness-fixtures.ts`): zero skips, no console errors, no unhandled
 * exceptions, no unasserted failed requests. Both the desktop and the mobile
 * project run every journey.
 */
import { test, expect, type APIRequestContext, type Page } from '../harness-fixtures';
import {
  assignOffering,
  createDraftApplication,
  createInstitutionViaApi,
  createIntake,
  freshContext,
  linkIntake,
  listCanonicalPrograms,
  superAdminContext,
  type AuthedContext,
} from '../helpers/api';
import {
  commitUndispatchedOfficialDocumentJob,
  readOfficialDocumentJobRow,
  sweepOfficialDocumentJobs,
} from '../helpers/ops';

/** The student's own application workspace (`routeRegistry` student.status alias). */
const APPLICATION_URL = (applicationId: string) => `/application/${applicationId}`;
const INBOX_URL = '/student/communications';

const DOCUMENT_API = (applicationId: string, documentType: string) =>
  `/api/v1/applications/${applicationId}/official-documents/${documentType}/`;
const DOCUMENT_LIST_API = (applicationId: string) =>
  `/api/v1/applications/${applicationId}/official-documents/`;
const EMAIL_API = (applicationId: string, documentType: string) =>
  `${DOCUMENT_API(applicationId, documentType)}email/`;
const WITHDRAW_API = (applicationId: string) =>
  `/api/v1/applications/${applicationId}/withdraw/`;

/**
 * The slip renders without an `InstitutionDocumentProfile`
 * (`render_context.PROFILE_REQUIRED_DOCUMENT_TYPES` excludes it), and the
 * acceptance letter does not. The harness seeds no document profile, so those two
 * types give this file a genuinely-succeeding render and a genuinely-failing one
 * without either being forced.
 */
const SLIP = 'application_slip';
const LETTER = 'acceptance_letter';

test.describe.configure({ mode: 'serial' });

interface SeededApplicant {
  ctx: APIRequestContext;
  email: string;
  password: string;
  csrf: string;
  applicationId: string;
}

interface SeededStaff {
  email: string;
  password: string;
  id: string;
}

interface SeededWorld {
  admin: AuthedContext;
  institutionId: string;
  canonicalProgramId: string;
  intakeId: string;
  /** Journey 1: a submitted application whose slip is requested but never dispatched. */
  broker: SeededApplicant;
  /** Journey 2: a submitted application whose issued slip must survive withdrawal. */
  terminal: SeededApplicant;
  /** Journey 3: a submitted application whose slip is downloaded and emailed. */
  delivery: SeededApplicant;
  /** Journey 4: an approved application whose letter needs a document profile. */
  setup: SeededApplicant;
  /**
   * Journey 4's alert recipient: a staff member of *this* school holding
   * `tenant.profile.read`. Task 9.5's resolver deliberately excludes
   * Super_Admins, so a platform operator's inbox would prove nothing — the claim
   * is that the school's own authorized staff are told.
   */
  staff: SeededStaff;
}

let seeded: SeededWorld | undefined;

function unwrap(json: any): any {
  return json && typeof json === 'object' && 'data' in json ? json.data : json;
}

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
  expect(
    reg.ok(),
    `${label} should register (got ${reg.status()}: ${await reg.text()})`,
  ).toBeTruthy();
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

/**
 * A staff account bound to one institution through task 9.3's tenant-bound
 * create, so the membership carrying the authority is real. No grant is added:
 * `tenant.profile.read` is in the read-by-default bundle, which is exactly why
 * `_alert_staff_of_setup_failure` chose it — the alert reaches whoever can see
 * the school's document configuration, without needing a mutation capability.
 */
async function seedStaff(
  admin: AuthedContext,
  institutionId: string,
  label: string,
): Promise<SeededStaff> {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
  const email = `harness.${label}.${stamp}@example.com`;
  const password = 'HarnessStaff123!';
  const created = await admin.ctx.post('/api/v1/admin/users/', {
    headers: { 'x-csrf-token': admin.csrf },
    data: {
      email,
      password,
      first_name: 'Harness',
      last_name: label,
      role: 'admin',
      institution_id: institutionId,
    },
  });
  expect(
    created.status(),
    `${label} creation should succeed (got ${created.status()}: ${await created.text()})`,
  ).toBe(201);
  const id = unwrap(await created.json())?.id;
  expect(id, `${label} should have an id`).toBeTruthy();
  return { email, password, id };
}

/** Move an application through the platform's own review command. */
async function review(
  admin: AuthedContext,
  applicationId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const response = await admin.ctx.post(`/api/v1/applications/${applicationId}/review/`, {
    headers: { 'x-csrf-token': admin.csrf },
    data: body,
  });
  expect(
    response.ok(),
    `review ${JSON.stringify(body.new_status)} should succeed (got ${response.status()}: ${await response.text()})`,
  ).toBeTruthy();
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
  const canonicalProgramId = canonicals[0].id;

  // A school of this file's own, so the setup-alert journey's recipients and the
  // "no document profile" state belong to nobody else's tenant.
  const { institutionId } = await createInstitutionViaApi(admin, {
    name: `Docs School ${stamp}`,
    code: `D104${stamp}`,
    hostname: `d104-${stamp}.localhost`,
  });
  const { intakeId } = await createIntake(admin, {
    name: `Official Documents Intake ${stamp}`,
    year: new Date().getFullYear() + 1,
  });
  const offering = await assignOffering(admin, institutionId, {
    canonical_program_id: canonicalProgramId,
    name: `Official Documents Offering ${stamp}`,
    code: `OD${stamp}`,
  });
  await linkIntake(admin, {
    program_id: offering.offeringId,
    intake_id: intakeId,
    max_capacity: 100,
  });

  const staff = await seedStaff(admin, institutionId, 'docstaff');

  const broker = await seedApplicant('docbroker', canonicalProgramId, intakeId);
  const terminal = await seedApplicant('docterminal', canonicalProgramId, intakeId);
  const delivery = await seedApplicant('docdelivery', canonicalProgramId, intakeId);
  const setup = await seedApplicant('docsetup', canonicalProgramId, intakeId);

  // The slip's issuance gate is a non-draft submitted status, so every journey's
  // application reaches `submitted` through the platform's own review command.
  for (const applicant of [broker, terminal, delivery, setup]) {
    await review(admin, applicant.applicationId, {
      new_status: 'submitted',
      notes: 'harness 10.4 official-document setup',
    });
  }

  // Journey 4 needs an offer the letter renderer will refuse for want of a
  // document profile. An `approved` transition is payment-gated
  // (`PAYMENT_UNVERIFIED`) and the fee is not this task's subject, so `force` is
  // the platform's own documented, audited override — not a bypass of anything
  // under test here.
  await review(admin, setup.applicationId, {
    new_status: 'under_review',
    notes: 'harness 10.4 official-document setup',
  });
  await review(admin, setup.applicationId, {
    new_status: 'approved',
    force: true,
    reason: 'harness 10.4 setup',
    notes: 'harness 10.4 official-document setup',
  });

  seeded = {
    admin,
    institutionId,
    canonicalProgramId,
    intakeId,
    broker,
    terminal,
    delivery,
    setup,
    staff,
  };
  return seeded;
}

test.beforeAll(async () => {
  await seedWorld();
});

test.afterAll(async () => {
  if (!seeded) return;
  await seeded.broker.ctx.dispose();
  await seeded.terminal.ctx.dispose();
  await seeded.delivery.ctx.dispose();
  await seeded.setup.ctx.dispose();
});

async function loginAs(page: Page, applicant: SeededApplicant): Promise<string> {
  const login = await page.request.post('/api/v1/auth/login/', {
    data: { email: applicant.email, password: applicant.password },
  });
  expect(
    login.ok(),
    `${applicant.email} should log in (got ${login.status()}: ${await login.text()})`,
  ).toBeTruthy();
  const session = await page.request.get('/api/v1/auth/session/?refresh_csrf=1');
  expect(session.ok(), 'session bootstrap should succeed').toBeTruthy();
  const csrf = session.headers()['x-csrf-token'] || '';
  expect(csrf, 'the session should issue a CSRF token').toBeTruthy();
  return csrf;
}

async function openApplication(page: Page, applicationId: string): Promise<void> {
  await page.goto(APPLICATION_URL(applicationId), { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /^Application #/ }).first()).toBeVisible({
    timeout: 30_000,
  });
}

/**
 * The document action a user can actually reach, on this viewport.
 *
 * **Repointed by admissions-v2 task 11.3 (STU-05), and this is the one place in
 * this file that task touched.** The behavioural claims below are unchanged; the
 * DOM they read is not.
 *
 * Before 11.3, `DocumentButtons` rendered every action **twice** — a `sm:hidden`
 * mobile `<details>` and a `hidden sm:flex` desktop row — so this helper had to
 * pick the visible copy, and on a phone the mobile copy was a **collapsed
 * disclosure holding the only controls**. That is why this file's terminal-read
 * journey failed on the mobile project at the pre-11.3 base commit: the
 * `:visible` locator correctly found nothing, because the platform had published
 * a lawful artifact and the surface had hidden it.
 *
 * After 11.3 the surface renders **once** at every width and the primary
 * document's control is visible without opening anything, so the tap this helper
 * used to perform is no longer needed for it. The fallback remains for the case
 * the recomposition deliberately created: a *secondary* document lives inside the
 * counted ARIA disclosure (`document-options-trigger`), and reaching it is a real
 * part of the journey rather than an inconvenience.
 */
async function documentAction(page: Page, documentType: string) {
  const target = page.locator(`[data-testid="official-document-${documentType}"]:visible`);
  if ((await target.count()) === 0) {
    const trigger = page.getByTestId('document-options-trigger').first();
    if (await trigger.isVisible().catch(() => false)) {
      if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
    }
  }
  return target.first();
}

/** The published official-document status for one type. */
async function readStatus(page: Page, applicationId: string, documentType: string): Promise<any> {
  const response = await page.request.get(DOCUMENT_API(applicationId, documentType));
  expect(
    response.ok(),
    `official-document read should succeed (got ${response.status()}: ${await response.text()})`,
  ).toBeTruthy();
  return unwrap(await response.json());
}

/**
 * The student's own inbox rows produced by the official-document email.
 *
 * Matched on the title the platform composes (`"{label} available"`), read from
 * the student's own communications endpoint — the same surface task 10.1 made the
 * single history.
 */
async function documentMessages(page: Page): Promise<any[]> {
  const response = await page.request.get('/api/v1/notifications/?pageSize=50');
  if (!response.ok()) return [];
  const rows = unwrap(await response.json())?.results ?? [];
  return rows.filter((row: any) => /Application Slip available/i.test(row.title ?? ''));
}

/**
 * Let the browser follow a backend-signed storage URL inside this harness.
 *
 * The one environment seam in this file, and it is worth stating precisely. The
 * backend signs the download against the **compose-internal** object-storage
 * endpoint (`minio:9000`), because that is the endpoint it talks to; the host
 * browser cannot resolve that name, so the navigation would land on
 * `chrome-error://chromewebdata/` and the journey would be asserting a DNS
 * failure rather than a product behaviour.
 *
 * Fulfilling that host locally keeps the browser's own navigation — the anchor,
 * the new tab, the request — and changes nothing about the URL: it is the one the
 * platform signed, and the assertion is that the browser went *there* rather than
 * to a `blob:` a client renderer produced. What is stubbed is the object store's
 * reachability, which no assertion in this file is about.
 */
async function allowStorageNavigation(page: Page, downloadUrl: string): Promise<void> {
  const { protocol, host } = new URL(downloadUrl);
  await page.context().route(`${protocol}//${host}/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      body: '%PDF-1.4\n%%EOF\n',
    }),
  );
}

/**
 * The URL a `target="_blank"` download actually navigated to.
 *
 * A popup's `url()` is `''`/`about:blank` for the instant between the window
 * opening and the navigation committing, so reading it immediately proves
 * nothing. This waits for the real one.
 */
async function settledPopupUrl(popup: Page): Promise<string> {
  await expect
    .poll(() => popup.url(), { timeout: 30_000, message: 'the download should navigate' })
    .not.toMatch(/^(|about:blank)$/);
  return popup.url();
}

/** Poll the published status until it settles on `ready`. */
async function waitForReady(
  page: Page,
  applicationId: string,
  documentType: string,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const response = await page.request.get(DOCUMENT_API(applicationId, documentType));
        if (!response.ok()) return null;
        return unwrap(await response.json())?.status;
      },
      { timeout: 90_000, message: `${documentType} should reach ready` },
    )
    .toBe('ready');
}

// ---------------------------------------------------------------------------
// 1. Broker-down recovery (Required_Evidence)
// ---------------------------------------------------------------------------
test('a request the broker never received is still recorded, and the dispatcher serves it', async ({
  page,
  gate,
}) => {
  const world = seeded!;
  const applicant = world.broker;
  await loginAs(page, applicant);

  // The negative first, because it is what makes `queued` mean anything: a
  // permitted document nobody has requested. Pre-10.4 this read `queued` — a
  // queue with nothing in it and no poll that could ever end.
  const before = await readStatus(page, applicant.applicationId, SLIP);
  expect(before.status, 'an unrequested document is not a queue').toBe('not_requested');
  expect(before.job.state).toBe('none');
  expect(before.job.terminal).toBe(false);
  expect(before.job.can_retry).toBe(false);
  expect(before.document_id).toBeNull();
  expect(
    await readOfficialDocumentJobRow(applicant.applicationId, SLIP),
    'and there is no durable record either — the status is not merely honest, it is true',
  ).toBeNull();

  // The surface agrees: nothing is queued, so nothing is being polled. The
  // resting label is the action, not a progress state.
  await openApplication(page, applicant.applicationId);
  const resting = await documentAction(page, SLIP);
  await expect(resting).toBeVisible({ timeout: 30_000 });
  await expect(resting).not.toContainText(/Queued/i);

  // Now the outage: the durable record commits and the dispatch never happens —
  // the exact state `POST …/official-documents/{type}/` leaves behind when the
  // broker is unreachable, produced by the platform's own commit call.
  const committed = await commitUndispatchedOfficialDocumentJob(applicant.applicationId, SLIP);
  expect(committed.state, 'the record commits before anything is dispatched').toBe('pending');
  expect(committed.dispatched, 'and no worker was handed it').toBe(false);

  // What the student is told is now backed by a record. This is design §17's
  // sentence, asserted from both sides: the envelope says `queued`, and the row
  // exists in the document channel.
  const queued = await readStatus(page, applicant.applicationId, SLIP);
  expect(queued.status, 'committed, unfinished work is the only honest queue').toBe('queued');
  expect(queued.job.terminal).toBe(false);
  const row = await readOfficialDocumentJobRow(applicant.applicationId, SLIP);
  expect(row, 'a queued status must be backed by a committed row').not.toBeNull();
  expect(row!.channel, 'document work does not share a channel with delivered mail').toBe(
    'document',
  );
  expect(['pending', 'dispatched']).toContain(row!.status);

  // The other half of R13.11: the dispatcher makes the recorded request actually
  // get served. This is the platform's own sweep, the one on the beat schedule.
  await sweepOfficialDocumentJobs();
  await waitForReady(page, applicant.applicationId, SLIP);

  const ready = await readStatus(page, applicant.applicationId, SLIP);
  expect(ready.document_id, 'the recovered request produced a real artifact').toBeTruthy();
  expect(ready.download_url, 'and it is downloadable').toBeTruthy();
  expect(ready.job.state).toBe('succeeded');
  expect(ready.job.terminal).toBe(true);
  expect(ready.job.can_retry, 'a settled job offers no retry').toBe(false);

  // And the student can take it. The download opens the signed stored record in
  // a new tab, so the assertion is on the popup's URL rather than on navigation.
  await allowStorageNavigation(page, ready.download_url);
  await openApplication(page, applicant.applicationId);
  const download = (await documentAction(page, SLIP)).getByRole('button', {
    name: /Download Slip/i,
  });
  await expect(download).toBeEnabled({ timeout: 30_000 });
  const popup = page.waitForEvent('popup', { timeout: 30_000 });
  await download.click();
  const opened = await popup;
  const openedUrl = await settledPopupUrl(opened);
  expect(
    openedUrl,
    'the browser opens the backend-signed stored object, never a locally rendered blob',
  ).toContain(new URL(ready.download_url).host);
  expect(openedUrl, 'and not a client-generated blob').not.toMatch(/^blob:/);
  await opened.close();

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

// ---------------------------------------------------------------------------
// 2. Terminal artifact read (Required_Evidence)
// ---------------------------------------------------------------------------
test('an issued document stays readable, and stays offered, once the application is terminal', async ({
  page,
  gate,
}) => {
  const world = seeded!;
  const applicant = world.terminal;
  const csrf = await loginAs(page, applicant);

  // Issue the slip while the application is live, through the canonical route.
  const issue = await page.request.post(DOCUMENT_API(applicant.applicationId, SLIP), {
    headers: { 'x-csrf-token': csrf },
  });
  expect(
    [200, 202].includes(issue.status()),
    `the slip should be accepted (got ${issue.status()}: ${await issue.text()})`,
  ).toBeTruthy();
  if (issue.status() === 202) {
    expect(
      unwrap(await issue.json()).job.state,
      'a 202 is only ever answered on the far side of a committed job',
    ).not.toBe('none');
  }
  await waitForReady(page, applicant.applicationId, SLIP);
  const issued = await readStatus(page, applicant.applicationId, SLIP);
  expect(issued.historical, 'while the application is live this is simply current').toBe(false);
  const issuedDocumentId = issued.document_id;
  expect(issuedDocumentId).toBeTruthy();

  // Terminal, by the student's own command. `withdrawn` is terminal in
  // `ALLOWED_TRANSITIONS`, and it is the one terminal status a student can reach
  // themselves — so nothing here is an operator writing a status.
  const withdraw = await page.request.post(WITHDRAW_API(applicant.applicationId), {
    headers: { 'x-csrf-token': csrf },
    data: {
      withdrawal_reason: 'Harness 10.4 terminal-read journey: withdrawing on purpose.',
    },
  });
  expect(
    withdraw.ok(),
    `withdrawal should succeed (got ${withdraw.status()}: ${await withdraw.text()})`,
  ).toBeTruthy();

  // The read-existing policy: the artifact the platform issued is still served,
  // and marked as the issued copy rather than as today's state.
  const after = await readStatus(page, applicant.applicationId, SLIP);
  expect(after.status, 'a lawful issued document is still readable').toBe('ready');
  expect(after.document_id, 'and it is the same artifact').toBe(issuedDocumentId);
  expect(after.historical, 'served under the read-existing policy').toBe(true);
  expect(after.download_url, 'with a working download').toBeTruthy();

  // The list read publishes it too — which is what the student surface asks.
  const list = unwrap(await (await page.request.get(DOCUMENT_LIST_API(applicant.applicationId))).json());
  expect(
    (list as any[]).some((row) => row.document_type === SLIP && row.status === 'ready'),
    'the list a terminal application publishes still contains the issued slip',
  ).toBe(true);

  // Issuance is a different policy, and it is unchanged: a terminal application
  // may not mint a new artifact, and the refusal is the same masked 404 as before.
  gate.allowRequest(DOCUMENT_API(applicant.applicationId, SLIP));
  const reissue = await page.request.post(DOCUMENT_API(applicant.applicationId, SLIP), {
    headers: { 'x-csrf-token': csrf },
  });
  expect(reissue.status(), 'a terminal application cannot create a new artifact').toBe(404);
  const refusal = await reissue.json();
  expect(refusal.code, 'and the refusal reveals nothing').toBe('NOT_FOUND');

  // The surface is the half STU-18 actually named. The issuance mirror says no
  // for `withdrawn`, so before this task there was no control at all; the server's
  // list says an artifact exists, so there is.
  await openApplication(page, applicant.applicationId);
  const slip = await documentAction(page, SLIP);
  await expect(slip).toBeVisible({ timeout: 30_000 });
  await expect(slip).toHaveAttribute('data-historical', 'true');
  await expect(slip).toContainText(/Issued copy on record/i);
  await expect(slip.getByRole('button', { name: /Download Slip/i })).toBeEnabled();

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

// ---------------------------------------------------------------------------
// 3. Email and download (Required_Evidence)
// ---------------------------------------------------------------------------
test('the one canonical email route sends the stored record and lands in the history', async ({
  page,
  gate,
}) => {
  const world = seeded!;
  const applicant = world.delivery;
  const csrf = await loginAs(page, applicant);

  // Download first — through the browser, and it is the same stored record the
  // email path then sends. The request goes through the canonical POST so the
  // durable job exists before the click has anything to wait for.
  const issue = await page.request.post(DOCUMENT_API(applicant.applicationId, SLIP), {
    headers: { 'x-csrf-token': csrf },
  });
  expect(
    [200, 202].includes(issue.status()),
    `the slip should be accepted (got ${issue.status()}: ${await issue.text()})`,
  ).toBeTruthy();
  await waitForReady(page, applicant.applicationId, SLIP);
  const stored = await readStatus(page, applicant.applicationId, SLIP);
  await allowStorageNavigation(page, stored.download_url);

  await openApplication(page, applicant.applicationId);
  const slip = await documentAction(page, SLIP);
  await expect(slip).toBeVisible({ timeout: 30_000 });
  const popup = page.waitForEvent('popup', { timeout: 90_000 });
  await slip.getByRole('button', { name: /Download Slip/i }).click();
  const opened = await popup;
  expect(
    await settledPopupUrl(opened),
    'the download streams the stored record',
  ).toContain(new URL(stored.download_url).host);
  await opened.close();

  // The email. API-04's gap was that only the slip had a backend email route at
  // all, so an acceptance letter could be downloaded but not emailed; there is now
  // one per-type route, and this is it.
  const sent = await page.request.post(EMAIL_API(applicant.applicationId, SLIP), {
    headers: { 'x-csrf-token': csrf },
    data: {},
  });
  expect(
    sent.ok(),
    `the canonical email route should accept (got ${sent.status()}: ${await sent.text()})`,
  ).toBeTruthy();
  const delivered = unwrap(await sent.json());
  expect(delivered.status, 'nothing is emailed for a document that is not there').toBe('ready');
  expect(
    delivered.delivery?.category,
    'the send is classified by the platform, not by the call site',
  ).toBe('application_updates');
  const payload = JSON.stringify(delivered);
  expect(payload, 'the recipient address is not echoed back').not.toContain(applicant.email);

  // It went through task 10.1's one delivery gate, so it is in the student's own
  // communications history with a per-channel state — rather than nowhere, which
  // is where `EmailSlipView`'s direct `queue_email` put it.
  await expect
    .poll(async () => (await documentMessages(page)).length, {
      timeout: 60_000,
      message: 'the emailed document should appear in the history',
    })
    .toBe(1);
  const message = (await documentMessages(page))[0];
  expect(message.category).toBe('application_updates');

  await page.goto(INBOX_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1', { hasText: 'Communications' })).toBeVisible({ timeout: 30_000 });
  const emailBadge = page.locator(`[data-testid="delivery-${message.id}-email"]`);
  await expect(emailBadge, 'the email channel states itself').toBeVisible({ timeout: 30_000 });

  // A replay converges: one send per issued artifact per recipient, so a
  // double-tapped "Email it to me" does not arrive twice.
  const replay = await page.request.post(EMAIL_API(applicant.applicationId, SLIP), {
    headers: { 'x-csrf-token': csrf },
    data: { email: applicant.email },
  });
  expect(replay.ok(), 'the owner may name their own address explicitly').toBeTruthy();
  // Give a second record time to appear if it were going to, then assert it did
  // not: one send per issued artifact per recipient.
  await page.waitForTimeout(2_000);
  expect(
    (await documentMessages(page)).length,
    'a replayed send converges rather than arriving twice',
  ).toBe(1);

  // An official record is not redirectable. Pre-10.4 any in-scope staff member
  // could have a student's document mailed to an address of their choosing.
  gate.allowRequest(EMAIL_API(applicant.applicationId, SLIP));
  const elsewhere = await page.request.post(EMAIL_API(applicant.applicationId, SLIP), {
    headers: { 'x-csrf-token': csrf },
    data: { email: 'someone.else@example.com' },
  });
  expect(elsewhere.status(), 'another address is refused').toBe(400);
  expect((await elsewhere.json()).code).toBe('RECIPIENT_NOT_PERMITTED');

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

// ---------------------------------------------------------------------------
// 4. Neutral student recovery, and the staff alert that replaces it
// ---------------------------------------------------------------------------
test('a document the school cannot issue tells the student nothing about its configuration', async ({
  page,
  gate,
}) => {
  const world = seeded!;
  const applicant = world.setup;
  const csrf = await loginAs(page, applicant);

  // The acceptance letter needs an `InstitutionDocumentProfile`, and this school
  // has none. Nothing is forced: the renderer refuses before rendering, which is
  // R8.9's existing seam, and task 10.4 settles the durable job terminally so the
  // read says `setup_required` instead of queuing forever.
  const issue = await page.request.post(DOCUMENT_API(applicant.applicationId, LETTER), {
    headers: { 'x-csrf-token': csrf },
  });
  expect(
    [200, 202].includes(issue.status()),
    `an approved application may request its letter (got ${issue.status()}: ${await issue.text()})`,
  ).toBeTruthy();

  await expect
    .poll(
      async () => {
        const response = await page.request.get(DOCUMENT_API(applicant.applicationId, LETTER));
        if (!response.ok()) return null;
        return unwrap(await response.json())?.status;
      },
      { timeout: 90_000, message: 'the letter should settle terminally, not queue forever' },
    )
    .toBe('setup_required');

  const settled = await readStatus(page, applicant.applicationId, LETTER);
  expect(settled.job.terminal, 'the job is settled, so the poll ends').toBe(true);
  expect(
    settled.job.can_retry,
    'and the student is not offered a retry that cannot change the outcome',
  ).toBe(false);
  expect(settled.setup_required).toBe(true);

  // What the applicant sees. The pre-10.4 copy told them to "Configure the
  // document profile, template, logo, and signature" — work only a school
  // operator can do, and a disclosure of the school's internal state.
  await openApplication(page, applicant.applicationId);
  const letter = await documentAction(page, LETTER);
  await expect(letter).toBeVisible({ timeout: 30_000 });
  await letter.getByRole('button').first().click();

  const recovery = letter.locator('[role="alert"]');
  await expect(recovery, 'the failure states itself').toBeVisible({ timeout: 60_000 });
  await expect(recovery).toContainText(/admissions office has been notified/i);
  // The retired checklist, counted at zero.
  await expect(recovery).not.toContainText(/document profile/i);
  await expect(recovery).not.toContainText(/template/i);
  await expect(recovery).not.toContainText(/signature/i);
  // No retry the server said would not help.
  await expect(recovery.getByRole('button', { name: /Try again/i })).toHaveCount(0);
  // And a real route to a human, resolved from tenant context (STU-24).
  const support = recovery.getByRole('link');
  await expect(support).toHaveCount(1);
  const href = (await support.getAttribute('href')) ?? '';
  expect(href, 'support is either the resolved school address or the neutral route').toMatch(
    /^(mailto:|\/contact)/,
  );
  expect(href.toLowerCase(), 'never a legacy school or platform address').not.toMatch(
    /mihas|katc|beanola\.com/,
  );

  // The school's half of the same failure is not dropped: *this school's own*
  // authorized staff get the work item that names the configuration. Read from a
  // separate API context, as the staff member, because who receives it is the
  // claim — task 9.5's resolver excludes Super_Admins on purpose, so a platform
  // operator's inbox would prove the opposite of what is wanted.
  const staffCtx = await freshContext();
  try {
    const staffLogin = await staffCtx.post('/api/v1/auth/login/', {
      data: { email: world.staff.email, password: world.staff.password },
    });
    expect(
      staffLogin.ok(),
      `the school's staff member should log in (got ${staffLogin.status()})`,
    ).toBeTruthy();
    const readAlerts = async (): Promise<any[]> => {
      const response = await staffCtx.get('/api/v1/notifications/?pageSize=50');
      if (!response.ok()) return [];
      const rows = unwrap(await response.json())?.results ?? [];
      return rows.filter((row: any) =>
        /Official document setup required/i.test(row.title ?? ''),
      );
    };
    await expect
      .poll(async () => (await readAlerts()).length, {
        timeout: 60_000,
        message: "the school's own staff should be told",
      })
      .toBeGreaterThan(0);
    const alert = (await readAlerts())[0];
    expect(
      alert.message,
      'and it names the configuration, because this reader can fix it',
    ).toMatch(/document profile/i);
    expect(
      JSON.stringify(alert),
      'while naming no applicant — a configuration problem is not about one student',
    ).not.toContain(applicant.email);
  } finally {
    await staffCtx.dispose();
  }

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});
