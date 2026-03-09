# Spring Boot Migration Guide for MIHAS

## Bottom line

Spring Boot is a strong choice if your end goal is a more traditional enterprise backend with stricter layering, better support for long-running jobs, and easier scaling into larger teams.

For this repository specifically, it is the heaviest rewrite of the three options. Your React frontend can mostly stay, your Neon Postgres database can stay, and your R2/Resend integrations can stay, but almost all backend code in `api-src/` and `lib/` would be rewritten in Java.

## What you have today

Current backend shape in this repo:

- Vercel serverless functions in `api-src/`
- Shared backend utilities in `lib/`
- React SPA frontend in `src/`
- Neon Postgres via plain SQL in `lib/db.ts`
- Custom JWT auth, cookie handling, CSRF, sessions, RBAC, audit logging
- File storage via R2 in `lib/storage.ts`
- Resend email integration
- OCR/document workflows, receipts, notifications, SSE-style realtime polling, admin dashboards

Current backend domains you would need to port:

- `auth`
- `admin`
- `applications`
- `catalog`
- `documents`
- `email`
- `notifications`
- `payments`
- `sessions`
- `health`
- `bootstrap`

## What can stay vs what must change

### Can stay

- `src/` frontend, at least initially
- Neon Postgres schema and most SQL migrations
- R2 bucket and object naming strategy
- Resend account
- VAPID keys and push-notification concept
- Business rules and validation logic as product requirements

### Must change

- All Vercel function handlers in `api-src/`
- All auth/cookie/session middleware in `lib/auth/*`
- CSRF and request validation middleware
- Deployment model from Vercel-function-oriented to container/app-oriented
- Local dev workflow and CI pipeline
- Monitoring/logging stack

### Likely to change shape

- SSE/polling implementation
- file upload path and signed URL flow
- queue processing for email/OCR
- env management and secret injection
- background tasks and scheduled cleanup jobs

## Best migration style

The safest Spring Boot migration is not a full frontend rewrite. Do this instead:

1. Keep the existing React frontend.
2. Build a new Spring Boot API under a separate directory or repo.
3. Keep Neon Postgres and port table access first.
4. Cut traffic endpoint-by-endpoint instead of a big-bang rewrite.
5. Move heavy operations like OCR, email queue processing, and cleanup into background jobs early.

## Suggested Spring Boot architecture

Recommended stack:

- Java 21
- Spring Boot 3.x
- Spring Web / Spring MVC
- Spring Security
- Spring Data JDBC or JPA/Hibernate
- Flyway or Liquibase for migrations
- PostgreSQL driver
- Bucket4j or Spring rate limiting strategy
- Spring Validation / Bean Validation
- springdoc-openapi
- Testcontainers for integration tests
- Spring Boot Actuator
- Optional later: Spring Batch, Quartz, Kafka/RabbitMQ

Suggested module split:

- `com.mihas.auth`
- `com.mihas.users`
- `com.mihas.applications`
- `com.mihas.catalog`
- `com.mihas.documents`
- `com.mihas.notifications`
- `com.mihas.payments`
- `com.mihas.sessions`
- `com.mihas.audit`
- `com.mihas.common`

## How repo features would map to Spring Boot

| Current repo area | Spring Boot equivalent |
|---|---|
| `api-src/*.ts` handlers | `@RestController` classes |
| `lib/auth/*` | Spring Security filters, token service, cookie config |
| `lib/validation/*` | DTOs + `jakarta.validation` + custom validators |
| `lib/db.ts` queries | repositories / JDBC templates / JPA |
| `lib/auditLogger.ts` | audit service + append-only audit table |
| `lib/storage.ts` | S3-compatible storage service bean |
| `lib/csrf.ts` | Spring Security CSRF or custom double-submit cookie flow |
| `lib/realtimeBroker.ts` | SSE endpoint, WebSocket, or message broker |
| Vercel cron/function behavior | scheduled jobs, workers, queues |

## What you need to learn

### Core Java and Spring

- modern Java basics: records, streams, optionals, exceptions, generics
- Maven or Gradle
- dependency injection in Spring
- controllers, services, repositories
- configuration with `application.yml`
- Spring profiles for dev/staging/prod
- Spring Security filter chain
- validation annotations and exception handling
- Actuator health endpoints

### Data and infra

- Flyway or Liquibase migration workflow
- JPA tradeoffs vs plain SQL/JdbcTemplate
- connection pooling and transaction boundaries
- Docker basics
- container hosting basics
- structured logging and tracing

### Testing

- JUnit 5
- MockMvc / WebTestClient
- Testcontainers with Postgres
- contract tests against your current frontend behavior

## Step-by-step migration path

### Phase 1: Freeze and inventory

1. Inventory every endpoint in `api-src/` and every action query parameter.
2. Freeze response shapes used by the frontend.
3. Export current env vars and integration requirements from `.env.example`.
4. Decide whether to keep current table names exactly or normalize them later.
5. Add OpenAPI-style documentation for current endpoints before rewriting them.

### Phase 2: Bootstrap the Spring app

1. Generate a Spring Boot 3 project with Java 21.
2. Add PostgreSQL, validation, security, actuator, and OpenAPI dependencies.
3. Configure local profiles and Neon connection settings.
4. Add Flyway and import the current SQL schema as baseline migrations.
5. Add a `/health` endpoint that matches the current frontend expectations.

### Phase 3: Port foundation pieces first

