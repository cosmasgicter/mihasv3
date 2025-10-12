@echo off
echo 🚀 MIHAS Admin API Tests - Production Environment
echo ============================================================

set SUPABASE_URL=https://pzlqwhwkgjzjgqjpfzby.supabase.co
set SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bHF3aHdrZ2p6amdxanBmemJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI2MzE0NzcsImV4cCI6MjA0ODIwNzQ3N30.Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8
set ADMIN_EMAIL=alexisstar8@gmail.com
set ADMIN_PASSWORD=Skyl3rL0m1s

echo.
echo 🔐 Testing Admin Authentication...
curl -X POST "%SUPABASE_URL%/auth/v1/token?grant_type=password" ^
  -H "Content-Type: application/json" ^
  -H "apikey: %SUPABASE_KEY%" ^
  -d "{\"email\":\"%ADMIN_EMAIL%\",\"password\":\"%ADMIN_PASSWORD%\"}" ^
  -o auth_response.json

echo.
echo 📋 Testing Get All Applications...
curl -X GET "%SUPABASE_URL%/rest/v1/applications_new?select=*,profiles(full_name,email),programs(name),intakes(name)" ^
  -H "apikey: %SUPABASE_KEY%" ^
  -H "Authorization: Bearer %AUTH_TOKEN%" ^
  -o applications_response.json

echo.
echo 📊 Testing Admin Statistics...
curl -X GET "%SUPABASE_URL%/rest/v1/applications_new?select=status" ^
  -H "apikey: %SUPABASE_KEY%" ^
  -H "Authorization: Bearer %AUTH_TOKEN%" ^
  -o stats_response.json

echo.
echo 🎓 Testing Programs Management...
curl -X GET "%SUPABASE_URL%/rest/v1/programs?select=*" ^
  -H "apikey: %SUPABASE_KEY%" ^
  -H "Authorization: Bearer %AUTH_TOKEN%" ^
  -o programs_response.json

echo.
echo 📅 Testing Intakes Management...
curl -X GET "%SUPABASE_URL%/rest/v1/intakes?select=*" ^
  -H "apikey: %SUPABASE_KEY%" ^
  -H "Authorization: Bearer %AUTH_TOKEN%" ^
  -o intakes_response.json

echo.
echo 👥 Testing User Management...
curl -X GET "%SUPABASE_URL%/rest/v1/profiles?select=*&limit=10" ^
  -H "apikey: %SUPABASE_KEY%" ^
  -H "Authorization: Bearer %AUTH_TOKEN%" ^
  -o users_response.json

echo.
echo 📎 Testing Document Management...
curl -X GET "%SUPABASE_URL%/rest/v1/documents?select=*&limit=10" ^
  -H "apikey: %SUPABASE_KEY%" ^
  -H "Authorization: Bearer %AUTH_TOKEN%" ^
  -o documents_response.json

echo.
echo 🔔 Testing Notifications...
curl -X GET "%SUPABASE_URL%/rest/v1/notifications?select=*&limit=10" ^
  -H "apikey: %SUPABASE_KEY%" ^
  -H "Authorization: Bearer %AUTH_TOKEN%" ^
  -o notifications_response.json

echo.
echo ============================================================
echo 📊 Admin API Test Results:
echo ============================================================

if exist auth_response.json (
    echo ✅ Authentication: Response received
    type auth_response.json | findstr "access_token" >nul && echo    - Token obtained successfully || echo    - Token not found
) else (
    echo ❌ Authentication: No response
)

if exist applications_response.json (
    echo ✅ Applications: Response received
    for /f %%i in ('type applications_response.json ^| find "id" /c') do echo    - Found %%i applications
) else (
    echo ❌ Applications: No response
)

if exist programs_response.json (
    echo ✅ Programs: Response received
    for /f %%i in ('type programs_response.json ^| find "name" /c') do echo    - Found %%i programs
) else (
    echo ❌ Programs: No response
)

if exist intakes_response.json (
    echo ✅ Intakes: Response received
    for /f %%i in ('type intakes_response.json ^| find "year" /c') do echo    - Found %%i intakes
) else (
    echo ❌ Intakes: No response
)

if exist users_response.json (
    echo ✅ Users: Response received
    for /f %%i in ('type users_response.json ^| find "email" /c') do echo    - Found %%i users
) else (
    echo ❌ Users: No response
)

echo.
echo 🏁 Admin API testing completed!
echo Check the *_response.json files for detailed results.

pause