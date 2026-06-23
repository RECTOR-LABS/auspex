import Link from "next/link";
import AttestationSeal from "@/components/AttestationSeal";

/* ─── Live testnet attestation sample ───────────────────────────────────── */

const SAMPLE_ATTESTATION = {
  commitment:
    "2e56923540859f913de534bce00013a62d9dc02d183aa753eb18a82cc0840a84",
  bufferBps: 10500,
  maxConcentrationBps: 5000,
  minLiquidityBps: 3000,
} as const;

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-12 lg:flex-row lg:items-center lg:py-16">
      {/* ── Hero copy ────────────────────────────────────────────────────── */}
      <section
        className="flex-1 flex flex-col gap-8"
        aria-labelledby="hero-headline"
      >
        <div className="flex flex-col gap-4">
          <h1
            id="hero-headline"
            className="font-display text-4xl font-[700] leading-tight tracking-tight text-bone sm:text-5xl lg:text-[3.5rem]"
          >
            Prove you&rsquo;re solvent.{" "}
            <span className="text-verdigris">Without opening your books.</span>
          </h1>
          <p className="font-body text-lg leading-relaxed text-muted max-w-lg">
            Your book stays on this machine — only the proof is published.
          </p>
        </div>

        {/* CTAs */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Brass outline — the "Issue" action is the primary authoring moment */}
          <Link
            href="/issuer"
            className="inline-flex h-12 items-center justify-center rounded-xl border border-brass px-6 font-body text-sm font-[600] text-brass transition-colors hover:bg-brass hover:text-ink focus-visible:outline-2 focus-visible:outline-verdigris focus-visible:outline-offset-2"
          >
            Issue an attestation
          </Link>

          {/* Verdigris solid — verification is the trust-delivery moment */}
          <Link
            href="/verify"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-verdigris px-6 font-body text-sm font-[600] text-ink transition-colors hover:bg-[#5bb39e] focus-visible:outline-2 focus-visible:outline-verdigris focus-visible:outline-offset-2"
          >
            Verify an issuer
          </Link>
        </div>

        {/* Trust note */}
        <p className="font-body text-xs text-muted max-w-xs">
          Built on Stellar. Proven by Noir + Barretenberg. No positions revealed.
        </p>
      </section>

      {/* ── Attestation Seal ─────────────────────────────────────────────── */}
      <aside
        className="flex justify-center lg:justify-end lg:flex-shrink-0"
        aria-label="Sample attestation seal"
      >
        <AttestationSeal
          commitment={SAMPLE_ATTESTATION.commitment}
          bufferBps={SAMPLE_ATTESTATION.bufferBps}
          maxConcentrationBps={SAMPLE_ATTESTATION.maxConcentrationBps}
          minLiquidityBps={SAMPLE_ATTESTATION.minLiquidityBps}
        />
      </aside>
    </div>
  );
}
