import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { isSupportedNodeVersion, supportedRange } from "../scripts/node-engine-check.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function createFixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "persona-openclaw-test-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.join(repoRoot, "scripts"), path.join(root, "scripts"), { recursive: true });
  fs.cpSync(path.join(repoRoot, "config"), path.join(root, "config"), { recursive: true });
  return root;
}

function createExternalDirectory(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "persona-openclaw-external-")));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function runShell(root, script, args = [], env = {}) {
  return childProcess.spawnSync("/bin/bash", [path.join(root, script), ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function runNode(root, script, args = [], env = {}) {
  return childProcess.spawnSync(process.execPath, [path.join(root, script), ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function bootstrapFixture(t, env = {}) {
  const root = createFixture(t);
  const result = runShell(root, "scripts/openclaw-bootstrap.sh", [], env);
  assert.equal(result.status, 0, result.stderr);
  return root;
}

function configPath(root) {
  return path.join(root, ".openclaw", "config", "openclaw.json");
}

function readConfig(root) {
  return JSON.parse(fs.readFileSync(configPath(root), "utf8"));
}

function writeConfig(root, config) {
  fs.writeFileSync(configPath(root), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

function createStubRuntime(root) {
  const cli = path.join(root, ".openclaw", "runtime", "node_modules", "openclaw", "openclaw.mjs");
  fs.mkdirSync(path.dirname(cli), { recursive: true });
  fs.writeFileSync(cli, [
    "const names = [",
    "  'HOME', 'OPENCLAW_HOME', 'OPENCLAW_PROFILE', 'OPENCLAW_STATE_DIR',",
    "  'OPENCLAW_CONFIG_PATH', 'OPENCLAW_GATEWAY_PORT', 'OPENCLAW_AGENT_DIR',",
    "  'OPENCLAW_GATEWAY_URL', 'OPENCLAW_GATEWAY_TOKEN', 'OPENCLAW_PACKAGE_DIR',",
    "  'OPENCLAW_WORKSPACE_DIR', 'OPENAI_API_KEY', 'USERPROFILE', 'PREFIX'",
    "];",
    "const env = Object.fromEntries(names.map((name) => [name, process.env[name] ?? null]));",
    "process.stdout.write(JSON.stringify({ args: process.argv.slice(2), env }));",
  ].join("\n"), { mode: 0o600 });
  return cli;
}

function createFakeNpmForFirstInstall(root) {
  const bin = path.join(root, "fake-bin");
  const npm = path.join(bin, "npm");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(npm, [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    'prefix=""',
    'while [[ "$#" -gt 0 ]]; do',
    '  case "$1" in',
    '    --prefix) prefix="$2"; shift 2 ;;',
    '    *) shift ;;',
    "  esac",
    "done",
    '[[ -n "${prefix}" ]]',
    'mkdir -p "${prefix}/node_modules/openclaw"',
    "printf '{\\\"version\\\":\\\"2026.7.1-2\\\"}\\n' > \"${prefix}/node_modules/openclaw/package.json\"",
    "printf 'process.exit(0);\\n' > \"${prefix}/node_modules/openclaw/openclaw.mjs\"",
  ].join("\n"), { mode: 0o700 });
  return bin;
}

test("bootstrap succeeds under /bin/bash in a fresh fixture and ignores inherited selectors", (t) => {
  const external = createExternalDirectory(t);
  const root = createFixture(t);
  const inherited = {
    OPENCLAW_AGENT_DIR: path.join(external, "agent"),
    OPENCLAW_BUNDLED_PLUGINS_DIR: path.join(external, "plugins"),
    OPENCLAW_CONFIG_PATH: path.join(external, "foreign-openclaw.json"),
    OPENCLAW_GATEWAY_PORT: "17777",
    OPENCLAW_HOME: path.join(external, "home"),
    OPENCLAW_PACKAGE_DIR: path.join(external, "package"),
    OPENCLAW_PROFILE: "foreign-profile",
    OPENCLAW_STATE_DIR: path.join(external, "state"),
    OPENCLAW_WORKSPACE_DIR: path.join(external, "workspace"),
  };

  const bootstrap = runShell(root, "scripts/openclaw-bootstrap.sh", [], inherited);
  assert.equal(bootstrap.status, 0, bootstrap.stderr);
  assert.equal(fs.existsSync(inherited.OPENCLAW_CONFIG_PATH), false);
  assert.equal(fs.existsSync(inherited.OPENCLAW_STATE_DIR), false);

  const config = readConfig(root);
  const isolatedRoot = path.join(root, ".openclaw");
  assert.equal(config.agents.defaults.workspace, path.join(isolatedRoot, "workspace"));
  assert.equal(config.gateway.port, 19889);
  assert.equal(config.gateway.bind, "loopback");
  assert.equal(config.gateway.auth.mode, "token");
  assert.match(config.gateway.auth.token, /^[A-Za-z0-9_-]{32,128}$/);
  assert.equal(config.logging.file, path.join(isolatedRoot, "logs", "gateway.log"));
  assert.deepEqual(config.plugins.load.paths, [path.join(isolatedRoot, "plugins")]);
  assert.equal(config.tools.elevated.enabled, false);
  assert.equal(config.agents.defaults.heartbeat.every, "0m");
  assert.equal(config.agents.defaults.elevatedDefault, "off");
  assert.equal(fs.statSync(path.join(isolatedRoot, "state", "credentials", "gateway.token")).mode & 0o777, 0o600);

  const check = runShell(root, "scripts/openclaw-isolation-check.sh", ["--skip-runtime", "--skip-port"], inherited);
  assert.equal(check.status, 0, check.stderr);
  const report = JSON.parse(check.stdout);
  assert.equal(report.status, "ok");
  assert.equal(report.port, 19889);
  assert.equal(report.browserEnabled, false);
});

test("config file and parent symlinks are rejected before any writer can escape", (t) => {
  const root = bootstrapFixture(t);
  const external = createExternalDirectory(t);
  const externalConfig = path.join(external, "openclaw.json");
  fs.writeFileSync(externalConfig, "external-sentinel\n", { mode: 0o600 });
  fs.unlinkSync(configPath(root));
  fs.symlinkSync(externalConfig, configPath(root));

  const bootstrap = runShell(root, "scripts/openclaw-bootstrap.sh", ["--force"]);
  assert.notEqual(bootstrap.status, 0);
  assert.match(bootstrap.stderr, /symlink/i);
  assert.equal(fs.readFileSync(externalConfig, "utf8"), "external-sentinel\n");

  const ensure = runNode(root, "scripts/ensure-gateway-auth.mjs", ["--root", root, "--config", configPath(root)]);
  assert.notEqual(ensure.status, 0);
  assert.match(ensure.stderr, /symlink/i);

  const render = runNode(root, "scripts/render-openclaw-config.mjs", [
    "--root", root,
    "--template", path.join(root, "config", "openclaw.template.json"),
    "--output", configPath(root),
    "--force",
  ]);
  assert.notEqual(render.status, 0);
  assert.match(render.stderr, /symlink/i);

  const install = runShell(root, "scripts/openclaw-install.sh");
  assert.notEqual(install.status, 0);
  assert.match(install.stderr, /symlink/i);

  const wrapper = runShell(root, "scripts/openclaw-persona.sh", ["--version"]);
  assert.notEqual(wrapper.status, 0);
  assert.match(wrapper.stderr, /symlink/i);

  const pluginInstall = runShell(root, "scripts/openclaw-weixin-plugin.sh");
  assert.notEqual(pluginInstall.status, 0);
  assert.match(pluginInstall.stderr, /symlink/i);

  const gateway = runShell(root, "scripts/openclaw-gateway.sh");
  assert.notEqual(gateway.status, 0);
  assert.match(gateway.stderr, /symlink/i);

  fs.unlinkSync(configPath(root));
  const configDirectory = path.dirname(configPath(root));
  fs.rmSync(configDirectory, { recursive: true, force: true });
  fs.symlinkSync(external, configDirectory);
  const parentBootstrap = runShell(root, "scripts/openclaw-bootstrap.sh");
  assert.notEqual(parentBootstrap.status, 0);
  assert.match(parentBootstrap.stderr, /symlink/i);
  assert.equal(fs.existsSync(path.join(external, "openclaw.json")), true);
  assert.equal(fs.readFileSync(externalConfig, "utf8"), "external-sentinel\n");
});

test("a project runtime CLI symlink cannot be executed or installed through", (t) => {
  const root = bootstrapFixture(t);
  const external = createExternalDirectory(t);
  const escapedCli = path.join(external, "escaped-openclaw.mjs");
  fs.writeFileSync(escapedCli, "process.stdout.write('ESCAPED-CLI');\n", { mode: 0o600 });
  const cli = path.join(root, ".openclaw", "runtime", "node_modules", "openclaw", "openclaw.mjs");
  fs.mkdirSync(path.dirname(cli), { recursive: true });
  fs.symlinkSync(escapedCli, cli);

  const wrapper = runShell(root, "scripts/openclaw-persona.sh", ["--version"]);
  assert.notEqual(wrapper.status, 0);
  assert.match(wrapper.stderr, /symlink|escapes runtime/i);
  assert.doesNotMatch(wrapper.stdout, /ESCAPED-CLI/);

  const validation = runNode(root, "scripts/validate-openclaw-runtime.mjs", [
    "--root", root,
    "--runtime", path.join(root, ".openclaw", "runtime"),
  ]);
  assert.notEqual(validation.status, 0);
  assert.match(validation.stderr, /symlink|escapes runtime/i);

  const install = runShell(root, "scripts/openclaw-install.sh");
  assert.notEqual(install.status, 0);
  assert.match(install.stderr, /symlink|escapes runtime/i);
});

test("a fresh project runtime can complete the first install through its safe target", (t) => {
  const root = bootstrapFixture(t);
  const fakeBin = createFakeNpmForFirstInstall(root);
  const runtime = path.join(root, ".openclaw", "runtime");
  const cli = path.join(runtime, "node_modules", "openclaw", "openclaw.mjs");

  const install = runShell(root, "scripts/openclaw-install.sh", [], {
    PATH: `${fakeBin}:${process.env.PATH}`,
  });

  assert.equal(install.status, 0, install.stderr);
  assert.match(install.stdout, /Installed and validated project-local OpenClaw 2026\.7\.1-2/);
  assert.equal(fs.lstatSync(cli).isFile(), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(runtime, "node_modules", "openclaw", "package.json"), "utf8")).version, "2026.7.1-2");
});

test("wrapper strips inherited selectors and rejects command-line overrides", (t) => {
  const root = bootstrapFixture(t);
  createStubRuntime(root);
  const external = createExternalDirectory(t);
  const inherited = {
    OPENAI_API_KEY: "must-not-reach-openclaw",
    OPENCLAW_AGENT_DIR: path.join(external, "agent"),
    OPENCLAW_CONFIG_PATH: path.join(external, "foreign-openclaw.json"),
    OPENCLAW_GATEWAY_TOKEN: "foreign-token",
    OPENCLAW_GATEWAY_URL: "ws://127.0.0.1:18789",
    OPENCLAW_HOME: path.join(external, "home"),
    OPENCLAW_PACKAGE_DIR: path.join(external, "package"),
    OPENCLAW_PROFILE: "foreign-profile",
    OPENCLAW_STATE_DIR: path.join(external, "state"),
    OPENCLAW_WORKSPACE_DIR: path.join(external, "workspace"),
    PREFIX: external,
    USERPROFILE: external,
  };
  const command = runShell(root, "scripts/openclaw-persona.sh", ["--version"], inherited);
  assert.equal(command.status, 0, command.stderr);
  const payload = JSON.parse(command.stdout);
  assert.deepEqual(payload.args, ["--version"]);
  assert.equal(payload.env.HOME, path.join(root, ".openclaw", "home"));
  assert.equal(payload.env.OPENCLAW_HOME, path.join(root, ".openclaw", "home"));
  assert.equal(payload.env.OPENCLAW_PROFILE, "zhaoying-phase0");
  assert.equal(payload.env.OPENCLAW_STATE_DIR, path.join(root, ".openclaw", "state"));
  assert.equal(payload.env.OPENCLAW_CONFIG_PATH, configPath(root));
  assert.equal(payload.env.OPENCLAW_GATEWAY_PORT, "19889");
  for (const name of [
    "OPENCLAW_AGENT_DIR",
    "OPENCLAW_GATEWAY_URL",
    "OPENCLAW_GATEWAY_TOKEN",
    "OPENCLAW_PACKAGE_DIR",
    "OPENCLAW_WORKSPACE_DIR",
    "OPENAI_API_KEY",
    "PREFIX",
    "USERPROFILE",
  ]) {
    assert.equal(payload.env[name], null, `${name} was inherited by the project runtime`);
  }

  for (const args of [
    ["--profile", "foreign", "--version"],
    ["--profile=foreign", "--version"],
    ["--dev", "--version"],
    ["gateway", "run", "--port", "19999"],
    ["gateway", "run", "--bind=lan"],
    ["plugins", "install", "npm:unreviewed-plugin@1.0.0", "--pin"],
    ["channels", "login"],
  ]) {
    const rejected = runShell(root, "scripts/openclaw-persona.sh", args);
    assert.equal(rejected.status, 64, `${args.join(" ")}: ${rejected.stderr}`);
    assert.match(rejected.stderr, /Rejected by the Phase 0 OpenClaw wrapper/);
  }

  const gatewayOverride = runShell(root, "scripts/openclaw-gateway.sh", ["--port", "19999"]);
  assert.equal(gatewayOverride.status, 64, gatewayOverride.stderr);
});

test("checker strictly limits plugin paths and rejects explicit agent workspaces", (t) => {
  const root = bootstrapFixture(t);
  const external = createExternalDirectory(t);
  const config = readConfig(root);
  const pluginRoot = path.join(root, ".openclaw", "plugins");

  config.plugins.load.paths = [pluginRoot, path.join(external, "plugins")];
  writeConfig(root, config);
  const pluginCheck = runShell(root, "scripts/openclaw-isolation-check.sh", ["--skip-runtime", "--skip-port"]);
  assert.notEqual(pluginCheck.status, 0);
  assert.match(pluginCheck.stderr, /plugins\.load\.paths/);

  config.plugins.load.paths = [pluginRoot];
  config.agents.list = [{ id: "foreign-agent", workspace: path.join(external, "workspace") }];
  writeConfig(root, config);
  const agentCheck = runShell(root, "scripts/openclaw-isolation-check.sh", ["--skip-runtime", "--skip-port"]);
  assert.notEqual(agentCheck.status, 0);
  assert.match(agentCheck.stderr, /agents\.list\[0\]\.workspace/);
});

test("Node engine bounds match the pinned OpenClaw release", () => {
  assert.equal(isSupportedNodeVersion("22.22.0"), false);
  assert.equal(isSupportedNodeVersion("22.22.3"), true);
  assert.equal(isSupportedNodeVersion("24.14.9"), false);
  assert.equal(isSupportedNodeVersion("24.15.0"), true);
  assert.equal(isSupportedNodeVersion("25.9.0"), true);
  assert.equal(isSupportedNodeVersion("26.0.0"), true);

  const rejected = childProcess.spawnSync(process.execPath, [path.join(repoRoot, "scripts", "node-engine-check.mjs"), "22.22.0"], {
    encoding: "utf8",
  });
  assert.equal(rejected.status, 65);
  assert.match(rejected.stderr, new RegExp(`does not satisfy ${supportedRange.replace(/[|]/g, "\\|")}`));

  const accepted = childProcess.spawnSync(process.execPath, [path.join(repoRoot, "scripts", "node-engine-check.mjs"), "26.0.0"], {
    encoding: "utf8",
  });
  assert.equal(accepted.status, 0, accepted.stderr);
});
