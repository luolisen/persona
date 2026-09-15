#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { assertSafeDirectory, openclawRoot, readSafeFile, resolveProjectRoot, safeRegularFileExists, writeSafeFile } from "./isolation-paths.mjs";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

function fail(message) {
  throw new Error(`gateway token: ${message}`);
}

export function gatewayTokenPath(projectRoot) {
  return path.join(openclawRoot(projectRoot), "state", "credentials", "gateway.token");
}

export function isUsableGatewayToken(token) {
  return typeof token === "string" && TOKEN_PATTERN.test(token.trim());
}

export function loadOrCreateGatewayToken(projectRoot) {
  const root = resolveProjectRoot(projectRoot);
  const tokenPath = gatewayTokenPath(root);
  const tokenDirectory = path.dirname(tokenPath);
  assertSafeDirectory(root, tokenDirectory, { label: "Gateway token parent" });
  const tokenExists = safeRegularFileExists(root, tokenPath, { label: "Gateway token" });

  if (tokenExists) {
    const token = readSafeFile(root, tokenPath, "utf8", { label: "Gateway token" }).trim();
    if (!isUsableGatewayToken(token)) fail("existing token has an unexpected format");
    fs.chmodSync(tokenPath, 0o600);
    return { token, created: false, tokenPath };
  }

  const token = crypto.randomBytes(32).toString("base64url");
  try {
    writeSafeFile(root, tokenPath, `${token}\n`, { mode: 0o600, label: "Gateway token" });
    return { token, created: true, tokenPath };
  } catch (error) {
    if (error?.code === "EEXIST") return loadOrCreateGatewayToken(root);
    throw error;
  }
}
