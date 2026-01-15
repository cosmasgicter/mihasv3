#!/bin/bash
# Quick git status check

echo "=== Checking Git Status ==="
echo ""

# Check if we have staged changes
STAGED=$(git diff --cached --name-only 2>/dev/null | wc -l)
echo "Staged files: $STAGED"

# Check if we have unstaged changes  
UNSTAGED=$(git diff --name-only 2>/dev/null | wc -l)
echo "Unstaged files: $UNSTAGED"

# Check untracked files
UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null | wc -l)
echo "Untracked files: $UNTRACKED"

echo ""
if [ "$STAGED" -eq 0 ] && [ "$UNSTAGED" -eq 0 ]; then
    echo "✓ Working directory is CLEAN - ready to commit!"
else
    echo "⚠ You have changes to review"
    echo ""
    echo "Run: git status"
fi
