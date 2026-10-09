#!/usr/bin/env bash
# ============================================================================
# Task 13.5 - CANARY POST-DEPLOY SMOKE, READ-ONLY
# ============================================================================
# Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 13.5
# Requirements: R17, R18.5-R18.7
#
# WHAT THIS IS
# The post-deploy proof, as one command instead of an investigation. It runs in
# two modes because the two halves reach production from different places:
#
#   ./post-deploy-smoke.sh http     off the box - external HTTPS probes only
#   ./post-deploy-smoke.sh on-box   ON the EC2 box, from ~/mihas - container
#                                   health, the boot gate, the manifest, and the
#                                   four read-only SQL gate files
#   ./post-deploy-smoke.sh plan     print what each mode would run, run nothing
#
# EVERY COMMAND IN BOTH MODES IS READ-ONLY.
#   * no docker compose up / down / restart / pull
#   * no apply_sql_migrations without --dry-run
#   * no INSERT / UPDATE / DELETE / DDL - every psql session is pinned
#     default_transaction_read_only = on
#   * no secret is echoed: DSNs and passwords stay inside the container env
#
# It is safe to run at any time, before or after a deploy, as many times as you
# like. It never repairs anything: a failure is reported and the operator
# decides. Exit 0 = every check passed, 1 = at least one FAIL.
#
# WHAT IT DELIBERATELY DOES NOT DO
# It does not deploy, does not migrate, does not sign anything off, and does
# not decide to broaden activation. Those are the operator's, and the
# attestation template is sign-off.md.
# ============================================================================
set -uo pipefail

MODE="${1:-plan}"

# --- configuration (override by environment) --------------------------------
APP_URL="${APP_URL:-https://apply.beanola.com}"
API_URL="${API_URL:-https://api.beanola.com}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE="docker compose -f ${COMPOSE_FILE}"
# Where the four read-only SQL gate files live once copied to the box.
SQL_DIR="${SQL_DIR:-$HOME/mihas/v2-gates}"
# The release fingerprint 13.4 established (89 tables, 44 migrations).
EXPECTED_FINGERPRINT="${EXPECTED_FINGERPRINT:-19c5216bb175de41}"
WINDOW="${WINDOW:-1 hour}"

PASS=0
FAIL=0
SKIP=0

c_pass() { printf 'PASS  %s\n' "$*"; PASS=$((PASS + 1)); }
c_fail() { printf 'FAIL  %s\n' "$*"; FAIL=$((FAIL + 1)); }
c_skip() { printf 'SKIP  %s\n' "$*"; SKIP=$((SKIP + 1)); }
c_info() { printf '      %s\n' "$*"; }
section() { printf '\n=== %s ===\n' "$*"; }

# ============================================================================
# MODE: http - external probes, run from anywhere with internet
# ============================================================================
mode_http() {
  section "1. Health endpoints (expect 200; /health/ready/ covers DB + Redis)"
  for path in /health/live/ /health/ready/ /health/redis/; do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "${API_URL}${path}" || echo 000)"
    if [ "$code" = "200" ]; then c_pass "GET ${path} -> 200"
    else c_fail "GET ${path} -> ${code} (expected 200)"; fi
  done

  section "2. Frontend shell + envelope contract"
  code="$(curl -sS -o /tmp/canary-shell.$$ -w '%{http_code}' --max-time 20 "${APP_URL}/" || echo 000)"
  if [ "$code" = "200" ] && grep -qi '<html' /tmp/canary-shell.$$; then
    c_pass "GET ${APP_URL}/ -> 200 and serves an HTML shell"
  else
    c_fail "GET ${APP_URL}/ -> ${code} / no HTML shell"
  fi
  rm -f /tmp/canary-shell.$$
  for path in /api/v1/auth/session/ /api/v1/catalog/programs/; do
    body="$(curl -sS --max-time 20 "${API_URL}${path}" || true)"
    case "$body" in
      *'"success"'*) c_pass "GET ${path} returns the {\"success\":...} envelope" ;;
      *) c_fail "GET ${path} did not return the success envelope" ;;
    esac
  done

  section "3. Tenant resolution (signal 7 - tenant cache/domain)"
  # On the shared portal this MUST resolve to the neutral Beanola context and
  # must NOT name a legacy school. A tenant brand here on a neutral host is a
  # fail-closed regression (enterprise-tenancy.md: neutral fallback only).
  body="$(curl -sS --max-time 20 "${API_URL}/api/v1/catalog/context/" || true)"
  if [ -z "$body" ]; then
    c_fail "GET /api/v1/catalog/context/ returned nothing"
  else
    c_info "context: $(printf '%s' "$body" | head -c 300)"
    case "$body" in
      *MIHAS*|*KATC*)
        c_fail "the neutral host resolved a LEGACY TENANT brand (must be Beanola)" ;;
      *) c_pass "the neutral host did not resolve a legacy tenant brand" ;;
    esac
  fi

  section "4. Auth + CSRF are intact (unauthenticated state change must be refused)"
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 \
      -X POST -H 'Content-Type: application/json' -d '{}' \
      "${API_URL}/api/v1/payments/mobile-money/" || echo 000)"
  case "$code" in
    4*) c_pass "unauthenticated POST /payments/mobile-money/ refused with ${code}" ;;
    *)  c_fail "unauthenticated POST /payments/mobile-money/ returned ${code} (expected 4xx)" ;;
  esac

  section "5. Public tracking rejects a well-formed unknown code with 404"
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 \
      "${API_URL}/api/v1/applications/track/?code=TRK-AAAAAAAAAAAA" || echo 000)"
  if [ "$code" = "404" ]; then c_pass "tracking negative case -> 404"
  else c_fail "tracking negative case -> ${code} (expected 404)"; fi

  section "6. The repo's own smoke scripts (run these too, they are authoritative)"
  c_info "APP_URL=${APP_URL} API_URL=${API_URL} ./scripts/smoke-production.sh"
  c_info "python3 scripts/launch-verification/run-smoke-gate.py \\"
  c_info "    --frontend-url ${APP_URL} --backend-url ${API_URL}"
  c_info "(this script does not invoke them, so its own result stays attributable)"
}

