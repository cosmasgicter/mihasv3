import { useEffect, useRef } from "react";
import type { UseFormSetValue } from "react-hook-form";
import { normalizeSexForWizard } from "@/hooks/useProfileAutoPopulation";
import { sanitizeForLog } from "@/lib/security";
import { toError } from "@/lib/toError";
import { logger } from "@/lib/logger";
import { isDraftDeleted, clearDraftDeletedFlag } from "@/lib/draftManager";
import { clearNewWizardDraftCache } from "@/lib/draftLocalCache";
import { applicationSessionManager } from "@/lib/applicationSession";
import {
  cachedGetItem,
  cachedRemoveItem,
  whenSecureStorageReady,
} from "@/lib/localStorageCache";
import { getLegacyWizardDraftStorageKey } from "@/lib/draftStorageKeys";
import { normalizeResidenceTown } from "@/lib/residenceTown";
import { normalizeDateInputValue } from "@/lib/profileFieldMapping";
import type { WizardDraftController } from "@/lib/wizardDraftController";
import {
  draftAssignmentKey,
  positiveDraftVersion,
} from "@/lib/wizardDraftProjection";
import type { User } from "@/types/auth";
import {
  SELECTED_DRAFT_LOAD_ERROR,
  readAuthoritativeDraftRow,
} from "../../lib/draftHydration";
import { projectWizardGrades } from "../../lib/draftGrades";
import type { SubjectGrade, WizardFormData, WizardProgram } from "../../types";
import { getStepIndexById, wizardSteps } from "../../steps/config";
import type { ApplicationFileType } from "../useApplicationFileUploads";
import type {
  OutboxRecovery,
  OutboxRecoveryContext,
  RestoredServerDraft,
} from "./useWizardDraftPersistence";

interface DraftApplicationsData {
  applications?: unknown[];
}

interface UseWizardDraftLoaderParams {
  /**
   * The draft machine. The loader is its hydration adapter: it reads the
   * sources (intent, server list and row, local outbox) and reports the outcome;
   * the machine owns the application id, version and baseline from there on.
   */
  machine: WizardDraftController;
  user: User | null;
  authLoading: boolean;
  draftLoaded: boolean;
  draftApplicationsLoading: boolean;
  draftApplications: DraftApplicationsData | undefined;
  locationSearch: string;
  totalSteps: number;
  programsData: { programs?: unknown[] } | undefined;
  setValue: UseFormSetValue<WizardFormData>;
  setRestoringDraft: (value: boolean) => void;
  setDraftLoaded: (value: boolean) => void;
  setError: (message: string) => void;
  setSelectedGrades: (value: SubjectGrade[]) => void;
  setGradesHydrating: (value: boolean) => void;
  goToStep: (index: number) => void;
  markUploadedFile: (key: ApplicationFileType, value: boolean) => void;
  restorePaymentStatus: (status: string | null | undefined) => void;
  showSuccess: (message: string) => void;
  findProgramId: (
    value?: string | null,
    institutionHint?: string | null,
    programList?: WizardProgram[],
  ) => string;
  hydrateServerGrades: (applicationId: string) => Promise<SubjectGrade[]>;
  hydrateServerDocuments: (
    applicationId: string,
  ) => Promise<Record<string, boolean>>;
  /** The shared server-draft hydration (also used by the draft picker). */
  restoreServerDraft: (
    draft: Record<string, unknown>,
    draftId: string,
    options?: { isCurrent?: () => boolean },
  ) => Promise<RestoredServerDraft | null>;
  /** What the local outbox says about a freshly loaded server draft. */
  outboxRecoveryFor: (
    applicationId: string,
    serverVersion: number,
    context?: OutboxRecoveryContext,
  ) => OutboxRecovery;
}

export { SELECTED_DRAFT_LOAD_ERROR };

/**
 * How long hydration waits for this user's encrypted outbox to be decrypted
 * into memory before reading it (admissions-v2 task 6.3, M13). Key derivation is
 * PBKDF2 and is slow on a low-end phone; reading before it finishes reads
 * nothing. On timeout hydration proceeds without the outbox and reports it as
 * unread, so the record is left exactly as it is (task 6.3 M14) rather than
 * settled over.
 */
export const WIZARD_OUTBOX_READY_TIMEOUT_MS = 5_000;

export type WizardDraftIntent =
  | { mode: "new"; draftId: null }
  | { mode: "resume"; draftId: string }
  | { mode: "local"; draftId: null }
  | { mode: "auto"; draftId: null };

