# API Migration Plan - Phased Approach

## Migration Philosophy

**Defend First, Migrate Second**: Each direct database call must justify itself. Valid reasons to keep direct calls:
1. **Realtime subscriptions** - No API alternative for live updates
2. **Authentication flow** - Initial auth check before API token exists
3. **Performance critical** - Sub-100ms response required
4. **Offline-first** - PWA functionality requires local access

## Phase 1: Authentication & Authorization (CRITICAL)

### 1.1 Profile Loading - KEEP DIRECT ✅
**File**: `src/hooks/auth/useProfileQuery.ts`
**Calls**: 3 direct queries to `profiles`
**Verdict**: **KEEP DIRECT**
**Reason**: Chicken-and-egg problem - need profile to get auth token for API calls
**Action**: None - this is the ONE valid exception

### 1.2 Role Checking - MIGRATE TO API ⚠️
**File**: `src/hooks/auth/useRoleQuery.ts`
**Calls**: Direct queries to `user_roles`
**Verdict**: **MIGRATE**
**Reason**: Roles checked AFTER auth, can use API
**API Needed**: `GET /api/auth/roles`
**Priority**: HIGH

### 1.3 Role Sync - MIGRATE TO API ⚠️
**File**: `src/lib/auth/roleSync.ts`
**Calls**: Direct queries to `user_roles`, `profiles`
**Verdict**: **MIGRATE**
**Reason**: Background sync can use API
**API Needed**: `POST /api/auth/sync-roles`
**Priority**: HIGH

## Phase 2: Admin Pages (HIGH PRIORITY)

### 2.1 Settings Page - MIGRATE TO API ⚠️
**File**: `src/pages/admin/Settings.tsx`
**Calls**: 8 direct queries to `system_settings`
**Verdict**: **MIGRATE**
**Reason**: No performance requirement, admin-only
**API Needed**: 
- `GET /api/admin/settings`
- `PUT /api/admin/settings/:key`
**Priority**: HIGH

### 2.2 User Management - MIGRATE TO API ⚠️
**File**: `src/hooks/useUserManagement.ts`
**Calls**: 4 direct queries to `profiles`
**Verdict**: **MIGRATE**
**Reason**: Already has API endpoint `/api/admin/users`
**Action**: Replace direct calls with API client
**Priority**: HIGH

### 2.3 Role Management - MIGRATE TO API ⚠️
**File**: `src/pages/admin/RoleManagement.tsx`
**Calls**: 3 direct queries to `profiles`, `user_roles`
**Verdict**: **MIGRATE**
**Reason**: Security-critical, needs audit trail
**API Needed**: 
- `GET /api/admin/roles`
- `PUT /api/admin/roles/:userId`
**Priority**: CRITICAL

### 2.4 Eligibility Management - MIGRATE TO API ⚠️
**File**: `src/pages/admin/EligibilityManagement.tsx`
**Calls**: 5 direct queries to `eligibility_rules`
**Verdict**: **MIGRATE**
**Reason**: Business rules should be server-side
**API Needed**: 
- `GET /api/admin/eligibility-rules`
- `POST /api/admin/eligibility-rules`
- `PUT /api/admin/eligibility-rules/:id`
**Priority**: HIGH

### 2.5 Applications Page - KEEP DIRECT ✅
**File**: `src/pages/admin/Applications.tsx`
**Calls**: 1 query to `admin_application_detailed` view
**Verdict**: **KEEP DIRECT**
**Reason**: Complex view with 10+ joins, API would add latency
**Condition**: Add RLS policy audit
**Priority**: N/A

### 2.6 Programs Page - MIGRATE TO API ⚠️
**File**: `src/pages/admin/Programs.tsx`
**Calls**: 1 query to `institutions`
**Verdict**: **MIGRATE**
**Reason**: Simple lookup, should use catalog API
**API Needed**: `GET /api/catalog/institutions`
**Priority**: MEDIUM

### 2.7 AI Insights - KEEP DIRECT ✅
**File**: `src/pages/admin/AIInsights.tsx`
**Calls**: 4 queries to `prediction_results`
**Verdict**: **KEEP DIRECT**
**Reason**: Analytics queries with complex aggregations
**Condition**: Move to dedicated analytics service later
**Priority**: N/A

## Phase 3: Notifications (MEDIUM PRIORITY)

### 3.1 Student Notifications - HYBRID APPROACH 🔄
**File**: `src/hooks/useStudentNotifications.ts`
**Calls**: 4 direct queries + realtime subscription
**Verdict**: **HYBRID**
**Reason**: 
- Initial load: MIGRATE to API
- Realtime updates: KEEP DIRECT (no alternative)
**API Needed**: `GET /api/notifications`
**Action**: Use API for initial load, direct for realtime
**Priority**: MEDIUM

### 3.2 Multi-Channel Notifications - KEEP DIRECT ✅
**File**: `src/lib/multiChannelNotifications.ts`
**Calls**: Realtime subscriptions
**Verdict**: **KEEP DIRECT**
**Reason**: Realtime-only, no initial query
**Priority**: N/A

## Phase 4: Analytics & Reporting (LOW PRIORITY)

### 4.1 Analytics Library - KEEP DIRECT ✅
**File**: `src/lib/analytics.ts`
**Calls**: 22 queries across 6 analytics tables
**Verdict**: **KEEP DIRECT**
**Reason**: 
- Complex aggregations (SUM, AVG, GROUP BY)
- Performance-critical (dashboard loads)
- Read-only operations
**Condition**: Add query caching layer
**Future**: Move to dedicated analytics service
**Priority**: N/A

