#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { isUsableGatewayToken, loadOrCreateGatewayToken } from "./gateway-token.mjs";
import { assertSafeRegularFile, readSafeFile, resolveProjectRoot, writeSafeFile } from "./isolation-paths.mjs";

function fail(message) {
  process.stderr.write(`gateway auth setup: ${message}\n`);
  process.exit(2);
}

const args = process.argv.slice(2);
const getOption = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const rootArg = getOption("--root");
const configArg = getOption("--config");
if (!rootArg || !configArg || args.length !== 4) fail("expected --root <path> --config <path>");

let root;
try {
  root = resolveProjectRoot(rootArg);
} catch (error) {
  fail(error.message);
}
const configPath = path.resolve(configArg);
const expectedConfig = path.join(root, ".openclaw", "config", "openclaw.json");
if (configPath !== expectedConfig) fail("config path must be project-local");

let config;
try {
  assertSafeRegularFile(root, configPath, { label: "project OpenClaw config" });
  config = JSON.parse(readSafeFile(root, configPath, "utf8", { label: "project OpenClaw config" }));
} catch (error) {
  fail(`cannot parse config: ${error.message}`);
}

const existingToken = config.gateway?.auth?.mode === "token" ? config.gateway.auth.token : undefined;
if (isUsableGatewayToken(existingToken)) {
  fs.chmodSync(configPath, 0o600);
  process.stdout.write("Retained existing project-local Gateway authentication token.\n");
  process.exit(0);
}

let tokenInfo;
try {
  tokenInfo = loadOrCreateGatewayToken(root);
} catch (error) {
  fail(error.message);
}

config.gateway ??= {};
config.gateway.auth = {
  ...config.gateway.auth,
  mode: "token",
  token: tokenInfo.token,
};
try {
  writeSafeFile(root, configPath, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
    label: "project OpenClaw config",
  });
} catch (error) {
  fail(error.message);
}
process.stdout.write(tokenInfo.created ? "Created project-local Gateway authentication token.\n" : "Applied existing project-local Gateway authentication token.\n");
