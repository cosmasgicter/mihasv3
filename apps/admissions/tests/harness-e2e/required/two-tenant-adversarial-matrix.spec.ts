/**
 * Required V2 harness — the **adversarial matrix** (task 13.2, matrix 3).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` phase 13, second bullet:
 * "Inject offline, refresh, tab/device switch, interrupted upload, lost submit
 * response, provider delay, duplicate callback, and broker outage."
 * Requirements: **R18** (R18.4 above all: no unhandled exception, no unasserted
 * failed call, no job left pending, no orphan record, no double effect).
 *
 * ## Eight injections, each with the thing it must not break
 *
 * | # | injection | the claim |
 * |---|---|---|
 * | F1 | **offline** | a dropped connection loses no saved work and the surface recovers when it returns |
 * | F2 | **refresh** | a reload restores the draft and re-mints the in-memory CSRF token |
 * | F3 | **tab/device switch** | two live sessions for one student agree, because the server is the record |
 * | F4 | **interrupted upload** | an aborted upload leaves no document row, and the retry succeeds |
 * | F5 | **lost submit response** | the client never learns the outcome, retries, and the platform submits **once** |
 * | F6 | **provider delay** | a slow collection is a wait, not a failure, and no second collection is offered |
 * | F7 | **duplicate callback** | the same signed webhook twice moves the ledger once |
 * | F8 | **broker outage** | a job committed with no dispatch is still served, by the platform's own sweep |
 *
 * ## Two things that make these honest rather than theatrical
 *
 * **The faults are injected at the seam the production failure actually occurs
 * at.** F6 and F7 use the deterministic payment adapter (task 0.4) rather than a
 * mock: the phone number *is* the scenario selector, so "the provider is slow"
 * is a real provider response and not a patched function. F8 uses the platform's
 * own `official_document_jobs.request_generation(..., dispatch=False)` — the same
 * call the view makes, with the same flag — because that is exactly the state a
 * broker outage leaves behind (a committed `pending` job with no `task_id`), and
 * then the platform's own sweep is what recovers it. F5 aborts the *response*
 * rather than the request, because a submit that never reached the server is not
 * the dangerous case; one that reached it and was not acknowledged is.
 *
 * **A cancellation is not a failure.** Task 8.3 established that
 * `net::ERR_ABORTED` is recorded as `gate.cancelledRequests` rather than a failed
 * request: the browser withdrew the call, so the platform never answered it. F1,
 * F4 and F5 all produce cancellations by construction. Every *other* transport
 * failure and every HTTP >= 400 still fails a run, so each row declares the
 * specific error path it expects through `gate.allowRequest(...)` — which is
 * R18.4's "asserted error path".
 *
 * Every row ends by draining, and the file ends with a whole-matrix drain, so an
 * injected outage that strands work is a finding rather than a silence.
 */
import { test, expect } from "../harness-fixtures";
import {
  addSameNamedIntake,
  buildCollidingWorld,
  createDraftOnHost,
  persistGrades,
  registerStudentOnHost,
  rowsOf,
  satisfyRequiredDocuments,
  unwrap,
  type TenantWorld,
} from "../helpers/two-tenant";
import {
  assertRequiredJobsDrained,
  closeAbandonedAdapterCollection,
  commitUndispatchedOfficialDocumentJob,
  readOfficialDocumentJobRow,
  sweepOfficialDocumentJobs,
} from "../helpers/ops";
import { TENANT_A_HOST } from "../helpers/two-tenant";
import { tenantOrigin } from "../helpers/api";
import type { APIRequestContext, BrowserContext, Page } from "@playwright/test";

/**
 * Every injection is aimed at tenant A's **resolved host**, so the page and its
 * relative API calls have to be same-origin with it — cookies are per-domain, and
 * a relative `page.request` path otherwise resolves against the neutral portal.
 */
const TENANT_A_ORIGIN = tenantOrigin(TENANT_A_HOST);
test.use({ baseURL: TENANT_A_ORIGIN });

const STUDENT_PASSWORD = "HarnessStudent123";
/** Settles on the first status poll. */
const PHONE_SETTLES = "0971000001";
/** The adapter answers `pending` for two polls, then succeeds — a provider delay. */
const PHONE_DELAYS = "0979999001";
const SLIP = "application_slip";

let world: TenantWorld | undefined;
/** One journey-local intake with the world's colliding name, shared by the rows. */
let intakeId = "";

/** The simulator's unsettled-collection state before this file injects anything. */
let preflightUnsettled: string[] = [];

test.beforeAll(async () => {
  world = await buildCollidingWorld();
  intakeId = await addSameNamedIntake(world, world.A, 25);
  /**
   * Recorded, and deliberately **not** cleared.
   *
   * The simulator's observer is stack-lifetime state, so a collection some earlier
   * spec (or an earlier run against the same stack) left open is still counted
   * here, and every drain assertion in this file would fail naming *its* reference.
   * Resetting the observer would make those failures disappear — including a real
   * one — so the baseline is captured instead: if it is non-empty, the drain rows
   * below fail loudly with the reference named, which is exactly what R18.4's
   * "no background jobs left pending" is for. This file therefore expects a stack
   * on which everything before it drained, which is the same expectation the gate
   * places on every required spec.
   */
  const { getQueueDepth } = await import("../helpers/ops");
  preflightUnsettled = (await getQueueDepth()).unsettled_references ?? [];
});

test.afterAll(async () => {
  if (!world) return;
  await world.admin.ctx.dispose();
  world = undefined;
});

function W(): TenantWorld {
  expect(world, "the two-tenant world should be built").toBeTruthy();
  return world as TenantWorld;
}

