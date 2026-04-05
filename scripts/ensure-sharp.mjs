#!/usr/bin/env node
/**
 * postinstall script: ensure sharp native binaries are built/available.
 *
 * @xenova/transformers depends on sharp for image processing.  On some
 * platforms (especially when npm/bun skips install scripts via
 * `ignore-scripts=true` or `.npmrc`) the prebuilt `sharp` binaries are
 * missing, causing the entire plugin warmup to fail.
 *
 * This script:
 *   1. Tries to `require('sharp')` / `import('sharp')`.
 *   2. If that fails, runs `npm rebuild sharp` to trigger the install
 *      script that downloads / compiles the correct native addon.
 *   3. Falls back to `npm install sharp` if rebuild also fails.
 *
 * The script never exits with a non-zero code — a sharp failure should
 * not block the rest of the plugin installation.  Warnings are logged
 * to stderr so they appear in the opencode-mem.log.
 */

import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function log(msg) {
  process.stderr.write(`[opencode-mem postinstall] ${msg}\n`);
}

async function main() {
  // Step 1: quick smoke test
  try {
    await import("sharp");
    log("sharp native module OK — nothing to do.");
    return;
  } catch (err) {
    log(`sharp import failed (${err.message}). Attempting rebuild...`);
  }

  // Step 2: npm rebuild sharp (runs install/check.js → downloads prebuilt)
  try {
    execSync("npm rebuild sharp", { stdio: "inherit", cwd: process.cwd() });
    await import("sharp");
    log("sharp rebuilt successfully.");
    return;
  } catch (err) {
    log(`npm rebuild sharp failed: ${err.message}`);
  }

  // Step 3: full reinstall of sharp
  try {
    execSync("npm install sharp", { stdio: "inherit", cwd: process.cwd() });
    await import("sharp");
    log("sharp reinstalled successfully.");
    return;
  } catch (err) {
    log(`npm install sharp failed: ${err.message}`);
  }

  log(
    "WARNING: Could not build/install sharp native module. " +
      "Local embeddings may be unavailable. See opencode-mem.log for details."
  );
}

main().catch(() => {
  // Never fail the postinstall
});
