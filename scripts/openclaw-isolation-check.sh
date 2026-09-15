#!/usr/bin/env bash

set -euo pipefail

scripts_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "${scripts_dir}/openclaw-env.sh"

persona_node_exec "${scripts_dir}/check-openclaw-isolation.mjs" "$@"
