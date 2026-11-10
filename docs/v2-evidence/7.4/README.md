# Task 7.4 — remove admissions generative AI and generated summaries

> Raw evidence artefacts were removed from the tree on 2026-11-09; they remain in git history at commit `f19289a4d1e2`. Paths named below that point at them resolve at https://github.com/cosmasgicter/mihasv3/tree/f19289a4d1e2ad539bc667ab1649356049d7f8e2/docs/v2-evidence.

> ## THIS IS A RETROSPECTIVE EVIDENCE PACK
>
> **Created 2026-08-14**, during task 13.6's remediation batch **L9-L11**
> ([`docs/v2-evidence/13.6/remediation/L9-L11/README.md`](../13.6/remediation/L9-L11/README.md)),
> to close blocking item **B10**.
>
> It records **one run, made on 2026-08-14**, of the instrument task 7.4's
> `_Evidence:` line names, plus a supplementary grep/import probe taken the same
> day. It is **not** a contemporaneous record of Phase 7 and does not claim to be.
>
> Two documents already pointed here as though this directory existed —
> `docs/ai-data-flows.md` lines 14 and 178 — and 13.6 §6.1 recorded that as a
> dangling link. After this pack the links resolve. `docs/audits/ai-and-ocr-final.md`
> exists and is related, but it is a **May-dated audit**, not task 7.4's run
> record, so it is cited rather than repurposed.
>
> What this pack proves is narrow: **the named guard exists and is green today**,
> and the boundary it guards holds today. It does not prove either was true on the
> day 7.4 shipped.

Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` · Phase 7, fourth bullet
Requirements: **R11.1–R11.3, R11.9**
Findings: **STU-06**, **MAINT-02**
`_Evidence:` *grep/import/runtime network guard proving zero admissions AI calls*

---

## 1. The run

| | |
|---|---|
| date | **2026-08-14T05:04Z** |
| commit | `bae29a28d9657f288b3339062adb31285959c966` (the V2 tree is uncommitted — 13.6 §9.3) |
| database | isolated local test Postgres 16 `mihas_localtest` on `127.0.0.1:5433` |
| env | `backend/.env.local.test` via `backend/.localtest-host-env.sh` — **never** `backend/.env` |
| invocation | `python3 -m pytest tests/unit/test_no_admissions_generative_ai_guard.py -v -p no:cacheprovider -p no:randomly -rs`, **serial** |
| result | **18 passed**, 0 failed, 0 skipped, 0 errors, 1.64 s |
| raw | [`raw/01-named-instrument.txt`](raw/01-named-instrument.txt) |

**18 is the same number 13.6 measured** when it ran this instrument as part of its
own audit (13.6 §6.1, [`raw/named-instruments-4.1-7.4.txt`](../13.6/raw/named-instruments-4.1-7.4.txt)).

## 2. The 18, against the descriptor's three words

`_Evidence:` asks for a **grep**, an **import** and a **runtime** guard. The single
instrument carries all three kinds, and one more the descriptor does not name.

| kind | cases |
|---|---|
| **import** | `test_no_admissions_module_imports_a_generative_client`, `test_the_generative_client_has_exactly_one_importer_and_it_is_jobs_ops` |
| **grep / source** | `test_no_admissions_module_reads_a_generative_model_setting`, `test_the_app_split_is_total`, `test_requirements_scopes_the_generative_sdk_to_jobs_ops`, `test_the_admissions_frontend_declares_no_ai_or_browser_ocr_package`, 4 × `test_retired_admissions_ai_module_is_absent[…]` |
| **runtime** | `test_retired_ai_hardening_flag_is_not_defined_on_settings[…]` × 4 and `test_un_namespaced_ai_settings_are_not_defined` (resolved against the **loaded Django settings**, not the source text), and `test_no_retired_generative_route_is_registered` (resolved against the **live URLconf**) |
| **the fourth kind — the one that makes it a boundary and not a deletion** | `test_the_jobs_ops_ai_service_still_exists_and_reads_only_its_own_settings`, `test_server_side_ocr_dependencies_are_retained` |

That last row is the substance of the guard and is worth stating on its own,
because it is what steering means by *"isolation proven by deleting the other
product is not isolation"*: the guard fails **both** if an admissions module
acquires a generative client **and** if the jobs-ops service or the server-side
OCR dependencies disappear. A repository with no AI at all would pass a naive
grep and fail this one.

## 3. The supplementary probe

[`raw/02-grep-import-probe.txt`](raw/02-grep-import-probe.txt) — an independent
grep taken the same day, so the claim does not rest solely on the guard agreeing
with itself:

| probe | result |
|---|---|
| every backend importer of the generative SDK | exactly one: `backend/apps/jobs/ai_service.py:30` |
| the four retired admissions AI modules | all four **absent** |
| retired generative routes in `backend/apps` source | one hit, and it is a **docstring** in `admin_review_workspace_views.py:18` recording the removal — prose, not a registration. The live-URLconf assertion is the guard's `test_no_retired_generative_route_is_registered` |
| un-namespaced `AI_GATEWAY_*` / `AI_MODEL_*` / `AI_HARDENING_*` on the settings modules | **none** |
| jobs-ops namespaced settings | **present** (5), reading the unchanged `AI_GATEWAY_*` / `AI_MODEL_*` **env var** names — so no deployment was re-keyed; only the Django setting names moved |
| frontend AI / browser-OCR packages in `apps/admissions/package.json` | **none declared** |

## 4. The two stale references, now resolved

13.6 §6.1 found `docs/ai-data-flows.md` pointing at a directory that did not
exist:

| file:line | text | before | after |
|---|---|---|---|
| `docs/ai-data-flows.md:14` | *"`docs/audits/ai-and-ocr-final.md` and in `docs/v2-evidence/7.4/` – `7.5/`"* | dangling | resolves |
| `docs/ai-data-flows.md:178` | *"`docs/v2-evidence/7.4/`, `docs/v2-evidence/7.5/`, `docs/v2-evidence/9.4/`"* | dangling | resolves |

Neither line was edited: they were already correct about where the evidence
*should* be, and the fix was to make that true rather than to soften the claim.
Verified in [`../13.6/remediation/L9-L11/raw/07-stale-reference-check.txt`](../13.6/remediation/L9-L11/raw/07-stale-reference-check.txt).

## 5. What this pack does NOT claim

1. **It is not contemporaneous.** See the banner.
2. **It does not close finding STU-06 or MAINT-02.** It records a guard run.
3. **It does not re-audit 7.4's removals beyond what the guard and the probe
   assert.** In particular it makes no claim about what the removed code used to
   do, and it does not re-derive `docs/audits/ai-and-ocr-final.md`'s May findings.
4. **"Zero admissions AI calls" is proven statically and at settings/URLconf
   resolution, not by intercepting sockets in production.** No outbound network
   traffic was observed anywhere: production was not contacted. A static +
   settings + route guard is what the descriptor asks for and what exists; it is
   not a packet capture, and it is not described as one.
5. **The whole tree was not re-run here.** One file. The current whole-tree figure
   belongs to the batch that measured it —
   [`../13.6/remediation/L9-L11/README.md`](../13.6/remediation/L9-L11/README.md) §6.
6. **Nothing was committed**, Neon was not touched, and no source file was changed
   by this pack.

## 6. Why the directory was created by the remediation lane and not by Phase 7

Same reason as [`../4.1/README.md`](../4.1/README.md) §4. 13.6 §6.1 ran this
instrument, found it green, and refused to create this directory on 7.4's behalf,
because *"a directory written by the closure audit on another task's behalf is the
exact shape of GOV-02"* (13.6 §12 item 2). 13.6 §8.1 item **L11** is the correct
route it named: record **this** run, on **this** date, labelled as retrospective.
