# MIHAS Backend Migration Decision Matrix

## Scope

This matrix compares the three migration targets already documented for this repository:

- Spring Boot
- Django
- NestJS

Assumptions behind the scoring:

- keep the current React frontend in `src/`
- keep Neon Postgres, R2, and Resend
- prefer a phased backend migration over a big-bang rewrite
- prefer low-cost or free-ish hosting where practical
- primary decision maker is one developer learning while migrating

Scoring scale:

- `1` = poor fit
- `2` = weak fit
- `3` = acceptable
- `4` = strong fit
- `5` = best fit

## Weighted Criteria

| Criterion | Weight | Why it matters here |
|---|---:|---|
| Code reuse / conceptual reuse | 25 | This repo is already TypeScript-heavy and domain-rich. |
| Delivery speed | 20 | The backend has many domains and endpoints. |
| Hosting fit | 20 | You asked for something close to the current Vercel experience. |
| Learning curve | 15 | Migration speed depends heavily on what you must learn while building. |
| Long-term maintainability | 10 | The new backend should still scale past a prototype. |
| Ops burden | 10 | More infrastructure means more risk and cost. |

## Decision Matrix

| Option | Code reuse 25 | Delivery speed 20 | Hosting fit 20 | Learning curve 15 | Maintainability 10 | Ops burden 10 | Weighted total / 500 | Normalized / 100 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| NestJS | 5 | 5 | 5 | 4 | 4 | 4 | 465 | 93 |
| Django | 2 | 4 | 3 | 3 | 4 | 3 | 305 | 61 |
| Spring Boot | 1 | 2 | 2 | 2 | 5 | 3 | 215 | 43 |

## Score Rationale

### NestJS

- `Code reuse / conceptual reuse: 5`
  The current backend is already TypeScript, modular, validation-heavy, and Vercel-oriented.
- `Delivery speed: 5`
  You can preserve more request/response contracts and migrate endpoint-by-endpoint with less language switching.
- `Hosting fit: 5`
  NestJS has official Vercel support and is the closest to your existing deployment model.
- `Learning curve: 4`
  You still need Nest concepts, but not a new language ecosystem.
- `Maintainability: 4`
  Strong structure without the weight of Spring.
- `Ops burden: 4`
  Can start on Vercel with relatively small operational change, then move to Koyeb later if needed.

### Django

- `Code reuse / conceptual reuse: 2`
  Product rules can transfer, but backend code does not.
- `Delivery speed: 4`
  Django is productive once set up, especially for admin-heavy systems.
- `Hosting fit: 3`
  It can run on Vercel's Python runtime, but Koyeb is the cleaner full-service fit.
- `Learning curve: 3`
  Easier than Spring Boot, but still a language and framework switch.
- `Maintainability: 4`
  Strong, mature backend platform with excellent admin tooling.
- `Ops burden: 3`
  Reasonable, but background tasks and SPA-safe auth/CSRF need care.

### Spring Boot

- `Code reuse / conceptual reuse: 1`
  This is the largest departure from the current codebase.
- `Delivery speed: 2`
  The backend is substantial enough that a Java rewrite is slow unless you already know Spring well.
- `Hosting fit: 2`
  Not a first-class Vercel target; better on Koyeb or Cloud Run.
- `Learning curve: 2`
  New language, new framework, and a more infrastructure-heavy model.
- `Maintainability: 5`
  Excellent long-term option for a larger, integration-heavy backend.
- `Ops burden: 3`
  Better than raw infrastructure, but still more operationally involved than a Vercel-friendly TypeScript backend.

## Direct Comparison By Decision Goal

### If your top priority is fastest safe migration

Winner: `NestJS`

Reason:

- least rewrite pain
- easiest contract preservation
- strongest overlap with existing code and tooling

### If your top priority is admin tooling and Python ecosystem

Winner: `Django`

Reason:

- Django admin is immediately useful
- Python is strong for OCR and automation
- faster than Spring for one developer

### If your top priority is enterprise backend depth over migration speed

Winner: `Spring Boot`

Reason:

- strongest enterprise platform
- best long-term story for very large workflows and integrations
- worst short-term fit for this repo

## Hosting Comparison

| Option | Best free-ish host | Closest to current Vercel workflow | Main warning |
|---|---|---|---|
| NestJS | Vercel or Koyeb | Vercel | single-function model can become awkward if the app grows heavy |
| Django | Koyeb | Vercel Python runtime | Python runtime is beta and long-running work should move out of request handlers |
| Spring Boot | Koyeb or Cloud Run | none | least Vercel-like experience of the three |

## Cost / Effort Summary

| Option | Migration effort | Learning cost | Hosting cost risk | Overall cost-to-value |
|---|---|---|---|---|
| NestJS | Low to medium | Low | Low to medium | Best |
| Django | Medium | Medium | Low to medium | Good if you want Python/admin benefits |
| Spring Boot | High | High | Medium | Worth it only if Java is the strategic choice |

## Recommendation

Recommended default choice for MIHAS: `NestJS`

Recommended only if you specifically want Python and admin leverage: `Django`

Recommended only if you specifically want Java as a strategic platform: `Spring Boot`

## What I would do next

1. Freeze the current API contract from `api-src/` before any migration.
2. Keep the React frontend unchanged in phase 1.
3. Prototype the winner in a separate backend directory or repo.
4. Port `health`, `catalog`, and read-only endpoints first.
5. Leave auth, applications, documents, and payments for the second wave.

## Source Notes

The hosting fit portions of this matrix are based on the official docs already used in the migration guides:

- Vercel runtimes: https://vercel.com/docs/functions/runtimes
- Vercel Python runtime: https://vercel.com/docs/functions/runtimes/python
- Vercel NestJS docs: https://vercel.com/docs/frameworks/backend/nestjs
- Vercel Functions limits: https://vercel.com/docs/functions/limitations
- Koyeb pricing: https://www.koyeb.com/pricing
- Cloud Run pricing: https://cloud.google.com/run/pricing
- PythonAnywhere pricing: https://www.pythonanywhere.com/pricing/