1. Implement common API envelope matching `{ success, data }`.
2. Implement global exception handling.
3. Implement JWT creation/verification and cookie strategy.
4. Implement RBAC/permission model.
5. Implement CSRF protection for state-changing endpoints.
6. Implement audit logging and request correlation IDs.

### Phase 4: Port low-risk domains

1. Port `health`.
2. Port `catalog`.
3. Port `sessions` list/revoke endpoints.
4. Port notification preference reads.
5. Port admin read-only dashboard endpoints.

### Phase 5: Port critical workflows

1. Port login/logout/session/refresh/profile.
2. Port application create/update/review/status flows.
3. Port document upload/download/signed-url logic.
4. Port payments and receipt generation.
5. Port notifications send/list/mark-read flows.

### Phase 6: Background work

1. Move email queue processing out of request/response handlers.
2. Move OCR into queued jobs.
3. Add scheduled cleanup for expired sessions/tokens/idempotency keys.
4. Add retry policies and dead-letter handling.

### Phase 7: Cutover

1. Point the React app to the Spring API in development.
2. Run contract tests against both old and new APIs.
3. Shadow traffic for read endpoints if possible.
4. Cut non-critical endpoints first.
5. Cut auth and application submission last.
6. Keep rollback path for at least one admissions cycle.

## Hosting for free or near-free in March 2026

### Vercel

Not the right target for Spring Boot.

Reason: Vercel's official runtimes include Node.js, Bun, Python, Rust, Go, Ruby, and Wasm, but not Java. That means Spring Boot does not have first-class Vercel runtime support. That is an inference from Vercel's runtime list, not a direct Vercel sentence saying "Java is unsupported".

### Best practical options

#### Koyeb

Best free-ish fit if you want something closest to "push and deploy".

- Koyeb's Starter plan is `$0/mo` plus usage after the free tier.
- It includes `1x Web Service, 1x Postgres, 5x custom domains` and supports scale-to-zero.
- Koyeb documents Spring Boot deployment directly.
- Caveat: after you exceed the free tier, billing starts.

#### Google Cloud Run

Best if you want a more durable production platform and do not mind more ops.

- Cloud Run has an official Spring Boot quickstart.
- Cloud Run pricing includes an always-free tier for request-based services in `us-central1`: first `180,000 vCPU-seconds`, `360,000 GiB-seconds`, and `2 million requests` per month.
- Caveat: you still need a GCP project, CLI flow, image builds, and must watch related costs like databases, storage, and registry usage.

### My recommendation for Spring hosting

- Cheapest/easiest to start: Koyeb
- Best long-term ops story: Cloud Run
- Closest to your current Vercel experience: neither is as simple as Vercel for Java

## Advantages of Spring Boot

- strongest enterprise ecosystem of the three
- excellent support for complex domain modeling
- mature security, validation, observability, and testing story
- great for long-running processes, scheduled jobs, and integration-heavy systems
- easy path into message queues, batch jobs, workflow engines, and microservices later
- good team scaling if multiple developers join

## Disadvantages of Spring Boot

- biggest rewrite from your current TypeScript codebase
- steeper learning curve than Django or NestJS
- slower initial development speed if you are new to Java
- more boilerplate and architecture decisions
- free hosting is less frictionless than Vercel-style JS apps
- slower feedback loop locally than your current Bun/Vite workflow

## Pitfalls specific to this repo

- overusing JPA and losing the clarity of your current SQL behavior
- changing response shapes and breaking the React frontend
- underestimating auth migration complexity
- not designing a clean file-upload strategy before porting documents
- trying to replicate Vercel serverless behavior too literally instead of embracing jobs/workers
- forgetting that OCR and PDF generation can become slow synchronous requests
- not preserving audit log semantics and idempotency behavior
- mapping role/permission overrides too simplistically

## New functionality Spring Boot could enable

Compared with the current implementation, Spring Boot makes these additions especially natural:

- robust background job pipeline for OCR, email, and report generation
- scheduled admissions batches and nightly reconciliation jobs
- richer workflow engine for approvals, appeals, and interview routing
- event-driven integrations with SMS gateways, payment gateways, or ERP systems
- bulk export/import pipelines with better retry and audit control
- stronger API versioning and partner integrations
- fine-grained admin policy engine
- better large-report generation and archival workflows
- possible split into admin API, student API, and worker services later

## Rough effort estimate

If you are learning Spring while migrating:

- proof of concept: 2 to 3 weeks
- parity backend for core flows: 8 to 14 weeks
- production-hardening and cutover: 2 to 5 additional weeks

If you already know Java/Spring well, reduce that significantly.

## Recommendation

Choose Spring Boot if your main goal is:

- enterprise-grade backend depth
- long-term larger-team maintainability in Java
- sophisticated jobs/workflows/integrations

Do not choose Spring Boot first if your main goal is:

- fastest path away from the current architecture
- maximum code reuse from this repo
- staying close to a Vercel-style deployment experience

## Sources

- Vercel runtimes: https://vercel.com/docs/functions/runtimes
- Vercel Functions limits: https://vercel.com/docs/functions/limitations
- Koyeb pricing: https://www.koyeb.com/pricing
- Koyeb quick start: https://www.koyeb.com/docs/deploy
- Spring Boot on Koyeb: https://www.koyeb.com/deploy/spring-boot
- Cloud Run pricing: https://cloud.google.com/run/pricing
- Cloud Run Spring Boot quickstart: https://cloud.google.com/run/docs/quickstarts/build-and-deploy/deploy-java-service
