# NestJS Migration Guide for MIHAS

## Bottom line

If the question is "what is better than Spring Boot and Django for this exact codebase?", my answer is NestJS.

Not because NestJS is universally better. It is a better fit for this repo.

Why:

- your backend is already TypeScript
- your frontend is already TypeScript
- your validation logic, service boundaries, and mental model already look Node-oriented
- your current hosting is Vercel
- the smallest possible rewrite is a TypeScript backend rewrite, not a Java or Python rewrite

This is the option I would recommend first.

## What you have today

Current repo shape:

- React + Vite frontend in `src/`
- Vercel function backend in `api-src/`
- shared backend utilities in `lib/`
- Neon Postgres with SQL migrations in `migrations/`
- R2 object storage
- Resend email
- custom JWT auth, sessions, CSRF, RBAC, audit logs
- documents, OCR, notifications, payments, receipts, public tracking, admin/student portals

## Why NestJS fits this repo best

### You can preserve more of your current thinking

Your current code already uses:

- TypeScript everywhere
- explicit service/helper modules
- API boundaries per domain
- validation-centric request handling
- serverless-friendly deployment assumptions

NestJS maps naturally to that.

### You can migrate incrementally

You can:

1. keep the frontend as-is
2. build a NestJS API
3. reuse a lot of TypeScript domain logic conceptually
4. preserve response contracts more easily
5. keep more existing test knowledge

### It aligns with current hosting better

Vercel now has official NestJS support with zero configuration. A NestJS app on Vercel becomes a single Vercel Function and uses Fluid compute by default.

That does not remove all serverless constraints, but it is much closer to your current world than Spring Boot or Django.

## Suggested NestJS architecture

Recommended stack:

- Node.js 20+
- NestJS 11+
- TypeScript
- PostgreSQL with Prisma, Drizzle, Kysely, or plain SQL
- Zod or class-validator for DTO validation
- Passport/JWT only if it truly helps; otherwise keep auth simpler
- Swagger/OpenAPI
- BullMQ + Redis for queues if needed
- Jest + Supertest
- OpenTelemetry later if needed

My preference for this repo:

- NestJS
- plain SQL or a thin query layer, or Drizzle/Kysely
- keep your current SQL literacy instead of burying everything in a heavy ORM

Suggested modules:

- `auth`
- `users`
- `applications`
- `catalog`
- `documents`
- `notifications`
- `payments`
- `sessions`
- `audit`
- `health`
- `common`

## How current repo features map to NestJS

| Current repo area | NestJS equivalent |
|---|---|
| `api-src/*.ts` | controllers + modules |
| `lib/auth/*` | guards, strategies, auth services |
| `lib/validation/*` | DTOs, pipes, Zod/class-validator |
| `lib/db.ts` | repository/provider layer |
| `lib/storage.ts` | injectable storage service |
| `lib/auditLogger.ts` | audit interceptor/service |
| `lib/csrf.ts` | middleware/guard/interceptor pattern |
| `lib/realtimeBroker.ts` | SSE controller, WebSocket gateway, or queue/event bus |

## What can stay vs what must change

### Can stay

- React frontend
- Neon Postgres
- most SQL migrations
- R2
- Resend
- VAPID/web-push model
- much of your backend contract and business logic design
- many current frontend service calls with small adjustments only

### Must change

- Vercel function layout in `api-src/`
- shared server utilities in `lib/` need to become Nest providers/middleware/guards
- local dev entrypoint and deployment pipeline
- any code tightly coupled to Vercel's request objects

### Can often be adapted instead of re-invented

- validation schemas
- API envelopes
- auth cookie rules
- error-handling conventions
- audit semantics
- background-job concepts

## What you need to learn

- Nest modules/controllers/providers
- dependency injection in Nest
- guards, interceptors, filters, pipes
- DTO validation strategy
- app bootstrap and config modules
- OpenAPI generation
- queueing with BullMQ if needed
- how to keep the architecture thin instead of overengineering it

If you already know TypeScript well, the learning curve is much smaller than Spring Boot or Django.

## Step-by-step migration path

### Phase 1: Preserve the contract

1. Inventory all endpoints in `api-src/` and freeze response shapes.
2. List every env var from `.env.example`.
3. Keep the React app untouched initially.
4. Decide whether to preserve query-parameter actions during migration or convert to RESTful routes with a compatibility layer.

### Phase 2: Bootstrap NestJS

1. Create a NestJS app in a new `backend/` directory or separate repo.
2. Add config, health, auth, and database modules.
3. Configure Neon Postgres access.
4. Implement the current `{ success, data }` response envelope.
5. Add global exception filters and request logging.

### Phase 3: Port the platform layer

1. Implement auth cookie handling.
2. Implement JWT access/refresh flow.
3. Implement RBAC/permission checks.
4. Implement CSRF protection.
5. Implement audit logging.
6. Implement R2 storage and Resend adapters.

