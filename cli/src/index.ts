#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
  .name("auspex")
  .description("ZK proof-of-solvency attestation on Stellar");

program
  .command("prove")
  .description("Generate a ZK solvency proof for a given book and policy")
  .requiredOption("--book <path>", "path to book JSON file")
  .requiredOption("--policy <path>", "path to policy JSON file")
  .option("--out <dir>", "output directory for proof artifacts", "circuits/solvency/target")
  .action(async () => {
    throw new Error("not implemented");
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
