/**
 * Required V2 harness — the **two-tenant isolation matrix** (task 13.2, matrix 1).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` phase 13, second bullet:
 * "**Same program/intake names**: host override, routing, drafts, grades, custom
 * docs, capacity, waitlist/promotion, payment, amendments, notifications, review,
 * official documents, audit, settlement, and public tracking remain isolated."
 * Requirements: **R18** (R18.2, R18.4 in particular).
 * Steering: `.kiro/steering/enterprise-tenancy.md` — scope before lookup, masked
 * 404, fail-closed domain resolution, neutral Beanola fallback.
 *
 * ## The condition, and why it is the whole test
 *
 * Both tenants publish an offering with the **same `name`** and an intake with the
 * **same `name`** (see `helpers/two-tenant.ts` for how, and why the two *seeded*
 * tenants are used rather than fresh ones). That collision is not decoration: it
 * is the single condition under which a lookup keyed on a **display snapshot**
 * silently returns the other tenant's row. Tasks 5.2/5.3 built the canonical-id
 * resolution path specifically to survive it, and
 * `docs/canonical-truth-map.md` states the rule this matrix is auditing:
 *
 * > Canonical IDs are the sole authority for routing/scoping/tagging; the legacy
 * > `applications.institution/program/intake` strings are display snapshots only.
 *
 * A matrix run against the seed's *distinguishable* names would report isolation
 * it never tested, because a name-keyed read cannot cross tenants while the names
 * differ.
 *
 * ## Sixteen rows
 *
 * The bullet lists fifteen comma-separated items; `waitlist/promotion` is two
 * distinct behaviours (a position is *assigned*; a freed seat *promotes*), so it
 * is split, giving the sixteen rows below. Each row is one `test` so the matrix
 * reports sixteen results rather than one:
 *
 * | # | surface | the isolation claim |
 * |---|---|---|
 * | S01 | host override | a posted foreign `institution_id` on a resolved host is refused with no mutation |
 * | S02 | routing | identical names notwithstanding, the host decides the offering |
 * | S03 | drafts | one tenant's draft is a masked 404 to the other tenant's admin |
 * | S04 | grades | ditto for persisted Grade 12 results |
 * | S05 | custom docs | a tenant's own document requirement gates only its own applicants |
 * | S06 | capacity | the capacity reported for an application is its own tenant's |
 * | S07 | waitlist | a waitlist position is scoped to the tenant that issued it |
 * | S08 | promotion | freeing a seat in one tenant changes nothing in the other |
 * | S09 | payment | a payment is invisible and unverifiable outside its tenant |
 * | S10 | amendments | an amendment is unlistable and unreviewable outside its tenant |
 * | S11 | notifications | a student's inbox is theirs; no admin reads across the boundary |
 * | S12 | review | a cross-tenant review command is refused **and mutates nothing** |
 * | S13 | official documents | an official artifact is unreachable outside its tenant |
 * | S14 | audit | audit rows are readable only within their own institution scope |
 * | S15 | settlement | money reports carry one tenant's rows and one tenant's amounts |
 * | S16 | public tracking | a tracking secret resolves to exactly one tenant, with no PII |
 *
 * ## What makes a denial meaningful here
 *
 * Every tenant admin in this matrix holds the **full granted mutation set** for
 * its own tenant (`review`, `verify_documents`, `verify_payments`, `export`,
 * `manage`). That is load-bearing: against a read-only actor a refused review is
 * refused on its own tenant too, so the refusal could not be attributed to the
 * tenant boundary. Here every row pairs the cross-tenant probe with the **same
 * call on the actor's own tenant succeeding**, so a 404 means *scope* and nothing
 * else.
 *
 * Runs under the strict harness gates (`harness-fixtures.ts`): zero skips, no
 * unexpected console errors, no unasserted failed request. Cross-tenant probes
 * deliberately produce 4xx responses, so each declares its expected error path
 * through `gate.allowRequest(...)` — that declaration *is* R18.4's "asserted
 * error path".
 */
import { test, expect } from "../harness-fixtures";
import {
  addSameNamedIntake,
  buildCollidingWorld,
  createDraftOnHost,
  loginAs,
  registerStudentOnHost,
  persistGrades,
  rowsOf,
  satisfyRequiredDocuments,
  unwrap,
  type TenantWorld,
  type TenantWorldSide,
} from "../helpers/two-tenant";
import { neutralOrigin } from "../helpers/api";
import type { APIRequestContext } from "@playwright/test";

let world: TenantWorld | undefined;

test.beforeAll(async () => {
  world = await buildCollidingWorld();
});

test.afterAll(async () => {
  if (!world) return;
  await world.admin.ctx.dispose();
  world = undefined;
});

function W(): TenantWorld {
  expect(world, "the colliding two-tenant world should be built").toBeTruthy();
  return world as TenantWorld;
}

/**
 * Allow the *specific* cross-tenant paths a row probes.
 *
 * Deliberately per-path rather than a blanket `/api/v1/` allowance: a row that
 * allowed everything would stop the gate noticing a 500 on the call it is not
 * probing.
 */
function allowPaths(
  gate: { allowRequest: (p: string | RegExp) => unknown },
  paths: string[],
) {
  for (const path of paths) gate.allowRequest(path);
}

/** A masked refusal: the right status, and nothing about the other tenant in it. */
async function expectMaskedRefusal(
  response: { status(): number; text(): Promise<string> },
  other: TenantWorldSide,
  label: string,
) {
  const status = response.status();
  expect(
    [403, 404].includes(status),
    `${label} should be refused with a masked 404 (or a non-revealing 403), got ${status}`,
  ).toBeTruthy();
  const body = await response.text();
  // Never the other tenant's identity, name, code, or ids.
  for (const secret of [
    other.institutionId,
    other.applicationId,
    other.offeringId,
    other.intakeId,
  ]) {
    expect(
      body.includes(secret),
      `${label} must not disclose the other tenant's identifier ${secret}`,
    ).toBeFalsy();
  }
  expect(
    /Iso |Kabwe|Mikango/.test(body),
    `${label} must not disclose the other tenant's display name`,
  ).toBeFalsy();
}

