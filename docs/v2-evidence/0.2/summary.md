# Task 0.2 Evidence — V2 finding/requirement/task/evidence validator

Date: 2026-07-12
Base commit: `bae29a28d9657f288b3339062adb31285959c966`
Branch: `main`

Working-tree evidence for spec task 0.2
(`.kiro/specs/admissions-v2-canonical-rebuild/tasks.md`). It records the
broader governance validator that enforces R1.3 on top of the task 0.1 spec
metadata validator, its tests (with intentional failing fixtures for each
rule), and its CI wiring. It is not a production release attestation.

Findings addressed: GOV-02 (enforcement mechanism), GOV-03 (reused via
delegation), GOV-05 (evidence-linkage enforcement). Requirement: R1.2–R1.5.

## Traced state before editing (source-code-context)

- Task 0.1 shipped a deliberately narrow metadata validator
  `scripts/validate_spec_metadata.py` that only checks unique live spec IDs and
  valid `.config.kiro` JSON, and its tests
  `scripts/tests/test_validate_spec_metadata.py`. The 0.1 evidence explicitly
  deferred the broader validator and its CI wiring to task 0.2.
- `docs/canonical-truth-map.md` already states: "The broader
  finding/requirement/task/evidence validator (spec task 0.2) is separate and
  layers on top of this metadata check." No edit to that file was needed.
- The working tree carries unrelated user-owned edits to
  `.github/workflows/ci.yml` (an added informational Impeccable design-quality
  scan step in the `admissions` job). Task 0.2 must not disturb those edits.
- The V2 spec files were read in full: `requirements.md` (R1.3 rule text and the
  per-requirement `_Findings:` ownership lines), `tasks.md` (checkbox state and
  `_Requirements:`/`_Findings:`/`_Evidence:` annotations), `findings.md` (the 70
  finding IDs), `.config.kiro` (`status: planned`), and `design.md` (§2 skill
  order, §16 evidence architecture).

## What R1.3 requires

The spec validator SHALL fail when:

1. a required task is checked without Required_Evidence;
2. a requirement is not referenced by a task;
3. a finding has no owner requirement;
4. a live spec ID is duplicated;
5. a completed spec has unchecked required tasks.

Required_Evidence (glossary): executable/schema/screenshot/operational proof
**linked** from a task; a checklist mark is not evidence. The execution rules
require it under `docs/v2-evidence/<task-id>/`.

## Changes made

1. Governance validator — `scripts/validate_spec_governance.py` (stdlib only).
   Parses `.config.kiro`, `requirements.md`, `tasks.md`, `findings.md`, checkbox
   state, and `_Evidence:` links, and enforces all five R1.3 rules:
   - **Rule 1 (missing-evidence):** a task checked `[x]` must carry a non-empty
     `_Evidence:` descriptor **and** a non-empty `docs/v2-evidence/<task-id>/`
     directory. In-progress `[-]` and not-started `[~]` tasks are not complete
     and need no evidence.
   - **Rule 2 (unreferenced-requirement):** every top-level requirement
     (`### Rn.`) must be referenced by some task's `_Requirements:` line
     (sub-criterion refs like `R1.2-R1.5` count as `R1`).
   - **Rule 3 (unowned-finding):** every finding ID defined in `findings.md`
     must appear in at least one requirement's `_Findings:` ownership line.
   - **Rule 4 (duplicate/invalid metadata):** delegated to
     `validate_spec_metadata.validate()` so the duplicate-live-spec-ID and
     invalid-JSON logic has a single source of truth (layers on top of 0.1).
   - **Rule 5 (false-completed):** a spec whose `.config.kiro` `status` is
     `completed` must have no unchecked required tasks.
   Supplementary non-blocking warnings flag a task that references an undefined
   requirement or finding (typo signal). CLI: `--spec`, `--specs-root`,
   `--evidence-root`, `--all-specs`, `--json`, `--strict`; exit 0/1/2.

