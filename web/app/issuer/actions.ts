"use server";

import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { runNode } from "./run-cli";

/* ─── Result type ────────────────────────────────────────────────────────── */

export type ActionResult =
  | {
      ok: true;
      id: string;
      txHash: string;
      commitment: string;
      bufferBps: number;
      maxConcentrationBps: number;
      minLiquidityBps: number;
    }
  | { ok: false; error: string };

/* ─── Path helpers ───────────────────────────────────────────────────────── */

/**
 * Compute the absolute path to the auspex CLI entry point.
 *
 * Called as a function (not a top-level const) so that the path string is
 * never visible to Turbopack's static module-resolution tracer.
 * process.cwd() = web/ when Next.js runs from the web directory.
 */
function cliPath(): string {
  return path.join(process.cwd(), "..", "cli", "dist", "index.js");
}

function proofDirPath(): string {
  return path.join(process.cwd(), "..", "circuits", "solvency", "target");
}

/* ─── Prover serialization ───────────────────────────────────────────────────
 * The CLI proves against a SHARED circuit working tree
 * (circuits/{commitment,solvency}/Prover.toml + target/). Two concurrent
 * requests would clobber each other's witness between write and read, producing
 * a proof over the wrong book — a correctness failure of the core ZK property.
 * Serialize the prove→publish critical section across every request handled by
 * this server instance. (Production hardening: give each request its own circuit
 * working dir instead of serializing; tracked as future work.)
 * ───────────────────────────────────────────────────────────────────────── */

let proverLock: Promise<void> = Promise.resolve();

/**
 * Acquire the prover lock. Resolves once any in-flight prove→publish has
 * finished, and returns a release fn the caller MUST invoke (in a `finally`)
 * so the next queued request can proceed. Chains past failures so one errored
 * request never wedges the queue.
 */
async function acquireProverLock(): Promise<() => void> {
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previous = proverLock;
  proverLock = previous.then(() => next);
  await previous;
  return release;
}

/* ─── generateAndPublish ─────────────────────────────────────────────────── */

/**
 * Server action: write temp files → prove → publish → return
 * { id, txHash, commitment, bufferBps, maxConcentrationBps, minLiquidityBps }.
 *
 * Called from IssuerForm via useActionState. Receives prevState + FormData per
 * the Next 16 / React 19 server-action-with-state contract.
 *
 * Privacy guarantees:
 *  - The raw book JSON is written to an absolute-path temp file; never passed
 *    to the client, never echoed in errors.
 *  - AUSPEX_SECRET is never read into a JS variable; inherited by child process
 *    via process.env.
 *  - Temp dir is always removed in `finally` regardless of outcome.
 */
