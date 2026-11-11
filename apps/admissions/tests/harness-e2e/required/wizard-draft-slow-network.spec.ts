/**
 * Required V2 harness — draft writes on a slow network (admissions-v2 task 6.3,
 * M14: R10.8 "slow network").
 *
 * Requirements: **R10.3** (each draft command carries its optimistic version and
 * an idempotency key), **R10.7** (saving and retrying are visible, in words, and
 * never block typing or duplicate a request), **R10.4** (the pending edit is on
 * this device while the server lacks it, and gone once synced), **R10.8**.
 * Findings: **STU-02**.
 *
 * The instrument is a route on the draft PATCH that lets every request reach the
 * server and delays the ANSWER. The first answer is held for 35 s — past the API
 * client's own 30 s timeout for this endpoint (`DEFAULT_TIMEOUT`,
 * `services/retry.ts`; draft commands send `retries: 0`, so the draft machine,
 * not the client, owns the retry). So the server commits the first command and
 * the browser never hears it: the realistic "lost response" case, where a
 * duplicate is most likely. Every later answer arrives 4 s late.
 *
 * The journey, on the Personal step of a resumed draft:
 *
 *   1. the student changes the town. One command (key K1, on version v) is sent,
 *      and the action bar says "Saving…" for as long as it is in flight;
 *   2. while it is in flight the student keeps typing — a new town, character by
 *      character, then a next-of-kin name. Nothing blocks: every keystroke lands,
 *      and none of them is sent yet (one command at a time);
 *   3. the client gives up on K1 at 30 s. The machine replays K1 — the same key,
 *      the same body, the same version — because it cannot know whether K1 was
 *      applied. The action bar says "Retrying save…" while the replay is in
 *      flight. The server answers the replay from its idempotency record, so K1
 *      commits once;
 *   4. every keystroke typed during the wait then goes out as ONE new command
 *      (K2, on version v+1): the debounce coalesced them.
 *
 * The server ends holding the last values typed, at exactly v+2 — one version
 * step per distinct command — and this device keeps no record of the draft once
 * it is synced.
 */
import { test, expect, type Page } from '../harness-fixtures';
import type { Request } from '@playwright/test';
import { createDraftApplication, superAdminContext, type AuthedContext } from '../helpers/api';
import {
  allowHarnessNoise,
  configureWizardOffering,
  listDraftIds,
  loginStudentInPage,
  openPersonalStep,
  readDraftRecord,
  storedDraftRecordKeys,
  waitForNetworkQuiet,
} from '../helpers/wizard-draft';

/** Longer than the API client's 30 s timeout for a draft PATCH. */
const LOST_RESPONSE_DELAY_MS = 35_000;
/** Slow, but inside the timeout. */
const SLOW_RESPONSE_DELAY_MS = 4_000;

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

interface DraftPatchAttempt {
  n: number;
  key: string;
  body: string;
  expectedVersion: unknown;
  /** What the server answered (the browser may never receive it). */
  serverStatus: number | null;
  serverVersion: number | null;
  /** What the page saw: `response <status>`, or `failed <error>` when it abandoned the request. */
  pageOutcome: string | null;
  /** Milliseconds from the start of the measurement. */
  sentAtMs: number;
  pageSettledAtMs: number | null;
}

interface DraftPatchProbe {
  inFlight: number;
  max: number;
  events: Array<[string, number]>;
}

/**
 * Count the page's own draft PATCH calls in flight, around `window.fetch`. Installed
 * before the app loads (the same kind of instrument as the two-tab spec's
 * `setInterval` override): it measures, and passes every call through unchanged.
 */
