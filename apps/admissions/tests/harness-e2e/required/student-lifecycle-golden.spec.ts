/**
 * Required V2 harness — the golden student lifecycle, walked in ONE workspace.
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task **10.6** —
 * "Consolidate the student application workspace".
 * Requirements: **R13.7** ("A student browser journey SHALL cover
 * submitted/deferred payment recovery, amendment, interview, communication,
 * decision, official document download, and terminal tracking on desktop and
 * mobile"), **R13.1-R13.6**, and **R13.13** ("ONE canonical student application
 * workspace SHALL own status, next action, payment, documents, interview,
 * communications, conditions, amendments, enrollment, and history; duplicate
 * routes SHALL redirect to it").
 * Findings: **STU-23** (two overlapping workspaces with different actions and
 * duplicate payment/document/interview/timeline logic), **API-04**, **MAINT-01**.
 *
 * ## What this file is, and what it is not
 *
 * It is **not** a re-run of the seven post-submission lanes. Payment recovery,
 * amendment history, condition evidence, enrollment readiness, communications
 * delivery state, official-document durability and public tracking each already
 * have a required journey that proves the *behaviour* of that surface in depth,
 * and repeating those assertions here would only make one file fail for another
 * lane's reason.
 *
 * What none of them can prove is the thing R13.7 asks for and R13.13 is about:
 * that a student meets all of it **in one place, in one session, in the order it
 * actually happens** — and that the retired second workspace, which a bookmark or
 * an old email may still point at, lands them there instead of at a different page
 * with different actions. STU-23 was not a broken surface; it was two working
 * ones. A journey that visits each surface separately cannot see that defect, and
 * a unit test that reads the route table cannot see whether the student's own URL
 * survives the hop.
 *
 * So each leg asserts the **weakest** claim that would fail if the consolidation
 * were wrong: that the concern is reachable and answered from this one workspace,
 * carrying the platform's own values. Depth stays in the lane that owns it.
 *
 * ## The seven legs R13.7 names
 *
 *  1. **deferred payment recovery** — the workspace states the deferral and hands
 *     the student to the one page that owns post-submission collection (R12.3), and
 *     the fee is paid and settled from there.
 *  2. **amendment** — requested from the workspace, and its own history answers.
 *  3. **interview** — a scheduled interview is rendered here with a *joinable*
 *     link, which is the affordance only the retired page had.
 *  4. **communication** — the workspace reaches the single inbox, and the
 *     platform's own messages for this journey are in it with delivery state.
 *  5. **decision** — an admissions decision moves the workspace's own state and
 *     the recorded-changes history, not just an API field.
 *  6. **official document download** — the slip is generated and downloaded from
 *     the workspace's document controls.
 *  7. **terminal tracking** — the tracking link is issued from this workspace and
 *     opens the status in a clean context with **no session**, which is the only
 *     thing a student can share since task 10.5 retired the application number.
 *
 * Plus the leg that is the consolidation itself:
 *
 *  0. **the duplicate route redirects** — `/student/application/:id` replaces
 *     itself with `/student/application/:id/status`, preserving the application id
 *     and the query string, and the workspace that renders is the same one.
 *
 * The legs run in **one test**, sharing one applicant and one browser context, on
 * purpose: "a student journey" is a sequence, and splitting it into seven tests
 * would prove seven visits instead of one lifecycle. Both the desktop and the
 * mobile project run it, which is R13.7's "on desktop and mobile".
 *
 * Runs against the isolated local harness (task 0.4) with the strict gates active
 * (`harness-fixtures.ts`): zero skips, no console errors, no unasserted failed
 * requests.
 */
import { test, expect, type Page } from '../harness-fixtures';
import {
  assignOffering,
  createDraftApplication,
  createFee,
  createInstitutionViaApi,
  createIntake,
  linkIntake,
  listCanonicalPrograms,
  readPaymentRows,
  registerAndLoginStudent,
  superAdminContext,
  type AuthedContext,
} from '../helpers/api';

/** The one canonical workspace, and the duplicate that now redirects to it. */
const WORKSPACE = (applicationId: string) =>
  `/student/application/${encodeURIComponent(applicationId)}/status`;
const RETIRED_DUPLICATE = (applicationId: string) =>
  `/student/application/${encodeURIComponent(applicationId)}`;
