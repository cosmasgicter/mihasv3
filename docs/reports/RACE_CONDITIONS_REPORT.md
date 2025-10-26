# Race Conditions Report - MIHAS Application System

**Date**: 2025-01-23  
**Status**: Critical Issues Identified  
**Priority**: High

## Executive Summary

This report identifies **7 critical race conditions** found in the MIHAS application system that could lead to data inconsistency, duplicate operations, and poor user experience.

---

## 🔴 Critical Race Conditions

### 1. ✅ FIXED: Duplicate Application Submission Notifications
**Location**: `useWizardController.ts` + Database Trigger  
**Severity**: HIGH (User-facing)  
**Status**: ✅ FIXED

**Issue**:
- Database trigger `application_status_notification_trigger` sends notification on status change
- Frontend code also manually calls `NotificationService.sendApplicationStatusNotification()`
- Result: Users receive **2 identical notifications** when submitting application

**Fix Applied**:
```typescript
// Removed manual notification call - database trigger handles it
// Notification is automatically sent by database trigger on status change
```

---

### 2. 🔴 CRITICAL: Triple Timestamp Update on application_drafts
**Location**: Database Triggers on `application_drafts` table  
**Severity**: CRITICAL  
**Status**: ⚠️ NEEDS FIX

**Issue**:
Three BEFORE UPDATE triggers all modify timestamps on same table:
1. `application_drafts_update_trigger` → calls `update_draft_timestamp()` → sets `updated_at`
2. `trigger_update_draft_last_accessed` → calls `update_draft_last_accessed()` → sets `last_accessed_at`
3. `update_application_drafts_updated_at` → calls `update_application_drafts_updated_at()` → sets `updated_at`

**Problem**:
- Triggers 1 and 3 both set `updated_at` (redundant)
- All three execute on EVERY update, causing unnecessary overhead
- Potential for trigger execution order issues

**Impact**:
- Performance degradation on draft saves
- Inconsistent timestamp values
- Database overhead

**Recommended Fix**:
```sql
-- Drop redundant triggers
DROP TRIGGER IF EXISTS application_drafts_update_trigger ON application_drafts;
DROP TRIGGER IF EXISTS update_application_drafts_updated_at ON application_drafts;

-- Keep only one consolidated trigger
CREATE OR REPLACE FUNCTION update_draft_metadata()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.last_accessed_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER application_drafts_metadata_trigger
BEFORE UPDATE ON application_drafts
FOR EACH ROW
EXECUTE FUNCTION update_draft_metadata();
```

---

### 3. 🔴 CRITICAL: Auto-Save Race Condition
**Location**: `useWizardController.ts` (lines 700-750)  
**Severity**: CRITICAL  
**Status**: ⚠️ NEEDS FIX

**Issue**:
```typescript
// Auto-save runs every 8 seconds
useEffect(() => {
  const subscription = watch(() => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      // Inline save logic
      if (!user || isDraftSaving || restoringDraft || isSavingRef.current) return
      
      isSavingRef.current = true
      setIsDraftSaving(true)
      // ... save to localStorage
    }, 8000)
  })
}, [draftLoaded, restoringDraft, watch, ...])
```

**Problems**:
1. **Multiple save operations can queue up** if user types fast
2. **localStorage writes are synchronous** - blocks UI thread
3. **No debouncing on form field changes** - every keystroke triggers timer reset
4. **Race between localStorage and database drafts** during load/save

**Impact**:
- UI freezes during rapid typing
- Lost data if multiple saves overlap
- Inconsistent draft state between localStorage and database