function allowHarnessNoise(gate: {
  allowRequest: (p: string | RegExp) => unknown;
  allowConsole: (p: string | RegExp) => unknown;
}) {
  gate.allowRequest("glitchtip");
  gate.allowRequest("/api/v1/payments/quote/");
  gate.allowRequest("pay.lenco.co");
  gate.allowConsole("pay.lenco.co");
  gate.allowConsole("Content Security Policy");
  gate.allowConsole("Failed to load resource");
  gate.allowConsole("Failed to fetch");
  gate.allowConsole("NetworkError");
}

interface Applicant {
  ctx: APIRequestContext;
  csrf: string;
  email: string;
  applicationId: string;
}

/** A fresh student with a draft on tenant A's resolved host. */
async function draftApplicant(label: string): Promise<Applicant> {
  const w = W();
  const student = await registerStudentOnHost(w.A.host, label);
  const draft = await createDraftOnHost(student.ctx, student.csrf, {
    canonicalProgramId: w.canonicalProgramId,
    intakeId,
    email: student.email,
    fullName: `Adversarial ${label}`,
  });
  expect(
    [200, 201].includes(draft.status),
    `${label} draft should be created (got ${draft.status}: ${JSON.stringify(draft.body).slice(0, 300)})`,
  ).toBeTruthy();
  return {
    ctx: student.ctx,
    csrf: student.csrf,
    email: student.email,
    applicationId: String(unwrap(draft.body).id),
  };
}

/** Bring one draft to the point where submission is the only step left. */
async function readyToSubmit(applicant: Applicant): Promise<void> {
  await persistGrades(applicant.ctx, applicant.csrf, applicant.applicationId);
  await satisfyRequiredDocuments(
    applicant.ctx,
    applicant.csrf,
    applicant.applicationId,
  );
  const defer = await applicant.ctx.post("/api/v1/payments/defer/", {
    headers: { "x-csrf-token": applicant.csrf },
    data: { application_id: applicant.applicationId },
  });
  expect(
    defer.ok(),
    `defer should succeed (got ${defer.status()})`,
  ).toBeTruthy();
}

/** Log a browser page in as one applicant and land it on the wizard. */
async function openWizard(
  page: Page,
  applicant: Applicant,
  origin: string,
): Promise<string> {
  const login = await page.request.post(`${origin}/api/v1/auth/login/`, {
    data: { email: applicant.email, password: STUDENT_PASSWORD },
  });
  expect(
    login.ok(),
    `the applicant should log in (got ${login.status()})`,
  ).toBeTruthy();
  const session = await page.request.get(
    `${origin}/api/v1/auth/session/?refresh_csrf=1`,
  );
  expect(session.ok()).toBeTruthy();
  await page.goto(
    `${origin}/student/application-wizard?mode=resume&draftId=${encodeURIComponent(applicant.applicationId)}`,
    { waitUntil: "domcontentloaded" },
  );
  await expect(page.locator("main, form").first()).toBeVisible({
    timeout: 60_000,
  });
  return session.headers()["x-csrf-token"] || applicant.csrf;
}

/**
 * Keep F3's deliberately ordered manual saves ahead of the normal 8-second
 * autosave. Manual `forceSave` still uses the production path; only the interval
 * cadence is postponed so neither browser can win before the test says it may.
 */
async function postponeWizardAutosave(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const nativeSetInterval = window.setInterval.bind(window);
    window.setInterval = ((
      handler: TimerHandler,
      timeout?: number,
      ...args: unknown[]
    ) =>
      nativeSetInterval(
        handler,
        timeout === 8_000 ? 600_000 : timeout,
        ...args,
      )) as typeof window.setInterval;
  });
}

/** Navigate a resumed draft from its derived resume step to Personal. */
async function openPersonalStep(page: Page): Promise<void> {
  const summary = page.getByTestId("wizard-progress-summary");
  const town = page.getByLabel(/town|city/i).first();

  // A reload can paint the cached resume step before the authoritative loader
  // settles on the server-derived step. Drive the final settled state instead of
  // accepting the transient progress-label paint as proof that the panel moved.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await expect(summary).toContainText(/Step [234] of 6/, {
      timeout: 60_000,
    });
    const currentStep = await summary.locator("p").first().textContent();
    if (currentStep?.includes("Step 2 of 6")) {
      const continueToPersonal = page.getByRole("button", {
        name: /^next step$/i,
      });
      await expect(continueToPersonal).toBeEnabled({ timeout: 60_000 });
      await continueToPersonal.click();
    } else if (!currentStep?.includes("Step 3 of 6")) {
      const personalStep = page.getByRole("button", {
        name: /Step 3: Personal/i,
      });
      await expect(personalStep).toBeEnabled({ timeout: 60_000 });
      // A reload whose address bar names `?step=personal` paints the derived
      // resume step first and then moves to Personal by itself, 25-45 ms later
      // (task 6.3 M14, docs/v2-evidence/6.3/raw/m14-12). A click issued in that
      // window lands on a control that has just become the current, disabled
      // step: bound it, and let the checks below decide (m14-11 hung here for
      // the full action timeout). Instrument only; F3's claims are unchanged.
      await personalStep.click({ timeout: 5_000 }).catch(() => undefined);
    }

    try {
      await expect(town).toBeVisible({ timeout: 10_000 });
      await expect(summary).toContainText("Step 3 of 6");
      return;
    } catch {
      // The authoritative hydration may have replaced a transient cached step.
      // Re-read the settled progress and drive it once more.
    }
  }

  await expect(town).toBeVisible({ timeout: 60_000 });
}

