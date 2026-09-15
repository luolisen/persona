#!/usr/bin/env node

import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  assertSafeDirectory,
  assertSafeRegularFile,
  assertSafeRuntimeCli,
  readSafeFile,
  resolveProjectRoot,
} from "./isolation-paths.mjs";

const args = process.argv.slice(2);
const allowedArgs = new Set(["--skip-runtime", "--skip-port"]);
if (args.some((arg) => !allowedArgs.has(arg)) || new Set(args).size !== args.length) {
  throw new Error(`unknown or duplicate argument: ${args.join(" ")}`);
}
const skipRuntime = args.includes("--skip-runtime");
const skipPort = args.includes("--skip-port");

function fail(message) {
  process.stderr.write(`OpenClaw isolation check failed: ${message}\n`);
  process.exit(1);
}

function requireValue(name, value) {
  if (!value) fail(`${name} is unset`);
  return value;
}

function requireExactPath(name, actual, expected) {
  if (!path.isAbsolute(actual) || path.resolve(actual) !== expected) {
    fail(`${name} must be exactly ${expected}`);
  }
}

function assertPortVacant(candidatePort, label) {
  const probe = childProcess.spawnSync("/usr/sbin/lsof", ["-nP", `-iTCP:${candidatePort}`, "-sTCP:LISTEN"], {
    encoding: "utf8",
  });
  if (probe.error) fail(`could not inspect ${label} ${candidatePort}: ${probe.error.message}`);
  if (probe.status === 0) fail(`${label} ${candidatePort} is already listening`);
  if (probe.status !== 1) fail(`lsof returned ${probe.status} while checking ${label} ${candidatePort}`);
}

const rootValue = requireValue("PERSONA_ROOT", process.env.PERSONA_ROOT);
const isolatedRootValue = requireValue("PERSONA_OPENCLAW_ROOT", process.env.PERSONA_OPENCLAW_ROOT);
const runtimeValue = requireValue("PERSONA_OPENCLAW_RUNTIME", process.env.PERSONA_OPENCLAW_RUNTIME);
const tempValue = requireValue("PERSONA_OPENCLAW_TMP", process.env.PERSONA_OPENCLAW_TMP);
const configValue = requireValue("OPENCLAW_CONFIG_PATH", process.env.OPENCLAW_CONFIG_PATH);
const stateValue = requireValue("OPENCLAW_STATE_DIR", process.env.OPENCLAW_STATE_DIR);
const homeValue = requireValue("OPENCLAW_HOME", process.env.OPENCLAW_HOME);
const profile = requireValue("OPENCLAW_PROFILE", process.env.OPENCLAW_PROFILE);
const port = Number(process.env.OPENCLAW_GATEWAY_PORT);

let projectRoot;
try {
  projectRoot = resolveProjectRoot(rootValue);
} catch (error) {
  fail(error.message);
}

const isolatedRoot = path.join(projectRoot, ".openclaw");
const runtime = path.join(isolatedRoot, "runtime");
const tempDir = path.join(isolatedRoot, "tmp");
const configPath = path.join(isolatedRoot, "config", "openclaw.json");
const stateDir = path.join(isolatedRoot, "state");
const openclawHome = path.join(isolatedRoot, "home");
const workspace = path.join(isolatedRoot, "workspace");
const pluginRoot = path.join(isolatedRoot, "plugins");
const logPath = path.join(isolatedRoot, "logs", "gateway.log");
const tokenPath = path.join(stateDir, "credentials", "gateway.token");

requireExactPath("PERSONA_OPENCLAW_ROOT", isolatedRootValue, isolatedRoot);
requireExactPath("PERSONA_OPENCLAW_RUNTIME", runtimeValue, runtime);
requireExactPath("PERSONA_OPENCLAW_TMP", tempValue, tempDir);
requireExactPath("OPENCLAW_CONFIG_PATH", configValue, configPath);
requireExactPath("OPENCLAW_STATE_DIR", stateValue, stateDir);
requireExactPath("OPENCLAW_HOME", homeValue, openclawHome);
if (profile !== "zhaoying-phase0") fail("OPENCLAW_PROFILE must be zhaoying-phase0");
if (!Number.isInteger(port) || port !== 19889) fail("OPENCLAW_GATEWAY_PORT must be the dedicated port 19889");