# ============================================================================
# MODE: on-box - read-only checks that need to be inside the compose project
# Run from ~/mihas on the EC2 box.
# ============================================================================
mode_on_box() {
  if [ ! -f "$COMPOSE_FILE" ]; then
    c_fail "no ${COMPOSE_FILE} in $(pwd) - run this from ~/mihas on the box"
    return
  fi

  section "1. Container health (all six up, no restart loop)"
  ps_out="$(${COMPOSE} ps 2>&1)"
  printf '%s\n' "$ps_out"
  for svc in caddy web beat celery redis postgres; do
    if printf '%s' "$ps_out" | grep -q "$svc"; then c_pass "service present: ${svc}"
    else c_fail "service missing from compose ps: ${svc}"; fi
  done
  if printf '%s' "$ps_out" | grep -qi 'restarting'; then
    c_fail "at least one container is restarting - read its log before anything else"
  else
    c_pass "no container is in a restart loop"
  fi

  section "2. Signal 2 - schema drift: the boot gate, re-run by hand"
  # This is the same gate the container CMD runs before uvicorn. Running it
  # again is read-only and proves the running image agrees with the database.
  if ${COMPOSE} exec -T web python manage.py check_schema_drift --no-color; then
    c_pass "check_schema_drift exit 0 - no missing column on any managed=False model"
  else
    c_fail "check_schema_drift FAILED - do not broaden activation; read the output above"
  fi

  section "3. Signal 2 - nothing is unexpectedly pending (DRY RUN ONLY)"
  # --dry-run applies nothing. NOTE (13.4 §8.3): its final line reads
  # "Applied N migration(s) successfully." even though it applied none. Read
  # the per-file list above that line, not the summary.
  ${COMPOSE} exec -T web python manage.py apply_sql_migrations --dry-run --no-color \
    && c_pass "migration dry-run completed (read the FILE LIST, not the summary line)" \
    || c_fail "migration dry-run errored"

  section "4. Signal 2 - the release fingerprint matches 13.4's"
  if ${COMPOSE} exec -T web python manage.py schema_manifest \
        --emit /tmp/canary-manifest.json --label canary --no-color; then
    fp="$(${COMPOSE} exec -T web python -c \
      "import json;m=json.load(open('/tmp/canary-manifest.json'));print(m.get('fingerprint','')or m.get('schema_fingerprint',''))" \
      2>/dev/null | tr -d '\r' | tail -1)"
    c_info "canary fingerprint : ${fp:-<not found in manifest>}"
    c_info "13.4 release value : ${EXPECTED_FINGERPRINT}... (89 tables, 44 migrations)"
    case "$fp" in
      "${EXPECTED_FINGERPRINT}"*) c_pass "fingerprint matches the 13.4 release value" ;;
      "") c_skip "could not read a fingerprint from the manifest - compare by hand" ;;
      *) c_fail "fingerprint DIFFERS from 13.4's - 13.4 C3 proved a converged sweep reproduces it exactly, so a difference is real" ;;
    esac
    ${COMPOSE} exec -T web python manage.py schema_manifest \
      --verify /tmp/canary-manifest.json --no-color \
      && c_pass "schema_manifest --verify returned ok (0 NOT VALID FKs)" \
      || c_fail "schema_manifest --verify reported violations"
  else
    c_fail "schema_manifest --emit failed"
  fi

  section "5. Signal 2 - the width-drift class the boot gate documents as out of scope"
  if [ -f "${SQL_DIR}/width-drift-probe.py" ]; then
    ${COMPOSE} exec -T web python /tmp/width-drift-probe.py 2>/dev/null \
      && c_pass "no column is narrower than the model declares" \
      || c_fail "a NARROWER column exists - every write past its ceiling is an HTTP 500 (see gate 20)"
    c_info "if the probe is not inside the container, copy it first:"
    c_info "  docker cp ${SQL_DIR}/width-drift-probe.py \$(${COMPOSE} ps -q web):/tmp/"
  else
    c_skip "width-drift-probe.py not in ${SQL_DIR} - preflight.sql gate 20 covers the three known columns"
  fi

  section "6. Signals 1,3,4,5,6,7,8,9 - the four read-only SQL gate files"
  if [ ! -d "$SQL_DIR" ]; then
    c_skip "no ${SQL_DIR} - copy the gate files up first:"
    c_info "  ssh <box> 'mkdir -p ~/mihas/v2-gates'"
    c_info "  scp docs/v2-evidence/13.2/invariants.sql \\"
    c_info "      docs/v2-evidence/13.4/invariants.sql \\"
    c_info "      docs/v2-evidence/12.3/invariants.sql \\"
    c_info "      docs/v2-evidence/13.5/canary-dashboard.sql \\"
    c_info "      docs/v2-evidence/13.5/preflight.sql \\"
    c_info "      docs/v2-evidence/13.5/raw/width-drift-probe.py \\"
    c_info "      <box>:~/mihas/v2-gates/"
  else
    for f in "13.2/invariants.sql:gates 1-9  data integrity + isolation" \
             "13.4/invariants.sql:gates 10-19 migration + restore" \
             "12.3/invariants.sql:gates 0-4  legacy-column cohort" \
             "13.5/canary-dashboard.sql:S1,S4,S6 + the nine-signal export" \
             "13.5/preflight.sql:gates 20-25 canary go/no-go"; do
      file="${SQL_DIR}/$(basename "${f%%:*}")"
      label="${f#*:}"
      # 13.2/13.4/12.3 all ship a file called invariants.sql; keep them apart
      # by prefixing on copy, and accept either name here.
      alt="${SQL_DIR}/$(printf '%s' "${f%%:*}" | tr '/' '-')"
      target=""
      [ -f "$file" ] && target="$file"
      [ -z "$target" ] && [ -f "$alt" ] && target="$alt"
      if [ -z "$target" ]; then
        c_skip "${label}: not found (${file} or ${alt})"
        continue
      fi
      printf '\n--- %s (%s) ---\n' "$(basename "$target")" "$label"
      if ${COMPOSE} exec -T postgres bash -lc \
           'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X -v ON_ERROR_STOP=1 \
              -c "SET default_transaction_read_only = on" -f -' < "$target"; then
        c_pass "${label} ran"
      else
        c_fail "${label} errored"
      fi
      c_info "READ THE VERDICT COLUMNS - a file that RAN is not a file that PASSED"
    done
  fi

  section "7. Signal 6 - broker depth (this is what broker_queue_depth means here)"
  # The harness's broker_queue_depth is literally LLEN celery
  # (harness/adapters/adapter_server.py::_redis_total_llen). Same question here.
  depth="$(${COMPOSE} exec -T redis redis-cli llen celery 2>/dev/null | tr -d '\r')"
  c_info "LLEN celery = ${depth:-<unreachable>}"
  if [ -n "${depth:-}" ] && [ "$depth" -le 25 ] 2>/dev/null; then
    c_pass "broker depth ${depth} within the 25-job threshold"
  elif [ -z "${depth:-}" ]; then
    c_fail "Redis unreachable - cannot tell an empty queue from a dead broker"
  else
    c_fail "broker depth ${depth} above the 25-job threshold"
  fi
  ${COMPOSE} exec -T redis redis-cli info memory 2>/dev/null | grep -E 'used_memory_human|maxmemory_human' || true

  section "8. Signal 6 - beat is dispatching (the log is authoritative, not SQL)"
  ${COMPOSE} logs --no-color --tail=40 beat 2>&1 | tail -40
  c_info "expect recent 'Scheduler: Sending due task ...' lines for keep_alive_task (4 min)"
  c_info "and check_uptime_task (15 min). Silence for >15 min means beat is dead."

  section "9. Signal 1 - denials in the web log, correlated to a request id"
  ${COMPOSE} logs --no-color --tail=200 web 2>&1 | grep -iE 'denied|permission|traceback' | tail -20 \
    || c_info "(no denial or traceback lines in the last 200 web log lines)"

  section "10. Production-readiness invariants (settings-level, read-only)"
  ${COMPOSE} exec -T web python manage.py check_production_state --strict --no-color \
    && c_pass "check_production_state --strict exit 0" \
    || c_fail "check_production_state --strict reported failures"
}

