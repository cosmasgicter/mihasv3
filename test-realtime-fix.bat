@echo off
echo ========================================
echo Real-Time Sync Fix - Automated Tests
echo ========================================
echo.

set SUPABASE_URL=https://mylgegkqoddcrxtwcclb.supabase.co
set ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwODMsImV4cCI6MjA3MzA4ODA4M30.7f-TwYz7E6Pp07oH5Lkkfw9c8d8JkeE81EXJqpCWiLw

set PASSED=0
set FAILED=0

echo Test 1: Supabase API accessibility
curl -s -o nul -w "%%{http_code}" -H "apikey: %ANON_KEY%" "%SUPABASE_URL%/rest/v1/" > temp.txt
set /p STATUS=<temp.txt
if "%STATUS%"=="200" (
    echo [PASS] Supabase API is accessible
    set /a PASSED+=1
) else (
    echo [FAIL] Supabase API returned status %STATUS%
    set /a FAILED+=1
)

echo.
echo Test 2: Applications table accessibility
curl -s -o nul -w "%%{http_code}" -H "apikey: %ANON_KEY%" -H "Authorization: Bearer %ANON_KEY%" "%SUPABASE_URL%/rest/v1/applications?select=id&limit=1" > temp.txt
set /p STATUS=<temp.txt
if "%STATUS%"=="200" (
    echo [PASS] Applications table is accessible
    set /a PASSED+=1
) else (
    echo [FAIL] Applications table returned status %STATUS%
    set /a FAILED+=1
)

echo.
echo Test 3: Admin view accessibility
curl -s -o nul -w "%%{http_code}" -H "apikey: %ANON_KEY%" -H "Authorization: Bearer %ANON_KEY%" "%SUPABASE_URL%/rest/v1/admin_application_detailed?select=id&limit=1" > temp.txt
set /p STATUS=<temp.txt
if "%STATUS%"=="200" (
    echo [PASS] Admin view is accessible
    set /a PASSED+=1
) else (
    echo [FAIL] Admin view returned status %STATUS%
    set /a FAILED+=1
)

echo.
echo Test 4: Live site accessibility
curl -s -o nul -w "%%{http_code}" "https://apply.mihas.edu.zm" > temp.txt
set /p STATUS=<temp.txt
if "%STATUS%"=="200" (
    echo [PASS] Live site is accessible
    set /a PASSED+=1
) else (
    echo [FAIL] Live site returned status %STATUS%
    set /a FAILED+=1
)

del temp.txt 2>nul

echo.
echo ========================================
echo Test Results
echo ========================================
echo Passed: %PASSED%
echo Failed: %FAILED%
echo ========================================
echo.

if %FAILED% GTR 0 (
    echo Status: FAILED
    exit /b 1
) else (
    echo Status: ALL TESTS PASSED
    exit /b 0
)
