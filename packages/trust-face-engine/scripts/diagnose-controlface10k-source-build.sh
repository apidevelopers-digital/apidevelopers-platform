#!/usr/bin/env bash
set -euo pipefail

notice() { echo "::notice title=$1::$2"; }
warn() { echo "::warning title=$1::$2"; }

py_prefix="$(brew --prefix python@3.11 2>/dev/null || true)"
py=""
if [ -n "$py_prefix" ] && [ -x "$py_prefix/bin/python3.11" ]; then
  py="$py_prefix/bin/python3.11"
fi

tool_state=""
for tool in git cmake ninja clang xcode-select; do
  if command -v "$tool" >/dev/null 2>&1; then
    ver="$("$tool" --version 2>/dev/null | head -n 1 || true)"
    tool_state="${tool_state}${tool}=present(${ver:-unknown});"
  else
    tool_state="${tool_state}${tool}=absent;"
  fi
done

if [ -n "$py" ]; then
  pyver="$("$py" -c 'import sys; print(".".join((map(str,sys.version_info[:3]))))')"
  pipver="$("$py" -m pip --version 2>/dev/null | head -n 1 || true)"
  py_state="python3.11=${pyver};pip=${pipver:-absent};path=${py}"
else
  py_state="python3.11=absent"
fi

temp="${RUNNER_TEMP:-/tmp}"
dash_kb="$(df -Pk "$temp" | awk 'NR==2{print $4}')"
disk_gb="$(python3 - "$dash_kb" <<'PY'
import sys
print(round(int(sys.argv[1]) / 1024 / 1024, 2))
PY
)"

notice "OpenCV 4.13 source-build preflight" "${py_state};${tool_state}freeGiB=${disk_gb};benchmarkExecuted=false;machineMutation=false"

if [ -z "$py" ]; then
  warn "Source-build readiness" "ready=false reason=python3.11_missing"
elif ! command -v git >/dev/null 2>&1 || ! command -v clang >/dev/null 2>&1; then
  warn "Source-build readiness" "ready=false reason=core_build_tool_missing"
else
  notice "Source-build readiness" "ready=true globalInstall=false tempBuildOnly=true"
fi