# ============================================================================
# MANUAL steps no script can honestly automate
# ============================================================================
manual_notes() {
  section "MANUAL - four checks a script cannot make for you"
  cat <<'MANUAL'
  M1. Signal 4, GATE-13.2-03 - the two-tab autosave probe (~60 seconds).
      A lost update leaves a row that looks perfectly legitimate, so NO SQL can
      detect it after the fact (see canary-dashboard.sql S4). Reproduce it
      deliberately instead:
        1. sign in as a canary test student, open the wizard on a draft
        2. open the SAME draft in a second tab, change one field, let it save
        3. in the FIRST tab (still holding the older form state), reload
        4. read the field: it MUST show tab 2's value
      Tab 1's value winning is GATE-13.2-03 reproducing on production, and it
      is silent data loss. 13.2 saw it in 2 of 3 recordings, so run it three
      times before concluding it is absent.

  M2. Signal 9, GATE-13.4-01 - open the first real email the canary sends.
      All 19 platform-wide fallback templates are legacy-branded, so a NEW
      tenant's students receive mail under another school's name. Gate 19
      counts the rows; only a human can confirm what the recipient saw.

  M3. The student critical path, on a phone.
      sign in -> dashboard -> wizard -> fee resolves -> mobile-money operators
      visible -> upload a PDF on the Education step (expect 201, "Uploaded")
      -> submit. 13.3 found the bottom navigation covering 26.7% of the
      dashboard's primary next action at 375 px (GATE-13.3-16) - so look at the
      first mobile viewport, do not just tap through it.

  M4. The admin path, as a scoped tenant admin (NOT a super admin).
      /admin/tenants -> the applications list -> one application detail. A
      scoped operator seeing a masked 404 on their OWN tenant is signal 1
      firing, and it is the rollback trigger this canary exists to catch.
MANUAL
}

