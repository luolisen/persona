#!/usr/bin/env node

import path from "node:path";
import { assertSafeRegularFile, ensureSafeDirectory, openclawRoot, resolveProjectRoot } from "./isolation-paths.mjs";

function fail(message) {
  process.stderr.write(`OpenClaw layout preparation failed: ${message}\n`);
  process.exit(2);
}

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--root") fail("expected --root <project-root>");

let root;
try {
  root = resolveProjectRoot(args[1]);
  const isolatedRoot = openclawRoot(root);
  for (const relativePath of [
    ".openclaw",
    ".openclaw/home",
    ".openclaw/home/.cache",
    ".openclaw/home/.config",
    ".openclaw/home/.local",
    ".openclaw/home/.local/share",
    ".openclaw/state",
    ".openclaw/state/credentials",
    ".openclaw/state/sessions",
    ".openclaw/state/extensions",
    ".openclaw/state/logs",
    ".openclaw/config",
    ".openclaw/workspace",
    ".openclaw/plugins",
    ".openclaw/logs",
    ".openclaw/run",
    ".openclaw/runtime",
    ".openclaw/npm-cache",
    ".openclaw/tmp",
    ".openclaw/verification",
  ]) {
    ensureSafeDirectory(root, path.join(root, relativePath), { label: relativePath });
  }
  assertSafeRegularFile(root, path.join(isolatedRoot, "config", "openclaw.json"), {
    allowMissing: true,
    label: "project OpenClaw config",
  });
} catch (error) {
  fail(error.message);
}
