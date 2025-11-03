@echo off
echo ========================================
echo Deploy Real-Time Sync Fix to Production
echo ========================================
echo.

echo This will deploy the real-time sync fixes to:
echo https://apply.mihas.edu.zm
echo.

set /p confirm="Are you sure you want to deploy? (yes/no): "
if /i not "%confirm%"=="yes" (
    echo Deployment cancelled.
    exit /b 0
)

echo.
echo Step 1: Building production bundle...
echo ========================================
call npm run build:prod
if errorlevel 1 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo Step 2: Deploying to Cloudflare Pages...
echo ========================================
call npm run deploy
if errorlevel 1 (
    echo ERROR: Deployment failed!
    pause
    exit /b 1
)

echo.
echo ========================================
echo Deployment Complete!
echo ========================================
echo.
echo Next Steps:
echo 1. Open https://apply.mihas.edu.zm
echo 2. Test application submission
echo 3. Verify immediate updates
echo 4. Fill out LIVE_SITE_TEST_RESULTS.md
echo.
echo Test Credentials:
echo Email: cosmaskachepa8@gmail.com
echo Password: Beanola2025
echo.
pause
