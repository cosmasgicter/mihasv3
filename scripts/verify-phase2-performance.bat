@echo off
REM Phase 2 Performance Checkpoint Verification Script (Windows)
REM This script runs all performance tests to verify Phase 2 optimizations

echo.
echo ========================================== 
echo Phase 2 Performance Checkpoint Verification
echo ==========================================
echo.

REM Track results
set TESTS_PASSED=0
set TESTS_FAILED=0

REM Check if dev server is running
echo Checking if dev server is running...
curl -s http://localhost:5173/ >nul 2>&1
if %errorlevel% equ 0 (
    echo [32m✅ Dev server is running[0m
) else (
    echo [31m❌ Dev server is not running[0m
    echo Please start the dev server with: npm run dev
    exit /b 1
)
echo.

REM Run Playwright performance tests
echo ========================================== 
echo Running Performance Tests
echo ==========================================
echo.

echo Test 1: Navigation Performance Tests
echo ------------------------------------------
npx playwright test tests/performance/checkpoint-phase2-verification.spec.ts -g "Navigation times" --reporter=line
if %errorlevel% equ 0 (
    echo [32m✅ PASSED: Navigation times ^< 500ms[0m
    set /a TESTS_PASSED+=1
) else (
    echo [31m❌ FAILED: Navigation times ^< 500ms[0m
    set /a TESTS_FAILED+=1
)
echo.

echo Test 2: Login Performance Test
echo ------------------------------------------
npx playwright test tests/performance/checkpoint-phase2-verification.spec.ts -g "Login flow" --reporter=line
if %errorlevel% equ 0 (
    echo [32m✅ PASSED: Login ^< 2 seconds[0m
    set /a TESTS_PASSED+=1
) else (
    echo [31m❌ FAILED: Login ^< 2 seconds[0m
    set /a TESTS_FAILED+=1
)
echo.

echo Test 3: Track Application Page Performance
echo ------------------------------------------
npx playwright test tests/performance/checkpoint-phase2-verification.spec.ts -g "Track application page" --reporter=line
if %errorlevel% equ 0 (
    echo [32m✅ PASSED: Track application page ^< 1 second[0m
    set /a TESTS_PASSED+=1
) else (
    echo [31m❌ FAILED: Track application page ^< 1 second[0m
    set /a TESTS_FAILED+=1
)
echo.

echo Test 4: Core Web Vitals
echo ------------------------------------------
npx playwright test tests/performance/checkpoint-phase2-verification.spec.ts -g "Core Web Vitals" --reporter=line
if %errorlevel% equ 0 (
    echo [32m✅ PASSED: Core Web Vitals check[0m
    set /a TESTS_PASSED+=1
) else (
    echo [31m❌ FAILED: Core Web Vitals check[0m
    set /a TESTS_FAILED+=1
)
echo.

echo Test 5: Code Splitting Verification
echo ------------------------------------------
npx playwright test tests/performance/checkpoint-phase2-verification.spec.ts -g "Bundle size" --reporter=line
if %errorlevel% equ 0 (
    echo [32m✅ PASSED: Bundle size optimization[0m
    set /a TESTS_PASSED+=1
) else (
    echo [31m❌ FAILED: Bundle size optimization[0m
    set /a TESTS_FAILED+=1
)
echo.

echo Test 6: React Query Caching
echo ------------------------------------------
npx playwright test tests/performance/checkpoint-phase2-verification.spec.ts -g "caching" --reporter=line
if %errorlevel% equ 0 (
    echo [32m✅ PASSED: Caching reduces redundant requests[0m
    set /a TESTS_PASSED+=1
) else (
    echo [31m❌ FAILED: Caching reduces redundant requests[0m
    set /a TESTS_FAILED+=1
)
echo.

echo Test 7: Service Worker
echo ------------------------------------------
npx playwright test tests/performance/checkpoint-phase2-verification.spec.ts -g "Service worker" --reporter=line
if %errorlevel% equ 0 (
    echo [32m✅ PASSED: Service worker active[0m
    set /a TESTS_PASSED+=1
) else (
    echo [31m❌ FAILED: Service worker active[0m
    set /a TESTS_FAILED+=1
)
echo.

echo Test 8: Lighthouse Performance Metrics
echo ------------------------------------------
npx playwright test tests/performance/checkpoint-phase2-verification.spec.ts -g "Lighthouse" --reporter=line
if %errorlevel% equ 0 (
    echo [32m✅ PASSED: Lighthouse metrics check[0m
    set /a TESTS_PASSED+=1
) else (
    echo [31m❌ FAILED: Lighthouse metrics check[0m
    set /a TESTS_FAILED+=1
)
echo.

REM Summary
echo.
echo ==========================================
echo VERIFICATION SUMMARY
echo ==========================================
echo Tests Passed: %TESTS_PASSED%
echo Tests Failed: %TESTS_FAILED%
echo.

if %TESTS_FAILED% equ 0 (
    echo [32m🎉 All Phase 2 performance requirements verified![0m
    echo.
    echo ✅ Navigation times ^< 500ms
    echo ✅ Login ^< 2 seconds
    echo ✅ Track application page ^< 1 second
    echo ✅ Lighthouse score ^> 90 ^(or metrics meet targets^)
    echo.
    echo Phase 2 checkpoint: PASSED ✅
    exit /b 0
) else (
    echo [31m⚠️  Some performance requirements not met[0m
    echo.
    echo Please review the failed tests above and:
    echo 1. Check if optimizations are properly implemented
    echo 2. Verify code splitting is working
    echo 3. Ensure React Query caching is configured
    echo 4. Review bundle sizes and lazy loading
    echo.
    echo Phase 2 checkpoint: FAILED ❌
    exit /b 1
)
