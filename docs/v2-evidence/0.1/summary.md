# Task 0.1 Evidence — Register the active admissions V2 authority

Date: 2026-07-12
Base commit: `bae29a28d9657f288b3339062adb31285959c966`
Branch: `main`

This is working-tree evidence for spec task 0.1
(`.kiro/specs/admissions-v2-canonical-rebuild/tasks.md`). It records the
governance edits that make the V2 spec the active admissions authority, fix the
duplicate live spec ID, and add a spec metadata validator. It is not a
production release attestation.

Findings closed: GOV-01, GOV-02 (boundary only), GOV-03. Requirement: R1
(R1.1, and the "a live spec ID is duplicated" clause of R1.3).

## Traced state before editing (source-code-context)

- `docs/canonical-truth-map.md` "Active Alignment Spec" section named
  `.kiro/specs/canonical-multi-tenant-alignment/` as the active authority, but
  that spec lives under `.kiro/specs/_archived/canonical-multi-tenant-alignment/`
  (confirmed by directory listing). This is GOV-01.
- Two live specs shared one spec ID `8c3a1e06-83ec-4d86-bea1-a8a53e7ec222`:
  `admin-dashboard-overhaul` and `communications-history`. A repo-wide search
  showed that UUID is referenced nowhere except those two `.config.kiro` files,
  so reassigning one has no external blast radius. This is GOV-03.
- `full-platform-remediation-2026-07/.config.kiro` carries
  `"status": "completed"`. Task 0.1 must not disturb other specs' status; the
  "completed-with-unchecked-tasks" enforcement (GOV-02) is owned by the task 0.2
  finding/requirement/task/evidence validator, not this metadata validator.
- No pre-existing spec metadata validator existed. The only `spec_validator.py`
  in the tree (`.kiro/skills/spec-driven-workflow/scripts/`) scores a single
  spec markdown's sections; it does not inspect `.config.kiro` metadata or
  detect duplicate IDs.

## Changes made

1. Canonical truth map — `docs/canonical-truth-map.md`, "Active Alignment Spec":
   points at `.kiro/specs/admissions-v2-canonical-rebuild/` as the active
   admissions authority; keeps `canonical-multi-tenant-alignment` and other
   earlier specs as historical inputs; states the supersession boundary is
   admissions-only and authority-only; states that registering V2 neither marks
   any other spec complete nor archives it; and documents the new metadata
   validator and its relationship to the separate task 0.2 validator.

2. Duplicate live spec ID fix — `.kiro/specs/communications-history/.config.kiro`:
   reassigned `specId` from `8c3a1e06-83ec-4d86-bea1-a8a53e7ec222` to the fresh
   `1a48f276-e3fe-4fb9-9b0c-496404ffe6b8`. `admin-dashboard-overhaul` keeps the
   original ID. Rationale: original authorship is indeterminate, the ID is
   referenced nowhere else, and reassigning exactly one of the two is the minimal
   change that restores uniqueness. Only the `specId` value changed; workflow and
   spec-type fields are untouched.

3. Metadata validator — `scripts/validate_spec_metadata.py` (stdlib only):
   scans every live spec (`.kiro/specs/*/`, excluding `_archived/`), and fails
   (exit 2) on a duplicated live spec ID or invalid `.config.kiro` JSON. Missing
   config or missing ID are informational warnings (exit 0 unless `--strict`), so
   the two pre-existing metadata gaps are surfaced without destabilizing specs
   this task is required to leave intact. Supports `--json`, `--strict`, and
   `--specs-root`.

4. Validator tests — `scripts/tests/test_validate_spec_metadata.py`: nine cases
   including the intentional failing fixture (duplicate IDs -> error + exit 2),
   invalid-JSON detection, archived-dir exclusion, warning-not-error for metadata
   gaps, and a real-repo regression guard asserting the live specs have no
   duplicate IDs and the V2 spec is registered.

## Changed / added files (SHA-256 after edit)

| File | Change | SHA-256 |
|---|---|---|
| `.kiro/specs/communications-history/.config.kiro` | specId reassigned | `a69479440ec3827562a71af0788ebfbd4895d55e87e4fc6689ca06bbe780a174` |
| `.kiro/specs/admin-dashboard-overhaul/.config.kiro` | unchanged (keeps original ID) | `721bff7154b9207da6a530d60676446973e8f303145b5628c4734d70e488f0aa` |
| `docs/canonical-truth-map.md` | Active Alignment Spec section | `3c63d35c8b257e49066e4c24dbd3f3d910684345341c3050a69b6ecbbf963d5a` |
| `scripts/validate_spec_metadata.py` | new validator | `a88c1c0172523ed22251da40407d94a004c9de40b9fd9c43b16dab86d241e426` |
| `scripts/tests/test_validate_spec_metadata.py` | new tests | `4fca1233543be0e160ce307f002c3e08ee5cba70ae0cd8d545437c3e3ef98201` |

## Verification run

- `python3 scripts/validate_spec_metadata.py` -> `RESULT: PASS`, 0 errors,
  2 informational warnings, exit 0. Full capture in `validator-output.txt` /
  `validator-output.json`.
- `python3 -m pytest scripts/tests/test_validate_spec_metadata.py -q` ->
  `9 passed`, exit 0.

## Deliberate boundaries

- No other spec's `.config.kiro` status was changed; nothing was archived.
- `student-payment-interview-pages` (no `.config.kiro`) and
  `student-ui-ux-mobile-remediation` (alternate schema, no `specId`) are reported
  as warnings only and left untouched — fixing their metadata is out of this
  task's scope.
- CI wiring of the validator is intentionally deferred. Task 0.2 owns adding the
  spec governance validator to CI "without modifying unrelated user-owned
  workflow changes until they are reconciled," and the working tree already
  carries unrelated `.github/workflows/ci.yml` edits from other tasks that must
  not be disturbed here.
- Unrelated working-tree changes from other tasks (version sources, runbooks,
  bundle predicate, CI) were not modified.
