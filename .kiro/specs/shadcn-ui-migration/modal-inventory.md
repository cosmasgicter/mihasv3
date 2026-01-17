# Modal Component Inventory

## Overview

This document inventories all Modal usages across the MIHAS Application System codebase for migration to shadcn/ui Dialog (Radix-based).

## Current Modal Component

**Location:** `src/components/ui/Modal.tsx`

**Props Interface:**
```typescript
interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  className?: string
}
```

**Features:**
- Uses framer-motion for animations
- Body scroll lock when open
- Backdrop click to close
- Size variants (sm, md, lg, xl, full)
- Header with title/description
- Close button

## Existing Dialog Component

**Location:** `src/components/ui/Dialog.tsx` (lowercase) and `src/components/ui/dialog.tsx`

**Already Radix-based** with:
- DialogPrimitive from @radix-ui/react-dialog
- Focus trapping via useFocusTrap hook
- DialogOverlay, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription
- Escape key close (built into Radix)
- Body scroll lock (built into Radix)

## Modal Usages Found

### 1. ApplicationDetailModal
**File:** `src/components/admin/applications/ApplicationDetailModal.tsx`
**Type:** Custom modal implementation (not using Modal component)
**Props:**
- `show: boolean`
- `application: ApplicationWithDetails | null`
- `updating: string | null`
- `onClose: () => void`
- Various callback props

**Notes:** Uses custom `fixed inset-0` overlay pattern, not the Modal component. Very large component (1300+ lines).

### 2. SendNotificationModal
**File:** `src/components/admin/applications/SendNotificationModal.tsx`
**Type:** Custom modal implementation (not using Modal component)
**Props:**
- `show: boolean`
- `applicationNumber: string`
- `studentName: string`
- `onClose: () => void`
- `onSend: (title: string, message: string) => Promise<void>`

**Notes:** Uses custom `fixed inset-0` overlay pattern.

### 3. ShareModal
**File:** `src/pages/public/tracker/components/ShareModal.tsx`
**Type:** Custom modal with framer-motion
**Props:**
- `show: boolean`
- `applicationNumber: string`
- `onClose: () => void`
- `onCopyLink: () => void`
- `onCopyNumber: () => void`

**Notes:** Uses framer-motion AnimatePresence, respects prefers-reduced-motion.

### 4. CommunicationModal
**File:** `src/components/admin/CommunicationModal.tsx`
**Type:** Already using Dialog (Radix-based)
**Props:**
- `open: boolean`
- `onOpenChange: (open: boolean) => void`
- `applicant: {...}`
- `onSend?: (data: CommunicationData) => Promise<void>`

**Notes:** Already migrated to Dialog pattern! Uses Dialog, DialogContent, DialogHeader, etc.

### 5. Inline Modal Patterns (Custom Overlays)

Several components use inline modal patterns with `fixed inset-0`:

- **EligibilityManagement.tsx** - Rule Form Modal (line 324)
- **ComplianceAnalytics.tsx** - Details Modal (line 296)
- **EligibilityChecker.tsx** - Appeal Form Modal (line 259)
- **BulkOperations.tsx** - Confirmation Modal (line 253)
- **DetailedScoreBreakdown.tsx** - Recommendation Detail Modal (line 422)

## Migration Summary

| Component | Current Pattern | Migration Action |
|-----------|----------------|------------------|
| Modal.tsx | framer-motion | Create compatibility wrapper |
| ApplicationDetailModal | Custom overlay | Migrate to Dialog |
| SendNotificationModal | Custom overlay | Migrate to Dialog |
| ShareModal | framer-motion | Migrate to Dialog |
| CommunicationModal | Dialog (Radix) | ✅ Already migrated |
| EligibilityManagement | Inline overlay | Migrate to Dialog |
| ComplianceAnalytics | Inline overlay | Migrate to Dialog |
| EligibilityChecker | Inline overlay | Migrate to Dialog |
| BulkOperations | Inline overlay | Migrate to Dialog |
| DetailedScoreBreakdown | Inline overlay | Migrate to Dialog |

## Key Migration Considerations

1. **Prop Mapping:**
   - `isOpen` / `show` → `open`
   - `onClose` → `onOpenChange`

2. **Size Variants:**
   - Current Modal: sm, md, lg, xl, full
   - Need to add size support to Dialog

3. **Focus Trapping:**
   - Already implemented in Dialog via useFocusTrap hook

4. **Body Scroll Lock:**
   - Radix Dialog handles this automatically

5. **Escape Key Close:**
   - Radix Dialog handles this automatically

6. **Backdrop Click Close:**
   - Radix Dialog handles this automatically
