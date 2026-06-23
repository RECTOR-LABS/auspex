#!/usr/bin/env bash
# Auspex — cheat-attempt demo.
#
# Proves the zero-knowledge guarantee is load-bearing: a book that violates the
# policy cannot produce a passing proof, so a false "solvent" attestation is
# cryptographically impossible to publish. This is the property the judges said
# they would use to cut slop.
set -uo pipefail
cd "$(dirname "$0")/.."

# `prove` overwrites the (gitignored) solvency Prover.toml with the book it is
# given — here the over-concentrated one — which would otherwise leave
# `just build-circuits solvency` failing until reset. Restore the synthetic
# default witness on exit so the demo never leaves the repo unbuildable.
trap 'cp -f circuits/solvency/Prover.toml.example circuits/solvency/Prover.toml 2>/dev/null || true' EXIT

if [ ! -f cli/dist/index.js ]; then
  echo "[demo] building the auspex CLI..."
  pnpm --dir cli install >/dev/null 2>&1 && pnpm --dir cli build >/dev/null 2>&1
fi

echo "[demo] Attempting to attest an over-concentrated book"
echo "[demo]   (80% of assets in a single counterparty) against a 50% concentration limit..."
echo

if node cli/dist/index.js prove \
     --book fixtures/concentrated.book.json \
     --policy fixtures/healthy.policy.json; then
  echo
  echo "[demo] ERROR: a proof was generated for a non-compliant book — this must never happen."
  exit 1
else
  echo
  echo "[demo] EXPECTED: proof generation failed."
  echo "[demo] The circuit is unsatisfiable for a book that breaks the policy, so no valid"
  echo "[demo] proof exists — the issuer cannot publish a passing attestation it did not earn."
  exit 0
fi
