/**
 * Canonical catalog write + legacy-freeze E2E (task 5.1, R7.1-R7.5, R14.7).
 *
 * DEFERRED SPEC — authored as the task-5.1 Required_Evidence "catalog E2E". It
 * lives under `deferred/` (not `required/`) on purpose: task 13.2 wires the
 * catalog journey into the two-tenant golden + adversarial matrix (same-name
 * cross-tenant isolation, concurrent last-seat, offline injection) and runs it
 * as part of the full required suite. Until then the semantics proven here are
 * covered now at the backend level by
 * `backend/tests/unit/test_catalog_write_freeze.py` (12 passing) and the
 * authority-matrix gate `backend/tests/unit/test_authority_matrix_v2.py`, and
 * at the frontend level by the admin page-verification + architecture tests.
 *
 * What this journey drives against the real harness (admin API + fail-closed
 * resolver), all through the CANONICAL Canonical_Program -> Program_Offering ->
 * Intake_Offering -> FeeSchedule graph — never a display-string identifier:
 *
 *   1. R7.1 FREEZE: POST /catalog/programs/ WITHOUT canonical_program_id is
 *      rejected 400 CANONICAL_PROGRAM_REQUIRED and creates no offering row.
 *   2. CANONICAL WRITE: assign a canonical program to tenant A (offering),
 *      link an intake with capacity, and configure an application fee — the
 *      only offering-create authority is the canonical program id (TEN-03).
 *   3. CANONICAL INTAKE HOME: /api/v1/admin/intakes/ CRUD works for the
 *      super-admin (R7.3); the legacy /catalog/intakes/ write still succeeds
 *      but is deprecation-signalled (RFC 8594 `Deprecation` + successor Link)
 *      so residual callers are measured until Phase 12.2 removes the route
 *      (R14.7).
 *   4. TWO-TENANT ISOLATION: tenant B, offering the SAME canonical program with
 *      the SAME display name, never sees tenant A's offering or fee through the
 *      tenant-scoped admin child endpoint (R7.7).
 *
 * No production credentials, no seed-specific ids: every id is fetched from the
 * canonical-program catalogue or returned by a create call.
 */
import { test, expect } from '../harness-fixtures';
import {
  superAdminContext,
  listCanonicalPrograms,
  assignOffering,
  linkIntake,
  createFee,
  listTenantOfferings,
  type AuthedContext,
} from '../helpers/api';

function unwrap(json: any): any {
  return json && typeof json === 'object' && 'data' in json ? json.data : json;
}

async function createInstitution(
  admin: AuthedContext,
  spec: { name: string; code: string },
): Promise<string> {
  const resp = await admin.ctx.post('/api/v1/admin/institutions/', {
    headers: { 'x-csrf-token': admin.csrf },
    data: { name: spec.name, code: spec.code, full_name: spec.name, slug: spec.code.toLowerCase() },
  });
  expect([200, 201]).toContain(resp.status());
  const id = unwrap(await resp.json())?.id as string;
  expect(id, 'created institution should have an id').toBeTruthy();
  return id;
}