/**
 * A submitted application for one tenant, walked through the platform's own gates.
 *
 * `intakeId` defaults to the tenant's shared-name intake; the waitlist rows pass
 * the tenant's *second* same-named intake, which is sized so a queue forms.
 */
async function submitFreshApplicant(
  side: TenantWorldSide,
  canonicalProgramId: string,
  label: string,
  intakeId: string = side.intakeId,
): Promise<{
  ctx: APIRequestContext;
  csrf: string;
  applicationId: string;
  email: string;
}> {
  const student = await registerStudentOnHost(side.host, label);
  const draft = await createDraftOnHost(student.ctx, student.csrf, {
    canonicalProgramId,
    intakeId,
    email: student.email,
    fullName: `Harness ${label}`,
  });
  expect(
    [200, 201].includes(draft.status),
    `${label} draft should be created (got ${draft.status}: ${JSON.stringify(draft.body).slice(0, 300)})`,
  ).toBeTruthy();
  const applicationId = String(unwrap(draft.body).id);
  await persistGrades(student.ctx, student.csrf, applicationId);
  await satisfyRequiredDocuments(student.ctx, student.csrf, applicationId);
  const defer = await student.ctx.post("/api/v1/payments/defer/", {
    headers: { "x-csrf-token": student.csrf },
    data: { application_id: applicationId },
  });
  expect(
    defer.ok(),
    `${label} defer should succeed (got ${defer.status()})`,
  ).toBeTruthy();
  const submit = await student.ctx.post(
    `/api/v1/applications/${applicationId}/submit/`,
    {
      headers: { "x-csrf-token": student.csrf },
      data: { confirm_submission: true },
    },
  );
  expect(
    submit.ok(),
    `${label} should submit (got ${submit.status()}: ${await submit.text()})`,
  ).toBeTruthy();
  return {
    ctx: student.ctx,
    csrf: student.csrf,
    applicationId,
    email: student.email,
  };
}

// ---------------------------------------------------------------------------
// S01 — host override
// ---------------------------------------------------------------------------
test("S01 host override: a foreign institution_id on a resolved host is refused with no mutation", async ({
  gate,
}) => {
  const w = W();
  allowPaths(gate, ["/api/v1/applications/"]);

  // The precondition the whole row depends on: both hosts actually resolve a
  // tenant. A non-active domain resolves to the Neutral_Beanola_Context, where a
  // posted institution_id is still honoured as a white-label restriction — so
  // without this check the probe below would be vacuous.
  for (const side of [w.A, w.B]) {
    const anon = await registerStudentOnHost(
      side.host,
      `s01-ctx-${side.tag.toLowerCase()}`,
    );
    const context = await anon.ctx.get("/api/v1/catalog/context/");
    expect(
      context.ok(),
      `${side.host} should answer the context endpoint`,
    ).toBeTruthy();
    const resolved = unwrap(await context.json());
    expect(
      resolved.portal_type,
      `${side.host} should resolve a white-label tenant`,
    ).toBe("white_label");
    expect(String(resolved.institution_id)).toBe(side.institutionId);
    await anon.ctx.dispose();
  }

  // The neutral host must stay neutral Beanola — never a tenant's identity.
  const neutral = await (
    await import("@playwright/test")
  ).request.newContext({
    baseURL: neutralOrigin(),
  });
  const neutralContext = await neutral.get("/api/v1/catalog/context/");
  expect(neutralContext.ok()).toBeTruthy();
  const neutralData = unwrap(await neutralContext.json());
  expect(
    neutralData.institution_id,
    "the shared portal resolves no tenant",
  ).toBeNull();
  expect(String(neutralData?.brand?.owner)).toContain("Beanola");
  await neutral.dispose();

  const student = await registerStudentOnHost(w.A.host, "s01-override");
  const before = await student.ctx.get("/api/v1/applications/drafts/");
  const beforeCount = rowsOf(await before.json()).length;

  const override = await createDraftOnHost(student.ctx, student.csrf, {
    canonicalProgramId: w.canonicalProgramId,
    intakeId: w.B.intakeId,
    email: student.email,
    fullName: "Override Probe",
    institutionId: w.B.institutionId,
  });
  expect(
    override.status,
    "posting tenant B's institution_id on tenant A's host must be refused",
  ).toBe(403);
  expect(unwrap(override.body)?.code ?? override.body?.code).toBe(
    "INSTITUTION_OVERRIDE_NOT_PERMITTED",
  );

  const after = await student.ctx.get("/api/v1/applications/drafts/");
  expect(
    rowsOf(await after.json()).length,
    "a refused override must create no application",
  ).toBe(beforeCount);
  await student.ctx.dispose();
});

// ---------------------------------------------------------------------------
// S02 — routing
// ---------------------------------------------------------------------------
test("S02 routing: with identical program and intake names the host decides the offering", async () => {
  const w = W();

  for (const side of [w.A, w.B]) {
    const detail = await w.admin.ctx.get(
      `/api/v1/applications/${side.applicationId}/`,
    );
    expect(
      detail.ok(),
      `${side.tag}'s application should be readable by the platform admin`,
    ).toBeTruthy();
    const application = unwrap(await detail.json());

    // The canonical binding is the claim. The display snapshots are identical
    // across the two tenants by construction, which is exactly why they cannot
    // be the evidence.
    expect(
      String(application.program_offering_id),
      `${side.tag}'s draft must bind ${side.tag}'s own offering`,
    ).toBe(side.offeringId);
    expect(String(application.program)).toBe(w.canonicalProgramName);
    expect(String(application.intake)).toBe(w.collidingIntakeName);
    expect(String(application.institution)).toBe(side.code);
  }

  // Both tenants publish the same two names, so the names themselves are proven
  // ambiguous rather than assumed to be.
  expect(w.A.offeringId).not.toBe(w.B.offeringId);
  expect(w.A.intakeId).not.toBe(w.B.intakeId);

  // And a canonical id belonging to the *other* tenant cannot be routed from
  // this host: the resolved institution wins, so there is no eligible offering.
  const student = await registerStudentOnHost(w.A.host, "s02-crossroute");
  const crossRoute = await createDraftOnHost(student.ctx, student.csrf, {
    canonicalProgramId: w.canonicalProgramId,
    intakeId: w.B.intakeId,
    email: student.email,
    fullName: "Cross Route Probe",
  });
  expect(
    crossRoute.status,
    "tenant B's intake must not resolve an offering on tenant A's host",
  ).toBe(400);
  expect(unwrap(crossRoute.body)?.code ?? crossRoute.body?.code).toBe(
    "NO_ELIGIBLE_OFFERING",
  );
  await student.ctx.dispose();
});

