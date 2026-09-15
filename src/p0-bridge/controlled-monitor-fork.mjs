import { PINNED_WEIXIN_SOURCE, locateMonitorSeam } from "./upstream-lock.mjs";

const IMPORT_MARKER = 'import { processP0WeixinInbound } from "./p0-weixin-inbound-bridge.js";\n';
const IMPORT_ANCHOR = "const DEFAULT_LONG_POLL_TIMEOUT_MS";
const ITERATION_ANCHOR = '        const fromUserId = full.from_user_id ?? "";\n';
const BRIDGE_CALL = [
  "        const p0BridgeResult = await processP0WeixinInbound({",
  "          accountId,",
  "          full,",
  "        });",
  "        if (!p0BridgeResult?.handled) {",
  '          aLog.error("p0 inbound bridge returned an invalid result; dropping message");',
  "        }",
  "        continue;",
  "",
].join("\n");

/**
 * Produce the monitor-file overlay for the audited upstream source. The output
 * is never written into an installed plugin by this module.
 */
export function createControlledMonitorFork(monitorSource) {
  if (typeof monitorSource !== "string") throw new TypeError("monitorSource must be text");
  const seam = locateMonitorSeam(monitorSource, PINNED_WEIXIN_SOURCE.plugin.anchors);
  if (!seam.ok) throw new Error(seam.reason);
  if (monitorSource.indexOf(IMPORT_ANCHOR) < 0 || monitorSource.indexOf(ITERATION_ANCHOR) < 0) {
    throw new Error("monitor-fork-anchor-missing");
  }
  if (monitorSource.includes(IMPORT_MARKER) || monitorSource.includes(BRIDGE_CALL)) {
    throw new Error("monitor-fork-already-applied");
  }

  const withImport = monitorSource.replace(IMPORT_ANCHOR, `${IMPORT_MARKER}\n${IMPORT_ANCHOR}`);
  return withImport.replace(ITERATION_ANCHOR, `${BRIDGE_CALL}${ITERATION_ANCHOR}`);
}

export function inspectControlledMonitorFork(monitorSource) {
  const bridgeCall = monitorSource.indexOf("await processP0WeixinInbound({");
  const nativeProcess = monitorSource.indexOf("await processOneMessage(full, {");
  const continueAfterBridge = monitorSource.indexOf("        continue;", bridgeCall);
  return {
    ok: bridgeCall >= 0 && nativeProcess > bridgeCall && continueAfterBridge > bridgeCall && continueAfterBridge < nativeProcess,
    bridgeCall,
    continueAfterBridge,
    nativeProcess,
  };
}
