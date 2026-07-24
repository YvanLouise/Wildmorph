@echo off
setlocal
cd /d "%~dp0"
title Tuye Demo 0.1

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js was not found. Install Node.js and try again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\vite\package.json" (
  echo.
  echo First launch: installing game dependencies...
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
echo Starting Tuye...
node "scripts\launch-game.mjs"

if errorlevel 1 (
  echo.
  echo [ERROR] Game launch failed. Keep the error message above for diagnosis.
  echo.
  pause
)

endlocal