export async function generateAndPublish(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // ── 0. Read-only deployments have no prover toolchain ───────────────────
  if (process.env.AUSPEX_READONLY) {
    return {
      ok: false,
      error:
        "Proving is disabled on this hosted demo — run the CLI locally to issue an attestation.",
    };
  }

  // ── 1. Parse + validate inputs ──────────────────────────────────────────

  const bookRaw = formData.get("book");
  if (typeof bookRaw !== "string" || bookRaw.trim() === "") {
    return { ok: false, error: "Book JSON is required." };
  }

  let parsedBook: unknown;
  try {
    parsedBook = JSON.parse(bookRaw);
  } catch {
    return {
      ok: false,
      error: "Book JSON is not valid JSON. Fix the syntax and try again.",
    };
  }

  if (
    typeof parsedBook !== "object" ||
    parsedBook === null ||
    !("positions" in parsedBook) ||
    !("liabilities" in parsedBook)
  ) {
    return {
      ok: false,
      error: 'Book JSON must include "positions" and "liabilities" fields.',
    };
  }

  const bufferBpsRaw = formData.get("bufferBps");
  const maxConcentrationBpsRaw = formData.get("maxConcentrationBps");
  const minLiquidityBpsRaw = formData.get("minLiquidityBps");

  const bufferBps = Number(bufferBpsRaw);
  const maxConcentrationBps = Number(maxConcentrationBpsRaw);
  const minLiquidityBps = Number(minLiquidityBpsRaw);

  if (
    !isFinite(bufferBps) ||
    bufferBps < 0 ||
    !isFinite(maxConcentrationBps) ||
    maxConcentrationBps < 0 ||
    !isFinite(minLiquidityBps) ||
    minLiquidityBps < 0
  ) {
    return {
      ok: false,
      error:
        "Policy values must be finite non-negative integers (basis points).",
    };
  }

  // The circuit types each threshold as a u32, so fractional bps are invalid.
  if (
    !Number.isInteger(bufferBps) ||
    !Number.isInteger(maxConcentrationBps) ||
    !Number.isInteger(minLiquidityBps)
  ) {
    return {
      ok: false,
      error:
        "Policy values must be whole numbers of basis points (no decimals).",
    };
  }

  // ── 2. Resolve paths ───────────────────────────────────────────────────
  // Paths are computed via functions (never top-level consts) so Turbopack's
  // static module-resolution tracer cannot follow them to the `.js` file and
  // mistake them for module imports.

  const cli = cliPath();
  const proofDir = proofDirPath();

  // ── 3. Write temp files ────────────────────────────────────────────────
  // Use absolute paths — the CLI resolves --book / --policy relative to its
  // own cwd, so absolute paths are required for correctness.

  let tmpDir: string | null = null;
  let releaseLock: (() => void) | null = null;

  try {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "auspex-"));
    const bookTmp = path.join(tmpDir, "book.json");
    const policyTmp = path.join(tmpDir, "policy.json");

    // Strip _disclaimer to avoid confusing the CLI schema validator.
    // The raw book never appears in logs or error messages — only the temp path.
    const bookForCli = parsedBook as Record<string, unknown>;
    const { _disclaimer: _d, ...cleanBook } = bookForCli;
    writeFileSync(bookTmp, JSON.stringify(cleanBook), "utf8");

    const policy = { bufferBps, maxConcentrationBps, minLiquidityBps };
    writeFileSync(policyTmp, JSON.stringify(policy), "utf8");

    // Serialize from here on: prove + publish both operate on the shared
    // circuit working tree, so only one request may hold it at a time.
    releaseLock = await acquireProverLock();

    // ── 4. Run prove ─────────────────────────────────────────────────────

    try {
      runNode(cli, ["prove", "--book", bookTmp, "--policy", policyTmp]);
    } catch (err) {
      // Non-zero exit = constraint violation (unsatisfiable book) or missing
      // toolchain; ETIMEDOUT = the prover exceeded its ceiling. Log server-side
      // only, bounded — the message can carry captured subprocess output.
      const e = err as NodeJS.ErrnoException;
      console.error("[auspex:issuer] prove failed:", e.message.slice(0, 200));
      if (e.code === "ETIMEDOUT") {
        return {
          ok: false,
          error:
            "Proof generation timed out before it finished. The prover may be " +
            "overloaded — please try again.",
        };
      }
      return {
        ok: false,
        error:
          "This book doesn't satisfy the policy, so no proof exists to publish. " +
          "Adjust the book or the limits.",
      };
    }

    // Derive the displayed commitment from the proof artifact itself — the first
    // 32 bytes of public_inputs, big-endian — instead of scraping prove's
    // stdout. This is the exact value publish writes on-chain, so the seal shown
    // to the issuer always matches the attestation, and a change in CLI log
    // formatting can never render a zeroed seal (audit: Medium). Reading the
    // shared target/ here is safe: the prover lock is held through publish.
    let commitment: string;
    try {
      const publicInputs = readFileSync(path.join(proofDir, "public_inputs"));
      if (publicInputs.length < 32) {
        throw new Error(`public_inputs too short: ${publicInputs.length} bytes`);
      }
      commitment = "0x" + publicInputs.subarray(0, 32).toString("hex");
    } catch (err) {
      console.error(
        "[auspex:issuer] could not read commitment from public_inputs:",
        (err as Error).message.slice(0, 200),
      );
      return {
        ok: false,
        error:
          "The proof was generated but its commitment could not be read. " +
          "Check the server logs.",
      };
    }

    // ── 5. Guard AUSPEX_SECRET ────────────────────────────────────────────
    // Never read or echo the secret value — only check for presence.

    if (!process.env.AUSPEX_SECRET) {
      return {
        ok: false,
        error: "Publishing isn't configured on this server.",
      };
    }

    // ── 6. Run publish ────────────────────────────────────────────────────
    // AUSPEX_SECRET is inherited by the child process via process.env (set
    // in runNode) — never assigned to a JS variable here.

    let publishStdout: string;
    try {
      publishStdout = runNode(cli, [
        "publish",
        "--proof",
        proofDir,
        "--network",
        "testnet",
      ]);
    } catch (err) {
      // Bounded log — the error message can carry captured subprocess output.
      console.error(
        "[auspex:issuer] publish failed:",
        (err as Error).message.slice(0, 200),
      );
      return {
        ok: false,
        error:
          "The proof was generated but publishing to the network failed. " +
          "Check that AUSPEX_SECRET is funded and the contract is deployed.",
      };
    }

    // Parse attestation id and tx hash from publish stdout.
    // CLI prints:
    //   "  attestation id: <n>"
    //   "  tx hash:        <hash>"
    const idMatch = publishStdout.match(/attestation id:\s*(\S+)/);
    const txMatch = publishStdout.match(/tx hash:\s*(\S+)/);

    if (!idMatch || !txMatch) {
      // Log only a bounded prefix — never the full stdout, in case a future
      // CLI version echoes sensitive content downstream of the id/tx lines.
      console.error(
        "[auspex:issuer] could not parse publish output:",
        publishStdout.slice(0, 200),
      );
      return {
        ok: false,
        error:
          "Attestation was submitted but the confirmation could not be parsed. " +
          "Check the server logs.",
      };
    }

    return {
      ok: true,
      id: idMatch[1],
      txHash: txMatch[1],
      commitment,
      bufferBps,
      maxConcentrationBps,
      minLiquidityBps,
    };
  } finally {
    // Release the prover lock first so the next queued request can proceed.
    if (releaseLock) {
      releaseLock();
    }

    // ── 7. Clean up temp dir — always, regardless of outcome ─────────────
    if (tmpDir) {
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.error(
          "[auspex:issuer] temp dir cleanup failed:",
          cleanupErr,
        );
      }
    }
  }
}
