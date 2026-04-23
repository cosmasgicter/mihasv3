# Backend Migration Decision Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Choose one backend target for MIHAS and execute the migration with controlled risk, preserved frontend compatibility, and a reversible production cutover.

**Architecture:** Keep the existing React frontend first, replace only the backend, and preserve the current database where possible. Use contract preservation, phased endpoint migration, and background-job extraction to reduce cutover risk.

**Tech Stack:** Current stack is React/Vite + Vercel Functions + Neon Postgres + R2 + Resend. Candidate targets are Spring Boot, Django, and NestJS.

---

### Task 1: Choose the target architecture

**Files:**
- Review: `docs/migration/2026-03-09-spring-boot-migration-guide.md`
- Review: `docs/migration/2026-03-09-django-migration-guide.md`
- Review: `docs/migration/2026-03-09-nestjs-migration-guide.md`
- Create: `docs/decision/backend-target.md`

**Step 1: Write the decision criteria**

Include:
- learning curve
- code reuse
- hosting fit
- delivery speed
- long-term maintainability
- ops burden

**Step 2: Score each option**

Use a 1-5 score per criterion and write one paragraph for why the winner won.

**Step 3: Record non-goals**

State what you are not migrating in phase 1, for example:
- frontend rewrite
- database redesign
- microservices split

**Step 4: Commit**

```bash
git add docs/decision/backend-target.md
git commit -m "docs: choose backend migration target"
```

### Task 2: Freeze the API contract

**Files:**
- Review: `api-src/*.ts`
- Create: `docs/api/current-contract.md`
- Test: `tests/integration/contract/*`

**Step 1: Enumerate endpoints and actions**

List every path and `action` currently supported.

**Step 2: Capture response envelopes**

Document expected success and error shapes.

**Step 3: Add regression tests for critical endpoints**

Focus on:
- auth
- applications
- documents
- payments
- notifications
- sessions

**Step 4: Commit**

```bash
git add docs/api/current-contract.md tests/integration/contract
git commit -m "test: freeze backend contract before migration"
```

### Task 3: Bootstrap the new backend

**Files:**
- Create: target-backend project files
- Create: `docs/migration/backend-bootstrap.md`
- Test: target-backend health tests

**Step 1: Create a minimal app**

Must include:
- environment loading
- database connection
- health endpoint
- standard JSON envelope

**Step 2: Verify it runs locally**

Run the backend and confirm `/health` returns success.

**Step 3: Add CI checks**

Include build, lint, and test commands.

**Step 4: Commit**

```bash
git add .
git commit -m "chore: bootstrap new backend"
```

### Task 4: Port platform services before business flows

**Files:**
- Modify: target auth/config/common modules
- Test: auth/session/security tests

**Step 1: Implement auth**

Port:
- JWT
- refresh flow
- cookies
- role checks
- CSRF strategy

**Step 2: Implement audit and logging**

Ensure writes remain traceable.

**Step 3: Implement storage and email adapters**

Port R2 and Resend integrations.

**Step 4: Commit**

```bash
git add .
git commit -m "feat: port platform services"
```

### Task 5: Port low-risk domains first

**Files:**
- Modify: target health/catalog/session read modules
- Test: domain integration tests

**Step 1: Port health and catalog**

**Step 2: Port read-only session and notification preference endpoints**

**Step 3: Run frontend smoke tests against the new backend**

**Step 4: Commit**

```bash
git add .
git commit -m "feat: port low-risk domains"
```

### Task 6: Port critical workflows

**Files:**
- Modify: auth/applications/documents/payments/admin/notifications modules
- Test: end-to-end flow tests

**Step 1: Port authentication flows**

**Step 2: Port application submission and review**

**Step 3: Port documents and payments**

**Step 4: Port admin and notification flows**

**Step 5: Commit**

```bash
git add .
git commit -m "feat: port critical workflows"
```

### Task 7: Extract background jobs and cut over safely

**Files:**
- Modify: queue/worker config
- Modify: deployment config
- Create: `docs/runbooks/cutover.md`

**Step 1: Move OCR, email processing, and cleanup into jobs**

**Step 2: Deploy staging and run parity tests**

**Step 3: Cut traffic gradually**

**Step 4: Document rollback**

**Step 5: Commit**

```bash
git add .
git commit -m "docs: add cutover runbook and worker migration"
```
