@echo off
setlocal
cd /d "%~dp0"

if not exist node_modules (
  echo [LEON] First run - installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [LEON] npm install failed. Aborting.
    pause
    exit /b 1
  )
)

if not exist .env (
  echo [LEON] No .env found. Copying .env.example -^> .env
  copy /Y .env.example .env >nul
  echo [LEON] Please edit .env with your API keys, then re-run leon.bat
  pause
  exit /b 0
)

"%~dp0node_modules\.bin\tsx.cmd" src/index.tsx
if errorlevel 1 (
  echo.
  echo [LEON] Crashed with exit code %errorlevel%. See error above.
  pause
)
endlocal