const INBOX = '/student/communications';
const PAYMENT_PAGE = '/student/payment';
const SLIP = 'application_slip';

/**
 * A number the harness payment adapter settles immediately.
 *
 * Same steering value the payment lane uses: the adapter reads the MSISDN to
 * decide the collection's fate, so the phone *is* the scenario selector.
 */
const PHONE_SETTLES = '0971000001';

interface GoldenWorld {
  admin: AuthedContext;
  email: string;
  password: string;
  applicationId: string;
  applicationNumber: string;
  fullName: string;
}

let seeded: GoldenWorld | undefined;

function unwrap(json: any): any {
  return json && typeof json === 'object' && 'data' in json ? json.data : json;
}

/**
 * Allow the noise this harness makes that is not the platform answering.
 *
 * Identical set to the payment lane's, and for the same reasons: the error
 * reporter's DSN host does not exist here, the Lenco widget script is not
 * reachable, and a fee quote may legitimately 4xx while the student is still
 * choosing. The *request* channel stays strict for every other URL, so a real
 * 4xx/5xx from the platform still fails the run.
 */
function allowHarnessNoise(gate: {
  allowRequest: (p: string | RegExp) => unknown;
  allowConsole: (p: string | RegExp) => unknown;
}) {
  gate.allowRequest('glitchtip');
  gate.allowRequest('/api/v1/payments/quote/');
  gate.allowRequest('pay.lenco.co');
  gate.allowConsole('pay.lenco.co');
  gate.allowConsole('Content Security Policy');
  gate.allowConsole('Failed to load resource');
}

/**
 * Configure one tenant offering one canonical program on its own new intake,
 * with a configured application fee.
 *
 * A dedicated intake makes assignment resolution deterministic — exactly one
 * offering is linked to it — so the canonical create resolves without assuming a
 * seeded id (R4.7). The fee has to exist because task 8.1 made the quote fail
 * closed rather than invent one (STU-08), and this journey pays it.
 */
async function seedWorld(): Promise<GoldenWorld> {
  if (seeded) return seeded;

  const admin = await superAdminContext();
  const stamp = `${Date.now()}`.slice(-8);

  const canonical = (await listCanonicalPrograms(admin))[0];
  expect(canonical?.id, 'the harness should seed at least one canonical program').toBeTruthy();

  const { institutionId } = await createInstitutionViaApi(admin, {
    name: `Golden Lifecycle School ${stamp}`,
    code: `G106${stamp}`,
    hostname: `g106-${stamp}.localhost`,
  });
  const { intakeId } = await createIntake(admin, {
    name: `Golden Lifecycle Intake ${stamp}`,
    year: new Date().getFullYear() + 1,
  });
  const { offeringId } = await assignOffering(admin, institutionId, {
    canonical_program_id: canonical.id,
    name: canonical.name,
    code: `G106P${stamp}`,
  });
  await linkIntake(admin, { program_id: offeringId, intake_id: intakeId, max_capacity: 25 });
  await createFee(admin, offeringId, { amount: '153.00' });

  // Register the applicant, create their draft, and submit it through the
  // platform's own review command. Everything before `submitted` is the wizard's
  // lane (tasks 6.5 / 7.2); this journey starts where R13.7 does.
  const { ctx, email, password } = await registerAndLoginStudent();
  const session = await ctx.get('/api/v1/auth/session/?refresh_csrf=1');
  expect(session.ok(), 'session bootstrap should succeed').toBeTruthy();
  const csrf = session.headers()['x-csrf-token'] || '';
  expect(csrf, 'the session bootstrap should return an X-CSRF-Token header').toBeTruthy();

  const fullName = `Golden Applicant ${stamp}`;
  const { applicationId } = await createDraftApplication(ctx, csrf, {
    canonicalProgramId: canonical.id,
    intakeId,
    email,
    fullName,
    phone: `+260${PHONE_SETTLES.slice(1)}`,
  });

  // The student chose to pay later. This is the wizard's own command and it is
  // what makes leg 1 a *recovery* rather than a first payment.
  const defer = await ctx.post('/api/v1/payments/defer/', {
    headers: { 'x-csrf-token': csrf },
    data: { application_id: applicationId },
  });
  expect(defer.ok(), `deferring should succeed (got ${defer.status()}: ${await defer.text()})`)
    .toBeTruthy();

  const submit = await admin.ctx.post(`/api/v1/applications/${applicationId}/review/`, {
    headers: { 'x-csrf-token': admin.csrf },
    data: { new_status: 'submitted', notes: 'harness 10.6 golden-lifecycle setup' },
  });
  expect(
    submit.ok(),
    `admin submit should succeed (got ${submit.status()}: ${await submit.text()})`,
  ).toBeTruthy();

  const detail = await ctx.get(`/api/v1/applications/${applicationId}/`);
  expect(detail.ok(), `application read should succeed (got ${detail.status()})`).toBeTruthy();
  const payload = unwrap(await detail.json());
  const applicationNumber = (payload?.application ?? payload)?.application_number;
  expect(applicationNumber, 'a submitted application should carry an application number')
    .toBeTruthy();

  await ctx.dispose();

  seeded = { admin, email, password, applicationId, applicationNumber, fullName };
  return seeded;
}

