#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${SITE_HOST:-127.0.0.1}"
PORT="${SITE_PORT:-8770}"
PID_FILE="${SITE_PID_FILE:-/tmp/vektor-main.pid}"
LOG_FILE="${SITE_LOG_FILE:-/tmp/vektor-main.log}"

pick_python() {
  local main_py="${ROOT_DIR}/.venv/bin/python"
  if [ -x "$main_py" ]; then
    echo "$main_py"
  elif command -v python3 >/dev/null 2>&1; then
    command -v python3
  else
    echo "python3 not found" >&2
    exit 1
  fi
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
    echo "vektor-main already running (PID $(cat "$PID_FILE")) on http://${HOST}:${PORT}"
    return 0
  fi
  rm -f "$PID_FILE"
  local py
  py="$(pick_python)"
  (
    cd "$ROOT_DIR"
    nohup "$py" -m uvicorn backend.main:app --host "$HOST" --port "$PORT" --workers 1 \
      >"$LOG_FILE" 2>&1 </dev/null &
    echo $! > "$PID_FILE"
  )
  local pid
  pid="$(cat "$PID_FILE")"
  for _ in $(seq 1 30); do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "vektor-main failed to start; see $LOG_FILE" >&2
      cat "$LOG_FILE" >&2 || true
      rm -f "$PID_FILE"
      exit 1
    fi
    if curl -sf "http://${HOST}:${PORT}/api/health" >/dev/null 2>&1; then
      echo "vektor-main started (PID ${pid}) on http://${HOST}:${PORT}"
      return 0
    fi
    sleep 0.2
  done
  echo "vektor-main started (PID ${pid}) on http://${HOST}:${PORT}"
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
    echo "vektor-main stopped"
  else
    rm -f "$PID_FILE"
    echo "vektor-main not running"
  fi
}

cmd_status() {
  if is_running; then
    echo "vektor-main running (PID $(cat "$PID_FILE")) on http://${HOST}:${PORT}"
  else
    echo "vektor-main stopped"
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
