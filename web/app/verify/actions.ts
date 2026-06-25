"use server";

import {
  rpc,
  Contract,
  TransactionBuilder,
  Account,
  Address,
  scValToNative,
} from "@stellar/stellar-sdk";
import { readFileSync } from "node:fs";
import path from "node:path";

/* ─── Chain constants ────────────────────────────────────────────────────── */

const RPC = "https://soroban-testnet.stellar.org";
const PASSPHRASE = "Test SDF Network ; September 2015";

/**
 * Read the contract ID from .auspex_contract_id at the repo root.
 *
 * Wrapped in a function so Turbopack's static module-resolution tracer
 * cannot follow it at module-load time. process.cwd() = web/ when Next
 * runs from the web directory; the repo root is one level up.
 */
function contractId(): string {
  // On Vercel the gitignored .auspex_contract_id isn't in the repo, so prefer an
  // env var; fall back to the file for local dev. The contract id is public.
  const fromEnv = process.env.AUSPEX_CONTRACT_ID?.trim();
  if (fromEnv) return fromEnv;
  return readFileSync(
    path.join(process.cwd(), "..", ".auspex_contract_id"),
    "utf8",
  ).trim();
}

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface AttestationData {
  commitment: string;        // hex, 64 chars
  bufferBps: number;
  maxConcentrationBps: number;
  minLiquidityBps: number;
  ledgerTimestamp: number;   // unix seconds
  ledgerSeq: number;
}

export type VerifyResult =
  | { ok: true; found: false }
  | { ok: true; found: true; issuer: string; attestation: AttestationData }
  | { ok: false; error: string };

/**
 * Shape of the decoded `Attestation` struct after `scValToNative`. The four
 * bps/seq fields are numbers; `commitment` is the raw 32-byte buffer;
 * `ledger_timestamp` is a u64 so it may decode as number or bigint.
 */
interface RawAttestation {
  commitment: Uint8Array;
  buffer_bps: number;
  max_concentration_bps: number;
  min_liquidity_bps: number;
  ledger_timestamp: number | bigint;
  ledger_seq: number;
}

/* ─── Shape guard ────────────────────────────────────────────────────────── */

/**
 * Verify the decoded struct matches the expected Attestation shape before we
 * trust its fields. Closes the silent-failure path where a future contract
 * renaming a field would otherwise produce NaN/undefined in the UI.
 */
function isAttestationShape(a: unknown): a is RawAttestation {
  if (typeof a !== "object" || a === null) return false;
  const o = a as Record<string, unknown>;
  return (
    o.commitment != null &&
    typeof o.buffer_bps === "number" &&
    typeof o.max_concentration_bps === "number" &&
    typeof o.min_liquidity_bps === "number" &&
    typeof o.ledger_seq === "number" &&
    (typeof o.ledger_timestamp === "number" ||
      typeof o.ledger_timestamp === "bigint")
  );
}

/* ─── readAttestation ─────────────────────────────────────────────────────── */

/**
 * Server action: read the latest attestation for an issuer from the Soroban
 * contract via a read-only simulateTransaction call. No wallet, no signing.
 *
 * Called from VerifyForm via useActionState.
 * Signature: (prevState, formData) → Promise<VerifyResult>
 */
export async function readAttestation(
  _prevState: VerifyResult | null,
  formData: FormData,
): Promise<VerifyResult> {
  // ── 1. Parse + validate the issuer address ──────────────────────────────

  const issuerRaw = formData.get("issuer");
  if (typeof issuerRaw !== "string" || issuerRaw.trim() === "") {
    return { ok: false, error: "Issuer address is required." };
  }

  const issuer = issuerRaw.trim();

  // Stellar G-address: starts with 'G', exactly 56 base-32 chars.
  if (!/^G[A-Z2-7]{55}$/.test(issuer)) {
    return {
      ok: false,
      error:
        "Enter a valid Stellar address — it starts with 'G' and is 56 characters long.",
    };
  }

  // Double-check with the SDK itself; catches checksums the regex can't.
  try {
    new Address(issuer);
  } catch {
    return {
      ok: false,
      error:
        "That doesn't look like a valid Stellar address. Check the address and try again.",
    };
  }

  // ── 2. Build a read-only simulation call ───────────────────────────────

  let result: VerifyResult;

  try {
    const id = contractId();
    const server = new rpc.Server(RPC);

    const op = new Contract(id).call(
      "get_latest",
      new Address(issuer).toScVal(),
    );

    // TransactionBuilder needs a source account — we use the issuer itself
    // (sequence "0" is safe for simulation; the tx is never submitted).
    const tx = new TransactionBuilder(new Account(issuer, "0"), {
      fee: "100",
      networkPassphrase: PASSPHRASE,
    })
      .addOperation(op)
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(sim)) {
      // Contract error → the issuer may not exist in the contract's registry,
      // or the network is unreachable. Surface an actionable message.
      console.error(
        "[auspex:verify] simulation error:",
        (sim as { error: string }).error?.slice(0, 200),
      );
      return {
        ok: false,
        error:
          "Could not read the chain. Check the address and try again, or the network may be temporarily unavailable.",
      };
    }

    // scValToNative returns null for Option::None (no attestation yet).
    const retval = (sim as { result?: { retval: unknown } }).result?.retval;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = retval ? scValToNative(retval as any) : null;

    if (a == null) {
      result = { ok: true, found: false };
    } else if (!isAttestationShape(a)) {
      // Defense-in-depth: today's contract returns the expected struct, but a
      // future contract that renames fields would otherwise yield NaN/undefined
      // silently. Fail loud with an actionable message instead.
      console.error(
        "[auspex:verify] decoded struct has unexpected shape:",
        JSON.stringify(Object.keys(a as Record<string, unknown>)).slice(0, 200),
      );
      return {
        ok: false,
        error: "The attestation could not be decoded (unexpected format).",
      };
    } else {
      result = {
        ok: true,
        found: true,
        issuer,
        attestation: {
          commitment: Buffer.from(a.commitment as Uint8Array).toString("hex"),
          bufferBps: a.buffer_bps,
          maxConcentrationBps: a.max_concentration_bps,
          minLiquidityBps: a.min_liquidity_bps,
          ledgerTimestamp: Number(a.ledger_timestamp),
          ledgerSeq: a.ledger_seq,
        },
      };
    }
  } catch (err) {
    // Catch-all for network failures, unexpected SDK throws, etc.
    console.error("[auspex:verify] unexpected error:", (err as Error).message?.slice(0, 200));
    return {
      ok: false,
      error:
        "Could not read the chain. Check the address and try again.",
    };
  }

  return result;
}
