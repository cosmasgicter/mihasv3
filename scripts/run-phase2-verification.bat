@echo off
REM Phase 2 Performance Verification Script for Windows
REM Runs performance tests and generates a report

echo ======================================================================
echo MIHAS Phase 2 Performance Verification
echo ======================================================================
echo.

REM Check if dev server is running
echo Checking if dev server is running...
curl -s http://localhost:5173 >nul 2>&1
if %errorlevel% equ 0 (
    echo [32m✓ Dev server is running[0m
) else (
    echo [33m⚠ Dev server not detected[0m
    echo [34mStarting dev server...[0m
    start /B npm run dev
    
    REM Wait for server to start
    echo Waiting for server to start...
    timeout /t 5 /nobreak >nul
    
    :wait_loop
    curl -s http://localhost:5173 >nul 2>&1
    if %errorlevel% neq 0 (
        timeout /t 1 /nobreak >nul
        goto wait_loop
    )
    echo [32m✓ Dev server started[0m
)

echo.
echo ======================================================================
echo Running Performance Tests
echo ======================================================================
echo.

REM Run Playwright performance tests
npx playwright test tests/performance/phase2-verification.spec.ts --reporter=list

set TEST_EXIT_CODE=%errorlevel%

echo.
echo ======================================================================
echo Performance Verification Complete
echo ======================================================================
echo.

if %TEST_EXIT_CODE% equ 0 (
    echo [32m✓ All performance tests passed![0m
    echo.
    echo Phase 2 performance optimizations are working correctly:
    echo   ✓ Navigation times ^< 500ms
    echo   ✓ Track application page ^< 1 second
    echo   ✓ Code splitting is working
    echo   ✓ Caching is effective
    echo.
    exit /b 0
) else (
    echo [31m✗ Some performance tests failed[0m
    echo.
    echo Please review the test output above for details.
    echo.
    exit /b 1
)
