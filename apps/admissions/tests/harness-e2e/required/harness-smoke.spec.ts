/**
 * Required V2 harness smoke (task 0.4, R1.4 / R18.1-4; findings GOV-04, TEN-07).
 *
 * This is the honest, un-gated replacement for the descriptive staging specs.
 * It runs against the isolated local harness with ZERO skips and the strict
 * gates active (see harness-fixtures.ts). Every test must pass on a clean
 * machine via `harness/bin/harness smoke`.
 */
import { test, expect } from '../harness-fixtures';
import {
  registerAndLoginStudent,
  resolveTenant,
  superAdminContext,
  createInstitutionViaApi,
  freshContext,
} from '../helpers/api';
import { assertRequiredJobsDrained, resetAdapter } from '../helpers/ops';

test.describe('Admissions V2 isolated harness', () => {
  test('edge serves the admissions SPA cleanly (no console errors, no unasserted failed requests)', async ({
    page,
    gate,
  }) => {
    // The error-reporter DSN is an intentionally-unreachable local sentinel in
    // the harness; a stray init call is an asserted, expected error path.
    gate.allowRequest('harness-invalid.localhost');
    gate.allowRequest('glitchtip');

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // The SPA shell must actually mount (not a blank/error page).
    await expect(page.locator('#root')).toBeAttached();
    await page.waitForLoadState('networkidle');
    const rootHtml = await page.locator('#root').innerHTML();
    expect(rootHtml.trim().length, 'the SPA root should render content').toBeGreaterThan(0);
    // Gate teardown asserts: no pageerror, no unexpected console.error, no
    // unasserted failed request.
  });

  test('provisions a fresh user through the public API with no stored state', async () => {
    const { ctx, email } = await registerAndLoginStudent();
    // A second, independent fresh user proves there is no shared session state.
    const second = await registerAndLoginStudent();
    expect(second.email).not.toEqual(email);
    await ctx.dispose();
    await second.ctx.dispose();
  });

  test('resolves two isolated tenants and a neutral context by host (TEN-07 / TEN-10)', async () => {
    const mihas = await resolveTenant('mihas.localhost');
    const katc = await resolveTenant('katc.localhost');
    const neutral = await resolveTenant('localhost');

    // Each tenant host binds its own institution.
    expect(mihas.institution_code).toBe('MIHAS');
    expect(katc.institution_code).toBe('KATC');
    // Isolation: the two tenants are distinct records.
    expect(mihas.institution_id).toBeTruthy();
    expect(katc.institution_id).toBeTruthy();
    expect(mihas.institution_id).not.toEqual(katc.institution_id);
    // The neutral shared-portal host resolves to NO tenant (fail-closed).
    expect(neutral.institution_id).toBeNull();
  });

  test('super-admin can create a tenant institution + domain via the admin API', async () => {
    const admin = await superAdminContext();
    const stamp = `${Date.now()}`.slice(-8);
    const { institutionId } = await createInstitutionViaApi(admin, {
      name: `Harness API School ${stamp}`,
      code: `HAPI${stamp}`,
      hostname: `hapi-${stamp}.localhost`,
    });
    expect(institutionId).toBeTruthy();
    await admin.ctx.dispose();
  });

  test('deterministic payment adapter honours the Lenco collection contract', async () => {
    const ctx = await freshContext(process.env.HARNESS_ADAPTER_URL || 'http://localhost:59099');
    const reference = `HARNESS-PAY-${Date.now()}`;
    const initiate = await ctx.post('/collections/mobile-money', {
      data: { reference, phone: '+260971234567', amount: '153.00', operator: 'airtel' },
    });
    expect(initiate.ok()).toBeTruthy();
    const initiated = (await initiate.json()).data;
    expect(initiated.reference).toBe(reference);

    const status = await ctx.get(`/collections/status/${reference}`);
    expect(status.ok()).toBeTruthy();
    // Default deterministic outcome is a successful collection.
    expect((await status.json()).data.status).toBe('successful');
    await ctx.dispose();
  });

  test('deterministic domain adapter publishes and returns DNS records', async () => {
    const ctx = await freshContext(process.env.HARNESS_ADAPTER_URL || 'http://localhost:59099');
    const hostname = `verify-${Date.now()}.localhost`;
    const publish = await ctx.post('/dns/publish', {
      data: { hostname, records: ['beanola-verify=harness-token'] },
    });
    expect(publish.ok()).toBeTruthy();
    const lookup = await ctx.get(`/dns/records?hostname=${hostname}`);
    expect(lookup.ok()).toBeTruthy();
    expect((await lookup.json()).records).toContain('beanola-verify=harness-token');
    await ctx.dispose();
  });

  // Runs last: proves the harness left no undrained required background jobs.
  test('zz required background jobs are drained (R18.4)', async () => {
    const depth = await assertRequiredJobsDrained();
    expect(depth.unsettled_payment_collections).toBe(0);
    // Leave the adapter observer clean for any subsequent run.
    await resetAdapter();
  });
});
