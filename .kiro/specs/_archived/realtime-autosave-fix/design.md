# Design Document

## Overview

This design addresses two critical issues in the MIHAS Application System:

1. **Admin Dashboard Real-time Updates** - The admin dashboard uses `loadDashboardStats()` which calls `adminDashboardService.getMetrics()` directly, bypassing React Query. When realtime events invalidate the cache, the dashboard doesn't refresh because it's using its own separate state.

2. **Application Wizard Auto-Save** - The auto-save mechanism in `useWizardController` has issues with the `watch()` subscription not triggering reliably, and draft restoration fails to properly load saved data and navigate to the correct step.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ADMIN DASHBOARD FIX                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  useAdminDashboardRealtime                                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ CURRENT: Only invalidates React Query cache                 │    │
│  │ FIX: Also call loadDashboardStats({ refresh: true })        │    │
│  │      when application changes are received                  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Admin Dashboard.tsx                                         │    │
│  │ - Pass onApplicationChange callback to realtime hook        │    │
│  │ - Callback triggers loadDashboardStats({ refresh: true })   │    │
│  │ - Show visual feedback when data refreshes                  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    AUTO-SAVE FIX                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  useWizardController                                                │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ CURRENT: watch() subscription with debounced timeout        │    │
│  │ ISSUE: Timeout may not fire, subscription may be stale      │    │
│  │                                                             │    │
│  │ FIX:                                                        │    │
│  │ 1. Use setInterval for reliable 8-second auto-save          │    │
│  │ 2. Track dirty state to only save when changes exist        │    │
│  │ 3. Fix draft restoration to properly load all fields        │    │
│  │ 4. Ensure step restoration works correctly                  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Draft Storage (localStorage)                                │    │
│  │ Key: 'applicationWizardDraft'                               │    │
│  │ Value: {                                                    │    │
│  │   formData: WizardFormData,                                 │    │
│  │   selectedGrades: SubjectGrade[],                           │    │
│  │   currentStep: number,                                      │    │
│  │   currentStepKey: string,                                   │    │
│  │   applicationId: string | null,                             │    │
│  │   savedAt: ISO timestamp,                                   │    │
│  │   version: 2                                                │    │
│  │ }                                                           │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Designs

### Component 1: Admin Dashboard Realtime Integration Fix

**Purpose:** Make the admin dashboard refresh its data when realtime events are received

**Location:** `src/pages/admin/Dashboard.tsx`

**Current Problem:**
```typescript
// Current code - realtime hook doesn't trigger loadDashboardStats
const { isSubscribed: isRealtimeSubscribed, isPolling } = useAdminDashboardRealtime({
  enabled: !!user?.id,
  showToasts: true,
  onPaymentChange: () => {
    loadDashboardStats({ refresh: true })
  }
  // Missing: onApplicationChange callback!
})
```

**Fix:**
```typescript
// Fixed code - add onApplicationChange callback
const { isSubscribed: isRealtimeSubscribed, isPolling } = useAdminDashboardRealtime({
  enabled: !!user?.id,
  showToasts: true,
  onApplicationChange: () => {
    // Refresh dashboard data when any application changes
    loadDashboardStats({ refresh: true })
  },
  onPaymentChange: () => {
    loadDashboardStats({ refresh: true })
  },
  onStatusHistoryChange: () => {
    loadDashboardStats({ refresh: true })
  }
})
```

**Behavior:**
- When any application status changes (including approvals/rejections), the dashboard will automatically refresh
- The refresh is triggered by the realtime subscription callback
- Visual feedback shows when data is being refreshed

---

### Component 2: Auto-Save Interval Fix

**Purpose:** Ensure auto-save fires reliably every 8 seconds

**Location:** `src/pages/student/applicationWizard/hooks/useWizardController.ts`

**Current Problem:**
```typescript
// Current code - uses watch() subscription with debounced timeout
useEffect(() => {
  if (!draftLoaded || restoringDraft) return
  
  let timeoutId: NodeJS.Timeout
  const subscription = watch(() => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      saveDraft()
    }, 8000)
  })

  return () => {
    subscription.unsubscribe()
    if (timeoutId) clearTimeout(timeoutId)
  }
}, [draftLoaded, restoringDraft, watch])
```

**Issues:**
1. The timeout only starts when `watch()` detects a change
2. If no changes are detected, auto-save never fires
3. The `saveDraft` function is not in the dependency array, causing stale closures

