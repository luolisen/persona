#!/usr/bin/env bash
# Source this file from project-owned entry points only. OpenClaw's bootstrap
# selects config/state from environment variables, so every eventual CLI/npm
# process is launched with `env -i` below rather than inheriting this shell.

set -euo pipefail

# Clear the selector names observed in OpenClaw's pre-bootstrap source in the
# caller as defense in depth. `env -i` below is the actual complete boundary:
# it drops every inherited OPENCLAW_* value, including names added upstream.
unset ANDROID_DATA HOMEDRIVE HOMEPATH PREFIX USERPROFILE
unset OPENCLAW_AGENT_DIR OPENCLAW_BUNDLED_PLUGINS_DIR OPENCLAW_CONFIG_PATH
unset OPENCLAW_CONTAINER OPENCLAW_DISABLE_BUNDLED_PLUGINS OPENCLAW_DISABLE_BUNDLED_SOURCE_OVERLAYS
unset OPENCLAW_DISABLE_CLI_STARTUP_HELP_FAST_PATH OPENCLAW_DISABLE_PERSISTED_PLUGIN_REGISTRY
unset OPENCLAW_GATEWAY_PASSWORD OPENCLAW_GATEWAY_PORT OPENCLAW_GATEWAY_TOKEN OPENCLAW_GATEWAY_URL
unset OPENCLAW_HOME OPENCLAW_INCLUDE_ROOTS OPENCLAW_NIX_MODE OPENCLAW_OAUTH_DIR OPENCLAW_PACKAGE_DIR
unset OPENCLAW_PROFILE OPENCLAW_SERVICE_MARKER OPENCLAW_STATE_DIR OPENCLAW_TEST_FAST OPENCLAW_WORKSPACE_DIR
unset PI_CODING_AGENT_DIR XDG_CACHE_HOME XDG_CONFIG_HOME XDG_DATA_HOME

persona_scripts_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
export PERSONA_ROOT="$(cd -- "${persona_scripts_dir}/.." && pwd -P)"
export PERSONA_OPENCLAW_ROOT="${PERSONA_ROOT}/.openclaw"
export PERSONA_OPENCLAW_RUNTIME="${PERSONA_OPENCLAW_ROOT}/runtime"
export PERSONA_OPENCLAW_TMP="${PERSONA_OPENCLAW_ROOT}/tmp"
export PERSONA_OPENCLAW_PORT="19889"

