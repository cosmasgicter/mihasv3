# Django Migration Guide for MIHAS

## Bottom line

Django is a strong choice if you want faster backend delivery than Spring Boot, a built-in admin, a mature ORM, and a large ecosystem for forms, auth, and operational dashboards.

For this repository, Django is easier than Spring Boot but still a real rewrite. The frontend can stay. The database can stay. Most backend code still gets rewritten from TypeScript to Python.

## What you have today

Current repo shape relevant to a Django migration:

- React SPA in `src/`
- Vercel function backend in `api-src/`
- shared TypeScript backend logic in `lib/`
- Neon Postgres database and SQL migrations
- R2 object storage
- Resend email
- custom JWT + cookie auth
- CSRF protection, sessions, RBAC, audit logs, notifications, payments, OCR, receipts, admin dashboards

## Best migration style

The safest Django migration is:

1. Keep the React frontend.
2. Build Django as an API backend first.
3. Use Django REST Framework instead of mixing server-rendered pages into the migration.
4. Reuse Neon Postgres and existing tables where practical.
5. Introduce Celery or a task queue early for OCR, email, and scheduled jobs.

If you try to migrate both backend and frontend conventions at once, scope will explode.

## Suggested Django architecture

Recommended stack:

- Python 3.12+
- Django 5.x
- Django REST Framework
- `psycopg` / Postgres
- `django-cors-headers`
- `django-environ` or equivalent env management
- Celery + Redis or another queue if you need background tasks
- drf-spectacular for OpenAPI
- pytest + pytest-django
- S3-compatible storage backend for R2

Suggested apps:

- `accounts`
- `applications`
- `catalog`
- `documents`
- `notifications`
- `payments`
- `sessions`
- `audit`
- `core`

## How current repo features map to Django

| Current repo area | Django equivalent |
|---|---|
| `api-src/*.ts` | DRF viewsets / APIViews |
| `lib/auth/*` | custom auth backend, JWT package, middleware |
| `lib/validation/*` | DRF serializers + model validators |
| `lib/db.ts` | Django ORM or selective raw SQL |
| admin dashboards | Django admin plus custom DRF endpoints |
| `lib/storage.ts` | S3-compatible storage backend for R2 |
| `lib/csrf.ts` | Django CSRF system or API-safe custom flow |
| `lib/realtimeBroker.ts` | Django Channels, polling, or task/event store |

## What Django is especially good at for MIHAS

- admin-heavy systems
- CRUD-heavy operations on catalog, users, and settings
- rapid back-office tooling
- forms and validation
- moderate-size teams that want fast shipping more than maximum architectural ceremony

## What you need to learn

### Python and Django basics

- Python packaging and virtual environments
- Django project/app structure
- models, migrations, views, serializers, admin
- Django settings and env separation
- middleware and authentication
- DRF permissions and throttling
- ORM querying and optimization
- static/media handling

### Deeper topics you will actually need here

- custom user/session/auth flows
- DRF serializers for backward-compatible JSON contracts
- Django admin customization
- Celery or another background task system
- S3-compatible file storage for R2
- handling CSRF safely with SPA clients
- optional WebSocket support with Channels if you want true realtime later

## What can stay vs what must change

### Can stay

- React frontend
- Neon Postgres
- R2 bucket
- Resend account
- most business rules at a requirements level
- PWA frontend behavior

### Must change

- all function handlers in `api-src/`
- all backend TypeScript utilities in `lib/`
- auth/session/cookie implementation details
- validation and request parsing
- deployment pipeline
- queue and long-running task model

## Step-by-step migration path

### Phase 1: Compatibility planning

1. Catalog all current endpoints and `action` query parameters.
2. Freeze response contracts used by the React app.
3. Decide whether to keep the existing database schema or let Django own a new schema.
4. Decide whether auth stays custom JWT or moves to a standard Django/JWT package.
5. Decide whether admin users live in Django admin only or still consume the same SPA.

### Phase 2: Bootstrap Django API

1. Create a Django project and DRF setup.
2. Configure Postgres against Neon.
3. Add CORS, allowed hosts, CSRF trusted origins, and environment handling.
4. Add health endpoint and error envelope compatible with the current frontend.
5. Add OpenAPI docs.

### Phase 3: Port foundations

1. Implement user/profile model strategy.
2. Implement JWT cookie/session flow.
3. Implement permission model mirroring roles from the current app.
4. Implement audit logging.
5. Implement a consistent response envelope and exception handling.

### Phase 4: Port easy wins

1. Port `catalog`.
2. Port notification preferences and list endpoints.
3. Port health checks.
4. Port read-only admin metrics.
5. Port session management.

### Phase 5: Port critical student/admin flows

