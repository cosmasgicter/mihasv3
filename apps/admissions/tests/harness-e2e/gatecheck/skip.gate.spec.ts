/**
 * GATECHECK (must FAIL): proves a required test cannot silently skip (GOV-04).
 *
 * The strict harness `test` overrides test.skip/test.fixme to throw, so any
 * attempt to skip is converted into a hard failure. The harness smoke asserts
 * this whole project FAILS — if it passed, the no-skip gate would be broken.
 */
import { test } from '../harness-fixtures';

test('gatecheck: calling test.skip converts to a failure', async () => {
  // In the strict harness projects this THROWS instead of skipping.
  test.skip(true, 'gatecheck — required tests may not skip');
  throw new Error('unreachable: test.skip should have thrown already');
});
