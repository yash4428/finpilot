#!/usr/bin/env bash
# Starts FinPilot locally (no Docker): Postgres check → Python ML service → Java API → React dev server.
# Usage:  ./run.sh            start everything
#         ./run.sh --seed     also (re)load the demo data once both backends are up
# Ctrl-C stops all three. Logs go to ./.logs/.
set -euo pipefail
cd "$(dirname "$0")"
ROOT=$(pwd)
mkdir -p .logs

say() { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$*"; exit 1; }
wait_for() { # url name seconds
  for _ in $(seq 1 "$3"); do curl -fs -m 2 "$1" >/dev/null 2>&1 && return 0; sleep 1; done
  fail "$2 did not start. See .logs/$2.log"
}

command -v java >/dev/null || fail "Java 17+ is not installed (brew install openjdk@21)"
command -v node >/dev/null || fail "Node.js is not installed (brew install node)"
pg_isready -q 2>/dev/null || fail "PostgreSQL is not running (brew services start postgresql@16)"

PIDS=()
cleanup() { say "Stopping FinPilot"; for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

# Python ML + agent service
if [ ! -x backend-python/.venv/bin/uvicorn ]; then
  say "Creating Python environment (first run only)"
  PY=$(command -v python3.12 || command -v python3.11 || command -v python3)
  "$PY" -m venv backend-python/.venv
  backend-python/.venv/bin/pip install -q -r backend-python/requirements.txt
fi
say "Starting Python service on :8000"
(cd backend-python && .venv/bin/uvicorn app.main:app --port 8000 > "$ROOT/.logs/python.log" 2>&1) &
PIDS+=($!)

# Java core API
if [ ! -f backend-java/target/finpilot-core.jar ]; then
  command -v mvn >/dev/null || fail "Maven is not installed (brew install maven)"
  say "Building Java backend (first run only)"
  (cd backend-java && mvn -q -DskipTests package)
fi
say "Starting Java API on :8080"
(cd backend-java && java -jar target/finpilot-core.jar > "$ROOT/.logs/java.log" 2>&1) &
PIDS+=($!)

wait_for http://localhost:8000/health python 90
wait_for http://localhost:8080/health java 90

if [ "${1:-}" = "--seed" ]; then
  say "Loading demo data"
  backend-python/.venv/bin/python infra/seed/load.py
fi

# React frontend
[ -d frontend/node_modules ] || { say "Installing frontend packages (first run only)"; (cd frontend && npm install --no-audit --no-fund); }
# Use 5173 unless another app (e.g. a different Vite project) already has it.
WEB_PORT=${WEB_PORT:-5173}
while lsof -nP -iTCP:"$WEB_PORT" -sTCP:LISTEN >/dev/null 2>&1; do WEB_PORT=$((WEB_PORT + 1)); done
say "Starting web app on :$WEB_PORT"
(cd frontend && npm run dev -- --port "$WEB_PORT" --strictPort > "$ROOT/.logs/web.log" 2>&1) &
PIDS+=($!)
wait_for "http://localhost:$WEB_PORT" web 60

say "FinPilot is running → http://localhost:$WEB_PORT   (demo: demo@finpilot.app / demo1234)"
say "Press Ctrl-C to stop."
wait
