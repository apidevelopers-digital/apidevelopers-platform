#!/usr/bin/env bash
set -euo pipefail

notice() {
  echo "::notice title=$1::$2"
}

warn() {
  echo "::warning title=$1::$2"
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

exact_count=0
seen_paths="|"
for cmd in python3 python3.14 python3.13 python3.12 python3.11 python3.10 python3.9; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    notice "Python command absent" "command=${cmd}"
    continue
  fi

  p="$(command -v "$cmd")"
  rp="$("$p" -c 'import os,sys; print(os.path.realpath(sys.executable))' 2>/dev/null || echo "$p")"
  case "$seen_paths" in
    *"|$rp|") continue ;;
  esac
  seen_paths="${seen_paths}${rp}|"

  pyver="$("$p" -c 'import sys; print(".".join(map(str, sys.version_info[:3])))' 2>/dev/null || echo unavailable)"
  cvver="$("$p" -c 'import cv2; print(cv2.__version__)' 2>/dev/null || echo absent)"
  notice "Python runtime candidate" "command=${cmd} path=${rp} python=${pyver} cv2=${cvver}"

  if [ "$cvver" = "4.13.0" ]; then
    exact_count=$(exact_count + 1)
  fi
done

if [ "$exact_count" -gt 0 ]; then
  notice "Exact OpenCV runtime" "opencv=4.13.0 candidates=${exact_count}"
else
  warn "Exact OpenCV runtime" "opencv=4.13.0 candidates=0"
fi

notice "Trust Face runtime diagnostic complete" "benchmarkExecuted=false machineMutation=false"
