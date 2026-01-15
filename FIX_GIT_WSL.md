# Fix Git Symlink Issues in WSL

## Problem
Git is failing with: `error: open("node_modules/.bin/playwright"): Function not implemented`

This happens because WSL has issues with symlinks in `node_modules/.bin/`.

## Solution - Run these commands in your WSL terminal:

### Step 1: Configure Git to ignore symlinks
```bash
git config core.symlinks false
```

### Step 2: Remove node_modules from Git tracking
```bash
git rm -r --cached node_modules/ 2>/dev/null || echo "Already removed"
```

### Step 3: Clear Git index and rebuild
```bash
git rm -r --cached .
git add .
```

### Step 4: Check status
```bash
git status
```

### Step 5: Commit the changes
```bash
git commit -m "Fix: Remove node_modules and configure WSL symlinks"
```

## Alternative: Quick Fix

If the above doesn't work, try this nuclear option:

```bash
# Delete node_modules completely
rm -rf node_modules/

# Reinstall dependencies
npm install

# Now Git won't have symlink issues
git add .
git commit -m "Fix: Reinstall node_modules for WSL compatibility"
```

## Prevention

Add this to your `.git/config` or run globally:
```bash
git config --global core.symlinks false
```

This prevents future symlink issues in WSL.
