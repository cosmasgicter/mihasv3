# MIHAS Improvement Plan — Complete Fix List

**Created:** 2026-04-18
**Status:** ✅ ALL FIXES COMPLETE

---

## Execution Batches

### Batch 1: Backend Security & Robustness (8 fixes)
| # | Issue | File(s) | Fix |
|---|---|---|---|
| 1.1 | Password strength validation | `accounts/serializers.py`, `admin_views.py` | Add uppercase, number, special char, common password checks |
| 1.2 | Celery task time limits | `common/tasks.py`, `documents/tasks.py` | Add `soft_time_limit`/`time_limit` to ALL tasks |
| 1.3 | CSV export row limit | `applications/views.py` | Cap at 10,000 rows, add rate limit scope |
| 1.4 | File upload size limit | `documents/views.py` | Add 10MB max file size validation |
| 1.5 | CSRF token query fix | `accounts/views.py` LogoutView | Use `user_id=request.user.id` instead of `user=request.user` |
| 1.6 | Admin settings validation | `admin_views.py` | Whitelist setting keys, validate JSON schema |
| 1.7 | Payment service null checks | `documents/payment_service.py` | Validate program existence before payment creation |
| 1.8 | Missing DB indexes | SQL migration script | Add composite indexes for hot query paths |

### Batch 2: Backend API Contract & Queries (6 fixes)
| # | Issue | File(s) | Fix |
|---|---|---|---|
| 2.1 | Jobs-ops envelope violations | `jobs/views.py`, `outreach/views.py`, `automation/views.py` | Wrap all list responses in `{success, data}` envelope |
| 2.2 | Application N+1 queries | `applications/views.py` | Add `select_related` for payment_verified_by, reviewed_by; add `prefetch_related('payment_set')` |
| 2.3 | Inconsistent envelope in grades/review | `applications/views.py` | Wrap grades, review, create responses in envelope |
| 2.4 | Unpaginated list endpoints | `applications/views.py`, `notification_views.py` | Add pagination to interviews, sessions, notifications |
| 2.5 | Payment polling alerting | `documents/tasks.py` | Add error alerting when Lenco API fails repeatedly |
| 2.6 | Audit log actor_email filter | Already done ✅ | — |

### Batch 3: Frontend Forms & Validation (5 fixes)
| # | Issue | File(s) | Fix |
|---|---|---|---|
| 3.1 | Programs.tsx Zod validation | `pages/admin/Programs.tsx` | Replace manual validation with Zod + React Hook Form |
| 3.2 | Users.tsx Zod validation | `pages/admin/Users.tsx` | Replace manual validation with Zod + React Hook Form |
| 3.3 | IntakeFormFields typed as `any` | `pages/admin/Intakes.tsx` | Use proper RHF types |
| 3.4 | PaymentStep error recovery | `PaymentStep.tsx` | Add retry mechanism, offline detection, persistent error state |
| 3.5 | Admin Applications empty state | `pages/admin/Applications.tsx` | Add "No applications match" message |

### Batch 4: Frontend Performance & Bundle (4 fixes)
| # | Issue | File(s) | Fix |
|---|---|---|---|
| 4.1 | LandingPage eager import | `App.tsx` | Lazy-load LandingPage |
| 4.2 | Dead `getInvalidationPatterns` | `services/client.ts` | Remove 30+ lines of dead code |
| 4.3 | `as any` error cast in client.ts | `services/client.ts` | Use typed error class |
| 4.4 | Hardcoded dashboard trends | `pages/admin/Dashboard.tsx` | Compute from actual data or remove |

### Batch 5: Type Safety (4 fixes)
| # | Issue | File(s) | Fix |
|---|---|---|---|
| 5.1 | `useMultiDraft.ts` any types | `useMultiDraft.ts` | Type draft_data properly |
| 5.2 | `applicationSession.ts` any types | `applicationSession.ts` | Type uploaded_files, selected_subjects |
| 5.3 | `catch (err: any)` pattern | 15+ files | Change to `catch (err: unknown)` |
| 5.4 | Frontend service type assertions | `interviews.ts`, `audit.ts` | Replace `as` casts with type guards |

### Batch 6: Documentation & Polish (4 fixes)
| # | Issue | File(s) | Fix |
|---|---|---|---|
| 6.1 | OpenAPI untyped OBJECT schemas | `documents/views.py` | Add proper request/response serializers |
| 6.2 | Environment variable docs | `.env.example` | Document all env vars |
| 6.3 | ResponsiveTable aria-label | `ResponsiveTable.tsx` | Add row action descriptions |
| 6.4 | Update audit report | `docs/reports/` | Mark all issues resolved |

---

## Already Fixed (from previous sessions)
- ✅ Ghost .pyc files, SSE remnants, duplicate Celery tasks
- ✅ Application number format, console.error monkey-patch
- ✅ ~90 dead files deleted
- ✅ api-cache.ts, cacheMonitor.ts removed
- ✅ MarketingRoutes consolidated
- ✅ Admin form fields (programs, institutions, intakes)
- ✅ Audit log actor_email filter
- ✅ Steering docs updated

## Not Fixing (already adequate)
- Error boundaries: Already 4 layers deep (app → shell → route-guard → lazy-load)
- Jobs-ops API client: Scaffold code, not production-critical yet
- Notification push/browser: Feature request, not a bug
- "Remember me": 7-day refresh tokens are adequate
