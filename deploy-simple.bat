@echo off
set PATH=C:\Program Files\nodejs;%PATH%
cd /d "%~dp0"
echo Installing dependencies...
call npm install
if errorlevel 1 exit /b 1
echo Building...
call npm run build:prod
if errorlevel 1 exit /b 1
echo Deploying...
call npm run deploy
