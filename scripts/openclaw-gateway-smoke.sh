#!/usr/bin/env bash

# Bounded foreground-process verification. This script starts only the current
# project's Gateway, probes its unauthenticated liveness endpoint, then sends
# TERM to that exact child PID and proves the dedicated ports were released.
set -euo pipefail
umask 077

scripts_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "${scripts_dir}/openclaw-env.sh"

if [[ $# -ne 0 ]]; then
  printf 'Usage: %s\n' "$0" >&2
  exit 64
fi

"${scripts_dir}/openclaw-isolation-check.sh" >/dev/null

verification_dir="${PERSONA_OPENCLAW_ROOT}/verification"
gateway_log="$(mktemp "${verification_dir}/gateway-smoke.XXXXXX")"
health_file="$(mktemp "${verification_dir}/gateway-health.XXXXXX")"
listener_file="$(mktemp "${verification_dir}/gateway-listener.XXXXXX")"
gateway_pid=""

is_listening() {
  /usr/sbin/lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

cleanup() {
  local status=$?
  local attempt
  trap - EXIT INT TERM
  set +e

  if [[ -n "${gateway_pid}" ]] && kill -0 "${gateway_pid}" >/dev/null 2>&1; then
    kill -TERM "${gateway_pid}" >/dev/null 2>&1
    for attempt in {1..15}; do
      if ! kill -0 "${gateway_pid}" >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
    if kill -0 "${gateway_pid}" >/dev/null 2>&1; then
      printf 'Gateway PID %s did not exit after TERM; sending KILL to this test-owned PID.\n' "${gateway_pid}" >&2
      kill -KILL "${gateway_pid}" >/dev/null 2>&1
    fi
    wait "${gateway_pid}" >/dev/null 2>&1
  fi

  if is_listening "${PERSONA_OPENCLAW_PORT}"; then
    printf 'Gateway port %s remained listening after bounded shutdown.\n' "${PERSONA_OPENCLAW_PORT}" >&2
    status=1
  fi
  if is_listening "$((PERSONA_OPENCLAW_PORT + 2))"; then
    printf 'Derived browser-control port %s remained listening after bounded shutdown.\n' "$((PERSONA_OPENCLAW_PORT + 2))" >&2
    status=1
  fi
  exit "${status}"
}

trap cleanup EXIT
trap 'exit 130' INT TERM

# `openclaw-gateway.sh` uses `gateway run` with no override flags and execs
# into the local Node process, so this PID is the process we later stop.
"${scripts_dir}/openclaw-gateway.sh" >"${gateway_log}" 2>&1 &
gateway_pid=$!

for attempt in {1..30}; do
  if /usr/bin/env -i \
    PATH="${PERSONA_SAFE_PATH}" \
    HOME="${OPENCLAW_HOME}" \
    TMPDIR="${PERSONA_OPENCLAW_TMP}" \
    /usr/bin/curl --noproxy '*' --connect-timeout 1 --max-time 2 -fsS \
      "http://127.0.0.1:${PERSONA_OPENCLAW_PORT}/healthz" >"${health_file}" 2>/dev/null; then
    break
  fi
  if ! kill -0 "${gateway_pid}" >/dev/null 2>&1; then
    wait "${gateway_pid}"
    exit 1
  fi
  sleep 1
done

if [[ ! -s "${health_file}" ]]; then
  printf 'Gateway did not pass /healthz within 30 seconds; log: %s\n' "${gateway_log}" >&2
  exit 1
fi

listener="$(/usr/sbin/lsof -nP -a -p "${gateway_pid}" -iTCP:"${PERSONA_OPENCLAW_PORT}" -sTCP:LISTEN || true)"
printf '%s\n' "${listener}" >"${listener_file}"
if [[ -z "${listener}" ]]; then
  printf 'Gateway PID %s is not the listener on port %s; log: %s\n' "${gateway_pid}" "${PERSONA_OPENCLAW_PORT}" "${gateway_log}" >&2
  exit 1
fi
if [[ "${listener}" == *"0.0.0.0:"* || "${listener}" == *"*:"* ]]; then
  printf 'Gateway listener is not loopback-only; details: %s\n' "${listener_file}" >&2
  exit 1
fi

# Browser is denied in Phase 0. A listener on base+2 would therefore be an
# unexpected browser-control surface, not a permitted derived-port success.
if is_listening "$((PERSONA_OPENCLAW_PORT + 2))"; then
  printf 'Browser is denied, but derived browser-control port %s is listening.\n' "$((PERSONA_OPENCLAW_PORT + 2))" >&2
  exit 1
fi

printf 'Gateway bounded smoke passed: pid=%s port=%s health=%s listener=%s log=%s\n' \
  "${gateway_pid}" \
  "${PERSONA_OPENCLAW_PORT}" \
  "${health_file}" \
  "${listener_file}" \
  "${gateway_log}"
