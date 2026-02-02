@echo off
REM Redirect yarn calls to bun for Vercel dev compatibility
bun %*
