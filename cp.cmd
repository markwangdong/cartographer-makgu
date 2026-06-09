@echo off
set "SRC=%~1"
set "DST=%~2"

if not exist ".git\hooks" mkdir ".git\hooks"

powershell -NoProfile -ExecutionPolicy Bypass -Command "Copy-Item -LiteralPath '%SRC%' -Destination '%DST%' -Force"
exit /b %ERRORLEVEL%
