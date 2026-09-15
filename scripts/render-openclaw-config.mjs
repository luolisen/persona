#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { loadOrCreateGatewayToken } from "./gateway-token.mjs";
import { assertSafeRegularFile, ensureSafeDirectory, isInside, readSafeFile, resolveProjectRoot, writeSafeFile } from "./isolation-paths.mjs";

function fail(message) {
  process.stderr.write(`openclaw config render: ${message}\n`);
  process.exit(2);
}

const args = process.argv.slice(2);
const force = args.includes("--force");
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

const rootArg = option("--root");
const templateArg = option("--template");
const outputArg = option("--output");
const requiredOptions = ["--root", "--template", "--output"];
if (
  !rootArg || !templateArg || !outputArg ||
  requiredOptions.some((name) => args.filter((arg) => arg === name).length !== 1) ||
  args.filter((arg) => arg === "--force").length > 1 ||
  args.some((arg) => arg.startsWith("--") && !requiredOptions.includes(arg) && arg !== "--force") ||
  args.length !== (force ? 7 : 6)
) {
  fail("expected --root, --template, and --output");
}

let root;
try {
  root = resolveProjectRoot(rootArg);
} catch (error) {
  fail(error.message);
}
const template = path.resolve(templateArg);
const output = path.resolve(outputArg);
const expectedConfigDir = path.join(root, ".openclaw", "config");

if (!isInside(template, root)) {
  fail("template must remain inside the project root");
}
if (output !== path.join(expectedConfigDir, "openclaw.json")) {
  fail("output must be the project-local .openclaw/config/openclaw.json");
}
try {
  assertSafeRegularFile(root, template, { label: "config template" });
  ensureSafeDirectory(root, expectedConfigDir, { label: "config directory" });
  assertSafeRegularFile(root, output, { allowMissing: true, label: "project OpenClaw config" });
} catch (error) {
  fail(error.message);
}
if (fs.existsSync(output) && !force) {
  fail(`refusing to overwrite ${output}; rerun bootstrap with --force after review`);
}

const source = readSafeFile(root, template, "utf8", { label: "config template" });
if (!source.includes("__PERSONA_ROOT__")) {
  fail("template is missing the __PERSONA_ROOT__ placeholder");
}

let tokenInfo;
try {
  tokenInfo = loadOrCreateGatewayToken(root);
} catch (error) {
  fail(error.message);
}
const rendered = source
  .replaceAll("__PERSONA_ROOT__", root)
  .replaceAll("__PERSONA_GATEWAY_TOKEN__", tokenInfo.token);
let config;
try {
  config = JSON.parse(rendered);
} catch (error) {
  fail(`rendered JSON is invalid: ${error.message}`);
}

if (config.agents?.defaults?.workspace !== path.join(root, ".openclaw", "workspace")) {
  fail("rendered workspace is not project-local");
}
if (config.gateway?.port !== 19889 || config.gateway?.bind !== "loopback") {
  fail("rendered Gateway must use the fixed loopback port 19889");
}
if (config.gateway?.auth?.mode !== "token" || config.gateway.auth.token !== tokenInfo.token) {
  fail("rendered Gateway must use the project-local authentication token");
}

try {
  writeSafeFile(root, output, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
    label: "project OpenClaw config",
  });
} catch (error) {
  fail(error.message);
}
