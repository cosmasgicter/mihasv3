#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-https://apply.mihas.edu.zm}"
API_URL="${API_URL:-https://api.mihas.edu.zm}"

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
check_200 "API auth session" "${API_URL}/api/v1/auth/session/"

check_contains "Frontend HTML shell" "${APP_URL}/" "<html"
check_contains "API auth session payload" "${API_URL}/api/v1/auth/session/" "\"user\""

echo "Smoke checks passed."