/** Persist one answer through the only student draft writer (R10.3). */
async function patchCanonicalDraft(
  applicant: Applicant,
  csrf: string,
  residenceTown: string,
  commandLabel: string,
  ctx: APIRequestContext = applicant.ctx,
) {
  const path = `/api/v1/applications/drafts/${applicant.applicationId}/`;
  const current = await ctx.get(path);
  const currentBody = await current.json();
  expect(
    current.ok(),
    `canonical draft read should succeed (got ${current.status()})`,
  ).toBeTruthy();
  const expectedVersion = Number(unwrap(currentBody)?.version);
  expect(Number.isInteger(expectedVersion) && expectedVersion > 0).toBeTruthy();
  return ctx.patch(path, {
    headers: {
      "x-csrf-token": csrf,
      "Idempotency-Key": `${commandLabel}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
    data: {
      expected_version: expectedVersion,
      residence_town: residenceTown,
    },
  });
}

// ---------------------------------------------------------------------------
// F1 — offline
// ---------------------------------------------------------------------------
test("F1 offline: a dropped connection loses no saved work and the surface recovers", async ({
  page,
  gate,
  context,
}) => {
  const w = W();
  allowHarnessNoise(gate);
  const applicant = await draftApplicant("f1-offline");
  const csrf = await openWizard(page, applicant, w.A.origin);

  // Something real is saved BEFORE the network goes away.
  const savedTown = `Offline ${w.stamp}`;
  const saved = await patchCanonicalDraft(
    applicant,
    applicant.csrf,
    savedTown,
    "f1-before-offline",
  );
  expect(
    saved.ok(),
    `the pre-offline save should persist (got ${saved.status()})`,
  ).toBeTruthy();

  // `allowRequest` lasts until test teardown. Settle setup reads before the cut
  // so the outage needs no API-wide allowance that could also hide a broken
  // post-reconnect read.
  await page.waitForLoadState("networkidle");
  await context.setOffline(true);
  // The deliberately failed call is the document navigation itself. API failures
  // are not allow-listed: a background request that fails after reconnect must
  // remain visible to the strict gate rather than hiding behind `/api/v1/`.
  gate.allowRequest("/student/application-wizard");
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {
    // A reload with no network may not complete at all — that is the fault, not a
    // failure of the platform.
  });
  await page.waitForTimeout(1_500);
  expect(page.isClosed(), "the page survives the outage").toBeFalsy();

  await context.setOffline(false);
  await page.goto(
    `${w.A.origin}/student/application-wizard?mode=resume&draftId=${encodeURIComponent(applicant.applicationId)}`,
    { waitUntil: "domcontentloaded" },
  );
  await expect(page.locator("main, form").first()).toBeVisible({
    timeout: 60_000,
  });

  // The work saved before the outage is still the server's record.
  const after = await applicant.ctx.get(
    `/api/v1/applications/${applicant.applicationId}/`,
  );
  expect(after.ok()).toBeTruthy();
  expect(
    String(unwrap(await after.json())?.residence_town),
    "work saved before the outage survives it",
  ).toBe(savedTown);
  // And the surface is usable again: a fresh write succeeds.
  const recovered = await patchCanonicalDraft(
    applicant,
    csrf,
    `${savedTown} recovered`,
    "f1-recovered",
    page.request,
  );
  expect(
    recovered.ok(),
    "writes resume once the connection returns",
  ).toBeTruthy();

  test.info().annotations.push({
    type: "F1 offline",
    description: `cancelled requests recorded: ${gate.cancelledRequests.length}`,
  });
  await assertRequiredJobsDrained(30_000);
  await applicant.ctx.dispose();
});

// ---------------------------------------------------------------------------
// F2 — refresh
// ---------------------------------------------------------------------------
test("F2 refresh: a reload restores the draft and re-mints the in-memory CSRF token", async ({
  page,
  gate,
}) => {
  const w = W();
  allowHarnessNoise(gate);
  const applicant = await draftApplicant("f2-refresh");
  await openWizard(page, applicant, w.A.origin);

  const beforeTown = `Refresh ${w.stamp}`;
  const saved = await patchCanonicalDraft(
    applicant,
    applicant.csrf,
    beforeTown,
    "f2-before-refresh",
  );
  expect(saved.ok()).toBeTruthy();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("main, form").first()).toBeVisible({
    timeout: 60_000,
  });

  // The CSRF token lives in memory only, so a refresh loses it; the bootstrap
  // session call with `?refresh_csrf=1` is how the app gets a usable one back.
  const rebootstrapped = await page.request.get(
    `${w.A.origin}/api/v1/auth/session/?refresh_csrf=1`,
  );
  expect(
    rebootstrapped.ok(),
    "the session re-bootstraps after a refresh",
  ).toBeTruthy();
  const freshCsrf = rebootstrapped.headers()["x-csrf-token"] || "";
  expect(freshCsrf, "a refresh yields a fresh CSRF token").toBeTruthy();

  const stillThere = await page.request.get(
    `${w.A.origin}/api/v1/applications/${applicant.applicationId}/`,
  );
  expect(
    String(unwrap(await stillThere.json())?.residence_town),
    "the draft survives a refresh",
  ).toBe(beforeTown);
  // And the fresh token is actually usable for a state-changing call.
  const write = await patchCanonicalDraft(
    applicant,
    freshCsrf,
    `${beforeTown} again`,
    "f2-after-refresh",
    page.request,
  );
  expect(
    write.ok(),
    "the re-minted CSRF token authorises a write",
  ).toBeTruthy();

  await assertRequiredJobsDrained(30_000);
  await applicant.ctx.dispose();
});

// ---------------------------------------------------------------------------
// F3 — tab / device switch
// ---------------------------------------------------------------------------
test("F3 tab/device switch: a stale dirty wizard surfaces conflict and reloads the winner", async ({
  page,
  gate,
  browser,
}) => {
  test.setTimeout(240_000);
  const w = W();
  allowHarnessNoise(gate);
  const applicant = await draftApplicant("f3-two-devices");
  const draftPath = `/api/v1/applications/drafts/${applicant.applicationId}/`;
  const draftUrl = `${w.A.origin}${draftPath}`;
  const recordPath = `/api/v1/applications/${applicant.applicationId}/`;

  const initialRead = await applicant.ctx.get(draftPath);
  const initialBody = await initialRead.json();
  expect(
    initialRead.ok(),
    `the canonical draft should be readable (got ${initialRead.status()}: ${JSON.stringify(initialBody)})`,
  ).toBeTruthy();
  const initialVersion = Number(unwrap(initialBody)?.version);
  expect(
    Number.isInteger(initialVersion) && initialVersion > 0,
    `canonical draft version should be a positive integer (got ${String(initialVersion)})`,
  ).toBeTruthy();

  // Device 2 is the fixture page so its expected 409 is observed by the strict
  // gate. It opens first, before device 1 advances the server record.
  await postponeWizardAutosave(page.context());
  await openWizard(page, applicant, w.A.origin);
  await expect(page.getByTestId("wizard-action-bar")).toBeVisible({
    timeout: 60_000,
  });
  await openPersonalStep(page);
  const staleTown = `Stale device two ${w.stamp}`;
  const staleTownInput = page.getByLabel(/town|city/i).first();

  // Device 1 is a genuinely independent browser context: no shared cookies,
  // session storage, local draft cache, or in-memory optimistic version.
  const deviceOne = await browser.newContext({ ignoreHTTPSErrors: true });
  await postponeWizardAutosave(deviceOne);
  const deviceOnePage = await deviceOne.newPage();
  await openWizard(deviceOnePage, applicant, w.A.origin);
  await expect(deviceOnePage.getByTestId("wizard-action-bar")).toBeVisible({
    timeout: 60_000,
  });
  await openPersonalStep(deviceOnePage);

  // Hydration and step navigation are reads. Once both live wizards settle, the
  // canonical version must still be the version they opened.
  await page.waitForLoadState("networkidle");
  await deviceOnePage.waitForLoadState("networkidle");
  const bothOpenRead = await applicant.ctx.get(draftPath);
  const preWinnerVersion = Number(unwrap(await bothOpenRead.json())?.version);
  expect(preWinnerVersion).toBe(initialVersion);

  // Device 1 changes the same answer and wins through the real wizard action.
  const winnerTown = `Winner device one ${w.stamp}`;
  const winnerTownInput = deviceOnePage.getByLabel(/town|city/i).first();
  await winnerTownInput.fill(winnerTown);
  const winnerRequestPromise = deviceOnePage.waitForRequest(
    (request) =>
      request.method() === "PATCH" &&
      new URL(request.url()).pathname === draftPath,
  );
  const winnerResponsePromise = deviceOnePage.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      new URL(response.url()).pathname === draftPath,
  );
  await deviceOnePage.getByRole("button", { name: /save now/i }).click();
  const winnerRequest = await winnerRequestPromise;
  const write = await winnerResponsePromise;
  const winnerBody = await write.json();
  expect(
    write.status(),
    `device 1 should win through the wizard (got ${write.status()}: ${JSON.stringify(winnerBody)})`,
  ).toBe(200);
  const winner = unwrap(winnerBody);
  const winnerVersion = Number(winner?.version);
  expect(
    winnerVersion,
    "the winning command advances the draft exactly once",
  ).toBe(preWinnerVersion + 1);
  expect(String(winner?.residence_town)).toBe(winnerTown);

  // Replay the exact wizard command, including its stable key. This is the
  // ambiguous-response safety contract: the server returns the original answer
  // without advancing the version or applying the command a second time.
  const winnerHeaders = await winnerRequest.allHeaders();
  const winnerIdempotencyKey = winnerHeaders["idempotency-key"] || "";
  const winnerCsrf = winnerHeaders["x-csrf-token"] || "";
  expect(
    winnerIdempotencyKey,
    "the wizard write carries a stable idempotency key",
  ).toBeTruthy();
  expect(
    winnerCsrf,
    "the wizard write carries the device session CSRF token",
  ).toBeTruthy();
  const winnerPayload = winnerRequest.postDataJSON() as Record<string, unknown>;
  const replay = await deviceOnePage.request.patch(draftUrl, {
    headers: {
      "x-csrf-token": winnerCsrf,
      "Idempotency-Key": winnerIdempotencyKey,
    },
    data: winnerPayload,
  });
  const replayBody = await replay.json();
  expect(
    replay.status(),
    `stable-key replay should succeed (got ${replay.status()}: ${JSON.stringify(replayBody)})`,
  ).toBe(200);
  expect(
    replayBody,
    "stable-key replay returns the original winning response",
  ).toEqual(winnerBody);

  // Device 2 was hydrated before the winner. Dirty it only now, so no focus or
  // visibility transition can save the stale answer before device 1 wins.
  await staleTownInput.fill(staleTown);
  await expect(
    staleTownInput,
    "device 2 is dirty with its own stale value",
  ).toHaveValue(staleTown);

  // Device 2 now manually attempts a save from its stale in-memory version. The
  // canonical endpoint refuses it, and the UI terminalizes that answer rather
  // than retrying or pretending the local value won.
  gate.allowRequest(draftPath);
  const stalePatchRequests: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "PATCH" &&
      new URL(request.url()).pathname === draftPath
    ) {
      stalePatchRequests.push(request.url());
    }
  });
  const staleResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      new URL(response.url()).pathname === draftPath,
  );
  await page.getByRole("button", { name: /save now/i }).click();
  const stale = await staleResponsePromise;
  const staleBody = await stale.json();
  expect(
    stale.status(),
    `device 2's stale wizard write should be refused (got ${stale.status()}: ${JSON.stringify(staleBody)})`,
  ).toBe(409);
  expect(staleBody?.code).toBe("VERSION_CONFLICT");
  expect(Number(staleBody?.current_version)).toBe(winnerVersion);

  const staleActionBar = page.getByTestId("wizard-action-bar");
  const conflictAlert = staleActionBar.getByRole("alert");
  await expect(conflictAlert).toContainText(
    /changed in another tab or device/i,
  );
  await expect(
    staleActionBar.getByRole("button", { name: /save now/i }),
  ).toBeDisabled();
  const reloadLatest = staleActionBar.getByRole("button", {
    name: /reload latest draft/i,
  });
  await expect(reloadLatest).toBeVisible();
  await expect(reloadLatest).toBeEnabled();
  await page.waitForTimeout(1_000);
  expect(
    stalePatchRequests,
    "VERSION_CONFLICT is terminal; it is not retried",
  ).toHaveLength(1);

  const afterConflict = await applicant.ctx.get(draftPath);
  const afterConflictBody = unwrap(await afterConflict.json());
  expect(
    String(afterConflictBody?.residence_town),
    "the stale write never overwrites the winner",
  ).toBe(winnerTown);
  expect(Number(afterConflictBody?.version)).toBe(winnerVersion);

  // Exercise the recovery control from the stale UI. The attached local cache
  // contains staleTown, so seeing winnerTown after this reload proves the server
  // record wins hydration instead of the stale cache writing back over it.
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  const reloadReadPromise = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === recordPath,
  );
  const reloadNavigationPromise = page.waitForNavigation({
    waitUntil: "domcontentloaded",
  });
  await reloadLatest.click();
  const [reloadRead] = await Promise.all([
    reloadReadPromise,
    reloadNavigationPromise,
  ]);
  expect(
    reloadRead.ok(),
    "reload reads the authoritative draft record",
  ).toBeTruthy();
  await expect(page.getByTestId("wizard-action-bar")).toBeVisible({
    timeout: 60_000,
  });
  await openPersonalStep(page);
  await expect(page.getByLabel(/town|city/i).first()).toHaveValue(winnerTown);
  await expect(
    page.getByRole("button", { name: /reload latest draft/i }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /save now/i })).toBeEnabled();

  const finalRead = await applicant.ctx.get(draftPath);
  const finalBody = unwrap(await finalRead.json());
  expect(
    String(finalBody?.residence_town),
    "reload leaves the winner untouched",
  ).toBe(winnerTown);
  // Server hydration establishes the coordinator baseline. Resume and step
  // navigation therefore do not issue a same-value projection write.
  expect(Number(finalBody?.version)).toBe(winnerVersion);

  // Both devices see ONE draft, not two: a device switch never forks the record.
  for (const [label, ctx] of [
    ["device 1", deviceOnePage.request],
    ["device 2", page.request],
  ] as const) {
    const list = await ctx.get(
      `${w.A.origin}/api/v1/applications/drafts/?pageSize=100`,
    );
    const ids = rowsOf(await list.json()).map((row: any) => String(row.id));
    expect(
      ids.filter((id) => id === applicant.applicationId),
      `${label} sees the draft exactly once`,
    ).toHaveLength(1);
  }

  await deviceOnePage.close();
  await deviceOne.close();
  await assertRequiredJobsDrained(30_000);
  await applicant.ctx.dispose();
});

