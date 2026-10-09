/**
 * Brand drift guard — admissions frontend (R10).
 *
 * Scans `apps/admissions/src` plus `apps/admissions/index.html` for the legacy
 * brand strings MIHAS / KATC / Mukuba / Kalulushi and legacy MIHAS domains and
 * fails — reporting the offending file and line — for any hit in a file that is
 * not present in the shared `docs/legacy-brand-allowlist.json` Brand_Allowlist
 * (R10.1, R10.3). Allowlisted files are permitted to contain those strings
 * (R10.4).
 *
 * This is the frontend half of the guard. The backend half lives at
 * `backend/tests/unit/test_brand_drift_guard.py` and reads the *same* allowlist
 * file, so the allowlist is the single source of truth.
 *
 * Together the two halves realise Property 28: the scan over
 * `apps/admissions/src`, `index.html`, `backend/apps` and `backend/config`
 * minus the Brand_Allowlist must be empty.
 *
 * Feature: beanola-production-readiness, Property 28: No non-allowlisted legacy brand string in active source
 *
 * Validates: Requirements 2.1, 7.12, 16.1 (and R10.1, R10.2, R10.3, R10.4)
 */
import { readdirSync, readFileSync, existsSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const ALLOWLIST_PATH = path.join(
  REPO_ROOT,
  "docs",
  "legacy-brand-allowlist.json",
);
const SRC_DIR = path.join(REPO_ROOT, "apps", "admissions", "src");
const INDEX_HTML = path.join(REPO_ROOT, "apps", "admissions", "index.html");

// Legacy brand strings that must not reappear in non-allowlisted production
// source. Kept in sync with docs/legacy-brand-allowlist.json -> "patterns".
const BRAND_PATTERNS = [
  "MIHAS",
  "KATC",
  "Mukuba",
  "Kalulushi",
  "apply.mihas.edu.zm",
  "mihas.edu.zm",
  "mihas.beanola.com",
  "mihas.local",
  "mihas:",
  "mihas_",
  "mihas-",
] as const;

const SCANNED_EXTENSIONS = /\.(ts|tsx|js|jsx|css|html|md|json)$/;

/**
 * One allowlist entry, in exactly ONE of two populations — admissions-v2 task
 * 12.5 pass 2 (finding GATE-13.6-01), set under the user's authorization on
 * behalf of this register's owning spec (`legacyExceptionPolicy` in the JSON):
 *
 * - a **Legacy_Exception** carries `owner` + `removeBy`, and `removeBy` is task
 *   12.2's announced window. TypeScript cannot read
 *   `backend/apps/common/compatibility_register.py`, so the backend half
 *   (`test_brand_drift_guard.py::test_legacy_exceptions_carry_the_announced_window`)
 *   pins every literal to it; this half evaluates the window.
 * - an entry **permanent by design** carries `owner` + `reviewBucket` (task
 *   12.5's vocabulary) + `permanentBecause`, and no removal date — a date would
 *   assert a removal nobody intends.
 */
interface AllowlistEntry {
  path: string;
  reason: string;
  owner: string;
  removeBy?: string;
  reviewBucket?: string;
  permanentBecause?: string;
}

/**
 * Task 12.5's buckets a permanent entry may take. `dev-preview` is deliberately
 * absent: the client preview surface is itself dated (documentFlowDriftGuard's
 * PREVIEW_ALLOWLIST), so a preview fixture is a Legacy_Exception, not permanent.
 */
const PERMANENT_BUCKETS = new Set(["canonical", "test-fixture", "immutable-evidence", "comment"]);

function loadAllowlist(): { patterns: string[]; paths: Set<string> } {
  const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf-8")) as {
    patterns?: string[];
    allowlist?: AllowlistEntry[];
  };
  return {
    patterns: raw.patterns ?? [],
    paths: new Set((raw.allowlist ?? []).map((e) => e.path)),
  };
}

function collectFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(entryPath);
    if (!entry.isFile() || !SCANNED_EXTENSIONS.test(entry.name)) return [];
    return [entryPath];
  });
}

function relativePath(absPath: string): string {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join("/");
}

function scanForViolations(allowlistPaths: Set<string>): string[] {
  const files = collectFiles(SRC_DIR);
  if (existsSync(INDEX_HTML)) files.push(INDEX_HTML);

  const violations: string[] = [];
  for (const absPath of files.sort()) {
    const rel = relativePath(absPath);
    if (allowlistPaths.has(rel)) continue;

    const lines = readFileSync(absPath, "utf-8").split("\n");
    lines.forEach((line, idx) => {
      if (BRAND_PATTERNS.some((pat) => line.includes(pat))) {
        violations.push(`${rel}:${idx + 1}: ${line.trim().slice(0, 160)}`);
      }
    });
  }
  return violations;
}

