# Auspex — Web

The two web surfaces for Auspex (zero-knowledge proof-of-solvency & risk attestation on Stellar).

- **Issuer** (`/issuer`) — paste a balance-sheet book, set the policy thresholds, and generate a zero-knowledge proof that gets published on-chain. The book is processed **server-side only** and never leaves the machine; only the proof and the resulting attestation are published.
- **Verify** (`/verify`) — enter an issuer's Stellar address and see their latest attestation: the verdict, the policy proven, and the commitment — with **no balance-sheet numbers revealed**.

## Requirements

This app drives the repo's `auspex` CLI and reads the deployed Soroban contract, so it expects the rest of the monorepo to be in place:

- **Built CLI** — the issuer action shells out to `../cli/dist/index.js`. Build it once: `pnpm --dir ../cli install && pnpm --dir ../cli build`.
- **Proving toolchain on `PATH`** — `nargo`, `bb`, and `just` (see the repo-root setup / Phase 0). The issuer page runs the circuit server-side.
- **`.auspex_contract_id`** at the repo root — the deployed testnet contract id (read by both the issuer and verify actions).
- **`AUSPEX_SECRET`** (issuer only) — the source account's Stellar secret key, used to sign the `attest` transaction. Read from the **server environment only**; never committed, never sent to the browser.

## Run (local demo)

```bash
pnpm install
AUSPEX_SECRET=<funded-testnet-secret> pnpm dev
# open http://localhost:3000
```

- The **issuer** page needs `AUSPEX_SECRET` in the server env to publish (use the harness `alice` identity: `stellar keys secret alice`).
- The **verify** page is read-only and needs no secret.

## Scope & caveats (v1 — testnet demo)

- **Testnet only.** No mainnet, no real funds.
- **Single-user demo.** The issuer action invokes the CLI, which writes proof artifacts to the repo-shared `circuits/solvency/target/`. Concurrent issuer submissions would race over that shared state — do **not** expose `/issuer` to multiple simultaneous users without per-request isolation.
- Proving runs **server-side** (Node invokes the CLI); in-browser proving is out of scope.
- Demo book data is **synthetic and labeled** (`fixtures/*.book.json`).

## Stack

Next.js 16 (App Router) · React 19 · Tailwind v4 · Lucide icons · `@stellar/stellar-sdk` (the verify page reads the chain read-only via `simulateTransaction`).
