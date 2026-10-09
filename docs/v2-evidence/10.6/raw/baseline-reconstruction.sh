#!/usr/bin/env bash
# How task 10.6's backend baseline was produced.
#
# The worktree carries the WHOLE admissions-v2 spec uncommitted, so `git stash`
# cannot separate this task's edits from other lanes' work on the same shared
# files (`urls.py`, `_view_helpers.py`, `student_views.py`,
# `admin_amendment_views.py` and `test_view_auth_classification.py` are all
# shared). What CAN be separated is that 10.6's backend footprint is unusually
# small and entirely mechanical:
#
#   1. a REMOVAL: `EmailSlipView`, the `<id>/email-slip/` route, and the two
#      `EmailSlip*` serializers;
#   2. a DELEGATION: `ApplicationConditionVerifyView` stopped deciding and now
#      normalises + calls `condition_evidence_service.review_condition`;
#   3. three test files: two new (`test_condition_front_doors_10_6.py`,
#      `test_email_slip_route_removed_10_6.py`) and three moved onto the new truth
#      (`test_bug5_email_slip.py`, `test_view_auth_classification.py`,
#      `test_production_readiness_views.py`).
#
# So the baseline is the same selection with (a) this task's own new test files
# dropped and (b) the shared classification file restored to HEAD — i.e. the state
# the lane was in when task 10.5's evidence was captured on this same tree.
#
# This is a RECONSTRUCTION, not a checkout, and it is stated as such.
#
# Run from backend/ with the isolated local Postgres/Redis.
set -uo pipefail

E="../docs/v2-evidence/10.6/raw"
CLS="tests/unit/test_view_auth_classification.py"

cp "$CLS" /tmp/106-cls-candidate.py
git show "HEAD:backend/$CLS" > "$CLS"

grep -v -e 'test_condition_front_doors_10_6.py' \
        -e 'test_email_slip_route_removed_10_6.py' \
        "$E/selection.txt" > /tmp/106-baseline-selection.txt

.venv/bin/python3 -m pytest $(cat /tmp/106-baseline-selection.txt) \
  -q --tb=no -rfE -p no:randomly > "$E/baseline.txt" 2>&1

grep -E '^(FAILED|ERROR) ' "$E/baseline.txt" \
  | sed -E 's/^(FAILED|ERROR) //' | sort > "$E/baseline-failing-set.txt"

cp /tmp/106-cls-candidate.py "$CLS"

echo "baseline failing set:"
cat "$E/baseline-failing-set.txt"
echo
echo "new failures introduced by 10.6 (comm -13, must be empty):"
comm -13 "$E/baseline-failing-set.txt" "$E/candidate-failing-set.txt"
echo "failures 10.6 fixed (comm -23):"
comm -23 "$E/baseline-failing-set.txt" "$E/candidate-failing-set.txt"
