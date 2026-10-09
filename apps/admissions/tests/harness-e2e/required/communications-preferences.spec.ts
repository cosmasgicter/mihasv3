/**
 * Required V2 harness — a notification preference is a real control, and the one
 * inbox says what happened to each message (task 10.1).
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 10.1 —
 *               "Consolidate notifications and communications".
 * Requirements: **R13.3** (the supported preference schema with real GET/PUT
 *               controls; a mandatory transactional message is not a preference),
 *               **R13.4** (the communications history states delivery state and
 *               channel without exposing provider payloads, and retry is an
 *               authorized audited command), **R13.8** (reject unknown
 *               whatsapp/in-app fields unless actually implemented; merge the
 *               duplicate inbox concepts and put Communications in mobile More).
 * Findings:     **STU-14**, **STU-24**.
 *
 * This file is the task's `_Evidence:` line — *preference persistence,
 * mandatory-message, delivery/retry, mobile-nav E2E*. The first three have
 * endpoint coverage in
 * `backend/tests/unit/test_notification_preferences_10_1.py` (92 cases); what no
 * endpoint test can observe is whether the **browser** honours any of it, and
 * that is precisely where STU-14 lived:
 *
 * > the endpoint accepted and stored nine fields, and the page rendered three
 * > read-only tiles reading "Always on", "Always on" and "Coming soon" — so the
 * > preference fetch was decorative and no test failed.
 *
 * A drift finding between a server and a screen is only closed by looking at the
 * screen. The fourth item — mobile navigation — has no server surface at all.
 *
 * The five journeys:
 *
 *   1. **a switch is a real control.** Turning email off persists: the PUT
 *      carries the server's own writable field name, and after a full reload the
 *      switch is still off because the *server* said so.
 *   2. **a mandatory message states a fact and offers no switch.** The inbox
 *      channel and application updates render the server's definition with no
 *      toggle at all — not a disabled one, which reads as something the student
 *      failed to turn on — and the endpoint refuses them too.
 *   3. **a refusal is the server's, with the server's reason.** The page renders
 *      the published refusal table (`whatsapp_enabled`, `in_app_enabled`, quiet
 *      hours, timezone, SMS) using the server's own wording, renders **no**
 *      control for any of them, and the endpoint refuses each with its own
 *      distinct code and stores nothing.
 *   4. **a failed message offers a retry, and the retry is visible after.** The
 *      inbox shows the email state per channel, a terminally failed email offers
 *      one retry, the retry says "queued again" rather than claiming delivery,
 *      and the attempt count moves — with no provider text or address anywhere in
 *      the payload.
 *   5. **one inbox, reachable from mobile.** The bottom-nav Inbox tab is the
 *      communications history, notification settings live one level down in More,
 *      and the retired second inbox that used to sit under the placeholder tiles
 *      on `/student/notifications` is asserted **absent**.
 *
 * Nothing here is mocked. The harness runs the real Django delivery gate, so the
 * per-channel states on screen are the ones `resolve_delivery` actually recorded
 * and the retry is the real owner-scoped, state-guarded, audited command.
 *
 * Runs with the strict gates active (`harness-fixtures.ts`): zero skips, no
 * console errors, no unhandled exceptions, no unasserted failed requests. Both
 * the desktop and the mobile project run every journey.
 */
import { test, expect, type Page } from '../harness-fixtures';
import {
  assignOffering,
  createDraftApplication,
  createIntake,
  createInstitutionViaApi,
  forceSubmitApplication,
  listCanonicalPrograms,
  linkIntake,
  registerAndLoginStudent,
  superAdminContext,
  type AuthedContext,
} from '../helpers/api';
import {
  exhaustEmailDeliveryAttempts,
  readEmailQueueIdForNotification,
} from '../helpers/ops';

const SETTINGS_URL = '/student/notifications';
const INBOX_URL = '/student/communications';
const PREFERENCES_API = '/api/v1/notifications/preferences/';

/**
 * The one channel a student may switch, and the mandatory pair they may not.
 *
 * Named as *expectations of the published schema* rather than as a field list
 * this spec owns: every journey reads the live schema and asserts the server
 * still classifies these the way R13.3 requires. A platform that made the inbox
 * optional would fail journey 2, which is the point.
 */
