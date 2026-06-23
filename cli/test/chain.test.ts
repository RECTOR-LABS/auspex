import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { formatAttestation, parseAttestationId, type Attestation } from "../src/chain.js";

describe("publish", () => {
  let prevSecret: string | undefined;

  beforeEach(() => {
    prevSecret = process.env.AUSPEX_SECRET;
    delete process.env.AUSPEX_SECRET;
  });

  afterEach(() => {
    if (prevSecret !== undefined) {
      process.env.AUSPEX_SECRET = prevSecret;
    } else {
      delete process.env.AUSPEX_SECRET;
    }
  });

  it("publish requires AUSPEX_SECRET", async () => {
    const { publish } = await import("../src/chain.js");
    await expect(publish("circuits/solvency/target", "testnet")).rejects.toThrow("AUSPEX_SECRET");
  });
});

// ---------------------------------------------------------------------------
// formatAttestation — pure function, network-free unit tests
// ---------------------------------------------------------------------------

describe("formatAttestation", () => {
  // Synthetic Attestation matching the live alice values from the brief.
  const ALICE = "GD3S2M47YCCIW2KACVV4WSQMC5JIWP3LWI37CXQX4YFNISISRS4YQUD4";
  const COMMITMENT_HEX = "2e56923540859f913de534bce00013a62d9dc02d183aa753eb18a82cc0840a84";

  const att: Attestation = {
    issuer: ALICE,
    commitment: Buffer.from(COMMITMENT_HEX, "hex"),
    buffer_bps: 10500,
    max_concentration_bps: 5000,
    min_liquidity_bps: 3000,
    ledger_timestamp: 1782180405n,
    ledger_seq: 3233329,
  };

  it("reports ✅ attestation found on first line", () => {
    const lines = formatAttestation(att, { idLabel: "latest", network: "testnet" });
    expect(lines[0]).toBe("✅ Attestation found");
  });

  it("includes the issuer address", () => {
    const lines = formatAttestation(att, { idLabel: "latest", network: "testnet" });
    const issuerLine = lines.find((l) => l.includes("issuer:"));
    expect(issuerLine).toBeDefined();
    expect(issuerLine).toContain(ALICE);
  });

  it("echoes the idLabel", () => {
    const linesLatest = formatAttestation(att, { idLabel: "latest", network: "testnet" });
    expect(linesLatest.find((l) => l.includes("attestation id:"))).toContain("latest");

    const linesId = formatAttestation(att, { idLabel: "1", network: "testnet" });
    expect(linesId.find((l) => l.includes("attestation id:"))).toContain("1");
  });

  it("shows the correct buffer_bps policy line", () => {
    const lines = formatAttestation(att, { idLabel: "latest", network: "testnet" });
    const bufLine = lines.find((l) => l.includes("solvency buffer"));
    expect(bufLine).toBeDefined();
    expect(bufLine).toContain("10500");
    expect(bufLine).toContain(">=");
  });

  it("shows the correct max_concentration_bps policy line", () => {
    const lines = formatAttestation(att, { idLabel: "latest", network: "testnet" });
    const concLine = lines.find((l) => l.includes("max counterparty"));
    expect(concLine).toBeDefined();
    expect(concLine).toContain("5000");
    expect(concLine).toContain("<=");
  });

  it("shows the correct min_liquidity_bps policy line", () => {
    const lines = formatAttestation(att, { idLabel: "latest", network: "testnet" });
    const liqLine = lines.find((l) => l.includes("min liquid"));
    expect(liqLine).toBeDefined();
    expect(liqLine).toContain("3000");
    expect(liqLine).toContain(">=");
  });

  it("renders commitment as lowercase hex", () => {
    const lines = formatAttestation(att, { idLabel: "latest", network: "testnet" });
    const commitLine = lines.find((l) => l.includes("commitment:"));
    expect(commitLine).toBeDefined();
    expect(commitLine).toContain(COMMITMENT_HEX);
  });

  it("renders ledger_seq in the recorded-at line", () => {
    const lines = formatAttestation(att, { idLabel: "latest", network: "testnet" });
    const recLine = lines.find((l) => l.includes("recorded at:"));
    expect(recLine).toBeDefined();
    expect(recLine).toContain("3233329");
  });

  it("renders ledger_timestamp as ISO-8601 UTC string", () => {
    const lines = formatAttestation(att, { idLabel: "latest", network: "testnet" });
    const recLine = lines.find((l) => l.includes("recorded at:"))!;
    // ledger_timestamp 1782180405 → 2026-06-23T02:06:45.000Z
    const expected = new Date(Number(1782180405n) * 1000).toISOString();
    expect(recLine).toContain(expected);
  });

  it("includes the issuer-account explorer link for testnet", () => {
    const lines = formatAttestation(att, { idLabel: "latest", network: "testnet" });
    const explorerLine = lines.find((l) => l.includes("explorer:"));
    expect(explorerLine).toBeDefined();
    expect(explorerLine).toContain(
      `https://stellar.expert/explorer/testnet/account/${ALICE}`,
    );
  });

  it("uses the network name in the explorer link for non-testnet", () => {
    const lines = formatAttestation(att, { idLabel: "latest", network: "local" });
    const explorerLine = lines.find((l) => l.includes("explorer:"))!;
    expect(explorerLine).toContain("/local/account/");
  });
});

// ---------------------------------------------------------------------------
// parseAttestationId — pure function, no network
// ---------------------------------------------------------------------------

describe("parseAttestationId", () => {
  it('parses "0" → 0', () => {
    expect(parseAttestationId("0")).toBe(0);
  });

  it('parses "5" → 5', () => {
    expect(parseAttestationId("5")).toBe(5);
  });

  it('throws on "foo"', () => {
    expect(() => parseAttestationId("foo")).toThrow(
      '--id must be a non-negative integer, got: foo',
    );
  });

  it('throws on "-1"', () => {
    expect(() => parseAttestationId("-1")).toThrow(
      '--id must be a non-negative integer, got: -1',
    );
  });

  it('throws on "1.5"', () => {
    expect(() => parseAttestationId("1.5")).toThrow(
      '--id must be a non-negative integer, got: 1.5',
    );
  });

  it('throws on ""', () => {
    expect(() => parseAttestationId("")).toThrow(
      '--id must be a non-negative integer, got: ',
    );
  });

  it('throws on "0x10" (hex literal — not pure decimal)', () => {
    expect(() => parseAttestationId("0x10")).toThrow(
      '--id must be a non-negative integer, got: 0x10',
    );
  });

  it('throws on "1e3" (scientific notation — not pure decimal)', () => {
    expect(() => parseAttestationId("1e3")).toThrow(
      '--id must be a non-negative integer, got: 1e3',
    );
  });
});
