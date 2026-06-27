# Multi-Tenant Operations Runbook

Status: production-readiness runbook for Beanola Admissions.
Owner: Beanola platform operations.
Related spec: `.kiro/specs/canonical-multi-tenant-alignment/`.

This runbook is the operator path for tenant onboarding, tenant domains,
official documents, draft/application support, production migration checks,
backup/restore, rollback, disk cleanup, and service health. It assumes the
canonical product admin route is `/admin/tenants`; `/beanola-admin-panel/` is
Django operational admin only.

## Hard Rules

- Production database writes are operator-gated: backup first, prove the change
  on a branch/staging database, apply in the smallest window, and capture
  evidence.
- The `.pem` key stays local at `/home/cosmas/Downloads/mihasapplication2026.pem`
  and must never be committed.
- Tenant admins are scoped operators. They never create institutions, activate
  unrelated domains, assign global canonical programs, or see another tenant's
  records.
- Super admins are Beanola platform operators. They can create tenants, assign
  canonical programs, configure domains, upload tenant assets, configure
  document profiles, and invite tenant admins.
- If observed behavior conflicts with this runbook, stop the release or
  incident action and update the spec/runbook after root cause is known.

## 1. Tenant Onboarding

Use when adding a new university, college, or training institution.

Preconditions:

- Operator is a `Super_Admin` with `platform.tenant.create`,
  `platform.tenant.update`, `platform.program_assignment.manage`,
  `platform.staff.manage`, and document-profile capabilities.
- Tenant legal/display name, code, contact email, address, phone, logo,
  signature, programs, fees, intakes, required documents, settlement metadata,
  and domain plan are available.
- Canonical program records already exist, or the super admin has approval to
  create/seed them.

Procedure:

1. Sign in as super admin.
2. Open `/admin/tenants`.
3. Start the onboarding wizard at `/admin/tenants/new`.
4. Create the institution using the tenant's legal name, display name, short
   code, and active status.
5. Upload tenant assets:
   - logo for portal and documents
   - authorized signature for official documents
   - optional seal/header/footer assets if the tenant requires them
6. Configure document profile defaults:
   - application slip
   - payment receipt
   - acceptance letter
   - conditional offer
   - future tenant-specific official templates
7. Assign canonical programs to the institution as tenant offerings.
8. Configure offering-level rules:
   - intake availability
   - fee amount and currency
   - required documents
   - eligibility notes
   - capacity limits if applicable
9. Configure settlement metadata if payment collection should route to tenant
   finance or reporting.
10. Invite tenant admins only after the tenant has at least one offering and a
    valid document profile.
11. Sign out and sign in as the tenant admin.
12. Verify tenant admin can see only "My School" and scoped tenant resources.
13. Verify tenant admin cannot:
    - open `/admin/tenants/new`
    - see another institution in tenant lists
    - create domains for another institution
    - update another institution's profiles, staff, or offerings
14. Create a test student application for a tenant offering.
15. Confirm the student experience is program-first and the backend resolves the
    tenant automatically.
16. Generate an application slip and confirm logo, signature, tenant display
    name, program, fee, document requirements, and application number are
    correct.

Acceptance evidence:

- Screenshot or JSON evidence of tenant creation.
- Asset upload records for logo and signature.
- At least one active offering.
- Tenant-admin negative checks pass.
- Student application and official slip render tenant data correctly.

Rollback:

- Disable tenant domain rows first.
- Deactivate tenant staff memberships/access grants.
- Deactivate offerings or mark institution inactive.
- Do not delete tenant rows that already have applications or payments.

## 2. Domain Setup

Use when configuring a custom tenant portal domain.

Preconditions:

- Institution exists and is active.
- Super admin has domain capability.
- DNS owner can publish CNAME and TXT records.

Procedure:

1. Open `/admin/tenants`.
2. Select the target institution.
3. Add the hostname in the Domains panel.
4. Copy the generated CNAME target and TXT verification token.
5. Ask the DNS owner to publish:
   - CNAME for the tenant hostname
   - TXT at `_beanola-verify.{hostname}`
6. Wait for DNS propagation.
7. Let `verify_institution_domain_task` run, or trigger the existing domain
   verification command/task according to deployment policy.
8. Confirm status moves from `pending_dns` to `pending_review` or `verified`.
9. Activate only after verification succeeds.
10. Visit the domain and confirm:
    - tenant context endpoint resolves the institution
    - public catalog narrows to that tenant's active offerings
    - branding comes from tenant assets
    - unknown or disabled domains fall back to neutral Beanola context

