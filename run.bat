@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node.js 20+ first.
  pause
  exit /b 1
)
if not exist .env copy /Y .env.example .env >nul
if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)
echo Starting Latticefolk...
call npm run dev
