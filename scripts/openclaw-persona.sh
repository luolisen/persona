#!/usr/bin/env bash

set -euo pipefail

scripts_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "${scripts_dir}/openclaw-env.sh"

# Phase 0 has one reviewed plugin installation path. Keep the generic CLI
# wrapper from becoming an arbitrary package installer even though its target
# state directory is project-local.
readonly approved_weixin_plugin_spec="npm:@tencent-weixin/openclaw-weixin@2.4.6"

if [[ "${1:-}" == "env" ]]; then
  if [[ $# -ne 1 ]]; then
    printf 'Usage: %s env\n' "$0" >&2
    exit 64
  fi
  printf 'PERSONA_ROOT=%s\n' "${PERSONA_ROOT}"
  printf 'OPENCLAW_HOME=%s\n' "${OPENCLAW_HOME}"
  printf 'OPENCLAW_PROFILE=%s\n' "${OPENCLAW_PROFILE}"
  printf 'OPENCLAW_STATE_DIR=%s\n' "${OPENCLAW_STATE_DIR}"
  printf 'OPENCLAW_CONFIG_PATH=%s\n' "${OPENCLAW_CONFIG_PATH}"
  printf 'OPENCLAW_GATEWAY_PORT=%s\n' "${OPENCLAW_GATEWAY_PORT}"
  exit 0
fi

reject() {
  printf 'Rejected by the Phase 0 OpenClaw wrapper: %s\n' "$1" >&2
  exit 64
}

if [[ $# -eq 0 ]]; then
  reject 'an explicit approved command is required'
fi

# These options can redirect config/state, select another profile/container,
# expose the Gateway, reset data, or pass credentials from an outer context.
# Reject them wherever they occur, including --flag=value spelling.
for argument in "$@"; do
  case "${argument}" in
    --agent-dir|--agent-dir=*|--allow-unconfigured|--auth|--auth=*|--bind|--bind=*|--config|--config=*|--config-path|--config-path=*|--container|--container=*|--cwd|--cwd=*|--dev|--dev=*|--force|--home|--home=*|--host|--host=*|--output|--output=*|--password|--password=*|--password-file|--password-file=*|--port|--port=*|--profile|--profile=*|--public-url|--public-url=*|--raw-stream|--raw-stream-path|--raw-stream-path=*|--remote|--reset|--state-dir|--state-dir=*|--store|--store=*|--tailscale|--tailscale=*|--tailscale-reset-on-exit|--token|--token=*|--token-file|--token-file=*|--url|--url=*|--workspace|--workspace=*|--workspace-root|--workspace-root=*)
      reject "unsafe override ${argument}"
      ;;
  esac
done

# Phase 0 only needs these non-interactive operations. Keeping a narrow
# allowlist prevents accidental login, messaging, model invocation, service
# management, or a future command whose side effects have not been audited.
case "${1}" in
  --version|-V|--help|-h)
    [[ $# -eq 1 ]] || reject "${1} does not accept additional arguments here"
    ;;
  config)
    [[ $# -eq 2 && ( "${2}" == "validate" || "${2}" == "file" ) ]] || reject 'only config validate and config file are allowed in Phase 0'
    ;;
  plugins)
    case "${2:-}" in
      install)
        [[ $# -eq 4 && "${3}" == "${approved_weixin_plugin_spec}" && "${4}" == "--pin" ]] || reject 'only the pinned reviewed Weixin plugin install is allowed in Phase 0'
        ;;
      list)
        [[ $# -eq 2 || ( $# -eq 3 && "${3}" == "--json" ) ]] || reject 'only plugins list and plugins list --json are allowed in Phase 0'
        ;;
      *)
        reject 'only the pinned reviewed Weixin plugin install and plugins list are allowed in Phase 0'
        ;;
    esac
    ;;
  gateway)
    [[ $# -ge 2 && ( "${2}" == "run" || "${2}" == "status" || "${2}" == "health" ) ]] || reject 'only gateway run, status, and health are allowed in Phase 0'
    if [[ "${2}" == "run" && $# -ne 2 ]]; then
      reject 'gateway run accepts no overrides in Phase 0'
    fi
    ;;
  security)
    [[ $# -ge 2 && "${2}" == "audit" ]] || reject 'only security audit is allowed in Phase 0'
    ;;
  *)
    reject "command ${1} is outside the Phase 0 allowlist"
    ;;
esac

if [[ "${1}" == "gateway" && "${2:-}" == "run" ]]; then
  "${scripts_dir}/openclaw-isolation-check.sh" >/dev/null
else
  "${scripts_dir}/openclaw-isolation-check.sh" --skip-port >/dev/null
fi

local_cli="$(persona_node_exec "${scripts_dir}/validate-openclaw-runtime.mjs" \
  --root "${PERSONA_ROOT}" \
  --runtime "${PERSONA_OPENCLAW_RUNTIME}")"

persona_openclaw_exec_replace "${PERSONA_NODE_BIN}" "${local_cli}" "$@"
