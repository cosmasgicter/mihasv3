import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Start every run from an empty findings directory (screenshots and findings.jsonl). */
export default function globalSetup(): void {
  const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'test-results', 'rendered-gate');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
}