// ---------------------------------------------------------------------------
// S03 — drafts
// ---------------------------------------------------------------------------
test("S03 drafts: a draft is readable in its own tenant and a masked 404 in the other", async ({
  gate,
}) => {
  const w = W();
  allowPaths(gate, ["/api/v1/admin/applications/", "/api/v1/applications/"]);
  const adminA = await loginAs(w.A.adminEmail, w.A.adminPassword);

  const own = await adminA.ctx.get(
    `/api/v1/admin/applications/${w.A.applicationId}/`,
  );
  expect(own.status(), "tenant A's admin reads tenant A's draft").toBe(200);

  const cross = await adminA.ctx.get(
    `/api/v1/admin/applications/${w.B.applicationId}/`,
  );
  await expectMaskedRefusal(
    cross,
    w.B,
    "tenant A's admin reading tenant B's draft",
  );

  const roster = await adminA.ctx.get(
    "/api/v1/admin/applications/?pageSize=200",
  );
  expect(roster.ok()).toBeTruthy();
  const ids = rowsOf(await roster.json()).map((row: any) => String(row.id));
  expect(ids, "the roster carries tenant A's application").toContain(
    w.A.applicationId,
  );
  expect(ids, "the roster must not carry tenant B's application").not.toContain(
    w.B.applicationId,
  );

  await adminA.ctx.dispose();
});

// ---------------------------------------------------------------------------
// S04 — grades
// ---------------------------------------------------------------------------
test("S04 grades: persisted Grade 12 results do not cross the tenant boundary", async ({
  gate,
}) => {
  const w = W();
  allowPaths(gate, ["/grades/"]);
  const adminA = await loginAs(w.A.adminEmail, w.A.adminPassword);

  const own = await adminA.ctx.get(
    `/api/v1/applications/${w.A.applicationId}/grades/`,
  );
  expect(own.status()).toBe(200);
  expect(
    rowsOf(await own.json()).length,
    "five results were persisted for tenant A",
  ).toBe(5);

  const cross = await adminA.ctx.get(
    `/api/v1/applications/${w.B.applicationId}/grades/`,
  );
  await expectMaskedRefusal(
    cross,
    w.B,
    "tenant A's admin reading tenant B's grades",
  );

  await adminA.ctx.dispose();
});

// ---------------------------------------------------------------------------
// S05 — custom docs
// ---------------------------------------------------------------------------
test("S05 custom docs: a tenant document requirement gates its own applicants only", async ({
  gate,
}) => {
  const w = W();
  allowPaths(gate, ["/required-documents/"]);

  // Scoped to tenant A's *offering*, not to the whole institution: an
  // institution-wide requirement would gate every other required journey's
  // submissions on this shared stack, which is a fixture leaking into other
  // tests rather than a claim about isolation.
  const label = `Tenant A custom evidence ${w.stamp}`;
  const created = await w.admin.ctx.post(
    `/api/v1/admin/institutions/${w.A.institutionId}/required-documents/`,
    {
      headers: { "x-csrf-token": w.admin.csrf },
      data: {
        institution_id: w.A.institutionId,
        program_id: w.A.offeringId,
        document_type: "other",
        label,
        is_required: true,
      },
    },
  );
  expect(
    [200, 201].includes(created.status()),
    `the tenant requirement should be created (got ${created.status()}: ${await created.text()})`,
  ).toBeTruthy();

  // A NEW draft on each host, so each resolves the requirement configuration as
  // it stands now (the snapshot is taken at create time — R7.2).
  const seen: Record<string, string[]> = {};
  for (const side of [w.A, w.B]) {
    const student = await registerStudentOnHost(
      side.host,
      `s05-${side.tag.toLowerCase()}`,
    );
    const draft = await createDraftOnHost(student.ctx, student.csrf, {
      canonicalProgramId: w.canonicalProgramId,
      intakeId: side.intakeId,
      email: student.email,
      fullName: `Custom Docs ${side.tag}`,
    });
    expect([200, 201].includes(draft.status)).toBeTruthy();
    const applicationId = String(unwrap(draft.body).id);
    const requirements = await student.ctx.get(
      `/api/v1/applications/${applicationId}/required-documents/`,
    );
    expect(requirements.ok()).toBeTruthy();
    const payload = unwrap(await requirements.json());
    seen[side.tag] = (payload?.requirements ?? []).map((row: any) =>
      String(row.label),
    );
    await student.ctx.dispose();
  }

  expect(
    seen.A,
    "tenant A's own requirement must appear for tenant A's applicant",
  ).toContain(label);
  expect(
    seen.B,
    "tenant A's requirement must not appear for tenant B's applicant",
  ).not.toContain(label);

  // And tenant B's admin cannot read tenant A's requirement configuration.
  const adminB = await loginAs(w.B.adminEmail, w.B.adminPassword);
  const crossConfig = await adminB.ctx.get(
    `/api/v1/admin/institutions/${w.A.institutionId}/required-documents/?pageSize=100`,
  );
  const crossLabels = crossConfig.ok()
    ? rowsOf(await crossConfig.json()).map((row: any) => String(row.label))
    : [];
  expect(
    crossLabels,
    "tenant B's admin must not read tenant A's requirement configuration",
  ).not.toContain(label);
  await adminB.ctx.dispose();
});

