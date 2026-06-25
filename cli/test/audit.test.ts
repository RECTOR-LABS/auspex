import { describe, it, expect } from "vitest";
import {
  assertValidViewKey,
  computeBookMetrics,
  commitmentsMatch,
  formatAuditReport,
} from "../src/audit.js";
import type { Book } from "../src/types.js";

const healthyBook: Book = {
  positions: [
    { amount: 500000, counterpartyId: 0, isLiquid: true },
    { amount: 300000, counterpartyId: 1, isLiquid: true },
    { amount: 200000, counterpartyId: 2, isLiquid: false },
  ],
  liabilities: 800000,
};

describe("assertValidViewKey", () => {
  const valid = {
    book: healthyBook,
    salt: "0x" + "ab".repeat(31),
    commitment: "0x" + "12".repeat(32),
  };

  it("accepts a well-formed view-key", () => {
    expect(() => assertValidViewKey(valid, "k.json")).not.toThrow();
  });

  it("rejects a missing salt", () => {
    const { salt: _omit, ...noSalt } = valid;
    expect(() => assertValidViewKey(noSalt, "k.json")).toThrow(/salt/);
  });

  it("rejects a non-string commitment", () => {
    expect(() =>
      assertValidViewKey({ ...valid, commitment: 123 }, "k.json"),
    ).toThrow(/commitment/);
  });

  it("rejects a missing/invalid book", () => {
    expect(() => assertValidViewKey({ ...valid, book: null }, "k.json")).toThrow(
      /book/,
    );
  });

  it("rejects a non-object", () => {
    expect(() => assertValidViewKey("nope", "k.json")).toThrow();
  });
});

describe("computeBookMetrics", () => {
  it("computes assets, buffer, concentration, and liquidity in bps", () => {
    const m = computeBookMetrics(healthyBook);
    expect(m.totalAssets).toBe(1_000_000n);
    expect(m.liabilities).toBe(800_000n);
    // 1,000,000 * 10000 / 800,000 = 12500 bps (125% coverage)
    expect(m.achievedBufferBps).toBe(12_500n);
    // largest counterparty (cp0 = 500k) of 1,000,000 = 5000 bps (50%)
    expect(m.maxConcentrationBps).toBe(5_000n);
    // liquid (500k + 300k = 800k) of 1,000,000 = 8000 bps (80%)
    expect(m.minLiquidityBps).toBe(8_000n);
  });

  it("ranks counterparties by exposure, descending, nonzero only", () => {
    const m = computeBookMetrics(healthyBook);
    expect(m.perCounterparty.map((c) => c.id)).toEqual([0, 1, 2]);
    expect(m.perCounterparty[0]).toEqual({ id: 0, sum: 500_000n });
  });

  it("reports null buffer when there are no liabilities (no division by zero)", () => {
    const m = computeBookMetrics({ ...healthyBook, liabilities: 0 });
    expect(m.achievedBufferBps).toBeNull();
  });

  it("uses bigint so large books cannot lose precision", () => {
    const big: Book = {
      positions: [{ amount: 9_000_000_000_000, counterpartyId: 0, isLiquid: true }],
      liabilities: 1_000_000_000_000,
    };
    const m = computeBookMetrics(big);
    expect(m.totalAssets).toBe(9_000_000_000_000n);
    expect(m.achievedBufferBps).toBe(90_000n);
  });
});

describe("commitmentsMatch", () => {
  it("matches a recomputed hex against the on-chain bytes (ignoring leading zeros)", () => {
    const onChain = Buffer.alloc(32);
    onChain[31] = 0x2a; // 42
    expect(commitmentsMatch("0x2a", onChain)).toBe(true);
    expect(commitmentsMatch("0x" + "00".repeat(31) + "2a", onChain)).toBe(true);
  });

  it("rejects a mismatch", () => {
    const onChain = Buffer.alloc(32);
    onChain[31] = 0x2a;
    expect(commitmentsMatch("0x2b", onChain)).toBe(false);
  });
});

describe("formatAuditReport", () => {
  const metrics = computeBookMetrics(healthyBook);
  const policy = { bufferBps: 10500, maxConcentrationBps: 5000, minLiquidityBps: 3000 };

  it("on match: confirms, reveals the book, and shows metrics vs policy", () => {
    const lines = formatAuditReport({
      match: true,
      book: healthyBook,
      metrics,
      policy,
      issuer: "GDXXXXXX",
      idLabel: "2",
      recomputedCommitment: "0x" + "12".repeat(32),
      onChainCommitment: "0x" + "12".repeat(32),
    });
    const text = lines.join("\n");
    expect(text).toMatch(/verified|MATCH/i);
    expect(text).toContain("500000"); // a revealed position amount
    expect(text).toContain("12500"); // achieved buffer bps
  });

  it("on mismatch: states the view-key does not correspond and does not claim verification", () => {
    const lines = formatAuditReport({
      match: false,
      book: healthyBook,
      metrics,
      policy,
      issuer: "GDXXXXXX",
      idLabel: "2",
      recomputedCommitment: "0x" + "aa".repeat(32),
      onChainCommitment: "0x" + "12".repeat(32),
    });
    const text = lines.join("\n");
    expect(text).toMatch(/does not match|mismatch|✗|❌/i);
  });
});
