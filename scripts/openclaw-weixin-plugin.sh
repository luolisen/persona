#!/usr/bin/env bash

# This installs only into the isolated state directory selected by
# openclaw-env.sh. It intentionally does not invoke channels login.
set -euo pipefail

readonly weixin_plugin_spec="npm:@tencent-weixin/openclaw-weixin@2.4.6"
scripts_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "${scripts_dir}/openclaw-env.sh"

if [[ $# -ne 0 ]]; then
  printf 'Usage: %s\n' "$0" >&2
  exit 64
fi

"${scripts_dir}/openclaw-isolation-check.sh"
"${scripts_dir}/openclaw-persona.sh" plugins install "${weixin_plugin_spec}" --pin
"${scripts_dir}/openclaw-persona.sh" plugins list --json

printf 'Installed %s into the isolated instance. No QR login or Gateway start was performed.\n' "${weixin_plugin_spec}"
