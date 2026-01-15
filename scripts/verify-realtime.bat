@echo off
echo ============================================================
echo Supabase Realtime Configuration Verification
echo ============================================================
echo.
echo This script helps verify that realtime is enabled for the
echo required tables: applications, payments, in_app_notifications
echo.
echo ============================================================
echo MANUAL VERIFICATION STEPS:
echo ============================================================
echo.
echo 1. Go to Supabase Dashboard:
echo    https://supabase.com/dashboard
echo.
echo 2. Select your project and navigate to:
echo    Database ^> Replication
echo.
echo 3. Verify these tables are in the supabase_realtime publication:
echo    - applications
echo    - payments  
echo    - in_app_notifications
echo.
echo 4. If tables are missing, run this SQL in SQL Editor:
echo.
echo    ALTER PUBLICATION supabase_realtime ADD TABLE applications;
echo    ALTER PUBLICATION supabase_realtime ADD TABLE payments;
echo    ALTER PUBLICATION supabase_realtime ADD TABLE in_app_notifications;
echo.
echo 5. Verify with:
echo    SELECT tablename FROM pg_publication_tables 
echo    WHERE pubname = 'supabase_realtime';
echo.
echo ============================================================
echo Migration file: supabase/migrations/20250115_enable_realtime_tables.sql
echo ============================================================
echo.
pause