# ============================================================================
mode_plan() {
  cat <<PLAN
Task 13.5 post-deploy smoke - PLAN (nothing was run)

  ./post-deploy-smoke.sh http
      6 sections, external HTTPS only, runs anywhere:
      health x3 - frontend shell + envelope - tenant context is neutral -
      unauth state change refused - tracking 404 - and the two repo smoke
      scripts to run alongside.

  ./post-deploy-smoke.sh on-box            (from ~/mihas on the EC2 box)
      10 sections, all read-only:
      container health - check_schema_drift - apply_sql_migrations --dry-run -
      schema_manifest emit/verify vs 13.4's ${EXPECTED_FINGERPRINT}... -
      width-drift probe - the four SQL gate files (13.2 1-9, 13.4 10-19,
      12.3 0-4, 13.5 S1/S4/S6 + export, 13.5 20-25) - redis LLEN celery -
      beat log - web denial lines - check_production_state --strict.

  Then the four MANUAL checks (printed by any mode).

Configuration (environment overrides):
  APP_URL=${APP_URL}
  API_URL=${API_URL}
  SQL_DIR=${SQL_DIR}
  EXPECTED_FINGERPRINT=${EXPECTED_FINGERPRINT}
  WINDOW=${WINDOW}
PLAN
}

case "$MODE" in
  http)   mode_http; manual_notes ;;
  on-box) mode_on_box; manual_notes ;;
  plan)   mode_plan; manual_notes ;;
  *)      printf 'usage: %s [http|on-box|plan]\n' "$0" >&2; exit 2 ;;
esac

section "RESULT"
printf 'pass=%d fail=%d skip=%d  mode=%s\n' "$PASS" "$FAIL" "$SKIP" "$MODE"
if [ "$FAIL" -gt 0 ]; then
  printf 'AT LEAST ONE CHECK FAILED - do not broaden activation. See README section 5 for the rollback criteria.\n'
  exit 1
fi
printf 'No check failed. A clean run is NOT a sign-off: complete sign-off.md.\n'
exit 0
