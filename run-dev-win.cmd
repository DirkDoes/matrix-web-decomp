@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-dev-win.ps1"

endlocal