### 4.2 Admin Realtime Metrics - KEEP DIRECT ✅
**File**: `src/hooks/admin/useAdminRealtimeMetrics.ts`
**Calls**: Realtime subscriptions
**Verdict**: **KEEP DIRECT**
**Reason**: Realtime dashboard updates
**Priority**: N/A

## Phase 5: Business Logic (MEDIUM PRIORITY)

### 5.1 Eligibility Engine - KEEP DIRECT ✅
**File**: `src/lib/eligibilityEngine.ts`
**Calls**: 8 queries to eligibility tables
**Verdict**: **KEEP DIRECT**
**Reason**: 
- Performance-critical (sub-second response)
- Complex business logic
- Already has RLS policies
**Condition**: Add comprehensive tests
**Priority**: N/A

### 5.2 Workflow Automation - KEEP DIRECT ✅
**File**: `src/lib/workflowAutomation.ts`
**Calls**: 8 queries + realtime triggers
**Verdict**: **KEEP DIRECT**
**Reason**: Background automation, realtime triggers
**Priority**: N/A

## Phase 6: Storage & Utilities (LOW PRIORITY)

### 6.1 Storage Library - KEEP DIRECT ✅
**File**: `src/lib/storage.ts`
**Calls**: 9 storage operations
**Verdict**: **KEEP DIRECT**
**Reason**: Supabase Storage API (not database)
**Priority**: N/A

### 6.2 Application Drafts - KEEP DIRECT ✅
**File**: Auto-save functionality
**Calls**: Queries to `application_drafts`
**Verdict**: **KEEP DIRECT**
**Reason**: 
- Offline-first PWA requirement
- 8-second auto-save (performance critical)
**Priority**: N/A

## Phase 7: Components (CASE-BY-CASE)

### 7.1 Eligibility Dashboard - KEEP DIRECT ✅
**File**: `src/components/application/EligibilityDashboard.tsx`
**Calls**: 4 queries
**Verdict**: **KEEP DIRECT**
**Reason**: Real-time eligibility display
**Priority**: N/A

### 7.2 AI Assistant - KEEP DIRECT ✅
**File**: `src/components/application/AIAssistant.tsx`
**Calls**: 3 queries to `ai_conversations`
**Verdict**: **KEEP DIRECT**
**Reason**: Chat requires low latency
**Priority**: N/A

## Migration Summary

### MIGRATE TO API (9 items)
1. ⚠️ Role checking hook
2. ⚠️ Role sync library
3. ⚠️ Settings page
4. ⚠️ User management hook
5. ⚠️ Role management page
6. ⚠️ Eligibility management page
7. ⚠️ Programs page (institutions)
8. ⚠️ Notifications (initial load only)
9. ⚠️ Applications data hook (partial)

### KEEP DIRECT (15 items)
1. ✅ Profile loading (auth exception)
2. ✅ Applications page (complex view)
3. ✅ AI Insights (analytics)
4. ✅ Multi-channel notifications (realtime)
5. ✅ Analytics library (performance)
6. ✅ Admin realtime metrics (realtime)
7. ✅ Eligibility engine (performance)
8. ✅ Workflow automation (background)
9. ✅ Storage library (not database)
10. ✅ Application drafts (offline-first)
11. ✅ Eligibility dashboard (realtime)
12. ✅ AI Assistant (low latency)
13. ✅ All realtime subscriptions
14. ✅ Complex analytics queries
15. ✅ Background automation

### HYBRID (1 item)
1. 🔄 Student notifications (API + realtime)

## API Endpoints to Create

### Phase 1 APIs (Critical)
```
POST /api/auth/sync-roles
GET  /api/auth/roles
```

### Phase 2 APIs (High Priority)
```
GET  /api/admin/settings
PUT  /api/admin/settings/:key
GET  /api/admin/roles
PUT  /api/admin/roles/:userId
GET  /api/admin/eligibility-rules
POST /api/admin/eligibility-rules
PUT  /api/admin/eligibility-rules/:id
DELETE /api/admin/eligibility-rules/:id
GET  /api/catalog/institutions
```

### Phase 3 APIs (Medium Priority)
```
GET  /api/notifications
POST /api/notifications/mark-read
```

## Implementation Order

### Week 1: Critical Security
- [ ] Create auth APIs
- [ ] Migrate role checking
- [ ] Migrate role sync
- [ ] Test admin access

### Week 2: Admin Core
- [ ] Create settings API
- [ ] Migrate Settings page
- [ ] Create roles API
- [ ] Migrate Role Management page
- [ ] Test admin workflows

### Week 3: Admin Features
- [ ] Create eligibility rules API
- [ ] Migrate Eligibility Management
- [ ] Create institutions API
- [ ] Migrate Programs page
- [ ] Update user management hook

### Week 4: Notifications & Polish
- [ ] Create notifications API
- [ ] Migrate notifications (hybrid)
- [ ] Add caching headers
- [ ] Performance testing
- [ ] Security audit

## Success Criteria

### Security
- ✅ All role checks go through API
- ✅ Audit trail for admin actions
- ✅ No direct writes to security tables

### Performance
- ✅ Page load times unchanged
- ✅ API response < 200ms
- ✅ No N+1 query issues

### Functionality
- ✅ All features work as before
- ✅ Offline mode still works
- ✅ Realtime updates still work

## Risk Mitigation

### Rollback Plan
- Keep direct calls commented out for 2 weeks
- Feature flags for API vs direct
- Monitor error rates

### Testing Strategy
- Unit tests for each API
- Integration tests for workflows
- Load testing for performance
- Security testing for auth

---

**Status**: Ready for Phase 1
**Estimated Duration**: 4 weeks
**Risk Level**: 🟡 MEDIUM (phased approach reduces risk)

