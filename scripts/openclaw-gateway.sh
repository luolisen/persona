#!/usr/bin/env bash

# Deliberately foreground-only. This script never invokes `gateway install`,
# launchd, a process manager, or a background shell job.
set -euo pipefail

scripts_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "${scripts_dir}/openclaw-env.sh"

if [[ $# -ne 0 ]]; then
  printf 'Usage: %s\n' "$0" >&2
  exit 64
fi

"${scripts_dir}/openclaw-isolation-check.sh"
exec "${scripts_dir}/openclaw-persona.sh" gateway run
