# Auspex — Zero-Knowledge Proof-of-Solvency & Risk Attestation on Stellar

> **Auspex** *(Latin)* — the Roman official who reads the signs and grants or withholds sanction before any undertaking. The original verifier. Auspex reads an institution's hidden balance sheet and grants — or withholds — an on-chain seal of approval, revealing nothing.

| | |
|---|---|
| **Hackathon** | [Stellar Hacks: Real-World ZK](https://dorahacks.io/hackathon/stellar-hacks-zk) (DoraHacks) |
| **Prize pool** | $10,000 USD (single open track) |
| **Submission deadline** | 2026-06-29, 12:00 PM PT (Pacific) |
| **Hard requirements** | Open-source repo + README, 2–3 min demo video, **load-bearing ZK verified on-chain in a Soroban contract** |
| **Status** | Spec — pre-implementation |

---

## 1. Summary

Auspex lets a financial institution — a stablecoin issuer, tokenized-RWA issuer, fund, or DAO treasury — **prove on Stellar, in zero-knowledge, that it is solvent and within defined risk limits, without revealing any individual position, counterparty, or amount.**

An off-chain **Noir** circuit produces a succinct proof over the institution's private balance sheet. A **Soroban** smart contract verifies that proof on-chain and records a public, tamper-proof **attestation**. Anyone can verify the attestation in seconds; no one can forge a passing one. The zero-knowledge proof is not decorative — it *is* the product: a false "solvent" claim is cryptographically impossible to publish.

---

## 2. Problem → Solution → Results

### Problem
Solvency trust in both TradFi and crypto is broken. Post-FTX, institutions are expected to prove they are solvent — but the two existing options are both bad:

- **Full disclosure** (publish the book) leaks trading strategy, client identities, and commercial relationships. No serious institution will do it.
- **"Trust me / trust my auditor"** (a PDF, a signed letter, a Merkle-tree "proof of reserves") is a *snapshot of liabilities* that reveals nothing about **risk** — concentration in one counterparty, illiquid assets dressed up as reserves — and has repeatedly failed (Celsius, FTX, multiple "audited" stablecoins).

There is no way today for an institution to prove *"I am solvent **and** I am not taking reckless risks"* that is simultaneously **private** (book stays secret), **trustless** (no auditor to bribe), and **publicly verifiable**.

### Solution
A zero-knowledge circuit that proves, over the institution's **private** balance sheet, that it satisfies a **public** risk policy:

1. **Solvency** — total assets ≥ liabilities × a safety buffer.
2. **Concentration** — no single counterparty exceeds X% of assets.
3. **Liquidity** — liquid assets are at least Y% of total.

The proof binds to a cryptographic **commitment** of the exact book. A Soroban contract verifies the proof on-chain (using Stellar's native BN254/Poseidon host functions) and records the attestation: *who, what policy, when* — never the numbers. An optional **auditor view-key** (stretch) lets one designated party reconstruct the full book for that attestation, while the public still sees only the result. This is the **selective-disclosure** model Stellar's privacy strategy is built around.

### Results
- A skeptical outsider — investor, counterparty, journalist, regulator — can **independently verify** an institution is solvent and risk-disciplined, in seconds, on-chain, **without the institution exposing its book.**
- Recurring attestations create a **"solvency heartbeat"** — verifiable financial health over time.
- Directly serves Stellar's core real-world market: stablecoin issuers, tokenized treasuries/RWAs, and institutional settlement.

---

## 3. Goals & Non-Goals

### Goals
- **Load-bearing ZK.** A false attestation is cryptographically impossible; the proof powers the product, not a slide.
- **On-chain verification** in a Soroban contract (hard hackathon requirement).
- **Real-world framing** — solvency + risk for issuers/funds, the heart of Stellar's positioning.
- **Shippable in 7 days, solo**, on testnet, at ~$0 cost.
- **Intellectual honesty** — synthetic data clearly labeled; limitations stated plainly (see §15).

### Non-Goals (v1)
- **Not** a private-payment / shielded-transfer system — SDF already shipped that (Private Payments framework). We deliberately build a *different* primitive.
- **Not** a confidential token.
- **Not** a real custody oracle. v1 accepts an operator-provided book; binding the commitment to *real-world* custody (signed feeds, MPC, oracles) is explicitly future work and is disclosed (§15).
- **No** mainnet deployment (testnet only).
- **No** production-grade key management.

---

## 4. Users & Personas

| Persona | Goal | Surface |
|---|---|---|
| **Issuer / Prover** | Prove health without exposing the book | Issuer flow (load book → policy → generate → publish) |
| **Public / Verifier** | Independently confirm an issuer is healthy | Public verify page (read-only) |
| **Auditor** *(stretch)* | See the full book for one attestation, under authorization | Auditor view (view-key) |

---

## 5. User Flows

### 5.1 Issuer (prover)
1. Connects a Stellar wallet (Freighter) / supplies a funded testnet key (via env).
2. Loads the **private** balance sheet (CSV/JSON: per position `amount`, `counterparty_id`, `is_liquid`; plus total liabilities). *(Demo: synthetic, disclosed.)*
3. Confirms the **public policy**: buffer (e.g. 105%), max concentration (e.g. 20%), min liquidity (e.g. 30%).
4. **Generate** — the Noir circuit runs locally; the raw book never leaves the machine. Output: proof + public inputs (commitment, policy).
5. **Publish** — submits the `attest` transaction to the Soroban contract, which verifies on-chain and records the attestation.

### 5.2 Public (verifier)
1. Opens the public page, searches an issuer address (or scans a shared link).
2. Sees the attestation card: **✅ Solvent & within risk limits — verified on-chain — `<timestamp>`**, with the policy that was proven.
3. Clicks through to the **real testnet transaction** (Stellar Expert) confirming the *network* verified the proof.
4. Sees *what* was proven — never the numbers.

### 5.3 Auditor (stretch)
Issuer hands a designated auditor a **view-key**. The auditor reconstructs the full book for that one attestation, re-hashes it, and confirms it matches the on-chain commitment — while the public still sees only the result.

---

## 6. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ ISSUER (local machine)                                            │
│                                                                   │
│   private book (CSV/JSON) ──► [1] Noir circuit (nargo + bb)       │
│                                     │                             │
│                                     ▼                             │
│                          proof + public inputs                    │
│                          (commitment, policy)                     │
└─────────────────────────────────│─────────────────────────────────┘
                                   │  attest(proof, public_inputs)
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│ STELLAR TESTNET                                                   │
│   [2] Soroban verifier contract                                   │
│       • verifies proof via BN254 / Poseidon host fns              │
│       • on success: store Attestation, emit event                 │
└─────────────────────────────────│─────────────────────────────────┘
                                   │  get_attestation / events
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│ [3] Web app (Next.js)                                             │
│     • Issuer: generate + publish    • Public: verify (read-only)  │
└───────────────────────────────────────────────────────────────────┘
```

Three components, each independently testable:
- **[1] Circuit** — pure ZK logic; tested with `nargo test`.
- **[2] Contract** — verification + storage; tested with `cargo test` against a local/testnet ledger.
- **[3] Web + CLI** — the glue and the surfaces; tested with unit + manual e2e.

---

## 7. The ZK Circuit (Noir)

The heart of the system. All arithmetic uses **integer minor units** (e.g. cents) and **basis points** (bps) to avoid fractions in-circuit.

### 7.1 Inputs

**Private (witness):**
- `positions: [Position; N]` where `Position { amount: u64, counterparty_id: u8, is_liquid: bool }`
- `liabilities: u64` — total liabilities
- `salt: Field` — hiding factor for the commitment
- `active: [bool; N]` — padding mask (real books are smaller than N)

**Public:**
- `commitment: Field` — Pedersen hash (`std::hash::pedersen_hash`) binding the entire witness
- `buffer_bps: u32` — solvency buffer, ≥ 10000 (10000 = 100%)
- `max_concentration_bps: u32` — ≤ 10000
- `min_liquidity_bps: u32` — ≤ 10000

### 7.2 Constraints

Let `TA = Σ active_i · amount_i` (total assets). All products widened to `u128` to prevent overflow.

1. **Solvency:** `TA · 10000 ≥ liabilities · buffer_bps`
2. **Concentration:** for each counterparty `j ∈ [0, K)`:
   `cp_sum_j = Σ active_i · amount_i · (counterparty_id_i == j)` and assert `cp_sum_j · 10000 ≤ TA · max_concentration_bps`
3. **Liquidity:** `LA = Σ active_i · amount_i · is_liquid_i` and assert `LA · 10000 ≥ TA · min_liquidity_bps`
4. **Commitment integrity:** `commitment == pedersen_hash([amount_i]_{i<N} ‖ [counterparty_id_i]_{i<N} ‖ [is_liquid_i]_{i<N} ‖ [active_i]_{i<N} ‖ liabilities ‖ salt)` — a flat `[Field; 4·N+2]` array in exactly that order: the four per-position arrays as contiguous blocks, then `liabilities`, then `salt` as the final element. `std::hash::pedersen_hash` is the stdlib-confirmed ZK-friendly hash for the pinned Noir version. (Stellar's native Poseidon host functions accelerate the on-chain *verifier*, not this in-circuit commitment.) **The CLI and any auditor must reproduce this exact layout** to recompute the commitment, or the equality assert fails.
5. **Range / sanity:** each `amount_i < 2^64`; `counterparty_id_i < K`; `is_liquid_i, active_i ∈ {0,1}`.
6. **Non-empty:** `TA > 0` — a book with no active assets cannot attest solvency (it would otherwise satisfy every ratio vacuously).

### 7.3 Bounds & overflow
- `N = 64` positions, `K = 16` counterparties (compile-time constants; start small at `N=8, K=4` during the spike, scale up).
- `TA < 2^70`; scaled comparisons `< 2^96` — comfortably inside the BN254 field (~2^254). No wraparound. Comparisons performed on `u128`-typed values, not raw `Field`.

### 7.4 Failure semantics (the load-bearing property)
If any constraint is violated — e.g. one counterparty holds 80% of assets — the circuit is **unsatisfiable** and **no valid proof exists**. The issuer therefore *cannot* publish a passing attestation it did not earn. This is the property demonstrated in the demo (§14) and the bar the judges said they'd use to cut slop.

---

## 8. The Soroban Verifier Contract

### 8.1 Storage
```rust
struct Attestation {
    issuer: Address,
    commitment: BytesN<32>,
    buffer_bps: u32,
    max_concentration_bps: u32,
    min_liquidity_bps: u32,
    ledger_timestamp: u64,
    ledger_seq: u32,
}
```
Persistent storage keyed by `(issuer, attestation_id)`, plus a per-issuer counter.

### 8.2 Interface
- `attest(issuer: Address, proof: Bytes, public_inputs: Vec<Bytes>) -> u64`
  `issuer.require_auth()`; verify the proof against `public_inputs` via the verifier; on success store `Attestation` (stamping ledger time/seq), emit `attested` event, return the new `attestation_id`. **Reverts** if the proof is invalid.
- `get_attestation(issuer: Address, id: u64) -> Option<Attestation>`
- `get_latest(issuer: Address) -> Option<Attestation>`
- `count(issuer: Address) -> u64`

### 8.3 Verification path
Primary: **UltraHonk** verifier adapted from [`rs-soroban-ultrahonk`](https://github.com/yugocabrio/rs-soroban-ultrahonk), using Protocol 25/26 BN254 + Poseidon host functions. The contract checks the proof binds to the supplied `commitment` + policy.

Fallback (see §13): **Circom + Groth16** using Stellar's official [`groth16_verifier`](https://github.com/stellar/soroban-examples/tree/main/groth16_verifier). The contract interface above is **unchanged**; only the proof format and verify internals differ. This keeps the fallback cheap to adopt mid-build.

---

## 9. Off-chain CLI (`auspex`)

The glue between circuit and chain. Secrets via env only (never hardcoded; per project security rules).
- `auspex prove --book book.json --policy policy.json --out proof.json` — build witness, run `nargo`/`bb`, emit proof + public inputs + commitment.
- `auspex publish --proof proof.json --network testnet` — submit `attest` tx (signing key from env).
- `auspex verify --issuer <addr> [--id <n>]` — read attestation(s) from chain, print status + tx link.

---

## 10. Web App (Next.js, App Router)

- **Issuer page** — upload book + set policy → **Generate** (server action invokes the prover; book stays server-local) → **Publish**.
- **Public verify page** — enter issuer address → list attestations → ✅ + policy + link to the testnet tx (Stellar Expert).
- v1 proving runs **server-side** (Node invokes `nargo`/`bb`) or via the CLI. **In-browser WASM proving is stretch.**
- Styling: Tailwind, dark-mode-first. Lucide icons (no emoji icons in UI).

---

## 11. Tech Stack

| Layer | Tool | Notes |
|---|---|---|
| Circuit | Noir (`nargo`) + Barretenberg (`bb`) UltraHonk | exact versions pinned Day 1 (§18) |
| Contract | Rust + `soroban-sdk`, Stellar CLI | target testnet, Protocol ≥ 26 |
| CLI glue | TypeScript + `@stellar/stellar-sdk` | secrets via env |
| Web | Next.js + Tailwind + Lucide | Vercel Hobby or local for demo |
| Package mgr | pnpm | |
| Tests | `nargo test`, `cargo test`, vitest | |

---

## 12. Scope — v1 vs Stretch

| v1 (must ship) | Stretch (only if time) |
|---|---|
| Noir circuit: 3 constraints + Pedersen commitment | In-browser WASM proving |
| Soroban verifier on testnet | **Auditor view-key** (selective disclosure) |
| E2E: book → proof → on-chain verify → stored attestation | Historical "solvency heartbeat" timeline |
| CLI (`prove` / `publish` / `verify`) | Multiple policy templates |
| Public verify page + the cheat-attempt demo | Polished marketing-grade UI |
| Honest README + 2–3 min video | Freighter wallet integration (else env key) |

---

## 13. Critical Path & Risks

| # | Risk | Mitigation |
|---|---|---|
| **R1** | **Noir UltraHonk proof won't verify cheaply on Soroban** (the whole bet) | **Days 1–2 = go/no-go spike**: verify the *smallest possible* proof on testnet before building anything else. Fallback: Circom/Groth16 with Stellar's official verifier example (§8.3). |
| R2 | Proving time / circuit size at `N=64, K=16` | Start `N=8, K=4`; scale after the pipeline is green. |
| R3 | Data authenticity (where the private book comes from) | **Out of v1 scope, disclosed (§15).** v1 proves the *committed* book satisfies the policy; real-world binding is future work. |
| R4 | 7-day solo time budget | Ruthless v1 scope; CLI-first, web minimal; stretch items cut first. |

---

## 14. Demo & Submission

**2–3 min video:**
1. Issuer loads a (synthetic, labeled) book and policy.
2. **Generate** → **Publish** → show the **real testnet transaction**.
3. Public verify page → ✅ + policy, **no numbers visible**.
4. **The cheat attempt** — feed a book with 80% concentration in one counterparty, try to claim "within limits" → **proof generation fails** → cannot publish. *This beat proves the ZK is load-bearing.*

**Submission-requirement mapping:** open-source repo ✓ · clear README ✓ · demo video ✓ · ZK load-bearing ✓ · Stellar integration (on-chain Soroban verification) ✓.

---

## 15. Honesty & Disclosure

To be stated plainly in the README:
- All balance-sheet data in the demo is **synthetic and labeled as such.**
- Auspex proves that **the committed book satisfies the policy**, and binds the proof to that commitment. It does **not**, in v1, prove the committed book matches an institution's *real-world* custody. Tying the commitment to reality (signed custody feeds, MPC over bank/chain balances, oracle attestations) is **explicitly future work**, not claimed as done.
- The proof attests the policy **ratios** over the committed book; it does not reveal magnitudes, so a deliberately small book can satisfy them. The circuit guards only the degenerate empty book (`TA > 0`); distinguishing "solvent and material" from "solvent but trivial" is out of v1 scope.
- Commitment **hiding** depends on a high-entropy `salt` supplied by the prover (the CLI generates it with a CSPRNG); a predictable salt over a low-entropy book would weaken confidentiality.
- v1 runs on **testnet**; no real funds.

This honesty is a deliberate design choice — the hackathon explicitly rewards an honest work-in-progress over a "polished mystery."

---

## 16. Repository Layout

```
auspex/
  circuits/
    solvency/              # Noir circuit
      src/main.nr
      Nargo.toml
      Prover.toml          # labeled synthetic witness
  contracts/               # Soroban (Rust): vendored UltraHonk harness; attest crate = contracts/auspex (Phase 2)
  cli/                     # TypeScript CLI glue
  web/                     # Next.js app
  fixtures/                # synthetic books + policies (labeled)
  SPEC.md
  PLAN.md
  README.md
  LICENSE
```

---

## 17. Milestones (7-day high-level — detailed in PLAN.md)

| Day | Outcome |
|---|---|
| 1 | **Spike:** any Noir proof verifies on testnet + circuit skeleton |
| 2 | Full circuit (3 constraints + commitment) + `nargo` tests pass |
| 3 | Soroban verifier + e2e prove → verify → record on testnet |
| 4 | CLI (`prove`/`publish`/`verify`) + labeled fixtures |
| 5 | Web app (issuer + public verify) |
| 6 | Cheat-attempt demo + tests + honest README + hardening |
| 7 | Demo video + submission (buffer) |

---

## 18. Assumptions to Verify (Day 1, before committing the build)

- `rs-soroban-ultrahonk` is current and compatible with the target testnet protocol.
- `bb` UltraHonk proof format is accepted by that verifier.
- Stellar testnet is on Protocol ≥ 26 (BN254 host functions present).
- Exact `nargo` / `bb` / `soroban-sdk` versions are pinned and mutually compatible.

*If any of these fails, fall back to Circom/Groth16 (§8.3) — same contract interface, known-good official verifier.*

---

## 19. Glossary

- **ZK proof** — a proof that a statement is true revealing nothing beyond its truth.
- **Noir** — Rust-like DSL for ZK circuits; proven with Barretenberg (UltraHonk).
- **Soroban** — Stellar's Rust smart-contract platform.
- **Pedersen hash** — ZK-friendly hash in the Noir stdlib; used for the in-circuit commitment.
- **Poseidon** — ZK-friendly hash with native Stellar host functions (Protocol 25); accelerates the on-chain proof verifier.
- **BN254** — elliptic curve with native Stellar host functions for proof verification.
- **Commitment** — a hash that binds the proof to the exact (hidden) balance sheet.
- **View-key** *(stretch)* — a key letting one designated party reconstruct the book for one attestation.
