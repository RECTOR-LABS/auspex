#!/usr/bin/env node
import { Command } from "commander";
import { execFileSync } from "child_process";
import { readFileSync, writeFileSync, copyFileSync, rmSync } from "fs";
import { randomBytes } from "crypto";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { Keypair } from "@stellar/stellar-sdk";
import { Book, Policy } from "./types.js";
import { buildWitnessArrays, assertValidBook, assertValidPolicy } from "./witness.js";
import { publish, readAttestation, formatAttestation, parseAttestationId } from "./chain.js";
import { parseNargoField, normalizeToBigInt } from "./parse.js";

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

    const rawBook: unknown = JSON.parse(readFileSync(bookPath, "utf8"));
    assertValidBook(rawBook, bookPath);
    const book: Book = rawBook;

    const rawPolicy: unknown = JSON.parse(readFileSync(policyPath, "utf8"));
    assertValidPolicy(rawPolicy, policyPath);
    const policy: Policy = rawPolicy;

    // Validate inputs before any subprocess work.
    const { amounts, cpIds, isLiquid, active } = buildWitnessArrays(book);

    // Generate a random 31-byte salt (keeps it within BN254 scalar field).
    // NEVER log the salt value — it is the hiding factor for the Pedersen
    // commitment (SPEC §15). Logging it would leak confidentiality, especially
    // when Phase 4 invokes this CLI server-side and captures stdout.
    const salt = "0x" + randomBytes(31).toString("hex");
    console.log("[auspex] salt: generated (31 random CSPRNG bytes)");

    // -------------------------------------------------------------------------
    // Circuit working-tree paths. Prover.toml holds the entire private book
    // (every amount, counterparty, the liabilities total) plus the hiding salt,
    // so it is scrubbed from disk in `finally` below once proving finishes —
    // success or failure — and must never linger (audit: High). The target/
    // artifacts (proof, vk, public_inputs) are deliberately kept; `publish`
    // reads them next.
    // -------------------------------------------------------------------------
    const commitmentDir = join(REPO_ROOT, "circuits", "commitment");
    const solvencyDir = join(REPO_ROOT, "circuits", "solvency");
    const commitmentProverTomlPath = join(commitmentDir, "Prover.toml");
    const solvencyProverTomlPath = join(solvencyDir, "Prover.toml");
    const solvencyProverTomlExample = join(solvencyDir, "Prover.toml.example");

    const arr = (xs: string[]) => "[" + xs.map((x) => `"${x}"`).join(", ") + "]";

    try {
      // -----------------------------------------------------------------------
      // Step 1: Derive commitment via the commitment helper circuit.
      // -----------------------------------------------------------------------
      const commitmentProverToml = [
        `amounts = ${arr(amounts)}`,
        `counterparty_ids = ${arr(cpIds)}`,
        `is_liquid = ${arr(isLiquid)}`,
        `active = ${arr(active)}`,
        `liabilities = "${book.liabilities}"`,
        `salt = "${salt}"`,
      ].join("\n");

      writeFileSync(commitmentProverTomlPath, commitmentProverToml, "utf8");
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

      // -----------------------------------------------------------------------
      // Step 2: Write solvency/Prover.toml combining all witness fields.
      // -----------------------------------------------------------------------
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

      writeFileSync(solvencyProverTomlPath, solvencyProverToml, "utf8");
      console.log("[auspex] solvency/Prover.toml written");

      // -----------------------------------------------------------------------
      // Step 3: Build the solvency circuit (compile + witness + prove + vk).
      // A book that breaks the policy makes the circuit unsatisfiable, so witness
      // generation aborts here — this is the load-bearing property. Translate the
      // raw subprocess failure into a clear, on-purpose message rather than
      // letting an execFileSync stack trace escape.
      // -----------------------------------------------------------------------
      console.log("[auspex] running: just build-circuits solvency ...");
      try {
        execFileSync("just", ["build-circuits", "solvency"], {
          cwd: REPO_ROOT,
          stdio: "inherit",
        });
      } catch {
        throw new Error(
          "proof generation FAILED — the circuit is unsatisfiable for this book and policy.\n" +
            "  The book breaks a solvency, concentration, or liquidity limit, so no valid\n" +
            "  proof exists: you cannot attest a policy you do not satisfy.\n" +
            "  (If nargo/bb are not installed, install the toolchain and retry.)",
        );
      }

      // -----------------------------------------------------------------------
      // Step 4: Self-check — verify the first public input matches our commitment.
      // -----------------------------------------------------------------------
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

      // -----------------------------------------------------------------------
      // Step 5: Report artifacts.
      // -----------------------------------------------------------------------
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
    } finally {
      // -----------------------------------------------------------------------
      // Scrub the private witness from disk — always, even if proving failed.
      // Prover.toml carries every position amount, counterparty, the liabilities
      // total, and the hiding salt (audit: High — must not persist). Solvency is
      // restored to its labeled synthetic example so the repo stays buildable
      // (matching scripts/demo_cheat.sh's self-restore); the commitment circuit
      // has no example, so its witness is removed (regenerated on the next run).
      // -----------------------------------------------------------------------
      try {
        copyFileSync(solvencyProverTomlExample, solvencyProverTomlPath);
        rmSync(commitmentProverTomlPath, { force: true });
        console.log("[auspex] witness scrubbed from disk");
      } catch (cleanupErr) {
        console.error(
          `[auspex] warning: failed to scrub witness Prover.toml: ${(cleanupErr as Error).message}`,
        );
      }
    }
  });

