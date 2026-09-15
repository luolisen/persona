let activeBridge = null;

export function configureP0WeixinInboundBridge(bridge) {
  activeBridge = bridge;
}

export function resetP0WeixinInboundBridge() {
  activeBridge = null;
}

/**
 * Entry copied beside the controlled monitor overlay. An absent or broken
 * bridge is intentionally represented as a handled failure, never fallback.
 */
export async function processP0WeixinInbound({ accountId, full }) {
  if (!activeBridge || typeof activeBridge.intercept !== "function") {
    return { handled: true, state: "failed", reason: "bridge-unavailable", retryable: true };
  }
  try {
    const result = await activeBridge.intercept({ accountId, full });
    if (!result || result.handled !== true) {
      return { handled: true, state: "failed", reason: "bridge-invalid-result", retryable: true };
    }
    return result;
  } catch {
    return { handled: true, state: "failed", reason: "bridge-exception", retryable: true };
  }
}
