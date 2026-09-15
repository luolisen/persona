#!/usr/bin/env bash

set -euo pipefail
umask 077

readonly openclaw_version="2026.7.1-2"
scripts_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "${scripts_dir}/openclaw-env.sh"

if [[ $# -ne 0 ]]; then
  printf 'Usage: %s\n' "$0" >&2
  exit 64
fi

node_version="$(persona_node_exec -p 'process.versions.node')"
persona_node_exec "${scripts_dir}/node-engine-check.mjs" "${node_version}"

"${scripts_dir}/openclaw-bootstrap.sh"

local_cli="$(persona_node_exec "${scripts_dir}/validate-openclaw-runtime.mjs" \
  --root "${PERSONA_ROOT}" \
  --runtime "${PERSONA_OPENCLAW_RUNTIME}" \
  --allow-missing-cli)"
if [[ ! -e "${local_cli}" ]]; then
  persona_npm_exec install \
    --prefix "${PERSONA_OPENCLAW_RUNTIME}" \
    --cache "${PERSONA_OPENCLAW_ROOT}/npm-cache" \
    --no-save \
    --package-lock=false \
    --ignore-scripts \
    --no-audit \
    --no-fund \
    "openclaw@${openclaw_version}"
fi

persona_node_exec "${scripts_dir}/validate-openclaw-runtime.mjs" \
  --root "${PERSONA_ROOT}" \
  --runtime "${PERSONA_OPENCLAW_RUNTIME}" >/dev/null

installed_version="$(persona_node_exec -p "require('${PERSONA_OPENCLAW_RUNTIME}/node_modules/openclaw/package.json').version")"
if [[ "${installed_version}" != "${openclaw_version}" ]]; then
  printf 'Unexpected project-local OpenClaw version: %s (expected %s)\n' "${installed_version}" "${openclaw_version}" >&2
  exit 65
fi

"${scripts_dir}/openclaw-isolation-check.sh"
"${scripts_dir}/openclaw-persona.sh" config validate
"${scripts_dir}/openclaw-persona.sh" --version

printf 'Installed and validated project-local OpenClaw %s; no Gateway or account login was started.\n' "${installed_version}"
