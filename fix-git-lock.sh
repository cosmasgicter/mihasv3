#!/bin/bash

echo "=== Fixing Git lock file issue ==="
echo ""

# Remove the lock file
LOCK_FILE=".git/index.lock"

if [ -f "$LOCK_FILE" ]; then
    echo "Removing stale lock file: $LOCK_FILE"
    rm -f "$LOCK_FILE"
    echo "✓ Lock file removed"
else
    echo "ℹ No lock file found (already removed or doesn't exist)"
fi

echo ""
echo "=== Done! ==="
echo ""
echo "You can now run your Git commands again:"
echo "  git commit -m 'Fix: Remove node_modules and configure WSL symlinks'"