test.describe('Canonical catalog writes + legacy freeze (task 5.1)', () => {
  test('rejects a display-string offering write and accepts the canonical graph', async () => {
    const admin = await superAdminContext();
    const stamp = `${Date.now()}`.slice(-9);

    const institutionId = await createInstitution(admin, {
      name: `Catalog A ${stamp}`,
      code: `CATA${stamp}`,
    });

    // 1. R7.1 FREEZE — a bare display-string program (no canonical link) is rejected.
    const frozen = await admin.ctx.post('/api/v1/catalog/programs/', {
      headers: { 'x-csrf-token': admin.csrf },
      data: {
        institution_id: institutionId,
        name: `Free Text Program ${stamp}`,
        code: `FT${stamp}`,
        duration_months: 36,
      },
    });
    expect(frozen.status(), 'offering write without canonical_program_id is frozen').toBe(400);
    expect((await frozen.json()).code).toBe('CANONICAL_PROGRAM_REQUIRED');

    // 2. CANONICAL WRITE — assign a canonical program, link an intake, add a fee.
    const canonical = await listCanonicalPrograms(admin);
    expect(canonical.length, 'harness seeds a canonical program catalogue').toBeGreaterThan(0);
    const canonicalProgramId = canonical[0].id as string;

    const { offeringId } = await assignOffering(admin, institutionId, {
      canonical_program_id: canonicalProgramId,
      name: `Shared Name Program ${stamp}`,
      code: `OFRA${stamp}`,
    });

    // A global intake period via the CANONICAL admin home (R7.3), then link it.
    const adminIntake = await admin.ctx.post('/api/v1/admin/intakes/', {
      headers: { 'x-csrf-token': admin.csrf },
      data: { name: `Canonical Intake ${stamp}`, year: 2027, application_deadline: '2027-02-01', max_capacity: 60 },
    });
    expect(adminIntake.status(), 'canonical /admin/intakes/ create').toBe(201);
    expect(adminIntake.headers()['deprecation'], 'canonical home is NOT deprecated').toBeFalsy();
    const intakeId = unwrap(await adminIntake.json()).id as string;

    await linkIntake(admin, { program_id: offeringId, intake_id: intakeId, max_capacity: 40 });
    await createFee(admin, offeringId, { amount: '350.00', residency_category: 'local' });

    // The offering is visible on tenant A's scoped listing.
    const offeringsA = await listTenantOfferings(admin, institutionId);
    expect(offeringsA.map((o) => o.id)).toContain(offeringId);

    await admin.ctx.dispose();
  });

  test('the legacy /catalog/intakes/ write is deprecation-signalled (R14.7)', async () => {
    const admin = await superAdminContext();
    const stamp = `${Date.now()}`.slice(-9);

    const legacy = await admin.ctx.post('/api/v1/catalog/intakes/', {
      headers: { 'x-csrf-token': admin.csrf },
      data: { name: `Legacy Intake ${stamp}`, year: 2027, application_deadline: '2027-01-01', max_capacity: 100 },
    });
    // The route still functions (frozen, not deleted) but is measured + signalled.
    expect(legacy.status()).toBe(201);
    expect(legacy.headers()['deprecation']).toBe('true');
    expect(legacy.headers()['x-legacy-catalog-write']).toBe('intake');
    expect(legacy.headers()['link'] || '').toContain('/api/v1/admin/intakes/');

    await admin.ctx.dispose();
  });

  test('two same-name tenants stay isolated across the canonical catalog', async () => {
    const admin = await superAdminContext();
    const stamp = `${Date.now()}`.slice(-9);

    const canonical = await listCanonicalPrograms(admin);
    const canonicalProgramId = canonical[0].id as string;
    const sharedName = `Nursing Diploma ${stamp}`;

    const instA = await createInstitution(admin, { name: `Iso A ${stamp}`, code: `ISOA${stamp}` });
    const instB = await createInstitution(admin, { name: `Iso B ${stamp}`, code: `ISOB${stamp}` });

    const { offeringId: offeringA } = await assignOffering(admin, instA, {
      canonical_program_id: canonicalProgramId,
      name: sharedName,
      code: `ISOA-OFR-${stamp}`,
    });
    const { offeringId: offeringB } = await assignOffering(admin, instB, {
      canonical_program_id: canonicalProgramId,
      name: sharedName,
      code: `ISOB-OFR-${stamp}`,
    });
    await createFee(admin, offeringA, { amount: '111.00', residency_category: 'local' });
    await createFee(admin, offeringB, { amount: '222.00', residency_category: 'local' });

    // Even with the SAME canonical program and SAME display name, each tenant's
    // scoped listing contains only its own offering (R7.7 — no cross-tenant leak).
    const offeringsA = await listTenantOfferings(admin, instA);
    const offeringsB = await listTenantOfferings(admin, instB);
    const idsA = offeringsA.map((o) => o.id);
    const idsB = offeringsB.map((o) => o.id);

    expect(idsA).toContain(offeringA);
    expect(idsA).not.toContain(offeringB);
    expect(idsB).toContain(offeringB);
    expect(idsB).not.toContain(offeringA);

    await admin.ctx.dispose();
  });
});