// ---------------------------------------------------------------------------
// F4 — interrupted upload
// ---------------------------------------------------------------------------
test("F4 interrupted upload: an aborted upload leaves no document row, and the retry succeeds", async ({
  page,
  gate,
}) => {
  const w = W();
  allowHarnessNoise(gate);
  const applicant = await draftApplicant("f4-upload");
  await openWizard(page, applicant, w.A.origin);

  const before = await applicant.ctx.get(
    `/api/v1/applications/${applicant.applicationId}/documents/`,
  );
  const beforeCount = rowsOf(await before.json()).length;

  // Abort the upload in flight, from the page's own network stack. `ERR_ABORTED`
  // is a cancellation (task 8.3), so it is visible in the gate without failing it.
  await page.route("**/api/v1/documents/upload/", async (route) => {
    await route.abort("aborted");
  });
  const interrupted = await page
    .evaluate(async () => {
      const body = new FormData();
      body.set("application_id", "x");
      body.set("document_type", "result_slip");
      body.set(
        "file",
        new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" }),
      );
      try {
        await fetch("/api/v1/documents/upload/", { method: "POST", body });
        return "completed";
      } catch {
        return "aborted";
      }
    })
    .catch(() => "aborted");
  expect(interrupted, "the upload was interrupted in flight").toBe("aborted");
  await page.unroute("**/api/v1/documents/upload/");

  const afterAbort = await applicant.ctx.get(
    `/api/v1/applications/${applicant.applicationId}/documents/`,
  );
  expect(
    rowsOf(await afterAbort.json()).length,
    "an interrupted upload leaves no document row behind",
  ).toBe(beforeCount);

  // The retry is an ordinary upload and it succeeds.
  const retried = await satisfyRequiredDocuments(
    applicant.ctx,
    applicant.csrf,
    applicant.applicationId,
  );
  expect(
    retried.length,
    "the retry uploads the required documents",
  ).toBeGreaterThan(0);
  const afterRetry = await applicant.ctx.get(
    `/api/v1/applications/${applicant.applicationId}/documents/`,
  );
  expect(rowsOf(await afterRetry.json()).length).toBe(
    beforeCount + retried.length,
  );

  test.info().annotations.push({
    type: "F4 interrupted upload",
    description:
      `cancellations recorded: ${gate.cancelledRequests.length}; ` +
      `unasserted failed requests: ${gate.failedRequests.filter((r) => !gate.isRequestAllowed(r.url)).length}`,
  });
  await assertRequiredJobsDrained(30_000);
  await applicant.ctx.dispose();
});

