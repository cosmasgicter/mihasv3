#!/bin/bash

# Test runner script for WSL environment
# Usage: ./run-tests.sh [test-file-path]

if [ -z "$1" ]; then
    echo "Usage: ./run-tests.sh [test-file-path]"
    echo "Example: ./run-tests.sh src/lib/plugins/__tests__/PluginManager.test.ts"
    exit 1
fi

echo "Running test: $1"
node node_modules/vitest/vitest.mjs --run "$1" --reporter=verbose