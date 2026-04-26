#!/usr/bin/env bash
# Auto-start all offline-translate servers in the background.
# Logs go to /tmp/offline-translate-<name>.log
# PIDs go to /tmp/offline-translate-<name>.pid
# Run from the repo root. Assumes ./whisper.cpp exists in CWD.
#
# Usage:
#   ./scripts/auto-start-all.sh           # start all servers
#   ./scripts/auto-start-all.sh stop      # stop all servers
#   ./scripts/auto-start-all.sh status    # show pid + liveness
#   ./scripts/auto-start-all.sh restart   # stop then start
#
# Tail all logs at once:
# tail -F /tmp/offline-translate-*.log

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WHISPER_DIR="${REPO_ROOT}/whisper.cpp"
WHISPER_BIN="${WHISPER_DIR}/build/bin/whisper-server"
LOG_DIR="/tmp"
LOG_PREFIX="offline-translate"

# Prefer the repo's virtualenv — the system python3 (anaconda) has the wrong
# versions of transformers/av for these servers.
if [[ -x "${REPO_ROOT}/.venv/bin/python" ]]; then
  PYTHON="${REPO_ROOT}/.venv/bin/python"
else
  PYTHON="python3"
fi

# whisper.cpp was built with an rpath that hardcodes an absolute path outside
# this repo, so whisper-server can't find its dylibs. Point the dynamic loader
# at the real build output dirs instead.
WHISPER_DYLD="${WHISPER_DIR}/build/src:${WHISPER_DIR}/build/ggml/src:${WHISPER_DIR}/build/ggml/src/ggml-blas:${WHISPER_DIR}/build/ggml/src/ggml-metal"
WHISPER_ENV="DYLD_LIBRARY_PATH=${WHISPER_DYLD} DYLD_FALLBACK_LIBRARY_PATH=${WHISPER_DYLD}"

# name | cwd | command...
SERVICES=(
  "whisper-en2wo|${WHISPER_DIR}|${WHISPER_ENV} ${WHISPER_BIN} --port 8080 -m models/whisper-medium-english-2-wolof.gguf"
  "translate|${REPO_ROOT}|${PYTHON} translate.py --port 8000"
  "wolof-speech|${REPO_ROOT}|${PYTHON} wolof_speech_server.py --port 8001"
  "whisper-wo|${WHISPER_DIR}|${WHISPER_ENV} ${WHISPER_BIN} --port 8081 -m models/whisper-small-wolof.gguf"
  "wolof2en|${REPO_ROOT}|${PYTHON} wolof_to_english_translate_server.py --port 8002"
  "web|${REPO_ROOT}|${PYTHON} web_server.py"
)

log_file() { echo "${LOG_DIR}/${LOG_PREFIX}-$1.log"; }
pid_file() { echo "${LOG_DIR}/${LOG_PREFIX}-$1.pid"; }

is_running() {
  local pidf; pidf="$(pid_file "$1")"
  [[ -f "$pidf" ]] || return 1
  local pid; pid="$(cat "$pidf" 2>/dev/null || true)"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

start_one() {
  local name="$1" cwd="$2" cmd="$3"
  local logf pidf
  logf="$(log_file "$name")"
  pidf="$(pid_file "$name")"

  if is_running "$name"; then
    echo "[skip] $name already running (pid $(cat "$pidf"))"
    return 0
  fi

  if [[ ! -d "$cwd" ]]; then
    echo "[error] $name: working dir not found: $cwd" >&2
    return 1
  fi

  echo "[start] $name  ->  $logf"
  (
    cd "$cwd"
    # shellcheck disable=SC2086
    nohup bash -c "$cmd" >"$logf" 2>&1 &
    echo $! >"$pidf"
  )
}

stop_one() {
  local name="$1"
  local pidf; pidf="$(pid_file "$name")"
  if ! is_running "$name"; then
    echo "[skip] $name not running"
    rm -f "$pidf"
    return 0
  fi
  local pid; pid="$(cat "$pidf")"
  echo "[stop]  $name (pid $pid)"
  kill "$pid" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.3
  done
  kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
  rm -f "$pidf"
}

status_one() {
  local name="$1"
  if is_running "$name"; then
    echo "  $name: running (pid $(cat "$(pid_file "$name")")) log=$(log_file "$name")"
  else
    echo "  $name: stopped"
  fi
}

cmd_start() {
  if [[ ! -x "$WHISPER_BIN" ]]; then
    echo "[error] whisper-server binary not found or not executable: $WHISPER_BIN" >&2
    echo "        build whisper.cpp first (e.g. cmake -B build && cmake --build build -j)" >&2
    exit 1
  fi
  for entry in "${SERVICES[@]}"; do
    IFS='|' read -r name cwd cmd <<< "$entry"
    start_one "$name" "$cwd" "$cmd"
  done
  echo
  echo "All servers launched. Tail logs with:"
  echo "  tail -F ${LOG_DIR}/${LOG_PREFIX}-*.log"
}

cmd_stop() {
  # stop in reverse order so the web frontend dies first
  for (( i=${#SERVICES[@]}-1; i>=0; i-- )); do
    IFS='|' read -r name _ _ <<< "${SERVICES[$i]}"
    stop_one "$name"
  done
}

cmd_status() {
  echo "offline-translate services:"
  for entry in "${SERVICES[@]}"; do
    IFS='|' read -r name _ _ <<< "$entry"
    status_one "$name"
  done
}

case "${1:-start}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  status)  cmd_status ;;
  restart) cmd_stop; cmd_start ;;
  *) echo "usage: $0 [start|stop|status|restart]" >&2; exit 2 ;;
esac
