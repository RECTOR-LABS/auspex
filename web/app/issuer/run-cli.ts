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
 * Run `node <scriptPath> [...args]` and return stdout.
 * Throws on non-zero exit (caller handles the try/catch).
 */
export function runNode(scriptPath: string, args: string[]): string {
  return execFileSync("node", [scriptPath, ...args], {
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
