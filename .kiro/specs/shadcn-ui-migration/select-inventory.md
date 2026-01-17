# Native Select Element Inventory

## Summary

This document inventories all native `<select>` elements and AnimatedSelect components that need migration to the shadcn/ui Select with RHF Controller pattern.

## Files with Native Select Elements

### 1. SignUpPage (src/pages/auth/SignUpPage.tsx)
- **Field**: `sex`
- **RHF Binding**: `register('sex')` - spread pattern
- **Options**: Male, Female
- **Supabase Path**: profiles table insert on signup
- **Priority**: HIGH - Simple migration
- **Status**: ✅ MIGRATED

### 2. StepOne (src/components/application/wizard/StepOne.tsx)
- **Fields**: 
  - `sex` - register pattern
  - `program` - register pattern  
  - `intake` - register pattern
- **Options**: 
  - sex: Male, Female
  - program: Clinical Medicine, Environmental Health, Registered Nursing
  - intake: January 2025, July 2025, January 2026, July 2026
- **Supabase Path**: applications table insert/update
- **Priority**: HIGH - Simple migration
- **Status**: ✅ MIGRATED

### 3. Student Settings (src/pages/student/Settings.tsx)
- **Field**: `sex`
- **RHF Binding**: `register('sex')` - spread pattern
- **Options**: Male, Female
- **Supabase Path**: profiles table update
- **Priority**: HIGH - Simple migration
- **Status**: ✅ MIGRATED

### 4. BasicKycStep (src/pages/student/applicationWizard/steps/BasicKycStep.tsx)
- **Fields**: 
  - `sex` - AnimatedSelect with register pattern
  - `program` - AnimatedSelect with register pattern
  - `intake` - AnimatedSelect with register pattern
- **Component**: Uses AnimatedSelect (native select wrapper)
- **Supabase Path**: applications table insert/update
- **Priority**: HIGH - Uses AnimatedSelect wrapper
- **Status**: ✅ MIGRATED

### 5. EducationStep (src/pages/student/applicationWizard/steps/EducationStep.tsx)
- **Fields**: 
  - Subject selection (dynamic) - StandaloneSelect with value/onChange
  - Grade selection (dynamic) - StandaloneSelect with value/onChange
- **Component**: Uses StandaloneSelect (controlled pattern)
- **Supabase Path**: application_grades table
- **Priority**: MEDIUM - Dynamic list, controlled pattern
- **Status**: ✅ MIGRATED

### 6. PaymentStep (src/pages/student/applicationWizard/steps/PaymentStep.tsx)
- **Field**: `payment_method`
- **RHF Binding**: FormSelect with Controller pattern
- **Component**: Uses FormSelect
- **Supabase Path**: payments table
- **Priority**: HIGH - Simple migration
- **Status**: ✅ MIGRATED

### 7. RoleManagement (src/pages/admin/RoleManagement.tsx)
- **Field**: Role selection (uncontrolled)
- **RHF Binding**: None - uses StandaloneSelect with local state (newRole)
- **Options**: student, admin, super_admin
- **Supabase Path**: profiles table update (role field)
- **Priority**: LOW - Not RHF, uses local state
- **Status**: ✅ MIGRATED

### 8. Programs (src/pages/admin/Programs.tsx)
- **Field**: `institution_id` (2 instances - create and edit dialogs)
- **RHF Binding**: None - uses StandaloneSelect with local state (form.institution_id)
- **Options**: Dynamic from institutions table
- **Supabase Path**: programs table insert/update
- **Priority**: LOW - Not RHF, uses local state
- **Status**: ✅ MIGRATED

### 9. EligibilityManagement (src/pages/admin/EligibilityManagement.tsx)
- **Fields**: 
  - `program_id` - StandaloneSelect with local state
  - `rule_type` - StandaloneSelect with local state
- **RHF Binding**: None - uses local state (ruleForm)
- **Supabase Path**: eligibility_rules table
- **Priority**: LOW - Not RHF, uses local state
- **Status**: ✅ MIGRATED

### 10. PredictiveAnalytics (src/pages/admin/PredictiveAnalytics.tsx)
- **Field**: `time_range` (forecast period)
- **RHF Binding**: None - uses StandaloneSelect with local state
- **Options**: 7, 14, 30, 60, 90 days
- **Supabase Path**: None (UI filter only)
- **Priority**: LOW - Not RHF, UI filter only
- **Status**: ✅ MIGRATED

### 11. Admin Settings (src/pages/admin/Settings.tsx)
- **Field**: `setting_type`
- **RHF Binding**: None - uses StandaloneSelect with local state (newSetting)
- **Options**: string, integer, decimal, boolean
- **Supabase Path**: system_settings table
- **Priority**: LOW - Not RHF, uses local state
- **Status**: ✅ MIGRATED

## Existing Radix Select Usages (Already Migrated)

### 1. CommunicationModal (src/components/admin/CommunicationModal.tsx)
- Uses shadcn/ui Select components
- Already using Radix-based Select

### 2. NotificationPreferences (src/components/notifications/NotificationPreferences.tsx)
- Uses shadcn/ui Select components
- Already using Radix-based Select

### 3. BulkNotificationManager (src/components/admin/BulkNotificationManager.tsx)
- Uses shadcn/ui Select components
- Already using Radix-based Select

## Migration Progress

### Completed
- ✅ FormSelect wrapper component created (`src/components/ui/form-select.tsx`)
- ✅ StandaloneSelect wrapper component created (`src/components/ui/standalone-select.tsx`)
- ✅ Property tests for Select (keyboard navigation, default value, form payload)
- ✅ SignUpPage sex select
- ✅ StepOne sex, program, intake selects
- ✅ BasicKycStep sex, program, intake selects
- ✅ Student Settings sex select
- ✅ EducationStep - subject and grade selects (dynamic lists)
- ✅ PaymentStep - payment_method select
- ✅ RoleManagement - role select
- ✅ Programs - institution_id selects
- ✅ EligibilityManagement - program_id, rule_type selects
- ✅ PredictiveAnalytics - time_range select
- ✅ Admin Settings - setting_type select

### Remaining (Task 6.7)
All native select migrations complete! ✅

## Notes

- AnimatedSelect is a custom wrapper around native `<select>` with animations
- All RHF-bound selects use the `register()` spread pattern
- Non-RHF selects use local state with value/onChange
- Supabase payloads must remain identical after migration