// ---------------------------------------------------------------------------
// S06 — capacity. The staff projection is resolved by the canonical intake id,
// so colliding display snapshots cannot cross the tenant boundary.
// ---------------------------------------------------------------------------
test("S06 capacity: the capacity reported for an application belongs to its own tenant", async () => {
  const w = W();

  for (const side of [w.A, w.B]) {
    const detail = await w.admin.ctx.get(
      `/api/v1/applications/${side.applicationId}/`,
    );
    expect(detail.ok()).toBeTruthy();
    const application = unwrap(await detail.json());
    expect(
      Number(application.intake_capacity),
      `${side.tag}'s application must report ${side.tag}'s own intake capacity`,
    ).toBe(side.intakeCapacity);
    expect(String(application.program_offering_id)).toBe(side.offeringId);
  }
});

// ---------------------------------------------------------------------------
// S07 / S08 — waitlist and promotion
// ---------------------------------------------------------------------------
test("S07 waitlist: a waitlist position is scoped to the tenant that issued it", async ({
  gate,
}) => {
  const w = W();
  allowPaths(gate, ["/waitlist-position/"]);

  // This row's own same-named intake, so its capacity story cannot starve
  // another row's routing (see `addSameNamedIntake`).
  const rowIntake = await addSameNamedIntake(w, w.A, 2);
  const queued = await submitFreshApplicant(
    w.A,
    w.canonicalProgramId,
    "s07-a-queued",
    rowIntake,
  );
  const toUnderReview = await w.admin.ctx.post(
    `/api/v1/applications/${queued.applicationId}/review/`,
    {
      headers: { "x-csrf-token": w.admin.csrf },
      data: { new_status: "under_review", notes: "harness 13.2 S07 review" },
    },
  );
  expect(
    toUnderReview.ok(),
    `under_review should succeed (got ${toUnderReview.status()})`,
  ).toBeTruthy();
  const toWaitlist = await w.admin.ctx.post(
    `/api/v1/applications/${queued.applicationId}/review/`,
    {
      headers: { "x-csrf-token": w.admin.csrf },
      data: { new_status: "waitlisted", notes: "harness 13.2 S07 waitlist" },
    },
  );
  expect(
    toWaitlist.ok(),
    `waitlisting should succeed (got ${toWaitlist.status()}: ${await toWaitlist.text()})`,
  ).toBeTruthy();

  const position = await queued.ctx.get(
    `/api/v1/applications/${queued.applicationId}/waitlist-position/`,
  );
  expect(
    position.status(),
    "the waitlisted student reads their own position",
  ).toBe(200);
  const positionData = unwrap(await position.json());
  expect(
    Number(positionData.position ?? positionData.waitlist_position),
  ).toBeGreaterThan(0);

  // Tenant B's admin cannot read it, even holding every mutation on its own tenant.
  const adminB = await loginAs(w.B.adminEmail, w.B.adminPassword);
  const cross = await adminB.ctx.get(
    `/api/v1/applications/${queued.applicationId}/waitlist-position/`,
  );
  await expectMaskedRefusal(
    cross,
    w.A,
    "tenant B's admin reading tenant A's waitlist position",
  );
  await adminB.ctx.dispose();

  // And tenant B's own applicant is not on any queue.
  const bPosition = await w.admin.ctx.get(
    `/api/v1/applications/${w.B.applicationId}/waitlist-position/`,
  );
  expect(
    bPosition.status(),
    "tenant B's applicant is not waitlisted by anything that happened in tenant A",
  ).toBe(400);
  expect(unwrap(await bPosition.json())?.code).toBe("NOT_WAITLISTED");

  await queued.ctx.dispose();
});

test("S08 promotion: freeing a seat in one tenant changes nothing in the other", async ({
  gate,
}) => {
  const w = W();
  allowPaths(gate, ["/waitlist-position/"]);

  const rowIntake = await addSameNamedIntake(w, w.A, 2);
  const occupant = await submitFreshApplicant(
    w.A,
    w.canonicalProgramId,
    "s08-a-occupant",
    rowIntake,
  );
  const queued = await submitFreshApplicant(
    w.A,
    w.canonicalProgramId,
    "s08-a-queued",
    rowIntake,
  );

  const advance = async (applicationId: string, status: string) => {
    const resp = await w.admin.ctx.post(
      `/api/v1/applications/${applicationId}/review/`,
      {
        headers: { "x-csrf-token": w.admin.csrf },
        data: { new_status: status, notes: `harness 13.2 S08 -> ${status}` },
      },
    );
    expect(
      resp.ok(),
      `transition to ${status} should succeed (got ${resp.status()}: ${await resp.text()})`,
    ).toBeTruthy();
  };
  // Both submitted applicants occupy the row intake's two seats
  // (`CapacityService.SEAT_STATUSES` counts `submitted`/`under_review`/
  // `waitlisted`/`approved`), so the rejection below frees a real seat.
  await advance(occupant.applicationId, "under_review");
  await advance(queued.applicationId, "under_review");
  await advance(queued.applicationId, "waitlisted");

  // Tenant B's state, recorded before the seat is freed.
  const bBefore = await w.admin.ctx.get(
    `/api/v1/applications/${w.B.applicationId}/`,
  );
  const bStatusBefore = unwrap(await bBefore.json()).status;

  // Free the seat in tenant A. `approved → rejected` is not a legal transition
  // (`ALLOWED_TRANSITIONS` in `services.py`), so the rejection is issued from
  // `under_review`, which is where a decline actually happens.
  await advance(occupant.applicationId, "rejected");

  // Tenant A's own outcome is recorded rather than asserted: which applicant the
  // platform promotes, and when, is the waitlist lane's contract (task 9.x /
  // `WaitlistManager`), not this bullet's. What this bullet claims is the second
  // assertion.
  const aAfter = await w.admin.ctx.get(
    `/api/v1/applications/${queued.applicationId}/`,
  );
  const aStatusAfter = unwrap(await aAfter.json()).status;
  test.info().annotations.push({
    type: "S08 tenant A promotion outcome",
    description: `tenant A's waitlisted applicant is "${aStatusAfter}" after the seat was freed`,
  });

  const bAfter = await w.admin.ctx.get(
    `/api/v1/applications/${w.B.applicationId}/`,
  );
  const bStatusAfter = unwrap(await bAfter.json()).status;
  expect(
    bStatusAfter,
    "tenant B's applicant must be untouched by a promotion in tenant A",
  ).toBe(bStatusBefore);

  // Tenant B's queue is still empty.
  const bPosition = await w.admin.ctx.get(
    `/api/v1/applications/${w.B.applicationId}/waitlist-position/`,
  );
  expect(bPosition.status()).toBe(400);

  await occupant.ctx.dispose();
  await queued.ctx.dispose();
});