try {
  for (const [directory, label] of [
    [isolatedRoot, "isolated root"],
    [runtime, "runtime directory"],
    [path.join(isolatedRoot, "config"), "config directory"],
    [stateDir, "state directory"],
    [path.join(stateDir, "credentials"), "credentials directory"],
    [path.join(stateDir, "sessions"), "sessions directory"],
    [path.join(stateDir, "extensions"), "extensions directory"],
    [workspace, "workspace directory"],
    [pluginRoot, "explicit plugin directory"],
    [path.join(isolatedRoot, "logs"), "log directory"],
    [openclawHome, "isolated home directory"],
    [path.join(openclawHome, ".cache"), "isolated cache directory"],
    [path.join(openclawHome, ".config"), "isolated config-home directory"],
    [path.join(openclawHome, ".local", "share"), "isolated data-home directory"],
    [path.join(isolatedRoot, "npm-cache"), "npm cache directory"],
    [tempDir, "temporary directory"],
    [path.join(isolatedRoot, "verification"), "verification directory"],
  ]) {
    assertSafeDirectory(projectRoot, directory, { label });
  }
  assertSafeRegularFile(projectRoot, configPath, { label: "project OpenClaw config" });
  assertSafeRegularFile(projectRoot, tokenPath, { label: "Gateway token" });
  assertSafeRegularFile(projectRoot, logPath, { allowMissing: true, label: "Gateway log" });
} catch (error) {
  fail(error.message);
}

const tokenMode = fs.statSync(tokenPath).mode & 0o777;
if (tokenMode !== 0o600) fail("Gateway token must have mode 0600");

let config;
try {
  config = JSON.parse(readSafeFile(projectRoot, configPath, "utf8", { label: "project OpenClaw config" }));
} catch (error) {
  fail(`cannot parse project config: ${error.message}`);
}

if (Object.hasOwn(config, "$include")) fail("Phase 0 config must not use $include");
if (config.agents?.defaults?.workspace !== workspace) fail("default workspace is not the project-local workspace");
if (config.agents?.defaults?.heartbeat?.every !== "0m") fail("Phase 0 heartbeat must remain disabled");
if (config.agents?.defaults?.elevatedDefault !== "off") fail("Phase 0 elevated tools must remain disabled by default");
if (config.agents?.defaults?.model !== undefined || config.models !== undefined) fail("Phase 0 must not configure a model");

const explicitAgents = config.agents?.list;
if (explicitAgents !== undefined) {
  if (!Array.isArray(explicitAgents)) fail("agents.list must be an array when present");
  for (const [index, agent] of explicitAgents.entries()) {
    if (!agent || typeof agent !== "object" || Array.isArray(agent)) fail(`agents.list[${index}] must be an object`);
    if (Object.hasOwn(agent, "workspace")) {
      fail(`agents.list[${index}].workspace is forbidden in Phase 0; only agents.defaults.workspace is allowed`);
    }
  }
}

if (config.gateway?.mode !== "local" || config.gateway?.port !== port || config.gateway?.bind !== "loopback") {
  fail("Gateway config is not the dedicated local loopback endpoint");
}
if (config.gateway?.auth?.mode !== "token" || typeof config.gateway.auth.token !== "string" || config.gateway.auth.token.length < 32) {
  fail("Gateway must use a project-local token authentication value");
}
if (config.gateway?.remote !== undefined) fail("Phase 0 must not configure a remote Gateway");
if (
  config.channels !== undefined
  && (config.channels === null || typeof config.channels !== "object" || Object.keys(config.channels).length > 0)
) {
  fail("Phase 0 must not configure channels or accounts");
}
if (config.logging?.file !== logPath) fail("Gateway log path is not isolated");

const pluginPaths = config.plugins?.load?.paths;
if (!Array.isArray(pluginPaths) || pluginPaths.length !== 1 || pluginPaths[0] !== pluginRoot) {
  fail("plugins.load.paths must contain exactly the project-local plugin root");
}
for (const disabledPlugin of ["active-memory", "memory-core", "memory-wiki", "bonjour", "browser", "canvas"]) {
  if (!config.plugins?.deny?.includes(disabledPlugin)) fail(`Phase 0 must deny ${disabledPlugin}`);
}
if (config.tools?.elevated?.enabled !== false) fail("Phase 0 must disable elevated tools");

if (!skipRuntime) {
  try {
    assertSafeRuntimeCli(projectRoot, runtime);
  } catch (error) {
    fail(error.message);
  }
}

if (!skipPort) {
  assertPortVacant(port, "Gateway port");
  assertPortVacant(port + 2, "derived Control UI port");
}

process.stdout.write(`${JSON.stringify({
  status: "ok",
  configPath,
  stateDir,
  workspace,
  managedPluginRoot: path.join(stateDir, "extensions"),
  explicitPluginRoot: pluginRoot,
  logPath,
  port,
  derivedControlUiPort: port + 2,
  browserEnabled: false,
  runtimeChecked: !skipRuntime,
  portChecked: !skipPort,
})}\n`);
