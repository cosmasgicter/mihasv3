/**
 * Operational (drain) helpers for the V2 harness (task 0.4, R18.4).
 *
 * The deterministic adapter service doubles as an operational observer: it
 * reports the Celery broker queue depth (read from Redis over the raw RESP
 * protocol) and the number of payment collections it accepted but never saw
 * settle. The "undrained required jobs" gate reads these so a required
 * Playwright project fails when background work is left hanging.
 */
import { request as playwrightRequest, type APIRequestContext, expect } from '@playwright/test';

export const ADAPTER_URL = process.env.HARNESS_ADAPTER_URL || 'http://localhost:59099';
export const MAILPIT_URL = process.env.HARNESS_MAILPIT_URL || 'http://localhost:58025';

export interface QueueDepth {
  broker_queue_depth: number;
  celery_queues: string[];
  unsettled_payment_collections: number;
  unsettled_references: string[];
}

async function adapterContext(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL: ADAPTER_URL });
}

export async function getQueueDepth(): Promise<QueueDepth> {
  const ctx = await adapterContext();
  const resp = await ctx.get('/__/queue-depth');
  expect(resp.ok(), 'adapter queue-depth should respond').toBeTruthy();
  const data = (await resp.json()) as QueueDepth;
  await ctx.dispose();
  return data;
}

export async function resetAdapter(): Promise<void> {
  const ctx = await adapterContext();
  await ctx.post('/__/reset');
  await ctx.dispose();
}

/** Directly drive the deterministic payment adapter (used by gatecheck). */
export async function initiateAdapterCollection(opts: {
  reference: string;
  phone?: string;
  amount?: string;
}): Promise<void> {
  const ctx = await adapterContext();
  const resp = await ctx.post('/collections/mobile-money', {
    data: {
      reference: opts.reference,
      phone: opts.phone ?? '+260970000001',
      amount: opts.amount ?? '153.00',
      operator: 'airtel',
      country: 'zm',
      bearer: 'customer',
    },
  });
  expect(resp.ok(), 'adapter mobile-money should accept the collection').toBeTruthy();
  await ctx.dispose();
}

/**
 * Tell the adapter a collection was abandoned on purpose, so the drain gate stops
 * waiting for it.
 *
 * There is exactly one state where the platform walks away from an open provider
 * collection: `expired`. `PaymentService.expire_stale` is a **platform** decision
 * about a request that never came back, so after it fires the platform never polls
 * that reference again — and the adapter, which counts a collection as unsettled
 * until a status poll returns something final, would keep reporting it forever. The
 * drain gate would then fail for the one journey whose subject is a payment nobody
 * settles.
 *
 * A real provider closes its own side out eventually. This says the same thing to
 * the simulator, explicitly and per reference: the abandonment is declared, not
 * hidden, and every other collection still has to settle the honest way. It never
 * touches the platform's ledger — the row stays `expired`, which is the point of
 * the journey.
 */
export async function closeAbandonedAdapterCollection(reference: string): Promise<void> {
  const ctx = await adapterContext();
  // `pending_polls: 0` is the adapter's own vocabulary for "this reference needs
  // no further poll", which is exactly true of an expired attempt.
  const resp = await ctx.post('/__/payment-rule', {
    data: { reference, pending_polls: 0 },
  });
  expect(
    resp.ok(),
    `the adapter should accept the abandoned-collection declaration for ${reference}`,
  ).toBeTruthy();
  await ctx.dispose();
}

