/**
 * GATECHECK (must FAIL): proves the undrained-required-jobs gate fires.
 *
 * The test initiates a payment collection the deterministic adapter will keep
 * "pending" (a phone that requires polls) and never polls it to completion,
 * leaving an unsettled collection. The drain assertion then throws. The harness
 * smoke asserts this project FAILS.
 */
import { test } from '../harness-fixtures';
import { assertRequiredJobsDrained, initiateAdapterCollection, resetAdapter } from '../helpers/ops';

test.afterAll(async () => {
  // Never leave the shared adapter observer dirty for other runs.
  await resetAdapter();
});

test('gatecheck: an undrained background job fails the run', async () => {
  const reference = `GATECHECK-UNSETTLED-${Date.now()}`;
  // '9999' in the phone -> the adapter marks it pending (needs polls); we never
  // poll it, so it stays unsettled.
  await initiateAdapterCollection({ reference, phone: '+2609999 99999' });
  // Short timeout: the collection will never settle, so this MUST throw.
  await assertRequiredJobsDrained(3000);
});