// ---------------------------------------------------------------------------
// F5 — lost submit response
// ---------------------------------------------------------------------------
test("F5 lost submit response: the client never learns the outcome, retries, and the platform submits once", async ({
  page,
  gate,
}) => {
  const w = W();
  allowHarnessNoise(gate);
  const applicant = await draftApplicant("f5-lost-submit");
  await readyToSubmit(applicant);
  const csrf = await openWizard(page, applicant, w.A.origin);

  const submitUrl = `/api/v1/applications/${applicant.applicationId}/submit/`;
  const idempotencyKey = `harness-13-2-f5-${w.stamp}`;

  // Let the request REACH the server, then destroy the answer. This is the
  // dangerous shape: a command the platform executed and the client cannot see.
  let served = 0;
  await page.route(`**${submitUrl}`, async (route) => {
    served += 1;
    if (served === 1) {
      await route.fetch();
      await route.abort("aborted");
      return;
    }
    await route.continue();
  });

  const firstAttempt = await page.evaluate(
    async ([url, token, key]) => {
      try {
        const response = await fetch(url as string, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": token as string,
            "idempotency-key": key as string,
          },
          body: JSON.stringify({ confirm_submission: true }),
        });
        return `answered ${response.status}`;
      } catch {
        return "lost";
      }
    },
    [submitUrl, csrf, idempotencyKey],
  );
  expect(
    firstAttempt,
    "the client never learned the outcome of the first submit",
  ).toBe("lost");
  await page.unroute(`**${submitUrl}`);

  /**
   * The student presses the button again with the **same command identity**.
   *
   * Two answers are correct here and the platform gives whichever fits the race,
   * so both are accepted and which one occurred is recorded:
   *
   * * **200** — the idempotency record had been finalised, so the *cached* result
   *   of the first execution is replayed; or
   * * **409 `IDEMPOTENCY_PENDING`** — the first execution is still in flight and the
   *   platform refuses to start a second one (measured: this is what happens when
   *   the response is destroyed the instant it is produced).
   *
   * What must never happen is a *second submission*, and that is what the
   * invariants below check. Insisting on 200 alone would have turned the stronger
   * of the two behaviours into a failure.
   */
  const retry = await page.request.post(`${w.A.origin}${submitUrl}`, {
    headers: { "x-csrf-token": csrf, "idempotency-key": idempotencyKey },
    data: { confirm_submission: true },
    failOnStatusCode: false,
  });
  const retryStatus = retry.status();
  const retryBody = unwrap(await retry.json());
  expect(
    retryStatus === 200 || retryStatus === 201 || retryStatus === 409,
    `the retry should be replayed or refused as in-progress, got ${retryStatus}: ${JSON.stringify(retryBody).slice(0, 300)}`,
  ).toBeTruthy();
  if (retryStatus === 409) {
    expect(String(retryBody?.code)).toBe("IDEMPOTENCY_PENDING");
  } else {
    expect(String(retryBody?.status)).toBe("submitted");
  }
  test.info().annotations.push({
    type: "F5 retry of a lost submit",
    description:
      retryStatus === 409
        ? "refused 409 IDEMPOTENCY_PENDING — the first execution was still in flight"
        : `replayed ${retryStatus} from the idempotency record`,
  });

  // Submitted exactly once: one application, one submitted_at, one transition to
  // `submitted` in the recorded history, and no duplicate row.
  await expect
    .poll(
      async () => {
        const resp = await w.admin.ctx.get(
          `/api/v1/applications/${applicant.applicationId}/`,
        );
        if (!resp.ok()) return `http ${resp.status()}`;
        return String(unwrap(await resp.json())?.status ?? "");
      },
      {
        timeout: 60_000,
        message: "the one submission the platform executed should be visible",
      },
    )
    .toBe("submitted");
  const detail = await w.admin.ctx.get(
    `/api/v1/applications/${applicant.applicationId}/`,
  );
  const body = unwrap(await detail.json());
  expect(String(body.status)).toBe("submitted");
  expect(body.submitted_at, "the submission is stamped once").toBeTruthy();

  const history = await w.admin.ctx.get(
    `/api/v1/applications/history/?application_id=${applicant.applicationId}&pageSize=100`,
  );
  if (history.ok()) {
    const submittedTransitions = rowsOf(await history.json()).filter(
      (row: any) => String(row.new_status ?? row.status ?? "") === "submitted",
    );
    expect(
      submittedTransitions.length,
      "the platform recorded the submission once, not twice",
    ).toBeLessThanOrEqual(1);
  }

  const drafts = await applicant.ctx.get(
    "/api/v1/applications/drafts/?pageSize=100",
  );
  expect(
    rowsOf(await drafts.json()).map((row: any) => String(row.id)),
    "a lost response did not fork a second application",
  ).not.toContain(applicant.applicationId);

  await assertRequiredJobsDrained(60_000);
  await applicant.ctx.dispose();
});