export function parseWizardDraftIntent(
  locationSearch: string,
): WizardDraftIntent {
  const params = new URLSearchParams(locationSearch);
  const wizardMode = (params.get("mode") || "").toLowerCase();
  const selectedDraftId = (
    params.get("draftId") ||
    params.get("applicationId") ||
    ""
  ).trim();

  if (
    wizardMode === "new" ||
    params.get("new") === "true" ||
    params.get("fresh") === "1"
  ) {
    return { mode: "new", draftId: null };
  }

  if (params.get("localDraft") === "true") {
    return { mode: "local", draftId: null };
  }

  if (wizardMode === "resume" && selectedDraftId) {
    return { mode: "resume", draftId: selectedDraftId };
  }

  return { mode: "auto", draftId: null };
}

/**
 * Handles initial draft loading on wizard mount. Explicit `mode=new` never
 * restores a draft, and `mode=resume&draftId=...` restores only that selected
 * server draft. Bare visits with server drafts stop at the draft-choice screen
 * instead of silently resuming the latest record.
 */
export function useWizardDraftLoader({
  machine,
  user,
  authLoading,
  draftLoaded,
  draftApplicationsLoading,
  draftApplications,
  locationSearch,
  totalSteps,
  programsData,
  setValue,
  setRestoringDraft,
  setDraftLoaded,
  setError,
  setSelectedGrades,
  setGradesHydrating,
  goToStep,
  markUploadedFile,
  restorePaymentStatus,
  showSuccess,
  findProgramId,
  hydrateServerGrades,
  hydrateServerDocuments,
  restoreServerDraft,
  outboxRecoveryFor,
}: UseWizardDraftLoaderParams) {
  /**
   * Single flight: one hydration per (user, intent).
   *
   * This effect re-runs whenever a value it closes over changes identity — the
   * programme catalogue or the subject list arriving, a refetched draft list —
   * and `draftLoaded` is still false while the first load is awaiting the
   * server. A second, concurrent load used to re-hydrate the form and move the
   * step a few hundred milliseconds later: after the student had already moved
   * to another step (task 6.3's F3 run caught a resume being sent back from
   * Personal to Education), and over any answer typed in between. The first
   * load's closures are sufficient: canonical subject ids resolve without the
   * catalogue, and the controller reconciles a restored programme name to its id
   * when the catalogue arrives.
   */
  const startedLoadKeyRef = useRef<string | null>(null);
  const loadTokenRef = useRef(0);

  useEffect(() => {
    const loadDraft = async () => {
      if (!user || authLoading || draftLoaded || draftApplicationsLoading)
        return;
      const draftIntent = parseWizardDraftIntent(locationSearch);
      const loadKey = `${user.id}|${draftIntent.mode}|${draftIntent.draftId ?? ""}`;
      if (startedLoadKeyRef.current === loadKey) return;
      startedLoadKeyRef.current = loadKey;
      const token = ++loadTokenRef.current;
      // A load superseded by a later intent change applies nothing more.
      const isCurrent = () => loadTokenRef.current === token;

      setRestoringDraft(true);
      let draftRestored = false;

      if (draftIntent.mode === "new") {
        try {
          // R10.10: a fresh start clears only this user's unattached "new"
          // snapshot (+ the shared legacy key). Every other attached draft and
          // every payment-recovery record survives.
          clearNewWizardDraftCache(user.id);
        } catch {
          /* noop */
        }
        machine.startNew();
        setRestoringDraft(false);
        setDraftLoaded(true);
        return;
      }

      machine.beginHydration();
      try {
        // The local outbox is readable only once this user's key is derived and
        // the record decrypted into memory (R10.4, R10.8). If that does not
        // happen in time, hydration proceeds — and leaves the unread record alone.
        const outboxReadable = await whenSecureStorageReady(
          WIZARD_OUTBOX_READY_TIMEOUT_MS,
        );
        if (!isCurrent()) return;
        if (isDraftDeleted()) {
          clearDraftDeletedFlag();
          machine.startNew();
          setRestoringDraft(false);
          setDraftLoaded(true);
          return;
        }

        interface LocalDraftShape {
          formData: Record<string, unknown>;
          selectedGrades?: unknown[];
          uploadedFiles?: Record<string, boolean>;
          paymentStatus?: string | null;
          currentStep?: number;
          currentStepKey?: string;
          applicationId?: string;
          savedAt?: string;
          userId?: string;
          version?: number;
          serverVersion?: number | null;
          /** Outbox retry metadata: the record holds edits the server never acknowledged. */
          pending?: boolean;
        }
        interface ServerDraftShape {
          id: string;
          full_name?: string;
          nrc_number?: string;
          passport_number?: string;
          date_of_birth?: string;
          sex?: string;
          phone?: string;
          email?: string;
          residence_town?: string;
          country?: string;
          nationality?: string;
          next_of_kin_name?: string;
          next_of_kin_phone?: string;
          program?: string;
          intake?: string;
          institution?: string;
          result_slip_url?: string;
          extra_kyc_url?: string;
          payment_status?: string | null;
          status?: string;
          updated_at?: string;
          created_at?: string;
          version?: number;
          assignment_version?: number;
        }
        let localDraft: LocalDraftShape | null = null;
        let serverApp: ServerDraftShape | null = null;

        const draft = await applicationSessionManager.getLocalWizardDraft(
          user.id,
        );
        if (!isCurrent()) return;
        if (draft && draft.formData && draft.version === 2) {
          localDraft = draft as unknown as LocalDraftShape;
        } else if (cachedGetItem(getLegacyWizardDraftStorageKey())) {
          cachedRemoveItem(getLegacyWizardDraftStorageKey());
        }

        sessionStorage.removeItem(getLegacyWizardDraftStorageKey());

        if (
          draftIntent.mode !== "local" &&
          draftApplications?.applications &&
          draftApplications.applications.length > 0
        ) {
          const serverDrafts =
            draftApplications.applications as ServerDraftShape[];
          if (draftIntent.mode === "auto") {
            // A bare visit with saved drafts stops at the choice screen: no
            // draft is open until the student picks one.
            machine.reset();
            setRestoringDraft(false);
            setDraftLoaded(true);
            return;
          }
          serverApp =
            draftIntent.mode === "resume"
              ? (serverDrafts.find(
                  (candidate) => String(candidate.id) === draftIntent.draftId,
                ) ?? null)
              : (serverDrafts[0] ?? null);
        }

        if (draftIntent.mode === "resume" && !serverApp) {
          // The selected draft is not among the student's readable drafts (the
          // list failed, or it was submitted or deleted). Fail closed: the
          // machine stays addressed to it and never writes over it.
          machine.failHydration({ applicationId: draftIntent.draftId });
          setError(SELECTED_DRAFT_LOAD_ERROR);
          setRestoringDraft(false);
          setDraftLoaded(true);
          return;
        }

        // R10.3: the online `Application(status='draft')` is authoritative, so
        // hydration reads the record the platform stores — not only a projection of
        // it. `draftApplications` is the application *list*, and
        // `ApplicationListSerializer` carries no personal answer beyond
        // `full_name` / `email` / `phone`, so hydrating from a list item alone wrote
        // `''` over the town, NRC/passport, date of birth, sex, country, nationality
        // and both next-of-kin values the platform already held (README §2.2, now
        // traced to that serializer's field list and closed here).
        if (serverApp) {
          serverApp = (await readAuthoritativeDraftRow(
            serverApp as unknown as Record<string, unknown>,
          )) as unknown as ServerDraftShape;
          if (!isCurrent()) return;
        }

        if (draftIntent.mode === "resume" && localDraft) {
          const localApplicationId =
            typeof localDraft.applicationId === "string"
              ? localDraft.applicationId
              : "";
          if (localApplicationId !== draftIntent.draftId) {
            // Resuming a specific draft: a local snapshot for a different
            // application id is not a candidate (it is another draft's cache).
            localDraft = null;
          }
        }

        // R10.3: no local-vs-server timestamp arbitration. The online
        // Application(status='draft') is authoritative; the local snapshot is a
        // recovery cache used only when there is no server draft to hydrate.
        const useLocalDraft = Boolean(localDraft && !serverApp);

        if (useLocalDraft && localDraft) {
          const localApplicationId =
            typeof localDraft.applicationId === "string"
              ? localDraft.applicationId
              : null;

          // Backfill any identity field the local snapshot is missing/blank from
          // the server draft (the authoritative persisted record). A partial
          // local autosave (e.g. saved before profile auto-populate finished)
          // must never strip fields that were already saved server-side.
          if (serverApp) {
            const fd = localDraft.formData;
            const fillFromServer = (key: keyof ServerDraftShape) => {
              const local = fd[key];
              const hasLocal =
                typeof local === "string" ? local.trim() !== "" : local != null;
              const serverVal = serverApp?.[key];
              if (
                !hasLocal &&
                typeof serverVal === "string" &&
                serverVal.trim() !== ""
              ) {
                fd[key] = serverVal;
              }
            };
            (
              [
                "full_name",
                "nrc_number",
                "passport_number",
                "date_of_birth",
                "sex",
                "phone",
                "email",
                "residence_town",
                "country",
                "nationality",
                "next_of_kin_name",
                "next_of_kin_phone",
                "program",
                "intake",
              ] as (keyof ServerDraftShape)[]
            ).forEach(fillFromServer);
          }

          Object.keys(localDraft.formData).forEach((key) => {
            const rawValue = localDraft.formData[key];
            const value =
              key === "date_of_birth"
                ? normalizeDateInputValue(rawValue)
                : key === "sex"
                  ? normalizeSexForWizard(rawValue as string)
                  : key === "residence_town"
                    ? normalizeResidenceTown(String(rawValue ?? ""))
                    : rawValue;
            if (value !== undefined && value !== null && value !== "") {
              setValue(
                key as keyof WizardFormData,
                value as WizardFormData[keyof WizardFormData],
                {
                  shouldValidate: false,
                  // Local-only recovery must be queued to the canonical server
                  // when connectivity returns. Server hydration below stays clean.
                  shouldDirty: true,
                },
              );
            }
          });

          if (localDraft.formData.program) {
            const resolvedProgramId = findProgramId(
              localDraft.formData.program as string,
              undefined,
              programsData?.programs as WizardProgram[] | undefined,
            );
            if (resolvedProgramId) {
              setValue("program", resolvedProgramId, {
                shouldValidate: false,
                shouldDirty: true,
              });
            }
          }

          if (localDraft.formData.intake) {
            setValue("intake", localDraft.formData.intake as string, {
              shouldValidate: false,
              shouldDirty: true,
            });
          }

          if (
            localDraft.selectedGrades &&
            Array.isArray(localDraft.selectedGrades)
          ) {
            const validGrades = localDraft.selectedGrades
              .filter(
                (grade: unknown) =>
                  grade &&
                  typeof grade === "object" &&
                  typeof (grade as Record<string, unknown>).subject_id ===
                    "string" &&
                  (typeof (grade as Record<string, unknown>).grade ===
                    "number" ||
                    typeof (grade as Record<string, unknown>).grade ===
                      "string"),
              )
              .map((grade: unknown) => {
                const g = grade as {
                  subject_id: string;
                  grade: string | number;
                };
                return {
                  subject_id: g.subject_id,
                  grade:
                    typeof g.grade === "string"
                      ? parseInt(g.grade, 10)
                      : g.grade,
                };
              });

            if (validGrades.length > 0) {
              setSelectedGrades(validGrades);
            } else if (localApplicationId) {
              setGradesHydrating(true);
              try {
                // The server's rows are the grades channel's baseline (SJR R6-b).
                machine.setGradesBaseline(
                  projectWizardGrades(await hydrateServerGrades(localApplicationId)).rows,
                );
              } finally {
                setGradesHydrating(false);
              }
              if (!isCurrent()) return;
            }
          } else if (localApplicationId) {
            setGradesHydrating(true);
            try {
              machine.setGradesBaseline(
                projectWizardGrades(await hydrateServerGrades(localApplicationId)).rows,
              );
            } finally {
              setGradesHydrating(false);
            }
            if (!isCurrent()) return;
          }

          // Task 6.3 (R10.2, R10.4): the record's own `(user, application)`
          // address is its identity. A cross-check against "the first stored
          // record" — read from every user's and every application's keys — used
          // to detach this record from its application whenever another draft's
          // record happened to be listed first, turning a resume into a second
          // application start. `getLocalWizardDraft` has already confirmed the
          // application is still this user's draft (a submitted or deleted one is
          // dropped there).

          const serverUploads = localApplicationId
            ? await hydrateServerDocuments(localApplicationId)
            : { result_slip: false, extra_kyc: false };
          if (!isCurrent()) return;
          const mergedLocalUploads = {
            result_slip:
              Boolean(localDraft.uploadedFiles?.result_slip) ||
              Boolean(serverUploads.result_slip),
            extra_kyc:
              Boolean(localDraft.uploadedFiles?.extra_kyc) ||
              Boolean(serverUploads.extra_kyc),
          };
          markUploadedFile("result_slip", mergedLocalUploads.result_slip);
          markUploadedFile("extra_kyc", mergedLocalUploads.extra_kyc);
          restorePaymentStatus(
            serverApp?.payment_status ?? localDraft.paymentStatus ?? null,
          );

          if (localDraft.currentStepKey) {
            const index = wizardSteps.findIndex(
              (step) => step.key === localDraft.currentStepKey,
            );
            if (index >= 0) {
              goToStep(index);
            }
          } else if (typeof localDraft.currentStep === "number") {
            const index = getStepIndexById(localDraft.currentStep);
            goToStep(
              index >= 0
                ? index
                : Math.min(
                    Math.max(localDraft.currentStep - 1, 0),
                    totalSteps - 1,
                  ),
            );
          }

          // No server draft could be read: the outbox record is what the form
          // holds. A record marked `pending` is queued for the server, under the
          // version it was based on; a clean one is not re-sent.
          machine.completeHydration({
            applicationId: localApplicationId,
            serverVersion: positiveDraftVersion(localDraft.serverVersion),
            source: "local",
            pending: localDraft.pending === true,
          });

          draftRestored = true;
          setRestoringDraft(false);
          setDraftLoaded(true);
          showSuccess("Draft restored successfully");
          return;
        } else if (serverApp) {
          const app = serverApp;
          const loadedVersion = positiveDraftVersion(app.version);
          if (loadedVersion === null) {
            throw new Error(
              "This draft did not include a valid server version. Reload and try again.",
            );
          }
          logger.info("[Draft] Restoring from database:", app.id);

          const restored = await restoreServerDraft(
            app as unknown as Record<string, unknown>,
            app.id,
            { isCurrent },
          );
          if (!restored || !isCurrent()) return;
          // The authoritative row is in the form: the machine fixes it as the
          // baseline, so a resume (and every step navigation after it) writes
          // nothing until the student changes an answer. Pending outbox edits
          // made on exactly this version, under this assignment, are replayed
          // onto it; pending edits made on an older version or for another
          // assignment open a conflict (R10.3, R10.4).
          const assignment = draftAssignmentKey(
            app as unknown as Record<string, unknown>,
          );
          machine.completeHydration({
            applicationId: app.id,
            serverVersion: loadedVersion,
            source: "server",
            assignment,
            ...outboxRecoveryFor(app.id, loadedVersion, {
              assignment,
              readable: outboxReadable,
            }),
          });
          draftRestored = true;
          showSuccess("Draft restored successfully");
        }

        if (!draftRestored) {
          // Nothing to restore: this is a new application.
          machine.startNew();
          const stepFromQuery = new URLSearchParams(locationSearch).get("step");
          if (stepFromQuery) {
            const stepIndexFromQuery = wizardSteps.findIndex(
              (step) => step.key === stepFromQuery,
            );
            if (stepIndexFromQuery >= 0) {
              goToStep(stepIndexFromQuery);
            }
          }
        }
      } catch (error) {
        if (!isCurrent()) return;
        logger.error("Error loading draft application:", {
          error: sanitizeForLog(toError(error).message),
        });
        if (draftIntent.mode === "resume") {
          // Keep the machine addressed to the selected draft, and writing
          // nothing: with no trusted version and no hydrated answers, any save
          // could only start a second application or blank real answers.
          machine.failHydration({ applicationId: draftIntent.draftId });
        } else {
          machine.startNew();
        }
        setError(
          draftIntent.mode === "resume"
            ? SELECTED_DRAFT_LOAD_ERROR
            : "We could not restore your draft. Reload and try again.",
        );
      } finally {
        if (isCurrent()) {
          setRestoringDraft(false);
          setDraftLoaded(true);
        }
      }
    };

    if (user && !authLoading && !draftLoaded && !draftApplicationsLoading) {
      loadDraft();
    }
  }, [
    machine,
    user,
    authLoading,
    draftLoaded,
    draftApplicationsLoading,
    setValue,
    draftApplications,
    locationSearch,
    totalSteps,
    findProgramId,
    programsData,
    hydrateServerGrades,
    hydrateServerDocuments,
    markUploadedFile,
    restorePaymentStatus,
    showSuccess,
    setRestoringDraft,
    setDraftLoaded,
    setError,
    setSelectedGrades,
    setGradesHydrating,
    goToStep,
    restoreServerDraft,
    outboxRecoveryFor,
  ]);
}