PERSONA_NODE_BIN="$(command -v node || true)"
PERSONA_NPM_BIN="$(command -v npm || true)"
case "${PERSONA_NODE_BIN}" in
  /*) export PERSONA_NODE_BIN ;;
  *)
    printf 'A Node.js executable with an absolute path is required.\n' >&2
    exit 65
    ;;
esac
if [[ "${PERSONA_NPM_BIN}" == /* ]]; then
  export PERSONA_NPM_BIN
fi

persona_node_dir="${PERSONA_NODE_BIN%/*}"
export PERSONA_SAFE_PATH="${persona_node_dir}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

# OPENCLAW_HOME protects all home-relative fallbacks. Explicit config/state
# selectors remain the primary isolation boundary; XDG roots prevent a library
# invoked by OpenClaw or npm from falling back to the user's real home.
export OPENCLAW_HOME="${PERSONA_OPENCLAW_ROOT}/home"
export OPENCLAW_PROFILE="zhaoying-phase0"
export OPENCLAW_STATE_DIR="${PERSONA_OPENCLAW_ROOT}/state"
export OPENCLAW_CONFIG_PATH="${PERSONA_OPENCLAW_ROOT}/config/openclaw.json"
export OPENCLAW_GATEWAY_PORT="${PERSONA_OPENCLAW_PORT}"

persona_openclaw_exec() {
  /usr/bin/env -i \
    PATH="${PERSONA_SAFE_PATH}" \
    LANG="C" \
    HOME="${OPENCLAW_HOME}" \
    XDG_CACHE_HOME="${OPENCLAW_HOME}/.cache" \
    XDG_CONFIG_HOME="${OPENCLAW_HOME}/.config" \
    XDG_DATA_HOME="${OPENCLAW_HOME}/.local/share" \
    TMPDIR="${PERSONA_OPENCLAW_TMP}" \
    PERSONA_ROOT="${PERSONA_ROOT}" \
    PERSONA_OPENCLAW_ROOT="${PERSONA_OPENCLAW_ROOT}" \
    PERSONA_OPENCLAW_RUNTIME="${PERSONA_OPENCLAW_RUNTIME}" \
    PERSONA_OPENCLAW_TMP="${PERSONA_OPENCLAW_TMP}" \
    PERSONA_OPENCLAW_PORT="${PERSONA_OPENCLAW_PORT}" \
    OPENCLAW_HOME="${OPENCLAW_HOME}" \
    OPENCLAW_PROFILE="${OPENCLAW_PROFILE}" \
    OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR}" \
    OPENCLAW_CONFIG_PATH="${OPENCLAW_CONFIG_PATH}" \
    OPENCLAW_GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT}" \
    "$@"
}

# Only the final CLI wrapper uses this variant. Replacing that shell leaves an
# identifiable foreground Node process, while helper calls above can still
# return normally to their caller.
persona_openclaw_exec_replace() {
  exec /usr/bin/env -i \
    PATH="${PERSONA_SAFE_PATH}" \
    LANG="C" \
    HOME="${OPENCLAW_HOME}" \
    XDG_CACHE_HOME="${OPENCLAW_HOME}/.cache" \
    XDG_CONFIG_HOME="${OPENCLAW_HOME}/.config" \
    XDG_DATA_HOME="${OPENCLAW_HOME}/.local/share" \
    TMPDIR="${PERSONA_OPENCLAW_TMP}" \
    PERSONA_ROOT="${PERSONA_ROOT}" \
    PERSONA_OPENCLAW_ROOT="${PERSONA_OPENCLAW_ROOT}" \
    PERSONA_OPENCLAW_RUNTIME="${PERSONA_OPENCLAW_RUNTIME}" \
    PERSONA_OPENCLAW_TMP="${PERSONA_OPENCLAW_TMP}" \
    PERSONA_OPENCLAW_PORT="${PERSONA_OPENCLAW_PORT}" \
    OPENCLAW_HOME="${OPENCLAW_HOME}" \
    OPENCLAW_PROFILE="${OPENCLAW_PROFILE}" \
    OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR}" \
    OPENCLAW_CONFIG_PATH="${OPENCLAW_CONFIG_PATH}" \
    OPENCLAW_GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT}" \
    "$@"
}

persona_node_exec() {
  persona_openclaw_exec "${PERSONA_NODE_BIN}" "$@"
}

persona_npm_exec() {
  case "${PERSONA_NPM_BIN}" in
    /*) ;;
    *)
      printf 'An npm executable with an absolute path is required.\n' >&2
      return 65
      ;;
  esac
  /usr/bin/env -i \
    PATH="${PERSONA_SAFE_PATH}" \
    LANG="C" \
    HOME="${OPENCLAW_HOME}" \
    XDG_CACHE_HOME="${OPENCLAW_HOME}/.cache" \
    XDG_CONFIG_HOME="${OPENCLAW_HOME}/.config" \
    XDG_DATA_HOME="${OPENCLAW_HOME}/.local/share" \
    TMPDIR="${PERSONA_OPENCLAW_TMP}" \
    NPM_CONFIG_AUDIT="false" \
    NPM_CONFIG_CACHE="${PERSONA_OPENCLAW_ROOT}/npm-cache" \
    NPM_CONFIG_FUND="false" \
    NPM_CONFIG_GLOBAL="false" \
    NPM_CONFIG_UPDATE_NOTIFIER="false" \
    NPM_CONFIG_USERCONFIG="${PERSONA_OPENCLAW_RUNTIME}/npmrc" \
    "${PERSONA_NPM_BIN}" "$@"
}
