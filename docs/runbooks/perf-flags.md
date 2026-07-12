# Performance Feature Flags

Environment-variable-driven flags that gate performance optimizations.
Each defaults to `False` (off) so the legacy/safe behavior persists until
explicitly flipped in production.

| Flag | Default | Purpose | Safe to enable? |
|------|---------|---------|-----------------|
| `PERF_CACHE_CATALOG` | `False` | 450s Redis-backed cache on catalog read endpoints (programs, canonical programs, intakes, subjects, assignment-preview). Scope-aware: different tenant scopes get separate cache entries (R4.5). | Yes. Fully tested (`tests/unit/test_perf_catalog_cache.py`, 26 tests). Rollback: flip to `False` and redeploy. |
| `PERF_CACHE_DASHBOARD` | `False` | Short-lived aggregate cache on AdminDashboardView (R2). | Yes. Same pattern as catalog cache. |

## Production Status

| Flag | Production value | Since |
|------|-----------------|-------|
| `PERF_CACHE_CATALOG` | `true` | 2026-07-04 (Performance Gate closure) |
| `PERF_CACHE_DASHBOARD` | `false` | Not yet enabled |

## How to flip

```bash
ssh -i $KEY ubuntu@ec2-13-244-37-190.af-south-1.compute.amazonaws.com
cd ~/mihas
echo "PERF_CACHE_CATALOG=true" >> .env   # or false to disable
docker compose -f docker-compose.prod.yml up -d --no-deps web
# Verify:
docker compose -f docker-compose.prod.yml exec -T web env | grep PERF_CACHE
curl -s https://api.beanola.com/health/ready/
```

## Cache invalidation

The catalog cache invalidates on a 450s TTL. No manual invalidation is needed
for normal operations. If a program/intake/institution is created or modified
and the change must appear immediately, restart the web container (which clears
the in-process cache references; Redis keys expire naturally at TTL).
