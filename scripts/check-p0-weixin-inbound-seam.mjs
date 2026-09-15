#!/usr/bin/env node
import fs from "node:fs/promises";

import {
  createControlledMonitorFork,
  inspectControlledMonitorFork,
} from "../src/p0-bridge/controlled-monitor-fork.mjs";
import { verifyPinnedWeixinSource } from "../src/p0-bridge/upstream-lock.mjs";

function usage() {
  process.stderr.write("Usage: check-p0-weixin-inbound-seam.mjs --plugin-root PATH --openclaw-root PATH\n");
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--plugin-root" || argument === "--openclaw-root") {
      values[argument] = argv[index + 1];
      index += 1;
      continue;
    }
    return null;
  }
  return values;
}

const args = parseArgs(process.argv.slice(2));
if (!args?.["--plugin-root"] || !args?.["--openclaw-root"]) {
  usage();
  process.exitCode = 64;
} else {
  const source = await verifyPinnedWeixinSource({
    pluginRoot: args["--plugin-root"],
    openclawRoot: args["--openclaw-root"],
  });
  if (!source.enabled) {
    process.stdout.write(`${JSON.stringify({ status: "rejected", ...source })}\n`);
    process.exitCode = 1;
  } else {
    const monitorSource = await fs.readFile(source.monitorPath, "utf8");
    const overlay = createControlledMonitorFork(monitorSource);
    const placement = inspectControlledMonitorFork(overlay);
    if (!placement.ok) {
      process.stdout.write(`${JSON.stringify({ status: "rejected", reason: "overlay-placement-invalid", placement })}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write(`${JSON.stringify({
        status: "ok",
        plugin: source.plugin,
        host: source.host,
        monitorSha256: source.monitorSha256,
        processMessageSha256: source.processMessageSha256,
        seam: source.seam,
        placement,
      })}\n`);
    }
  }
}
