/**
 * SealedLedger — design signature #2.
 *
 * The private book made visible as redaction bars: rows of blurred / partially-
 * struck IBM Plex Mono text, standing in for the positions this proof conceals.
 * A verdigris rule and a caption ground it: "Verified in zero-knowledge — no
 * positions revealed."
 *
 * Presentational only. No data fetching, no props needed.
 * The blur + strike overlay are CSS-only so they respect prefers-reduced-motion
 * (the animation global already handles motion; the blur is static).
 */

import { Lock } from "lucide-react";

/* ─── Fake ledger rows ───────────────────────────────────────────────────── */

// These are deliberately plausible-looking but meaningless strings.
// They exist to make the redaction *visually credible* — line-items that look
// like they contain amounts and counterparty names, but can't be read.
const LEDGER_ROWS: Array<{ label: string; amount: string; struck: boolean }> = [
  { label: "USDC / Stellar DEX",           amount: "███████  9,240,000.00", struck: false },
  { label: "XLM / Horizon custody",         amount: "████  4,581,200.00",   struck: false },
  { label: "wBTC / Fireblocks vault",       amount: "█████  2,190,640.00",  struck: false },
  { label: "ETH / cold-storage",            amount: "███████  8,003,000.00", struck: false },
  { label: "USDT / exchange reserve",       amount: "████  3,770,100.00",   struck: true  },
  { label: "BTC / multi-sig",               amount: "█████  5,912,850.00",  struck: false },
  { label: "wETH / DeFi collateral",        amount: "████  1,888,400.00",   struck: true  },
  { label: "SOL / liquid staking",          amount: "███████  6,450,900.00", struck: false },
];

/* ─── Component ──────────────────────────────────────────────────────────── */

/**
 * SealedLedger — the redaction-bars artifact.
 *
 * Used on the verify page alongside AttestationSeal to make ZK privacy
 * *visible*: the ledger is present, but its values are sealed.
 */
export default function SealedLedger() {
  return (
    <figure
      aria-label="Sealed ledger — positions withheld"
      className="w-full max-w-sm rounded-xl border border-line bg-slate overflow-hidden"
    >
      {/* ── Ledger header ──────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-3 border-b border-line flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Lock
            size={13}
            strokeWidth={1.75}
            className="text-verdigris flex-shrink-0"
            aria-hidden="true"
          />
          <span className="font-mono text-xs text-muted uppercase tracking-widest">
            Balance sheet
          </span>
        </div>
        <span className="font-mono text-xs text-muted">[SEALED]</span>
      </div>

      {/* ── Ledger rows ────────────────────────────────────────────────── */}
      <div className="relative px-5 py-4 flex flex-col gap-2.5">
        {LEDGER_ROWS.map((row, i) => (
          <div
            key={i}
            className="relative flex items-center justify-between gap-4"
            aria-hidden="true"
          >
            {/* Position label — blurred */}
            <span
              className={[
                "font-mono text-xs text-bone whitespace-nowrap overflow-hidden text-ellipsis max-w-[52%]",
                row.struck ? "opacity-40" : "opacity-60",
              ].join(" ")}
              style={{ filter: "blur(3.5px)", userSelect: "none" }}
            >
              {row.label}
            </span>

            {/* Amount — blurred + optional strikethrough overlay */}
            <span
              className={[
                "relative font-mono text-xs whitespace-nowrap shrink-0",
                row.struck ? "text-danger opacity-30" : "text-bone opacity-50",
              ].join(" ")}
              style={{ filter: "blur(2.5px)", userSelect: "none" }}
            >
              {row.amount}
              {row.struck && (
                /* Struck overlay: a thin horizontal rule over the text */
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-1/2 border-t border-danger/60"
                  style={{ transform: "translateY(-50%)" }}
                />
              )}
            </span>
          </div>
        ))}

        {/* Redaction vignette — fades the bottom rows into ink, selling the "sealed" effect */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-12"
          style={{
            background:
              "linear-gradient(to bottom, transparent, #142A30 90%)",
          }}
        />
      </div>

      {/* ── Verdigris rule + caption ──────────────────────────────────────
          bg matches the rows container (slate) so the rows' bottom vignette,
          which fades to slate, meets the footer with no visible seam. */}
      <div className="border-t border-verdigris/40 bg-slate px-5 py-3">
        <figcaption className="font-body text-xs text-muted leading-snug">
          Verified in zero-knowledge —{" "}
          <span className="text-verdigris font-[500]">no positions revealed</span>
        </figcaption>
      </div>
    </figure>
  );
}
