# Admissions Canonical Truth Program — Decisions

Captured 2026-05-17. All defaults accepted by the user.

| ID | Decision | Choice | Engineering effect |
|----|----------|--------|---------------------|
| A1 | Withdrawal eligibility | **Frontend matches backend — allow from `submitted`, `under_review`, `waitlisted`, `conditionally_approved`, `approved`** | `apps/admissions/src/pages/student/ApplicationStatus.tsx` and `Dashboard.tsx` expose withdraw action for all 5 statuses |
| A2 | Deferred-payment treatment | **Uniform — deferred is "ready for decision" everywhere**; visibility via dashboard counter | No new queue surface; `paymentRecoveryStore` deferred state preserved |
| A3 | Legacy admin component cleanup | **Aggressive single-pass dead-code scan + removal** | Subagent W4-B runs `ts-prune` and removes orphan components in one PR |
| A4 | Stale DB columns | **90-day deprecation cycle** — write-prevention CI now, drop SQL ready for Day-90 | No production downtime |
| A5 | Feature-flag posture | **Hardcode all 8 hardening flags `True` in `prod.py` + `staging.py`** + startup assertion in `check_production_state` command | Env vars remain rollback lever |
| A6 | Wizard hooks decomposition | **Six sequential PRs** (one hook per concern), each gated by full wizard test pass | `useWizardController.ts` shrinks to ~400 lines composition only |
| A7 | Application-number format | **Keep format `MIHAS{YYYY}{NNNNN}`, switch to PG sequence** | No visible change; eliminates count+attempt race |
| A8 | Multi-intake policy default | **Keep `unrestricted`** | Wave 1 already honors `single_active` when set; default unchanged |
| A9 | Identity-document submission gate | **Require any non-deleted, non-rejected upload** | Closes the active bug; no admin-pre-verify deadlock |
| A10 | Production env state assertion | **Automated `manage.py check_production_state` command run at deploy time** | One-shot pre-flight catches missing flags/secrets |

## Streams unblocked by these decisions

- Stream 1 (Lifecycle): A1
- Stream 2 (Payment): A2
- Stream 3 (Permissions): no blocker
- Stream 4 (DB Schema): A4
- Stream 5 (System Actor): no blocker — ships first
- Stream 6 (Submission Gates): A8, A9
- Stream 7 (Error Codes): no blocker
- Stream 8 (Wizard/UX): A6
- Stream 9 (Backend Decomposition): no blocker
- Stream 10 (Operations): A5, A10
- Wave 4 dead-code scan: A3