**Recommended Fix**:
```typescript
// Use proper debouncing and async queue
const saveQueue = useRef<Promise<void>>(Promise.resolve())

const saveDraft = useCallback(async () => {
  if (!user || isDraftSaving || restoringDraft) return
  
  // Queue saves to prevent overlap
  saveQueue.current = saveQueue.current.then(async () => {
    try {
      setIsDraftSaving(true)
      const formData = watch()
      
      // Use async storage API if available
      await new Promise(resolve => {
        requestIdleCallback(() => {
          localStorage.setItem('applicationWizardDraft', JSON.stringify({
            formData,
            selectedGrades,
            currentStepKey: currentStepConfig.key,
            applicationId,
            savedAt: new Date().toISOString(),
            version: 2
          }))
          resolve(undefined)
        })
      })
      
      setDraftSaved(true)
      setTimeout(() => setDraftSaved(false), 2000)
    } finally {
      setIsDraftSaving(false)
    }
  })
  
  return saveQueue.current
}, [user, selectedGrades, currentStepConfig, applicationId])

// Debounce form changes
const debouncedFormData = useDebounce(watch(), 3000)

useEffect(() => {
  if (draftLoaded && !restoringDraft) {
    saveDraft()
  }
}, [debouncedFormData])
```

---

### 4. 🟡 MEDIUM: Concurrent Draft Clear Operations
**Location**: `draftManager.ts`  
**Severity**: MEDIUM  
**Status**: ⚠️ NEEDS FIX

**Issue**:
```typescript
async clearAllDrafts(userId: string) {
  if (this.isClearing) {
    return { success: false, error: 'Clear operation already in progress' }
  }
  
  this.isClearing = true
  // ... clear operations
  this.isClearing = false
}
```

**Problem**:
- Simple boolean flag doesn't prevent race if called from multiple components
- No mutex/lock mechanism
- Cache invalidation happens after clear (potential stale reads)

**Recommended Fix**:
```typescript
private clearPromise: Promise<any> | null = null

async clearAllDrafts(userId: string) {
  // Return existing promise if already clearing
  if (this.clearPromise) {
    return this.clearPromise
  }
  
  this.clearPromise = (async () => {
    try {
      const removeRefreshHandler = this.preventRefresh()
      
      // Clear with proper ordering
      const deleteResult = await applicationSessionManager.deleteDraft(userId)
      
      // Invalidate cache BEFORE clearing storage
      this.draftKeysCache.clear()
      
      // Clear storage
      this.getDraftKeys(localStorage).forEach(key => localStorage.removeItem(key))
      this.getDraftKeys(sessionStorage).forEach(key => sessionStorage.removeItem(key))
      
      removeRefreshHandler()
      return deleteResult
    } finally {
      this.clearPromise = null
    }
  })()
  
  return this.clearPromise
}
```

---

### 5. 🟡 MEDIUM: Notification Mark-as-Read Race
**Location**: `NotificationBell.tsx`  
**Severity**: MEDIUM  
**Status**: ⚠️ NEEDS FIX

**Issue**:
```typescript
const handleNotificationClick = async (notification: StudentNotification) => {
  try {
    if (!notification.read) {
      await markAsRead(notification.id)  // Async call
    }
    
    if (notification.action_url) {
      window.location.href = notification.action_url  // Immediate navigation
    }
  } catch (error) {
    console.error('Failed to handle notification click')
  }
}
```

**Problem**:
- Navigation happens before `markAsRead` completes
- If navigation is fast, notification stays unread
- No optimistic update

**Recommended Fix**:
```typescript
const handleNotificationClick = async (notification: StudentNotification) => {
  try {
    // Optimistic update
    if (!notification.read) {
      // Update UI immediately
      updateNotificationLocally(notification.id, { read: true })
      
      // Then update server (fire and forget)
      markAsRead(notification.id).catch(err => {
        // Rollback on error
        updateNotificationLocally(notification.id, { read: false })
        console.error('Failed to mark as read:', err)
      })
    }
    
    // Navigate after optimistic update
    if (notification.action_url) {
      window.location.href = notification.action_url
    }
  } catch (error) {
    console.error('Failed to handle notification click')
  }
}
```

---

### 6. 🟡 MEDIUM: Duplicate Grade Entries
**Location**: Database - `application_grades` table  
**Severity**: MEDIUM  
**Status**: ⚠️ PARTIALLY PROTECTED

