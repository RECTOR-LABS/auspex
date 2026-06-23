import { ShieldCheck } from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface AttestationSealProps {
  commitment: string;
  bufferBps: number;
  maxConcentrationBps: number;
  minLiquidityBps: number;
  verdict?: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

/**
 * Truncate a long hex string to "XXXXXXXX…XXXX" (8 chars + ellipsis + 4 chars).
 * Makes commitment hashes scannable without occupying the full 64-char width.
 */
function truncateMiddle(hex: string): string {
  if (hex.length <= 16) return hex;
  return `${hex.slice(0, 8)}…${hex.slice(-4)}`;
}

/* ─── Component ──────────────────────────────────────────────────────────── */

/**
 * AttestationSeal — the struck official-verdict artifact.
 *
 * Presentational only; no data fetching. Designed to be the "signature element"
 * from the design system: verdigris ring, brass ShieldCheck, Space Grotesk
 * verdict, IBM Plex Mono commitment + policy thresholds.
 *
 * Brass is reserved exclusively for this component — never use it elsewhere.
 */
export default function AttestationSeal({
  commitment,
  bufferBps,
  maxConcentrationBps,
  minLiquidityBps,
  verdict = "SOLVENT · WITHIN LIMITS",
}: AttestationSealProps) {
  return (
    <article
      aria-label="Attestation seal"
      className="w-full max-w-sm rounded-xl border border-verdigris bg-slate p-6 shadow-[0_0_32px_rgba(79,160,141,0.08)]"
    >
      {/* ── Emblem ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-4">
        {/* Verdigris ring */}
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-verdigris bg-slate-2"
          aria-hidden="true"
        >
          <ShieldCheck
            size={36}
            strokeWidth={1.5}
            className="text-brass"
            aria-hidden="true"
          />
        </div>

        {/* Verdict line */}
        <p className="font-display text-sm font-[700] tracking-[0.2em] text-brass uppercase">
          {verdict}
        </p>

        {/* Divider */}
        <div className="w-full border-t border-line" aria-hidden="true" />

        {/* Commitment hash */}
        <div className="w-full space-y-1">
          <p className="font-body text-xs uppercase tracking-widest text-muted">
            Commitment
          </p>
          <p
            className="font-mono text-sm text-bone break-all"
            title={commitment}
          >
            {truncateMiddle(commitment)}
          </p>
        </div>

        {/* Policy thresholds */}
        <div className="w-full space-y-1.5">
          <p className="font-body text-xs uppercase tracking-widest text-muted">
            Policy
          </p>
          <ul className="space-y-1 list-none m-0 p-0" role="list">
            <li className="font-mono text-xs text-bone">
              solvency buffer ≥ {bufferBps} bps
            </li>
            <li className="font-mono text-xs text-bone">
              max concentration ≤ {maxConcentrationBps} bps
            </li>
            <li className="font-mono text-xs text-bone">
              min liquid ratio ≥ {minLiquidityBps} bps
            </li>
          </ul>
        </div>
      </div>
    </article>
  );
}
