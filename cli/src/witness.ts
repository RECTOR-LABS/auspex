import { Book, Policy, N, K } from "./types.js";

/**
 * Assert that a numeric value is a non-negative safe integer.
 * Values above Number.MAX_SAFE_INTEGER (2^53-1) cannot be represented exactly
 * as f64, so they would silently corrupt the circuit witness.
 */
function assertSafeU64(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      `${label} (${value}) is not a non-negative safe integer. ` +
        `Supply values within 0..${Number.MAX_SAFE_INTEGER} (2^53-1) ` +
        `to avoid silent precision loss in the circuit witness.`,
    );
  }
}

export function buildWitnessArrays(book: Book): {
  amounts: string[];
  cpIds: string[];
  isLiquid: string[];
  active: string[];
} {
  if (book.positions.length > N) {
    throw new Error(`too many positions: ${book.positions.length} > ${N}`);
  }

  assertSafeU64(book.liabilities, "liabilities");

  const amounts: string[] = Array(N).fill("0");
  const cpIds: string[] = Array(N).fill("0");
  const isLiquid: string[] = Array(N).fill("0");
  const active: string[] = Array(N).fill("0");

  book.positions.forEach((p, i) => {
    if (p.counterpartyId >= K) {
      throw new Error(`counterpartyId ${p.counterpartyId} >= K (${K})`);
    }
    assertSafeU64(p.amount, `positions[${i}].amount`);
    amounts[i] = String(p.amount);
    cpIds[i] = String(p.counterpartyId);
    isLiquid[i] = p.isLiquid ? "1" : "0";
    active[i] = "1";
  });

  return { amounts, cpIds, isLiquid, active };
}

export function buildProverToml(book: Book, policy: Policy): string {
  const { amounts, cpIds, isLiquid, active } = buildWitnessArrays(book);
  const arr = (xs: string[]) => "[" + xs.map((x) => `"${x}"`).join(", ") + "]";
  return [
    `amounts = ${arr(amounts)}`,
    `counterparty_ids = ${arr(cpIds)}`,
    `is_liquid = ${arr(isLiquid)}`,
    `active = ${arr(active)}`,
    `liabilities = "${book.liabilities}"`,
    `buffer_bps = "${policy.bufferBps}"`,
    `max_concentration_bps = "${policy.maxConcentrationBps}"`,
    `min_liquidity_bps = "${policy.minLiquidityBps}"`,
  ].join("\n");
}