**Issue**:
Two unique indexes on same columns:
```sql
CREATE UNIQUE INDEX application_grades_application_id_subject_id_key 
  ON application_grades (application_id, subject_id);

CREATE UNIQUE INDEX unique_application_subject 
  ON application_grades (application_id, subject_id);
```

**Problem**:
- Redundant indexes (performance overhead)
- Frontend doesn't handle unique constraint violations gracefully
- Concurrent grade updates could cause conflicts

**Recommended Fix**:
```sql
-- Drop redundant index
DROP INDEX IF EXISTS unique_application_subject;

-- Keep the constraint-backed index
-- application_grades_application_id_subject_id_key (already exists)
```

Frontend fix:
```typescript
// In syncGrades mutation
try {
  await syncGrades.mutateAsync({ id: applicationId, grades: selectedGrades })
} catch (error) {
  if (error.message?.includes('duplicate') || error.code === '23505') {
    // Handle duplicate gracefully - update instead of insert
    showWarning('Grades updated successfully')
  } else {
    throw error
  }
}
```

---

### 7. 🟡 MEDIUM: Profile Metadata Sync Race
**Location**: Database Trigger `sync_profile_metadata_trigger`  
**Severity**: MEDIUM  
**Status**: ⚠️ NEEDS INVESTIGATION

**Issue**:
- Trigger on `profiles` table UPDATE calls `sync_profile_to_auth_metadata()`
- Updates `auth.users.raw_user_meta_data`
- If profile updated rapidly, metadata sync could lag or conflict

**Recommended Investigation**:
```sql
-- Check the sync function for race protection
SELECT pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname = 'sync_profile_to_auth_metadata';
```

---

## 📊 Summary Table

| # | Issue | Severity | Status | Impact |
|---|-------|----------|--------|--------|
| 1 | Duplicate Notifications | HIGH | ✅ FIXED | User confusion |
| 2 | Triple Timestamp Updates | CRITICAL | ⚠️ NEEDS FIX | Performance |
| 3 | Auto-Save Race | CRITICAL | ⚠️ NEEDS FIX | Data loss |
| 4 | Draft Clear Race | MEDIUM | ⚠️ NEEDS FIX | Stale data |
| 5 | Notification Mark-as-Read | MEDIUM | ⚠️ NEEDS FIX | UX issue |
| 6 | Duplicate Grades | MEDIUM | ⚠️ PARTIAL | DB errors |
| 7 | Profile Sync Race | MEDIUM | ⚠️ INVESTIGATE | Data inconsistency |

---

## 🎯 Recommended Action Plan

### Immediate (This Week)
1. ✅ Fix duplicate notifications (DONE)
2. 🔴 Fix triple timestamp triggers on application_drafts
3. 🔴 Implement proper auto-save debouncing with queue

### Short Term (Next Sprint)
4. 🟡 Add mutex to draft clear operations
5. 🟡 Implement optimistic updates for notifications
6. 🟡 Remove redundant grade indexes

### Long Term (Next Month)
7. 🟡 Audit all database triggers for race conditions
8. 🟡 Implement distributed locking for critical operations
9. 🟡 Add comprehensive race condition tests

---

## 🛠️ Testing Recommendations

### Race Condition Test Suite
```typescript
describe('Race Condition Tests', () => {
  test('Concurrent draft saves should not corrupt data', async () => {
    // Simulate rapid form changes
    // Verify final state is consistent
  })
  
  test('Multiple notification mark-as-read calls should be idempotent', async () => {
    // Click notification multiple times rapidly
    // Verify only one API call made
  })
  
  test('Draft clear during auto-save should not cause errors', async () => {
    // Start auto-save
    // Trigger draft clear before save completes
    // Verify no errors and consistent state
  })
})
```

---

## 📝 Notes

- All race conditions identified using Supabase MCP to inspect database triggers and constraints
- Frontend code analyzed for concurrent operation patterns
- Priority based on user impact and data integrity risk

**Next Review**: 2025-02-01