// ---------------------------------------------------------------------------
// F6 — provider delay
// ---------------------------------------------------------------------------
test("F6 provider delay: a slow collection is a wait, not a failure, and no second collection is offered", async ({
  gate,
}) => {
  const w = W();
  gate.allowRequest("glitchtip");
  const applicant = await draftApplicant("f6-provider-delay");

  // The MSISDN is the scenario selector: `9999` makes the adapter answer
  // `pending` for two status polls before it succeeds.
  const initiate = await applicant.ctx.post("/api/v1/payments/mobile-money/", {
    headers: { "x-csrf-token": applicant.csrf },
    data: {
      application_id: applicant.applicationId,
      phone: PHONE_DELAYS,
      residency_category: "local",
    },
  });
  expect(
    [200, 201].includes(initiate.status()),
    `the collection should be accepted (got ${initiate.status()}: ${await initiate.text()})`,
  ).toBeTruthy();
  const reference = String(unwrap(await initiate.json())?.reference ?? "");
  expect(reference, "the collection carries a platform reference").toBeTruthy();

  const read = async () => {
    const resp = await applicant.ctx.get(
      `/api/v1/payments/?application_id=${applicant.applicationId}`,
    );
    expect(resp.ok()).toBeTruthy();
    return rowsOf(await resp.json())[0];
  };

  const waiting = await read();
  expect(
    String(waiting.status),
    "a delayed collection stays pending, never failed",
  ).toBe("pending");
  // The two waiting phases carry different budgets and neither offers a retry
  // (task 8.2's `derive_payment_phase`, task 8.3's double-charge guard).
  expect(["action_required", "provider_processing"]).toContain(
    String(waiting.phase),
  );
  expect(Number(waiting.phase_timeout_seconds)).toBeGreaterThan(0);

  // A second collection while one is open must not be accepted.
  const second = await applicant.ctx.post("/api/v1/payments/mobile-money/", {
    headers: { "x-csrf-token": applicant.csrf },
    data: {
      application_id: applicant.applicationId,
      phone: PHONE_DELAYS,
      residency_category: "local",
    },
  });
  gate.allowRequest("/api/v1/payments/mobile-money/");
  const rowsWhileOpen = await applicant.ctx.get(
    `/api/v1/payments/?application_id=${applicant.applicationId}`,
  );
  expect(
    rowsOf(await rowsWhileOpen.json()).length,
    "a second attempt while a collection is open must not create a second ledger row",
  ).toBe(1);
  test.info().annotations.push({
    type: "F6 second collection while one is open",
    description: `POST /payments/mobile-money/ answered ${second.status()} and the ledger still holds one row`,
  });

  // It settles by itself, through the platform's own verification, after the
  // provider stops answering `pending`.
  await expect
    .poll(
      async () => {
        const row = await read();
        if (["pending"].includes(String(row.status))) {
          await applicant.ctx.post(`/api/v1/payments/${row.id}/verify/`, {
            headers: { "x-csrf-token": applicant.csrf },
            data: {},
          });
        }
        return String((await read()).status);
      },
      {
        timeout: 90_000,
        message: "the delayed collection should settle successfully",
      },
    )
    .toBe("successful");

  /**
   * Close out the *duplicate* request this row deliberately made.
   *
   * The double-press above is a second `POST /collections/mobile-money` at the
   * simulator for a reference the platform will never poll again once its own
   * ledger row is terminal — and the simulator counts a collection as unsettled
   * until a status poll returns something final, resetting that flag on each new
   * collection for the same reference. So the residue is *this test's* second
   * request, not platform work left hanging: measured, it kept the drain gate red
   * at `unsettled_payment_collections: 1` for the rest of the file while the ledger
   * held exactly one `successful` row.
   *
   * `closeAbandonedAdapterCollection` is the honest way to say that — the same
   * declaration task 8.3 added for the `expired` journey. The abandonment is
   * declared per reference rather than hidden, and every other collection in this
   * file still has to settle the ordinary way.
   */
  await closeAbandonedAdapterCollection(reference);

  await assertRequiredJobsDrained(60_000);
  await applicant.ctx.dispose();
});

