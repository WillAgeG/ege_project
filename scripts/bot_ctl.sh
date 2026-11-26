#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="${TG_BOT_PID_FILE:-/tmp/vektor-telegram-bot.pid}"
LOG_FILE="${TG_BOT_LOG_FILE:-/tmp/vektor-telegram-bot.log}"
PY_BIN="${ROOT_DIR}/.venv/bin/python"

if [ ! -x "$PY_BIN" ]; then
  echo "Python venv not found at $PY_BIN" >&2
  exit 1
fi

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

require_token() {
  if [ -z "${TELEGRAM_BOT_TOKEN:-}" ]; then
    echo "TELEGRAM_BOT_TOKEN не задан. Экспортируйте TELEGRAM_BOT_TOKEN=... перед запуском бота." >&2
    exit 1
  fi
}

cmd_start() {
  if is_running; then
    echo "vektor-telegram-bot already running (PID $(cat "$PID_FILE"))"
    return 0
  fi
  require_token
  rm -f "$PID_FILE"
  (
    cd "$ROOT_DIR"
    nohup "$PY_BIN" -m backend.telegram_bot >"$LOG_FILE" 2>&1 </dev/null &
    echo $! > "$PID_FILE"
  )
  sleep 0.5
  local pid
  pid="$(cat "$PID_FILE")"
  if kill -0 "$pid" 2>/dev/null; then
    echo "vektor-telegram-bot started (PID ${pid}) · log: $LOG_FILE"
  else
    echo "vektor-telegram-bot failed to start; see $LOG_FILE" >&2
    cat "$LOG_FILE" >&2 || true
    rm -f "$PID_FILE"
    exit 1
  fi
}

cmd_stop() {
  if is_running; then
    local pid
    pid="$(cat "$PID_FILE")"
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 20); do
      if ! kill -0 "$pid" 2>/dev/null; then
        break
      fi
      sleep 0.1
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
    echo "vektor-telegram-bot stopped"
  else
    rm -f "$PID_FILE"
    echo "vektor-telegram-bot not running"
  fi
}

cmd_status() {
  if is_running; then
    echo "vektor-telegram-bot running (PID $(cat "$PID_FILE"))"
  else
    echo "vektor-telegram-bot stopped"
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
  logs)
    tail -n "${2:-60}" "$LOG_FILE" 2>/dev/null || echo "No logs at $LOG_FILE"
    ;;
  info)
    require_token
    cd "$ROOT_DIR" && "$PY_BIN" -m backend.telegram_bot --info
    ;;
  set-webhook)
    require_token
    if [ -z "${2:-}" ]; then
      echo "Usage: $0 set-webhook https://your-domain/api/telegram/webhook" >&2
      exit 2
    fi
    cd "$ROOT_DIR" && "$PY_BIN" -m backend.telegram_bot --set-webhook "$2"
    ;;
  *)
    echo "Usage: $0 {start|stop|status|restart|logs|info|set-webhook <url>}" >&2
    exit 2
    ;;
esac
