"use server";

import {
  rpc,
  Contract,
  TransactionBuilder,
  Account,
  Address,
  nativeToScVal,
  scValToNative,
} from "@stellar/stellar-sdk";
import { readFileSync } from "node:fs";
import path from "node:path";

/* ─── Chain constants ────────────────────────────────────────────────────── */

const RPC = "https://soroban-testnet.stellar.org";
const PASSPHRASE = "Test SDF Network ; September 2015";

/** Cap the number of attestations fetched per issuer (each is one RPC call). */
const MAX_POINTS = 50;

/**
 * Read the contract ID from .auspex_contract_id at the repo root.
 * Wrapped in a function so Turbopack's static tracer can't follow it at
 * module-load time. process.cwd() = web/ when Next runs from the web directory.
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

export interface HeartbeatPoint {
  id: number;
  commitment: string; // hex, 64 chars
  bufferBps: number;
  maxConcentrationBps: number;
  minLiquidityBps: number;
  ledgerTimestamp: number; // unix seconds
  ledgerSeq: number;
}

export type HeartbeatResult =
  | { ok: true; issuer: string; total: number; points: HeartbeatPoint[] }
  | { ok: false; error: string };

interface RawAttestation {
  commitment: Uint8Array;
  buffer_bps: number;
  max_concentration_bps: number;
  min_liquidity_bps: number;
  ledger_timestamp: number | bigint;
  ledger_seq: number;
}

/* ─── Shape guard ────────────────────────────────────────────────────────── */

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

/* ─── Chain helpers ──────────────────────────────────────────────────────── */

/** Run a read-only contract call via simulateTransaction; returns the decoded
 *  native value, or null for Option::None / empty results. Throws on sim error. */
async function simulateCall(
  server: rpc.Server,
  id: string,
  issuer: string,
  method: string,
  extraArgs: ReturnType<typeof nativeToScVal>[] = [],
): Promise<unknown> {
  const op = new Contract(id).call(
    method,
    new Address(issuer).toScVal(),
    ...extraArgs,
  );
  const tx = new TransactionBuilder(new Account(issuer, "0"), {
    fee: "100",
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error((sim as { error: string }).error?.slice(0, 200) ?? "sim error");
  }
  const retval = (sim as { result?: { retval: unknown } }).result?.retval;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return retval ? scValToNative(retval as any) : null;
}

/* ─── readHistory ─────────────────────────────────────────────────────────── */

/**
 * Server action: read an issuer's full attestation history (the "solvency
 * heartbeat") via read-only simulation. count() then get_attestation() per id.
 * Every returned point is a passing attestation by construction — the contract
 * only stores attestations whose proof verified.
 *
 * Called from HeartbeatForm via useActionState: (prevState, formData) → Result.
 */
export async function readHistory(
  _prevState: HeartbeatResult | null,
  formData: FormData,
): Promise<HeartbeatResult> {
  // ── 1. Validate the issuer address ──────────────────────────────────────
  const issuerRaw = formData.get("issuer");
  if (typeof issuerRaw !== "string" || issuerRaw.trim() === "") {
    return { ok: false, error: "Issuer address is required." };
  }
  const issuer = issuerRaw.trim();
  if (!/^G[A-Z2-7]{55}$/.test(issuer)) {
    return {
      ok: false,
      error:
        "Enter a valid Stellar address — it starts with 'G' and is 56 characters long.",
    };
  }
  try {
    new Address(issuer);
  } catch {
    return {
      ok: false,
      error:
        "That doesn't look like a valid Stellar address. Check it and try again.",
    };
  }

  // ── 2. count() then fetch each attestation ──────────────────────────────
  try {
    const id = contractId();
    const server = new rpc.Server(RPC);

    const countRaw = await simulateCall(server, id, issuer, "count");
    const total = countRaw == null ? 0 : Number(countRaw);

    if (total === 0) {
      return { ok: true, issuer, total: 0, points: [] };
    }

    // Fetch the most recent MAX_POINTS ids, in parallel.
    const startId = Math.max(0, total - MAX_POINTS);
    const ids = Array.from({ length: total - startId }, (_, k) => startId + k);

    const settled = await Promise.all(
      ids.map(async (i): Promise<HeartbeatPoint | null> => {
        const a = await simulateCall(server, id, issuer, "get_attestation", [
          nativeToScVal(BigInt(i), { type: "u64" }),
        ]);
        if (a == null || !isAttestationShape(a)) return null;
        return {
          id: i,
          commitment: Buffer.from(a.commitment as Uint8Array).toString("hex"),
          bufferBps: a.buffer_bps,
          maxConcentrationBps: a.max_concentration_bps,
          minLiquidityBps: a.min_liquidity_bps,
          ledgerTimestamp: Number(a.ledger_timestamp),
          ledgerSeq: a.ledger_seq,
        };
      }),
    );

    // Newest first.
    const points = settled
      .filter((p): p is HeartbeatPoint => p !== null)
      .sort((x, y) => y.id - x.id);

    return { ok: true, issuer, total, points };
  } catch (err) {
    console.error(
      "[auspex:heartbeat] read failed:",
      (err as Error).message?.slice(0, 200),
    );
    return {
      ok: false,
      error:
        "Could not read the chain. Check the address and try again, or the network may be temporarily unavailable.",
    };
  }
}