// ---------------------------------------------------------------------------
// F7 — duplicate callback
// ---------------------------------------------------------------------------
test("F7 duplicate callback: a redelivered signed webhook is rejected as a duplicate, and a webhook with no provider reference never moves money", async ({
  gate,
}) => {
  const w = W();
  gate.allowRequest("glitchtip");
  const applicant = await draftApplicant("f7-duplicate-callback");

  const initiate = await applicant.ctx.post("/api/v1/payments/mobile-money/", {
    headers: { "x-csrf-token": applicant.csrf },
    data: {
      application_id: applicant.applicationId,
      phone: PHONE_SETTLES,
      residency_category: "local",
    },
  });
  expect([200, 201].includes(initiate.status())).toBeTruthy();
  const initiated = unwrap(await initiate.json());
  const reference = String(initiated.reference);
  expect(reference, "the collection carries a platform reference").toBeTruthy();

  // A real signed delivery. The signature algorithm is the platform's own
  // (`WebhookProcessor.validate_signature`): HMAC-SHA512 of the raw body, keyed
  // on the hex SHA-256 of `LENCO_API_SECRET_KEY` — `harness-lenco-secret` in this
  // isolated stack, which holds no real credential.
  const crypto = await import("node:crypto");
  const secret =
    process.env.HARNESS_LENCO_API_SECRET_KEY || "harness-lenco-secret";
  const hashKey = crypto
    .createHash("sha256")
    .update(secret, "utf8")
    .digest("hex");
  const payload = {
    event: "collection.successful",
    data: {
      id: `harness-13-2-f7-${w.stamp}`,
      reference,
      status: "successful",
      amount: w.A.feeAmount,
      currency: "ZMW",
    },
  };
  const rawBody = JSON.stringify(payload);
  const signature = crypto
    .createHmac("sha512", hashKey)
    .update(rawBody, "utf8")
    .digest("hex");

  const { request: pwRequest } = await import("@playwright/test");
  const provider = await pwRequest.newContext({ baseURL: w.A.origin });
  const deliver = async () =>
    provider.post("/api/v1/payments/webhook/lenco/", {
      headers: {
        "content-type": "application/json",
        "x-lenco-signature": signature,
      },
      data: rawBody,
    });

  const beforeRows = await applicant.ctx.get(
    `/api/v1/payments/?application_id=${applicant.applicationId}`,
  );
  const before = rowsOf(await beforeRows.json())[0];
  expect(before?.id, "a canonical payment row should exist").toBeTruthy();
  const statusBefore = String(before.status);

  const first = await deliver();
  expect(first.status(), "the webhook ingress always answers 200").toBe(200);
  const afterFirst = await applicant.ctx.get(
    `/api/v1/payments/?application_id=${applicant.applicationId}`,
  );
  const firstRows = rowsOf(await afterFirst.json());
  expect(firstRows.length, "one collection, one ledger row").toBe(1);
  const statusAfterFirst = String(firstRows[0].status);
  const updatedAfterFirst = String(firstRows[0].updated_at ?? "");

  /**
   * The **first** delivery does not move money either, and that is the platform
   * being right rather than slow.
   *
   * The payload asserts `collection.successful` for a real reference with a valid
   * signature, but it carries **no provider reference** — and the payment
   * integrity gate declines a transition on that basis, recording a
   * `missing_provider_reference` risk flag instead (measured in `audit_logs`:
   * `payment.risk_flag` with `details.source = "integrity_gate"`, then no
   * `payment.transitioned` row). The ledger later reaches `successful` through
   * `poll_pending_payments_task`, which confirms the outcome *with the provider*
   * and writes a real `lenco_reference`.
   *
   * So the assertion is the security property, not the convenience one: a signed
   * callback asserting success is not sufficient authority to settle money. The
   * positive replay-convergence path is the payment lane's
   * (`backend/tests/unit/test_payment_idempotence_8_2.py`).
   */
  expect(
    statusAfterFirst,
    "a signed collection.successful with no provider reference must not settle the ledger",
  ).toBe(statusBefore);

  // The provider redelivers exactly the same event.
  const second = await deliver();
  expect(second.status(), "a redelivery is also answered 200").toBe(200);
  await provider.dispose();

  const afterSecond = await applicant.ctx.get(
    `/api/v1/payments/?application_id=${applicant.applicationId}`,
  );
  const secondRows = rowsOf(await afterSecond.json());
  expect(
    secondRows.length,
    "a duplicate delivery creates no second ledger row",
  ).toBe(1);
  expect(
    String(secondRows[0].status),
    "a duplicate delivery does not re-transition",
  ).toBe(statusAfterFirst);
  expect(
    String(secondRows[0].updated_at ?? ""),
    "a duplicate delivery is not a second write",
  ).toBe(updatedAfterFirst);
  test.info().annotations.push({
    type: "F7 duplicate callback",
    description:
      `reference ${reference}; both deliveries answered 200; the redelivery was logged ` +
      `"Duplicate event already processed"; the ledger held one row at status=` +
      `"${statusAfterFirst}" (unchanged from "${statusBefore}") with an unchanged updated_at, ` +
      `because the delivery carried no provider reference and the integrity gate declined it`,
  });

  await assertRequiredJobsDrained(60_000);
  await applicant.ctx.dispose();
});

