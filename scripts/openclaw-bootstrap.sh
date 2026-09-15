#!/usr/bin/env bash

set -euo pipefail
umask 077

scripts_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "${scripts_dir}/openclaw-env.sh"

force_requested=false
if [[ $# -gt 1 ]]; then
  printf 'Usage: %s [--force]\n' "$0" >&2
  exit 64
fi
case "${1:-}" in
  "") ;;
  --force) force_requested=true ;;
  *)
    printf 'Usage: %s [--force]\n' "$0" >&2
    exit 64
    ;;
esac

persona_node_exec "${scripts_dir}/prepare-openclaw-layout.mjs" --root "${PERSONA_ROOT}"

if [[ ! -e "${OPENCLAW_CONFIG_PATH}" || "${force_requested}" == true ]]; then
  if [[ "${force_requested}" == true ]]; then
    persona_node_exec "${scripts_dir}/render-openclaw-config.mjs" \
      --root "${PERSONA_ROOT}" \
      --template "${PERSONA_ROOT}/config/openclaw.template.json" \
      --output "${OPENCLAW_CONFIG_PATH}" \
      --force
  else
    persona_node_exec "${scripts_dir}/render-openclaw-config.mjs" \
      --root "${PERSONA_ROOT}" \
      --template "${PERSONA_ROOT}/config/openclaw.template.json" \
      --output "${OPENCLAW_CONFIG_PATH}"
  fi
else
  printf 'Kept existing isolated config at %s\n' "${OPENCLAW_CONFIG_PATH}"
fi

persona_node_exec "${scripts_dir}/ensure-gateway-auth.mjs" \
  --root "${PERSONA_ROOT}" \
  --config "${OPENCLAW_CONFIG_PATH}"

persona_node_exec "${scripts_dir}/check-openclaw-isolation.mjs" --skip-runtime --skip-port >/dev/null

printf 'Prepared isolated OpenClaw directories under %s\n' "${PERSONA_OPENCLAW_ROOT}"
printf 'No account login, Gateway process, or service was started.\n'
