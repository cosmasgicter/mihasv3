@echo off
echo ========================================
echo Real-Time Sync Fix - Verification Test
echo ========================================
echo.

echo This script will help you verify the real-time sync fixes.
echo.
echo TESTING CHECKLIST:
echo ==================
echo.
echo [1] Query Invalidation Test
echo    - Submit a test application
echo    - Check if it appears immediately on dashboard
echo    - Expected: Application visible within 1 second
echo.
echo [2] Status Update Test
echo    - Approve/reject an application
echo    - Check if status updates immediately
echo    - Expected: Status changes instantly
echo.
echo [3] Window Focus Test
echo    - Submit application in one tab
echo    - Switch to another tab with dashboard
echo    - Expected: Data refreshes automatically
echo.
echo [4] Polling Fallback Test
echo    - Disable Realtime on Supabase (optional)
echo    - Submit application
echo    - Expected: Appears within 15 seconds
echo.
echo [5] Realtime Connection Test
echo    - Check RealtimeStatus component
echo    - Expected: Shows "Live updates active" or fallback message
echo.
echo ========================================
echo.

set /p start="Press ENTER to start development server..."

echo.
echo Starting development server...
echo.
cd /d "%~dp0.."
npm run dev

pause
