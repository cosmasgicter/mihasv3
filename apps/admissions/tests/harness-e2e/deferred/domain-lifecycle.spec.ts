/**
 * Domain verification + lifecycle broker-down/retry E2E (task 4.4, R5.1-R5.3).
 *
 * DEFERRED SPEC — authored as the task-4.4 Required_Evidence "broker-down/retry
 * E2E using the deterministic adapter". It lives under `deferred/` (not
 * `required/`) on purpose: the strict required Playwright projects
 * (`playwright.harness.config.ts`) forbid `test.skip` and run on every clean-
 * machine smoke, but the literal broker-outage phase needs the harness to
 * pause/resume the Celery worker between the create and the recovery sweep.
 * Task 13.2 wires this file into a harness project that provides that
 * worker-pause lever and runs it in the two-tenant adversarial matrix
 * (offline / broker-outage injection). Until then the DURABLE-RECORD and
 * RETRY-RE-DISPATCH semantics are proven now at the backend integration level
 * by `backend/tests/unit/test_domain_lifecycle_endpoints.py`
 * (`test_create_broker_down_persists_and_sweeper_recovers`,
 * `test_sweeper_redispatches_only_unchecked_or_stale_pending_dns`) and the
 * hypothesis property test `test_domain_status_machine.py`.
 *
 * What this journey drives against the real harness (admin API + deterministic
 * DNS adapter + fail-closed resolver):
 *
 *   1. create a tenant + domain            -> pending_dns (durable committed job)
 *   2. publish matching DNS to the adapter, retry verification
 *                                          -> the committed job re-runs and,
 *                                             with DNS now matching, advances
 *                                             pending_dns -> pending_review
 *   3. approve                             -> pending_review -> verified
 *   4. activate                            -> verified -> active; the resolver
 *                                             now routes the tenant host
 *   5. disable                             -> active -> disabled; the resolver
 *                                             fails closed to neutral Beanola
 *   6. reactivate                          -> disabled -> active; routing returns
 *
 * Every transition rides the one `DomainStatusMachine` and the
 * `platform.domain.manage` capability policy; a forbidden transition would
 * return `DOMAIN_TRANSITION_REJECTED` (409). No production credentials, no real
 * DNS — the deterministic adapter (`/dns/publish`, `/dns/records`) stands in.
 */
import { test, expect } from '../harness-fixtures';
import { superAdminContext, resolveTenant, freshContext, type AuthedContext } from '../helpers/api';
import { ADAPTER_URL, resetAdapter } from '../helpers/ops';

const EDGE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8090';

function unwrap(json: any): any {
  return json && typeof json === 'object' && 'data' in json ? json.data : json;
}

/** Publish the domain's expected DNS target to the deterministic adapter so the
 *  next verification run matches (mirrors the harness-smoke DNS contract). */
async function publishDns(hostname: string, dnsTarget: string): Promise<void> {
  const ctx = await freshContext(ADAPTER_URL);
  const resp = await ctx.post('/dns/publish', { data: { hostname, records: [dnsTarget] } });
  expect(resp.ok(), 'adapter should publish the DNS record').toBeTruthy();
  await ctx.dispose();
}

/** Read one tenant domain by id through the admin detail endpoint. */
async function readDomain(admin: AuthedContext, institutionId: string, domainId: string): Promise<any> {
  const resp = await admin.ctx.get(
    `/api/v1/admin/institutions/${institutionId}/domains/${domainId}/`,
  );
  expect(resp.ok(), `domain detail should read (got ${resp.status()})`).toBeTruthy();
  return unwrap(await resp.json());
}

/** Poll the domain until it reaches `status`, allowing the async worker to run. */
async function waitForStatus(
  admin: AuthedContext,
  institutionId: string,
  domainId: string,
  status: string,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    last = (await readDomain(admin, institutionId, domainId)).status;
    if (last === status) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`domain ${domainId} did not reach ${status} (last=${last})`);
}

async function post(admin: AuthedContext, path: string, data?: unknown) {
  return admin.ctx.post(path, { headers: { 'x-csrf-token': admin.csrf }, data: data ?? {} });
}

