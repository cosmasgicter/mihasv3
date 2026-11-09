/**
 * The student application wizard (admissions-v2 task 11.2).
 *
 * Requirements: **R10.2** (one state machine owns the draft lifecycle; other
 * modules are pure adapters or views), **R16.1** (320 px first), **R16.2** (44 px
 * targets, WCAG 2.1 AA), **R16.3** (one mobile bottom action surface; the global
 * bottom navigation must not compete), **R16.7** (no overflow at the six widths),
 * **R16.8** (status, autosave and recovery stay understandable under zoom, slow
 * network and offline). Findings: **STU-02**, **STU-03**, **MAINT-01**.
 *
 * ── What this page is, after the recomposition ───────────────────────────────
 *
 * A composition of five views over one state machine:
 *
 * | View | Owns |
 * |---|---|
 * | `WizardProgressSummary` | where the student is, and the **platform's** current blockers (task 6.5) |
 * | `WizardStepRenderer` | the current step, one branch per state of the machine |
 * | `WizardContextPanel` | the checklist and context — on **every** viewport, not only `lg` |
 * | `WizardActionBar` | the one anchored bottom surface: back, forward/submit, and draft state |
 * | `WizardDraftPicker` | one draft list with continue / rename / delete, used by the choice screen and by "switch draft" |
 *
 * Everything those views need is read from `useWizardController`. They decide
 * nothing: no gate, no validation rule, no save.
 *
 * ── The draft machine (task 6.3) ──────────────────────────────────────────────
 *
 * Every draft write is the draft machine's (`wizard.draftMachine`,
 * `lib/wizardDraftController.ts`). This page asks it to act — Save now, leave a
 * step, reload or merge after a conflict — and renders its snapshot; it never
 * writes the draft itself. Step navigation used to call a server save directly,
 * which is how a resume and a click on an earlier step advanced the draft's
 * version with nothing changed (the residual M9's F3 run recorded). It now asks
 * the machine to flush, and an unchanged draft has nothing to flush.
 *
 * ── The four bottom-surface problems this closes (R16.3, STU-03) ─────────────
 *
 * A student on a phone could previously have four things anchored to the viewport
 * at once: the wizard's sticky footer, the global bottom navigation, a floating
 * `Drafts (n)` button at `top-20 right-4` sitting over the mobile header's own
 * controls, and a floating keyboard-shortcuts button. Now there is one — the action
 * bar. The global bar's suppression is the shell's (`AppLayout` drops it on the
 * wizard route; `wizardShellSuppression.test.tsx` pins that so it cannot regress),
 * the drafts button is gone into the picker, and the shortcuts button was already
 * `lg:`-only and stays there, where no bottom navigation exists.
 *
 * ── Deep-linking (task 11.1's deferral, answered) ────────────────────────────
 *
 * `?step=` is now honoured on a first load, clamped by the wizard's own
 * reachability gate, so the platform's next action can address the step that clears
 * it. See `lib/wizardStepDeepLink.ts` for why an out-of-reach request lands on the
 * checkpoint and says so rather than being followed or silently dropped.
 */
import { AlertCircle, ArrowLeft, FilePlus2, FileText } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Seo } from "@/components/seo/Seo";

import { useOptimizedAnimation } from "@/hooks/useOptimizedAnimation";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { WizardSkeleton } from "@/components/ui";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert";
import { SectionCard } from "@/components/ui/SectionCard";
import { PageShell } from "@/components/ui/PageShell";
import { isPaymentResolvedForProgress } from "@/lib/paymentStatus";

import SubmissionSuccess from "./components/SubmissionSuccess";
import { KeyboardShortcutsHelp } from "./components/KeyboardShortcutsHelp";
import { EnhancedProgressIndicator } from "./components/EnhancedProgressIndicator";
import {
  WizardErrorSummary,
  type WizardValidationError,
} from "./components/WizardErrorSummary";
import { WizardActionBar } from "./components/WizardActionBar";
import { WizardContextPanel } from "./components/WizardContextPanel";
import { WizardDraftPicker } from "./components/WizardDraftPicker";
import { WizardProgressSummary } from "./components/WizardProgressSummary";
import { WizardStepRenderer } from "./components/WizardStepRenderer";
import useWizardController from "./hooks/useWizardController";
import { useStepValidation } from "./hooks/useStepValidation";
import { useOverallProgress } from "./hooks/useOverallProgress";
import { useSmartAutoSave } from "./hooks/useSmartAutoSave";
import { deriveWizardPageSaveView } from "./lib/pageSaveView";
import { useWizardReadiness } from "./hooks/useWizardReadiness";
import { wizardSteps, getStepIndexByKey } from "./steps/config";
import type { StepKey } from "./steps/config";
import type { SubjectGrade } from "./types";
import { usePortalBrand } from "@/hooks/usePortalBrand";
import {
  pathFor,
  studentApplicationNewPath,
  studentApplicationResumePath,
} from "@/routes/routeRegistry";
import { parseWizardDraftIntent } from "./hooks/wizard/useWizardDraftLoader";
import {
  documentReviewChecks,
  documentValidationFields,
} from "./lib/requiredDocumentSurfaces";
import { buildWizardChecklist } from "./lib/wizardChecklist";
import { collectWizardValidationErrors } from "./lib/wizardValidationErrors";
import { resolveWizardDeepLinkStep } from "./lib/wizardStepDeepLink";
import { ConfirmAlertDialog } from "@/components/ui/alert-dialog";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