// ---------------------------------------------------------------------------
// S09 — payment
// ---------------------------------------------------------------------------
test("S09 payment: a payment is invisible and unverifiable outside its own tenant", async ({
  gate,
}) => {
  const w = W();
  allowPaths(gate, ["/api/v1/payments/"]);

  const payer = await submitFreshApplicant(
    w.A,
    w.canonicalProgramId,
    "s09-a-payer",
  );
  const initiate = await payer.ctx.post("/api/v1/payments/mobile-money/", {
    headers: { "x-csrf-token": payer.csrf },
    data: {
      application_id: payer.applicationId,
      phone: "0971000001",
      residency_category: "local",
    },
  });
  expect(
    [200, 201].includes(initiate.status()),
    `the collection should be accepted (got ${initiate.status()}: ${await initiate.text()})`,
  ).toBeTruthy();

  const rows = await payer.ctx.get(
    `/api/v1/payments/?application_id=${payer.applicationId}`,
  );
  expect(rows.ok()).toBeTruthy();
  const payment = rowsOf(await rows.json())[0];
  expect(payment?.id, "a canonical payment row should exist").toBeTruthy();

  // Settle it through the platform's own verification, so the amount is real
  // money in tenant A's ledger.
  const verify = await payer.ctx.post(
    `/api/v1/payments/${payment.id}/verify/`,
    {
      headers: { "x-csrf-token": payer.csrf },
      data: {},
    },
  );
  expect(
    verify.ok(),
    `verification should succeed (got ${verify.status()})`,
  ).toBeTruthy();
  expect(String(unwrap(await verify.json())?.amount)).toBe(w.A.feeAmount);

  const adminA = await loginAs(w.A.adminEmail, w.A.adminPassword);
  const adminB = await loginAs(w.B.adminEmail, w.B.adminPassword);

  const ownList = await adminA.ctx.get("/api/v1/payments/?pageSize=200");
  expect(ownList.ok()).toBeTruthy();
  expect(
    rowsOf(await ownList.json()).map((row: any) => String(row.id)),
    "tenant A's admin sees tenant A's payment",
  ).toContain(String(payment.id));

  const crossList = await adminB.ctx.get("/api/v1/payments/?pageSize=200");
  expect(crossList.ok()).toBeTruthy();
  expect(
    rowsOf(await crossList.json()).map((row: any) => String(row.id)),
    "tenant B's admin must not see tenant A's payment",
  ).not.toContain(String(payment.id));

  const crossVerify = await adminB.ctx.post(
    `/api/v1/payments/${payment.id}/verify/`,
    {
      headers: { "x-csrf-token": adminB.csrf },
      data: {},
    },
  );
  await expectMaskedRefusal(
    crossVerify,
    w.A,
    "tenant B's admin verifying tenant A's payment",
  );

  await adminA.ctx.dispose();
  await adminB.ctx.dispose();
  await payer.ctx.dispose();
});

