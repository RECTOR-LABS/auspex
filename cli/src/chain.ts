import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  rpc,
  Contract,
  TransactionBuilder,
  Keypair,
  Account,
  Address,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";

// Compiled to cli/dist/chain.js — go up two levels (dist → cli → repo root).
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const PROOF_BYTE_LENGTH = 14592;
const PUBLIC_INPUTS_BYTE_LENGTH = 128;

interface NetworkConfig {
  rpcUrl: string;
  passphrase: string;
  allowHttp: boolean;
}

function networkConfig(network: string): NetworkConfig {
  switch (network) {
    case "testnet":
      return {
        rpcUrl: "https://soroban-testnet.stellar.org",
        passphrase: "Test SDF Network ; September 2015",
        allowHttp: false,
      };
    case "local":
      return {
        rpcUrl: "http://localhost:8000/soroban/rpc",
        passphrase: "Standalone Network ; February 2017",
        allowHttp: true,
      };
    default:
      throw new Error(
        `unsupported network: ${network}. Supported networks: testnet, local.`,
      );
  }
}

// ---------------------------------------------------------------------------
// Attestation read helpers
// ---------------------------------------------------------------------------

export interface Attestation {
  issuer: string;
  commitment: Buffer;
  buffer_bps: number;
  max_concentration_bps: number;
  min_liquidity_bps: number;
  ledger_timestamp: bigint;
  ledger_seq: number;
}

/**
 * Read the contract id from the repo root's .auspex_contract_id file.
 * Kept as a tiny shared helper so publish and readAttestation stay DRY.
 */
function readContractId(): string {
  return readFileSync(join(REPO_ROOT, ".auspex_contract_id"), "utf8").trim();
}

export interface FormatAttestationOpts {
  /** "latest" when --id was not supplied, or the numeric id as a string. */
  idLabel: string;
  /** The network name, used to build the explorer URL ("testnet" | "local"). */
  network: string;
}

/**
 * Parse a raw --id string into a non-negative integer.
 * Accepts only pure decimal digits (no hex, no scientific notation, no
 * whitespace-padded values, no leading sign). Throws an actionable Error for
 * anything else.
 * Pure function — no I/O, fully unit-testable.
 */
export function parseAttestationId(raw: string): number {
  const t = raw.trim();
  // Reject anything that is not a sequence of decimal digits.
  // This excludes "0x10" (hex), "1e3" (scientific notation), "-1" (sign),
  // "1.5" (decimal point), and empty strings.
  if (!/^\d+$/.test(t)) {
    throw new Error(`--id must be a non-negative integer, got: ${raw}`);
  }
  const n = Number(t);
  // Belt-and-suspenders: guard against any exotic Number() coercions the
  // regex might not have caught (should be unreachable after the regex).
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`--id must be a non-negative integer, got: ${raw}`);
  }
  return n;
}

/**
 * Convert an Attestation struct into the array of human-readable lines that
 * the `verify` command prints. Pure function — no I/O, easy to unit-test.
 */
export function formatAttestation(
  att: Attestation,
  opts: FormatAttestationOpts,
): string[] {
  const commitmentHex = Buffer.from(att.commitment).toString("hex");
  const recordedAt = new Date(Number(att.ledger_timestamp) * 1000).toISOString();
  const networkLabel = opts.network;
  const explorerLink = `https://stellar.expert/explorer/${networkLabel}/account/${att.issuer}`;

  return [
    "✅ Attestation found",
    "",
    `  issuer:              ${att.issuer}`,
    `  attestation id:      ${opts.idLabel}`,
    "",
    "  Policy proven:",
    `    solvency buffer          >= ${att.buffer_bps} bps`,
    `    max counterparty conc.   <= ${att.max_concentration_bps} bps`,
    `    min liquid-asset ratio   >= ${att.min_liquidity_bps} bps`,
    "",
    `  commitment:          ${commitmentHex}`,
    `  recorded at:         ledger ${att.ledger_seq}  (${recordedAt})`,
    `  explorer:            ${explorerLink}`,
  ];
}

/**
 * Read an attestation from chain via read-only simulation — no signing,
 * no secret required.
 *
 * @param issuer  - Stellar G-address of the attesting issuer.
 * @param network - Stellar network to target ("testnet" | "local").
 * @param id      - Optional specific attestation id; omit for latest.
 * @returns       Decoded Attestation, or null if none exists for this issuer.
 */