### Phase 4: Port easy domains first

1. Port `health`.
2. Port `catalog`.
3. Port `sessions` list/revoke/poll.
4. Port notification preference reads.
5. Port public tracking read-only endpoint.

### Phase 5: Port critical workflows

1. Port login/logout/register/session/refresh/profile/password reset.
2. Port applications CRUD and review actions.
3. Port document uploads/downloads/signed URLs.
4. Port payments and receipt generation.
5. Port admin endpoints.
6. Port notifications send/list/mark-read/delete.

### Phase 6: Improve architecture instead of just cloning it

1. Split slow work into queues.
2. Move OCR and email processing into workers.
3. Normalize idempotency and audit handling across all write endpoints.
4. Replace some `action=` endpoints with clearer routes while preserving backward compatibility temporarily.

### Phase 7: Cutover

1. Point the frontend to NestJS in staging.
2. Run contract and regression tests.
3. Cut low-risk routes first.
4. Cut auth and application submission last.
5. Remove old Vercel function handlers only after production confidence is high.

## Hosting for free or near-free in March 2026

### Vercel

This is the strongest hosting match of the three options.

Official Vercel docs say:

- NestJS has official Vercel support.
- deployment can be zero-config
- a NestJS app becomes a single Vercel Function
- it uses Fluid compute by default
- all Vercel Function limits still apply
- bundle size limit is `250 MB`

What that means for MIHAS:

- great if you keep the backend reasonably lean
- great for API-first traffic patterns
- still not ideal for heavyweight OCR inside request/response cycles
- better if OCR, email processing, and report jobs move to queues or external workers

### Koyeb

Best alternative if you outgrow the single-function Vercel model.

- Koyeb has a free-ish Starter plan with `1x Web Service, 1x Postgres, 5x custom domains` and scale-to-zero.
- Koyeb has official NestJS deployment docs.
- easier than Vercel if you want a normal long-running service or workers later

### Cloud Run

Good if you want container-based production later.

- not as frictionless as Vercel for this stack
- but strong if you later split API and workers cleanly

### My recommendation for Nest hosting

- start on Vercel if you want the least operational change
- move to Koyeb if function-size or workload shape becomes awkward
- move to Cloud Run only if you want more ops control and container-native scaling

## Advantages of NestJS

- smallest conceptual jump from current repo
- most code and knowledge reuse at the TypeScript level
- easiest incremental migration path
- strong structure without Spring-level heaviness
- official Vercel support now exists
- clean path to queues, WebSockets, SSE, OpenAPI, and modular APIs
- easier to share types/contracts between frontend and backend

## Disadvantages of NestJS

- still requires a backend rewrite, just less severe
- can become over-abstracted if you copy enterprise patterns blindly
- single-function deployment on Vercel can become awkward if the app grows heavy
- some Nest ecosystems encourage decorators and magic more than necessary
- if you eventually want very heavy batch/enterprise integration, Spring may still win long-term

## Pitfalls specific to this repo

- keeping too much Vercel-function-era shape and never cleaning up the API design
- trying to stuff OCR, document parsing, and email processing into synchronous controllers
- choosing a heavy ORM and recreating hidden complexity
- not extracting shared domain logic carefully from `lib/`
- letting the Nest app balloon until the single-function deployment becomes painful
- migrating auth without preserving current cookie/refresh/session behavior

## New functionality NestJS could enable

Compared with what you have now, NestJS would make these especially practical:

- shared TypeScript contracts between frontend and backend
- cleaner modular API with Swagger/OpenAPI out of the box
- WebSocket gateways for richer realtime admin dashboards
- queue-based OCR, email, and document verification pipelines
- domain events for notifications and audit trails
- clearer internal API boundaries for student/admin/public traffic
- gradual move toward workers or microservices only if actually needed
- better test isolation around modules and guards

## Rough effort estimate

If you already know TypeScript and are new to Nest:

- proof of concept: a few days to 1 week
- parity backend for core flows: 4 to 8 weeks
- production-hardening and cutover: 1 to 3 additional weeks

This is the shortest serious path among the three.

## Recommendation

Choose NestJS if your main goal is:

- best fit for this repo
- least disruptive migration
- staying close to Vercel and TypeScript
- improving architecture without switching language ecosystems

This is the option I would pick first unless you have a strong non-technical reason to prefer Java or Python.

## Sources

- Vercel NestJS docs: https://vercel.com/docs/frameworks/backend/nestjs
- Vercel runtimes: https://vercel.com/docs/functions/runtimes
- Vercel Functions limits: https://vercel.com/docs/functions/limitations
- Vercel timeout guidance: https://vercel.com/kb/guide/what-can-i-do-about-vercel-serverless-functions-timing-out
- Koyeb pricing: https://www.koyeb.com/pricing
- Koyeb NestJS deployment: https://www.koyeb.com/docs/deploy/nestjs
