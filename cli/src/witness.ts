import { Book, Policy, N, K } from "./types.js";

// ---------------------------------------------------------------------------
// Shape validators — check presence and type only; domain checks (positions
// length, counterpartyId < K, safe-integer guards) remain in buildWitnessArrays.
// ---------------------------------------------------------------------------

/**
 * Assert that `book` is a structurally-valid Book.
 * Checks presence and type of every required field; does NOT enforce domain
 * constraints (those live in buildWitnessArrays and run immediately after).
 *
 * @param book       - The parsed (unknown) JSON value.
 * @param sourcePath - Path displayed in error messages for actionable feedback.
 */
export function assertValidBook(book: unknown, sourcePath: string): asserts book is Book {
  if (typeof book !== "object" || book === null || Array.isArray(book)) {
    throw new Error(`invalid book (${sourcePath}): must be a JSON object`);
  }
  const b = book as Record<string, unknown>;

  if (!Array.isArray(b["positions"])) {
    throw new Error(`invalid book (${sourcePath}): 'positions' must be an array`);
  }

  for (let i = 0; i < (b["positions"] as unknown[]).length; i++) {
    const p = (b["positions"] as unknown[])[i];
    if (typeof p !== "object" || p === null || Array.isArray(p)) {
      throw new Error(
        `invalid book (${sourcePath}): positions[${i}] must be an object`,
      );
    }
    const pos = p as Record<string, unknown>;
    if (typeof pos["amount"] !== "number") {
      throw new Error(
        `invalid book (${sourcePath}): positions[${i}].amount must be a number`,
      );
    }
    if (typeof pos["counterpartyId"] !== "number") {
      throw new Error(
        `invalid book (${sourcePath}): positions[${i}].counterpartyId must be a number`,
      );
    }
    if (typeof pos["isLiquid"] !== "boolean") {
      throw new Error(
        `invalid book (${sourcePath}): positions[${i}].isLiquid must be a boolean`,
      );
    }
  }

  if (typeof b["liabilities"] !== "number") {
    throw new Error(
      `invalid book (${sourcePath}): 'liabilities' must be a number`,
    );
  }
}

/**
 * Assert that `policy` is a structurally-valid Policy.
 * Checks presence and type of every required field.
 *
 * @param policy     - The parsed (unknown) JSON value.
 * @param sourcePath - Path displayed in error messages for actionable feedback.
 */
export function assertValidPolicy(policy: unknown, sourcePath: string): asserts policy is Policy {
  if (typeof policy !== "object" || policy === null || Array.isArray(policy)) {
    throw new Error(`invalid policy (${sourcePath}): must be a JSON object`);
  }
  const p = policy as Record<string, unknown>;

  if (typeof p["bufferBps"] !== "number") {
    throw new Error(
      `invalid policy (${sourcePath}): 'bufferBps' must be a number`,
    );
  }
  if (typeof p["maxConcentrationBps"] !== "number") {
    throw new Error(
      `invalid policy (${sourcePath}): 'maxConcentrationBps' must be a number`,
    );
  }
  if (typeof p["minLiquidityBps"] !== "number") {
    throw new Error(
      `invalid policy (${sourcePath}): 'minLiquidityBps' must be a number`,
    );
  }
}

// ---------------------------------------------------------------------------

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