test.describe('Domain verification + lifecycle (broker-down/retry)', () => {
  test.afterAll(async () => {
    await resetAdapter();
  });

  test('drives a domain through the full state machine and resolver updates', async () => {
    const admin = await superAdminContext();
    const stamp = `${Date.now()}`.slice(-9);
    const hostname = `domain-lc-${stamp}.localhost`;

    // 1. Create a tenant + a domain (pending_dns; a durable verification job is
    //    committed before the create returns accepted).
    const instResp = await post(admin, '/api/v1/admin/institutions/', {
      name: `Domain LC School ${stamp}`,
      code: `DLC${stamp}`,
      full_name: `Domain LC School ${stamp}`,
      slug: `domain-lc-${stamp}`,
    });
    expect(instResp.ok(), `institution create (got ${instResp.status()})`).toBeTruthy();
    const institutionId = unwrap(await instResp.json()).id as string;

    const domResp = await post(admin, `/api/v1/admin/institutions/${institutionId}/domains/`, {
      hostname,
      is_primary: true,
    });
    expect([200, 201]).toContain(domResp.status());
    const created = unwrap(await domResp.json());
    const domainId = created.id as string;
    const dnsTarget = created.dns_target as string;
    expect(created.status).toBe('pending_dns');
    expect(dnsTarget, 'create returns the DNS target to publish').toBeTruthy();

    // 2. Publish matching DNS, then retry — the committed job re-runs against a
    //    now-matching record and advances pending_dns -> pending_review.
    await publishDns(hostname, dnsTarget);
    const retry = await post(admin, `/api/v1/admin/institutions/${institutionId}/domains/${domainId}/retry/`);
    expect(retry.status(), 'retry commits a fresh verification job (202)').toBe(202);
    await waitForStatus(admin, institutionId, domainId, 'pending_review');

    // 3. Approve: pending_review -> verified.
    const approve = await post(admin, `/api/v1/admin/institutions/${institutionId}/domains/${domainId}/approve/`);
    expect(approve.ok(), `approve (got ${approve.status()})`).toBeTruthy();
    expect((unwrap(await approve.json())).status).toBe('verified');

    // 4. Activate: verified -> active. The fail-closed resolver now routes the host.
    const activate = await post(admin, `/api/v1/admin/institutions/${institutionId}/domains/${domainId}/activate/`);
    expect(activate.ok(), `activate (got ${activate.status()})`).toBeTruthy();
    const routed = await resolveTenant(hostname);
    expect(routed.institution_id).toBe(institutionId);

    // 5. Disable: active -> disabled. The resolver fails closed to neutral Beanola.
    const disable = await admin.ctx.patch(
      `/api/v1/admin/institutions/${institutionId}/domains/${domainId}/`,
      { headers: { 'x-csrf-token': admin.csrf }, data: { is_active: false } },
    );
    expect(disable.ok(), `disable (got ${disable.status()})`).toBeTruthy();
    const neutral = await resolveTenant(hostname);
    expect(neutral.institution_id).toBeNull();

    // 6. Reactivate: disabled -> active. Routing returns.
    const reactivate = await post(admin, `/api/v1/admin/institutions/${institutionId}/domains/${domainId}/reactivate/`);
    expect(reactivate.ok(), `reactivate (got ${reactivate.status()})`).toBeTruthy();
    const rerouted = await resolveTenant(hostname);
    expect(rerouted.institution_id).toBe(institutionId);

    await admin.ctx.dispose();
  });

  test('forbidden lifecycle transitions are rejected with DOMAIN_TRANSITION_REJECTED', async () => {
    const admin = await superAdminContext();
    const stamp = `${Date.now()}`.slice(-9);
    const hostname = `domain-bad-${stamp}.localhost`;

    const instResp = await post(admin, '/api/v1/admin/institutions/', {
      name: `Domain Bad School ${stamp}`,
      code: `DBAD${stamp}`,
      slug: `domain-bad-${stamp}`,
    });
    const institutionId = unwrap(await instResp.json()).id as string;
    const domResp = await post(admin, `/api/v1/admin/institutions/${institutionId}/domains/`, { hostname });
    const domainId = unwrap(await domResp.json()).id as string;

    // A brand-new pending_dns domain cannot be approved or activated.
    const approve = await post(admin, `/api/v1/admin/institutions/${institutionId}/domains/${domainId}/approve/`);
    expect(approve.status()).toBe(409);
    expect((await approve.json()).code).toBe('DOMAIN_TRANSITION_REJECTED');

    const reactivate = await post(admin, `/api/v1/admin/institutions/${institutionId}/domains/${domainId}/reactivate/`);
    expect(reactivate.status()).toBe(409);
    expect((await reactivate.json()).code).toBe('DOMAIN_TRANSITION_REJECTED');

    await admin.ctx.dispose();
  });
});
