import { describe, it, expect } from "vitest";
import { parseNargoField, normalizeToBigInt } from "../src/parse.js";

// ---------------------------------------------------------------------------
// parseNargoField
// ---------------------------------------------------------------------------

describe("parseNargoField", () => {
  it("parses a 0x hex field from realistic nargo output", () => {
    const output = [
      "[commitment] Circuit witness successfully solved",
      "0x2e56923540859f913de534bce00013a62d9dc02d183aa753eb18a82cc0840a84",
    ].join("\n");
    const result = parseNargoField(output);
    expect(result).toBe(
      "0x2e56923540859f913de534bce00013a62d9dc02d183aa753eb18a82cc0840a84",
    );
  });

  it("returns the LAST field-shaped match when multiple appear", () => {
    // First line is a valid hex field; second is the real commitment.
    // The function must return the last one.
    const output = [
      "0xdeadbeef00000000000000000000000000000000000000000000000000000001",
      "[commitment] Circuit witness successfully solved",
      "0x2e56923540859f913de534bce00013a62d9dc02d183aa753eb18a82cc0840a84",
    ].join("\n");
    const result = parseNargoField(output);
    expect(result).toBe(
      "0x2e56923540859f913de534bce00013a62d9dc02d183aa753eb18a82cc0840a84",
    );
  });

  it("normalises hex output to lowercase", () => {
    const output = "0xABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890";
    const result = parseNargoField(output);
    expect(result).toBe(
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    );
  });

  it("converts a ≥10-digit decimal line to 0x-prefixed padded hex", () => {
    // Use a known decimal value that converts to a known hex.
    // 1234567890 (10 digits) → 0x00000000000000000000000000000000000000000000000000000049965899d2
    const decimal = "1234567890";
    const output = `[status] done\n${decimal}`;
    const result = parseNargoField(output);
    expect(result).not.toBeNull();
    expect(result!.startsWith("0x")).toBe(true);
    expect(BigInt(result!)).toBe(BigInt(decimal));
  });

  it("returns null when there is no field-shaped line", () => {
    const output = [
      "[commitment] Circuit witness successfully solved",
      "some random text",
      "",
    ].join("\n");
    expect(parseNargoField(output)).toBeNull();
  });

  it("skips status lines starting with '['", () => {
    // If a bracketed line contains hex-looking content it must still be skipped.
    const output =
      "[commitment] 0x0000000000000000000000000000000000000000000000000000000000000001";
    expect(parseNargoField(output)).toBeNull();
  });

  it("returns null for output that is only whitespace/empty lines", () => {
    expect(parseNargoField("   \n\n   ")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// normalizeToBigInt
// ---------------------------------------------------------------------------

describe("normalizeToBigInt", () => {
  it("converts a 0x hex string to the correct bigint", () => {
    const hex = "0x2e56923540859f913de534bce00013a62d9dc02d183aa753eb18a82cc0840a84";
    const result = normalizeToBigInt(hex);
    expect(result).toBe(BigInt(hex));
  });

  it("converts a 0X (uppercase) hex string to the correct bigint", () => {
    const hex = "0X0000000000000000000000000000000000000000000000000000000000000001";
    const result = normalizeToBigInt(hex);
    expect(result).toBe(1n);
  });

  it("converts a decimal string to the correct bigint", () => {
    const dec = "12345678901234567890";
    const result = normalizeToBigInt(dec);
    expect(result).toBe(BigInt(dec));
  });

  it("hex and decimal representations of the same value yield equal bigints", () => {
    const dec = "1000";
    const hex = "0x3e8";
    expect(normalizeToBigInt(dec)).toBe(normalizeToBigInt(hex));
  });
});
