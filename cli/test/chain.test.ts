import { describe, it, expect, beforeEach, afterEach } from "vitest";

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
