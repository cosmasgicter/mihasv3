# Jobs Ops

This app is the production-grade v1 operator dashboard for the AI job hunting platform.

## What Exists

- Vite + React + TypeScript workspace app
- polished operator shell with responsive navigation and command palette
- data-driven route screens for jobs, applications, automation, outreach, email, documents, integrations, sources, reports, review, and audit
- searchable and filterable jobs inbox with loading states on major views
- typed API client contracts for the seeded backend
- shared UI helpers for progress bars and formatting

## What Does Not Exist Yet

- authentication integration
- real backend persistence for the new jobs domains
- provider-backed document generation
- browser automation flows
- fully live analytics pipelines

## Suggested Next Build Order

1. Add authentication and protected routing.
2. Replace seeded backend responses with persistent Django models.
3. Add document diffing and automation evidence drawers.
4. Wire Telegram, Zoho, OpenAI, and storage providers.
5. Add live Celery-driven discovery and automation execution.

## App Structure

```text
src/
  app/
    layout/
    providers.tsx
    router.tsx
  components/ui/
  features/
    overview/
    jobs/
    job-applications/
    automation/
    outreach/
    email/
    documents/
    integrations/
    sources/
    analytics/
    review/
    audit/
  lib/
  services/api/
  stores/
```
