@echo off
set PATH=C:\Program Files\nodejs;%PATH%
cd /d "%~dp0"
call npm run build:prod
if errorlevel 1 exit /b 1
call npm run deploy
