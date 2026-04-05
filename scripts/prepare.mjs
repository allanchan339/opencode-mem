#!/usr/bin/env node
/**
 * prepare script — runs on `npm install` AND when installed from git.
 *
 * When npm installs a package from a git URL it:
 *   1. Clones the repo into a temp directory
 *   2. Runs `npm install` inside it
 *   3. Runs the `prepare` lifecycle script
 *   4. Copies the result (minus devDependencies) to node_modules
 *
 * This script therefore must:
 *   a) Build TypeScript → dist/
 *   b) Ensure sharp native binaries are available
 *   c) Run husky (git hooks) — only when .git exists
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

function log(msg) {
  process.stderr.write(`[opencode-mem prepare] ${msg}\n`);
}

function run(cmd, opts = {}) {
  try {
    execSync(cmd, { stdio: "inherit", ...opts });
    return true;
  } catch (err) {
    log(`${cmd} failed: ${err.message}`);
    return false;
  }
}

async function main() {
  // --- Step 1: Build TypeScript ---
  log("Building TypeScript...");
  if (!run("npx tsc")) {
    log("TypeScript build failed — continuing anyway.");
  }

  // --- Step 2: Copy web assets ---
  log("Copying web assets...");
  try {
    const { mkdirSync, cpSync } = await import("node:fs");
    mkdirSync("dist/web", { recursive: true });
    cpSync("src/web", "dist/web", { recursive: true });
    log("Web assets copied.");
  } catch (err) {
    log(`Web assets copy failed: ${err.message}`);
  }

  // --- Step 3: Ensure sharp native module ---
  log("Checking sharp native module...");
  try {
    await import("sharp");
    log("sharp OK.");
  } catch {
    log("sharp import failed, attempting rebuild...");
    if (!run("npm rebuild sharp")) {
      run("npm install sharp");
    }
  }

  // --- Step 4: Husky (only when .git exists) ---
  if (existsSync(".git")) {
    log("Setting up husky...");
    run("npx husky");
  }

  log("prepare complete.");
}

main().catch(() => {
  // Never fail the prepare step
});
