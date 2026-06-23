/**
 * Parsers for nargo circuit output and field-value normalisation.
 * Extracted from index.ts so they can be unit-tested independently
 * (index.ts self-executes via program.parseAsync(), preventing direct import in tests).
 */

/**
 * Parse a Field value from nargo's println output.
 * nargo prints one value per line; it may be hex (0x...) or decimal.
 * Returns the value normalised to lowercase hex with 0x prefix, or null if
 * no parseable value is found.
 */
export function parseNargoField(output: string): string | null {
  // The commitment is the field value printed by the circuit. Scan all lines
  // and keep the LAST field-shaped match, so a stray numeric status line
  // emitted before the value cannot be mistaken for the commitment.
  let found: string | null = null;
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Skip nargo status lines like "[commitment] Circuit witness successfully solved"
    if (trimmed.startsWith("[")) continue;

    // Hex Field value
    if (/^0x[0-9a-fA-F]+$/.test(trimmed)) {
      found = trimmed.toLowerCase();
    } else if (/^\d{10,}$/.test(trimmed)) {
      // Decimal Field value (large integer, at least 10 digits)
      found = "0x" + BigInt(trimmed).toString(16).padStart(64, "0");
    }
  }
  return found;
}

/**
 * Normalise a hex or decimal field value to BigInt for comparison.
 */
export function normalizeToBigInt(value: string): bigint {
  if (value.startsWith("0x") || value.startsWith("0X")) {
    return BigInt(value);
  }
  return BigInt(value);
}