**Fix:**
```typescript
// Fixed code - use setInterval for reliable auto-save
useEffect(() => {
  if (!draftLoaded || restoringDraft || !user) return
  
  // Use setInterval for reliable 8-second auto-save
  const intervalId = setInterval(() => {
    const formData = getValues()
    const hasData = Object.values(formData).some(v => v !== undefined && v !== null && v !== '')
    
    if (hasData) {
      saveDraft()
    }
  }, 8000)

  return () => {
    clearInterval(intervalId)
  }
}, [draftLoaded, restoringDraft, user, getValues, saveDraft])
```

**Behavior:**
- Auto-save fires every 8 seconds regardless of whether changes are detected
- Only saves if there's actual data in the form
- Properly cleans up interval on unmount

---

### Component 3: Draft Restoration Fix

**Purpose:** Ensure draft data is properly restored when continuing an application

**Location:** `src/pages/student/applicationWizard/hooks/useWizardController.ts`

**Current Problem:**
The draft restoration logic has several issues:
1. Step restoration only happens when `currentStepIndex === 0`
2. Form values may not be set correctly due to timing issues
3. The `draftLoaded` flag is set before restoration completes

**Fix:**
```typescript
// Fixed draft loading logic
useEffect(() => {
  const loadDraft = async () => {
    if (!user || authLoading || draftLoaded) return
    setRestoringDraft(true)
    
    try {
      // Check if draft was recently deleted
      if (isDraftDeleted()) {
        clearDraftDeletedFlag()
        setRestoringDraft(false)
        setDraftLoaded(true)
        return
      }
      
      const savedDraft = localStorage.getItem('applicationWizardDraft')
      if (savedDraft) {
        const draft = safeJsonParse(savedDraft, null)
        if (draft && draft.formData && draft.version === 2) {
          // Restore form data
          Object.keys(draft.formData).forEach(key => {
            const value = draft.formData[key]
            if (value !== undefined && value !== null && value !== '') {
              setValue(key as keyof WizardFormData, value, { shouldValidate: false })
            }
          })
          
          // Restore grades
          if (draft.selectedGrades && Array.isArray(draft.selectedGrades)) {
            setSelectedGrades(draft.selectedGrades)
          }
          
          // Restore application ID
          if (draft.applicationId) {
            setApplicationId(draft.applicationId)
          }
          
          // CRITICAL: Always restore step, not just when currentStepIndex === 0
          if (draft.currentStepKey) {
            const index = wizardSteps.findIndex(step => step.key === draft.currentStepKey)
            if (index >= 0) {
              setCurrentStepIndex(index)
            }
          } else if (typeof draft.currentStep === 'number') {
            const index = getStepIndexById(draft.currentStep)
            if (index >= 0) {
              setCurrentStepIndex(index)
            }
          }
          
          // Show restoration confirmation
          showSuccess('Draft restored successfully')
        }
      }
    } catch (error) {
      console.error('Error loading draft:', error)
    } finally {
      setRestoringDraft(false)
      setDraftLoaded(true)
    }
  }

  if (user && !authLoading && !draftLoaded) {
    loadDraft()
  }
}, [user, authLoading, draftLoaded, setValue, showSuccess])
```

**Behavior:**
- Draft restoration always attempts to restore the saved step
- Form values are set with `shouldValidate: false` to prevent validation errors during restoration
- Grades and application ID are properly restored
- User sees confirmation when draft is restored

---

### Component 4: Save Draft Function Enhancement

**Purpose:** Ensure draft saves include all necessary data and update UI correctly

**Location:** `src/pages/student/applicationWizard/hooks/useWizardController.ts`

**Current Implementation Review:**
The current `saveDraft` function is mostly correct but has some issues:
1. Uses `requestIdleCallback` which may delay saves too much
2. Doesn't update the save status indicator reliably

**Fix:**
```typescript
const saveDraft = useCallback(async () => {
  if (!user || restoringDraft) return
  
  // Prevent concurrent saves
  if (isSavingRef.current) return
  
  try {
    isSavingRef.current = true
    setIsDraftSaving(true)
    
    const formData = getValues()
    const draft = {
      formData,
      selectedGrades,
      currentStep: currentStepConfig.id,
      currentStepKey: currentStepConfig.key,
      applicationId,
      savedAt: new Date().toISOString(),
      version: 2
    }

    // Save synchronously for reliability
    localStorage.setItem('applicationWizardDraft', JSON.stringify(draft))
    
    // Update UI
    setDraftSaved(true)
    setTimeout(() => setDraftSaved(false), 2000)
    
  } catch (error) {
    console.error('Error saving draft:', error)
  } finally {
    setIsDraftSaving(false)
    isSavingRef.current = false
  }
}, [user, restoringDraft, selectedGrades, currentStepConfig, applicationId, getValues])
```

