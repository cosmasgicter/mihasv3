#!/bin/bash

# Playwright test runner script for WSL environment
# Usage: ./run-playwright.sh [test-file-path]

if [ -z "$1" ]; then
    echo "Usage: ./run-playwright.sh [test-file-path]"
    echo "Example: ./run-playwright.sh tests/mobile/pwa-capabilities.spec.ts"
    exit 1
fi

echo "Running Playwright test: $1"
node node_modules/playwright/cli.js test "$1" --reporter=list