async function installDraftPatchConcurrencyProbe(page: Page): Promise<void> {
  await page.context().addInitScript(() => {
    const state = { inFlight: 0, max: 0, events: [] as Array<[string, number]> };
    (window as unknown as { __m14DraftPatchProbe: typeof state }).__m14DraftPatchProbe = state;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const tracked =
        method === 'PATCH' && new URL(url, window.location.href).pathname.startsWith('/api/v1/applications/drafts/');
      if (!tracked) return nativeFetch(input, init);
      state.inFlight += 1;
      state.max = Math.max(state.max, state.inFlight);
      state.events.push(['start', Date.now()]);
      try {
        return await nativeFetch(input, init);
      } finally {
        state.inFlight -= 1;
        state.events.push(['settle', Date.now()]);
      }
    }) as typeof window.fetch;
  });
}

function readDraftPatchProbe(page: Page): Promise<DraftPatchProbe> {
  return page.evaluate(
    () => (window as unknown as { __m14DraftPatchProbe: DraftPatchProbe }).__m14DraftPatchProbe,
  );
}

test('slow draft writes: typing never blocks, saving and retrying are shown in words, a timed-out command is replayed under its own key, and every command commits once', async ({
  page,
  gate,
}) => {
  test.setTimeout(240_000);
  allowHarnessNoise(gate);

  const offering = await configureWizardOffering(await platformAdmin(), 'Slow Network', 'T63S');
  const { email, csrf } = await loginStudentInPage(page);
  const { applicationId } = await createDraftApplication(page.request, csrf, {
    canonicalProgramId: offering.canonicalProgramId,
    intakeId: offering.intakeId,
    email,
  });
  const draftPath = `/api/v1/applications/drafts/${applicationId}/`;
  const initialVersion = Number((await readDraftRecord(page, applicationId)).version);
  expect(Number.isInteger(initialVersion) && initialVersion > 0).toBeTruthy();

  // Concurrency is measured where the application issues its commands: around
  // the page's own `fetch`. Playwright reports the abandoned K1 (`requestfailed`)
  // and its replay (`request`) in the same instant and in either order — the
  // first shakedown of this file counted them as overlapping while the page had
  // already let K1 go (docs/v2-evidence/6.3/raw/m14-*-shakedown). Timing only;
  // nothing about the call changes.
  await installDraftPatchConcurrencyProbe(page);

  const attempts: DraftPatchAttempt[] = [];
  const attemptOf = new Map<Request, DraftPatchAttempt>();
  const startedAt = Date.now();
  let markFirstSeen!: () => void;
  const firstPatchSeen = new Promise<void>((resolve) => {
    markFirstSeen = resolve;
  });
  const isDraftPatch = (request: Request) =>
    request.method() === 'PATCH' && new URL(request.url()).pathname === draftPath;
  page.on('requestfinished', async (request) => {
    if (!isDraftPatch(request)) return;
    const attempt = attemptOf.get(request);
    const response = await request.response().catch(() => null);
    if (attempt) {
      attempt.pageOutcome = `response ${response?.status() ?? '?'}`;
      attempt.pageSettledAtMs = Date.now() - startedAt;
    }
  });
  page.on('requestfailed', (request) => {
    if (!isDraftPatch(request)) return;
    const attempt = attemptOf.get(request);
    if (attempt) {
      attempt.pageOutcome = `failed ${request.failure()?.errorText ?? '?'}`;
      attempt.pageSettledAtMs = Date.now() - startedAt;
    }
  });

  await page.route(`**${draftPath}`, async (route) => {
    const request = route.request();
    if (request.method() !== 'PATCH') {
      await route.fallback();
      return;
    }
    const body = request.postData() ?? '';
    let expectedVersion: unknown = null;
    try {
      expectedVersion = (JSON.parse(body) as { expected_version?: unknown }).expected_version;
    } catch {
      expectedVersion = null;
    }
    const attempt: DraftPatchAttempt = {
      n: attempts.length + 1,
      key: (await request.allHeaders())['idempotency-key'] ?? '',
      body,
      expectedVersion,
      serverStatus: null,
      serverVersion: null,
      pageOutcome: null,
      sentAtMs: Date.now() - startedAt,
      pageSettledAtMs: null,
    };
    attempts.push(attempt);
    attemptOf.set(request, attempt);
    // The request reaches the server; only its answer is slow.
    const response = await route.fetch();
    attempt.serverStatus = response.status();
    try {
      const json = (await response.json()) as { data?: { version?: unknown } };
      attempt.serverVersion = typeof json.data?.version === 'number' ? json.data.version : null;
    } catch {
      attempt.serverVersion = null;
    }
    if (attempt.n === 1) markFirstSeen();
    await new Promise((resolve) => setTimeout(resolve, attempt.n === 1 ? LOST_RESPONSE_DELAY_MS : SLOW_RESPONSE_DELAY_MS));
    // For a request the page has already abandoned this is a no-op: its answer is lost.
    await route.fulfill({ response }).catch(() => undefined);
  });

  await page.goto(`/student/application-wizard?mode=resume&draftId=${encodeURIComponent(applicationId)}`, {
    waitUntil: 'domcontentloaded',
  });
  const actionBar = page.getByTestId('wizard-action-bar');
  await expect(actionBar).toBeVisible({ timeout: 60_000 });
  await openPersonalStep(page);
  await waitForNetworkQuiet(page);
  expect(attempts, 'hydration and step navigation write nothing').toHaveLength(0);

  const stamp = Date.now();
  const townA = `Slow first ${stamp}`;
  const townB = `Slow final ${stamp}`;
  const kinB = `Kin ${stamp}`;
  const town = page.getByLabel(/town|city/i).first();
  const kin = page.getByLabel(/next of kin name/i).first();

  // 1. One edit, one command, shown as saving.
  await town.fill(townA);
  await firstPatchSeen;
  expect(attempts).toHaveLength(1);
  await expect(actionBar.getByText('Saving…', { exact: true }), 'the in-flight save is shown in words').toBeVisible();
  // The unsent edit is on this device while the server's answer is outstanding.
  await expect
    .poll(() => storedDraftRecordKeys(page), { timeout: 10_000, message: 'the pending edit is held in the outbox' })
    .toEqual([expect.stringMatching(new RegExp(`:${applicationId}$`))]);

  // 2. Typing is never blocked while the command is in flight.
  await expect(town).toBeEditable();
  await town.fill('');
  await town.pressSequentially(townB, { delay: 40 });
  await expect(town).toHaveValue(townB);
  await expect(kin).toBeEditable();
  await kin.fill('');
  await kin.pressSequentially(kinB, { delay: 40 });
  await expect(kin).toHaveValue(kinB);
  const keystrokes = townB.length + kinB.length + 2;
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(attempts, 'nothing more is sent while one command is in flight').toHaveLength(1);
  await expect(actionBar.getByText('Saving…', { exact: true }), 'the first command is still in flight').toBeVisible();

  // 3. The client gives up on K1; the machine replays it, shown as retrying.
  const retrying = actionBar.getByTestId('wizard-save-retrying');
  await expect(retrying, 'the replay is shown in words').toBeVisible({ timeout: 45_000 });
  await expect(retrying).toContainText(/retrying save/i);
  expect(attempts.length, 'the replay has been sent').toBeGreaterThanOrEqual(2);
  expect(attempts[1]!.key, 'a retry reuses the key of the exact command').toBe(attempts[0]!.key);
  expect(attempts[1]!.body, 'the same command, byte for byte').toBe(attempts[0]!.body);

  // 4. The edits typed during the wait go out as one command; the server ends
  //    holding the last values typed.
  await expect
    .poll(async () => {
      const row = await readDraftRecord(page, applicationId);
      return `${String(row.residence_town)}|${String(row.next_of_kin_name)}`;
    }, { timeout: 60_000, message: 'the last values typed reach the server' })
    .toBe(`${townB}|${kinB}`);
  await waitForNetworkQuiet(page, 3_000);
  await page.waitForTimeout(9_000); // one full 8 s sweep: nothing else may be sent
  await page.unrouteAll({ behavior: 'wait' });

  // The command ledger.
  const summary = attempts.map(
    ({ n, key, expectedVersion, serverStatus, serverVersion, pageOutcome, sentAtMs, pageSettledAtMs }) => ({
      n,
      key,
      expectedVersion,
      serverStatus,
      serverVersion,
      pageOutcome,
      sentAtMs,
      pageSettledAtMs,
    }),
  );
  const probe = await readDraftPatchProbe(page);
  const probeStart = probe.events[0]?.[1] ?? 0;
  test.info().annotations.push({ type: 'draft PATCH attempts', description: JSON.stringify(summary) });
  test.info().annotations.push({
    type: 'page fetch probe (draft PATCH)',
    description: JSON.stringify({
      max: probe.max,
      events: probe.events.map(([event, at]) => `${event}@+${at - probeStart}ms`),
    }),
  });
  expect(attempts, 'three requests: K1, its replay, K2').toHaveLength(3);
  const [first, replay, second] = attempts as [DraftPatchAttempt, DraftPatchAttempt, DraftPatchAttempt];
  expect(first.expectedVersion).toBe(initialVersion);
  expect(first.serverStatus, 'the server committed K1').toBe(200);
  expect(first.serverVersion).toBe(initialVersion + 1);
  expect(first.pageOutcome, 'the page abandoned K1 at its own timeout and never heard the answer').toBe(
    'failed net::ERR_ABORTED',
  );
  expect(
    gate.cancelledRequests.some((url) => new URL(url).pathname === draftPath),
    'the strict gate recorded it as a cancellation, not a failure',
  ).toBe(true);
  expect(replay.key).toBe(first.key);
  expect(replay.body).toBe(first.body);
  expect(replay.serverStatus).toBe(200);
  expect(replay.serverVersion, 'the replay is answered from the idempotency record, not applied twice').toBe(
    initialVersion + 1,
  );
  expect(replay.pageOutcome).toBe('response 200');
  expect(second.key, 'the coalesced edits are a new command').not.toBe(first.key);
  expect(second.expectedVersion, 'built on the version K1 produced').toBe(initialVersion + 1);
  expect(JSON.parse(second.body)).toMatchObject({ residence_town: townB, next_of_kin_name: kinB });
  expect(second.serverStatus).toBe(200);
  expect(second.serverVersion).toBe(initialVersion + 2);
  expect(second.pageOutcome).toBe('response 200');
  // Every key names exactly one body: no key was reused for a different command.
  const bodiesByKey = new Map<string, Set<string>>();
  for (const attempt of attempts) {
    bodiesByKey.set(attempt.key, (bodiesByKey.get(attempt.key) ?? new Set()).add(attempt.body));
  }
  for (const [key, bodies] of bodiesByKey) expect(bodies.size, `key ${key} carries one command`).toBe(1);
  expect(bodiesByKey.size, `${keystrokes} keystrokes during the wait coalesced into one command`).toBe(2);
  expect(probe.events.filter(([event]) => event === 'start'), 'the page issued three draft PATCH calls').toHaveLength(3);
  expect(probe.max, 'never two draft commands in flight at once').toBe(1);

  const final = await readDraftRecord(page, applicationId);
  expect(Number(final.version), 'one version step per distinct command (K1, K2)').toBe(initialVersion + bodiesByKey.size);
  expect(String(final.residence_town)).toBe(townB);
  expect(String(final.next_of_kin_name)).toBe(kinB);
  await expect(retrying).toHaveCount(0);
  await expect(actionBar.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('wizard-offline-badge')).toHaveCount(0);
  await expect
    .poll(() => storedDraftRecordKeys(page), { timeout: 10_000, message: 'a synced draft keeps no record on this device' })
    .toEqual([]);
  expect(await listDraftIds(page), 'one application').toEqual([applicationId]);
});
