# Module sizes — the 18 modules task 12.1 touched

Line counts, `wc -l`. "Before" is the working tree at dispatch; "after" is the
candidate. The whole-surface numbers and the cycle count are in
`size-dependency-before.txt` / `size-dependency-after.txt`.

## The four modules earlier tasks named, and what came out of each

| Module | Before | After | Δ |
|---|---:|---:|---:|
| `src/pages/student/ApplicationStatus.tsx` | 807 | **369** | −438 (−54 %) |
| `src/components/admin/applications/ApplicationApprovalActions.tsx` | 689 | **366** | −323 (−47 %) |
| `src/components/admin/applications/ApplicationDetailModal.tsx` | 1,443 | **785** | −658 (−46 %) |
| `src/pages/student/applicationWizard/hooks/useWizardController.ts` | 1,110 | **1,047** | −63 (−6 %) |
| **total** | **4,049** | **2,567** | **−1,482** |

## What was extracted

| New module | Lines | Out of |
|---|---:|---|
| `src/hooks/student/useApplicationWorkspace.ts` | 276 | `ApplicationStatus.tsx` |
| `src/components/student/applicationStatus/workspacePresentation.ts` | 138 | `ApplicationStatus.tsx` |
| `src/components/student/applicationStatus/WorkspaceAside.tsx` | 126 | `ApplicationStatus.tsx` |
| `src/components/student/applicationStatus/applicationTimeline.ts` | 111 | `ApplicationStatus.tsx` |
| `src/components/student/applicationStatus/ApplicationDetailsSection.tsx` | 74 | `ApplicationStatus.tsx` |
| `src/components/admin/applications/PaymentDecisionControls.tsx` | 246 | `ApplicationApprovalActions.tsx` |
| `src/hooks/admin/useApprovalActionCommands.ts` | 179 | `ApplicationApprovalActions.tsx` |
| `src/components/admin/applications/paymentReviewCopy.ts` | 66 | `ApplicationApprovalActions.tsx` |
| `src/components/admin/applications/approvalActionTokens.ts` | 38 | `ApplicationApprovalActions.tsx` |
| `src/hooks/admin/useReviewWorkspaceSession.ts` | 337 | `ApplicationDetailModal.tsx` |
| `src/components/admin/applications/ReviewDecisionLists.tsx` | 234 | `ApplicationDetailModal.tsx` |
| `src/components/admin/applications/AssignReviewerControl.tsx` | 179 | `ApplicationDetailModal.tsx` |
| `src/components/admin/applications/GradesDisplay.tsx` | 111 | `ApplicationDetailModal.tsx` |
| `.../applicationWizard/hooks/wizard/useWizardCatalogIdentity.ts` | 152 | `useWizardController.ts` |
| **total extracted** | **2,167** | |

The extracted total exceeds the 1,482 removed because each new module carries its
own imports, its own props interface, and the comment recording where it came from
and why. Net `src/**` growth: 109,786 → 110,586 lines over 574 → 588 files.

## Whole-surface counts

| Measure | Before | After |
|---|---:|---:|
| `apps/admissions/src` files over 400 lines | 57 | **55** |
| over 800 lines | 13 | **11** |
| over 1,000 lines | 4 | **3** |
| `backend/apps` files over 400 lines | 73 | 73 (unchanged — §9) |
| first-party import cycles | 7 | **7** |
| largest strongly connected component | 116 | **116** |
