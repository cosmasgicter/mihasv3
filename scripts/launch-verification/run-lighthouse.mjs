#!/usr/bin/env node
/**
 * Gate 3 — Performance_Gate Lighthouse runner (collector half).
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ DEPLOYED-TARGET collector. Operator-run / scheduled. NOT auto-run in   │
 * │ CI. Requires a live, deployed staging/production-like target and a     │
 * │ local `lighthouse` binary. Runs Node (or Bun) ESM.                     │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * What it does
 * ------------
 * Runs Lighthouse in **mobile** form factor against the five launch routes
 * (Requirement 3.1):
 *
 *     /                     (public)
 *     /auth/signup          (public)
 *     /track-application    (public)
 *     /student/dashboard    (authenticated)
 *     /admin/dashboard      (admin)
 *
 * at least `MIN_RUNS` (3) times each, and for every run:
 *   (a) invokes the `lighthouse` CLI if it is available on PATH,
 *   (b) writes the raw Lighthouse HTML + JSON artifacts per route+run under
 *       `docs/launch-evidence/03-performance/lighthouse/`,
 *   (c) extracts the per-run performance score (0–100).
 *
 * It then writes a single machine-readable **run-scores JSON** that the Python
 * side (`sample-api-timings.py`, the combiner) consumes and feeds into the pure
 * evaluator `performance_eval.evaluate_performance(...)`. This script computes
 * **no** pass/fail decision itself — that lives entirely in the pure evaluator
 * so it stays property-testable without a live browser.
 *
 * Degradation (no silent skips)
 * -----------------------------
 * Lighthouse cannot run in the build sandbox. When the `lighthouse` binary is
 * absent (or a run fails), the route's `run_scores` stays short of `MIN_RUNS`.
 * The run-scores JSON records `lighthouse_available: false` and an explicit
 * `error` per route, and the process exits non-zero. The downstream pure
 * evaluator then marks each under-run route `not-measured`, which forces the
 * Performance_Gate **not passed** (Requirement 3.7) — never a false pass.
 *
 * Auth
 * ----
 * Base URL and per-class auth cookies are supplied via CLI flags or env so no
 * secret is ever hard-coded. Authenticated/admin routes are skipped (recorded
 * as not-measured) when their cookie is absent.
 *
 *   --base-url   / LV_BASE_URL          deployed target origin (required)
 *   --runs       / LV_LH_RUNS           runs per route (default 3, min 3)
 *   --out-dir    / LV_PERF_DIR          evidence dir (default docs/launch-evidence/03-performance)
 *   --student-cookie / LV_STUDENT_COOKIE   Cookie header for /student/* routes
 *   --admin-cookie   / LV_ADMIN_COOKIE     Cookie header for /admin/* routes
 *
 * Usage
 * -----
 *   node scripts/launch-verification/run-lighthouse.mjs \
 *     --base-url https://staging.beanola.com --runs 3
 *
 * Validates: Requirements 3.1, 3.4, 3.5 (collector half of Gate 3).
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// --------------------------------------------------------------------------- //
// Constants — kept in lock-step with performance_eval.py.
// --------------------------------------------------------------------------- //

/** Minimum Lighthouse runs before a route's median is trusted (R3.1). */
export const MIN_RUNS = 3;

export const ROUTE_CLASS_PUBLIC = "public";
export const ROUTE_CLASS_AUTHENTICATED = "authenticated";
export const ROUTE_CLASS_ADMIN = "admin";

/** The five Lighthouse routes and their route class (R3.1). */
export const LIGHTHOUSE_ROUTES = [
  { route: "/", routeClass: ROUTE_CLASS_PUBLIC, slug: "root" },
  { route: "/auth/signup", routeClass: ROUTE_CLASS_PUBLIC, slug: "auth-signup" },
  { route: "/track-application", routeClass: ROUTE_CLASS_PUBLIC, slug: "track-application" },
  { route: "/student/dashboard", routeClass: ROUTE_CLASS_AUTHENTICATED, slug: "student-dashboard" },
  { route: "/admin/dashboard", routeClass: ROUTE_CLASS_ADMIN, slug: "admin-dashboard" },
];

const _THIS_FILE = fileURLToPath(import.meta.url);
// scripts/launch-verification/run-lighthouse.mjs → repo root is two dirs up.
export const REPO_ROOT = resolve(dirname(_THIS_FILE), "..", "..");

// --------------------------------------------------------------------------- //
// Pure helpers (no I/O) — directly unit-checkable.
// --------------------------------------------------------------------------- //

/**
 * Join a base origin and a route path without doubling slashes.
 * @param {string} baseUrl
 * @param {string} route
 * @returns {string}
 */
export function buildUrl(baseUrl, route) {
  const base = String(baseUrl).replace(/\/+$/, "");
  const path = String(route).startsWith("/") ? route : `/${route}`;
  return `${base}${path}`;
}