describe("Brand drift guard (R10)", () => {
  it("the shared Brand_Allowlist exists and is well-formed", () => {
    expect(
      existsSync(ALLOWLIST_PATH),
      `Brand_Allowlist not found at ${ALLOWLIST_PATH}`,
    ).toBe(true);
    const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf-8"));
    expect(Array.isArray(raw.allowlist)).toBe(true);
    for (const entry of raw.allowlist) {
      expect(
        entry.path,
        `allowlist entry missing 'path': ${JSON.stringify(entry)}`,
      ).toBeTruthy();
      expect(
        entry.reason,
        `allowlist entry missing 'reason': ${JSON.stringify(entry)}`,
      ).toBeTruthy();
    }
    // Owner and removal date are evaluated per population by the next test — a
    // blanket date check here would expire entries that are permanent by design.
    // The allowlist's declared patterns must match what this guard enforces,
    // so the backend and frontend guards stay in lockstep.
    expect(raw.patterns).toEqual([...BRAND_PATTERNS]);
  });

  it("every entry is a dated Legacy_Exception or permanent by design, and the window is evaluated", () => {
    // Added by admissions-v2 task 12.5 pass 2 (GATE-13.6-01). It replaces the
    // blanket `removeBy > Date.now()` check M11 Q12 flagged, which put a time
    // bomb on entries whose own reason says "Cannot be removed". The mechanism is
    // task 13.6 item L10's (L9-L11 README §4.4): owner present, ISO date, and a
    // window that fails ON PURPOSE once it closes, naming the two legitimate
    // answers.
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    const today = new Date().toISOString().slice(0, 10);
    const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf-8")) as { allowlist: AllowlistEntry[] };
    const problems: string[] = [];
    const windows = new Set<string>();

    for (const entry of raw.allowlist) {
      const isException = entry.removeBy !== undefined;
      const isPermanent = entry.reviewBucket !== undefined || entry.permanentBecause !== undefined;
      if (isException === isPermanent) {
        problems.push(
          `${entry.path} — must be EITHER a Legacy_Exception (owner + removeBy) OR permanent ` +
            `by design (owner + reviewBucket + permanentBecause); it is ${isException ? "both" : "neither"}`,
        );
        continue;
      }
      if (!entry.owner?.trim()) problems.push(`${entry.path} — no owner`);
      if (isPermanent) {
        if (!PERMANENT_BUCKETS.has(entry.reviewBucket ?? "")) {
          problems.push(`${entry.path} — reviewBucket '${entry.reviewBucket}' is not one of ${[...PERMANENT_BUCKETS].join(", ")}`);
        }
        if (!entry.permanentBecause?.trim()) problems.push(`${entry.path} — permanentBecause is empty`);
        continue;
      }
      if (!ISO_DATE.test(entry.removeBy ?? "")) {
        problems.push(`${entry.path} — removeBy '${entry.removeBy}' is not an ISO date`);
        continue;
      }
      windows.add(entry.removeBy as string);
      if ((entry.removeBy as string) < today) {
        problems.push(
          `${entry.path} — its announced window closed on ${entry.removeBy} (today ${today}). ` +
            "Remove the brand strings and the entry, or announce a new window in " +
            "backend/apps/common/compatibility_register.py on purpose and move removeBy with it.",
        );
      }
    }
    // One decision, one window: the backend half pins the value to the register.
    if (windows.size > 1) {
      problems.push(`dated entries announce ${windows.size} different windows: ${[...windows].sort().join(", ")}`);
    }

    expect(
      problems,
      "Brand_Allowlist populations (docs/legacy-brand-allowlist.json legacyExceptionPolicy, " +
        "task 12.5 clause):\n  " +
        problems.join("\n  "),
    ).toEqual([]);
  });

  it("no non-allowlisted brand strings under apps/admissions/src or index.html", () => {
    const { paths } = loadAllowlist();
    const violations = scanForViolations(paths);
    expect(
      violations,
      "Legacy brand strings/domains found in " +
        "non-allowlisted frontend source. Either remove the brand fallback (R9) or, if this is " +
        "legitimate tenant/preview/historical data, add the file to docs/legacy-brand-allowlist.json " +
        "with a reason (R10.2).\nOffending hits:\n  " +
        violations.join("\n  "),
    ).toEqual([]);
  });

  it("frontend allowlist entries still contain a brand string (keeps the list small, R10.2)", () => {
    const { paths } = loadAllowlist();
    const stale: string[] = [];
    for (const rel of [...paths].sort()) {
      if (!rel.startsWith("apps/admissions/")) continue; // backend entries checked by the Python guard
      const absPath = path.join(REPO_ROOT, rel);
      if (!existsSync(absPath)) {
        stale.push(`${rel} (file missing)`);
        continue;
      }
      const content = readFileSync(absPath, "utf-8");
      if (!BRAND_PATTERNS.some((pat) => content.includes(pat))) {
        stale.push(`${rel} (no brand string present)`);
      }
    }
    expect(
      stale,
      "Stale Brand_Allowlist entries — remove these from docs/legacy-brand-allowlist.json:\n  " +
        stale.join("\n  "),
    ).toEqual([]);
  });
});
