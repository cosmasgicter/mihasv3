#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-***REMOVED***}"
API_URL="${API_URL:-***REMOVED***}"

check_200() {
  local label="$1"
  local url="$2"

  local status
  status="$(curl -sS -o /tmp/mihas-smoke-body.$$ -w "%{http_code}" "$url")"

  if [[ "$status" != "200" ]]; then
    echo "FAIL: ${label} -> ${url} returned ${status}"
    cat /tmp/mihas-smoke-body.$$ || true
    rm -f /tmp/mihas-smoke-body.$$
    exit 1
  fi

  echo "PASS: ${label} -> ${url}"
  rm -f /tmp/mihas-smoke-body.$$
}

check_contains() {
  local label="$1"
  local url="$2"
  local pattern="$3"

  local body
  body="$(curl -sS "$url")"
  if [[ "$body" != *"$pattern"* ]]; then
    echo "FAIL: ${label} -> ${url} missing pattern: ${pattern}"
    exit 1
  fi

  echo "PASS: ${label} -> ${url}"
}

echo "Running production smoke checks"
echo "APP_URL=${APP_URL}"
echo "API_URL=${API_URL}"

check_200 "Frontend landing page" "${APP_URL}/"
check_200 "API live health" "${API_URL}/health/live/"
check_200 "API ready health" "${API_URL}/health/ready/"
check_200 "API Redis health" "${API_URL}/health/redis/"
check_200 "API auth session" "${API_URL}/api/v1/auth/session/"
check_200 "Catalog programs" "${API_URL}/api/v1/catalog/programs/"

check_contains "Frontend HTML shell" "${APP_URL}/" "<html"
check_contains "API auth session payload" "${API_URL}/api/v1/auth/session/" "\"success\""
check_contains "Catalog programs payload" "${API_URL}/api/v1/catalog/programs/" "\"success\""

tracking_status="$(curl -sS -o /tmp/mihas-smoke-body.$$ -w "%{http_code}" "${API_URL}/api/v1/applications/track/?code=TRK-AAAAAAAAAAAA")"
if [[ "$tracking_status" != "404" ]]; then
  echo "FAIL: Public tracking negative case returned ${tracking_status}"
  cat /tmp/mihas-smoke-body.$$ || true
  rm -f /tmp/mihas-smoke-body.$$
  exit 1
fi
echo "PASS: Public tracking negative case"
rm -f /tmp/mihas-smoke-body.$$

echo "Smoke checks passed."
