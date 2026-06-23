import { readFileSync } from "node:fs";
import path from "node:path";
import IssuerForm from "./IssuerForm";

/* ─── Metadata ───────────────────────────────────────────────────────────── */

export const metadata = {
  title: "Issue an attestation — Auspex",
  description:
    "Generate a ZK solvency proof for your book and publish the attestation on Stellar.",
};

/* ─── Page ───────────────────────────────────────────────────────────────── */

/**
 * Server component: reads the healthy fixture from the repo's `fixtures/`
 * directory and passes its JSON as a prefill string to the client form.
 *
 * The raw book is only loaded here for the prefill UX convenience.
 * The actual proof is generated server-side in actions.ts; the book
 * never travels to the client as a result of the proof workflow.
 */
export default function IssuerPage() {
  // process.cwd() = web/ when Next runs from the web directory.
  const fixturePath = path.join(
    process.cwd(),
    "..",
    "fixtures",
    "healthy.book.json",
  );

  let prefillBook = "";
  try {
    const raw = JSON.parse(readFileSync(fixturePath, "utf8"));
    // Pretty-print for textarea readability.
    prefillBook = JSON.stringify(raw, null, 2);
  } catch {
    // Fixture missing in this deployment — start with empty textarea.
    prefillBook = "";
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-12">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <header className="mb-10">
        <h1 className="font-display text-3xl font-[700] text-bone tracking-tight sm:text-4xl">
          Issue an attestation
        </h1>
        <p className="mt-3 font-body text-base text-muted max-w-xl leading-relaxed">
          Paste your balance-sheet book below, set solvency policy thresholds, and
          generate a zero-knowledge proof. Only the proof is published — your
          positions are never revealed.
        </p>
      </header>

      {/* ── Form + result ─────────────────────────────────────────────────── */}
      <IssuerForm prefillBook={prefillBook} />
    </div>
  );
}