const CONFIGURABLE_CHANNEL = 'email';
const MANDATORY_CHANNEL = 'in_app';
const MANDATORY_CATEGORY = 'application_updates';

/** Every field the schema publishes as refused. */
const REFUSED_FIELDS = [
  'sms_enabled',
  'whatsapp_enabled',
  'in_app_enabled',
  'marketing_emails',
  'application_updates',
  'quiet_hours_start',
  'quiet_hours_end',
  'timezone',
] as const;

/**
 * The refusal table holds **two** kinds of entry, and they render differently.
 *
 * A field refused because *the platform cannot do it* has nothing on screen but
 * its named absence — there is no message class to describe and no state to
 * report. A field refused because *it is not the student's to switch* describes a
 * real, mandatory message class, so it is also rendered as a stated fact (that is
 * journey 2). Collapsing the two would mean either hiding that a decision is
 * always sent, or offering a control for a channel the platform has no provider
 * for. The refusal codes already distinguish them, so this reads them rather than
 * keeping a second list.
 */
const MANDATORY_REFUSAL_CODES = new Set(['CHANNEL_MANDATORY', 'CATEGORY_MANDATORY']);

function unwrap(json: any): any {
  return json && typeof json === 'object' && 'data' in json ? json.data : json;
}

// ---------------------------------------------------------------------------
// Identities and setup
// ---------------------------------------------------------------------------
//
// One platform admin for the file (it configures the offering and issues the
// submit command) and **one student per journey**, so a preference write in one
// journey can never be read as another journey's persistence.

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

interface HarnessOffering {
  canonicalProgramId: string;
  intakeId: string;
}

/**
 * A tenant offering one canonical program on a brand-new intake.
 *
 * Only journey 4 needs it — a delivery record exists because the platform sent a
 * real message, and the message this task's own producer map classifies as
 * `application_updates` is the submission confirmation. A dedicated intake makes
 * assignment resolution deterministic (exactly one offering is linked to it), so
 * the canonical create resolves without assuming a seeded id (R4.7).
 */
let sharedOffering: Promise<HarnessOffering> | null = null;
function messageProducingOffering(): Promise<HarnessOffering> {
  sharedOffering ??= (async () => {
    const admin = await platformAdmin();
    const stamp = `${Date.now()}`.slice(-8);
    const canonical = (await listCanonicalPrograms(admin))[0];
    expect(canonical?.id, 'the harness should seed at least one canonical program').toBeTruthy();
    const { institutionId } = await createInstitutionViaApi(admin, {
      name: `Comms School ${stamp}`,
      code: `C101${stamp}`,
      hostname: `c101-${stamp}.localhost`,
    });
    const { intakeId } = await createIntake(admin, {
      name: `Comms Intake ${stamp}`,
      year: 2027,
    });
    const { offeringId } = await assignOffering(admin, institutionId, {
      canonical_program_id: canonical.id,
      name: canonical.name,
      code: `C101P${stamp}`,
    });
    await linkIntake(admin, { program_id: offeringId, intake_id: intakeId, max_capacity: 25 });
    return { canonicalProgramId: canonical.id as string, intakeId };
  })();
  return sharedOffering;
}