2. Validator tests — `scripts/tests/test_validate_spec_governance.py` (stdlib
   unittest, also pytest-runnable). 20 cases building **synthetic spec fixtures**
   in a temp dir, with an **intentional failing fixture for each of the five
   rules** plus clean-pass counterparts, CLI exit-code checks (0 and 2), parser
   robustness (trailing-period task IDs, trailing-underscore finding IDs,
   range/`_`-terminated requirement tokens), and real-repo regression guards
   (the V2 spec passes all rules; the known falsely-completed spec is detected in
   `--all-specs`). The rule tests never skip and are not environment-gated (R1.4).

3. CI wiring — `.github/workflows/spec-governance.yml` (new, dedicated file).
   Runs on push/PR touching specs, the validators, their tests, or evidence. It
   runs the validator self-tests (proving the rules fail on violations), then the
   blocking task 0.1 and task 0.2 validators, then a non-blocking repo-wide
   `--all-specs` audit. It is a **separate workflow on purpose** so it adds the
   gate "without modifying unrelated user-owned workflow changes" — it does not
   touch the pending `ci.yml` edits.

## Parser corrections found while self-verifying

- Finding IDs and requirement tokens that are the **last token on a
  `_Findings:`/`_Requirements:` line** are immediately followed by the markdown
  italic `_`. A plain `\b` word boundary fails there (both `5` and `_` are word
  characters), which first produced false `unowned-finding` errors for `GOV-05`
  and `MAINT-01`. Fixed with explicit boundaries that treat `_` as a terminator.
- Task numbering differs across specs: the V2 spec uses `0.1 Title` while
  `full-platform-remediation-2026-07` uses `1.1. Title` (trailing period). The
  task regex now tolerates both, so the completed-status rule sees that spec's
  52 tasks and correctly flags it in `--all-specs`.

## Verification run

- `python3 scripts/validate_spec_governance.py` → `RESULT: PASS`, 0 errors,
  0 warnings, exit 0 (V2 spec: 18 requirements, 70 findings, 73 tasks, 2 checked
  with linked evidence). Capture: `validator-output.txt` / `validator-output.json`.
- `python3 scripts/tests/test_validate_spec_governance.py` → `Ran 20 tests … OK`.
- `python3 scripts/tests/test_validate_spec_metadata.py` → `Ran 9 tests … OK`.
- `python3 scripts/validate_spec_metadata.py` → exit 0 (unchanged, still green).
- `python3 scripts/validate_spec_governance.py --all-specs` → exit 2,
  informational: 172 errors across pre-existing unrelated specs, including the
  GOV-02 false-completed detection for `full-platform-remediation-2026-07`
  (26 of 52 required tasks unchecked while `status=completed`). Capture:
  `all-specs-audit.txt`.

## CI wiring approach

The blocking gate targets the active admissions authority spec
(`admissions-v2-canonical-rebuild`), which passes all five rules today, plus the
repo-wide duplicate-ID check. The repo-wide `--all-specs` completed-status /
evidence audit runs **non-blocking** so it surfaces pre-existing GOV-02 debt in
unrelated specs without turning CI red on work task 0.2 does not own. Once those
specs are reconciled, the audit step can be promoted to blocking.

## Deliberate boundaries

- `.github/workflows/ci.yml` was **not** modified; the user's pending Impeccable
  step there is intact (verified `git diff --stat`: still only the user's +18).
- No unrelated spec's `.config.kiro`, `tasks.md`, or status was changed; the
  falsely-completed `full-platform-remediation-2026-07` is reported, not fixed
  (its remediation is out of task 0.2's scope).
- `docs/canonical-truth-map.md` was left untouched (it already describes this
  validator and it carries unrelated user edits).
- No third-party dependencies were added; both validators are stdlib-only.

## Changed / added files (SHA-256 after edit)

| File | Change | SHA-256 |
|---|---|---|
| `scripts/validate_spec_governance.py` | new governance validator | `ac9cd99bb1012a906136360a73d88bb1de1ccfd78e847a6e99a039659a7a015b` |
| `scripts/tests/test_validate_spec_governance.py` | new tests (intentional failing fixtures) | `c74c9b89643dd9bd993f73984cda4a9a22317835489719ffda4a2e518cfb79f7` |
| `.github/workflows/spec-governance.yml` | new dedicated CI workflow | `4aa642bc45a41b79b5522ddec729313af4040eff85414dbb80d34ad56e7dc647` |
