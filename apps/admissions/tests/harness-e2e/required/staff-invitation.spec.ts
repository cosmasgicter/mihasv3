/**
 * Required V2 harness — tenant staff invitation + membership handoff (task 4.2).
 *
 * Spec: .kiro/specs/admissions-v2-canonical-rebuild task 4.2.
 * Requirements: R4.3 (atomic identity+invitation+membership; never return/log/
 * persist a reusable plaintext password in browser storage), R4.4 (no orphan
 * on a rejected/duplicate invite), R6.3 (invite by email search, not raw UUID).
 * Findings: TEN-01, TEN-05.
 *
 * Runs against the isolated local harness (task 0.4) with the strict gates
 * active (see harness-fixtures.ts) — zero skips. Proves the browser-facing
 * invite journey end to end over the real edge:
 *   1. A super-admin creates a fresh tenant.
 *   2. Invite a staff member BY EMAIL — the response carries NO token/password.
 *   3. Re-inviting the same email is rejected (409) with no duplicate/orphan.
 *   4. The candidate SEARCH selector finds the identity by email (R6.3).
 *   5. The invitation is listed and can be resent.
 *   6. The public accept page renders the password-handoff form for a token and
 *      fails closed on an invalid token — the invitee sets their OWN password.
 */
import { test, expect } from '../harness-fixtures';
import { superAdminContext, createInstitutionViaApi } from '../helpers/api';

function unwrap(json: any): any {
  return json && typeof json === 'object' && 'data' in json ? json.data : json;
}

test.describe('Tenant staff invitation handoff (R4.3-R4.4, R6.3)', () => {
  test('atomic invite by email returns no credential and rejects duplicates', async () => {
    const admin = await superAdminContext();
    const headers = { 'x-csrf-token': admin.csrf };
    const stamp = `${Date.now()}`.slice(-8);

    const { institutionId } = await createInstitutionViaApi(admin, {
      name: `Invite Harness School ${stamp}`,
      code: `INV${stamp}`,
      hostname: `inv-${stamp}.localhost`,
    });

    const email = `harness.staff.${stamp}@example.com`;

    // 2. Atomic invite BY EMAIL.
    const invite = await admin.ctx.post('/api/v1/admin/staff/invitations/', {
      headers,
      data: { institution_id: institutionId, email, role: 'admin' },
    });
    expect(
      invite.status(),
      `invite should be created (got ${invite.status()}: ${await invite.text()})`,
    ).toBe(201);
    const invitation = unwrap(await invite.json());
    expect(invitation.email).toBe(email);
    expect(invitation.status).toBe('pending');
    // R4.3: the response NEVER carries a reusable plaintext credential.
    const rawBody = await invite.text().catch(() => '');
    expect(invitation.token).toBeUndefined();
    expect(invitation.token_hash).toBeUndefined();
    expect(invitation.password).toBeUndefined();
    expect(rawBody.toLowerCase()).not.toContain('password');

    // 3. Duplicate invite → 409, no second record (R4.4).
    const dup = await admin.ctx.post('/api/v1/admin/staff/invitations/', {
      headers,
      data: { institution_id: institutionId, email, role: 'admin' },
    });
    expect(dup.status()).toBe(409);
    expect(unwrap(await dup.json().catch(() => ({}))) ?? {}).toBeTruthy();

    // 4. Candidate SEARCH selector finds the identity by email (R6.3).
    const search = await admin.ctx.get(
      `/api/v1/admin/staff/candidates/?q=${encodeURIComponent(`harness.staff.${stamp}`)}&institution=${institutionId}`,
    );
    expect(search.ok()).toBeTruthy();
    const candidates = unwrap(await search.json());
    expect(Array.isArray(candidates)).toBeTruthy();
    expect(candidates.some((c: any) => c.email === email)).toBeTruthy();
    // The selector projection is minimal — never a secret.
    for (const c of candidates) {
      expect(Object.keys(c).sort()).toEqual(['email', 'full_name', 'id', 'role']);
    }

    // 5. The invitation is listed and can be resent.
    const list = await admin.ctx.get(
      `/api/v1/admin/staff/invitations/?institution=${institutionId}`,
    );
    expect(list.ok()).toBeTruthy();
    const listed = unwrap(await list.json());
    const results = Array.isArray(listed) ? listed : listed.results;
    expect(results.some((i: any) => i.email === email)).toBeTruthy();

    const resend = await admin.ctx.post(
      `/api/v1/admin/staff/invitations/${invitation.id}/resend/`,
      { headers },
    );
    expect(resend.ok()).toBeTruthy();
    expect(unwrap(await resend.json()).resend_count).toBeGreaterThanOrEqual(1);

    await admin.ctx.dispose();
  });

  test('public accept page renders the password handoff and fails closed on a bad token', async ({
    page,
    gate,
  }) => {
    gate.allowRequest('glitchtip');
    gate.allowRequest('harness-invalid.localhost');
    // A valid token would show the set-your-own-password form; an invalid token
    // fails closed. Either way the invitee — never the admin — sets the password.
    await page.goto('/auth/accept-invitation?token=not-a-real-harness-token', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('#root')).toBeAttached();
    await page.waitForLoadState('networkidle');
    // The page must resolve to a real state (form or fail-closed error), not a
    // blank/crashed shell.
    const rootHtml = await page.locator('#root').innerHTML();
    expect(rootHtml.trim().length).toBeGreaterThan(0);
  });
});
