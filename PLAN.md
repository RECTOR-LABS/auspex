# Auspex Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a zero-knowledge proof-of-solvency & risk attestation system on Stellar — an off-chain Noir circuit proves a private balance sheet satisfies a public risk policy, and a Soroban contract verifies the proof on-chain and records a tamper-proof attestation.

**Architecture:** Fork the proven [`rs-soroban-ultrahonk`](https://github.com/yugocabrio/rs-soroban-ultrahonk) harness (Noir UltraHonk → Soroban verifier). Replace its sample circuit with our `solvency` circuit; extend its verifier contract with an `attest` entrypoint that verifies a proof then stores an `Attestation`. A TypeScript CLI (`auspex`) drives prove/publish/verify; a Next.js app provides issuer + public surfaces.

**Tech Stack:** Noir `1.0.0-beta.9`, Barretenberg `0.87.0`, Rust + `soroban-sdk` (version pinned by the forked repo), Stellar CLI `^3.2.0`, `just`, TypeScript + `@stellar/stellar-sdk`, Next.js + Tailwind + Lucide, pnpm.

## Global Constraints

*Every task's requirements implicitly include this section.*

- **Toolchain (exact):** Noir `1.0.0-beta.9` (via `noirup`), Barretenberg `0.87.0` (via `bbup`), Stellar CLI `^3.2.0`, Rust target `wasm32v1-none`, `just`, Node.js, pnpm.
- **Network:** Stellar **testnet** only (Protocol ≥ 26). Never mainnet. Localnet (Docker) allowed for fast iteration.
- **Secrets:** source-account secret and all keys come from **env only** — never hardcoded, never committed. `.env` is gitignored.
- **Circuit bounds:** `N = 64` positions, `K = 16` counterparties (compile-time globals). Start the spike at `N = 8, K = 4`, scale up once green.
- **Numerics:** all amounts are integer minor units (e.g. cents); policy thresholds are basis points (`10000 = 100%`); scaled comparisons widen to `u128`.
- **In-circuit commitment hash:** `std::hash::pedersen_hash` (stdlib-confirmed for the pinned Noir version).
- **Commits:** Conventional prefixes (`feat/fix/chore/docs/refactor`). **No AI attribution** in any commit, PR, or file. GPG-signed (key already configured).
- **UI:** Tailwind, dark-mode-first, **Lucide icons (never emoji icons)**, 2-space indent.
- **Honesty:** all demo data is synthetic and labeled; README discloses that v1 proves "the committed book satisfies the policy" and that real-world custody binding is future work.

---

## Phase 0 — Spike & Harness (Day 1) · GO/NO-GO

Goal: prove the core bet — a Noir UltraHonk proof verifies on Stellar **testnet** — before building anything on top of it.

### Task 0.1: Install and verify the pinned toolchain

**Files:**
- Create: `README.md` (stub — "Auspex" title + one-line description, expanded in Task 5.2)

- [ ] **Step 1: Install Noir and Barretenberg at pinned versions**

```bash
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup -v 1.0.0-beta.9
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/cpp/installation/install | bash
bbup -v 0.87.0
```

- [ ] **Step 2: Install Stellar CLI, Rust target, and just**

```bash
cargo install --locked stellar-cli@^3.2.0
rustup target add wasm32v1-none
cargo install just
```

- [ ] **Step 3: Verify versions**

Run:
```bash
nargo --version && bb --version && stellar --version && just --version
```
Expected: `nargo` reports `1.0.0-beta.9`, `bb` reports `0.87.0`, `stellar` reports `3.2.x`, `just` prints a version. If any mismatch → fix before proceeding (the whole pipeline is version-sensitive).

- [ ] **Step 4: Commit the README stub**

```bash
git add README.md
git commit -m "chore: add README stub and pin toolchain versions in plan"
```

### Task 0.2: Fork the harness and verify a proof on localnet

**Files:**
- Create: `circuits/`, `contracts/`, `scripts/`, `justfile` (imported from the upstream repo structure)

- [ ] **Step 1: Vendor the upstream harness into the repo**

Clone the reference, copy its harness files (justfile, scripts/, the verifier contract crate, the sample circuit) into our repo, and remove its git history so it becomes our source.
```bash
git clone https://github.com/yugocabrio/rs-soroban-ultrahonk /tmp/uh-ref
cp -R /tmp/uh-ref/justfile /tmp/uh-ref/scripts /tmp/uh-ref/contracts /tmp/uh-ref/circuits .
# keep upstream LICENSE/attribution for the vendored verifier; we add our own LICENSE in Task 5.3
```

- [ ] **Step 2: Read the vendored verifier contract to learn its exact structure**

Read `contracts/` (the crate containing `verify_proof` and `__constructor`). Note: the function signature of `verify_proof(public_inputs, proof)`, how the VK is stored at deploy, the storage API in use, and the `soroban-sdk` version in its `Cargo.toml`. This is the integration point for Task 2.

- [ ] **Step 3: Run the one-shot localnet pipeline**

Run:
```bash
just e2e
```
Expected: Docker localnet starts, `alice` is funded, the sample circuit compiles, a proof + VK + public_inputs are generated, the contract deploys, and `verify_proof` returns success on-chain. **This is the GO signal for the toolchain.**

- [ ] **Step 4: Commit the vendored harness**

```bash
git add justfile scripts contracts circuits
git commit -m "chore: vendor rs-soroban-ultrahonk harness (localnet e2e verified)"
```

### Task 0.3: Verify a proof on Stellar testnet · GO/NO-GO GATE

**Files:** none (uses env + vendored scripts)

- [ ] **Step 1: Run the testnet pipeline**

Run:
```bash
export STELLAR_NETWORK_NAME=testnet
just fund    # friendbot funds 'alice' on testnet
just deploy  # builds + deploys; CONTRACT_ID saved to .contract_id
just verify  # invokes verify_proof on testnet
```
Expected: `verify` succeeds against the deployed testnet contract. Real cost ≈ 0.014 XLM.

- [ ] **Step 2: Record the GO/NO-GO decision in the README stub**

If testnet verification succeeds → **GO**: proceed to Phase 1.
If it fails (version/proof-format/protocol incompatibility) → **NO-GO for UltraHonk**: switch to the Circom/Groth16 fallback — replace the verifier crate with Stellar's official [`groth16_verifier`](https://github.com/stellar/soroban-examples/tree/main/groth16_verifier) example and author the circuit in Circom. The contract interface in Phase 2 is unchanged; only Phase 1's circuit language and the proof format differ. Document the chosen path in one line in `README.md`.

- [ ] **Step 3: Commit the decision**

```bash
git add README.md && git commit -m "docs: record Phase 0 spike result and verification path"
```

---

## Phase 1 — Solvency Circuit (Day 2)

Goal: a Noir circuit that proves solvency + concentration + liquidity over a private book, bound to a public commitment. Replaces the vendored sample circuit.

### Task 1.1: Circuit skeleton and data model

**Files:**
- Create: `circuits/solvency/src/main.nr`
- Create: `circuits/solvency/Nargo.toml`

**Interfaces:**
- Produces: `fn main(amounts: [u64; N], counterparty_ids: [u8; N], is_liquid: [u8; N], active: [u8; N], liabilities: u64, salt: Field, commitment: pub Field, buffer_bps: pub u32, max_concentration_bps: pub u32, min_liquidity_bps: pub u32)` and `fn compute_commitment(...) -> Field` — consumed by the contract (public-input ordering) and the CLI (witness layout).

- [ ] **Step 1: Write `Nargo.toml`**

```toml
[package]
name = "solvency"
type = "bin"
authors = [""]
compiler_version = ">=1.0.0"

[dependencies]
```

- [ ] **Step 2: Write the skeleton with globals and the commitment helper**

```rust
// circuits/solvency/src/main.nr
global N: u32 = 8;   // positions (raise to 64 after the circuit is green)
global K: u32 = 4;   // counterparties (raise to 16 after green)

fn compute_commitment(
    amounts: [u64; N],
    counterparty_ids: [u8; N],
    is_liquid: [u8; N],
    active: [u8; N],
    liabilities: u64,
    salt: Field,
) -> Field {
    let mut preimage: [Field; 4 * N + 2] = [0; 4 * N + 2];
    for i in 0..N {
        preimage[i] = amounts[i] as Field;
        preimage[N + i] = counterparty_ids[i] as Field;
        preimage[2 * N + i] = is_liquid[i] as Field;
        preimage[3 * N + i] = active[i] as Field;
    }
    preimage[4 * N] = liabilities as Field;
    preimage[4 * N + 1] = salt;
    std::hash::pedersen_hash(preimage)
}

fn main(
    amounts: [u64; N],
    counterparty_ids: [u8; N],
    is_liquid: [u8; N],
    active: [u8; N],
    liabilities: u64,
    salt: Field,
    commitment: pub Field,
    buffer_bps: pub u32,
    max_concentration_bps: pub u32,
    min_liquidity_bps: pub u32,
) {
    // constraints added in Tasks 1.2–1.5
    let _ = compute_commitment(amounts, counterparty_ids, is_liquid, active, liabilities, salt);
}
```

- [ ] **Step 3: Compile to confirm it builds**

Run: `cd circuits/solvency && nargo compile`
Expected: compiles with no errors (warnings about unused values are fine at this step).

- [ ] **Step 4: Commit**

```bash
git add circuits/solvency
git commit -m "feat(circuit): add solvency circuit skeleton and commitment helper"
```

### Task 1.2: Solvency constraint (TDD)

**Files:**
- Modify: `circuits/solvency/src/main.nr`

- [ ] **Step 1: Write a failing test (solvent passes, insolvent fails)**

Append to `main.nr`:
```rust
#[test]
fn test_solvent_passes() {
    let amounts: [u64; N] = [1000, 0, 0, 0, 0, 0, 0, 0];
    let counterparty_ids: [u8; N] = [0, 0, 0, 0, 0, 0, 0, 0];
    let is_liquid: [u8; N] = [1, 0, 0, 0, 0, 0, 0, 0];
    let active: [u8; N] = [1, 0, 0, 0, 0, 0, 0, 0];
    let liabilities: u64 = 900;
    let salt: Field = 42;
    let c = compute_commitment(amounts, counterparty_ids, is_liquid, active, liabilities, salt);
    // buffer 105%, concentration 100%, liquidity 100%
    main(amounts, counterparty_ids, is_liquid, active, liabilities, salt, c, 10500, 10000, 10000);
}

#[test(should_fail_with = "insolvent")]
fn test_insolvent_fails() {
    let amounts: [u64; N] = [1000, 0, 0, 0, 0, 0, 0, 0];
    let counterparty_ids: [u8; N] = [0, 0, 0, 0, 0, 0, 0, 0];
    let is_liquid: [u8; N] = [1, 0, 0, 0, 0, 0, 0, 0];
    let active: [u8; N] = [1, 0, 0, 0, 0, 0, 0, 0];
    let liabilities: u64 = 1000; // assets 1000 < 1000 * 1.05
    let salt: Field = 42;
    let c = compute_commitment(amounts, counterparty_ids, is_liquid, active, liabilities, salt);
    main(amounts, counterparty_ids, is_liquid, active, liabilities, salt, c, 10500, 10000, 10000);
}
```

- [ ] **Step 2: Run tests to verify the insolvent case does NOT yet fail correctly**

Run: `nargo test`
Expected: `test_insolvent_fails` FAILS (the assertion does not exist yet, so the should_fail expectation is unmet).

- [ ] **Step 3: Implement totals + the solvency assertion**

Replace the body of `main` (the `let _ = ...` line) with:
```rust
    let mut total_assets: u128 = 0;
    let mut liquid_assets: u128 = 0;
    for i in 0..N {
        let amt: u128 = (amounts[i] as u128) * (active[i] as u128);
        total_assets += amt;
        liquid_assets += amt * (is_liquid[i] as u128);
    }

    // 1. Solvency: total_assets * 10000 >= liabilities * buffer_bps
    assert(
        total_assets * 10000 >= (liabilities as u128) * (buffer_bps as u128),
        "insolvent: assets below liabilities times buffer",
    );

    let computed = compute_commitment(amounts, counterparty_ids, is_liquid, active, liabilities, salt);
    assert(computed == commitment, "commitment mismatch");

    // placeholders for next tasks (concentration, liquidity) — replaced in 1.3/1.4
    let _ = (liquid_assets, max_concentration_bps, min_liquidity_bps);
```

- [ ] **Step 4: Run tests to verify both pass**

Run: `nargo test`
Expected: `test_solvent_passes` PASS, `test_insolvent_fails` PASS (it now fails-as-expected with "insolvent").

- [ ] **Step 5: Commit**

```bash
git add circuits/solvency/src/main.nr
git commit -m "feat(circuit): enforce solvency constraint with commitment binding"
```

### Task 1.3: Concentration constraint (TDD)

**Files:**
- Modify: `circuits/solvency/src/main.nr`

- [ ] **Step 1: Write a failing test (over-concentrated book is rejected)**

```rust
#[test(should_fail_with = "concentration")]
fn test_over_concentrated_fails() {
    // 800 with counterparty 1, 200 with counterparty 2 → 80% in one cp
    let amounts: [u64; N] = [800, 200, 0, 0, 0, 0, 0, 0];
    let counterparty_ids: [u8; N] = [1, 2, 0, 0, 0, 0, 0, 0];
    let is_liquid: [u8; N] = [1, 1, 0, 0, 0, 0, 0, 0];
    let active: [u8; N] = [1, 1, 0, 0, 0, 0, 0, 0];
    let liabilities: u64 = 100;
    let salt: Field = 7;
    let c = compute_commitment(amounts, counterparty_ids, is_liquid, active, liabilities, salt);
    // max concentration 20%
    main(amounts, counterparty_ids, is_liquid, active, liabilities, salt, c, 10500, 2000, 10000);
}
```

- [ ] **Step 2: Run to verify it does not yet fail correctly**

Run: `nargo test --test-name test_over_concentrated_fails`
Expected: FAIL (no concentration assertion exists yet).

- [ ] **Step 3: Implement the concentration constraint**

In `main`, replace the `let _ = (liquid_assets, max_concentration_bps, min_liquidity_bps);` placeholder line with:
```rust
    // 2. Concentration: for each counterparty, cp_sum * 10000 <= total_assets * max_concentration_bps
    for j in 0..K {
        let mut cp_sum: u128 = 0;
        for i in 0..N {
            let is_match: u128 = if (counterparty_ids[i] as u32) == j { 1 } else { 0 };
            cp_sum += (amounts[i] as u128) * (active[i] as u128) * is_match;
        }
        assert(
            cp_sum * 10000 <= total_assets * (max_concentration_bps as u128),
            "concentration: counterparty exposure exceeds limit",
        );
    }

    let _ = min_liquidity_bps; // replaced in Task 1.4
```

- [ ] **Step 4: Run to verify all tests pass**

Run: `nargo test`
Expected: all four tests PASS (`test_over_concentrated_fails` now fails-as-expected).

- [ ] **Step 5: Commit**

```bash
git add circuits/solvency/src/main.nr
git commit -m "feat(circuit): enforce per-counterparty concentration limit"
```

### Task 1.4: Liquidity constraint (TDD)

**Files:**
- Modify: `circuits/solvency/src/main.nr`

- [ ] **Step 1: Write a failing test (illiquid book is rejected)**

```rust
#[test(should_fail_with = "liquidity")]
fn test_illiquid_fails() {
    // 1000 total, only 100 liquid → 10% liquid, policy requires 30%
    let amounts: [u64; N] = [100, 900, 0, 0, 0, 0, 0, 0];
    let counterparty_ids: [u8; N] = [0, 1, 0, 0, 0, 0, 0, 0];
    let is_liquid: [u8; N] = [1, 0, 0, 0, 0, 0, 0, 0];
    let active: [u8; N] = [1, 1, 0, 0, 0, 0, 0, 0];
    let liabilities: u64 = 100;
    let salt: Field = 9;
    let c = compute_commitment(amounts, counterparty_ids, is_liquid, active, liabilities, salt);
    // min liquidity 30%
    main(amounts, counterparty_ids, is_liquid, active, liabilities, salt, c, 10500, 10000, 3000);
}
```

- [ ] **Step 2: Run to verify it does not yet fail correctly**

Run: `nargo test --test-name test_illiquid_fails`
Expected: FAIL (no liquidity assertion yet).

- [ ] **Step 3: Implement the liquidity constraint**

Replace the `let _ = min_liquidity_bps;` line with:
```rust
    // 3. Liquidity: liquid_assets * 10000 >= total_assets * min_liquidity_bps
    assert(
        liquid_assets * 10000 >= total_assets * (min_liquidity_bps as u128),
        "liquidity: liquid assets below minimum ratio",
    );
```

- [ ] **Step 4: Run to verify all tests pass**

Run: `nargo test`
Expected: all five tests PASS.

- [ ] **Step 5: Commit**

```bash
git add circuits/solvency/src/main.nr
git commit -m "feat(circuit): enforce minimum liquidity ratio"
```

### Task 1.5: Range/sanity constraints + scale to full bounds (TDD)

**Files:**
- Modify: `circuits/solvency/src/main.nr`

- [ ] **Step 1: Write a failing test (out-of-range counterparty id rejected)**

```rust
#[test(should_fail_with = "counterparty id")]
fn test_bad_counterparty_id_fails() {
    let amounts: [u64; N] = [1000, 0, 0, 0, 0, 0, 0, 0];
    let counterparty_ids: [u8; N] = [99, 0, 0, 0, 0, 0, 0, 0]; // >= K
    let is_liquid: [u8; N] = [1, 0, 0, 0, 0, 0, 0, 0];
    let active: [u8; N] = [1, 0, 0, 0, 0, 0, 0, 0];
    let liabilities: u64 = 100;
    let salt: Field = 3;
    let c = compute_commitment(amounts, counterparty_ids, is_liquid, active, liabilities, salt);
    main(amounts, counterparty_ids, is_liquid, active, liabilities, salt, c, 10500, 10000, 10000);
}
```

- [ ] **Step 2: Run to verify it does not yet fail correctly**

Run: `nargo test --test-name test_bad_counterparty_id_fails`
Expected: FAIL.

- [ ] **Step 3: Add range/sanity asserts at the top of `main` (before totals)**

```rust
    for i in 0..N {
        assert((active[i] as u64) <= 1, "active must be boolean");
        assert((is_liquid[i] as u64) <= 1, "is_liquid must be boolean");
        assert((counterparty_ids[i] as u32) < K, "counterparty id out of range");
    }
    assert((buffer_bps as u64) >= 10000, "buffer must be at least 100 percent");
    assert((max_concentration_bps as u64) <= 10000, "concentration must be at most 100 percent");
    assert((min_liquidity_bps as u64) <= 10000, "liquidity must be at most 100 percent");
```

- [ ] **Step 4: Run all tests**

Run: `nargo test`
Expected: all six tests PASS.

- [ ] **Step 5: Scale to full bounds and confirm proving works end-to-end**

Change globals to `N = 64`, `K = 16`. Update the six test fixtures' array literals to length 64 (pad with zeros). Then generate a real proof:
```bash
nargo execute    # produces the witness
bb prove -b ./target/solvency.json -w ./target/solvency.gz -o ./target
bb write_vk -b ./target/solvency.json -o ./target
```
Expected: proof, VK, and public_inputs are written under `circuits/solvency/target/`. (Exact `bb` subcommand flags follow the vendored harness's `just build-circuits` recipe — align with it.)

- [ ] **Step 6: Commit**

```bash
git add circuits/solvency/src/main.nr
git commit -m "feat(circuit): add range checks and scale to N=64, K=16"
```

### Task 1.6: Wire the solvency circuit into the harness build

**Files:**
- Modify: `justfile` (point `build-circuits` at `circuits/solvency`)
- Modify: `scripts/` (the build/verify scripts that reference the sample circuit name)

- [ ] **Step 1: Read the `build-circuits` recipe and the scripts**

Read `justfile` and the relevant files under `scripts/` to find every reference to the sample circuit (e.g. `simple_circuit`).

- [ ] **Step 2: Repoint them to `solvency`**

Replace the sample circuit name with `solvency` in the `just build-circuits` recipe and any script paths so artifacts resolve to `circuits/solvency/target/`.

- [ ] **Step 3: Rebuild via just**

Run: `just build-circuits`
Expected: regenerates `circuits/solvency/target/{proof,public_inputs,vk}` with no errors.

- [ ] **Step 4: Commit**

```bash
git add justfile scripts
git commit -m "chore: point harness build at the solvency circuit"
```

---

## Phase 2 — Attestation Contract (Day 3)

Goal: extend the vendored verifier contract with an `attest` entrypoint that verifies a proof, then records a public `Attestation`; plus read methods. Verification reuses the existing `verify_proof` logic.

### Task 2.1: Add the Attestation type and storage keys

**Files:**
- Modify: the verifier contract crate `src/lib.rs` (path learned in Task 0.2 — e.g. `contracts/ultrahonk-verifier/src/lib.rs`)

**Interfaces:**
- Produces: `struct Attestation { issuer: Address, commitment: BytesN<32>, buffer_bps: u32, max_concentration_bps: u32, min_liquidity_bps: u32, ledger_timestamp: u64, ledger_seq: u32 }` and `enum DataKey { Count(Address), Item(Address, u64) }` — consumed by Tasks 2.2 and 2.3.

- [ ] **Step 1: Read the contract to confirm imports, the `soroban-sdk` version, and the existing `verify_proof` signature**

Read the contract `src/lib.rs`. Confirm it already imports `soroban_sdk::{contract, contractimpl, ...}`. Note the exact `verify_proof` signature and the VK storage approach.

- [ ] **Step 2: Add the `Attestation` type and `DataKey` enum**

Add near the top of the contract module:
```rust
use soroban_sdk::{contracttype, Address, BytesN};

#[contracttype]
#[derive(Clone)]
pub struct Attestation {
    pub issuer: Address,
    pub commitment: BytesN<32>,
    pub buffer_bps: u32,
    pub max_concentration_bps: u32,
    pub min_liquidity_bps: u32,
    pub ledger_timestamp: u64,
    pub ledger_seq: u32,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Count(Address),
    Item(Address, u64),
}
```

- [ ] **Step 3: Build the contract**

Run: `stellar contract build` (or `just build-contract`)
Expected: compiles to WASM with no errors.

- [ ] **Step 4: Commit**

```bash
git add contracts
git commit -m "feat(contract): add Attestation type and storage keys"
```

### Task 2.2: Implement `attest` (verify then store) (TDD)

**Files:**
- Modify: the verifier contract `src/lib.rs`
- Modify: the contract's integration test module (uses `include_bytes!` for circuit artifacts, per the harness convention)

**Interfaces:**
- Consumes: the existing internal verification routine; `Attestation`, `DataKey` from Task 2.1.
- Produces: `fn attest(env: Env, issuer: Address, proof: Bytes, public_inputs: Bytes) -> u64` — consumed by the CLI (Task 3.3).

- [ ] **Step 1: Write a failing integration test (valid proof produces attestation id 0)**

In the contract test module (mirroring the harness's existing test that loads `include_bytes!` artifacts from `circuits/solvency/target/`):
```rust
#[test]
fn attest_stores_attestation_for_valid_proof() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Verifier, ()); // align with the harness's registration + VK constructor args
    let client = VerifierClient::new(&env, &contract_id);

    let proof = Bytes::from_slice(&env, include_bytes!("../../../circuits/solvency/target/proof"));
    let public_inputs = Bytes::from_slice(&env, include_bytes!("../../../circuits/solvency/target/public_inputs"));
    let issuer = Address::generate(&env);

    let id = client.attest(&issuer, &proof, &public_inputs);
    assert_eq!(id, 0);
    assert_eq!(client.count(&issuer), 1);
}
```

- [ ] **Step 2: Run to verify it fails (no `attest` yet)**

Run: `cargo test --release attest_stores_attestation_for_valid_proof`
Expected: FAIL to compile / "no method `attest`".

- [ ] **Step 3: Implement `attest` in the `#[contractimpl]` block**

```rust
pub fn attest(env: Env, issuer: Address, proof: Bytes, public_inputs: Bytes) -> u64 {
    issuer.require_auth();

    // Reuse the existing on-chain verification (same routine verify_proof uses).
    // If the harness exposes verify_proof(env, public_inputs, proof) -> bool, call it;
    // otherwise extract its body into `verify_internal` and call that here.
    let ok = Self::verify_proof(env.clone(), public_inputs.clone(), proof.clone());
    assert!(ok, "proof verification failed");

    // public_inputs layout (from the circuit): [commitment, buffer_bps, max_concentration_bps, min_liquidity_bps]
    let (commitment, buffer_bps, max_concentration_bps, min_liquidity_bps) =
        decode_public_inputs(&env, &public_inputs);

    let id = env.storage().persistent().get(&DataKey::Count(issuer.clone())).unwrap_or(0u64);
    let attestation = Attestation {
        issuer: issuer.clone(),
        commitment,
        buffer_bps,
        max_concentration_bps,
        min_liquidity_bps,
        ledger_timestamp: env.ledger().timestamp(),
        ledger_seq: env.ledger().sequence(),
    };
    env.storage().persistent().set(&DataKey::Item(issuer.clone(), id), &attestation);
    env.storage().persistent().set(&DataKey::Count(issuer.clone()), &(id + 1));
    env.events().publish((symbol_short!("attested"), issuer.clone()), id);
    id
}
```

Add the `decode_public_inputs` helper (the public-input serialization matches what `bb` writes and what `verify_proof` already consumes — align the field extraction with the harness's existing public-input handling):
```rust
fn decode_public_inputs(env: &Env, public_inputs: &Bytes) -> (BytesN<32>, u32, u32, u32) {
    // Each public input is a 32-byte big-endian field element, in circuit order.
    let commitment = bytes_slice_to_bytesn32(env, public_inputs, 0);
    let buffer_bps = field_tail_u32(public_inputs, 32);
    let max_concentration_bps = field_tail_u32(public_inputs, 64);
    let min_liquidity_bps = field_tail_u32(public_inputs, 96);
    (commitment, buffer_bps, max_concentration_bps, min_liquidity_bps)
}
```
Implement `bytes_slice_to_bytesn32` (copy 32 bytes at an offset into a `BytesN<32>`) and `field_tail_u32` (read the low 4 bytes of the 32-byte field at the offset as a big-endian `u32`). Both are straightforward byte-copy loops over `Bytes`.

- [ ] **Step 4: Add the `symbol_short!` import**

Ensure `use soroban_sdk::symbol_short;` is present.

- [ ] **Step 5: Run the test**

Run: `just build-circuits && cargo test --release attest_stores_attestation_for_valid_proof`
Expected: PASS.

- [ ] **Step 6: Add a tamper test**

```rust
#[test]
#[should_panic(expected = "proof verification failed")]
fn attest_rejects_tampered_proof() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Verifier, ());
    let client = VerifierClient::new(&env, &contract_id);
    let mut bad = include_bytes!("../../../circuits/solvency/target/proof").to_vec();
    bad[0] ^= 0xFF; // flip a byte
    let proof = Bytes::from_slice(&env, &bad);
    let public_inputs = Bytes::from_slice(&env, include_bytes!("../../../circuits/solvency/target/public_inputs"));
    let issuer = Address::generate(&env);
    client.attest(&issuer, &proof, &public_inputs);
}
```

- [ ] **Step 7: Run both tests**

Run: `cargo test --release`
Expected: both PASS.

- [ ] **Step 8: Commit**

```bash
git add contracts
git commit -m "feat(contract): add attest entrypoint that verifies then records an attestation"
```

### Task 2.3: Read methods `get_attestation`, `get_latest`, `count` (TDD)

**Files:**
- Modify: the verifier contract `src/lib.rs`

**Interfaces:**
- Produces: `fn get_attestation(env, issuer, id) -> Option<Attestation>`, `fn get_latest(env, issuer) -> Option<Attestation>`, `fn count(env, issuer) -> u64` — consumed by the CLI (Task 3.4) and web (Task 4.3).

- [ ] **Step 1: Write a failing test**

```rust
#[test]
fn read_methods_return_stored_attestation() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Verifier, ());
    let client = VerifierClient::new(&env, &contract_id);
    let proof = Bytes::from_slice(&env, include_bytes!("../../../circuits/solvency/target/proof"));
    let public_inputs = Bytes::from_slice(&env, include_bytes!("../../../circuits/solvency/target/public_inputs"));
    let issuer = Address::generate(&env);
    let id = client.attest(&issuer, &proof, &public_inputs);
    let got = client.get_attestation(&issuer, &id).unwrap();
    assert_eq!(got.issuer, issuer);
    let latest = client.get_latest(&issuer).unwrap();
    assert_eq!(latest.ledger_seq, got.ledger_seq);
    assert_eq!(client.count(&issuer), 1);
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cargo test --release read_methods_return_stored_attestation`
Expected: FAIL ("no method `get_attestation`").

- [ ] **Step 3: Implement the read methods**

```rust
pub fn get_attestation(env: Env, issuer: Address, id: u64) -> Option<Attestation> {
    env.storage().persistent().get(&DataKey::Item(issuer, id))
}

pub fn count(env: Env, issuer: Address) -> u64 {
    env.storage().persistent().get(&DataKey::Count(issuer)).unwrap_or(0u64)
}

pub fn get_latest(env: Env, issuer: Address) -> Option<Attestation> {
    let n = Self::count(env.clone(), issuer.clone());
    if n == 0 { None } else { Self::get_attestation(env, issuer, n - 1) }
}
```

- [ ] **Step 4: Run the test**

Run: `cargo test --release read_methods_return_stored_attestation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add contracts
git commit -m "feat(contract): add get_attestation, get_latest, count read methods"
```

### Task 2.4: Deploy to testnet and verify the attest flow on-chain

**Files:**
- Modify: `scripts/` only if a deploy/verify recipe needs the new method name

- [ ] **Step 1: Build and deploy to testnet**

Run:
```bash
export STELLAR_NETWORK_NAME=testnet
just build-circuits
just deploy
```
Expected: contract deploys; `CONTRACT_ID` saved to `.contract_id`.

- [ ] **Step 2: Invoke `attest` on testnet with the generated artifacts**

Run:
```bash
stellar contract invoke --id $(cat .contract_id) --source-account alice --network testnet -- \
  attest --issuer <ALICE_PUBLIC_KEY> \
  --proof "$(xxd -p -c0 circuits/solvency/target/proof)" \
  --public_inputs "$(xxd -p -c0 circuits/solvency/target/public_inputs)"
```
Expected: returns `0` (first attestation id); transaction succeeds. (Exact byte-arg encoding follows the harness's existing `verify` invocation in `scripts/`.)

- [ ] **Step 3: Read it back**

Run:
```bash
stellar contract invoke --id $(cat .contract_id) --source-account alice --network testnet -- \
  get_latest --issuer <ALICE_PUBLIC_KEY>
```
Expected: prints the stored `Attestation` JSON with the policy values from the circuit.

- [ ] **Step 4: Commit any script changes**

```bash
git add scripts .contract_id
git commit -m "chore: verify attest flow on testnet"
```

---

## Phase 3 — `auspex` CLI (Day 4)

Goal: a TypeScript CLI that turns a private book + policy into a proof and drives the on-chain flow. Reuses the harness's invoke patterns.

### Task 3.1: CLI scaffold + book/policy schema + labeled fixtures

**Files:**
- Create: `cli/package.json`, `cli/tsconfig.json`, `cli/src/index.ts`, `cli/src/types.ts`
- Create: `fixtures/healthy.book.json`, `fixtures/healthy.policy.json`, `fixtures/concentrated.book.json`

**Interfaces:**
- Produces: `interface Book { positions: { amount: number; counterpartyId: number; isLiquid: boolean }[]; liabilities: number }` and `interface Policy { bufferBps: number; maxConcentrationBps: number; minLiquidityBps: number }` — consumed by Tasks 3.2–3.4.

- [ ] **Step 1: Write `cli/package.json`**

```json
{
  "name": "auspex-cli",
  "version": "0.1.0",
  "type": "module",
  "bin": { "auspex": "./dist/index.js" },
  "scripts": { "build": "tsc", "test": "vitest run" },
  "dependencies": {
    "commander": "^12.0.0",
    "@stellar/stellar-sdk": "^13.0.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Write `cli/src/types.ts`**

```ts
export interface Position { amount: number; counterpartyId: number; isLiquid: boolean }
export interface Book { positions: Position[]; liabilities: number }
export interface Policy { bufferBps: number; maxConcentrationBps: number; minLiquidityBps: number }
export const N = 64;
export const K = 16;
```

- [ ] **Step 3: Write labeled synthetic fixtures**

`fixtures/healthy.book.json`:
```json
{
  "_disclaimer": "SYNTHETIC SAMPLE DATA — not a real balance sheet.",
  "positions": [
    { "amount": 500000, "counterpartyId": 0, "isLiquid": true },
    { "amount": 300000, "counterpartyId": 1, "isLiquid": true },
    { "amount": 200000, "counterpartyId": 2, "isLiquid": false }
  ],
  "liabilities": 800000
}
```
`fixtures/healthy.policy.json`:
```json
{ "bufferBps": 10500, "maxConcentrationBps": 5000, "minLiquidityBps": 3000 }
```
`fixtures/concentrated.book.json` (for the cheat demo — 80% in one counterparty):
```json
{
  "_disclaimer": "SYNTHETIC SAMPLE DATA — intentionally over-concentrated for the failure demo.",
  "positions": [
    { "amount": 800000, "counterpartyId": 0, "isLiquid": true },
    { "amount": 200000, "counterpartyId": 1, "isLiquid": true }
  ],
  "liabilities": 100000
}
```

- [ ] **Step 4: Write `cli/src/index.ts` entrypoint with commander stubs**

```ts
#!/usr/bin/env node
import { Command } from "commander";
const program = new Command();
program.name("auspex").description("ZK proof-of-solvency attestation on Stellar");
program.command("prove").requiredOption("--book <path>").requiredOption("--policy <path>").option("--out <dir>", "output dir", "circuits/solvency/target").action(async () => { throw new Error("not implemented"); });
program.command("publish").requiredOption("--proof <dir>").option("--network <n>", "network", "testnet").action(async () => { throw new Error("not implemented"); });
program.command("verify").requiredOption("--issuer <addr>").option("--id <n>").action(async () => { throw new Error("not implemented"); });
program.parseAsync();
```

- [ ] **Step 5: Install and build**

Run: `cd cli && pnpm install && pnpm build`
Expected: builds to `cli/dist/` with no type errors.

- [ ] **Step 6: Commit**

```bash
git add cli fixtures
git commit -m "feat(cli): scaffold auspex CLI with book/policy types and labeled fixtures"
```

### Task 3.2: `prove` — book + policy → Prover.toml → proof (TDD)

**Files:**
- Create: `cli/src/witness.ts`, `cli/test/witness.test.ts`
- Modify: `cli/src/index.ts`

**Interfaces:**
- Consumes: `Book`, `Policy`, `N`, `K` from `types.ts`.
- Produces: `function buildProverToml(book: Book, policy: Policy): string` — consumed by the `prove` command.

- [ ] **Step 1: Write a failing test for the witness builder**

```ts
// cli/test/witness.test.ts
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
    // first amount is 1000, rest padded with 0
    expect(toml).toContain("\"1000\"");
  });

  it("throws if positions exceed N", () => {
    const positions = Array.from({ length: 65 }, () => ({ amount: 1, counterpartyId: 0, isLiquid: true }));
    expect(() => buildProverToml({ positions, liabilities: 1 }, { bufferBps: 10500, maxConcentrationBps: 5000, minLiquidityBps: 3000 })).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd cli && pnpm test`
Expected: FAIL ("buildProverToml is not a function").

- [ ] **Step 3: Implement the witness builder**

```ts
// cli/src/witness.ts
import { Book, Policy, N, K } from "./types.js";

export function buildProverToml(book: Book, policy: Policy): string {
  if (book.positions.length > N) throw new Error(`too many positions: ${book.positions.length} > ${N}`);
  const amounts: string[] = Array(N).fill("0");
  const cpIds: string[] = Array(N).fill("0");
  const isLiquid: string[] = Array(N).fill("0");
  const active: string[] = Array(N).fill("0");
  book.positions.forEach((p, i) => {
    if (p.counterpartyId >= K) throw new Error(`counterpartyId ${p.counterpartyId} >= K (${K})`);
    amounts[i] = String(p.amount);
    cpIds[i] = String(p.counterpartyId);
    isLiquid[i] = p.isLiquid ? "1" : "0";
    active[i] = "1";
  });
  const arr = (xs: string[]) => "[" + xs.map((x) => `"${x}"`).join(", ") + "]";
  // salt: deterministic-but-unique per run is injected by the prove command; placeholder line replaced there.
  return [
    `amounts = ${arr(amounts)}`,
    `counterparty_ids = ${arr(cpIds)}`,
    `is_liquid = ${arr(isLiquid)}`,
    `active = ${arr(active)}`,
    `liabilities = "${book.liabilities}"`,
    `buffer_bps = "${policy.bufferBps}"`,
    `max_concentration_bps = "${policy.maxConcentrationBps}"`,
    `min_liquidity_bps = "${policy.minLiquidityBps}"`,
  ].join("\n");
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd cli && pnpm test`
Expected: both tests PASS.

- [ ] **Step 5: Wire `prove` to generate Prover.toml, compute commitment, and run nargo+bb**

In `index.ts`, implement the `prove` action: read book+policy JSON, generate a random `salt` (`crypto.randomBytes(31)` → field-safe), append `salt` and the matching `commitment` to the Prover.toml. The commitment is obtained by running `nargo execute` (which evaluates `compute_commitment` and exposes the public `commitment` output) — read it back from the generated public inputs. Then run the harness `bb prove` / `bb write_vk` commands (mirror `just build-circuits`). Use `execFileSync` (never shell-interpolate user paths).

```ts
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
// inside the prove action:
const book = JSON.parse(readFileSync(opts.book, "utf8"));
const policy = JSON.parse(readFileSync(opts.policy, "utf8"));
const salt = "0x" + randomBytes(31).toString("hex");
const toml = buildProverToml(book, policy) + `\nsalt = "${salt}"\n` + `commitment = "0"\n`;
writeFileSync("circuits/solvency/Prover.toml", toml);
// nargo execute computes outputs; align the exact bb commands with the vendored just recipe:
execFileSync("just", ["build-circuits"], { stdio: "inherit" });
console.log("proof + public_inputs written to circuits/solvency/target/");
```
Note: if the circuit requires the correct `commitment` as a *public input* up front, switch the circuit to **return** the commitment as a public output instead of taking it as input, and drop the equality assert (the public output then binds it). Decide based on the harness's public-input handling discovered in Task 0.2; keep the chosen approach consistent across circuit, contract `decode_public_inputs`, and CLI.

- [ ] **Step 6: Manually run prove on the healthy fixture**

Run: `cd cli && node dist/index.js prove --book ../fixtures/healthy.book.json --policy ../fixtures/healthy.policy.json`
Expected: artifacts regenerated under `circuits/solvency/target/`.

- [ ] **Step 7: Commit**

```bash
git add cli
git commit -m "feat(cli): implement prove — book/policy to proof via nargo and bb"
```

### Task 3.3: `publish` — invoke `attest` on testnet

**Files:**
- Create: `cli/src/chain.ts`
- Modify: `cli/src/index.ts`

**Interfaces:**
- Consumes: contract `attest(issuer, proof, public_inputs)` (Task 2.2).
- Produces: `async function publish(proofDir: string, network: string): Promise<{ id: string; txHash: string }>`.

- [ ] **Step 1: Implement `publish` in `chain.ts`**

Read `proof` and `public_inputs` from `proofDir`, read `CONTRACT_ID` from `.contract_id`, read the source-account secret from `process.env.AUSPEX_SECRET` (fail clearly if unset), and submit `attest` via `@stellar/stellar-sdk` (build → sign → send). Mirror the encoding used by the harness's `scripts/invoke_ultrahonk`.

```ts
// cli/src/chain.ts
import { readFileSync } from "node:fs";
export async function publish(proofDir: string, network: string): Promise<{ id: string; txHash: string }> {
  const secret = process.env.AUSPEX_SECRET;
  if (!secret) throw new Error("AUSPEX_SECRET env var is required (source account secret)");
  const contractId = readFileSync(".contract_id", "utf8").trim();
  const proof = readFileSync(`${proofDir}/proof`);
  const publicInputs = readFileSync(`${proofDir}/public_inputs`);
  // Build, sign, and submit the attest invocation with @stellar/stellar-sdk.
  // Encoding of proof/public_inputs as ScVal Bytes follows scripts/invoke_ultrahonk.
  // Returns the attestation id (return value) and the transaction hash.
  // ... (implementation mirrors the vendored invoke script) ...
  return { id: "0", txHash: "" };
}
```

- [ ] **Step 2: Wire the `publish` command and test the unset-secret guard**

Add to `cli/test/witness.test.ts` (or a new `chain.test.ts`) a test that `publish` rejects when `AUSPEX_SECRET` is unset:
```ts
it("publish requires AUSPEX_SECRET", async () => {
  const prev = process.env.AUSPEX_SECRET; delete process.env.AUSPEX_SECRET;
  const { publish } = await import("../src/chain.js");
  await expect(publish("circuits/solvency/target", "testnet")).rejects.toThrow("AUSPEX_SECRET");
  if (prev) process.env.AUSPEX_SECRET = prev;
});
```

- [ ] **Step 3: Run the test**

Run: `cd cli && pnpm test`
Expected: PASS.

- [ ] **Step 4: Manual e2e (real testnet)**

Run: `AUSPEX_SECRET=<alice-secret> node dist/index.js publish --proof ../circuits/solvency/target --network testnet`
Expected: prints an attestation id and a tx hash; the attestation is on-chain.

- [ ] **Step 5: Commit**

```bash
git add cli
git commit -m "feat(cli): implement publish — submit attest to testnet"
```

### Task 3.4: `verify` — read an attestation from chain

**Files:**
- Modify: `cli/src/chain.ts`, `cli/src/index.ts`

**Interfaces:**
- Consumes: contract `get_attestation` / `get_latest` (Task 2.3).
- Produces: `async function readAttestation(issuer: string, id?: number): Promise<Attestation | null>`.

- [ ] **Step 1: Implement `readAttestation`**

Use a read-only simulation (no signing) via `@stellar/stellar-sdk` to call `get_latest` (or `get_attestation` when `--id` is given) and decode the returned `Attestation`.

- [ ] **Step 2: Wire the `verify` command to print a human-readable result**

Print: ✅/❌ status, the policy proven, the ledger timestamp, and a Stellar Expert testnet link to the tx.

- [ ] **Step 3: Manual check**

Run: `node dist/index.js verify --issuer <ALICE_PUBLIC_KEY>`
Expected: prints the latest attestation summary + explorer link.

- [ ] **Step 4: Commit**

```bash
git add cli
git commit -m "feat(cli): implement verify — read attestation and print status"
```

---

## Phase 4 — Web App (Day 5)

Goal: the two surfaces — issuer (generate + publish) and public (verify). Proving runs server-side (Node invokes the CLI). In-browser proving is out of scope (stretch).

### Task 4.1: Next.js scaffold + layout

**Files:**
- Create: `web/` (Next.js App Router, Tailwind), `web/app/layout.tsx`, `web/app/page.tsx`

- [ ] **Step 1: Scaffold**

Run: `pnpm create next-app@latest web --ts --tailwind --app --no-src-dir --import-alias "@/*"`
Expected: `web/` created and builds.

- [ ] **Step 2: Build a dark, minimal layout with a header (Lucide `ShieldCheck` icon, "Auspex") and two links: Issuer, Verify**

Replace `web/app/page.tsx` with a landing page that states the one-liner ("Prove you're solvent — without opening your books") and links to `/issuer` and `/verify`. Use Tailwind dark classes; import the icon from `lucide-react` (`pnpm add lucide-react` in `web/`).

- [ ] **Step 3: Run dev server to confirm**

Run: `cd web && pnpm dev`
Expected: landing page renders at `http://localhost:3000`.

- [ ] **Step 4: Commit**

```bash
git add web
git commit -m "feat(web): scaffold Next.js app with dark layout and landing page"
```

### Task 4.2: Issuer page (generate + publish via server action)

**Files:**
- Create: `web/app/issuer/page.tsx`, `web/app/issuer/actions.ts`

- [ ] **Step 1: Build the issuer form**

A form with: a textarea for the book JSON (prefilled from `fixtures/healthy.book.json`), three number inputs for the policy (buffer/concentration/liquidity bps), a **Generate & Publish** button. On submit, call a server action.

- [ ] **Step 2: Implement the server action**

```ts
// web/app/issuer/actions.ts
"use server";
import { execFileSync } from "node:child_process";
export async function generateAndPublish(bookJson: string, policy: { bufferBps: number; maxConcentrationBps: number; minLiquidityBps: number }) {
  // write temp book/policy files, then invoke the auspex CLI prove + publish.
  // AUSPEX_SECRET is read from the server environment; the raw book never leaves the server.
  // returns { id, txHash } for display.
}
```
The book is processed server-side only (never persisted, never sent to the client beyond the result). Implement the temp-file write + `execFileSync("node", ["../cli/dist/index.js", "prove", ...])` then `publish`.

- [ ] **Step 3: Show the result**

On success, render the attestation id + a Stellar Expert tx link. On failure (e.g. unsatisfiable book), render the circuit's failure message ("this book does not satisfy the policy — no proof could be generated"). This is the path the cheat demo exercises.

- [ ] **Step 4: Manual check with the healthy fixture**

Run the dev server, paste the healthy book, click Generate & Publish.
Expected: a real attestation id + tx link appears.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat(web): issuer page generates and publishes an attestation"
```

### Task 4.3: Public verify page

**Files:**
- Create: `web/app/verify/page.tsx`

- [ ] **Step 1: Build the verify form**

An input for an issuer address + a **Verify** button. On submit, call the CLI `verify` (or read the chain directly via `@stellar/stellar-sdk` in a server action) and render the attestation card.

- [ ] **Step 2: Render the attestation card**

Show: ✅ "Solvent & within risk limits", the policy proven (buffer / max concentration / min liquidity), the ledger timestamp, and a tx link — and explicitly **no balance-sheet numbers** (a caption: "Verified in zero-knowledge — no positions revealed").

- [ ] **Step 3: Manual check**

Verify the issuer address used in Task 4.2.
Expected: the card renders with the correct policy and a working explorer link.

- [ ] **Step 4: Commit**

```bash
git add web
git commit -m "feat(web): public verify page renders zero-knowledge attestation card"
```

---

## Phase 5 — Demo, Docs, Submission (Days 6–7)

### Task 5.1: The cheat-attempt demo (load-bearing proof)

**Files:**
- Create: `scripts/demo_cheat.sh`

- [ ] **Step 1: Write a script that attempts to prove the over-concentrated fixture**

```bash
#!/usr/bin/env bash
set -euo pipefail
echo "Attempting to attest an over-concentrated book (80% in one counterparty)..."
node cli/dist/index.js prove --book fixtures/concentrated.book.json --policy fixtures/healthy.policy.json \
  && echo "ERROR: a proof was generated — this must not happen" \
  || echo "EXPECTED: proof generation failed — the circuit refuses to attest a non-compliant book."
```

- [ ] **Step 2: Run it**

Run: `bash scripts/demo_cheat.sh`
Expected: prints the EXPECTED failure message (proof generation aborts on the unsatisfiable concentration constraint).

- [ ] **Step 3: Commit**

```bash
git add scripts/demo_cheat.sh
git commit -m "feat(demo): cheat-attempt script proving the ZK is load-bearing"
```

### Task 5.2: README with architecture + honest disclosure

**Files:**
- Modify: `README.md`
- Create: `assets/architecture.svg`

- [ ] **Step 1: Write the README**

Sections: what Auspex is (the analogy + one-liner), how it works (the 3 components), quickstart (`just testnet`, then the CLI), the demo (including the cheat attempt), and an explicit **"Honesty & Limitations"** section copying SPEC §15 (synthetic data; v1 proves the committed book satisfies the policy; real-world custody binding is future work; testnet only).

- [ ] **Step 2: Add a dark-mode SVG architecture diagram**

Create `assets/architecture.svg` (issuer → circuit → Soroban verifier → public verify), styled for GitHub dark mode, referenced with `<img>` in the README (SVG over ASCII for web-facing docs).

- [ ] **Step 3: Commit**

```bash
git add README.md assets
git commit -m "docs: write README with architecture diagram and honesty disclosures"
```

### Task 5.3: LICENSE + final hygiene + full test pass

**Files:**
- Create: `LICENSE` (MIT)

- [ ] **Step 1: Add an MIT LICENSE** (preserve the vendored harness's upstream license/attribution alongside it).

- [ ] **Step 2: Run the full test matrix**

Run:
```bash
just build-circuits
( cd circuits/solvency && nargo test )
cargo test --workspace --all-features --release
( cd cli && pnpm test )
( cd web && pnpm build )
```
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add LICENSE
git commit -m "chore: add MIT license and confirm full test pass"
```

### Task 5.4: Demo video + submission

**Files:** none

- [ ] **Step 1: Record the 2–3 min video** following SPEC §14: generate → publish (show the real testnet tx) → public verify (no numbers) → the cheat attempt fails.

- [ ] **Step 2: Submit on DoraHacks** — public repo link + demo video, before **2026-06-29, 12:00 PM PT.**

- [ ] **Step 3: Final commit**

```bash
git commit --allow-empty -m "chore: Auspex submitted to Stellar Hacks Real-World ZK"
```

---

## Self-Review (completed at authoring)

- **Spec coverage:** §1–§19 map to tasks — circuit (§7→Phase 1), contract (§8→Phase 2), CLI (§9→Phase 3), web (§10→Phase 4), demo/honesty/submission (§14/§15/§17→Phase 5), critical-path spike (§13/§18→Phase 0). View-key (§4 auditor, §12 stretch) intentionally omitted from v1.
- **Numeric/interface consistency:** public-input order `[commitment, buffer_bps, max_concentration_bps, min_liquidity_bps]` is identical across circuit (1.1), contract `decode_public_inputs` (2.2), and CLI (3.2). `attest(issuer, proof, public_inputs)` signature matches contract (2.2) and CLI (3.3). `Book`/`Policy` field names match across CLI and web.
- **Known integration point left open by design:** the exact `bb` flags, public-input byte encoding, and the input-vs-output commitment choice are aligned to the vendored harness, which is *read* in Task 0.2 before those tasks run — this is deliberate (the harness is the source of truth for proof format), not a placeholder.