/** Register this journey's student and log the browser context in as them. */
async function loginStudent(page: Page): Promise<{ email: string; csrf: string }> {
  const { ctx, email, password } = await registerAndLoginStudent();
  // The API-context session is not reused: the journey logs this identity in
  // through its own browser context.
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

/**
 * A CSRF token for a direct state-changing call from the test's own context.
 *
 * The platform issues the token in the `X-CSRF-Token` response header and the app
 * keeps it in memory only, so a test that writes outside the browser has to ask
 * for one the same way the app's bootstrap does (`?refresh_csrf=1`).
 */
async function freshCsrf(page: Page): Promise<string> {
  const session = await page.request.get('/api/v1/auth/session/?refresh_csrf=1');
  expect(session.ok(), `session bootstrap should succeed (got ${session.status()})`).toBeTruthy();
  const csrf = session.headers()['x-csrf-token'] || '';
  expect(csrf, 'the session bootstrap should issue a CSRF token').toBeTruthy();
  return csrf;
}

/** The live published schema, read the way the app reads it. */
async function publishedSchema(page: Page): Promise<any> {
  const response = await page.request.get(PREFERENCES_API);
  expect(
    response.ok(),
    `the preference schema should be readable (got ${response.status()}: ${await response.text()})`,
  ).toBeTruthy();
  return unwrap(await response.json());
}

/**
 * The caller's own newest message whose email channel the platform actually
 * tracked, or `undefined`.
 *
 * Read through the student's own inbox endpoint, so the shape under test is the
 * one the browser renders. "Tracked" means the delivery gate decided email was
 * used and recorded an attempt — a message whose email was suppressed by a
 * setting or never applicable is a different journey.
 */
async function trackedMessage(page: Page): Promise<any | undefined> {
  const response = await page.request.get('/api/v1/notifications/?pageSize=20');
  if (!response.ok()) return undefined;
  const rows = unwrap(await response.json())?.results ?? [];
  return rows.find((row: any) =>
    (row.channels ?? []).some((c: any) => c.channel === 'email' && (c.attempts ?? 0) > 0),
  );
}

/**
 * Open the preferences screen and wait for the server's rows to render.
 *
 * The page heading is matched as the `h1` rather than by role, because the mobile
 * shell also renders the page name in its header — two headings with the same
 * accessible name, which is correct for the shell and ambiguous for a locator.
 */
async function openPreferences(page: Page): Promise<void> {
  await page.goto(SETTINGS_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1', { hasText: 'Notification settings' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator(`[data-testid="preference-row-${CONFIGURABLE_CHANNEL}"]`)).toBeVisible({
    timeout: 30_000,
  });
}

// ---------------------------------------------------------------------------
// 1. A switch is a real control (R13.3, STU-14)
// ---------------------------------------------------------------------------

test('turning the email channel off persists across a reload', async ({ page, gate }) => {
  await loginStudent(page);

  const schema = await publishedSchema(page);
  const channel = (schema.channels ?? []).find((c: any) => c.key === CONFIGURABLE_CHANNEL);
  expect(channel, 'the schema should publish an email channel').toBeTruthy();
  expect(channel.configurable, 'the email channel should be configurable').toBe(true);
  expect(channel.enabled, 'a fresh student should start with email on').toBe(true);
  // No row is stored yet, so the server is explicit that these are its defaults.
  expect(schema.is_default, 'a fresh student should be reading the published defaults').toBe(true);

  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'PUT') return;
    if (!new URL(request.url()).pathname.endsWith('/notifications/preferences/')) return;
    writes.push(request.postData() || '');
  });

  await openPreferences(page);
  const toggle = page.locator(`[data-testid="preference-switch-${CONFIGURABLE_CHANNEL}"]`);
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  await toggle.click();
  // The screen re-renders from the PUT's own response, so "Saved" means stored.
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');

  // The write carried the server's own writable field name — the browser holds no
  // field list of its own (the drift STU-14 named).
  expect(writes.length, 'the toggle should issue exactly one write').toBe(1);
  expect(writes[0]).toContain(channel.field);
  expect(JSON.parse(writes[0])).toEqual({ [channel.field]: false });

  // The claim is *persistence*, so the page is thrown away and re-read.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator(`[data-testid="preference-switch-${CONFIGURABLE_CHANNEL}"]`)).toHaveAttribute(
    'aria-checked',
    'false',
    { timeout: 30_000 },
  );

  // And the server agrees, without a browser in the way.
  const stored = await publishedSchema(page);
  expect(stored.is_default, 'a stored row is no longer the defaults').toBe(false);
  expect(
    (stored.channels ?? []).find((c: any) => c.key === CONFIGURABLE_CHANNEL)?.enabled,
    'the stored schema should report email off',
  ).toBe(false);

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

// ---------------------------------------------------------------------------
// 2. A mandatory message is a stated fact, not a switch (R13.3)
// ---------------------------------------------------------------------------

