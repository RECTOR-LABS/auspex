import { readFileSync } from "node:fs";
import path from "node:path";
import { TerminalSquare, ArrowRight } from "lucide-react";
import Link from "next/link";
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

      {/* ── Form (local) or read-only notice (hosted demo) ────────────────── */}
      {process.env.AUSPEX_READONLY ? (
        <ReadOnlyNotice />
      ) : (
        <IssuerForm prefillBook={prefillBook} />
      )}
    </div>
  );
}

/* ─── ReadOnlyNotice ──────────────────────────────────────────────────────── */

/**
 * Shown on the hosted (read-only) demo where the proving toolchain (nargo + bb)
 * isn't available. Proving runs locally; verification stays fully live.
 */
function ReadOnlyNotice() {
  const link =
    "inline-flex items-center gap-1.5 font-body text-sm text-verdigris " +
    "underline-offset-4 hover:underline focus-visible:outline-2 " +
    "focus-visible:outline-verdigris focus-visible:outline-offset-2 rounded-sm";

  return (
    <div className="rounded-xl border border-line bg-slate p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <TerminalSquare
          size={22}
          strokeWidth={1.75}
          className="mt-0.5 flex-shrink-0 text-verdigris"
          aria-hidden="true"
        />
        <div className="space-y-3">
          <h2 className="font-display text-xl font-[700] text-bone">
            Proving runs locally
          </h2>
          <p className="font-body text-sm text-muted leading-relaxed">
            Generating a proof runs the Noir/Barretenberg toolchain (nargo + bb) —
            heavy native cryptography that isn&rsquo;t available on this hosted
            demo. Issue an attestation by running the CLI locally (see the repo),
            or watch it in the demo video. Verification stays fully live here.
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
            <Link href="/verify" className={link}>
              Verify an issuer
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
            <Link href="/heartbeat" className={link}>
              Trace a solvency heartbeat
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
            <a
              href="https://github.com/RECTOR-LABS/auspex"
              target="_blank"
              rel="noopener noreferrer"
              className={link}
            >
              View the repo
              <ArrowRight size={14} aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