// --- Lightweight online/offline hook ---
const onlineSubscribe = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};
const getOnlineSnapshot = () => navigator.onLine;

const useIsOnline = () =>
  useSyncExternalStore(onlineSubscribe, getOnlineSnapshot, () => true);

// --- Detect mobile keyboard open via visualViewport ---
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const initialHeight = vv.height;
    const threshold = 150; // keyboard typically shrinks viewport by 150px+
    const onResize = () => setOpen(initialHeight - vv.height > threshold);
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);
  return open;
}

const ApplicationWizardContent = () => {
  const wizard = useWizardController();
  const {
    authLoading,
    restoringDraft,
    user,
    success,
    loading,
    uploading,
    uploadStates,
    error,
    setError,
    form,
    totalSteps,
    currentStepIndex,
    currentStepConfig,
    isLastStep,
    selectedProgramDetails,
    selectedGrades,
    intakes,
    confirmSubmission,
    resultSlipFile,
    extraKycFile,
    uploadedFiles,
    requiredDocuments,
    wizardReadiness,
    draftLoaded,
    draftApplicationsLoading,
    draftApplications,
    duplicateDraftConflict,
    clearDuplicateDraftConflict,
    gradesHydrating,
    submittedApplication,
    applicationId,
    paymentStatus,
    persistingSlip,
    slipLoading,
    emailLoading,
    handleDownloadSlip,
    handleEmailSlip,
    dismissSlipProgress,
    handleLoadDraft,
    handleNextStep,
    handlePrevStep,
    handleSubmitApplication,
    addGrade,
    removeGrade,
    updateGrade,
    getUsedSubjects,
    draftMachine,
    draftSnapshot,
    goToStep,
    assignmentResolved,
    assignmentPreview,
    assignmentPreviewLoading,
    assignmentPreviewError,
  } = wizard;

  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const leaveDialog = useConfirmDialog();

  // What the legacy two-field wizard knew. Used only when the versioned
  // required-document contract could not be read (task 7.2, R11.6).
  const legacyDocumentState = useMemo(
    () => ({
      hasResultSlip: Boolean(resultSlipFile || uploadedFiles.result_slip),
      hasIdentityDocument: Boolean(extraKycFile || uploadedFiles.extra_kyc),
      resultSlipName: resultSlipFile?.name ?? null,
      identityName: extraKycFile?.name ?? null,
    }),
    [resultSlipFile, extraKycFile, uploadedFiles],
  );
  const stepValidation = useStepValidation(form, currentStepIndex, {
    paymentStatus,
    confirmSubmission,
    selectedGrades,
    requiredDocuments: documentValidationFields(
      requiredDocuments.contract,
      legacyDocumentState,
    ),
    uploading,
    assignmentResolved,
  });
  const overallProgress = useOverallProgress(form, {
    selectedGrades,
    uploadedFiles,
    hasResultSlipFile: Boolean(resultSlipFile),
    hasIdentityFile: Boolean(extraKycFile),
    paymentStatus,
    confirmSubmission,
  });
  const { shouldAnimate } = useOptimizedAnimation();
  const isOnline = useIsOnline();
  const keyboardOpen = useKeyboardOpen();
  const { brandName: portalBrandName } = usePortalBrand();
  const draftIntent = parseWizardDraftIntent(location.search);
  const locationParams = new URLSearchParams(location.search);
  const isLocalDraftIntent = locationParams.get("localDraft") === "true";
  const wizardModeSummary = (() => {
    if (draftIntent.mode === "new") {
      return {
        label: "New application",
        description: "Saved drafts will not be restored into this application.",
        className: "border-primary/20 bg-primary/5 text-primary",
      };
    }
    if (draftIntent.mode === "resume") {
      return {
        label: "Resuming draft",
        description: "Only the selected saved draft is loaded in this session.",
        className: "border-success/25 bg-success/5 text-foreground",
      };
    }
    if (draftIntent.mode === "local" || isLocalDraftIntent) {
      return {
        label: "Local draft",
        description:
          "Your browser draft is being continued without clearing local progress.",
        className: "border-warning/25 bg-warning/5 text-warning",
      };
    }
    return {
      label: applicationId ? "Draft in progress" : "Application in progress",
      description: "Autosave is active while you complete the application.",
      className: "border-border bg-muted/50 text-foreground",
    };
  })();
  const draftChoices = (draftApplications?.applications ?? []) as Array<{
    id?: string;
  }>;
  const showDraftChoice = Boolean(
    user &&
    draftLoaded &&
    !draftApplicationsLoading &&
    draftIntent.mode === "auto" &&
    !applicationId &&
    draftChoices.length > 0,
  );

  // Pause auto-save during critical operations (Req 9.1, 9.2):
  // - Payment step with payment in progress (initiating or pending)
  // - Submission processing (loading flag)
  const isPaymentStepActive = currentStepConfig.key === "payment";
  const isPaymentInProgress =
    isPaymentStepActive && paymentStatus === "pending";
  const nextButtonLabel = loading ? "Saving step..." : "Next Step";
  // The view over the draft machine. `enabled` is the autosave gate only: edits
  // made while it is closed are recorded and written when it opens.
  const smartAutoSave = useSmartAutoSave({
    machine: draftMachine,
    snapshot: draftSnapshot,
    enabled:
      draftLoaded &&
      !showDraftChoice &&
      !loading &&
      !uploading &&
      !restoringDraft &&
      !success &&
      !isPaymentInProgress,
  });
  // What the action bar shows: the machine's draft view composed with this
  // page's document commands (SJR R6-b). An upload in flight is "saving"; a
  // failed one is an error the student can act on.
  const pageSaveView = deriveWizardPageSaveView(
    { status: smartAutoSave.saveStatus, message: smartAutoSave.saveError },
    {
      documentsUploading: uploading || requiredDocuments.uploading,
      documentsFailed:
        Object.values(uploadStates).includes("failed") ||
        Object.values(requiredDocuments.uploadStates).some(
          (state) => state.status === "failed",
        ),
    },
  );
  /** Leaving a step writes pending work; an unchanged draft writes nothing. */
  const flushDraftBeforeLeavingStep = useCallback(() => {
    void draftMachine.flush();
  }, [draftMachine]);

  const progressPercent = overallProgress.percentage;

  /**
   * The platform's current blockers (task 6.5, R16.1).
   *
   * Read for the one application this wizard is editing, on the same query key the
   * dashboard uses, and only once an online draft exists. The browser-derived
   * `Missing: …` line this replaces is the defect 11.1 removed from the dashboard.
   */
  const serverReadiness = useWizardReadiness(applicationId, {
    enabled: !success && !showDraftChoice,
  });

  // Structured validation errors for the error summary (Req 5.2, 5.3)
  const [validationErrors, setValidationErrors] = useState<
    WizardValidationError[]
  >([]);
  const [stepAnnouncement, setStepAnnouncement] = useState("");
  const [deepLinkNotice, setDeepLinkNotice] = useState<string | null>(null);

  /**
   * Collect all validation errors for the current step based on form state
   * and step-specific required fields. Returns structured errors for the summary.
   */
  /**
   * The structured validation summary for the current step (Req 5.2, 5.3).
   *
   * The rules live in `lib/wizardValidationErrors.ts` — lifted verbatim by task
   * 11.2, including the `gradesHydrating` guard that stops the education step
   * claiming zero subjects while the server's grades are still loading.
   */
  const collectStepValidationErrors = useCallback(
    (): WizardValidationError[] =>
      collectWizardValidationErrors({
        stepKey: currentStepConfig.key,
        formData: form.watch(),
        selectedGrades,
        gradesHydrating,
        resultSlipFile,
        extraKycFile,
        uploadedFiles,
        uploading,
        paymentStatus,
        confirmSubmission,
        assignmentResolved,
      }),
    [
      form,
      currentStepConfig.key,
      selectedGrades,
      gradesHydrating,
      resultSlipFile,
      extraKycFile,
      uploadedFiles,
      uploading,
      paymentStatus,
      confirmSubmission,
      assignmentResolved,
    ],
  );

  const [stepDirection, setStepDirection] = useState<"forward" | "backward">(
    "forward",
  );
  const [stepKey, setStepKey] = useState(currentStepIndex);
  const isPopstateNavRef = useRef(false);
  const isInitialSyncRef = useRef(true);
  const stepContentRef = useRef<HTMLDivElement>(null);
  /**
   * The URL the wizard was *opened* with, captured before its own history sync
   * rewrites `?step=`. Deep-linking has to read the student's link, not the value
   * the wizard just wrote over it.
   */
  const openedSearchRef = useRef(location.search);
  const deepLinkAppliedRef = useRef(false);
  /** False when there is nothing for the platform to resolve an assignment from. */
  const hasAssignmentSelection = Boolean(
    form.watch("program") && form.watch("intake"),
  );

  useEffect(() => {
    setStepKey(currentStepIndex);
    // Clear validation errors when navigating to a new step
    setValidationErrors([]);
    // Focus the step content container so screen readers announce the new step
    requestAnimationFrame(() => {
      stepContentRef.current?.focus({ preventScroll: false });
    });
  }, [currentStepIndex, totalSteps, currentStepConfig.title]);

  /**
   * Honour `?step=` on the first load (task 11.2; task 11.1 §2.2's deferral).
   *
   * Runs once, after the draft-resume machine has finished, so a deep link is a
   * deliberate override of the resume step rather than a race with it. An
   * unreachable step is clamped to the assigned-school checkpoint and the student is
   * told why — a link that silently lands on the wrong step is worse than one that
   * explains itself.
   */
  useEffect(() => {
    if (deepLinkAppliedRef.current) return;
    if (!draftLoaded || restoringDraft || success || showDraftChoice) return;

    const resolution = resolveWizardDeepLinkStep(openedSearchRef.current, {
      assignmentResolved,
    });

    // Nothing was asked for: the resume machine's step stands, exactly as before
    // deep-linking existed.
    if (!resolution.requested) {
      deepLinkAppliedRef.current = true;
      return;
    }

    if (resolution.index !== null) {
      deepLinkAppliedRef.current = true;
      if (resolution.index !== currentStepIndex) {
        setStepDirection(
          resolution.index > currentStepIndex ? "forward" : "backward",
        );
        goToStep(resolution.index);
      }
      return;
    }

    // Deferred: the step is real but not reachable *yet*. `assignmentResolved` is a
    // server read, so on the first pass it is false for every step past the
    // checkpoint even when the assignment is about to resolve — the browser run
    // caught this refusing a perfectly good `?step=personal` link, and then caught a
    // fixed 4 s grace period racing the catalog load. So the wizard waits for the
    // gate to *conclude* rather than for a clock: it re-decides when the answer
    // arrives (a dependency), and explains itself only once no answer can change the
    // outcome — nothing selected to resolve, or a preview that settled unresolved.
    // Only a *terminal* signal concludes: nothing selected to resolve from, or the
    // platform refused. A preview that has merely arrived is not terminal — the
    // browser run showed it arriving a beat before its fee, so treating "arrived" as
    // "unresolved" refused the link intermittently on one project and not the other.
    // A missing selection is only terminal when there is no draft behind it: on a
    // resumed draft the programme arrives a render after the form hydrates, and
    // reading that gap as "nothing to resolve" refused the link once in five runs.
    const nothingToResolveFrom = !applicationId && !hasAssignmentSelection;
    const gateAnswered =
      Boolean(assignmentPreviewError) ||
      (assignmentPreview != null && !assignmentPreviewLoading);
    if (nothingToResolveFrom || gateAnswered) {
      deepLinkAppliedRef.current = true;
      setDeepLinkNotice(
        "We kept you where you left off. The step in that link becomes available once your assigned school and fee are confirmed.",
      );
    }
  }, [
    draftLoaded,
    restoringDraft,
    success,
    showDraftChoice,
    assignmentResolved,
    assignmentPreview,
    assignmentPreviewLoading,
    assignmentPreviewError,
    hasAssignmentSelection,
    applicationId,
    currentStepIndex,
    goToStep,
  ]);

  // Browser back/forward navigation support (Req 11.2, 11.3)
  // Push history state when step changes (but not on popstate-driven changes)
  useEffect(() => {
    if (success) return;
    if (restoringDraft) return;
    if (isPopstateNavRef.current) {
      isPopstateNavRef.current = false;
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("step", currentStepConfig.key);
    if (isInitialSyncRef.current) {
      isInitialSyncRef.current = false;
      window.history.replaceState(
        { wizardStep: currentStepIndex },
        "",
        url.toString(),
      );
    } else {
      window.history.pushState(
        { wizardStep: currentStepIndex },
        "",
        url.toString(),
      );
    }
  }, [currentStepIndex, currentStepConfig.key, success, restoringDraft]);

  // Listen for popstate (browser back/forward)
  useEffect(() => {
    if (success) return;

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as { wizardStep?: number } | null;
      if (state && typeof state.wizardStep === "number") {
        isPopstateNavRef.current = true;
        goToStep(state.wizardStep);
        return;
      }
      // Fallback: read step from URL
      const url = new URL(window.location.href);
      const stepParam = url.searchParams.get("step");
      if (stepParam) {
        const stepIndex = wizardSteps.findIndex((s) => s.key === stepParam);
        if (stepIndex >= 0) {
          isPopstateNavRef.current = true;
          goToStep(stepIndex);
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [success, goToStep]);

  // Track step direction for transitions
  const wrappedHandleNextStep = useCallback(() => {
    setStepDirection("forward");
    void handleNextStep();
  }, [handleNextStep]);

  const wrappedHandlePrevStep = useCallback(() => {
    setStepDirection("backward");
    handlePrevStep();
  }, [handlePrevStep]);

  const handleProgressStepClick = useCallback(
    (stepIndex: number) => {
      if (stepIndex >= currentStepIndex) return;
      setStepDirection("backward");
      flushDraftBeforeLeavingStep();
      goToStep(stepIndex);
    },
    [currentStepIndex, goToStep, flushDraftBeforeLeavingStep],
  );

  const handleNavigateToStep = useCallback(
    (targetStepKey: StepKey) => {
      const idx = wizardSteps.findIndex((s) => s.key === targetStepKey);
      if (idx >= 0) {
        setStepDirection("backward");
        flushDraftBeforeLeavingStep();
        goToStep(idx);
      }
    },
    [goToStep, flushDraftBeforeLeavingStep],
  );

  // Populate validation errors and focus first errored field on validation error (Req 5.2, 5.3)
  useEffect(() => {
    if (!error) {
      setValidationErrors([]);
      return;
    }
    // Collect structured errors for the summary
    const collected = collectStepValidationErrors();
    setValidationErrors(collected);

    // Small delay to let the error summary render, then focus first errored field
    const timer = setTimeout(() => {
      const firstError = collected[0];
      if (firstError) {
        const firstField = firstError.field;
        const el =
          document.querySelector<HTMLElement>(`[name="${firstField}"]`) ||
          document.querySelector<HTMLElement>(`#${CSS.escape(firstField)}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.focus({ preventScroll: true });
          return;
        }
      }
      // Fallback: focus any aria-invalid field
      const errorField = document.querySelector(
        '[aria-invalid="true"]',
      ) as HTMLElement;
      if (errorField) {
        errorField.scrollIntoView({ behavior: "smooth", block: "center" });
        errorField.focus({ preventScroll: true });
        return;
      }
      // Last fallback: scroll to the error alert itself
      const errorAlert = document.querySelector(
        '[role="alert"]',
      ) as HTMLElement;
      if (errorAlert) {
        errorAlert.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [error, collectStepValidationErrors]);

  // Focus first [aria-invalid="true"] field when validation errors appear (Req 17.1)
  useEffect(() => {
    if (validationErrors.length === 0) return;
    const timer = setTimeout(() => {
      const first = document.querySelector('[aria-invalid="true"]');
      if (first instanceof HTMLElement) {
        first.scrollIntoView({ behavior: "smooth", block: "center" });
        first.focus({ preventScroll: true });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [validationErrors]);

  /**
   * Build an aria-describedby value for a field that includes the wizard-level
   * error summary item id when the field has a validation error (Req 17.2).
   */
  const getFieldAriaDescribedBy = useCallback(
    (fieldName: string): string | undefined => {
      const hasError = validationErrors.some((e) => e.field === fieldName);
      return hasError ? `wizard-error-${fieldName}` : undefined;
    },
    [validationErrors],
  );

  // Update aria-live announcement when validation errors appear on the current step (Req 14.3)
  useEffect(() => {
    const base = `Step ${currentStepIndex + 1} of ${wizardSteps.length}: ${currentStepConfig.title}`;
    setStepAnnouncement(
      validationErrors.length > 0 ? `${base}. Validation errors found.` : base,
    );
  }, [validationErrors, currentStepIndex, currentStepConfig.title]);

  const checklistItems = useMemo(
    () =>
      buildWizardChecklist({
        stepKey: currentStepConfig.key,
        values: (() => {
          try {
            return typeof form?.watch === "function"
              ? ((form.watch() as Record<string, unknown>) ?? {})
              : {};
          } catch {
            return {};
          }
        })(),
        selectedGrades,
        assignmentResolved,
        confirmSubmission,
        paymentStatus,
        requiredDocumentsContract: requiredDocuments.contract,
        legacyDocumentState,
      }),
    [
      currentStepConfig.key,
      form,
      selectedGrades,
      assignmentResolved,
      confirmSubmission,
      paymentStatus,
      requiredDocuments.contract,
      legacyDocumentState,
    ],
  );

  // Keyboard shortcuts
  useEffect(() => {
    if (success) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !loading) {
        if (e.key === "ArrowRight" && !isLastStep) {
          e.preventDefault();
          wrappedHandleNextStep();
        } else if (e.key === "ArrowLeft" && currentStepIndex > 0) {
          e.preventDefault();
          wrappedHandlePrevStep();
        } else if (e.key === "s") {
          e.preventDefault();
          void smartAutoSave.forceSave();
        }
      }
      if (e.key === "Escape") {
        setError("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    currentStepIndex,
    isLastStep,
    loading,
    uploading,
    success,
    wrappedHandleNextStep,
    wrappedHandlePrevStep,
    smartAutoSave,
    setError,
  ]);

  /**
   * Leaving with unsaved edits (R16.6).
   *
   * This was `window.confirm('You have unsaved changes...')`, the last native
   * dialog owning a wizard workflow. Task 11.1 left it deliberately, naming this
   * task or 11.5 as its owner; it is **this** task's, because it belongs to the
   * back affordance this recomposition rewrites, and because a native confirm
   * cannot say what the product dialog says: the work is already saved on this
   * device, and there is a way to save it now.
   */
  const confirmLeavingEdits = useCallback(async (): Promise<boolean> => {
    // Asked only when the draft machine says the work is not in the student's
    // account yet: RHF's `isDirty` compares with the blank defaults, so it was
    // true after every resume even when nothing was unsaved.
    if (success || !(draftSnapshot.hasUnsyncedWork || draftSnapshot.localOnly)) {
      return true;
    }
    return leaveDialog.confirm({
      title: "Leave this application?",
      message:
        "You have changes that have not been saved to your account yet. They stay on this device, and you can come back to this draft at any time. Save now if you are on a different device later.",
      confirmText: "Leave application",
      cancelText: "Stay here",
      variant: "warning",
    });
  }, [draftSnapshot.hasUnsyncedWork, draftSnapshot.localOnly, success, leaveDialog]);

  const handleBackToDashboard = useCallback(async () => {
    if (!(await confirmLeavingEdits())) return;
    navigate("/student/dashboard");
  }, [confirmLeavingEdits, navigate]);

  if (authLoading || restoringDraft) {
    return <WizardSkeleton />;
  }

  if (!user) return null;

  if (success && submittedApplication) {
    return (
      <SubmissionSuccess
        submittedApplication={submittedApplication}
        persistingSlip={persistingSlip}
        slipLoading={slipLoading}
        emailLoading={emailLoading}
        onDownload={handleDownloadSlip}
        onEmail={handleEmailSlip}
        onDismissSlipProgress={dismissSlipProgress}
      />
    );
  }

  const handleAddGrade = () => {
    setError("");
    addGrade();
  };

  const handleRemoveGrade = (index: number) => {
    setError("");
    removeGrade(index);
  };

  const handleUpdateGrade = (
    index: number,
    field: keyof SubjectGrade,
    value: string | number,
  ) => {
    setError("");
    updateGrade(index, field, value);
  };

  const handleGetUsedSubjects = () => getUsedSubjects();

  const startNewApplication = () => {
    // Let go of any open draft before clearing the form, so the cleared values
    // are never mistaken for edits to it (the intent change then re-hydrates).
    draftMachine.reset();
    form.reset();
    setError("");
    navigate(studentApplicationNewPath(), { replace: true });
  };

  /**
   * Leave this draft for the chooser, or for a clean one.
   *
   * Both go through the same unsaved-changes dialog as "Back to Dashboard": a
   * student who taps "Switch application" mid-sentence is leaving edits behind
   * exactly as much as one who taps the back link, and R16.6 wants that said once,
   * in a product dialog, not twice in different words.
   */
  const handleSwitchApplication = async () => {
    if (!(await confirmLeavingEdits())) return;
    navigate(pathFor("student.applicationWizard"));
  };

  const handleStartAnother = async () => {
    if (!(await confirmLeavingEdits())) return;
    // The open draft's unsaved work stays in its own outbox record (the dialog
    // says so); the machine lets go of it before the form is cleared.
    draftMachine.reset();
    form.reset();
    setError("");
    navigate(studentApplicationNewPath(), { replace: true });
  };

  const continueChosenDraft = (
    draft: Parameters<typeof handleLoadDraft>[0],
    draftId: string,
  ) => {
    void handleLoadDraft(draft, draftId);
    void queryClient.invalidateQueries({ queryKey: ["applications"] });
  };

  /**
   * The draft-choice screen (R10.1, STU-12).
   *
   * A bare visit with saved drafts stops and asks; it never picks by timestamp. The
   * list is now the *same* `WizardDraftPicker` the wizard itself offers, so
   * continue / rename / delete read identically in both places and the scoped
   * delete command has one implementation (task 11.1's `deleteStudentDraft`, reached
   * through `useMultiDraft`).
   */
  if (showDraftChoice) {
    return (
      <>
        <Seo
          title={`Choose Application Draft | ${portalBrandName}`}
          description={`Choose whether to continue a saved ${portalBrandName} draft or start a new application.`}
          path="/student/application-wizard"
          noindex
        />
        <PageShell
          title="Choose an application"
          eyebrow="Application Flow"
          subtitle="Continue a saved draft or begin a clean application."
          maxWidth="4xl"
          tone="application"
        >
          <SectionCard
            title="Saved drafts"
            description="Pick the draft you want to continue. Starting new will not attach this session to an old application."
            icon={<FileText className="h-5 w-5" />}
          >
            <WizardDraftPicker
              userId={user?.id}
              currentDraftId={applicationId}
              onContinueDraft={continueChosenDraft}
              onStartNew={startNewApplication}
            />
          </SectionCard>
        </PageShell>
      </>
    );
  }

  const previousStepTitle =
    currentStepIndex > 0
      ? (wizardSteps[currentStepIndex - 1]?.progressTitle ?? "previous step")
      : null;
  const nextStepTitle =
    wizardSteps[currentStepIndex + 1]?.progressTitle ?? null;
  const nextDisabled =
    smartAutoSave.saveStatus === "conflict" ||
    (currentStepConfig.key === "assignedSchool" && !assignmentResolved) ||
    (currentStepConfig.key === "payment" &&
      !isPaymentResolvedForProgress(paymentStatus));

  return (
    <>
      <Seo
        title={`Application Wizard | ${portalBrandName}`}
        description={`Complete your ${portalBrandName} application step by step.`}
        path="/student/application-wizard"
        noindex
      />
      <PageShell
        title="Student Application"
        eyebrow="Application Flow"
        subtitle={`Complete ${totalSteps} steps with autosave. You can leave and come back at any time.`}
        maxWidth="full"
        tone="application"
        className={shouldAnimate ? "animate-fade-in" : ""}
      >
        {/* Visually hidden aria-live region for screen reader step announcements */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {stepAnnouncement}
        </div>

        <Container size="md" className="space-y-4 pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                void handleBackToDashboard();
              }}
              className="inline-flex min-h-touch items-center gap-2 rounded-lg px-2 text-sm font-medium text-primary hover:bg-primary/5"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Dashboard
            </button>
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${wizardModeSummary.className}`}
              role="status"
              aria-live="polite"
              data-testid="wizard-mode-summary"
              title={wizardModeSummary.description}
            >
              {wizardModeSummary.label}
            </span>
          </div>

          {!isOnline && (
            <div
              role="alert"
              className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground"
            >
              You appear to be offline. Your progress is saved on this device
              and will sync when you reconnect.
            </div>
          )}

          {deepLinkNotice && (
            <Alert variant="warning">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Opened a different step</AlertTitle>
              <AlertDescription>{deepLinkNotice}</AlertDescription>
            </Alert>
          )}

          <WizardProgressSummary
            stepNumber={currentStepIndex + 1}
            totalSteps={totalSteps}
            stepTitle={currentStepConfig.title}
            stepDescription={currentStepConfig.description}
            percentComplete={progressPercent}
            blockers={serverReadiness.blockers}
            readinessLoading={serverReadiness.isLoading}
            readinessUnavailable={serverReadiness.unavailable}
            canSubmit={serverReadiness.canSubmit}
            notEvaluatedYet={!applicationId}
            onRetryReadiness={serverReadiness.refetch}
          />

          <EnhancedProgressIndicator
            steps={wizardSteps}
            currentStepIndex={currentStepIndex}
            onStepClick={handleProgressStepClick}
            progressPercentage={progressPercent}
            compact
          />

          {validationErrors.length > 0 && (
            <WizardErrorSummary errors={validationErrors} />
          )}

          {error && validationErrors.length === 0 && (
            <Alert variant="error" className="animate-slide-up">
              <div className="flex flex-1 flex-col gap-3">
                <div>
                  <AlertTitle className="text-foreground">
                    Something needs attention
                  </AlertTitle>
                  <AlertDescription className="mt-1 text-foreground">
                    {error}
                  </AlertDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  {duplicateDraftConflict &&
                    duplicateDraftConflict.existingId && (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        className="min-h-touch"
                        onClick={() => {
                          const existingId = duplicateDraftConflict.existingId!;
                          clearDuplicateDraftConflict();
                          navigate(studentApplicationResumePath(existingId), {
                            replace: true,
                          });
                        }}
                      >
                        Continue existing
                      </Button>
                    )}
                  {duplicateDraftConflict && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-touch"
                      onClick={() => {
                        clearDuplicateDraftConflict();
                        goToStep(getStepIndexByKey("program"));
                      }}
                    >
                      Change program
                    </Button>
                  )}
                  {(error.toLowerCase().includes("network") ||
                    error.toLowerCase().includes("connection") ||
                    error.toLowerCase().includes("failed to") ||
                    error.toLowerCase().includes("timeout")) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-touch"
                      onClick={wrappedHandleNextStep}
                    >
                      Retry
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-touch"
                    onClick={() => {
                      clearDuplicateDraftConflict();
                      setError("");
                    }}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            </Alert>
          )}

          {!stepValidation.isValid &&
            !isLastStep &&
            stepValidation.completedFields > 0 && (
              <Alert variant="warning" className="animate-slide-up">
                <div className="flex-1">
                  <AlertTitle className="text-foreground">
                    This step is still incomplete
                  </AlertTitle>
                  <AlertDescription className="mt-1 text-foreground">
                    Complete the remaining items before continuing.
                  </AlertDescription>
                  {stepValidation.missingFields.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                      {stepValidation.missingFields.map((field, idx) => (
                        <li key={idx}>{field}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </Alert>
            )}
        </Container>

        <Container size="md">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
            <div className="lg:col-span-2">
              <form
                onSubmit={form.handleSubmit(
                  handleSubmitApplication,
                  (formErrors) => {
                    // Surface silent Zod failures to the user. Without this callback
                    // form.handleSubmit swallows validation errors and the submit
                    // button appears to do nothing.
                    const firstError = Object.values(formErrors)[0];
                    const message =
                      firstError &&
                      typeof firstError === "object" &&
                      "message" in firstError &&
                      typeof firstError.message === "string"
                        ? firstError.message
                        : "Please fix the highlighted errors before submitting.";
                    setError(message);
                  },
                )}
                className="space-y-4"
                style={{ scrollPaddingBottom: "5rem" }}
              >
                <div
                  key={stepKey}
                  ref={stepContentRef}
                  tabIndex={-1}
                  className={`outline-none ${stepDirection === "forward" ? "wizard-step-forward" : "wizard-step-backward"}`}
                >
                  {uploading && currentStepConfig.key !== "education" && (
                    <div
                      className="mb-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm text-primary"
                      role="status"
                    >
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/40 border-t-primary motion-reduce:animate-none" />
                      <span>
                        Your documents are uploading in the background. You can
                        keep going.
                      </span>
                    </div>
                  )}

                  <WizardStepRenderer
                    wizard={wizard}
                    getFieldAriaDescribedBy={getFieldAriaDescribedBy}
                    onAddGrade={handleAddGrade}
                    onRemoveGrade={handleRemoveGrade}
                    onUpdateGrade={handleUpdateGrade}
                    onGetUsedSubjects={handleGetUsedSubjects}
                    documentChecks={documentReviewChecks(
                      requiredDocuments.contract,
                      legacyDocumentState,
                    )}
                    onNavigateToStep={handleNavigateToStep}
                  />
                </div>

                <WizardActionBar
                  previousStepTitle={previousStepTitle}
                  nextStepTitle={nextStepTitle}
                  isLastStep={isLastStep}
                  loading={loading}
                  nextDisabled={nextDisabled}
                  submitDisabled={
                    !wizardReadiness.canSubmit ||
                    smartAutoSave.saveStatus === "conflict"
                  }
                  nextLabel={nextButtonLabel}
                  onPrev={wrappedHandlePrevStep}
                  onNext={wrappedHandleNextStep}
                  onSaveNow={() => {
                    void smartAutoSave.forceSave();
                  }}
                  onReloadConflict={smartAutoSave.reloadLatest}
                  onKeepConflictChanges={() => {
                    void smartAutoSave.keepMyChanges();
                  }}
                  saveStatus={pageSaveView.status}
                  saveError={pageSaveView.message}
                  lastSavedAt={
                    smartAutoSave.lastSaved
                      ? smartAutoSave.lastSaved.getTime()
                      : null
                  }
                  isOnline={isOnline}
                  keyboardOpen={keyboardOpen}
                />
              </form>
            </div>

            {/*
              One instance, two placements (R16.1, STU-03). CSS grid puts this column
              beside the form at `lg` and after it on a phone, so the checklist,
              the application preview and the draft list are in the DOM at **every**
              width — where before they were inside `hidden lg:block` and a phone had
              no way to reach them at all. Rendering the panel twice (`lg:hidden` plus
              `hidden lg:block`) would duplicate every heading for a screen reader,
              which is why the mobile/desktop difference lives inside the panel as a
              disclosure rather than out here as two copies.
            */}
            <aside
              className="space-y-4 lg:col-span-1"
              aria-label="Application context"
            >
              <div className="space-y-4 lg:sticky lg:top-6">
                <WizardContextPanel
                  form={form}
                  stepKey={currentStepConfig.key}
                  checklistItems={checklistItems}
                  programName={selectedProgramDetails?.name}
                  intakeName={
                    intakes.find((intake) => intake.id === form.watch("intake"))
                      ?.name
                  }
                />
                {/*
                  Switching applications is a **navigation**, not a second draft
                  subscription (R10.2).

                  The first version of this recomposition embedded the whole
                  `WizardDraftPicker` here, and the browser characterisation caught
                  what that costs: `useMultiDraft` re-lists the student's drafts on
                  every draft-store revision, so mounting it *inside* the wizard put a
                  second reader of draft state next to the one state machine that owns
                  it — and on the mobile project a manual save then came back with the
                  profile's town instead of the one the student had just typed, with
                  two other typed fields wiped. A controlled run with this block
                  removed passed the same journey in 19 s
                  (`docs/v2-evidence/11.2/raw/harness-experiment-no-picker.txt`).
                  R10.2 already names the rule this broke: one state machine owns
                  hydration and edits, and everything else is a pure adapter or view.

                  So the command survives on every viewport — which is what R16.1
                  requires — as a link to the chooser, where the full picker
                  (continue / rename / delete) lives with no wizard form mounted
                  beside it.
                */}
                <SectionCard title="Your applications" padding="sm">
                  <p className="text-sm text-muted-foreground">
                    Your other saved applications are untouched while you work
                    on this one.
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-touch w-full justify-start"
                      onClick={() => {
                        void handleSwitchApplication();
                      }}
                    >
                      <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
                      Switch application
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-touch w-full justify-start"
                      onClick={() => {
                        void handleStartAnother();
                      }}
                    >
                      <FilePlus2 className="h-4 w-4 mr-2" aria-hidden="true" />
                      Start a new application
                    </Button>
                  </div>
                </SectionCard>
              </div>
            </aside>
          </div>
        </Container>

        <KeyboardShortcutsHelp />

        <ConfirmAlertDialog
          isOpen={leaveDialog.isOpen}
          onClose={leaveDialog.handleCancel}
          onConfirm={leaveDialog.handleConfirm}
          title={leaveDialog.options.title}
          message={leaveDialog.options.message}
          confirmText={leaveDialog.options.confirmText}
          cancelText={leaveDialog.options.cancelText}
          variant={leaveDialog.options.variant}
        />
      </PageShell>
    </>
  );
};

const ApplicationWizard = () => (
  <ErrorBoundary level="section">
    <ApplicationWizardContent />
  </ErrorBoundary>
);

export default ApplicationWizard;
