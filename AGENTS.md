<!-- Satellite context file — extends the global hub (~/.claude/CLAUDE.md | ~/.pi/agent/AGENTS.md). Host-neutral; project-specific only. Do not duplicate hub standards here. -->

# Auspex

> **Prove you're solvent — without opening your books.** Zero-knowledge proof of solvency & risk attestation on [Stellar](https://stellar.org). A financial institution proves, in zero-knowledge, that it is solvent and within defined risk limits — without revealing a single position, counterparty, or amount. The proof is verified on-chain in a Soroban contract; anyone can check the result in seconds, and no one can forge a passing one.

## Stack

Rust (workspace `Cargo.toml`) · Soroban (Stellar smart contracts, `contracts/`) · Noir/ZK circuits (`circuits/`, `crates/` — incl. `rs-soroban-ultrahonk`) · CLI (`cli/`) · web (`web/`) · `justfile` task runner · `scripts/`.

## Common Commands

```bash
just <recipe>          # see justfile for build/test/run recipes
cargo build            # build workspace
cargo test             # tests
```

## Structure

`contracts/` (Soroban on-chain verifier) · `circuits/` + `crates/` (ZK proof circuits, Ultrahonk) · `cli/` · `web/` · `fixtures/` · `scripts/` · `SPEC.md` · `PLAN.md` · `assets/`.

## Notes

- See `SPEC.md` (design) and `PLAN.md` (build plan) for the architecture and risk-attestation model.
- `LICENSE` + `LICENSE-rs-soroban-ultrahonk` (dual license — vendored crate carries its own).