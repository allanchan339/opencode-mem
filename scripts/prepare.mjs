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
import { join } from "node:path";
import { createRequire } from "node:module";

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
  // sharp may be at this level OR the parent level (git install wrapper)
  log("Checking sharp native module...");
  const sharpPaths = [
    process.cwd(),
    join(process.cwd(), ".."),
    join(process.cwd(), "..", ".."),
  ];

  let sharpBuilt = false;
  for (const basePath of sharpPaths) {
    const sharpDir = join(basePath, "node_modules", "sharp");
    if (!existsSync(sharpDir)) continue;

    try {
      const sharpRequire = createRequire(join(sharpDir, "lib/sharp.js"));
      sharpRequire("sharp");
      log(`sharp OK at ${sharpDir}`);
      sharpBuilt = true;
      break;
    } catch {
      log(`sharp import failed at ${sharpDir}, rebuilding...`);
      if (run("npm rebuild sharp", { cwd: sharpDir })) {
        sharpBuilt = true;
        break;
      }
      run("npm install sharp", { cwd: basePath });
      try {
        const sharpRequire = createRequire(join(sharpDir, "lib/sharp.js"));
        sharpRequire("sharp");
        sharpBuilt = true;
        break;
      } catch {
        log(`sharp rebuild failed at ${sharpDir}`);
      }
    }
  }

  if (!sharpBuilt) {
    log("WARNING: Could not build sharp native module.");
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
