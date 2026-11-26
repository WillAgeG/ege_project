#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${ROOT_DIR}/admin_streamlit"
HOST="${ADMIN_HOST:-127.0.0.1}"
PORT="${ADMIN_PORT:-8501}"
PID_FILE="${ADMIN_PID_FILE:-/tmp/vektor-admin-streamlit.pid}"
LOG_FILE="${ADMIN_LOG_FILE:-/tmp/vektor-admin-streamlit.log}"
CURL_BIN="$(command -v curl || echo /usr/bin/curl)"

pick_python() {
  local admin_py="${APP_DIR}/.venv/bin/python"
  if [ -x "$admin_py" ]; then
    echo "$admin_py"
    return 0
  fi
  if command -v python3 >/dev/null 2>&1 && python3 -c "import streamlit" >/dev/null 2>&1; then
    command -v python3
    return 0
  fi
  echo "Streamlit not installed. Run: python3 -m venv admin_streamlit/.venv && admin_streamlit/.venv/bin/python -m pip install -r admin_streamlit/requirements.txt" >&2
  exit 1
}

is_running() {
  if [ -f "$PID_FILE" ]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  return 1
}

cmd_start() {
  if is_running; then
    echo "vektor-admin-streamlit already running (PID $(cat "$PID_FILE")) on http://${HOST}:${PORT}"
    return 0
  fi
  rm -f "$PID_FILE"
  local py
  py="$(pick_python)"
  export ADMIN_API_BASE_URL="${ADMIN_API_BASE_URL:-http://127.0.0.1:8770}"
  (
    cd "$ROOT_DIR"
    nohup "$py" -m streamlit run "${APP_DIR}/app.py" \
      --server.headless true \
      --server.address "$HOST" \
      --server.port "$PORT" \
      --browser.gatherUsageStats false \
      >"$LOG_FILE" 2>&1 </dev/null &
    echo $! > "$PID_FILE"
  )
  local pid
  pid="$(cat "$PID_FILE")"
  for _ in $(seq 1 50); do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "vektor-admin-streamlit failed to start; see $LOG_FILE" >&2
      cat "$LOG_FILE" >&2 || true
      rm -f "$PID_FILE"
      exit 1
    fi
    if "$CURL_BIN" -sf "http://${HOST}:${PORT}/_stcore/health" >/dev/null 2>&1; then
      echo "vektor-admin-streamlit started (PID ${pid}) on http://${HOST}:${PORT}"
      return 0
    fi
    sleep 0.3
  done
  echo "vektor-admin-streamlit timed out waiting for /_stcore/health; see $LOG_FILE" >&2
  cat "$LOG_FILE" >&2 || true
  exit 1
}

cmd_stop() {
  if is_running; then
    local pid
    pid="$(cat "$PID_FILE")"
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 25); do
      if ! kill -0 "$pid" 2>/dev/null; then
        break
      fi
      sleep 0.1
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
    echo "vektor-admin-streamlit stopped"
  else
    rm -f "$PID_FILE"
    echo "vektor-admin-streamlit not running"
  fi
}

cmd_status() {
  if is_running; then
    echo "vektor-admin-streamlit running (PID $(cat "$PID_FILE")) on http://${HOST}:${PORT}"
  else
    echo "vektor-admin-streamlit stopped"
    return 1
  fi
}

case "${1:-status}" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
  restart)
    cmd_stop
    cmd_start
    ;;
  *)
    echo "Usage: $0 {start|stop|status|restart}" >&2
    exit 2
    ;;
esac
