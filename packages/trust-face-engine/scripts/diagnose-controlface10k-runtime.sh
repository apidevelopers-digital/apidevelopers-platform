#!/usr/bin/env bash
set -euo pipefail

notice() {
  local title="$1"
  local msg="$2"
  echo "::notice title=${title}::${msg}"
}

warn() {
  local title="$1"
  local msg="$2"
  echo "::warning title=${title}::${msg}"
}

notice "Trust Face runtime diagnostic" "runner=${RUNNER_NAME:-unknown} os=${RUNNER_OS:-unknown} arch=${RUNNER_ARCH:-unknown} macos=$(sw_vers -productVersion 2>/dev/null || echo unknown)"

for tool in docker podman colima limactl nerdctl finch; do
  if command -v "$tool" >/dev/null 2>&1; then
    path="$(command -v "$tool")"
    version="$("$tool" --version 2>/dev/null | head -n 1 || true)"
    notice "Container runtime candidate" "tool=${tool} path=${path} version=${version:-unknown}"
  else
    notice "Container runtime absent" "tool=${tool}"
  fi
done

if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    notice "Docker daemon" "ready=true"
  else
    warn "Docker daemon" "ready=false"
  fi
fi

declare -a candidates=()
for cmd in python3 python3.14 python3.13 python3.12 python3.11 python3.10 python3.9; do
  if command -v "$cmd" >/dev/null 2>&1; then
    p="$(command -v "$cmd")"
    candidates+=("$p")
  fi
done

while IFS= read -r p; do
  [[ -n "$p" && -x "$p" ]] && candidates+=("$p")
done < <(
  {
    find /usr/local/bin /opt/homebrew/bin /Library/Frameworks/Python.framework/Versions -maxdepth 3 -type f -name 'python3*' 2>/dev/null || true
  } | sort -u
)

declare -A seen=()
exact_count=0
for p in "${candidates[@]:-}"; do
  [[ -n "$p" ]] || continue
  rp="$(python3 - "$p" <<'PY'
import os, sys
print(os.path.realpath(sys.argv[1]))
PY
)"
  [[ -z "${seen[$rp]:-}" ]] || continue
  seen[$rp]=1

  pyver="$("$p" -c 'import sys; print(".".join(map(str, sys.version_info[:3])))' 2>/dev/null || echo unavailable)"
  cvver="$("$p" -c 'import cv2; print(cv2.__version__)' 2>/dev/null || echo absent)"
  notice "Python runtime candidate" "path=${rp} python=${pyver} cv2=${cvver}"

  if [[ "$cvver" == "4.13.0" ]]; then
    exact_count=$((exact_count + 1))
  fi
done

if [[ "$exact_count" -gt 0 ]]; then
  notice "Exact OpenCV runtime" "opencv=4.13.0 candidates=${exact_count}"
else
  warn "Exact OpenCV runtime" "opencv=4.13.0 candidates=0"
fi

notice "Trust Face runtime diagnostic complete" "benchmarkExecuted=false machineMutation=false"
