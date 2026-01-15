#!/bin/bash
# Script to fix Git tracking issues in WSL
# Handles symlink problems with node_modules/.bin/

echo "=== Fixing Git tracking for WSL ==="
echo ""

# Step 1: Configure Git to handle symlinks properly in WSL
echo "1. Configuring Git for WSL symlinks..."
git config core.symlinks false
echo "   ✓ Set core.symlinks = false"

# Step 2: Remove node_modules from Git cache completely
echo ""
echo "2. Removing node_modules from Git cache..."
git rm -r --cached node_modules/ 2>/dev/null && echo "   ✓ Removed node_modules" || echo "   ℹ node_modules not in cache"

# Step 3: Remove other files that shouldn't be tracked
echo ""
echo "3. Removing other untracked files..."
git rm --cached -r dist 2>/dev/null || true
git rm --cached database.db 2>/dev/null || true
git rm --cached accessibility-report.json 2>/dev/null || true
git rm --cached node-installer.msi 2>/dev/null || true
git rm --cached *.patch 2>/dev/null || true
echo "   ✓ Cleaned up other files"

# Step 4: Clear and rebuild Git index
echo ""
echo "4. Rebuilding Git index..."
git rm -r --cached . 2>/dev/null || true
git add .
echo "   ✓ Index rebuilt"

echo ""
echo "=== Fix Complete! ==="
echo ""
echo "Next steps:"
echo "  1. Review changes:  git status"
echo "  2. Commit changes:  git commit -m 'Fix: Remove node_modules and configure WSL symlinks'"
echo "  3. Push if needed:  git push"
echo ""
echo "Note: The 'Function not implemented' error for playwright symlinks should now be resolved."
