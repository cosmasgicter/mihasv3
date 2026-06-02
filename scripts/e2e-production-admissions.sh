#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-smoke}"
API_URL="${API_URL:-https://api.mihas.edu.zm}"
APP_URL="${APP_URL:-https://apply.mihas.edu.zm}"
COOKIE_DIR="$(mktemp -d)"
STUDENT_COOKIE="${COOKIE_DIR}/student.cookies"
ADMIN_COOKIE="${COOKIE_DIR}/admin.cookies"
STUDENT_CSRF=""
ADMIN_CSRF=""

cleanup() {
  rm -rf "${COOKIE_DIR}"
}
trap cleanup EXIT

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required env var: ${name}" >&2
    exit 2
  fi
}

json_get() {
  local expr="$1"
  python3 -c '
import json, sys
expr = sys.argv[1].split(".")
data = json.load(sys.stdin)
for key in expr:
    if key:
        data = data[key]
print(data)
' "$expr"
}

api() {
  local cookie="$1"
  local method="$2"
  local path="$3"
  local body="${4:-}"
  local csrf="${5:-}"
  local csrf_args=()
  if [[ -n "${csrf}" ]]; then
    csrf_args=(-H "X-CSRF-Token: ${csrf}")
  fi

  if [[ -n "${body}" ]]; then
    curl -fsS -b "${cookie}" -c "${cookie}" \
      -H "Content-Type: application/json" \
      "${csrf_args[@]}" \
      -X "${method}" \
      --data "${body}" \
      "${API_URL}${path}"
  else
    curl -fsS -b "${cookie}" -c "${cookie}" \
      -X "${method}" \
      "${API_URL}${path}"
  fi
}

login() {
  local cookie="$1"
  local email="$2"
  local password="$3"
  local csrf_var="$4"

  curl -fsS -D /tmp/mihas-login-headers.$$ -b "${cookie}" -c "${cookie}" \
    -H "Content-Type: application/json" \
    -X POST \
    --data "{\"email\":\"${email}\",\"password\":\"${password}\"}" \
    "${API_URL}/api/v1/auth/login/" >/tmp/mihas-login.$$
  json_get "success" </tmp/mihas-login.$$ >/dev/null
  printf -v "${csrf_var}" '%s' "$(awk 'BEGIN{IGNORECASE=1} /^X-CSRF-Token:/ {gsub("\r", "", $0); sub(/^[^:]+:[[:space:]]*/, "", $0); print; exit}' /tmp/mihas-login-headers.$$)"
  rm -f /tmp/mihas-login.$$ /tmp/mihas-login-headers.$$
  if [[ -z "${!csrf_var}" ]]; then
    echo "Login succeeded but X-CSRF-Token was not returned" >&2
    exit 1
  fi
}

smoke() {
  APP_URL="${APP_URL}" API_URL="${API_URL}" "$(dirname "$0")/smoke-production.sh"
}

readonly_smoke() {
  smoke
  curl -fsS -o /dev/null "${API_URL}/api/v1/schema/" && {
    echo "Expected anonymous schema request to be gated, but it returned 2xx" >&2
    exit 1
  }
  echo "PASS: Anonymous OpenAPI schema is gated"
}

