import { describe, it, expect } from "vitest";
import { buildProverToml, assertValidBook, assertValidPolicy } from "../src/witness.js";

describe("buildProverToml", () => {
  it("pads positions to N and maps fields", () => {
    const toml = buildProverToml(
      { positions: [{ amount: 1000, counterpartyId: 2, isLiquid: true }], liabilities: 900 },
      { bufferBps: 10500, maxConcentrationBps: 5000, minLiquidityBps: 3000 },
    );
    expect(toml).toContain("liabilities = \"900\"");
    expect(toml).toContain("buffer_bps = \"10500\"");
    expect(toml).toMatch(/amounts = \[/);
    expect(toml).toContain("\"1000\"");
  });

  it("throws if positions exceed N", () => {
    const positions = Array.from({ length: 65 }, () => ({ amount: 1, counterpartyId: 0, isLiquid: true }));
    expect(() => buildProverToml({ positions, liabilities: 1 }, { bufferBps: 10500, maxConcentrationBps: 5000, minLiquidityBps: 3000 })).toThrow();
  });

  it("throws if counterpartyId >= K", () => {
    const positions = [{ amount: 1, counterpartyId: 16, isLiquid: true }];
    expect(() => buildProverToml({ positions, liabilities: 1 }, { bufferBps: 10500, maxConcentrationBps: 5000, minLiquidityBps: 3000 })).toThrow(/counterpartyId/);
  });

  it("throws on an unsafe-integer amount (guards silent f64 precision loss)", () => {
    const positions = [{ amount: Number.MAX_SAFE_INTEGER + 2, counterpartyId: 0, isLiquid: true }];
    expect(() => buildProverToml({ positions, liabilities: 1 }, { bufferBps: 10500, maxConcentrationBps: 5000, minLiquidityBps: 3000 })).toThrow(/safe integer/);
  });

  it("throws on unsafe-integer liabilities", () => {
    const positions = [{ amount: 1, counterpartyId: 0, isLiquid: true }];
    expect(() => buildProverToml({ positions, liabilities: 1e16 }, { bufferBps: 10500, maxConcentrationBps: 5000, minLiquidityBps: 3000 })).toThrow(/safe integer/);
  });
});

// ---------------------------------------------------------------------------
// assertValidBook — shape-only validator
// ---------------------------------------------------------------------------

describe("assertValidBook", () => {
  const PATH = "/fixtures/book.json";

  const validBook = {
    positions: [{ amount: 1000, counterpartyId: 2, isLiquid: true }],
    liabilities: 900,
  };

  it("accepts a valid book without throwing", () => {
    expect(() => assertValidBook(validBook, PATH)).not.toThrow();
  });

  it("throws when positions is missing, mentioning 'positions' and the path", () => {
    const bad = { liabilities: 900 };
    expect(() => assertValidBook(bad, PATH)).toThrowError(/positions/);
    expect(() => assertValidBook(bad, PATH)).toThrowError(new RegExp(PATH.replace("/", "\\/")));
  });

  it("throws when positions is not an array, mentioning 'positions' and the path", () => {
    const bad = { positions: "not-an-array", liabilities: 900 };
    expect(() => assertValidBook(bad, PATH)).toThrowError(/positions/);
    expect(() => assertValidBook(bad, PATH)).toThrowError(new RegExp(PATH.replace("/", "\\/")));
  });

  it("throws when liabilities is missing, mentioning 'liabilities' and the path", () => {
    const bad = { positions: [] };
    expect(() => assertValidBook(bad, PATH)).toThrowError(/liabilities/);
    expect(() => assertValidBook(bad, PATH)).toThrowError(new RegExp(PATH.replace("/", "\\/")));
  });

  it("throws when liabilities is a string instead of number", () => {
    const bad = { positions: [], liabilities: "900" };
    expect(() => assertValidBook(bad, PATH)).toThrowError(/liabilities/);
    expect(() => assertValidBook(bad, PATH)).toThrowError(new RegExp(PATH.replace("/", "\\/")));
  });

  it("throws when a position has non-boolean isLiquid, mentioning 'isLiquid' and the path", () => {
    const bad = { positions: [{ amount: 100, counterpartyId: 0, isLiquid: 1 }], liabilities: 0 };
    expect(() => assertValidBook(bad, PATH)).toThrowError(/isLiquid/);
    expect(() => assertValidBook(bad, PATH)).toThrowError(new RegExp(PATH.replace("/", "\\/")));
  });

  it("throws when a position is missing amount, mentioning 'amount' and the path", () => {
    const bad = { positions: [{ counterpartyId: 0, isLiquid: true }], liabilities: 0 };
    expect(() => assertValidBook(bad, PATH)).toThrowError(/amount/);
    expect(() => assertValidBook(bad, PATH)).toThrowError(new RegExp(PATH.replace("/", "\\/")));
  });

  it("throws when a position is missing counterpartyId, mentioning 'counterpartyId' and the path", () => {
    const bad = { positions: [{ amount: 100, isLiquid: true }], liabilities: 0 };
    expect(() => assertValidBook(bad, PATH)).toThrowError(/counterpartyId/);
    expect(() => assertValidBook(bad, PATH)).toThrowError(new RegExp(PATH.replace("/", "\\/")));
  });

  it("throws when book is not an object", () => {
    expect(() => assertValidBook(null, PATH)).toThrowError(/must be a JSON object/);
    expect(() => assertValidBook(42, PATH)).toThrowError(/must be a JSON object/);
    expect(() => assertValidBook([], PATH)).toThrowError(/must be a JSON object/);
  });
});

// ---------------------------------------------------------------------------
// assertValidPolicy — shape-only validator
// ---------------------------------------------------------------------------

describe("assertValidPolicy", () => {
  const PATH = "/fixtures/policy.json";

  const validPolicy = {
    bufferBps: 10500,
    maxConcentrationBps: 5000,
    minLiquidityBps: 3000,
  };

  it("accepts a valid policy without throwing", () => {
    expect(() => assertValidPolicy(validPolicy, PATH)).not.toThrow();
  });

  it("throws when bufferBps is missing, mentioning 'bufferBps' and the path", () => {
    const bad = { maxConcentrationBps: 5000, minLiquidityBps: 3000 };
    expect(() => assertValidPolicy(bad, PATH)).toThrowError(/bufferBps/);
    expect(() => assertValidPolicy(bad, PATH)).toThrowError(new RegExp(PATH.replace("/", "\\/")));
  });

  it("throws when bufferBps is not a number, mentioning 'bufferBps' and the path", () => {
    const bad = { bufferBps: "10500", maxConcentrationBps: 5000, minLiquidityBps: 3000 };
    expect(() => assertValidPolicy(bad, PATH)).toThrowError(/bufferBps/);
    expect(() => assertValidPolicy(bad, PATH)).toThrowError(new RegExp(PATH.replace("/", "\\/")));
  });

  it("throws when maxConcentrationBps is missing, mentioning 'maxConcentrationBps' and the path", () => {
    const bad = { bufferBps: 10500, minLiquidityBps: 3000 };
    expect(() => assertValidPolicy(bad, PATH)).toThrowError(/maxConcentrationBps/);
    expect(() => assertValidPolicy(bad, PATH)).toThrowError(new RegExp(PATH.replace("/", "\\/")));
  });

  it("throws when minLiquidityBps is missing, mentioning 'minLiquidityBps' and the path", () => {
    const bad = { bufferBps: 10500, maxConcentrationBps: 5000 };
    expect(() => assertValidPolicy(bad, PATH)).toThrowError(/minLiquidityBps/);
    expect(() => assertValidPolicy(bad, PATH)).toThrowError(new RegExp(PATH.replace("/", "\\/")));
  });

  it("throws when policy is not an object", () => {
    expect(() => assertValidPolicy(null, PATH)).toThrowError(/must be a JSON object/);
    expect(() => assertValidPolicy("string", PATH)).toThrowError(/must be a JSON object/);
  });
});