test.beforeAll(async () => {
  await seedWorld();
});

test.afterAll(async () => {
  if (!seeded) return;
  await seeded.admin.ctx.dispose();
  seeded = undefined;
});

/**
 * Log this browser context in as the journey's applicant.
 *
 * The CSRF token is deliberately not returned: every write in this journey is
 * issued by the *page* (a click on a real control), so the app attaches its own
 * in-memory token. A token read here and reused would be testing the harness's
 * transport rather than the student's surface.
 */
async function loginApplicant(page: Page, world: GoldenWorld): Promise<void> {
  const login = await page.request.post('/api/v1/auth/login/', {
    data: { email: world.email, password: world.password },
  });
  expect(
    login.ok(),
    `the applicant should log in (got ${login.status()}: ${await login.text()})`,
  ).toBeTruthy();
  const session = await page.request.get('/api/v1/auth/session/?refresh_csrf=1');
  expect(session.ok(), 'session bootstrap should succeed').toBeTruthy();
}

/**
 * The workspace's own heading, which is how a leg proves it is on it.
 *
 * **Repointed by admissions-v2 task 11.3 (R13.1, STU-05), and this is the only
 * line of this file that task touched.** Every behavioural claim below is
 * unchanged; the string that identifies the page is not.
 *
 * This used to read *"A single view of where your application stands and what
 * happens next"* — the workspace's hero headline, which sat in the first viewport
 * above the student's own status and next action, beside a "Decision snapshot"
 * card that **derived a priority in the browser**. Task 11.3's bullet is "show
 * application status/next action first", and it cannot be satisfied while a
 * manifesto occupies the space the action belongs in, so the hero is gone and
 * task 11.1's `NextActionPanel` is the first thing on the page.
 *
 * The page's identifying heading is now `PageShell`'s own title, `Application
 * #{number}` — which is already what `official-document-durability.spec.ts`
 * matches on, so the two specs now agree about what "being on the workspace"
 * looks like instead of pinning two different strings.
 */