program
  .command("publish")
  .description("Publish a proof as an on-chain attestation via the Soroban attest contract")
  .requiredOption("--proof <dir>", "directory containing proof artifacts")
  .option("--network <n>", "Stellar network to target", "testnet")
  .action(async (opts: { proof: string; network: string }) => {
    // Derive issuer from secret for display before handing off to publish().
    const secret = process.env.AUSPEX_SECRET;
    if (!secret) {
      console.error("[auspex] error: AUSPEX_SECRET env var is required");
      process.exit(1);
    }
    const issuer = Keypair.fromSecret(secret).publicKey();
    const contractId = readFileSync(join(REPO_ROOT, ".auspex_contract_id"), "utf8").trim();

    console.log(`[auspex] issuer:   ${issuer}`);
    console.log(`[auspex] contract: ${contractId}`);
    console.log(`[auspex] network:  ${opts.network}`);
    console.log(`[auspex] proof:    ${opts.proof}`);

    const { id, txHash } = await publish(opts.proof, opts.network);

    console.log("\n[auspex] attestation published:");
    console.log(`  issuer:         ${issuer}`);
    console.log(`  contract:       ${contractId}`);
    console.log(`  attestation id: ${id}`);
    console.log(`  tx hash:        ${txHash}`);
    if (opts.network === "testnet") {
      console.log(`  explorer:       https://stellar.expert/explorer/testnet/tx/${txHash}`);
    }
  });

program
  .command("verify")
  .description("Verify an on-chain attestation by issuer address")
  .requiredOption("--issuer <addr>", "Stellar address of the attesting issuer")
  .option("--id <n>", "specific attestation ID (defaults to latest)")
  .option("--network <n>", "Stellar network to target", "testnet")
  .action(async (opts: { issuer: string; id?: string; network: string }) => {
    let id: number | undefined;
    if (opts.id !== undefined) {
      try { id = parseAttestationId(opts.id); }
      catch (e) { console.error(`❌ ${(e as Error).message}`); process.exit(1); }
    }
    const idLabel = opts.id !== undefined ? opts.id : "latest";

    console.log(`[auspex] querying attestation for issuer: ${opts.issuer}`);
    console.log(`[auspex] network: ${opts.network}`);

    const att = await readAttestation(opts.issuer, opts.network, id);

    if (att === null) {
      console.error(`❌ No attestation found for ${opts.issuer}`);
      process.exit(1);
    }

    const lines = formatAttestation(att, { idLabel, network: opts.network });
    for (const line of lines) {
      console.log(line);
    }
  });

program.parseAsync().catch((err: unknown) => {
  // Print a clean, branded one-liner instead of an unhandled-rejection stack
  // dump (keeps the cheat-attempt demo readable and errors actionable).
  console.error(`[auspex] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

