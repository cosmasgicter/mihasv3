#!/usr/bin/env bash
# Disk-usage threshold gate for the production deploy workflow (R1.3 / R1.4).
#
# This logic is intentionally extracted into a standalone, sourceable helper so
# it can be unit/property-tested independently of the SSH deploy step
# (see backend/tests/property/test_perf_deploy_gate.py). The deploy workflow in
# .github/workflows/deploy.yml scp's this file to the box and `source`s it, so
# the gate the tests exercise is the exact gate that runs in production.
#
# Contract:
#   - The threshold defaults to 85 and is clamped to the inclusive range 50..95.
#   - A non-integer / empty threshold falls back to the default (85).
#   - The gate FAILS (returns non-zero) when integer disk usage >= threshold,
#     emitting an error that names the measured usage, the threshold, and the
#     step. It SUCCEEDS (returns 0) when usage < threshold.
#   - A non-integer / empty usage value is a hard failure (cannot gate safely).
#
# Usage (CLI):   disk_gate.sh <usage_pct> [threshold] [step_name]
# Usage (lib):   source disk_gate.sh; disk_gate "$USAGE" "$THRESHOLD" "step"
set -euo pipefail

# Clamp a threshold to the inclusive range 50..95. Non-integer/empty -> 85.
clamp_threshold() {
  local t="${1:-85}"
  if ! [[ "$t" =~ ^[0-9]+$ ]]; then
    t=85
  fi
  if (( t < 50 )); then
    t=50
  elif (( t > 95 )); then
    t=95
  fi
  printf '%s' "$t"
}

# Gate the deploy on disk usage. Returns 0 to proceed, 1 to halt.
#   $1 = measured integer disk usage percent (0..100)
#   $2 = configured threshold (optional; default 85, clamped to 50..95)
#   $3 = step name used in log/error messages (optional)
disk_gate() {
  local usage="${1-}"
  local threshold step
  threshold="$(clamp_threshold "${2:-85}")"
  step="${3:-disk-usage-gate}"

  if ! [[ "$usage" =~ ^[0-9]+$ ]]; then
    echo "ERROR [${step}]: could not parse disk usage value '${usage}' as an integer percent" >&2
    return 1
  fi

  if (( usage >= threshold )); then
    echo "ERROR [${step}]: disk usage ${usage}% is at or above the configured threshold ${threshold}% — halting deploy" >&2
    return 1
  fi

  echo "[${step}] disk usage ${usage}% is below the configured threshold ${threshold}% — proceeding"
  return 0
}

# When executed directly (not sourced), run the gate against the CLI args so the
# property test can invoke `bash deploy/disk_gate.sh <usage> <threshold> <step>`.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  disk_gate "$@"
fi
