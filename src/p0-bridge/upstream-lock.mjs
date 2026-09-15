import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const PINNED_WEIXIN_SOURCE = Object.freeze({
  host: {
    name: "openclaw",
    version: "2026.7.1-2",
  },
  plugin: {
    name: "@tencent-weixin/openclaw-weixin",
    version: "2.4.6",
    monitorRelativePath: "src/monitor/monitor.ts",
    monitorSha256: "4cf6c899fe9f467698c83f2fd098399fb5c07a4f5e9c2e301cd6ba9f7c78ac54",
    processMessageRelativePath: "src/messaging/process-message.ts",
    processMessageSha256: "c128393c09f49c16cf14da83cbaf4cb5f345f6c98ac819517d4b1c73d6d8eaba",
    anchors: Object.freeze([
      "for (const full of list) {",
      "const cachedConfig = await configManager.getForUser(fromUserId, full.context_token);",
      "await processOneMessage(full, {",
    ]),
  },
});

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function disabled(reason, details = {}) {
  return { enabled: false, reason, ...details };
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export function locateMonitorSeam(source, anchors = PINNED_WEIXIN_SOURCE.plugin.anchors) {
  const positions = anchors.map((anchor) => source.indexOf(anchor));
  if (positions.some((position) => position < 0)) {
    return { ok: false, reason: "monitor-anchor-missing", positions };
  }
  for (let index = 1; index < positions.length; index += 1) {
    if (positions[index - 1] >= positions[index]) {
      return { ok: false, reason: "monitor-anchor-order-mismatch", positions };
    }
  }
  return {
    ok: true,
    monitorLoop: positions[0],
    configLookup: positions[1],
    nativeProcess: positions[2],
  };
}

/**
 * Confirm that an overlay is being prepared for the precise source that was
 * audited. This reads package metadata and TypeScript source only.
 */
export async function verifyPinnedWeixinSource({
  pluginRoot,
  openclawRoot,
  expected = PINNED_WEIXIN_SOURCE,
}) {
  if (typeof pluginRoot !== "string" || typeof openclawRoot !== "string") {
    return disabled("source-root-missing");
  }

  let pluginPackage;
  let hostPackage;
  try {
    [pluginPackage, hostPackage] = await Promise.all([
      readJson(path.join(pluginRoot, "package.json")),
      readJson(path.join(openclawRoot, "package.json")),
    ]);
  } catch {
    return disabled("source-package-unreadable");
  }

  if (
    pluginPackage.name !== expected.plugin.name ||
    pluginPackage.version !== expected.plugin.version
  ) {
    return disabled("plugin-version-mismatch", {
      actualPlugin: { name: pluginPackage.name, version: pluginPackage.version },
    });
  }
  if (
    hostPackage.name !== expected.host.name ||
    hostPackage.version !== expected.host.version
  ) {
    return disabled("host-version-mismatch", {
      actualHost: { name: hostPackage.name, version: hostPackage.version },
    });
  }

  const monitorPath = path.join(pluginRoot, expected.plugin.monitorRelativePath);
  let monitorSource;
  try {
    const monitorStat = await fs.lstat(monitorPath);
    if (!monitorStat.isFile() || monitorStat.isSymbolicLink()) {
      return disabled("monitor-source-unsafe");
    }
    monitorSource = await fs.readFile(monitorPath, "utf8");
  } catch {
    return disabled("monitor-source-unreadable");
  }

  const digest = sha256(monitorSource);
  if (digest !== expected.plugin.monitorSha256) {
    return disabled("monitor-source-hash-mismatch", { actualMonitorSha256: digest });
  }

  const seam = locateMonitorSeam(monitorSource, expected.plugin.anchors);
  if (!seam.ok) return disabled(seam.reason, { positions: seam.positions });

  const processMessagePath = path.join(pluginRoot, expected.plugin.processMessageRelativePath);
  let processMessageSource;
  try {
    const processMessageStat = await fs.lstat(processMessagePath);
    if (!processMessageStat.isFile() || processMessageStat.isSymbolicLink()) {
      return disabled("process-message-source-unsafe");
    }
    processMessageSource = await fs.readFile(processMessagePath, "utf8");
  } catch {
    return disabled("process-message-source-unreadable");
  }
  const processMessageDigest = sha256(processMessageSource);
  if (processMessageDigest !== expected.plugin.processMessageSha256) {
    return disabled("process-message-source-hash-mismatch", { actualProcessMessageSha256: processMessageDigest });
  }

  return {
    enabled: true,
    reason: null,
    plugin: { name: pluginPackage.name, version: pluginPackage.version },
    host: { name: hostPackage.name, version: hostPackage.version },
    monitorPath,
    monitorSha256: digest,
    processMessagePath,
    processMessageSha256: processMessageDigest,
    seam,
  };
}
