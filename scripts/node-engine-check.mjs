#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

export const supportedRange = ">=22.22.3 <23 || >=24.15.0 <25 || >=25.9.0";

export function parseNodeVersion(raw) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/.exec(raw ?? "");
  if (!match) return null;
  return match.slice(1).map((part) => Number(part));
}

function compare(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function isSupportedNodeVersion(raw) {
  const version = Array.isArray(raw) ? raw : parseNodeVersion(raw);
  if (!version) return false;
  const [major] = version;
  if (major === 22) return compare(version, [22, 22, 3]) >= 0;
  if (major === 24) return compare(version, [24, 15, 0]) >= 0;
  return major > 25 || (major === 25 && compare(version, [25, 9, 0]) >= 0);
}

if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  const raw = process.argv[2] ?? process.versions.node;
  if (!isSupportedNodeVersion(raw)) {
    process.stderr.write(`Node ${raw} does not satisfy ${supportedRange}.\n`);
    process.exit(65);
  }
  process.stdout.write(`Node ${raw} satisfies ${supportedRange}.\n`);
}
