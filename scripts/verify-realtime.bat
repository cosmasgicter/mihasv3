@echo off
echo ========================================
echo Supabase Realtime Configuration Check
echo ========================================
echo.

REM Load environment variables
if exist .env.production (
    for /f "tokens=1,2 delims==" %%a in (.env.production) do (
        if "%%a"=="VITE_SUPABASE_URL" set SUPABASE_URL=%%b
        if "%%a"=="VITE_SUPABASE_SERVICE_ROLE_KEY" set SERVICE_KEY=%%b
    )
) else (
    echo ERROR: .env.production not found
    exit /b 1
)

echo Supabase URL: %SUPABASE_URL%
echo.

echo Checking Realtime configuration...
echo.

REM Check if realtime is enabled on applications table
curl -X POST "%SUPABASE_URL%/rest/v1/rpc/check_realtime" ^
  -H "apikey: %SERVICE_KEY%" ^
  -H "Authorization: Bearer %SERVICE_KEY%" ^
  -H "Content-Type: application/json"

echo.
echo.
echo ========================================
echo Manual Verification Steps:
echo ========================================
echo 1. Go to: https://supabase.com/dashboard/project/mylgegkqoddcrxtwcclb
echo 2. Navigate to: Database ^> Replication
echo 3. Verify "applications" table has Realtime ENABLED
echo 4. Check: Database ^> Tables ^> applications ^> Settings
echo 5. Ensure RLS policies allow realtime events
echo.
echo ========================================
echo Testing Realtime Connection:
echo ========================================
echo Open browser console and run:
echo.
echo const { createClient } = supabase
echo const client = createClient('%SUPABASE_URL%', 'YOUR_ANON_KEY')
echo const channel = client.channel('test').on('postgres_changes', 
echo   { event: '*', schema: 'public', table: 'applications' },
echo   (payload) =^> console.log('Realtime event:', payload)
echo ).subscribe((status) =^> console.log('Status:', status))
echo.
pause
