import VerifyForm from "./VerifyForm";

/* ─── Metadata ───────────────────────────────────────────────────────────── */

export const metadata = {
  title: "Verify an issuer — Auspex",
  description:
    "Look up a zero-knowledge solvency attestation for any issuer on Stellar. No balance-sheet numbers are revealed.",
};

/* ─── Page ───────────────────────────────────────────────────────────────── */

/**
 * Server component: renders the page shell and delegates all interactivity
 * to the VerifyForm client component.
 *
 * Read-only — no secrets required. Anyone can verify any issuer.
 */
export default function VerifyPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-12">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <header className="mb-10">
        <h1 className="font-display text-3xl font-[700] text-bone tracking-tight sm:text-4xl">
          Verify an issuer
        </h1>
        <p className="mt-3 font-body text-base text-muted max-w-xl leading-relaxed">
          Enter a Stellar address to check whether that issuer has a published
          zero-knowledge solvency attestation. No positions are revealed — only
          the verdict and the policy it was proven against.
        </p>
      </header>

      {/* ── Form + result ─────────────────────────────────────────────────── */}
      <VerifyForm />
    </div>
  );
}
