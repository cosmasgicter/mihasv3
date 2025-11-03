@echo off
REM Supabase REST API Helper
REM Usage: supabase-helper.bat [table_name]

set SUPABASE_URL=https://mylgegkqoddcrxtwcclb.supabase.co
set SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzUxMjA4MywiZXhwIjoyMDczMDg4MDgzfQ.FsspKE5bjcG4TW8IvG-N0o7W0E7ljxznwlzJCm50ZRE

if "%1"=="" (
    echo Usage: supabase-helper.bat [table_name]
    echo Example: supabase-helper.bat applications
    exit /b
)

curl -X GET "%SUPABASE_URL%/rest/v1/%1?limit=10" -H "apikey: %SUPABASE_KEY%" -H "Authorization: Bearer %SUPABASE_KEY%"