1. Port login/logout/register/session/profile/password reset.
2. Port applications CRUD and review workflows.
3. Port file uploads and signed URL behavior.
4. Port payments and receipts.
5. Port notification send/mark-read/delete flows.

### Phase 6: Background processing

1. Move email queue processing into Celery tasks or equivalent.
2. Move OCR extraction into tasks.
3. Add scheduled cleanup jobs for tokens, sessions, login attempts, and idempotency records.
4. Add retries and dead-letter patterns for failures.

### Phase 7: Cutover and stabilization

1. Point the React app to the Django API in staging.
2. Run contract tests between old and new APIs.
3. Cut read-only endpoints first.
4. Cut auth and application submission only after full parity testing.
5. Keep rollback path for one full intake cycle.

## Hosting for free or near-free in March 2026

### Vercel

Django on Vercel is now possible, but there are caveats.

What the official docs say:

- Vercel's Python runtime is in beta on all plans.
- It can run Python frameworks including Django.
- Django requires some configuration, unlike FastAPI/Flask which need less.
- Python functions have a `500 MB` maximum uncompressed bundle limit.
- Vercel Functions still have duration limits, so long-running OCR/report work should not stay synchronous.

My read for this repo:

- viable for simple Django APIs and moderate admin features
- less ideal for heavy OCR, long-running processing, or increasingly stateful realtime behavior
- good if you want to stay operationally close to your current Vercel workflow

### Koyeb

Probably the cleanest full-app home for Django if you want a simple platform.

- Koyeb has a `$0/mo` Starter plan with a free tier and scale-to-zero.
- Koyeb has official Django deployment docs.
- Better fit than Vercel if you want a more normal long-running Django service.
- Caveat: paid usage begins after the free tier.

### PythonAnywhere

Useful for learning and prototypes, not my first choice for this app.

- PythonAnywhere offers a limited free account.
- The free account gives one web app and restricted outbound internet access.
- That restriction matters because this app depends on Neon, R2, Resend, and other external services.

### My recommendation for Django hosting

- easiest full Django host to start: Koyeb
- closest to your current Vercel workflow: Vercel Python runtime
- best learning/prototype host: PythonAnywhere

## Advantages of Django

- fastest path to a productive admin back office
- very mature and batteries-included ecosystem
- great ORM and forms system
- Django admin could replace part of your custom admin tooling quickly
- easier than Spring Boot for one developer learning while building
- Python ecosystem is strong for OCR, document processing, and automation

## Disadvantages of Django

- still a full backend rewrite from TypeScript to Python
- less code reuse than a TypeScript backend option
- Django ORM abstraction can hide SQL costs if used carelessly
- realtime patterns are less natural than in dedicated Node frameworks unless you add Channels or external infrastructure
- if you stay on Vercel, serverless limits still shape architecture

## Pitfalls specific to this repo

- trying to force everything through Django ORM when some current SQL is better kept as raw SQL
- assuming Django admin can replace the full custom admin portal without UX gaps
- underestimating SPA auth + CSRF edge cases
- not isolating OCR/email/report generation into background work early
- keeping the current `action` query-parameter API shape longer than necessary without a deprecation plan
- accidentally breaking signed-file URL assumptions used by the frontend
- ignoring performance impacts of N+1 queries in dashboards and tables

## New functionality Django could enable

Compared with the current implementation, Django makes these especially attractive:

- instant back-office CRUD through Django admin
- richer internal content tools for admissions staff
- easier bulk edits, moderation screens, and operational dashboards
- faster workflow prototypes for admissions rules and appeals
- easier document-review work queues
- CMS-like pages for public admission notices, FAQs, deadlines, and announcements
- tighter integration with Python ML/OCR tooling if you later add fraud checks or intelligent document classification

## Rough effort estimate

If you are learning Django while migrating:

- proof of concept: 1 to 2 weeks
- parity backend for core flows: 6 to 12 weeks
- production-hardening and cutover: 2 to 4 additional weeks

## Recommendation

Choose Django if your main goal is:

- fastest path to a solid Python backend
- strong built-in admin and operational tooling
- easy extension into Python-heavy data or OCR work

Do not choose Django first if your main goal is:

- highest code reuse from the current repo
- strongest fit with Vercel's TypeScript/serverless model
- minimizing backend rewrite risk

## Sources

- Vercel Python runtime: https://vercel.com/docs/functions/runtimes/python
- Vercel runtimes: https://vercel.com/docs/functions/runtimes
- Vercel Functions limits: https://vercel.com/docs/functions/limitations
- Koyeb pricing: https://www.koyeb.com/pricing
- Koyeb Django deployment: https://www.koyeb.com/docs/deploy/django
- PythonAnywhere pricing: https://www.pythonanywhere.com/pricing/