// ---------------------------------------------------------------------------
// S10 — amendments
// ---------------------------------------------------------------------------
test("S10 amendments: an amendment is unlistable and unreviewable outside its tenant", async ({
  gate,
}) => {
  const w = W();
  allowPaths(gate, ["/amendments/"]);

  const applicant = await submitFreshApplicant(
    w.A,
    w.canonicalProgramId,
    "s10-a-amender",
  );
  const request = await applicant.ctx.post(
    `/api/v1/applications/${applicant.applicationId}/amendments/`,
    {
      headers: { "x-csrf-token": applicant.csrf },
      data: {
        field_name: "phone",
        new_value: "+260971000002",
        reason: "harness 13.2 S10 amendment reason",
      },
    },
  );
  expect(
    [200, 201].includes(request.status()),
    `the amendment should be accepted (got ${request.status()}: ${await request.text()})`,
  ).toBeTruthy();
  // The create envelope names it `amendment_id` (the list names it `id`).
  const created = unwrap(await request.json());
  const amendmentId = String(created?.amendment_id ?? created?.id ?? "");
  expect(amendmentId, "the amendment should have an id").toBeTruthy();

  /**
   * The amendment **list** is owner-only, not staff-scoped:
   * `ApplicationAmendmentView` resolves through
   * `authorize_owned_application(..., allow_scoped_staff=False)`, so *every*
   * non-owner — including the owning tenant's own admin — is one
   * indistinguishable 404 (AUTH-07). Measured here first: tenant A's admin also
   * receives 404 on it. A cross-tenant list probe therefore measures **ownership**
   * rather than tenancy, so this row makes the ownership claim on the list and the
   * *tenant* claim on the review command, which is the staff-scoped one.
   */
  const listAsOwner = await applicant.ctx.get(
    `/api/v1/applications/${applicant.applicationId}/amendments/`,
  );
  expect(listAsOwner.status(), "the owner lists their own amendment").toBe(200);
  const ownerRows = rowsOf(await listAsOwner.json());
  const pending = ownerRows.find(
    (row: any) => String(row.id ?? row.amendment_id) === amendmentId,
  );
  expect(pending, "the owner's own amendment is present").toBeTruthy();
  expect(String(pending.status)).toBe("pending");

  // Tenant B's *student* cannot reach it at all.
  const bStudent = await loginAs(
    w.B.studentEmail,
    w.B.studentPassword,
    w.B.origin,
  );
  const crossStudentList = await bStudent.ctx.get(
    `/api/v1/applications/${applicant.applicationId}/amendments/`,
  );
  await expectMaskedRefusal(
    crossStudentList,
    w.A,
    "tenant B's student listing tenant A's amendments",
  );
  await bStudent.ctx.dispose();

  // The tenant boundary, on the command that is genuinely staff-scoped.
  // `status`, not `action`: the review command validates the target status
  // **before** it resolves scope, so a malformed body answers 400 for every
  // caller and would hide the boundary this row is measuring behind a
  // validation error.
  const adminB = await loginAs(w.B.adminEmail, w.B.adminPassword);
  const crossReview = await adminB.ctx.post(
    `/api/v1/applications/${applicant.applicationId}/amendments/${amendmentId}/review/`,
    { headers: { "x-csrf-token": adminB.csrf }, data: { status: "approved" } },
  );
  await expectMaskedRefusal(
    crossReview,
    w.A,
    "tenant B's admin reviewing tenant A's amendment",
  );
  await adminB.ctx.dispose();

  // A refused command mutates nothing: still pending, read as the owner.
  const afterRefusal = await applicant.ctx.get(
    `/api/v1/applications/${applicant.applicationId}/amendments/`,
  );
  const stillPending = rowsOf(await afterRefusal.json()).find(
    (row: any) => String(row.id ?? row.amendment_id) === amendmentId,
  );
  expect(
    String(stillPending?.status),
    "a refused cross-tenant review changes nothing",
  ).toBe("pending");

  // And the same command from tenant A's own admin succeeds, so the refusal above
  // is attributable to scope rather than to capability.
  const adminA = await loginAs(w.A.adminEmail, w.A.adminPassword);
  const ownReview = await adminA.ctx.post(
    `/api/v1/applications/${applicant.applicationId}/amendments/${amendmentId}/review/`,
    { headers: { "x-csrf-token": adminA.csrf }, data: { status: "approved" } },
  );
  expect(
    ownReview.ok(),
    `tenant A's admin reviews tenant A's amendment (got ${ownReview.status()}: ${await ownReview.text()})`,
  ).toBeTruthy();
  await adminA.ctx.dispose();
  await applicant.ctx.dispose();
});

// ---------------------------------------------------------------------------
// S11 — notifications
// ---------------------------------------------------------------------------
test("S11 notifications: a student inbox is theirs, and no admin reads across the boundary", async ({
  gate,
}) => {
  const w = W();
  allowPaths(gate, ["/api/v1/notifications/"]);

  // Both students get platform messages by being reviewed.
  const inboxes: Record<
    string,
    { ctx: APIRequestContext; ids: string[]; userId: string }
  > = {};
  for (const side of [w.A, w.B]) {
    const applicant = await submitFreshApplicant(
      side,
      w.canonicalProgramId,
      `s11-${side.tag.toLowerCase()}`,
    );
    const review = await w.admin.ctx.post(
      `/api/v1/applications/${applicant.applicationId}/review/`,
      {
        headers: { "x-csrf-token": w.admin.csrf },
        data: {
          new_status: "under_review",
          notes: `harness 13.2 S11 ${side.tag}`,
        },
      },
    );
    expect(review.ok()).toBeTruthy();
    const session = await applicant.ctx.get("/api/v1/auth/session/");
    const userId = String(unwrap(await session.json())?.id ?? "");
    const list = await applicant.ctx.get("/api/v1/notifications/?pageSize=100");
    expect(list.ok()).toBeTruthy();
    inboxes[side.tag] = {
      ctx: applicant.ctx,
      ids: rowsOf(await list.json()).map((row: any) => String(row.id)),
      userId,
    };
  }

  for (const id of inboxes.A.ids) {
    expect(
      inboxes.B.ids,
      "tenant B's student must not receive tenant A's messages",
    ).not.toContain(id);
  }

  // A tenant admin cannot read the other tenant's student's inbox by user id.
  const adminB = await loginAs(w.B.adminEmail, w.B.adminPassword);
  const crossInbox = await adminB.ctx.get(
    `/api/v1/notifications/user/${inboxes.A.userId}/`,
  );
  expect(
    [401, 403, 404].includes(crossInbox.status()),
    `reading another tenant's student inbox should be refused, got ${crossInbox.status()}`,
  ).toBeTruthy();
  await adminB.ctx.dispose();

  await inboxes.A.ctx.dispose();
  await inboxes.B.ctx.dispose();
});

