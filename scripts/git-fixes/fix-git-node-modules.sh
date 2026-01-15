#!/bin/bash

# Fix Git tracking issues with node_modules
echo "Fixing Git tracking for node_modules..."

# Remove node_modules from Git index (but keep the files)
git rm -r --cached node_modules/ 2>/dev/null || echo "node_modules already removed from index"

# Clean up any lingering references
git add -A

echo "Done! Now you can commit the changes."
echo "Run: git commit -m 'Fix: Remove node_modules from Git tracking'"