safe_write_e2e() {
  require_env TEST_STUDENT_EMAIL
  require_env TEST_ADMIN_EMAIL
  require_env TEST_PASSWORD
  require_env E2E_PROGRAM
  require_env E2E_INTAKE
  require_env E2E_INSTITUTION
  require_env E2E_SUBJECT_IDS

  local label
  label="Disposable E2E $(date -u +%Y%m%dT%H%M%SZ)"

  login "${STUDENT_COOKIE}" "${TEST_STUDENT_EMAIL}" "${TEST_PASSWORD}" STUDENT_CSRF
  echo "PASS: student login"

  create_body="$(cat <<JSON
{
  "full_name": "${label}",
  "nrc_number": "111111/11/1",
  "date_of_birth": "1998-01-15",
  "sex": "female",
  "phone": "+260971123456",
  "email": "${TEST_STUDENT_EMAIL}",
  "residence_town": "Lusaka",
  "country": "Zambia",
  "nationality": "Zambian",
  "next_of_kin_name": "E2E Contact",
  "next_of_kin_phone": "+260971000000",
  "program": "${E2E_PROGRAM}",
  "intake": "${E2E_INTAKE}",
  "institution": "${E2E_INSTITUTION}",
  "draft_name": "${label}"
}
JSON
)"
  api "${STUDENT_COOKIE}" POST "/api/v1/applications/" "${create_body}" "${STUDENT_CSRF}" >/tmp/mihas-app.$$
  application_id="$(json_get "data.id" </tmp/mihas-app.$$)"
  application_number="$(json_get "data.application_number" </tmp/mihas-app.$$)"
  rm -f /tmp/mihas-app.$$
  echo "PASS: application created (${application_number})"

  IFS=',' read -r -a subjects <<<"${E2E_SUBJECT_IDS}"
  if [[ "${#subjects[@]}" -lt 5 ]]; then
    echo "E2E_SUBJECT_IDS must contain at least 5 comma-separated subject UUIDs" >&2
    exit 2
  fi

  grades_json='{"grades":['
  for index in 0 1 2 3 4; do
    [[ "${index}" != "0" ]] && grades_json+=","
    grades_json+="{\"subject_id\":\"${subjects[$index]}\",\"grade\":${E2E_GRADE:-3}}"
  done
  grades_json+=']}'
  api "${STUDENT_COOKIE}" POST "/api/v1/applications/${application_id}/grades/" "${grades_json}" "${STUDENT_CSRF}" >/dev/null
  echo "PASS: grades saved"

  api "${STUDENT_COOKIE}" POST "/api/v1/payments/defer/" "{\"application_id\":\"${application_id}\"}" "${STUDENT_CSRF}" >/tmp/mihas-payment.$$
  payment_id="$(json_get "data.payment_id" </tmp/mihas-payment.$$)"
  rm -f /tmp/mihas-payment.$$
  echo "PASS: deferred payment created (${payment_id})"

  api "${STUDENT_COOKIE}" POST "/api/v1/applications/${application_id}/submit/" '{"confirm_submission":true}' "${STUDENT_CSRF}" >/dev/null
  echo "PASS: application submitted"

  login "${ADMIN_COOKIE}" "${TEST_ADMIN_EMAIL}" "${TEST_PASSWORD}" ADMIN_CSRF
  echo "PASS: admin login"

  api "${ADMIN_COOKIE}" POST "/api/v1/applications/${application_id}/review/" \
    '{"new_status":"approved","notes":"Disposable production E2E approval.","force":false}' "${ADMIN_CSRF}" >/dev/null
  echo "PASS: admin approval"

  api "${ADMIN_COOKIE}" POST "/api/v1/applications/${application_id}/acceptance-letter/" "{}" "${ADMIN_CSRF}" >/dev/null
  api "${ADMIN_COOKIE}" POST "/api/v1/applications/${application_id}/finance-receipt/" "{}" "${ADMIN_CSRF}" >/dev/null
  echo "PASS: acceptance-letter and finance-receipt tasks queued"

  echo "E2E application ${application_number} is disposable; archive or delete it per the production data cleanup procedure."
}

manual_payment() {
  echo "Manual mode intentionally does not trigger mobile-money collection."
  echo "Use the frontend with a controlled provider test number, then record the Lenco reference and webhook/receipt evidence."
}

case "${MODE}" in
  smoke) smoke ;;
  readonly-smoke) readonly_smoke ;;
  safe-write) safe_write_e2e ;;
  manual-payment) manual_payment ;;
  *)
    echo "Usage: $0 {smoke|readonly-smoke|safe-write|manual-payment}" >&2
    exit 2
    ;;
esac
