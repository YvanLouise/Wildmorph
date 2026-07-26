@echo off
setlocal
cd /d "%~dp0"
title Wildmorph Developer Tuning Console

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js was not found. Install Node.js and try again.
  echo.
  pause
  exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo.
  echo [ERROR] npm was not found. Reinstall Node.js and try again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\vite\package.json" (
  echo.
  echo First launch: installing project dependencies...
  call npm.cmd install --cache ".npm-cache" --prefer-offline --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo [ERROR] Dependency installation failed. Check the network and try again.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo Starting the Wildmorph developer tuning console...
echo Keep this window open while using the console.
echo Press Ctrl+C to stop the local server.
echo.
call npm.cmd run tune

if errorlevel 1 (
  echo.
  echo [ERROR] The developer tuning console failed to start.
  echo.
  pause
)

endlocal