/**
 * Pick the Cookie header for a route class from the resolved auth map.
 * Public routes never need a cookie.
 * @param {string} routeClass
 * @param {{studentCookie?: string, adminCookie?: string}} auth
 * @returns {string|null}
 */
export function cookieForRouteClass(routeClass, auth) {
  if (routeClass === ROUTE_CLASS_PUBLIC) return null;
  if (routeClass === ROUTE_CLASS_AUTHENTICATED) return auth.studentCookie || null;
  if (routeClass === ROUTE_CLASS_ADMIN) return auth.adminCookie || null;
  return null;
}

/**
 * Extract the 0–100 performance score from a parsed Lighthouse JSON report.
 * Lighthouse reports the score as a 0–1 fraction under
 * `categories.performance.score`; we scale to 0–100 to match the evaluator.
 * @param {any} report
 * @returns {number|null} the score, or null when it cannot be read.
 */
export function extractPerformanceScore(report) {
  const raw = report?.categories?.performance?.score;
  if (typeof raw !== "number" || Number.isNaN(raw)) return null;
  return Math.round(raw * 100);
}

/**
 * Build the run-scores payload the Python combiner consumes.
 * @param {object} opts
 * @returns {object}
 */
export function buildRunScores({ baseUrl, runs, lighthouseAvailable, routeResults, generatedAt }) {
  return {
    schema: "launch-verification/lighthouse-run-scores@1",
    generated_at: generatedAt,
    generated_by: "deployed-target",
    base_url: baseUrl,
    runs_requested: runs,
    min_runs: MIN_RUNS,
    lighthouse_available: lighthouseAvailable,
    routes: routeResults,
  };
}

// --------------------------------------------------------------------------- //
// Lighthouse invocation (impure).
// --------------------------------------------------------------------------- //

/**
 * Resolve whether a `lighthouse` binary is available on PATH.
 * @returns {boolean}
 */
export function lighthouseAvailable() {
  const probe = spawnSync("lighthouse", ["--version"], { encoding: "utf-8" });
  return probe.status === 0;
}

/**
 * Run Lighthouse once for a route, writing raw HTML+JSON and returning the score.
 *
 * @param {object} opts
 * @param {string} opts.url            fully-qualified URL to audit
 * @param {string} opts.slug           filesystem-safe route slug
 * @param {number} opts.run            1-based run index
 * @param {string} opts.lighthouseDir  directory for raw artifacts
 * @param {string|null} opts.cookie    optional Cookie header
 * @returns {{score: number|null, htmlAsset: string|null, jsonAsset: string|null, error: string|null}}
 */
