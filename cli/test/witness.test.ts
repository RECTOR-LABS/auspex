import { describe, it, expect } from "vitest";
import { buildProverToml } from "../src/witness.js";

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