function workspaceHeading(page: Page) {
  return page.getByRole('heading', { name: /^Application #/ }).first();
}

async function openWorkspace(page: Page, applicationId: string): Promise<void> {
  await page.goto(WORKSPACE(applicationId), { waitUntil: 'domcontentloaded' });
  await expect(workspaceHeading(page)).toBeVisible({ timeout: 60_000 });
}

/**
 * Scroll one of the workspace's cards into view and return **the card**, not its
 * heading.
 *
 * Two reasons, both of which the first browser run demonstrated.
 *
 * *Scrolling*: the mobile project runs at 393×851, where the workspace is a
 * single long column, so a control eight sections down is off-screen and
 * `toBeVisible` would report a real product fact ("not in the viewport") as a
 * failure of the thing under test. Scrolling is what a student does.
 *
 * *Scoping*: the app shell puts a **"Payment"** item in the desktop sidebar,
 * pointing at the same `/student/payment` the workspace's own action points at. A
 * page-wide `a[href^="/student/payment"]` therefore matched the navigation and the
 * desktop run asserted against the sidebar. Every leg reads inside the card it
 * names, so a claim about the workspace cannot be satisfied by the chrome around
 * it. `SectionCard` renders a `<section>`, so that is the scope — the nearest
 * `div` is only the header row, which is why the first run's amendment locator
 * found nothing.
 */
async function reveal(page: Page, sectionTitle: string | RegExp) {
  const heading = page.getByRole('heading', { name: sectionTitle }).first();
  await heading.scrollIntoViewIfNeeded();
  await expect(heading).toBeVisible({ timeout: 30_000 });
  return heading.locator('xpath=ancestor::section[1]');
}

test.describe('The golden student lifecycle, in one canonical workspace (R13.7, R13.13)', () => {
  test('one student meets payment recovery, amendment, interview, communication, decision, their official document, and tracking on one workspace', async ({
    page,
    gate,
  }) => {
    // Seven legs, a real payment collection, and a document render. The default
    // 30 s is a per-*test* budget, not a per-assertion one.
    test.setTimeout(300_000);
    allowHarnessNoise(gate);

    const world = await seedWorld();
    await loginApplicant(page, world);

    // -----------------------------------------------------------------------
    // 0. The consolidation itself: the duplicate route redirects (R13.13)
    // -----------------------------------------------------------------------
    // A student's bookmark, or a link in an email sent before this task, points
    // at the retired workspace. It must land them on the canonical one — for the
    // *same* application, keeping any query string — rather than at a second page
    // with different actions (STU-23) or at a 404.
    await page.goto(`${RETIRED_DUPLICATE(world.applicationId)}?from=bookmark`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(workspaceHeading(page)).toBeVisible({ timeout: 60_000 });
    await expect
      .poll(() => new URL(page.url()).pathname, {
        timeout: 30_000,
        message: 'the retired duplicate should redirect to the canonical workspace',
      })
      .toBe(WORKSPACE(world.applicationId));
    expect(
      new URL(page.url()).search,
      'the redirect should carry the query string rather than dropping it',
    ).toBe('?from=bookmark');
    // `replace`, not `push`: Back must not bounce the student between two URLs
    // for one application. Going back leaves the workspace entirely.
    await page.goBack({ waitUntil: 'domcontentloaded' });
    expect(
      new URL(page.url()).pathname,
      'Back should not return to the redirect and be pushed forward again',
    ).not.toBe(RETIRED_DUPLICATE(world.applicationId));

    await openWorkspace(page, world.applicationId);

    // The workspace is about *this* application, and it says so with the
    // platform's own application number.
    const quickInfo = await reveal(page, /Quick information/i);
    await expect(quickInfo.getByText(`#${world.applicationNumber}`).first()).toBeVisible();

    // -----------------------------------------------------------------------
    // 1. Deferred payment recovery (R13.7, R12.3)
    // -----------------------------------------------------------------------
    // The student deferred before submitting. The workspace's job is to say that
    // an action is still owed and to hand them to the surface that owns
    // post-submission collection — the payment page — because R12.3 splits
    // ownership at submission and the workspace must not grow a second
    // collection form.
    /*
      **Repointed by admissions-v2 task 11.3 (R13.1, R16.5).** The claim is
      unchanged: a deferred fee is actionable from this one workspace. Where it is
      actionable *from* moved, and deliberately.

      This used to read inside the "Next actions" card, which carried a second copy
      of the payment affordance built in the browser (the page derived
      `{href, label}` from `requiresStudentPaymentAction` plus a status string and
      handed it down). Task 11.3 puts the platform's own next action first on this
      workspace through task 11.1's resolver, and a deferred fee is exactly what
      that resolver answers with — so the derived duplicate is gone (R16.5) and the
      read one is at the top of the page.

      Still scoped to a container rather than to the page, for the original reason:
      the desktop sidebar also links to `/student/payment`, and the claim is about
      the workspace, not the chrome around it.
    */
    const nextActionPanel = page.getByTestId('student-next-action');
    await expect(nextActionPanel).toBeVisible({ timeout: 60_000 });
    const payLink = nextActionPanel.locator(`a[href^="${PAYMENT_PAGE}"]`).first();
    await expect(
      payLink,
      'a deferred fee must be actionable from the one workspace, not a dead end',
    ).toBeVisible({ timeout: 30_000 });
    await expect(payLink).toContainText(/Complete deferred payment/i);
    await payLink.click();

    const paymentCard = page.locator(
      `[data-testid="payment-application"][data-application-id="${world.applicationId}"]`,
    );
    await expect(paymentCard).toBeVisible({ timeout: 60_000 });
    // The deferral is named as the choice the student made, not reported as an
    // unpaid fee they may have forgotten (task 8.3).
    await expect(paymentCard.getByTestId('payment-state-badge')).toContainText('Paying later');

    await paymentCard.getByTestId('payment-pay-action').click();
    const payForm = paymentCard.getByTestId('payment-inline-form');
    await expect(payForm).toBeVisible({ timeout: 30_000 });
    const payButton = payForm.getByTestId('pay-momo-button');
    await expect(payButton).toBeEnabled({ timeout: 60_000 });
    await payForm.locator('#momo-phone').fill(PHONE_SETTLES);
    await payButton.click();

    await expect
      .poll(
        async () => {
          const rows = await readPaymentRows(page.request, world.applicationId);
          return rows.some((row) => row.status === 'successful');
        },
        {
          timeout: 120_000,
          message: 'the deferred fee should settle when paid after submission',
        },
      )
      .toBe(true);

    // Back on the workspace, the payment position is the platform's own answer.
    await openWorkspace(page, world.applicationId);
    await expect(page.getByText(/Paid|Verified|Payment (received|confirmed)/i).first())
      .toBeVisible({ timeout: 30_000 });

    // -----------------------------------------------------------------------
    // 2. Amendment (R13.6, R13.10)
    // -----------------------------------------------------------------------
    // Requested from the workspace, and answered by the workspace's own history —
    // the surface finding STU-17 said did not exist.
    await reveal(page, /Request an amendment/i);
    const amendedPhone = '+260966123123';
    await page.locator('#amend-field').selectOption('phone');
    await page.locator('#amend-value').fill(amendedPhone);
    await page
      .locator('#amend-reason')
      .fill('My original number is no longer reachable; please use this one.');
    await page.getByRole('button', { name: /Submit amendment request/i }).click();

    const amendmentHistory = await reveal(page, /Your amendment requests/i);
    await expect(
      amendmentHistory.getByText(amendedPhone).first(),
      'the request the student just made should appear in their own history',
    ).toBeVisible({ timeout: 30_000 });
    await expect(amendmentHistory.getByText('PENDING').first()).toBeVisible();

    // -----------------------------------------------------------------------
    // 3. Interview (R13.3)
    // -----------------------------------------------------------------------
    // Scheduled by the school through its own command, then read here. The
    // assertion is the affordance the *retired* page had and the canonical one did
    // not before this task: a virtual interview's location rendered as a joinable
    // link rather than as an unclickable string. That difference is STU-23's
    // "different actions" made concrete, so it is the thing worth pinning.
    const meetingUrl = 'https://meet.example.com/golden-lifecycle-106';
    const scheduledAt = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();
    const schedule = await world.admin.ctx.post(
      `/api/v1/applications/${world.applicationId}/interviews/`,
      {
        headers: { 'x-csrf-token': world.admin.csrf },
        data: {
          scheduled_at: scheduledAt,
          mode: 'virtual',
          location: meetingUrl,
          notes: 'Please join five minutes early.',
        },
      },
    );
    expect(
      schedule.ok(),
      `the school should be able to schedule the interview (got ${schedule.status()}: ${await schedule.text()})`,
    ).toBeTruthy();

    await openWorkspace(page, world.applicationId);
    await reveal(page, /Interview Scheduled/i);
    const meetingLink = page.getByRole('link', { name: meetingUrl });
    await expect(
      meetingLink,
      'a virtual interview must be joinable from the one workspace',
    ).toBeVisible({ timeout: 30_000 });
    await expect(meetingLink).toHaveAttribute('href', meetingUrl);
    await expect(meetingLink).toHaveAttribute('rel', /noopener/);

    // -----------------------------------------------------------------------
    // 4. Communication (R13.2, R13.4)
    // -----------------------------------------------------------------------
    // The workspace reaches the *single* inbox rather than growing a second one
    // (task 10.1 / STU-14), and the messages this journey generated are in it
    // with the delivery state only that surface holds.
    const messagesCard = await reveal(page, /Messages and notifications/i);
    const inboxLink = messagesCard.locator(`a[href="${INBOX}"]`).first();
    await expect(inboxLink).toBeVisible({ timeout: 30_000 });
    await inboxLink.click();
    await expect
      .poll(() => new URL(page.url()).pathname, {
        timeout: 30_000,
        message: 'the workspace should reach the one communications history',
      })
      .toBe(INBOX);

    const messages = await page.request.get('/api/v1/notifications/?pageSize=50');
    expect(messages.ok(), 'the inbox should be readable').toBeTruthy();
    const messageRows: any[] = unwrap(await messages.json())?.results ?? [];
    expect(
      messageRows.length,
      'the lifecycle so far should have produced at least one message',
    ).toBeGreaterThan(0);
    const firstMessage = messageRows[0];
    await expect(
      page.locator(`[data-testid="delivery-${firstMessage.id}"]`),
      "a message's delivery state belongs to the one inbox, and is rendered there",
    ).toBeVisible({ timeout: 30_000 });

    // -----------------------------------------------------------------------
    // 5. Decision (R13.2)
    // -----------------------------------------------------------------------
    // The school decides, and the workspace's own state *and* recorded-changes
    // history move with it. The history is the platform's
    // `ApplicationStatusHistory`, which no student surface read before this task.
    //
    // The decision is `under_review → approved`, not `submitted → under_review`:
    // scheduling the interview already moved the application into review (the
    // interview service owns that transition), which the first browser run
    // reported as `INVALID_TRANSITION` rather than letting the journey assert a
    // decision that had already happened. Approving is also the stronger claim —
    // it is a decision with a consequence, and the platform only permits it
    // because this journey actually paid the fee in leg 1.
    const review = await world.admin.ctx.patch(
      `/api/v1/applications/${world.applicationId}/review/`,
      {
        headers: { 'x-csrf-token': world.admin.csrf },
        data: {
          new_status: 'approved',
          notes: 'Assigned to the admissions panel and approved.',
        },
      },
    );
    expect(
      review.ok(),
      `the review decision should be accepted (got ${review.status()}: ${await review.text()})`,
    ).toBeTruthy();

    await openWorkspace(page, world.applicationId);
    await expect(page.getByText(/Approved/i).first()).toBeVisible({ timeout: 30_000 });
    const recordedChanges = await reveal(page, /Recorded changes/i);
    const history = recordedChanges.getByTestId('application-status-history');
    await expect(history).toBeVisible({ timeout: 30_000 });
    await expect(
      history.getByText('Assigned to the admissions panel and approved.'),
      "the note the reviewer left is the student's answer to \u201cdid they say why\u201d",
    ).toBeVisible();

    // -----------------------------------------------------------------------
    // 6. Official document download (R13.5, R13.11)
    // -----------------------------------------------------------------------
    // The slip is requested, rendered and downloaded from the workspace's own
    // document controls — the canonical official-document family, not a
    // browser-side renderer and not the `/email-slip/` route this task removed.
    const documentsCard = await reveal(page, /Documents and records/i);
    /*
      **Repointed by admissions-v2 task 11.3 (STU-05).** The claim is unchanged:
      the slip is requested and downloaded from the workspace's own document
      controls. What it takes to reach it changed, and that change *is* the task.

      This used to read: the card renders each control twice — a `sm:hidden` mobile
      `<details>` and a `hidden sm:flex` desktop row — so a bare test-id matched
      both and exactly one was ever visible. There is one render at every width
      now, so the duplicate is gone and `visible=true` is no longer disambiguating
      anything.

      The tap that remains is a different one, and it is deliberate. By this point
      the application is **approved**, so the document worth the one prominent
      control is the *acceptance letter*; the slip is a secondary document, and
      secondary documents live behind the counted disclosure. That is exactly
      STU-05's remedy ("one primary action, and an accessible overflow/menu for
      secondary document commands"), so the journey opens the sheet the way a
      student does rather than asserting the old flat stack.
    */
    const sheetTrigger = documentsCard.getByTestId('document-options-trigger');
    await sheetTrigger.scrollIntoViewIfNeeded();
    await expect(sheetTrigger).toBeVisible({ timeout: 30_000 });
    if ((await sheetTrigger.getAttribute('aria-expanded')) !== 'true') {
      await sheetTrigger.click();
      await expect(sheetTrigger).toHaveAttribute('aria-expanded', 'true');
    }
    const slipControl = documentsCard.getByTestId(`official-document-${SLIP}`).first();
    await slipControl.scrollIntoViewIfNeeded();
    await expect(slipControl).toBeVisible({ timeout: 30_000 });

    // Ask for it, then wait on the platform's own published status rather than on
    // a spinner: task 10.4 made that status the truth about durable work.
    // SJR task 3.17: the control that asks for the slip is "Prepare".
    await slipControl.getByRole('button', { name: /Prepare Application Slip/i }).click();
    await expect
      .poll(
        async () => {
          const response = await page.request.get(
            `/api/v1/applications/${world.applicationId}/official-documents/${SLIP}/`,
          );
          if (!response.ok()) return null;
          return unwrap(await response.json())?.status;
        },
        { timeout: 120_000, message: 'the application slip should reach ready' },
      )
      .toBe('ready');

    const issued = unwrap(
      await (
        await page.request.get(
          `/api/v1/applications/${world.applicationId}/official-documents/${SLIP}/`,
        )
      ).json(),
    );
    expect(issued?.document_id, 'a ready slip is a stored record with an id').toBeTruthy();
    expect(
      issued?.download_url,
      'and the platform, not the browser, produces the file',
    ).toBeTruthy();

    // -----------------------------------------------------------------------
    // 7. Terminal tracking (R13.7, R13.12)
    // -----------------------------------------------------------------------
    // The tracking link is issued from this workspace — the control lived only on
    // the retired page, so this leg is also the parity proof that consolidating
    // did not delete the student's only shareable credential. It then opens the
    // status in a context with **no session**, which is what "shareable" means.
    await openWorkspace(page, world.applicationId);
    const trackingCard = await reveal(page, /Public tracking/i);
    const trackingAction = trackingCard.getByTestId('tracking-link-action');
    await trackingAction.scrollIntoViewIfNeeded();
    await expect(trackingAction).toBeVisible({ timeout: 30_000 });
    await trackingAction.getByRole('button', { name: /Get tracking link/i }).click();

    const issuedUrl = page.getByTestId('issued-tracking-url');
    await expect(issuedUrl).toBeVisible({ timeout: 60_000 });
    const shareUrl = ((await issuedUrl.textContent()) || '').trim();
    expect(shareUrl, 'the workspace should offer a share URL').toBeTruthy();

    // The credential is the random token, and nothing about the applicant.
    expect(
      shareUrl,
      'the share URL must not carry the sequential application number (R13.12)',
    ).not.toContain(world.applicationNumber);
    expect(shareUrl.toLowerCase()).not.toContain(world.email.toLowerCase());
    const trackingCode = new URL(shareUrl, page.url()).searchParams.get('code') || '';
    expect(trackingCode, 'the share URL should carry a tracking code').toMatch(/^TRK-/i);

    // Terminal: a stranger with the link, and no session at all.
    const anonymous = await page.context().browser()!.newContext();
    try {
      const anonymousPage = await anonymous.newPage();
      await anonymousPage.goto(
        `/track-application?code=${encodeURIComponent(trackingCode)}`,
        { waitUntil: 'domcontentloaded' },
      );
      await expect(
        anonymousPage.getByText(`#${world.applicationNumber}`).first(),
        'the issued link should open the status with no session',
      ).toBeVisible({ timeout: 60_000 });
      // And it discloses the status, not the applicant.
      await expect(anonymousPage.getByText(world.fullName)).toHaveCount(0);
      await expect(anonymousPage.getByText(world.email)).toHaveCount(0);
    } finally {
      await anonymous.close();
    }

    // The workspace is still the one address for all of it.
    //
    // Not asserted here: `gate.consoleErrors === []`. The fixture already fails
    // the run on any console error that is not allow-listed, and re-asserting the
    // raw array would contradict `allowHarnessNoise` — the blocked Lenco widget
    // script and its CSP notice are this harness's own environment, deliberately
    // named as expected above. The gate is the authority; a second, stricter copy
    // of it here would only fail for a reason the run already accepted.
    await openWorkspace(page, world.applicationId);
    expect(new URL(page.url()).pathname).toBe(WORKSPACE(world.applicationId));

    // Leave the payment adapter drained: this journey opened a real collection and
    // the harness drain gate is entitled to a settled ledger.
    const rows = await readPaymentRows(page.request, world.applicationId);
    expect(
      rows.some((row) => row.status === 'successful'),
      'the lifecycle leaves one settled payment behind',
    ).toBe(true);
  });
});
