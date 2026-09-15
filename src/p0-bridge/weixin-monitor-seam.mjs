import { verifyPinnedWeixinSource } from "./upstream-lock.mjs";

function closed(reason, retryable) {
  return { handled: true, state: "failed", reason, retryable };
}

/**
 * The only result this seam exposes is handled=true. The controlled monitor
 * fork therefore never falls through to the original processOneMessage path.
 */
export async function createVersionLockedWeixinMonitorSeam({
  pluginRoot,
  openclawRoot,
  receiver,
  verifySource = verifyPinnedWeixinSource,
}) {
  const source = await verifySource({ pluginRoot, openclawRoot });

  return {
    source,
    async intercept({ accountId, full }) {
      if (!source?.enabled) return closed(source?.reason ?? "source-lock-unavailable", false);
      if (!receiver || typeof receiver.receive !== "function") {
        return closed("bridge-unavailable", true);
      }
      try {
        const result = await receiver.receive({ accountId, full });
        if (!result || result.handled !== true) return closed("bridge-invalid-result", true);
        return result;
      } catch {
        return closed("bridge-exception", true);
      }
    },
  };
}
