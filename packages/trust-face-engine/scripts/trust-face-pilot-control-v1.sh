#!/usr/bin/env bash
set -euo pipefail

state_dir="${TRUST_FACE_PILOT_STATE_DIR:-$HOME/.cache/apidevelopers-digital/trust-face/pilot-control}"
state_file="$state_dir/state"
cmd="${1:-status}"

mkdir -p "$state_dir"

read_state() {
  if [[ -f "$state_file" ]]; then
    cat "$state_file"
  else
    printf '%s\n' "disabled"
  fi
}

case "$cmd" in
  status)
    printf '{"version":"trust-face-pilot-control/v1","state":"%s","productionAuthorized":false}\n' "$(read_state)"
    ;;
  disable|kill)
    printf '%s\n' "disabled" > "$state_file"
    printf '{"version":"trust-face-pilot-control/v1","state":"disabled","killSwitchApplied":true,"productionAuthorized":false}\n'
    ;;
  enable)
    if [[ "${TRUST_FACE_PILOT_ENABLE_CONFIRMATION:-}" != "IGOR_APROVA_PILOTO_LOCAL" ]]; then
      printf '%s\n' "disabled" > "$state_file"
      printf '{"error":"pilot_enable_confirmation_required","state":"disabled","productionAuthorized":false}\n' >&2
      exit 42
    fi
    printf '%s\n' "enabled" > "$state_file"
    printf '{"version":"trust-face-pilot-control/v1","state":"enabled","productionAuthorized":false}\n'
    ;;
  *)
    printf '{"error":"pilot_control_command_invalid","productionAuthorized":false}\n' >&2
    exit 2
    ;;
esac