test('a mandatory channel and category are stated, not offered as switches', async ({
  page,
  gate,
}) => {
  await loginStudent(page);
  const schema = await publishedSchema(page);

  const inbox = (schema.channels ?? []).find((c: any) => c.key === MANDATORY_CHANNEL);
  const updates = (schema.categories ?? []).find((c: any) => c.key === MANDATORY_CATEGORY);
  expect(inbox?.mandatory, 'the inbox channel should be mandatory').toBe(true);
  expect(inbox?.configurable, 'a mandatory channel is not configurable').toBe(false);
  expect(updates?.kind, 'application updates should be a mandatory category').toBe('mandatory');
  expect(updates?.configurable, 'a mandatory category is not configurable').toBe(false);
  // Neither has anywhere to store an answer, because there is no answer to store.
  expect(inbox?.field, 'a mandatory channel has no stored column').toBeNull();
  expect(updates?.field, 'a mandatory category has no stored column').toBeNull();

  await openPreferences(page);

  for (const key of [MANDATORY_CHANNEL, MANDATORY_CATEGORY]) {
    const row = page.locator(`[data-testid="preference-row-${key}"]`);
    await expect(row).toBeVisible();
    // A stated fact...
    await expect(page.locator(`[data-testid="preference-always-on-${key}"]`)).toBeVisible();
    // ...with the server's own definition, not copy this app invented.
    const definition = key === MANDATORY_CHANNEL ? inbox.definition : updates.definition;
    expect(definition, 'the server should publish a definition').toBeTruthy();
    await expect(row).toContainText(definition);
    // ...and no switch at all. Not a disabled one: a greyed-out toggle reads as a
    // control the student failed to use.
    await expect(page.locator(`[data-testid="preference-switch-${key}"]`)).toHaveCount(0);
  }

  // The frontend is never the boundary — the endpoint refuses them too, and each
  // for its own reason. These refusals are this journey's asserted error paths
  // (R18.4).
  gate.allowRequest(PREFERENCES_API);
  const csrf = await freshCsrf(page);
  for (const [field, expectedCode] of [
    [MANDATORY_CATEGORY, 'CATEGORY_MANDATORY'],
    ['in_app_enabled', 'CHANNEL_MANDATORY'],
  ] as const) {
    const refused = await page.request.put(PREFERENCES_API, {
      headers: { 'x-csrf-token': csrf },
      data: { [field]: false },
    });
    expect(refused.status(), `${field} should be refused`).toBe(400);
    const body = await refused.json();
    expect(body.code).toBe('UNSUPPORTED_PREFERENCE');
    const rejected = (body.details?.rejected ?? []).find((r: any) => r.field === field);
    expect(rejected?.code, `${field} should carry its own code`).toBe(expectedCode);
    expect(rejected?.reason, `${field} should carry a stated reason`).toBeTruthy();
  }

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

// ---------------------------------------------------------------------------
// 3. A refusal is the server's, with the server's reason (R13.8)
// ---------------------------------------------------------------------------

test('every unsupported field is named with the server reason and rendered as no control', async ({
  page,
  gate,
}) => {
  await loginStudent(page);
  const schema = await publishedSchema(page);

  const refusals: { field: string; code: string; reason: string }[] = schema.unsupported_fields ?? [];
  // The published table is complete: the fields the platform cannot honour are
  // *named*, so their absence from the screen is explained rather than mysterious.
  expect(refusals.map((r) => r.field).sort()).toEqual([...REFUSED_FIELDS].sort());
  // `whatsapp` and `in_app` must not collapse into one code — a reader has to be
  // able to tell "not implemented" from "not yours".
  const codeFor = (field: string) => refusals.find((r) => r.field === field)?.code;
  expect(codeFor('whatsapp_enabled')).toBe('CHANNEL_NOT_IMPLEMENTED');
  expect(codeFor('in_app_enabled')).toBe('CHANNEL_MANDATORY');

  await openPreferences(page);
  const list = page.locator('[data-testid="unsupported-preference-list"]');
  await expect(list).toBeVisible();

  for (const refusal of refusals) {
    expect(refusal.reason, `${refusal.field} should ship a reason`).toBeTruthy();
    // The server's wording is on screen...
    await expect(list).toContainText(refusal.reason);
    // ...and there is no switch for it, whichever kind of refusal it is. A field
    // the platform will refuse is never offered as a control.
    await expect(page.locator(`[data-testid="preference-switch-${refusal.field}"]`)).toHaveCount(0);
    if (!MANDATORY_REFUSAL_CODES.has(refusal.code)) {
      // A field the platform cannot do has no row either — no tile, no "coming
      // soon", nothing but the named absence. That copy is what STU-14 found.
      await expect(page.locator(`[data-testid="preference-row-${refusal.field}"]`)).toHaveCount(0);
    }
  }
  // The retired copy, counted at zero. STU-14's three tiles were badges reading
  // exactly "Always on", "Always on" and "Coming soon" — labels standing in for
  // controls. `exact` matters: the server's *reason* for the inbox channel is a
  // sentence ending "in-app delivery is always on", which is an explanation and
  // not a badge, and demanding its absence would be demanding the platform stop
  // explaining itself.
  await expect(page.getByText('Coming soon', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Always on', { exact: true })).toHaveCount(0);

  // One bad field refuses the *whole* write and stores nothing — a partial accept
  // would leave the screen disagreeing with the row, which is this finding.
  gate.allowRequest(PREFERENCES_API);
  const csrf = await freshCsrf(page);
  const mixed = await page.request.put(PREFERENCES_API, {
    headers: { 'x-csrf-token': csrf },
    data: { email_enabled: false, whatsapp_enabled: true },
  });
  expect(mixed.status(), 'a write naming an unsupported field is refused whole').toBe(400);
  const after = await publishedSchema(page);
  expect(
    (after.channels ?? []).find((c: any) => c.key === CONFIGURABLE_CHANNEL)?.enabled,
    'the accompanying valid field must not have been stored',
  ).toBe(true);
  expect(after.is_default, 'a refused write should store no row at all').toBe(true);

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

// ---------------------------------------------------------------------------
// 4. Delivery state per channel, and a retry that is visible afterwards (R13.4)
// ---------------------------------------------------------------------------

test('a failed email states its channel, offers one retry, and the retry shows in the history', async ({
  page,
  gate,
}) => {
  const offering = await messageProducingOffering();
  const { email, csrf } = await loginStudent(page);

  // A delivery record exists because the platform sent a real message: the
  // submission confirmation, which `TEMPLATE_CATEGORIES` classifies as
  // `application_updates`. Reaching `submitted` is journey setup.
  const { applicationId } = await createDraftApplication(page.request, csrf, {
    canonicalProgramId: offering.canonicalProgramId,
    intakeId: offering.intakeId,
    email,
  });
  await forceSubmitApplication(await platformAdmin(), applicationId);

  // The message, as the student's own inbox reports it.
  await expect
    .poll(async () => Boolean(await trackedMessage(page)), {
      timeout: 60_000,
      message: 'the submission should produce a message with a tracked email channel',
    })
    .toBe(true);
  const message = (await trackedMessage(page)) as any;

  // R13.4's "no secrets or internal provider payloads": the raw material for the
  // state is `EmailQueue.error_message` and `recipient_email`. Neither travels.
  const payload = JSON.stringify(message);
  expect(payload, 'the recipient address must not be published').not.toContain(email);
  expect(payload, 'provider text must not be published').not.toContain('SMTP');
  expect(payload, 'provider text must not be published').not.toContain('Resend');
  // The message class the server resolved, not the call site's guess.
  expect(message.audience).toBe('student');
  expect(message.category).toBe(MANDATORY_CATEGORY);

  // Spend the platform's own send attempts so its own classifier says `failed`.
  const exhausted = await exhaustEmailDeliveryAttempts(
    await readEmailQueueIdForNotification(message.id),
  );
  expect(exhausted.status, 'the platform should classify the email terminally failed').toBe(
    'failed',
  );

  // The inbox states it, per channel, with the server's own vocabulary.
  await page.goto(INBOX_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1', { hasText: 'Communications' })).toBeVisible({
    timeout: 30_000,
  });
  const inAppBadge = page.locator(`[data-testid="delivery-${message.id}-in_app"]`);
  const emailBadge = page.locator(`[data-testid="delivery-${message.id}-email"]`);
  await expect(inAppBadge).toBeVisible({ timeout: 30_000 });
  await expect(inAppBadge).toHaveAttribute('data-state', 'delivered');
  await expect(emailBadge).toHaveAttribute('data-state', 'failed', { timeout: 30_000 });
  // The audience travels onto the rendered surface.
  await expect(page.locator(`[data-testid="delivery-${message.id}"]`)).toHaveAttribute(
    'data-audience',
    'student',
  );

  // One retry is offered — and it is the server's `can_retry`, not a guess from
  // the state string, because the ceiling and attempt count are the server's.
  const retry = page.locator(`[data-testid="retry-${message.id}"]`);
  await expect(retry).toBeVisible();
  await retry.click();

  // "Queued again", not "sent": the retry writes a durable outbox row and
  // dispatches on commit, so nothing has been delivered at this moment. Claiming
  // delivery here would be the phantom-progress defect this spec keeps finding.
  await expect(page.getByText(/Queued again/i)).toBeVisible({ timeout: 30_000 });

  // The retry is visible in the history afterwards: a second attempt is recorded,
  // the message has left `failed`, and a second retry is not offered.
  await expect
    .poll(
      async () => {
        const response = await page.request.get('/api/v1/notifications/?pageSize=20');
        if (!response.ok()) return null;
        const rows = unwrap(await response.json())?.results ?? [];
        const row = rows.find((r: any) => r.id === message.id);
        return (row?.channels ?? []).find((c: any) => c.channel === 'email') ?? null;
      },
      { timeout: 60_000, message: 'the retry should appear as a further attempt' },
    )
    .toMatchObject({ attempts: 2, can_retry: false });

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

// ---------------------------------------------------------------------------
// 5. One inbox, reachable from mobile (R13.8)
// ---------------------------------------------------------------------------

test('the inbox is a navigation destination and the retired second inbox is gone', async ({
  page,
  gate,
}) => {
  await loginStudent(page);
  await page.goto('/student/dashboard', { waitUntil: 'domcontentloaded' });

  // The navigation offers the inbox, and the label the student taps takes them to
  // the communications history. Before 10.1 the primary mobile tab was "Alerts"
  // pointing at `/student/notifications` — the placeholder settings screen with a
  // second copy of the inbox underneath it — and the desktop sidebar offered only
  // that same screen under the label "Notifications".
  //
  // The bottom bar is `md:hidden` and the sidebar drawer is closed until it is
  // opened, so *which* element carries the link depends on the project's
  // viewport. The claim is the same for both: **a link to the one inbox is
  // visible without opening anything**. Asserting the mobile bar in the desktop
  // project would test the breakpoint, and asserting per project would let one
  // viewport go unchecked — which is how the desktop sidebar was left offering
  // only the preferences screen.
  const visibleInboxLink = page.locator(`a[href="${INBOX_URL}"]:visible`).first();
  await expect(visibleInboxLink).toBeVisible({ timeout: 30_000 });

  // The retired destination is not offered as the place messages are read: every
  // visible link to the preferences screen names itself as settings.
  for (const label of await page.locator(`a[href="${SETTINGS_URL}"]:visible`).allInnerTexts()) {
    expect(
      label.toLowerCase(),
      'a link to the preferences screen must not present itself as the inbox',
    ).toContain('setting');
  }

  await visibleInboxLink.click();
  await expect(page.locator('h1', { hasText: 'Communications' })).toBeVisible({
    timeout: 30_000,
  });

  // Notification settings live one level down, next to the rest of the settings,
  // and are reachable from the inbox itself.
  const openSettings = page.locator('[data-testid="open-notification-settings"]');
  await expect(openSettings).toBeVisible();
  await expect(openSettings).toHaveAttribute('href', SETTINGS_URL);
  await openSettings.click();
  await expect(page.locator('h1', { hasText: 'Notification settings' })).toBeVisible({
    timeout: 30_000,
  });

  // The retired surface, counted at zero: `/student/notifications` is
  // preferences only. The second inbox that used to sit under the three
  // read-only tiles — its list, its per-message actions and its mark-all-read —
  // is gone, and the round trip back to the one inbox is offered instead.
  await expect(page.getByRole('button', { name: /mark all read/i })).toHaveCount(0);
  await expect(page.locator('[data-testid^="delivery-"]')).toHaveCount(0);
  const openInbox = page.locator('[data-testid="open-inbox"]');
  await expect(openInbox).toBeVisible();
  await expect(openInbox).toHaveAttribute('href', INBOX_URL);

  // STU-24: the support affordance is resolved from tenant context. It is never a
  // hardcoded address and never a legacy school's.
  const support = page.locator('[data-testid="notification-support-link"]');
  await expect(support).toBeVisible();
  const href = (await support.getAttribute('href')) || '';
  expect(href, 'support should be a resolved contact or the neutral in-app route').toBeTruthy();
  for (const legacy of ['mihas', 'katc', 'beanola.com']) {
    expect(href.toLowerCase(), `support must not be hardcoded to ${legacy}`).not.toContain(legacy);
  }

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});
