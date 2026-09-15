import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

function pairKey(accountId, contactId) {
  return JSON.stringify([accountId, contactId]);
}

export function createIdempotencyKey(accountId, messageId) {
  return createHash("sha256")
    .update(JSON.stringify([accountId, messageId]))
    .digest("hex");
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeInbound({ accountId, full }) {
  const normalizedAccountId = normalizeString(accountId);
  const senderId = normalizeString(full?.from_user_id);
  const rawMessageId = full?.message_id;
  const messageId = rawMessageId === undefined || rawMessageId === null
    ? ""
    : String(rawMessageId).trim();

  if (!normalizedAccountId || !senderId || !messageId) {
    return { ok: false, reason: "invalid-inbound" };
  }

  const items = Array.isArray(full?.item_list) ? full.item_list : [];
  const text = items
    .map((item) => item?.text_item?.text)
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n");
  const media = items
    .filter((item) => item?.text_item?.text === undefined)
    .map((item) => ({ type: String(item?.type ?? "unknown") }));

  return {
    ok: true,
    accountId: normalizedAccountId,
    senderId,
    messageId,
    text,
    media,
    kind: text && media.length ? "mixed" : text ? "text" : "media",
  };
}

async function ensureSafeDirectory(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("runtime-storage-unsafe");
  }
}

async function readReceipts(receiptPath) {
  try {
    const stat = await fs.lstat(receiptPath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("receipt-file-unsafe");
  } catch (error) {
    if (error?.code === "ENOENT") return new Set();
    throw error;
  }

  const records = await fs.readFile(receiptPath, "utf8");
  const seen = new Set();
  for (const line of records.split("\n")) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    if (typeof record.idempotencyKey !== "string") {
      throw new Error("receipt-record-invalid");
    }
    seen.add(record.idempotencyKey);
  }
  return seen;
}

/**
 * Project-local receipt boundary for the Phase 0 bridge. The receiver accepts
 * only a synthetic Weixin message shape and does not know any routing or send
 * capability.
 */
export function createLocalRuntimeReceiver({
  storageRoot,
  approvedContacts,
  now = () => new Date(),
  appendReceipt = (receiptPath, line) => fs.appendFile(receiptPath, line, { encoding: "utf8", mode: 0o600 }),
}) {
  if (typeof storageRoot !== "string" || !path.isAbsolute(storageRoot)) {
    throw new TypeError("storageRoot must be an absolute path");
  }
  if (!Array.isArray(approvedContacts)) {
    throw new TypeError("approvedContacts must be an array");
  }

  const approved = new Set();
  for (const contact of approvedContacts) {
    const accountId = normalizeString(contact?.accountId);
    const contactId = normalizeString(contact?.contactId);
    if (!accountId || !contactId) throw new TypeError("approved contacts require accountId and contactId");
    approved.add(pairKey(accountId, contactId));
  }

  const receiptPath = path.join(storageRoot, "receipts.ndjson");
  const inFlight = new Set();
  let seen;
  let initialize;

  async function ensureInitialized() {
    if (!initialize) {
      initialize = (async () => {
        await ensureSafeDirectory(storageRoot);
        seen = await readReceipts(receiptPath);
      })();
    }
    await initialize;
  }

  return {
    storageRoot,
    receiptPath,
    async receive({ accountId, full }) {
      try {
        await ensureInitialized();
      } catch {
        return { handled: true, state: "failed", reason: "runtime-storage-unavailable", retryable: true };
      }

      const inbound = normalizeInbound({ accountId, full });
      if (!inbound.ok) {
        return { handled: true, state: "rejected", reason: inbound.reason, retryable: false };
      }
      if (!approved.has(pairKey(inbound.accountId, inbound.senderId))) {
        return { handled: true, state: "rejected", reason: "unknown-contact", retryable: false };
      }

      const idempotencyKey = createIdempotencyKey(inbound.accountId, inbound.messageId);
      if (seen.has(idempotencyKey)) {
        return { handled: true, state: "duplicate", idempotencyKey, retryable: false };
      }
      if (inFlight.has(idempotencyKey)) {
        return { handled: true, state: "in-flight", idempotencyKey, retryable: true };
      }

      inFlight.add(idempotencyKey);
      const receipt = {
        version: 1,
        receivedAt: now().toISOString(),
        idempotencyKey,
        accountId: inbound.accountId,
        messageId: inbound.messageId,
        senderId: inbound.senderId,
        kind: inbound.kind,
        text: inbound.text,
        media: inbound.media,
      };
      try {
        await appendReceipt(receiptPath, `${JSON.stringify(receipt)}\n`);
        seen.add(idempotencyKey);
        return { handled: true, state: "accepted", idempotencyKey, receipt };
      } catch {
        return { handled: true, state: "failed", reason: "runtime-write-failed", retryable: true };
      } finally {
        inFlight.delete(idempotencyKey);
      }
    },
  };
}
