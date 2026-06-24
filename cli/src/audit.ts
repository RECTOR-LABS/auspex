/**
 * Auditor view-key support (selective disclosure).
 *
 * The issuer optionally retains a "view-key" file at prove time — the private
 * book plus the hiding salt — and hands it to a designated auditor out-of-band.
 * The auditor re-derives the Pedersen commitment from (book, salt), confirms it
 * matches the commitment recorded on-chain, and then sees the full book and its
 * metrics. The public still sees only the verdict: this is selective disclosure.
 *
 * This module holds the pure, unit-testable helpers; the nargo re-derivation and
 * the chain read live in index.ts (side-effectful).
 */

import type { Book } from "./types.js";
import { normalizeToBigInt } from "./parse.js";

const BPS = 10000n;

export interface ViewKey {
  book: Book;
  /** 0x-prefixed hex — the hiding salt used in the Pedersen commitment. */
  salt: string;
  /** 0x-prefixed hex — the commitment derived at prove time (sanity reference). */
  commitment: string;
}

/**
 * Assert that `raw` is a structurally-valid view-key file.
 * Checks the presence/type of salt, commitment, and the nested book shape.
 */
export function assertValidViewKey(
  raw: unknown,
  sourcePath: string,
): asserts raw is ViewKey {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`invalid view-key (${sourcePath}): must be a JSON object`);
  }
  const v = raw as Record<string, unknown>;

  if (typeof v["salt"] !== "string" || !/^0x[0-9a-fA-F]+$/.test(v["salt"])) {
    throw new Error(
      `invalid view-key (${sourcePath}): 'salt' must be a 0x-prefixed hex string`,
    );
  }
  if (
    typeof v["commitment"] !== "string" ||
    !/^0x[0-9a-fA-F]+$/.test(v["commitment"])
  ) {
    throw new Error(
      `invalid view-key (${sourcePath}): 'commitment' must be a 0x-prefixed hex string`,
    );
  }

  const book = v["book"];
  if (typeof book !== "object" || book === null || Array.isArray(book)) {
    throw new Error(
      `invalid view-key (${sourcePath}): 'book' must be an object`,
    );
  }
  const b = book as Record<string, unknown>;
  if (!Array.isArray(b["positions"]) || typeof b["liabilities"] !== "number") {
    throw new Error(
      `invalid view-key (${sourcePath}): 'book' must have positions[] and a numeric liabilities`,
    );
  }
}

export interface BookMetrics {
  totalAssets: bigint;
  liabilities: bigint;
  /** Achieved coverage in bps (assets·10000/liabilities); null when liabilities == 0. */
  achievedBufferBps: bigint | null;
  /** Largest single-counterparty exposure in bps; 0 when there are no assets. */
  maxConcentrationBps: bigint;
  /** Liquid-asset share in bps; 0 when there are no assets. */
  minLiquidityBps: bigint;
  /** Per-counterparty exposure, nonzero only, sorted by exposure descending. */
  perCounterparty: { id: number; sum: bigint }[];
}

/**
 * Compute the same ratios the circuit enforces, in basis points, using bigint so
 * large books never lose precision. Lets an auditor see *by how much* a book
 * clears (or misses) each policy limit.
 */
export function computeBookMetrics(book: Book): BookMetrics {
  let totalAssets = 0n;
  let liquid = 0n;
  const byCp = new Map<number, bigint>();

  for (const p of book.positions) {
    const amount = BigInt(p.amount);
    totalAssets += amount;
    if (p.isLiquid) liquid += amount;
    byCp.set(p.counterpartyId, (byCp.get(p.counterpartyId) ?? 0n) + amount);
  }

  const liabilities = BigInt(book.liabilities);
  const achievedBufferBps =
    liabilities === 0n ? null : (totalAssets * BPS) / liabilities;

  let maxCp = 0n;
  for (const sum of byCp.values()) if (sum > maxCp) maxCp = sum;

  const maxConcentrationBps =
    totalAssets === 0n ? 0n : (maxCp * BPS) / totalAssets;
  const minLiquidityBps = totalAssets === 0n ? 0n : (liquid * BPS) / totalAssets;

  const perCounterparty = [...byCp.entries()]
    .map(([id, sum]) => ({ id, sum }))
    .filter((e) => e.sum > 0n)
    .sort((a, b) => (b.sum > a.sum ? 1 : b.sum < a.sum ? -1 : 0));

  return {
    totalAssets,
    liabilities,
    achievedBufferBps,
    maxConcentrationBps,
    minLiquidityBps,
    perCounterparty,
  };
}

/**
 * Compare a freshly re-derived commitment (0x hex) against the bytes recorded
 * on-chain. Both are normalised to a field element so leading-zero differences
 * in encoding never cause a false mismatch.
 */
export function commitmentsMatch(
  recomputedHex: string,
  onChain: Buffer,
): boolean {
  const onChainHex = "0x" + Buffer.from(onChain).toString("hex");
  return normalizeToBigInt(recomputedHex) === normalizeToBigInt(onChainHex);
}

export interface AuditReportArgs {
  match: boolean;
  book: Book;
  metrics: BookMetrics;
  policy: { bufferBps: number; maxConcentrationBps: number; minLiquidityBps: number };
  issuer: string;
  idLabel: string;
  recomputedCommitment: string;
  onChainCommitment: string;
}

/**
 * Render the auditor's report. On a match it confirms the view-key corresponds
 * to the on-chain attestation, reveals the full book (auditor-only), and shows
 * each achieved ratio against the policy. On a mismatch it says so plainly and
 * makes no verification claim.
 */
export function formatAuditReport(args: AuditReportArgs): string[] {
  const { book, metrics, policy } = args;

  if (!args.match) {
    return [
      "❌ view-key does NOT match the on-chain attestation",
      "",
      "  The supplied book + salt do not re-derive the recorded commitment, so",
      "  this view-key does not correspond to this attestation.",
      "",
      `  issuer:              ${args.issuer}`,
      `  attestation id:      ${args.idLabel}`,
      `  re-derived:          ${args.recomputedCommitment}`,
      `  on-chain:            ${args.onChainCommitment}`,
    ];
  }

  const buffer =
    metrics.achievedBufferBps === null
      ? "n/a (no liabilities)"
      : `${metrics.achievedBufferBps} bps`;

  const lines = [
    "✅ view-key verified — the book below is the one attested on-chain",
    "",
    `  issuer:              ${args.issuer}`,
    `  attestation id:      ${args.idLabel}`,
    `  commitment:          ${args.onChainCommitment}`,
    "",
    "  Revealed book (auditor-only — the public never sees this):",
    `    total assets:      ${metrics.totalAssets}`,
    `    liabilities:       ${metrics.liabilities}`,
    "    positions:",
  ];

  book.positions.forEach((p, i) => {
    lines.push(
      `      [${i}] amount ${p.amount}  ·  counterparty ${p.counterpartyId}  ·  ${
        p.isLiquid ? "liquid" : "illiquid"
      }`,
    );
  });

  lines.push(
    "",
    "  Achieved vs policy:",
    `    solvency buffer          ${buffer}  (policy >= ${policy.bufferBps} bps)`,
    `    max counterparty conc.   ${metrics.maxConcentrationBps} bps  (policy <= ${policy.maxConcentrationBps} bps)`,
    `    min liquid-asset ratio   ${metrics.minLiquidityBps} bps  (policy >= ${policy.minLiquidityBps} bps)`,
  );

  return lines;
}