export function runLighthouseOnce({ url, slug, run, lighthouseDir, cookie }) {
  const base = `${slug}-run${run}`;
  const jsonPath = join(lighthouseDir, `${base}.report.json`);
  const htmlPath = join(lighthouseDir, `${base}.report.html`);

  const args = [
    url,
    "--quiet",
    "--only-categories=performance",
    "--form-factor=mobile",
    "--screenEmulation.mobile",
    "--chrome-flags=--headless=new --no-sandbox",
    "--output=json",
    "--output=html",
    `--output-path=${join(lighthouseDir, base)}`,
  ];
  if (cookie) {
    // Lighthouse forwards extra headers to the audited page request.
    args.push(`--extra-headers={"Cookie":${JSON.stringify(cookie)}}`);
  }

  const proc = spawnSync("lighthouse", args, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
  if (proc.status !== 0) {
    return {
      score: null,
      htmlAsset: null,
      jsonAsset: null,
      error: `lighthouse exited ${proc.status}: ${(proc.stderr || "").slice(0, 400)}`,
    };
  }

  let score = null;
  try {
    const report = JSON.parse(readFileSync(jsonPath, "utf-8"));
    score = extractPerformanceScore(report);
  } catch (err) {
    return {
      score: null,
      htmlAsset: existsSync(htmlPath) ? relAsset(htmlPath) : null,
      jsonAsset: existsSync(jsonPath) ? relAsset(jsonPath) : null,
      error: `could not parse Lighthouse JSON: ${err.message}`,
    };
  }

  return {
    score,
    htmlAsset: existsSync(htmlPath) ? relAsset(htmlPath) : null,
    jsonAsset: existsSync(jsonPath) ? relAsset(jsonPath) : null,
    error: score === null ? "performance score missing from report" : null,
  };
}

/** Render a raw-artifact path relative to the performance evidence dir. */
function relAsset(absPath) {
  const idx = absPath.indexOf("03-performance/");
  return idx >= 0 ? absPath.slice(idx + "03-performance/".length) : absPath;
}

/**
 * Run every route the requested number of times and assemble route results.
 * @param {object} opts
 * @returns {{routeResults: object[], available: boolean}}
 */
export function collectAllRoutes({ baseUrl, runs, lighthouseDir, auth }) {
  const available = lighthouseAvailable();
  const routeResults = [];

  for (const { route, routeClass, slug } of LIGHTHOUSE_ROUTES) {
    const url = buildUrl(baseUrl, route);
    const cookie = cookieForRouteClass(routeClass, auth);
    const runScores = [];
    const assets = [];
    const errors = [];

    if (routeClass !== ROUTE_CLASS_PUBLIC && !cookie) {
      errors.push(`no auth cookie supplied for ${routeClass} route; skipped`);
    } else if (!available) {
      errors.push("lighthouse binary not available on PATH; route not measured");
    } else {
      for (let run = 1; run <= runs; run += 1) {
        const result = runLighthouseOnce({ url, slug, run, lighthouseDir, cookie });
        if (result.jsonAsset) assets.push(result.jsonAsset);
        if (result.htmlAsset) assets.push(result.htmlAsset);
        if (typeof result.score === "number") {
          runScores.push(result.score);
        } else if (result.error) {
          errors.push(`run ${run}: ${result.error}`);
        }
      }
    }

    routeResults.push({
      route,
      route_class: routeClass,
      url,
      run_scores: runScores,
      raw_assets: assets,
      errors,
    });
  }

  return { routeResults, available };
}

// --------------------------------------------------------------------------- //
// CLI.
// --------------------------------------------------------------------------- //

/**
 * Parse argv + env into a resolved config. Pure aside from reading `env`.
 * @param {string[]} argv
 * @param {NodeJS.ProcessEnv} env
 * @returns {object}
 */
export function parseArgs(argv, env) {
  const opts = {
    baseUrl: env.LV_BASE_URL || env.BASE_URL || "",
    runs: Number.parseInt(env.LV_LH_RUNS || "", 10) || MIN_RUNS,
    outDir: env.LV_PERF_DIR || join(REPO_ROOT, "docs", "launch-evidence", "03-performance"),
    studentCookie: env.LV_STUDENT_COOKIE || "",
    adminCookie: env.LV_ADMIN_COOKIE || "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[(i += 1)];
    if (arg === "--base-url") opts.baseUrl = next();
    else if (arg === "--runs") opts.runs = Number.parseInt(next(), 10) || MIN_RUNS;
    else if (arg === "--out-dir") opts.outDir = next();
    else if (arg === "--student-cookie") opts.studentCookie = next();
    else if (arg === "--admin-cookie") opts.adminCookie = next();
  }
  if (opts.runs < MIN_RUNS) opts.runs = MIN_RUNS;
  return opts;
}

/**
 * Main entrypoint.
 * @param {string[]} argv  process args (without node/script).
 * @param {NodeJS.ProcessEnv} env
 * @returns {number} exit code (0 only when every route reached MIN_RUNS).
 */
export function main(argv, env) {
  const opts = parseArgs(argv, env);
  if (!opts.baseUrl) {
    process.stderr.write(
      "run-lighthouse: --base-url (or LV_BASE_URL) is required for a deployed target.\n",
    );
    return 2;
  }

  const lighthouseDir = join(opts.outDir, "lighthouse");
  mkdirSync(lighthouseDir, { recursive: true });

  const { routeResults, available } = collectAllRoutes({
    baseUrl: opts.baseUrl,
    runs: opts.runs,
    lighthouseDir,
    auth: { studentCookie: opts.studentCookie, adminCookie: opts.adminCookie },
  });

  const payload = buildRunScores({
    baseUrl: opts.baseUrl,
    runs: opts.runs,
    lighthouseAvailable: available,
    routeResults,
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  });

  const runScoresPath = join(lighthouseDir, "run-scores.json");
  writeFileSync(runScoresPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");

  const underRun = routeResults.filter((r) => r.run_scores.length < MIN_RUNS);
  process.stdout.write(`run-lighthouse: lighthouse_available=${available}\n`);
  process.stdout.write(`  base url: ${opts.baseUrl}\n`);
  process.stdout.write(`  run-scores: ${runScoresPath}\n`);
  for (const r of routeResults) {
    process.stdout.write(
      `  ${r.route} [${r.route_class}]: ${r.run_scores.length}/${opts.runs} runs` +
        (r.errors.length ? ` — ${r.errors[0]}` : "") +
        "\n",
    );
  }
  if (underRun.length) {
    process.stderr.write(
      `run-lighthouse: ${underRun.length} route(s) did not reach ${MIN_RUNS} runs; ` +
        "downstream evaluator will mark them not-measured (gate not passed).\n",
    );
    return 1;
  }
  return 0;
}

// Only run when invoked directly (so `node --check` and imports are side-effect free).
const _invokedDirectly = process.argv[1] && resolve(process.argv[1]) === _THIS_FILE;
if (_invokedDirectly) {
  process.exit(main(process.argv.slice(2), process.env));
}

// Internal helper retained for potential cleanup callers/tests.
export function _cleanupDir(dir) {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}
