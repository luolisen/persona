import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createControlledMonitorFork,
  createExecutableControlledMonitorLoop,
  inspectControlledMonitorFork,
} from "../src/p0-bridge/controlled-monitor-fork.mjs";
import {
  configureP0WeixinInboundBridge,
  processP0WeixinInbound,
  resetP0WeixinInboundBridge,
} from "../src/p0-bridge/p0-weixin-inbound-bridge.mjs";
import {
  createIdempotencyKey,
  createLocalRuntimeReceiver,
} from "../src/p0-bridge/runtime-receiver.mjs";
import {
  PINNED_WEIXIN_SOURCE,
  sha256,
  verifyPinnedWeixinSource,
} from "../src/p0-bridge/upstream-lock.mjs";
import { createVersionLockedWeixinMonitorSeam } from "../src/p0-bridge/weixin-monitor-seam.mjs";

const pluginRoot = process.env.P0_WEIXIN_PLUGIN_ROOT;
const openclawRoot = process.env.P0_OPENCLAW_ROOT;

function message({
  id = 1,
  sender = "contact-a",
  text = "你好",
  items,
  contextToken = "must-not-be-persisted",
} = {}) {
  return {
    message_id: id,
    from_user_id: sender,
    context_token: contextToken,
    item_list: items ?? [{ type: "TEXT", text_item: { text } }],
  };
}

async function temporaryProjectRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "persona-p0-bridge-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

