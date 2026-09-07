#!/usr/bin/env bash
set -euo pipefail

notice() { echo "::notice title=$1::$2"; }
warn() { echo "::warning title=$1::$2"; }

notice "Homebrew OpenCV diagnostic" "runner=${RUNNER_NAME:-unknown} benchmarkExecuted=false machineMutation=false"

if ! command -v brew >/dev/null 2>&1; then
  warn "Homebrew" "present=false"
  exit 0
fi

brew_path="$(command -v brew)"
brew_ver="$(brew --version 2>/dev/null | head -n 1 || true)"
notice "Homebrew" "present=true path=${brew_path} version=${brew_ver:-unknown}"

for formula in opencv opencv@4 python@3.14 python@3.13 python@3.12 python@3.11; do
  ver="$(brew list --versions "$formula" 2>/dev/null || true)"
  if [ -n "$ver" ]; then
    notice "Homebrew formula" "formula=${formula} installed=${ver}"
  else
    notice "Homebrew formula" "formula=${formula} installed=false"
  fi
done

if command -v pkg-config >/dev/null 2>&1; then
  ocv="$(pkg-config --modversion opencv4 2>/dev/null || true)"
  if [ -n "$ocv" ]; then
    notice "pkg-config OpenCV" "version=${ocv}"
  else
    notice "pkg-config OpenCV" "version=absent"
  fi
fi

found_py=0
for p in /usr/local/Cellar/python@3.14/*/bin/python3.14 \
         /usr/local/Cellar/python@3.13/*/bin/python3.13 \
         /usr/local/Cellar/python@3.12/*/bin/python3.12 \
         /usr/local/Cellar/python@3.11/*/bin/python3.11 \
         /opt/homebrew/Cellar/python@3.14/*/bin/python3.14 \
         /opt/homebrew/Cellar/python@3.13/*/bin/python3.13 \
         /opt/homebrew/Cellar/python@3.12/*/bin/python3.12 \
         /opt/homebrew/Cellar/python@3.11/*/bin/python3.11; do
  [ -x "$p" ] || continue
  found_py=$((found_py + 1))
  pyver="$("$p" -c 'import sys; print(".".join(map(str, sys.version_info[:3])))' 2>/dev/null || echo unavailable)"
  cvver="$("$p" -c 'import cv2; print(cv2.__version__)' 2>/dev/null || echo absent)"
  notice "Homebrew Python keg" "path=${p} python=${pyver} cv2=${cvver}"
done
[ "$found_py" -gt 0 ] || notice "Homebrew Python keg" "candidates=0"

found_cv=0
for root in /usr/local/Cellar/opencv /opt/homebrew/Cellar/opencv; do
  [ -d "$root" ] || continue
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    found_cv=$(found_cv + 1)
    notice "OpenCV binding candidate" "path=${f}"
  done < <(find "$root" -maxdepth 8 -type f \( -name 'cv2*.so' -o -name 'cv%2*.dylib' \) 2>/dev/null | head -n 10)
done
[ "$found_cv" -gt 0 ] || notice "OpenCV binding candidate" "count=0"

notice "Homebrew OpenCV diagnostic complete" "benchmarkExecuted=false machineMutation=false"