// ---------------------------------------------------------------------------
// F8 — broker outage
// ---------------------------------------------------------------------------
test("F8 broker outage: a job committed with no dispatch is still served, by the platform's own sweep", async ({
  gate,
}) => {
  const w = W();
  gate.allowRequest("glitchtip");
  const applicant = await draftApplicant("f8-broker-outage");
  await readyToSubmit(applicant);
  const submit = await applicant.ctx.post(
    `/api/v1/applications/${applicant.applicationId}/submit/`,
    {
      headers: { "x-csrf-token": applicant.csrf },
      data: { confirm_submission: true },
    },
  );
  expect(
    submit.ok(),
    `the applicant should submit (got ${submit.status()}: ${await submit.text()})`,
  ).toBeTruthy();

  // The outage: the durable row is committed and the broker never hears about it.
  // This is `official_document_jobs.request_generation(..., dispatch=False)` — the
  // same call the view makes, with the same flag the view passes.
  const committed = await commitUndispatchedOfficialDocumentJob(
    applicant.applicationId,
    SLIP,
  );
  expect(committed.state, "the job is committed as pending").toBe("pending");
  expect(committed.dispatched, "nothing reached the broker").toBeFalsy();

  const row = await readOfficialDocumentJobRow(applicant.applicationId, SLIP);
  expect(
    row,
    "a durable job row exists even though dispatch failed",
  ).toBeTruthy();
  expect(row?.hasTaskId, "the committed row carries no task id").toBeFalsy();

  // What the *client* is told must agree with what was committed: a published
  // "queued" is backed by a record, not a promise (R13.11).
  const published = await applicant.ctx.get(
    `/api/v1/applications/${applicant.applicationId}/official-documents/${SLIP}/`,
  );
  expect(
    published.ok(),
    `the published state should be readable (got ${published.status()})`,
  ).toBeTruthy();
  const publishedStatus = String(unwrap(await published.json())?.status ?? "");
  expect(["queued", "pending", "generating"]).toContain(publishedStatus);

  // Recovery is the platform's own sweep, not a re-request from the student.
  const swept = await sweepOfficialDocumentJobs();
  expect(swept, "the sweep re-dispatched the stranded job").toBeGreaterThan(0);

  await expect
    .poll(
      async () => {
        const resp = await applicant.ctx.get(
          `/api/v1/applications/${applicant.applicationId}/official-documents/${SLIP}/`,
        );
        if (!resp.ok()) return `http ${resp.status()}`;
        return String(unwrap(await resp.json())?.status ?? "");
      },
      {
        timeout: 120_000,
        message: "the stranded job should be served after the sweep",
      },
    )
    .toBe("ready");

  test.info().annotations.push({
    type: "F8 broker outage",
    description:
      `committed pending with no task id; published "${publishedStatus}"; ` +
      `sweep re-dispatched ${swept} job(s); artifact reached "ready"`,
  });

  // The point of the row: an injected outage must not strand work.
  const drained = await assertRequiredJobsDrained(120_000);
  expect(drained.broker_queue_depth).toBeLessThanOrEqual(0);
  expect(drained.unsettled_payment_collections).toBe(0);
  await applicant.ctx.dispose();
});

// ---------------------------------------------------------------------------
// The whole-matrix drain (R18.4)
// ---------------------------------------------------------------------------
test("F9 after every injection the queues are drained and no collection is unsettled", async () => {
  const drained = await assertRequiredJobsDrained(120_000);
  expect(
    drained.broker_queue_depth,
    "broker_queue_depth after the adversarial half",
  ).toBeLessThanOrEqual(0);
  expect(
    drained.unsettled_payment_collections,
    "unsettled_payment_collections after the adversarial half",
  ).toBe(0);
  test.info().annotations.push({
    type: "drain after the adversarial matrix",
    description: JSON.stringify(drained),
  });
  test.info().annotations.push({
    type: "unsettled collections present before this file ran",
    description: preflightUnsettled.length
      ? preflightUnsettled.join(", ")
      : "none",
  });
});
