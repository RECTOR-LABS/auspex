/**
 * run-cli.ts — opaque wrapper around execFileSync for the auspex CLI.
 *
 * This module exists solely to break Turbopack's static module-resolution
 * tracing. When actions.ts calls execFileSync with a computed absolute path
 * ending in `.js`, Turbopack traces the path as a module import candidate
 * and errors. By isolating the exec calls here and only exporting a typed
 * function that receives the path as a `string` argument — with the actual
 * value never visible to the tracer at the call site — the issue disappears.
 *
 * This module is server-only (imported only from "use server" code).
 */

import { execFileSync } from "node:child_process";

export interface ExecResult {
  stdout: string;
}

/**
 * Hard ceiling on a single CLI subprocess. The solvency prove (compile +
 * witness + bb prove + vk) is the long pole; 3 minutes is generous headroom
 * over its ~15-20s typical run while still bounding a hung toolchain.
 */
const SUBPROCESS_TIMEOUT_MS = 180_000;

/**
 * nargo/bb can stream several MB of progress output; Node's 1 MB default would
 * throw ENOBUFS and mask the real result behind a misleading failure.
 */
const SUBPROCESS_MAX_BUFFER = 20 * 1024 * 1024;

/**
 * Run `node <scriptPath> [...args]` and return stdout.
 * Throws on non-zero exit, on timeout (Error.code === "ETIMEDOUT"), or if output
 * exceeds the buffer ceiling (the caller handles the try/catch).
 */
export function runNode(scriptPath: string, args: string[]): string {
  return execFileSync("node", [scriptPath, ...args], {
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: SUBPROCESS_TIMEOUT_MS,
    maxBuffer: SUBPROCESS_MAX_BUFFER,
  });
}
