#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function formatPathError(label, message) {
  return new Error(`isolation path ${label}: ${message}`);
}

export function isInside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

export function resolveProjectRoot(projectRoot) {
  const resolved = path.resolve(projectRoot);
  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch {
    throw formatPathError("project root", `does not exist: ${resolved}`);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw formatPathError("project root", `must be a real directory: ${resolved}`);
  }
  const real = fs.realpathSync(resolved);
  if (real !== resolved) {
    throw formatPathError("project root", `must be a physical path: ${resolved}`);
  }
  return real;
}

export function openclawRoot(projectRoot) {
  return path.join(resolveProjectRoot(projectRoot), ".openclaw");
}

export function resolveInside(projectRoot, candidate, label) {
  const root = resolveProjectRoot(projectRoot);
  const resolved = path.resolve(candidate);
  if (!isInside(resolved, root)) {
    throw formatPathError(label, `escapes project root: ${resolved}`);
  }
  return { root, resolved };
}

function assertExistingDirectory(root, directory, label) {
  let stat;
  try {
    stat = fs.lstatSync(directory);
  } catch {
    throw formatPathError(label, `directory is missing: ${directory}`);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw formatPathError(label, `must be a real directory, not a symlink: ${directory}`);
  }
  const real = fs.realpathSync(directory);
  if (!isInside(real, root)) {
    throw formatPathError(label, `real path escapes project root: ${real}`);
  }
}

function lstatOrMissing(candidate, label) {
  try {
    return fs.lstatSync(candidate);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw formatPathError(label, `cannot inspect path: ${candidate} (${error.message})`);
  }
}

export function ensureSafeDirectory(projectRoot, directory, { mode = 0o700, label = "directory" } = {}) {
  const { root, resolved } = resolveInside(projectRoot, directory, label);
  const relative = path.relative(root, resolved);
  const segments = relative === "" ? [] : relative.split(path.sep);
  let current = root;
  assertExistingDirectory(root, current, "project root");
  for (const segment of segments) {
    current = path.join(current, segment);
    if (lstatOrMissing(current, label) === null) {
      fs.mkdirSync(current, { mode });
    }
    assertExistingDirectory(root, current, label);
  }
  fs.chmodSync(resolved, mode);
  return resolved;
}

export function assertSafeDirectory(projectRoot, directory, { label = "directory" } = {}) {
  const { root, resolved } = resolveInside(projectRoot, directory, label);
  assertExistingDirectory(root, resolved, label);
  return resolved;
}

export function assertSafeRegularFile(projectRoot, file, { allowMissing = false, label = "file" } = {}) {
  const { root, resolved } = resolveInside(projectRoot, file, label);
  assertExistingDirectory(root, path.dirname(resolved), `${label} parent`);
  const stat = lstatOrMissing(resolved, label);
  if (stat === null) {
    if (allowMissing) return resolved;
    throw formatPathError(label, `is missing: ${resolved}`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw formatPathError(label, `must be a regular file, not a symlink: ${resolved}`);
  }
  const real = fs.realpathSync(resolved);
  if (!isInside(real, root)) {
    throw formatPathError(label, `real path escapes project root: ${real}`);
  }
  return resolved;
}

export function safeRegularFileExists(projectRoot, file, { label = "file" } = {}) {
  const resolved = assertSafeRegularFile(projectRoot, file, { allowMissing: true, label });
  return lstatOrMissing(resolved, label) !== null;
}

export function readSafeFile(projectRoot, file, encoding = "utf8", options = {}) {
  const resolved = assertSafeRegularFile(projectRoot, file, options);
  return fs.readFileSync(resolved, encoding);
}

export function writeSafeFile(projectRoot, file, contents, { mode = 0o600, label = "file" } = {}) {
  const resolved = assertSafeRegularFile(projectRoot, file, { allowMissing: true, label });
  const noFollow = fs.constants.O_NOFOLLOW ?? 0;
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | noFollow;
  const descriptor = fs.openSync(resolved, flags, mode);
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) throw formatPathError(label, `opened target is not a regular file: ${resolved}`);
    fs.writeFileSync(descriptor, contents, "utf8");
    fs.fchmodSync(descriptor, mode);
  } finally {
    fs.closeSync(descriptor);
  }
  return resolved;
}

export function assertSafeRuntimeDirectory(projectRoot, runtimeDirectory) {
  const runtime = assertSafeDirectory(projectRoot, runtimeDirectory, { label: "runtime directory" });
  for (const [relative, label] of [
    ["node_modules", "runtime node_modules directory"],
    ["node_modules/openclaw", "project-local OpenClaw package directory"],
  ]) {
    const candidate = path.join(runtime, relative);
    if (lstatOrMissing(candidate, label) !== null) {
      assertSafeDirectory(projectRoot, candidate, { label });
    }
  }
  return runtime;
}

export function assertSafeRuntimeCli(projectRoot, runtimeDirectory) {
  const runtime = assertSafeRuntimeDirectory(projectRoot, runtimeDirectory);
  const cli = path.join(runtime, "node_modules", "openclaw", "openclaw.mjs");
  assertSafeRegularFile(projectRoot, cli, { label: "project-local OpenClaw CLI" });
  const realRuntime = fs.realpathSync(runtime);
  const realCli = fs.realpathSync(cli);
  if (!isInside(realCli, realRuntime)) {
    throw formatPathError("project-local OpenClaw CLI", `real path escapes runtime directory: ${realCli}`);
  }
  return cli;
}

export function assertSafeRuntimeInstallTarget(projectRoot, runtimeDirectory) {
  const runtime = assertSafeRuntimeDirectory(projectRoot, runtimeDirectory);
  // A first install legitimately has no node_modules/openclaw directory yet.
  // Create that parent through the same component-by-component lstat/realpath
  // checks used for every project directory, rather than treating a missing
  // parent as an unsafe target or letting npm create an unchecked path.
  ensureSafeDirectory(projectRoot, path.join(runtime, "node_modules", "openclaw"), {
    label: "project-local OpenClaw package install directory",
  });
  const cli = path.join(runtime, "node_modules", "openclaw", "openclaw.mjs");
  assertSafeRegularFile(projectRoot, cli, {
    allowMissing: true,
    label: "project-local OpenClaw CLI install target",
  });
  return cli;
}
