@echo off
cd /d "%~dp0"
set "NODE_CMD=node"
where node >nul 2>nul
if errorlevel 1 set "NODE_CMD=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_CMD%" (
  echo Node.js was not found.
  echo Install Node.js 18 or later, then run start.bat again.
  pause
  exit /b 1
)
"%NODE_CMD%" server.js
if errorlevel 1 pause