export async function readAttestation(
  issuer: string,
  network: string,
  id?: number,
): Promise<Attestation | null> {
  const { rpcUrl, passphrase, allowHttp } = networkConfig(network);
  const contractId = readContractId();

  const server = new rpc.Server(rpcUrl, { allowHttp });
  const contract = new Contract(contractId);

  const op =
    id === undefined
      ? contract.call("get_latest", new Address(issuer).toScVal())
      : contract.call(
          "get_attestation",
          new Address(issuer).toScVal(),
          nativeToScVal(BigInt(id), { type: "u64" }),
        );

  // dummy sequence — simulation never submits or checks it.
  const source = new Account(issuer, "0");
  const tx = new TransactionBuilder(source, {
    fee: "100",
    networkPassphrase: passphrase,
  })
    .addOperation(op)
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`read failed: ${sim.error}`);
  }

  const retval = sim.result?.retval;
  if (!retval) return null;

  const decoded = scValToNative(retval) as Attestation | null | undefined;
  return decoded == null ? null : decoded;
}

// ---------------------------------------------------------------------------

/**
 * Submit a ZK solvency proof as an on-chain attestation via the Soroban
 * attest contract. Reads raw proof and public_inputs bytes from proofDir,
 * then builds, signs, and submits the attest invocation.
 *
 * @param proofDir - Directory containing proof artifacts (relative to cwd).
 * @param network  - Stellar network to target ("testnet" | "local").
 * @returns        Attestation id (u64 as string) and the transaction hash.
 */
export async function publish(
  proofDir: string,
  network: string,
): Promise<{ id: string; txHash: string }> {
  const secret = process.env.AUSPEX_SECRET;
  if (!secret) {
    throw new Error(
      "AUSPEX_SECRET env var is required (source-account secret key)",
    );
  }

  // Keep all network/RPC construction below the guard so the unset-secret
  // unit test never touches the network or the filesystem.
  const { rpcUrl, passphrase, allowHttp } = networkConfig(network);

  const contractId = readContractId();

  const dir = resolve(process.cwd(), proofDir);
  const proof = readFileSync(join(dir, "proof"));
  const publicInputs = readFileSync(join(dir, "public_inputs"));

  if (proof.length !== PROOF_BYTE_LENGTH) {
    throw new Error(
      `proof must be ${PROOF_BYTE_LENGTH} bytes, got ${proof.length}`,
    );
  }
  if (publicInputs.length !== PUBLIC_INPUTS_BYTE_LENGTH) {
    throw new Error(
      `public_inputs must be ${PUBLIC_INPUTS_BYTE_LENGTH} bytes, got ${publicInputs.length}`,
    );
  }

  const kp = Keypair.fromSecret(secret);
  const issuer = kp.publicKey();

  const server = new rpc.Server(rpcUrl, { allowHttp });
  const account = await server.getAccount(issuer);
  const contract = new Contract(contractId);

  // Pass proof and public_inputs as raw Bytes exactly as read from disk —
  // no hex encoding, no transformation. This is the same byte content that
  // scripts/invoke_ultrahonk/invoke_ultrahonk.ts feeds the contract via the
  // stellar CLI's --*-file-path flags.
  const op = contract.call(
    "attest",
    new Address(issuer).toScVal(),
    xdr.ScVal.scvBytes(proof),
    xdr.ScVal.scvBytes(publicInputs),
  );

  const tx = new TransactionBuilder(account, {
    fee: "1000000",
    networkPassphrase: passphrase,
  })
    .addOperation(op)
    .setTimeout(180)
    .build();

  // prepareTransaction assembles the Soroban resource fee and auth entries.
  // Because tx source == issuer, the source-account signature satisfies
  // issuer.require_auth() — no separate authorizeEntry signing needed.
  const prepared = await server.prepareTransaction(tx);
  prepared.sign(kp);

  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR") {
    throw new Error(
      `attest submission failed: ${JSON.stringify(sent.errorResult ?? sent)}`,
    );
  }
  if (sent.status === "TRY_AGAIN_LATER") {
    throw new Error(
      "attest submission deferred by RPC (TRY_AGAIN_LATER) — retry shortly",
    );
  }

  // Poll until the transaction is confirmed (up to ~30 s).
  // At this point sent.status is PENDING or DUPLICATE — both mean the hash
  // is valid and the tx is in-flight.
  let got = await server.getTransaction(sent.hash);
  for (let i = 0; i < 30 && got.status === "NOT_FOUND"; i++) {
    await new Promise<void>((r) => setTimeout(r, 1000));
    got = await server.getTransaction(sent.hash);
  }

  if (got.status !== "SUCCESS") {
    throw new Error(
      `attest tx ${sent.hash} did not succeed — final status: ${got.status}`,
    );
  }

  // The contract returns the new attestation id as u64; scValToNative yields bigint.
  const id = scValToNative(got.returnValue!) as bigint;
  return { id: String(id), txHash: sent.hash };
}
