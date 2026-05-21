#!/usr/bin/env bash
# Double-click launcher for macOS. Pairs with leon.bat (Windows).
# After first checkout the user may need to run:  chmod +x leon.command

set -u
cd "$(dirname "$0")" || exit 1

pause_and_exit() {
  echo
  echo "[LEON] Press Enter to close this window."
  read -r _
  exit "${1:-0}"
}

if ! command -v node >/dev/null 2>&1; then
  echo "[LEON] Node.js not found in PATH."
  echo "[LEON] Install Node 20+ from https://nodejs.org and re-run leon.command."
  pause_and_exit 1
fi

if [ ! -d node_modules ]; then
  echo "[LEON] First run - installing dependencies..."
  if ! npm install; then
    echo "[LEON] npm install failed. Aborting."
    pause_and_exit 1
  fi
fi

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    echo "[LEON] No .env found. Copying .env.example -> .env"
    cp .env.example .env
    echo "[LEON] Please edit .env with your API keys, then re-run leon.command"
    pause_and_exit 0
  else
    echo "[LEON] No .env and no .env.example found. Create .env manually."
    pause_and_exit 1
  fi
fi

./node_modules/.bin/tsx src/index.tsx
status=$?
if [ "$status" -ne 0 ]; then
  echo
  echo "[LEON] Crashed with exit code $status. See error above."
  pause_and_exit "$status"
fi
