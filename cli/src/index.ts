#!/usr/bin/env node
import { Command } from "commander";
import { execFileSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { randomBytes } from "crypto";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { Book, Policy } from "./types.js";
import { buildWitnessArrays } from "./witness.js";

// Resolve the repo root relative to this compiled file's location.
// dist/index.js -> ../.. = repo root (cli is one level up from src, repo root is one more up from cli).
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// __dirname = <repo>/cli/dist — go up 2 levels to reach repo root
const REPO_ROOT = resolve(__dirname, "..", "..");

const NARGO = join(process.env.HOME ?? "", ".nargo", "bin", "nargo");

const program = new Command();

program
  .name("auspex")
  .description("ZK proof-of-solvency attestation on Stellar");

program
  .command("prove")
  .description("Generate a ZK solvency proof for a given book and policy")
  .requiredOption("--book <path>", "path to book JSON file")
  .requiredOption("--policy <path>", "path to policy JSON file")
  .action(async (opts: { book: string; policy: string }) => {
    const bookPath = resolve(process.cwd(), opts.book);
    const policyPath = resolve(process.cwd(), opts.policy);

    console.log(`[auspex] reading book:   ${bookPath}`);
    console.log(`[auspex] reading policy: ${policyPath}`);

    const book: Book = JSON.parse(readFileSync(bookPath, "utf8"));
    const policy: Policy = JSON.parse(readFileSync(policyPath, "utf8"));

    // Validate inputs before any subprocess work.
    const { amounts, cpIds, isLiquid, active } = buildWitnessArrays(book);

    // Generate a random 31-byte salt (keeps it within BN254 scalar field).
    const salt = "0x" + randomBytes(31).toString("hex");
    console.log(`[auspex] salt: ${salt}`);

    // -------------------------------------------------------------------------
    // Step 1: Derive commitment via the commitment helper circuit.
    // -------------------------------------------------------------------------
    const commitmentDir = join(REPO_ROOT, "circuits", "commitment");

    const arr = (xs: string[]) => "[" + xs.map((x) => `"${x}"`).join(", ") + "]";
    const commitmentProverToml = [
      `amounts = ${arr(amounts)}`,
      `counterparty_ids = ${arr(cpIds)}`,
      `is_liquid = ${arr(isLiquid)}`,
      `active = ${arr(active)}`,
      `liabilities = "${book.liabilities}"`,
      `salt = "${salt}"`,
    ].join("\n");

    writeFileSync(join(commitmentDir, "Prover.toml"), commitmentProverToml, "utf8");
    console.log("[auspex] commitment/Prover.toml written");

    // Compile the commitment circuit (idempotent if already compiled, but force
    // recompile to guard against stale artifacts from a different Prover.toml).
    execFileSync(NARGO, ["compile"], {
      cwd: commitmentDir,
      stdio: "inherit",
    });

    // Execute and capture stdout (println output appears there).
    const executeOut = execFileSync(NARGO, ["execute"], {
      cwd: commitmentDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });

    // Parse the Field value from nargo's println output.
    // nargo prints hex (0x...) or decimal numbers; we look for either.
    const commitment = parseNargoField(executeOut);
    if (commitment === null) {
      throw new Error(
        `[auspex] could not parse commitment from nargo output:\n${executeOut}`,
      );
    }
    console.log(`[auspex] commitment: ${commitment}`);

    // -------------------------------------------------------------------------
    // Step 2: Write solvency/Prover.toml combining all witness fields.
    // -------------------------------------------------------------------------
    const solvencyDir = join(REPO_ROOT, "circuits", "solvency");
    const solvencyProverToml = [
      `amounts = ${arr(amounts)}`,
      `counterparty_ids = ${arr(cpIds)}`,
      `is_liquid = ${arr(isLiquid)}`,
      `active = ${arr(active)}`,
      `liabilities = "${book.liabilities}"`,
      `salt = "${salt}"`,
      `commitment = "${commitment}"`,
      `buffer_bps = "${policy.bufferBps}"`,
      `max_concentration_bps = "${policy.maxConcentrationBps}"`,
      `min_liquidity_bps = "${policy.minLiquidityBps}"`,
    ].join("\n");

    writeFileSync(join(solvencyDir, "Prover.toml"), solvencyProverToml, "utf8");
    console.log("[auspex] solvency/Prover.toml written");

    // -------------------------------------------------------------------------
    // Step 3: Build the solvency circuit (compile + witness + prove + vk).
    // -------------------------------------------------------------------------
    console.log("[auspex] running: just build-circuits solvency ...");
    execFileSync("just", ["build-circuits", "solvency"], {
      cwd: REPO_ROOT,
      stdio: "inherit",
    });

    // -------------------------------------------------------------------------
    // Step 4: Self-check — verify the first public input matches our commitment.
    // -------------------------------------------------------------------------
    const publicInputsPath = join(solvencyDir, "target", "public_inputs");
    const publicInputsBuf = readFileSync(publicInputsPath);
    if (publicInputsBuf.length < 32) {
      throw new Error(
        `[auspex] public_inputs too short: ${publicInputsBuf.length} bytes`,
      );
    }
    // First 32 bytes = first public input (commitment field), big-endian.
    const onChainCommitment = "0x" + publicInputsBuf.subarray(0, 32).toString("hex");

    const commitmentBigInt = normalizeToBigInt(commitment);
    const onChainBigInt = normalizeToBigInt(onChainCommitment);

    if (commitmentBigInt !== onChainBigInt) {
      throw new Error(
        `[auspex] SELF-CHECK FAILED — commitment mismatch!\n` +
          `  derived:  ${commitment}\n` +
          `  on-chain: ${onChainCommitment}`,
      );
    }
    console.log("[auspex] self-check passed: commitment matches public_inputs[0]");

    // -------------------------------------------------------------------------
    // Step 5: Report artifacts.
    // -------------------------------------------------------------------------
    const targetDir = join(solvencyDir, "target");
    const proofSize = readFileSync(join(targetDir, "proof")).length;
    const vkSize = readFileSync(join(targetDir, "vk")).length;
    const piSize = readFileSync(join(targetDir, "public_inputs")).length;

    console.log("\n[auspex] proof generation complete:");
    console.log(`  commitment:    ${commitment}`);
    console.log(`  proof:         ${targetDir}/proof (${proofSize} bytes)`);
    console.log(`  vk:            ${targetDir}/vk (${vkSize} bytes)`);
    console.log(`  public_inputs: ${targetDir}/public_inputs (${piSize} bytes)`);
    console.log("\n  Ready to publish with: auspex publish --proof circuits/solvency/target");
  });

program
  .command("publish")
  .description("Publish a proof as an on-chain attestation via the Soroban attest contract")
  .requiredOption("--proof <dir>", "directory containing proof artifacts")
  .option("--network <n>", "Stellar network to target", "testnet")
  .action(async () => {
    throw new Error("not implemented");
  });

program
  .command("verify")
  .description("Verify an on-chain attestation by issuer address")
  .requiredOption("--issuer <addr>", "Stellar address of the attesting issuer")
  .option("--id <n>", "specific attestation ID (defaults to latest)")
  .action(async () => {
    throw new Error("not implemented");
  });

program.parseAsync();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a Field value from nargo's println output.
 * nargo prints one value per line; it may be hex (0x...) or decimal.
 * Returns the value normalised to lowercase hex with 0x prefix, or null if
 * no parseable value is found.
 */
function parseNargoField(output: string): string | null {
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
function normalizeToBigInt(value: string): bigint {
  if (value.startsWith("0x") || value.startsWith("0X")) {
    return BigInt(value);
  }
  return BigInt(value);
}