**Behavior:**
- Saves synchronously for reliability (no `requestIdleCallback` delay)
- Prevents concurrent saves with ref flag
- Updates UI indicators correctly
- Includes all necessary data (form data, grades, step, application ID)

## Data Models

### Draft Storage Schema

```typescript
interface WizardDraft {
  formData: WizardFormData
  selectedGrades: SubjectGrade[]
  currentStep: number           // Step ID (1-based)
  currentStepKey: string        // Step key (e.g., 'basicKyc', 'education')
  applicationId: string | null  // Database application ID if created
  savedAt: string               // ISO timestamp
  version: 2                    // Schema version for compatibility
}

interface SubjectGrade {
  subject_id: string
  grade: number
}
```

### Realtime Event Payload

```typescript
interface RealtimeApplicationChange {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: {
    id: string
    status: string
    application_number: string
    // ... other fields
  }
  old: {
    id: string
    status: string
    // ... other fields
  }
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Cache Invalidation Triggers Dashboard Refresh

*For any* realtime event received by the admin dashboard, when the cache is invalidated, the `loadDashboardStats` function SHALL be called to refresh the displayed data.

**Validates: Requirements 1.2, 2.1, 2.2**

### Property 2: Draft Round-Trip Consistency

*For any* valid wizard form data and selected grades, saving to localStorage and then restoring SHALL produce equivalent form values, grades, and step position.

**Validates: Requirements 4.1, 4.2, 4.5**

### Property 3: Auto-Save Timing

*For any* form with data, the auto-save mechanism SHALL save to localStorage within 8 seconds of the last save, regardless of whether changes were detected.

**Validates: Requirements 3.1**

### Property 4: Completion Percentage Calculation

*For any* set of form field values, the completion percentage SHALL equal the ratio of non-empty fields to total required fields, expressed as a percentage.

**Validates: Requirements 5.1, 5.2**

### Property 5: Retry Exponential Backoff

*For any* sequence of auto-save failures, the retry delay SHALL follow exponential backoff pattern: delay = min(1000 * 2^attempt, 30000) milliseconds.

**Validates: Requirements 6.2**

### Property 6: Offline Queue Preservation

*For any* form data saved while offline, the data SHALL be preserved in localStorage and available for sync when connection is restored.

**Validates: Requirements 6.3, 6.4**

## Error Handling

### Admin Dashboard Errors

| Error | Handling |
|-------|----------|
| Realtime subscription fails | Fall back to polling every 30 seconds |
| loadDashboardStats fails | Show error message, allow manual retry |
| Network timeout | Show offline indicator, queue refresh |

### Auto-Save Errors

| Error | Handling |
|-------|----------|
| localStorage full | Show warning, suggest clearing old data |
| JSON serialization fails | Log error, skip save, retry next interval |
| Concurrent save conflict | Use ref flag to prevent, queue next save |

## Testing Strategy

### Unit Tests

1. **Admin Dashboard Realtime Integration**
   - Test that `onApplicationChange` callback is called when realtime event received
   - Test that `loadDashboardStats` is called with `{ refresh: true }`

2. **Auto-Save Mechanism**
   - Test that interval fires every 8 seconds
   - Test that save only occurs when form has data
   - Test that concurrent saves are prevented

3. **Draft Restoration**
   - Test that all form fields are restored
   - Test that grades are restored
   - Test that step is restored correctly
   - Test that application ID is restored

### Property-Based Tests

Each correctness property will be implemented as a property-based test using fast-check:

1. **Property 1**: Generate random realtime events, verify `loadDashboardStats` is called
2. **Property 2**: Generate random form data, save and restore, verify equality
3. **Property 3**: Mock timer, verify save occurs within 8 seconds
4. **Property 4**: Generate random field values, verify percentage calculation
5. **Property 5**: Generate failure sequences, verify backoff timing
6. **Property 6**: Generate offline scenarios, verify data preservation

### Integration Tests

1. **End-to-End Admin Flow**
   - Admin approves application
   - Verify dashboard updates without refresh
   - Verify student notification received

2. **End-to-End Wizard Flow**
   - Student fills form partially
   - Wait for auto-save
   - Navigate away and return
   - Verify data restored correctly

