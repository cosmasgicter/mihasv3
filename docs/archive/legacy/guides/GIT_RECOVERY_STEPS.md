# Git Index Recovery Guide

## Problem
Git index is locked and files are staged for deletion. The `.git/index.lock` file is preventing git operations.

## Solution Steps

### Option 1: Run the Batch Script (Easiest)
1. Close VS Code / Kiro completely
2. Double-click `fix-git-index.bat` in Windows Explorer
3. Wait for it to complete
4. Reopen your project

### Option 2: Manual Steps
1. **Close all applications** that might be accessing the git repository:
   - VS Code / Kiro
   - Git GUI clients
   - Terminal windows
   - File Explorer windows in this folder

2. **Open Command Prompt as Administrator**:
   - Press Win+X
   - Select "Command Prompt (Admin)" or "PowerShell (Admin)"

3. **Navigate to your project**:
   ```cmd
   cd "C:\Users\Cosma\OneDrive\Mobile uploads\Documents\mihasv3"
   ```

4. **Kill git processes**:
   ```cmd
   taskkill /F /IM git.exe
   ```

5. **Remove the lock file**:
   ```cmd
   del /F /Q .git\index.lock
   ```

6. **Reset the git index**:
   ```cmd
   git reset --mixed HEAD
   ```

7. **Verify everything is restored**:
   ```cmd
   git status
   ```

### Option 3: If OneDrive is the Issue
OneDrive might be locking the file. Try this:

1. **Pause OneDrive sync**:
   - Right-click OneDrive icon in system tray
   - Click "Pause syncing" → "2 hours"

2. **Then follow Option 2 steps above**

3. **Resume OneDrive** after git is fixed

### Option 4: Nuclear Option (Last Resort)
If nothing else works:

1. **Backup your work** (copy the entire folder somewhere safe)

2. **Delete the git index**:
   ```cmd
   del /F /Q .git\index
   del /F /Q .git\index.lock
   ```

3. **Rebuild from scratch**:
   ```cmd
   git reset --hard HEAD
   ```

## What Happened?
The `fix-git-tracking.sh` script ran `git rm -r --cached .` which staged all files for deletion. Then git got stuck trying to rebuild the index, creating a lock file that's now preventing recovery.

## Prevention
In the future, avoid running `git rm -r --cached .` on large repositories. Instead, use targeted commands for specific files or directories.