// ---------------------------------------------------------------------------
// S12 — review
// ---------------------------------------------------------------------------
test("S12 review: a cross-tenant review command is refused and mutates nothing", async ({
  gate,
}) => {
  const w = W();
  allowPaths(gate, ["/review/"]);

  const applicant = await submitFreshApplicant(
    w.A,
    w.canonicalProgramId,
    "s12-a-subject",
  );
  const before = await w.admin.ctx.get(
    `/api/v1/applications/${applicant.applicationId}/`,
  );
  const beforeBody = unwrap(await before.json());

  const adminB = await loginAs(w.B.adminEmail, w.B.adminPassword);
  const cross = await adminB.ctx.post(
    `/api/v1/applications/${applicant.applicationId}/review/`,
    {
      headers: { "x-csrf-token": adminB.csrf },
      data: {
        new_status: "rejected",
        notes: "cross-tenant review probe from tenant B",
      },
    },
  );
  await expectMaskedRefusal(
    cross,
    w.A,
    "tenant B's admin reviewing tenant A's application",
  );
  await adminB.ctx.dispose();

  const after = await w.admin.ctx.get(
    `/api/v1/applications/${applicant.applicationId}/`,
  );
  const afterBody = unwrap(await after.json());
  expect(afterBody.status, "a refused review must not move the status").toBe(
    beforeBody.status,
  );
  expect(
    Number(afterBody.version ?? 0),
    "a refused review must not bump the version",
  ).toBe(Number(beforeBody.version ?? 0));

  // The same command from tenant A's own admin succeeds, so the refusal above is
  // attributable to scope rather than to capability.
  const adminA = await loginAs(w.A.adminEmail, w.A.adminPassword);
  const own = await adminA.ctx.post(
    `/api/v1/applications/${applicant.applicationId}/review/`,
    {
      headers: { "x-csrf-token": adminA.csrf },
      data: {
        new_status: "under_review",
        notes: "harness 13.2 S12 own-tenant control",
      },
    },
  );
  expect(
    own.ok(),
    `tenant A's admin holds review on its own tenant (got ${own.status()}: ${await own.text()})`,
  ).toBeTruthy();
  await adminA.ctx.dispose();
  await applicant.ctx.dispose();
});

// ---------------------------------------------------------------------------
// S13 — official documents
// ---------------------------------------------------------------------------
test("S13 official documents: an official artifact is unreachable outside its tenant", async ({
  gate,
}) => {
  const w = W();
  allowPaths(gate, ["/official-documents/"]);

  const applicant = await submitFreshApplicant(
    w.A,
    w.canonicalProgramId,
    "s13-a-owner",
  );
  const issue = await applicant.ctx.post(
    `/api/v1/applications/${applicant.applicationId}/official-documents/application_slip/`,
    { headers: { "x-csrf-token": applicant.csrf }, data: {} },
  );
  expect(
    [200, 202].includes(issue.status()),
    `a submitted application may issue its slip (got ${issue.status()}: ${await issue.text()})`,
  ).toBeTruthy();

  const adminB = await loginAs(w.B.adminEmail, w.B.adminPassword);
  for (const path of [
    `/api/v1/applications/${applicant.applicationId}/official-documents/`,
    `/api/v1/applications/${applicant.applicationId}/official-documents/application_slip/`,
  ]) {
    const cross = await adminB.ctx.get(path);
    await expectMaskedRefusal(cross, w.A, `tenant B's admin reading ${path}`);
  }
  const crossIssue = await adminB.ctx.post(
    `/api/v1/applications/${applicant.applicationId}/official-documents/application_slip/`,
    { headers: { "x-csrf-token": adminB.csrf }, data: {} },
  );
  await expectMaskedRefusal(
    crossIssue,
    w.A,
    "tenant B's admin issuing tenant A's slip",
  );
  await adminB.ctx.dispose();

  // Tenant B's *student* is refused the same way — the boundary is not an
  // admin-only concept.
  const bStudent = await loginAs(
    w.B.studentEmail,
    w.B.studentPassword,
    w.B.origin,
  );
  const studentCross = await bStudent.ctx.get(
    `/api/v1/applications/${applicant.applicationId}/official-documents/application_slip/`,
  );
  await expectMaskedRefusal(
    studentCross,
    w.A,
    "tenant B's student reading tenant A's slip",
  );
  await bStudent.ctx.dispose();

  await applicant.ctx.dispose();
});

// ---------------------------------------------------------------------------
// S14 — audit
// ---------------------------------------------------------------------------
test("S14 audit: audit rows are readable only inside their own institution scope", async ({
  gate,
}) => {
  const w = W();
  allowPaths(gate, ["/audit/", "/api/v1/admin/tenant-audit/"]);
  const adminA = await loginAs(w.A.adminEmail, w.A.adminPassword);

  const own = await adminA.ctx.get(
    `/api/v1/admin/institutions/${w.A.institutionId}/audit/?pageSize=100`,
  );
  expect(own.status(), "tenant A's admin reads tenant A's audit trail").toBe(
    200,
  );
  const ownBody = unwrap(await own.json());
  expect(String(ownBody.institution_id)).toBe(w.A.institutionId);
  expect(
    Number(ownBody.totalCount),
    "the world build produced audited writes",
  ).toBeGreaterThan(0);
  for (const row of rowsOf(ownBody)) {
    const serialised = JSON.stringify(row);
    expect(
      serialised.includes(w.B.institutionId),
      "no audit row in tenant A's trail may reference tenant B",
    ).toBeFalsy();
  }

  const cross = await adminA.ctx.get(
    `/api/v1/admin/institutions/${w.B.institutionId}/audit/`,
  );
  await expectMaskedRefusal(
    cross,
    w.B,
    "tenant A's admin reading tenant B's audit trail",
  );

  // The platform-wide trail stays platform-only.
  const platform = await adminA.ctx.get(
    "/api/v1/admin/tenant-audit/?pageSize=20",
  );
  expect(
    [401, 403, 404].includes(platform.status()),
    `a tenant admin must not read the platform audit trail, got ${platform.status()}`,
  ).toBeTruthy();

  await adminA.ctx.dispose();
});

