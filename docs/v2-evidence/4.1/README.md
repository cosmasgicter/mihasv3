# Task 4.1 — durable resumable tenant onboarding

> ## THIS IS A RETROSPECTIVE EVIDENCE PACK
>
> **Created 2026-08-14**, during task 13.6's remediation batch **L9-L11**
> ([`docs/v2-evidence/13.6/remediation/L9-L11/README.md`](../13.6/remediation/L9-L11/README.md)),
> to close blocking item **B10**.
>
> It records **one run, made on 2026-08-14**, of the instruments task 4.1's
> `_Evidence:` line names. It is **not** a contemporaneous record of Phase 4, and
> it does not claim to be one. Nobody watched these tests pass on the day 4.1 was
> implemented — or if they did, they left no artifact, which is exactly the gap
> the spec validator has been reporting ever since (first flagged by another task
> at [`docs/v2-evidence/7.2/README.md`](../7.2/README.md) line 244:
> *"task **4.1** is checked with no `docs/v2-evidence/4.1`"*).
>
> What this pack therefore proves is narrow and worth stating precisely: **the
> named instruments exist and are green today.** It does not prove they were
> green in Phase 4, and it is not a substitute for having recorded them then.

Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` · Phase 4, first bullet
Requirements: **R4.1–R4.6**
Findings: **TEN-01**, **TEN-02**
`_Evidence:` *service/integration tests for every state, retry, and compensation*

---

## 1. The run

| | |
|---|---|
| date | **2026-08-14T05:03Z** |
| commit | `bae29a28d9657f288b3339062adb31285959c966` (the V2 tree is uncommitted — 13.6 §9.3) |
| database | isolated local test Postgres 16 `mihas_localtest` on `127.0.0.1:5433` |
| broker | local Redis on `127.0.0.1:6380` |
| env | `backend/.env.local.test` via `backend/.localtest-host-env.sh` — **never** `backend/.env`, so the Neon DSN cannot reach a test run |
| invocation | `python3 -m pytest <3 files> -v -p no:cacheprovider -p no:randomly -rs`, **serial** |
| result | **46 passed**, 0 failed, 0 skipped, 0 errors, 23 warnings, 5.80 s |
| raw | [`raw/01-named-instruments.txt`](raw/01-named-instruments.txt) |

The three files are the ones the `_Evidence:` line points at, identified by
13.6 §6.1 ([`raw/named-instruments-4.1-7.4.txt`](../13.6/raw/named-instruments-4.1-7.4.txt)):

| file | cases |
|---|---:|
| `backend/tests/unit/test_tenant_onboarding_service.py` | 23 |
| `backend/tests/integration/test_tenant_onboarding_workflow.py` | 22 |
| `backend/tests/unit/test_scenario_super_admin_onboarding.py` | 1 |
| | **46** |

**46 is the same number 13.6 measured** when it ran these instruments as part of
its own audit (13.6 §6.1). Two independent runs, same count, same outcome. That
is the strongest thing this pack can honestly say.

## 2. What the 46 cover, against the descriptor's three words

The `_Evidence:` line asks for "every **state**, **retry**, and **compensation**".
Read against the run, each word has cases behind it:

### state — the onboarding state machine and its lifecycle commands

`draft → in_review → active`, plus `reject`, `cancel`, `suspend`, `resume`, and
the assertion that terminal states have no outbound edges:

```
TestOnboardingStateMachine::test_allowed_transitions
TestOnboardingStateMachine::test_rejected_transitions
TestOnboardingStateMachine::test_terminal_states_have_no_targets
TestLifecycle::test_submit_for_review | test_reject_from_in_review
              | test_reject_from_draft_is_invalid | test_cancel_from_draft
              | test_suspend_and_resume
TestLifecycleApi::test_submit_then_activate_from_in_review | test_reject_from_in_review
                | test_reject_from_draft_is_invalid_state | test_cancel_from_draft
                | test_suspend_then_resume
```

The task's own third bullet — *"never mark an institution active on create"* — is
pinned twice, once positively and once against a hostile payload:

```
TestBegin::test_begin_creates_inactive_institution_and_draft_workflow
TestBegin::test_begin_forces_inactive_even_when_payload_requests_active
```

### retry — replay is idempotent, not duplicating

Five cases, at both the service and the API layer, including the one that matters
most for a resumable wizard: a **replayed step must not bump the version**.

```
TestBegin::test_begin_is_idempotent_on_replay
TestRecordStep::test_record_step_is_idempotent_on_identical_replay
TestActivate::test_activate_is_idempotent_when_already_active
TestBeginApi::test_begin_is_idempotent_on_replay
TestConfigureApi::test_record_step_idempotent_replay_does_not_bump
TestActivateApi::test_activate_idempotent_when_already_active
```

### compensation — a failed create leaves no orphan authority

This is finding **TEN-01**'s core claim ("compensation leaves no orphan
authority"), and it is asserted at both layers:

```
TestBegin::test_begin_compensates_leaving_no_orphan_on_duplicate_code
TestBeginApi::test_begin_duplicate_code_compensates_no_orphan
```

### and the two things the descriptor does not name but the task bullet does

- **blocker query + audit/outbox** — `TestBlockers::test_get_blockers_lists_missing_blocking_items`,
  `test_get_blockers_empty_when_launch_ready`, `TestBegin::test_begin_emits_audit_and_outbox`,
  `TestActivateApi::test_activate_succeeds_when_launch_ready_and_audits`,
  `TestConfigureApi::test_blockers_endpoint_reports_live_readiness`,
  `test_detail_returns_readiness_aggregate`, and the activation gate
  (`test_activate_blocked_when_readiness_incomplete` / `test_activate_blocked_when_not_ready`).
- **authority** — 5 cases in `TestListAndAuthority`, including
  `test_bare_admin_without_membership_forbidden`, which is the
  `.kiro/steering/enterprise-tenancy.md` rule that a bare `admin` role string
  grants zero authority, and `test_detail_unknown_id_is_not_found`, the
  non-revealing 404.

## 3. What this pack does NOT claim

1. **It is not contemporaneous.** See the banner. It is one run on 2026-08-14.
2. **It does not close findings TEN-01 or TEN-02.** Those are register findings
   whose closure is argued elsewhere; this pack records a test run, not a
   behavioural closure argument.
3. **It does not re-audit task 4.1's implementation.** No source file was read
   for correctness here and no code was changed. The instruments were run as
   they stand.
4. **It says nothing about tasks 4.2–4.6**, which have their own evidence
   directories.
5. **The whole tree was not re-run here.** These are the three named files only.
   The current whole-tree figure belongs to the batch that measured it —
   [`../13.6/remediation/L9-L11/README.md`](../13.6/remediation/L9-L11/README.md) §6.
6. **Production was not contacted**, Neon was not touched, and nothing was
   committed.

## 4. Why the directory was created by the remediation lane and not by Phase 4

13.6 §6.1 ran these same instruments, found them green, and then deliberately
**did not** create this directory:

> *"the 46 and 18 passes above are 13.6's audit record, in 13.6's own directory,
> not a retroactive evidence pack authored on another task's behalf. Fabricating
> one would be the precise failure GOV-02 describes."*

13.6 §12 item 2 then named the correct route — *"have those two lanes record their
own runs"* — and §8.1 item **L11** scheduled it. This pack is that item, executed
with the distinction 13.6 drew kept intact: it records **its own run, on its own
date, labelled as such**, rather than narrating Phase 4 in the past tense.
