#!/usr/bin/env bun
/**
 * Build script for cass-memory standalone binary.
 *
 * onnxruntime-web has been patched out of @xenova/transformers via
 * patches/@xenova%2Ftransformers@2.17.2.patch — see src/backends/onnx.js.
 * Bun compiled binaries run with process.release.name === 'bun' (not 'node'),
 * which originally caused @xenova/transformers to fall to the browser branch
 * and try to load onnxruntime-web from $bunfs (where it doesn't exist).
 */

import { spawnSync } from "bun";

const target = process.argv[2] ?? "current";

const targetMap: Record<string, string> = {
  current: "bun",
  "linux-x64": "linux-x64",
  "macos-arm64": "darwin-arm64",
  "macos-x64": "darwin-x64",
  "windows-x64": "windows-x64",
};

const outfileMap: Record<string, string> = {
  current: "dist/cass-memory",
  "linux-x64": "dist/cass-memory-linux-x64",
  "macos-arm64": "dist/cass-memory-macos-arm64",
  "macos-x64": "dist/cass-memory-macos-x64",
  "windows-x64": "dist/cass-memory-windows-x64.exe",
};

if (!targetMap[target]) {
  console.error(`Unknown target: ${target}`);
  console.error(`Valid targets: ${Object.keys(targetMap).join(", ")}`);
  process.exit(1);
}

const outfile = outfileMap[target];
const bunTarget = targetMap[target];

console.log(`Building for target: ${target} → ${outfile}`);

const result = spawnSync([
  "bun",
  "build",
  "src/cm.ts",
  "--outfile",
  outfile,
  "--compile",
  "--target",
  bunTarget,
]);

if (result.exitCode !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.exitCode ?? 1);
}

console.log(`✓ Built ${outfile}`);