// ---------------------------------------------------------------------------
// S15 — settlement
// ---------------------------------------------------------------------------
test("S15 settlement: money reports carry one tenant's rows and one tenant's amounts", async ({
  gate,
}) => {
  const w = W();
  allowPaths(gate, ["/api/v1/payments/settlements/", "/api/v1/admin/fees/"]);

  // Money in tenant A only.
  const payer = await submitFreshApplicant(
    w.A,
    w.canonicalProgramId,
    "s15-a-payer",
  );
  const initiate = await payer.ctx.post("/api/v1/payments/mobile-money/", {
    headers: { "x-csrf-token": payer.csrf },
    data: {
      application_id: payer.applicationId,
      phone: "0971000001",
      residency_category: "local",
    },
  });
  expect([200, 201].includes(initiate.status())).toBeTruthy();
  const rows = await payer.ctx.get(
    `/api/v1/payments/?application_id=${payer.applicationId}`,
  );
  const payment = rowsOf(await rows.json())[0];
  await payer.ctx.post(`/api/v1/payments/${payment.id}/verify/`, {
    headers: { "x-csrf-token": payer.csrf },
    data: {},
  });

  const adminA = await loginAs(w.A.adminEmail, w.A.adminPassword);
  const adminB = await loginAs(w.B.adminEmail, w.B.adminPassword);

  const ownSettlement = await adminA.ctx.get(
    "/api/v1/payments/settlements/?pageSize=100",
  );
  expect(ownSettlement.status()).toBe(200);
  const ownRows = rowsOf(await ownSettlement.json());
  expect(
    ownRows.length,
    "tenant A's settlement report has rows",
  ).toBeGreaterThan(0);
  for (const row of ownRows) {
    expect(
      String(row.institution_id),
      "every settlement row belongs to the reading tenant",
    ).toBe(w.A.institutionId);
  }

  const crossSettlement = await adminA.ctx.get(
    `/api/v1/payments/settlements/?institution_id=${w.B.institutionId}`,
  );
  await expectMaskedRefusal(
    crossSettlement,
    w.B,
    "tenant A filtering settlement to tenant B",
  );

  const bSettlement = await adminB.ctx.get(
    "/api/v1/payments/settlements/?pageSize=100",
  );
  expect(bSettlement.status()).toBe(200);
  for (const row of rowsOf(await bSettlement.json())) {
    expect(String(row.institution_id)).toBe(w.B.institutionId);
  }

  // The fee report: identical offering names, different amounts, and each tenant
  // sees only its own number.
  const ownFees = await adminA.ctx.get("/api/v1/admin/fees/?pageSize=100");
  expect(ownFees.status()).toBe(200);
  const ownFeeRows = rowsOf(await ownFees.json()).filter(
    (row: any) =>
      String(row.program_offering_id ?? row.program_id) === w.A.offeringId,
  );
  expect(
    ownFeeRows.length,
    "tenant A's own offering appears in its fee report",
  ).toBeGreaterThan(0);
  const ownAmounts = JSON.stringify(ownFeeRows);
  expect(ownAmounts).toContain(w.A.feeAmount);
  expect(
    ownAmounts.includes(w.B.feeAmount),
    "tenant A's fee report must not carry tenant B's amount",
  ).toBeFalsy();

  const crossFees = await adminA.ctx.get(
    `/api/v1/admin/fees/?institution_id=${w.B.institutionId}`,
  );
  await expectMaskedRefusal(
    crossFees,
    w.B,
    "tenant A filtering the fee report to tenant B",
  );

  await adminA.ctx.dispose();
  await adminB.ctx.dispose();
  await payer.ctx.dispose();
});

// ---------------------------------------------------------------------------
// S16 — public tracking
// ---------------------------------------------------------------------------
test("S16 public tracking: a tracking secret resolves to exactly one tenant, with no PII", async ({
  gate,
}) => {
  const w = W();
  allowPaths(gate, ["/api/v1/applications/track/"]);
  const { request: pwRequest } = await import("@playwright/test");

  const codes: Record<string, string> = {};
  for (const side of [w.A, w.B]) {
    const student = await loginAs(
      side.studentEmail,
      side.studentPassword,
      side.origin,
    );
    const session = await student.ctx.get(
      "/api/v1/auth/session/?refresh_csrf=1",
    );
    const csrf = session.headers()["x-csrf-token"] || student.csrf;
    const link = await student.ctx.post(
      `/api/v1/applications/${side.applicationId}/tracking-link/`,
      { headers: { "x-csrf-token": csrf }, data: {} },
    );
    expect(
      [200, 201].includes(link.status()),
      `${side.tag} should be issued a tracking link (got ${link.status()}: ${await link.text()})`,
    ).toBeTruthy();
    codes[side.tag] = String(unwrap(await link.json())?.code ?? "");
    expect(codes[side.tag], "a tracking code should be issued").toBeTruthy();
    await student.ctx.dispose();
  }

  expect(codes.A).not.toBe(codes.B);

  // Each code resolves, with NO session, to its own tenant only.
  const anonymous = await pwRequest.newContext({ baseURL: neutralOrigin() });
  for (const side of [w.A, w.B]) {
    const other = side.tag === "A" ? w.B : w.A;
    const tracked = await anonymous.get(
      `/api/v1/applications/track/?code=${encodeURIComponent(codes[side.tag])}`,
    );
    expect(tracked.status(), `${side.tag}'s code should resolve publicly`).toBe(
      200,
    );
    const body = unwrap(await tracked.json());
    expect(
      String(body.institution),
      "the tracked row names its own tenant",
    ).toBe(side.code);
    const serialised = JSON.stringify(body);
    expect(
      serialised.includes(other.code),
      "a tracked row must not name the other tenant",
    ).toBeFalsy();
    // R13.12: the public surface carries no PII.
    for (const forbidden of ["nrc", "phone", "email", "date_of_birth"]) {
      expect(
        Object.keys(body).some((key) => key.toLowerCase().includes(forbidden)),
        `the public tracking payload must not publish ${forbidden}`,
      ).toBeFalsy();
    }
  }

  // An unknown but well-formed code discloses nothing about either tenant.
  const unknown = await anonymous.get(
    "/api/v1/applications/track/?code=TRK-ZZZZZZZZ-ZZZZZZZZZZZZZZZZZZZZ",
  );
  expect(
    [400, 404].includes(unknown.status()),
    `an unknown code should be refused, got ${unknown.status()}`,
  ).toBeTruthy();
  const unknownBody = await unknown.text();
  for (const side of [w.A, w.B]) {
    expect(unknownBody.includes(side.institutionId)).toBeFalsy();
  }
  await anonymous.dispose();
});
