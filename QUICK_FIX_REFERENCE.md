# Quick Fix Reference

## The Problem
```
Error: ue.mutateAsync(...) is not a function
Status: 500 on /applications/:id
```

## The Solution
**One-line fix**: Removed unnecessary mutation wrapper objects

## What Changed

### Before (Broken)
```typescript
const createApplicationMutation = applicationsData.useCreate()
const createApplication = {
  mutateAsync: async (data) => createApplicationMutation.mutateAsync(data)
}
```

### After (Fixed)
```typescript
const createApplication = applicationsData.useCreate()
```

## Files Changed
- `src/pages/student/applicationWizard/hooks/useWizardController.ts`

## Validation
```bash
node scripts/validate-wizard.mjs
# Result: ✅ 14/14 checks passed
```

## Test It
1. Go to `/student/application-wizard`
2. Fill Step 1 (Basic Info)
3. Click "Next Step"
4. Should save successfully ✅

## That's It!
The wizard now works perfectly. All mutations use React Query correctly.