Failure handling:

- `pending_dns`: DNS record missing, wrong target, propagation delay, or typo.
- `failed`: inspect `last_error`, fix DNS, then retry verification.
- `HOSTNAME_CONFLICT`: another active institution owns the hostname; do not
  bypass. Disable the old domain or choose another hostname.
- Active domain showing wrong tenant: disable the domain immediately and inspect
  `InstitutionContextService` cache and domain rows.

Rollback:

- Deactivate the domain in the tenant console.
- Confirm `is_active=false` and `status=disabled`.
- Purge/retry domain context cache if the host still resolves incorrectly.

## 3. Official Document Troubleshooting

Use when application slips, receipts, acceptance letters, or conditional offers
are missing, wrong, unsigned, unbranded, or failing.

Canonical path:

- Frontend student/admin actions call `apps/admissions/src/services/officialDocuments.ts`.
- Backend endpoint is `/api/v1/applications/{id}/official-documents/{document_type}/`.
- Backend renderers use tenant `InstitutionDocumentProfile` and
  `InstitutionAsset` configuration.

Checklist:

1. Confirm application exists and is scoped to the expected institution.
2. Confirm the document type is allowed for the current application status.
3. Confirm the institution has an active document profile for that document
   type, or an intentional neutral fallback policy.
4. Confirm active logo/signature assets exist and storage URLs are reachable by
   the backend worker.
5. Confirm required payment exists for receipt generation.
6. Confirm Celery worker is running and not blocked by payment polling or long
   document jobs.
7. Inspect official document status endpoint for `queued`, `generating`,
   `ready`, `failed`, or stale states.
8. Inspect backend logs for renderer exceptions.
9. Regenerate only through the official backend endpoint.
10. Do not fix production official documents through frontend PDF utilities.

Common causes:

- Missing active tenant signature asset.
- Document profile copied from another tenant without tenant-specific values.
- Application has legacy institution fields but no resolved institution
  offering.
- Payment receipt requested before verified payment state.
- Celery worker down or Redis broker unavailable.
- Storage permission or signed URL failure.

Evidence:

- Application id.
- Institution id/code.
- Document type.
- Official document status payload.
- Renderer log excerpt without PII.
- Asset/profile ids used by the renderer.

## 4. Draft And Application Support

Use when a student cannot start a new application, sees the wrong draft, cannot
resume, or duplicate conflict behavior is confusing.

Canonical rules:

- `Application(status='draft')` is the online draft.
- `ApplicationDraft` is compatibility/cache metadata only.
- New and resume are explicit intents:
  - new: `/student/application-wizard?mode=new`
  - resume: `/student/application-wizard?mode=resume&draftId={application_id}`
- Local storage is recovery only and must not override explicit new/resume
  intent.

Procedure:

1. Confirm user identity and application ids without exposing other students'
   data.
2. List the student's draft applications through the canonical applications API
   or scoped admin support path.
3. Check whether the user entered new or resume mode.
4. If starting new incorrectly resumes:
   - confirm URL includes `mode=new`
   - inspect local recovery cache keys
   - confirm wizard loader did not adopt `existing_id` silently
5. If resume opens the wrong application:
   - confirm `draftId`
   - confirm the application belongs to the user
   - confirm the draft has not been submitted/deleted
6. If duplicate create conflict occurs:
   - present choices: continue existing, start different program/intake, cancel
   - never silently attach to the old draft
7. If deleting a draft fails:
   - check for payment-linked activity
   - preserve drafts with payment history

Do not:

- Delete payment-linked drafts to "clear the wizard."
- Edit another user's draft from an unscoped admin path.
- Treat `ApplicationDraft` as the source of truth for active drafts.

## 5. Production Migration Verification

Use before and after applying schema/data migrations to production.

Pre-apply:

1. Read the migration script and rollback script.
2. Confirm the script is additive or explicitly approved.
3. Run against a branch/staging database first.
4. Capture validation SQL output.
5. Take production backup with `deploy/backup-db.sh`.
6. Confirm backup is non-empty and restorable enough for rollback posture.
7. Announce maintenance window if user-facing impact is possible.

Apply:

1. SSH to production using the approved key.
2. Pull the exact commit being deployed.
3. Apply migrations through the documented deploy command or management command.
4. Do not run ad-hoc destructive SQL.
5. Capture apply start/end timestamps.

Post-apply:

1. Run tenant invariant validation SQL.
2. Confirm Django migration table or SQL migration marker table records the new
   migration.
3. Run smoke checks:
   - `/health/ready/`
   - `/api/v1/catalog/context/`
   - `/admin/tenants`
   - `/admin/tenants/new` as super admin
   - tenant admin "My School"
   - student new/resume wizard
   - official document generation
4. Record rollback posture and open risks.

Rollback:

- Prefer deploy rollback for application-code issues.
- For schema issues, use the prepared rollback script only if it is proven safe
  for current production data.
- Restore from backup only when rollback scripts cannot safely recover.

## 6. Backup/Restore Drill

Use monthly and before high-risk production migrations.

Procedure:

1. Run `deploy/backup-db.sh`.
2. Confirm the dump file exists, is non-empty, and has the expected timestamp.
3. Restore into a disposable Postgres target, never over production.
4. Run sanity SQL:
   - table count
   - institution count
   - application count
   - payment count
   - latest migration marker
5. Run a minimal backend smoke test against the restored database if practical.
6. Record:
   - backup start/end
   - restore start/end
   - RTO
   - RPO estimate
   - operator
   - dump location
   - validation result

Failure handling:

- Backup command fails: stop migrations/deploys that depend on backup posture.
- Dump is empty: treat as no backup.
- Restore fails: open P0 operational issue before any schema release.

## 7. Deploy Rollback

Use when a deployment causes failed health checks, major feature breakage, or
unacceptable regressions.

Procedure:

1. Confirm whether issue is code-only, migration-related, env-related, or
   infrastructure-related.
2. If code-only:
   - redeploy the previous known-good image/commit
   - keep database unchanged
3. If env-related:
   - restore previous env values
   - restart only affected services
4. If migration-related:
   - stop new writes if data corruption risk exists
   - apply prepared rollback script only if safe
   - otherwise restore from backup into a recovery path
5. Run post-rollback smoke:
   - health ready
   - login
   - student dashboard
   - admin dashboard
   - tenant console
   - payment callback path
   - official document path
6. Record incident timeline and root cause.

Do not:

- Roll back code blindly if the new code already wrote data requiring new
  schema.
- Run `git reset --hard` on production as the rollback mechanism.
- Delete Docker volumes during rollback unless the incident is explicitly about
  disposable cache/broker data.

## 8. Disk Cleanup And Docker Prune

Use when disk is high, deploy fails with no space left, or before large image
deploys on the single EC2 host.

Check:

```bash
df -h
docker system df
docker image ls
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
```

Safe cleanup:

```bash
docker image prune -af
docker builder prune -af
docker container prune -f
```

Guardrails:

- Do not prune volumes unless the target volume is confirmed disposable.
- Do not delete Postgres, Redis, Caddy, or uploaded-media volumes.
- Keep at least the currently running image available until the replacement is
  healthy.

After cleanup:

1. Re-run `df -h`.
2. Re-run deployment.
3. Confirm old container remains running if pull/build fails.
4. Record disk before/after.

## 9. Celery, Redis, And Postgres Health

Use during slow dashboards, stuck documents, payment polling delays, login
failures, or degraded readiness.

Postgres checks:

```bash
docker compose -f deploy/docker-compose.prod.yml exec db pg_isready
docker compose -f deploy/docker-compose.prod.yml exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select now();"
```

Investigate:

- connection count near `max_connections`
- long-running queries
- missing migrations
- table/index bloat after large writes
- dashboard/catalog query pressure

Redis checks:

```bash
docker compose -f deploy/docker-compose.prod.yml exec redis redis-cli ping
docker compose -f deploy/docker-compose.prod.yml exec redis redis-cli info memory
```

Investigate:

- memory near limit
- broker queue depth
- eviction policy
- cache key isolation by tenant/scope

Celery checks:

```bash
docker compose -f deploy/docker-compose.prod.yml logs --tail=200 worker
docker compose -f deploy/docker-compose.prod.yml exec worker celery -A config inspect ping
docker compose -f deploy/docker-compose.prod.yml exec worker celery -A config inspect active
```

Investigate:

- stuck payment polling calls
- document generation exceptions
- retry storms
- worker concurrency relative to memory headroom
- periodic tasks not running

Escalation:

- If Postgres is down, treat as platform incident.
- If Redis is down but Postgres is healthy, follow Redis incident response and
  expect cache/broker degradation.
- If Celery is down, student/admin web may stay up, but documents, polling,
  emails, and background verification are degraded.

