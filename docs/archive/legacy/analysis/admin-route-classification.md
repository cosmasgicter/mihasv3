# Admin page classification (route config parity)

Source of truth compared:
- `src/routes/config.tsx`
- `src/pages/admin/*`

## Active (reachable from route config)
- `src/pages/admin/Applications.tsx`
- `src/pages/admin/AuditTrail.tsx`
- `src/pages/admin/Dashboard.tsx`
- `src/pages/admin/Intakes.tsx`
- `src/pages/admin/Programs.tsx`
- `src/pages/admin/Settings.tsx`
- `src/pages/admin/Users.tsx`
- `src/pages/admin/lib/applicationsOverview.ts`
- `src/pages/admin/lib/dashboardBootstrap.ts`

## Planned (intentionally staged, excluded from route exports)
- `src/pages/admin/CacheMonitor.tsx` (owned by Platform Performance team)
- `src/pages/admin/EligibilityManagement.tsx` (owned by Admissions Rules team)

## Deprecated (archived to avoid accidental reuse)
- `src/pages/admin/BatchOperations.tsx` → `docs/archive/admin/pages/BatchOperations.tsx.snapshot`
- `src/pages/admin/Monitoring.tsx` → `docs/archive/admin/pages/Monitoring.tsx.snapshot`
- `src/components/admin/BulkOperationsPanel.tsx` → `docs/archive/admin/components/BulkOperationsPanel.tsx.snapshot`
- `src/components/admin/MaintenancePanel.tsx` → `docs/archive/admin/components/MaintenancePanel.tsx.snapshot`
