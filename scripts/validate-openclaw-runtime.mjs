#!/usr/bin/env node

import { assertSafeRuntimeCli, assertSafeRuntimeInstallTarget, resolveProjectRoot } from "./isolation-paths.mjs";

function fail(message) {
  process.stderr.write(`OpenClaw runtime validation failed: ${message}\n`);
  process.exit(65);
}

const args = process.argv.slice(2);
const allowMissingCli = args.includes("--allow-missing-cli");
if (
  args.length !== (allowMissingCli ? 5 : 4) ||
  args[0] !== "--root" ||
  args[2] !== "--runtime" ||
  (allowMissingCli && args[4] !== "--allow-missing-cli")
) {
  fail("expected --root <project-root> --runtime <runtime-directory> [--allow-missing-cli]");
}

try {
  const root = resolveProjectRoot(args[1]);
  const cli = allowMissingCli
    ? assertSafeRuntimeInstallTarget(root, args[3])
    : assertSafeRuntimeCli(root, args[3]);
  process.stdout.write(`${cli}\n`);
} catch (error) {
  fail(error.message);
}