async function readReceiptLines(receiptPath) {
  try {
    return (await fs.readFile(receiptPath, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

const enabledSource = async () => ({ enabled: true, reason: null });

async function createConfiguredBridge(t, receiver, verifySource = enabledSource) {
  const seam = await createVersionLockedWeixinMonitorSeam({
    pluginRoot: "/not-used-in-unit-test/plugin",
    openclawRoot: "/not-used-in-unit-test/openclaw",
    receiver,
    verifySource,
  });
  configureP0WeixinInboundBridge(seam);
  t.after(resetP0WeixinInboundBridge);
  return seam;
}

test("approved text reaches the local Runtime receipt boundary", async (t) => {
  const projectRoot = await temporaryProjectRoot(t);
  const receiver = createLocalRuntimeReceiver({
    projectRoot,
    approvedContacts: [{ accountId: "account-a", contactId: "contact-a" }],
    now: () => new Date("2026-09-16T00:00:00.000Z"),
  });
  await createConfiguredBridge(t, receiver);

  const result = await processP0WeixinInbound({ accountId: "account-a", full: message({ id: 101 }) });
  assert.equal(result.handled, true);
  assert.equal(result.state, "accepted");

  const [receipt] = await readReceiptLines(receiver.receiptPath);
  assert.deepEqual(receipt, {
    version: 1,
    receivedAt: "2026-09-16T00:00:00.000Z",
    idempotencyKey: createIdempotencyKey("account-a", "101"),
    accountId: "account-a",
    messageId: "101",
    senderId: "contact-a",
    kind: "text",
    text: "你好",
    media: [],
  });
});

test("unknown contacts are handled without a local receipt", async (t) => {
  const projectRoot = await temporaryProjectRoot(t);
  const receiver = createLocalRuntimeReceiver({
    projectRoot,
    approvedContacts: [{ accountId: "account-a", contactId: "contact-a" }],
  });
  await createConfiguredBridge(t, receiver);

  const result = await processP0WeixinInbound({
    accountId: "account-a",
    full: message({ id: 102, sender: "unknown-contact" }),
  });
  assert.deepEqual(result, {
    handled: true,
    state: "rejected",
    reason: "unknown-contact",
    retryable: false,
  });
  assert.deepEqual(await readReceiptLines(receiver.receiptPath), []);
});

test("missing and throwing bridges fail closed", async (t) => {
  t.after(resetP0WeixinInboundBridge);
  const missing = await processP0WeixinInbound({ accountId: "account-a", full: message({ id: 103 }) });
  assert.equal(missing.handled, true);
  assert.equal(missing.reason, "bridge-unavailable");

  configureP0WeixinInboundBridge({
    intercept: async () => {
      throw new Error("synthetic bridge failure");
    },
  });
  const throwing = await processP0WeixinInbound({ accountId: "account-a", full: message({ id: 104 }) });
  assert.equal(throwing.handled, true);
  assert.equal(throwing.reason, "bridge-exception");
});

test("version mismatch rejects the seam before the receiver can run", async (t) => {
  let receives = 0;
  const receiver = {
    receive: async () => {
      receives += 1;
      return { handled: true, state: "accepted" };
    },
  };
  await createConfiguredBridge(t, receiver, async () => ({ enabled: false, reason: "plugin-version-mismatch" }));

  const result = await processP0WeixinInbound({ accountId: "account-a", full: message({ id: 105 }) });
  assert.deepEqual(result, {
    handled: true,
    state: "failed",
    reason: "plugin-version-mismatch",
    retryable: false,
  });
  assert.equal(receives, 0);
});

test("duplicates are scoped by account and are recorded only once", async (t) => {
  const projectRoot = await temporaryProjectRoot(t);
  const receiver = createLocalRuntimeReceiver({
    projectRoot,
    approvedContacts: [
      { accountId: "account-a", contactId: "contact-a" },
      { accountId: "account-b", contactId: "contact-b" },
    ],
  });
  await createConfiguredBridge(t, receiver);

  const first = await processP0WeixinInbound({ accountId: "account-a", full: message({ id: 106 }) });
  const duplicate = await processP0WeixinInbound({ accountId: "account-a", full: message({ id: 106 }) });
  const otherAccount = await processP0WeixinInbound({
    accountId: "account-b",
    full: message({ id: 106, sender: "contact-b" }),
  });

  assert.equal(first.state, "accepted");
  assert.equal(duplicate.state, "duplicate");
  assert.equal(otherAccount.state, "accepted");
  assert.equal((await readReceiptLines(receiver.receiptPath)).length, 2);
});

test("media stores metadata only and never persists a context token or URL", async (t) => {
  const projectRoot = await temporaryProjectRoot(t);
  const receiver = createLocalRuntimeReceiver({
    projectRoot,
    approvedContacts: [{ accountId: "account-a", contactId: "contact-a" }],
  });
  await createConfiguredBridge(t, receiver);

  const result = await processP0WeixinInbound({
    accountId: "account-a",
    full: message({
      id: 107,
      items: [{ type: "IMAGE", image_item: { cdn_url: "https://example.invalid/media" } }],
    }),
  });
  assert.equal(result.state, "accepted");
  const [receipt] = await readReceiptLines(receiver.receiptPath);
  assert.deepEqual(receipt.media, [{ type: "IMAGE" }]);
  assert.equal(JSON.stringify(receipt).includes("must-not-be-persisted"), false);
  assert.equal(JSON.stringify(receipt).includes("example.invalid"), false);
});

test("a persistence failure leaves the idempotency key retryable", async (t) => {
  const projectRoot = await temporaryProjectRoot(t);
  let fail = true;
  const receiver = createLocalRuntimeReceiver({
    projectRoot,
    approvedContacts: [{ accountId: "account-a", contactId: "contact-a" }],
    appendReceipt: async (receiptPath, line) => {
      if (fail) throw new Error("synthetic disk failure");
      await fs.appendFile(receiptPath, line, "utf8");
    },
  });
  await createConfiguredBridge(t, receiver);

  const first = await processP0WeixinInbound({ accountId: "account-a", full: message({ id: 108 }) });
  fail = false;
  const retry = await processP0WeixinInbound({ accountId: "account-a", full: message({ id: 108 }) });
  assert.deepEqual(first, {
    handled: true,
    state: "failed",
    reason: "runtime-write-failed",
    retryable: true,
  });
  assert.equal(retry.state, "accepted");
  assert.equal((await readReceiptLines(receiver.receiptPath)).length, 1);
});

test("a symlinked project state directory cannot redirect Runtime receipts", async (t) => {
  const projectRoot = await temporaryProjectRoot(t);
  const externalRoot = await fs.mkdtemp(path.join(os.tmpdir(), "persona-p0-external-"));
  t.after(() => fs.rm(externalRoot, { recursive: true, force: true }));
  await fs.symlink(externalRoot, path.join(projectRoot, ".openclaw"));
  const receiver = createLocalRuntimeReceiver({
    projectRoot,
    approvedContacts: [{ accountId: "account-a", contactId: "contact-a" }],
  });
  await createConfiguredBridge(t, receiver);

  const result = await processP0WeixinInbound({ accountId: "account-a", full: message({ id: 109 }) });
  assert.deepEqual(result, {
    handled: true,
    state: "failed",
    reason: "runtime-storage-unavailable",
    retryable: true,
  });
  assert.deepEqual(await fs.readdir(externalRoot), []);
});

test("a failed initial storage check can recover and retry on the same receiver", async (t) => {
  const projectRoot = await temporaryProjectRoot(t);
  const externalRoot = await fs.mkdtemp(path.join(os.tmpdir(), "persona-p0-external-"));
  t.after(() => fs.rm(externalRoot, { recursive: true, force: true }));
  const linkedState = path.join(projectRoot, ".openclaw");
  await fs.symlink(externalRoot, linkedState);
  const receiver = createLocalRuntimeReceiver({
    projectRoot,
    approvedContacts: [{ accountId: "account-a", contactId: "contact-a" }],
  });
  await createConfiguredBridge(t, receiver);

  const first = await processP0WeixinInbound({ accountId: "account-a", full: message({ id: 110 }) });
  await fs.unlink(linkedState);
  const retry = await processP0WeixinInbound({ accountId: "account-a", full: message({ id: 110 }) });
  assert.equal(first.state, "failed");
  assert.equal(retry.state, "accepted");
  assert.equal((await readReceiptLines(receiver.receiptPath)).length, 1);
});

test("a receipt-file symlink is rejected before a write can escape", async (t) => {
  const projectRoot = await temporaryProjectRoot(t);
  const externalReceipt = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "persona-p0-external-")), "receipt.ndjson");
  t.after(() => fs.rm(path.dirname(externalReceipt), { recursive: true, force: true }));
  const receiver = createLocalRuntimeReceiver({
    projectRoot,
    approvedContacts: [{ accountId: "account-a", contactId: "contact-a" }],
  });
  await fs.mkdir(receiver.storageRoot, { recursive: true });
  await fs.writeFile(externalReceipt, "external-sentinel\n", "utf8");
  await fs.symlink(externalReceipt, receiver.receiptPath);
  await createConfiguredBridge(t, receiver);

  const result = await processP0WeixinInbound({ accountId: "account-a", full: message({ id: 111 }) });
  assert.equal(result.state, "failed");
  assert.equal(await fs.readFile(externalReceipt, "utf8"), "external-sentinel\n");
});

test("the controlled overlay continues before the native message processor", async () => {
  const source = [
    "import type { PluginRuntime } from \"openclaw/plugin-sdk/core\";",
    "",
    "const DEFAULT_LONG_POLL_TIMEOUT_MS = 35_000;",
    "for (const full of list) {",
    "        const fromUserId = full.from_user_id ?? \"\";",
    "        const cachedConfig = await configManager.getForUser(fromUserId, full.context_token);",
    "        await processOneMessage(full, {",
    "          accountId,",
    "        });",
    "}",
  ].join("\n");
  const overlay = createControlledMonitorFork(source);
  assert.deepEqual(inspectControlledMonitorFork(overlay).ok, true);
  assert.throws(() => createExecutableControlledMonitorLoop(source), /monitor-source-hash-mismatch/);
});

test("the audited installed source executes the generated bridge call before native processing", { skip: !pluginRoot || !openclawRoot }, async () => {
  const lock = await verifyPinnedWeixinSource({ pluginRoot, openclawRoot });
  assert.equal(lock.enabled, true, lock.reason);
  assert.equal(lock.monitorSha256, PINNED_WEIXIN_SOURCE.plugin.monitorSha256);
  assert.equal(lock.processMessageSha256, PINNED_WEIXIN_SOURCE.plugin.processMessageSha256);
  const source = await fs.readFile(lock.monitorPath, "utf8");
  const overlay = createControlledMonitorFork(source);
  assert.deepEqual(inspectControlledMonitorFork(overlay).ok, true);
  const executeLoop = createExecutableControlledMonitorLoop(source);
  let bridgeCalls = 0;
  let nativeCalls = 0;
  const result = await executeLoop(
    [message({ id: 112 })],
    { info: () => {}, error: () => {} },
    undefined,
    "account-a",
    async ({ accountId, full }) => {
      bridgeCalls += 1;
      assert.equal(accountId, "account-a");
      assert.equal(full.message_id, 112);
      return { handled: true, state: "accepted" };
    },
    async () => {
      nativeCalls += 1;
    },
  );
  assert.equal(result, undefined);
  assert.equal(bridgeCalls, 1);
  assert.equal(nativeCalls, 0);
});

test("source verifier rejects a mismatched plugin fixture", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "persona-p0-source-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const fixturePlugin = path.join(root, "plugin");
  const fixtureHost = path.join(root, "host");
  await fs.mkdir(path.join(fixturePlugin, "src", "monitor"), { recursive: true });
  await fs.mkdir(fixtureHost, { recursive: true });
  await fs.writeFile(path.join(fixturePlugin, "package.json"), JSON.stringify({
    name: "@tencent-weixin/openclaw-weixin",
    version: "different",
  }));
  await fs.writeFile(path.join(fixtureHost, "package.json"), JSON.stringify({
    name: "openclaw",
    version: PINNED_WEIXIN_SOURCE.host.version,
  }));
  await fs.writeFile(path.join(fixturePlugin, "src", "monitor", "monitor.ts"), "unused");

  const result = await verifyPinnedWeixinSource({ pluginRoot: fixturePlugin, openclawRoot: fixtureHost });
  assert.equal(result.enabled, false);
  assert.equal(result.reason, "plugin-version-mismatch");
  assert.equal(sha256("unused").length, 64);
});