/** Walk up from this file to `harness/docker-compose.harness.yml` (the repo root, by definition). */
async function locateHarnessComposeFile(): Promise<string> {
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { existsSync } = await import('node:fs');
  // This module is ESM, so `__dirname` does not exist. Rather than counting
  // directory hops (which depend on how the runner resolves this file), walk up
  // until the harness compose file is found.
  let dir = path.dirname(fileURLToPath(import.meta.url));
  let composeFile = '';
  for (let up = 0; up < 8; up += 1) {
    const candidate = path.join(dir, 'harness', 'docker-compose.harness.yml');
    if (existsSync(candidate)) {
      composeFile = candidate;
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  expect(
    composeFile,
    'could not locate harness/docker-compose.harness.yml above this test file',
  ).toBeTruthy();
  return composeFile;
}

/**
 * Run one line of the platform's own code inside the harness `web` container.
 *
 * The seam some required journeys need: a few states are **platform decisions**
 * rather than provider outcomes or student actions, so no HTTP lever and no
 * adapter rule can produce them. Reaching for the database directly would prove
 * only that a column can hold a value; running the platform's own method proves
 * the platform still reaches the state the same way it does in production.
 *
 * Every caller must say, in its own docstring, exactly which production timer it
 * is standing in for and what it compressed — that is what keeps this a shortcut
 * through *waiting* rather than through *behaviour*.
 *
 * Returns the container's stdout.
 */
async function runHarnessDjangoShell(statements: string[]): Promise<string> {
  const { execFileSync } = await import('node:child_process');
  const composeFile = await locateHarnessComposeFile();
  return execFileSync(
    'docker',
    [
      'compose',
      '-f',
      composeFile,
      'exec',
      '-T',
      'web',
      'python',
      'manage.py',
      'shell',
      '-c',
      // Newline-joined, not `;`-joined: a caller may need a real block (a loop
      // that reads the platform's own verdict between attempts), and `;` cannot
      // express one. `execFileSync` passes this through without a shell, so the
      // newlines reach Python intact.
      statements.join('\n'),
    ],
    { encoding: 'utf-8', timeout: 120_000 },
  );
}

/**
 * Run the platform's own stale-payment reconciliation sweep against the harness
 * stack, with the age cutoff compressed to zero hours.
 *
 * Task 8.3 needs an `expired` payment in a browser journey, and `expired` is not
 * a provider outcome — no adapter lever can produce it. It is a *platform*
 * decision made by `PaymentService.expire_stale`, which
 * `poll_pending_payments_task` calls every 10 minutes in production with a 24 h
 * cutoff. This runs that exact method through the harness `web` container; the
 * only thing changed is the cutoff, because a required test cannot wait a day.
 * The transition still goes through `_transition` (the sole writer, ADR-007),
 * still audits `payment.expired_by_reconciliation`, and still notifies.
 *
 * Returns the number of payments the sweep expired.
 */
export async function runReconciliationExpirySweep(): Promise<number> {
  const output = await runHarnessDjangoShell([
    'from apps.documents.payment_service import PaymentService',
    'print("EXPIRED=%d" % PaymentService().expire_stale(older_than_hours=0, batch_cap=50))',
  ]);
  const match = /EXPIRED=(\d+)/.exec(output);
  expect(match, `the reconciliation sweep should report a count (got: ${output})`).toBeTruthy();
  return Number((match as RegExpExecArray)[1]);
}

/**
 * Bring one application's enrollment confirmation deadline forward so it has
 * already passed (task 10.3, R13.9).
 *
 * The production timer this stands in for: `EnrollmentService.compute_deadline`
 * puts the deadline **14 days** out (or on the intake's
 * `enrollment_confirmation_deadline` academic-calendar event), and
 * `enrollment_confirmation_expiry_task` sweeps past it daily at 09:00 UTC. A
 * required test cannot wait a fortnight, and the field is deliberately
 * server-authored — read-only on the serializer, with **no** operator write route
 * — so there is no HTTP lever to reach a spent deadline. What is compressed here
 * is the *wait*, not the behaviour: the stored deadline is the same column the
 * platform wrote, and every gate the confirmation then runs is the platform's own
 * (`evaluate_enrollment_readiness` under the enrollment lock).
 *
 * Returns the deadline the platform now holds, as an ISO string.
 */
export async function expireEnrollmentDeadline(
  applicationId: string,
  hoursAgo = 48,
): Promise<string> {
  const output = await runHarnessDjangoShell([
    'from datetime import timedelta',
    'from django.utils import timezone',
    'from apps.applications.models import Application',
    `moment = timezone.now() - timedelta(hours=${hoursAgo})`,
    `Application.objects.filter(pk="${applicationId}").update(enrollment_confirmation_deadline=moment)`,
    `row = Application.objects.get(pk="${applicationId}")`,
    'print("DEADLINE=%s" % row.enrollment_confirmation_deadline.isoformat())',
  ]);
  const match = /DEADLINE=(\S+)/.exec(output);
  expect(
    match,
    `the harness should report the stored enrollment deadline (got: ${output})`,
  ).toBeTruthy();
  return (match as RegExpExecArray)[1];
}

/**
 * The `EmailQueue` id one message's stored delivery record points at
 * (task 10.1, R13.4).
 *
 * Read from the platform's own record, through the container, because the id is
 * deliberately **not** published: the communications history exposes a classified
 * state, an attempt count and a timestamp, and never an internal queue
 * identifier, a provider payload or the recipient's address. A journey that
 * needed this published would be asking the platform to expose exactly what
 * R13.4 removed.
 */
export async function readEmailQueueIdForNotification(notificationId: string): Promise<string> {
  const output = await runHarnessDjangoShell([
    'from apps.common.models import Notification',
    'from apps.common.notification_preferences import COMMUNICATION_METADATA_KEY',
    `row = Notification.objects.filter(pk="${notificationId}").first()`,
    'record = (row.metadata or {}).get(COMMUNICATION_METADATA_KEY) or {} if row else {}',
    'attempts = ((record.get("channels") or {}).get("email") or {}).get("attempts") or []',
    'print("EMAIL_QUEUE_ID=%s" % (attempts[-1] if attempts else ""))',
  ]);
  const match = /EMAIL_QUEUE_ID=([0-9a-fA-F-]+)/.exec(output);
  expect(
    match,
    `notification ${notificationId} should reference a queued email (got: ${output})`,
  ).toBeTruthy();
  return (match as RegExpExecArray)[1];
}

/** What one message's email delivery looks like after the attempts are spent. */
export interface ExhaustedEmailDelivery {
  /** `EmailQueue.status` — the platform's own internal vocabulary. */
  status: string;
  /** `EmailQueue.retry_count` after the last attempt. */
  attempts: number;
}

/**
 * Spend one message's email send attempts, so the platform classifies it
 * terminally `failed` (task 10.1, R13.4).
 *
 * Task 10.1's retry command is only offered on a **terminal** failure, and that
 * is deliberate: a queued or retrying message must not be re-sent, or a student
 * gets two of them. So the retry journey needs a message the platform has given
 * up on — and in this harness there is no outbound provider at all to give up on
 * *by accident*: `config.settings.harness` sets `EMAIL_HOST_USER = ""` and
 * `RESEND_API_KEY = ""` on purpose, so `_send_via_smtp` and `_send_via_resend`
 * both decline and every attempt fails the same way it would against a dead
 * provider. What the harness cannot supply is the **passage of time**:
 * `send_email_task` classifies `retrying` until `retry_count` reaches 3 and
 * re-queues itself with a 60 s → 120 s → 240 s backoff, so waiting for the
 * platform's own terminal verdict costs seven minutes.
 *
 * This runs the platform's own `send_email_task` back to back until it stops
 * classifying the row as retryable. Nothing about the failure is simulated and
 * no status is written by hand — the task's own classifier decides `retrying`
 * versus `failed`, exactly as it does in production. The only thing compressed is
 * the backoff, in the same spirit as
 * {@link runReconciliationExpirySweep}'s 24 h cutoff.
 *
 * `send_email_task` is invoked directly rather than through Celery, so
 * `self.retry()` raises `Retry` in-process (Celery's documented
 * `called_directly` behaviour) **after** the row has already been saved. The
 * exception is therefore expected and swallowed; the loop reads the row to decide
 * whether to go again.
 */
export async function exhaustEmailDeliveryAttempts(
  emailQueueId: string,
): Promise<ExhaustedEmailDelivery> {
  const output = await runHarnessDjangoShell([
    'from apps.common.models import EmailQueue',
    'from apps.common.tasks import send_email_task',
    `qid = "${emailQueueId}"`,
    // Six is a ceiling, not an expectation: the platform needs three attempts.
    'for _ in range(6):\n'
      + '    row = EmailQueue.objects.filter(pk=qid).first()\n'
      + '    if row is None or (row.status or "").lower() in ("failed", "sent"):\n'
      + '        break\n'
      + '    try:\n'
      + '        send_email_task(qid)\n'
      + '    except Exception:\n'
      + '        pass\n',
    'row = EmailQueue.objects.filter(pk=qid).first()',
    'print("EMAIL_STATE=%s:%d" % ((row.status or "") if row else "missing", (row.retry_count or 0) if row else 0))',
  ]);
  const match = /EMAIL_STATE=([a-z_]*):(\d+)/.exec(output);
  expect(
    match,
    `the email delivery state should be reported for ${emailQueueId} (got: ${output})`,
  ).toBeTruthy();
  const [, status, attempts] = match as RegExpExecArray;
  return { status, attempts: Number(attempts) };
}

/**
 * Assert required background jobs have drained: broker queue empty and no
 * payment collection left unsettled. Polls briefly to allow the worker to
 * finish in-flight tasks. Throws (failing the test) if anything remains.
 */
export async function assertRequiredJobsDrained(timeoutMs = 20_000): Promise<QueueDepth> {
  const deadline = Date.now() + timeoutMs;
  let last: QueueDepth | null = null;
  while (true) {
    last = await getQueueDepth();
    const brokerDrained = last.broker_queue_depth <= 0; // 0 = empty, -1 = redis unreachable
    const paymentsSettled = last.unsettled_payment_collections === 0;
    if (brokerDrained && paymentsSettled) return last;
    if (Date.now() > deadline) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `Undrained required jobs after ${timeoutMs}ms: ${JSON.stringify(last)} — background work ` +
      `(Celery queue / payment collections) did not settle (R18.4).`,
  );
}

/**
 * Commit an official-document generation job **without** handing it to the broker
 * (task 10.4, R13.11).
 *
 * The production failure this stands in for: the broker is unreachable when the
 * student presses the button. `POST …/official-documents/{type}/` commits the
 * durable row first and dispatches afterwards, so a dispatch failure leaves
 * exactly one state behind — a committed `pending` job with no `task_id` — and
 * `sweep_pending_official_document_jobs_task` is what later serves it.
 *
 * What is compressed is only the outage. This calls the platform's own
 * `official_document_jobs.request_generation(..., dispatch=False)` — literally the
 * same function the view calls, with the same flag the view passes, because the
 * view dispatches separately (`_enqueue_generation`) precisely so the commit and
 * the dispatch are two observable steps. Nothing is written by hand and no status
 * is faked: the row, its identity, its state and its payload are all the
 * platform's.
 *
 * A dead-broker container was the alternative and it is worse evidence: stopping
 * the worker leaves dispatch *succeeding*, which proves the wrong thing, and
 * stopping Redis takes the cache and the session store down with it.
 *
 * Returns the committed job exactly as `request_generation` returned it — read
 * from the row inside its own transaction, so `state` and `dispatched` are
 * observed at commit and cannot be raced by the beat sweep that runs every five
 * minutes in this harness.
 */
export async function commitUndispatchedOfficialDocumentJob(
  applicationId: string,
  documentType: string,
): Promise<{ state: string; attempts: number; dispatched: boolean }> {
  const output = await runHarnessDjangoShell([
    'from apps.applications import official_document_jobs as jobs',
    'from apps.applications.models import Application',
    `app = Application.objects.get(pk="${applicationId}")`,
    `job = jobs.request_generation(app, "${documentType}", dispatch=False)`,
    'print("JOB=%s:%d:%s" % (job.state, job.attempts, "task" if job.task_id else "notask"))',
  ]);
  const match = /JOB=([a-z_]+):(\d+):(task|notask)/.exec(output);
  expect(
    match,
    `the harness should report the committed job state (got: ${output})`,
  ).toBeTruthy();
  const [, state, attempts, taskFlag] = match as unknown as [string, string, string, string];
  return { state, attempts: Number(attempts), dispatched: taskFlag === 'task' };
}

/**
 * Run the platform's own official-document dispatcher sweep (task 10.4, R13.11).
 *
 * The production timer this stands in for:
 * `sweep_pending_official_document_jobs_task`, on the beat schedule. Committing
 * the row before answering 202 only makes the platform *honest* about a request;
 * this sweep is what makes the request actually get served after a broker outage,
 * which is the other half of R13.11 and the reason "queued" is a promise rather
 * than a description.
 *
 * Returns the number of committed jobs it re-dispatched.
 */
export async function sweepOfficialDocumentJobs(): Promise<number> {
  const output = await runHarnessDjangoShell([
    'from apps.applications import official_document_jobs as jobs',
    'print("SWEPT=%d" % jobs.sweep_pending_jobs())',
  ]);
  const match = /SWEPT=(\d+)/.exec(output);
  expect(
    match,
    `the official-document sweep should report a count (got: ${output})`,
  ).toBeTruthy();
  return Number((match as RegExpExecArray)[1]);
}

/**
 * The durable official-document job row, read from the platform's own table
 * (task 10.4, R13.11).
 *
 * Read through the container rather than from the published envelope on purpose:
 * the envelope is what the *client* is told, and the whole claim of R13.11 is
 * that the two agree — that a published `queued` is backed by a committed record
 * and a published `not_requested` by the absence of one. Asserting the envelope
 * against itself would prove nothing.
 *
 * Returns `null` when no job row exists — which is the assertion the
 * phantom-queue journey needs.
 */
export async function readOfficialDocumentJobRow(
  applicationId: string,
  documentType: string,
): Promise<{ status: string; retries: number; hasTaskId: boolean; channel: string } | null> {
  const output = await runHarnessDjangoShell([
    'from apps.applications import official_document_jobs as jobs',
    'from apps.common.models import OutboxEvent',
    `key = jobs.job_key("${applicationId}", "${documentType}")`,
    'row = OutboxEvent.objects.filter(idempotency_key=key).first()',
    'payload = (row.payload or {}) if row else {}',
    'print("ROW=%s" % ("none" if row is None else "%s:%d:%s:%s" % ('
      + 'row.status, row.retry_count or 0, '
      + '"task" if payload.get("task_id") else "notask", row.channel)))',
  ]);
  const match = /ROW=(\S+)/.exec(output);
  expect(match, `the harness should report the job row (got: ${output})`).toBeTruthy();
  const value = String((match as RegExpExecArray)[1]);
  if (value === 'none') return null;
  const [status, retries, taskFlag, channel] = value.split(':') as [
    string,
    string,
    string,
    string,
  ];
  return {
    status,
    retries: Number(retries),
    hasTaskId: taskFlag === 'task',
    channel,
  };
}

/**
 * Clear this client's public-tracking failed-attempt budget (task 10.5, R13.12).
 *
 * The production timer this stands in for: `PublicTrackingFailureThrottle`'s
 * window — `10/hour` per client address. A required journey cannot wait an hour,
 * and there is deliberately **no** HTTP lever to reset the budget (one would be
 * the first thing an enumerator called).
 *
 * What is compressed is the *wait*, not the behaviour: this deletes the
 * platform's own cache bucket, computed by the platform's own
 * `get_cache_key`, so the endpoint's decisions afterwards are the ones it makes
 * from an empty history. Nothing about how the budget is charged, read or
 * enforced is bypassed.
 *
 * Why a journey needs it at all: the budget is keyed on the client address, and
 * every Playwright context in this harness — every project, every
 * `freshContext()` — reaches the backend from the same address through Caddy.
 * That is not an accident of the harness, it is the property being relied on
 * (a forwarded header must not mint a fresh budget), so the only honest way to
 * start a journey with a known budget is to clear it.
 *
 * Returns the number of buckets cleared (0 when the budget was already empty).
 */
export async function clearPublicTrackingFailureBudget(): Promise<number> {
  const output = await runHarnessDjangoShell([
    'from django.core.cache import cache',
    'from apps.common.throttling import PublicTrackingFailureThrottle',
    'throttle = PublicTrackingFailureThrottle()',
    // The bucket name comes from the platform's own `cache_format` and its own
    // `make_key` (so KEY_PREFIX/version are whatever the platform uses), with the
    // client half left blank to give a prefix. The address the edge presents
    // depends on the compose network, so it is scanned for rather than guessed.
    'stem = throttle.cache_format % {"scope": throttle.scope, "ident": ""}',
    'prefix = cache.make_key(stem)',
    'client = cache._cache.get_client()',
    'cleared = 0',
    'for key in client.scan_iter(match="%s*" % prefix):',
    '    client.delete(key)',
    '    cleared += 1',
    'print("CLEARED=%d" % cleared)',
  ]);
  const match = /CLEARED=(\d+)/.exec(output);
  expect(
    match,
    `the harness should report how many tracking budgets it cleared (got: ${output})`,
  ).toBeTruthy();
  return Number((match as RegExpExecArray)[1]);
}

/**
 * Clear the rate limiter's counters, and nothing else (SJR task 4.1, design R9-a).
 *
 * Every browser context and request helper in the harness reaches Caddy from one
 * host address, which production does not, so a gate that spans several spec files
 * would otherwise spend one shared budget. This deletes django-ratelimit's `:1:rl:*`
 * keys and DRF's `:1:throttle_*` histories in the cache database, through one `sh -c`
 * inside the harness `redis` container. It never runs `FLUSHDB`: that database also
 * holds the Celery broker queues. The key format is Django's default
 * (`<KEY_PREFIX>:<VERSION>:<key>`, neither set in `base.py`).
 *
 * Prints, and returns, the number of keys deleted.
 */
export async function resetRateLimitCounters(): Promise<number> {
  const { execFileSync } = await import('node:child_process');
  const composeFile = await locateHarnessComposeFile();
  const output = execFileSync(
    'docker',
    [
      'compose',
      '-f',
      composeFile,
      'exec',
      '-T',
      'redis',
      'sh',
      '-c',
      'n=0; for pattern in ":1:rl:*" ":1:throttle_*"; do ' +
        'for key in $(redis-cli --scan --pattern "$pattern"); do ' +
        'redis-cli del "$key" >/dev/null; n=$((n + 1)); done; done; echo "DELETED=$n"',
    ],
    { encoding: 'utf-8', timeout: 60_000 },
  );
  const match = /DELETED=(\d+)/.exec(output);
  expect(match, `the rate-limit reset should report a count (got: ${output})`).toBeTruthy();
  const deleted = Number((match as RegExpExecArray)[1]);
  console.log(`[journey-gate] rate-limit counters cleared: ${deleted}`);
  return deleted;
}
