"use client";

import { useActionState } from "react";
import {
  Loader2,
  AlertTriangle,
  Activity,
  BadgeCheck,
  SearchX,
  ExternalLink,
} from "lucide-react";
import {
  readHistory,
  type HeartbeatResult,
  type HeartbeatPoint,
} from "./actions";

/* ─── Shared style constants ────────────────────────────────────────────── */

const inputBase =
  "w-full rounded-lg border border-line bg-ink px-3 py-2.5 " +
  "font-mono text-sm text-bone placeholder:text-muted " +
  "focus-visible:border-verdigris focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/** Truncate a hex string to "XXXXXXXX…XXXX" for scannability. */
function truncateMiddle(hex: string): string {
  if (hex.length <= 16) return hex;
  return `${hex.slice(0, 8)}…${hex.slice(-4)}`;
}

/* ─── HeartbeatForm ──────────────────────────────────────────────────────── */

/**
 * Client form: issuer address → readHistory server action → a vertical timeline
 * of every attestation that issuer has published (the "solvency heartbeat").
 * Read-only: no wallet, no signing, no secrets.
 */
export default function HeartbeatForm() {
  const [result, formAction, pending] = useActionState<
    HeartbeatResult | null,
    FormData
  >(readHistory, null);

  return (
    <div className="flex flex-col gap-8">
      {/* ── Input card ───────────────────────────────────────────────────── */}
      <section
        aria-labelledby="heartbeat-form-heading"
        className="rounded-xl border border-line bg-slate p-6 sm:p-8"
      >
        <h2
          id="heartbeat-form-heading"
          className="font-display text-xl font-[700] text-bone mb-6"
        >
          Trace an issuer&rsquo;s heartbeat
        </h2>

        <form action={formAction} className="flex flex-col gap-5">
          <div>
            <label
              htmlFor="issuer"
              className="block font-body text-sm font-[500] text-bone mb-1.5"
            >
              Issuer Stellar address
            </label>
            <input
              type="text"
              id="issuer"
              name="issuer"
              required
              disabled={pending}
              autoComplete="off"
              spellCheck={false}
              placeholder="GABCDE…"
              aria-describedby="issuer-hint"
              className={inputBase}
            />
            <p id="issuer-hint" className="font-body text-xs text-muted mt-1.5">
              Every published attestation for this issuer, oldest to newest —
              each one a moment they cryptographically proved solvency.
            </p>
          </div>

          <div className="flex items-center gap-4 pt-1">
            <button
              type="submit"
              disabled={pending}
              className={
                "inline-flex h-12 items-center justify-center gap-2 rounded-xl " +
                "bg-verdigris px-6 font-body text-sm font-[600] text-ink " +
                "transition-colors hover:bg-[#5bb39e] " +
                "focus-visible:outline-2 focus-visible:outline-verdigris focus-visible:outline-offset-2 " +
                "disabled:cursor-not-allowed disabled:opacity-50"
              }
            >
              {pending ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  Reading chain…
                </>
              ) : (
                "Trace heartbeat"
              )}
            </button>

            {pending && (
              <p
                className="font-body text-sm text-muted"
                aria-live="polite"
                role="status"
              >
                Querying the Stellar testnet…
              </p>
            )}
          </div>
        </form>
      </section>

      {/* ── Result ──────────────────────────────────────────────────────── */}
      <section aria-live="polite" aria-atomic="true">
        {result !== null && (
          <>
            {!result.ok && <ErrorResult error={result.error} />}
            {result.ok && result.points.length === 0 && <EmptyResult />}
            {result.ok && result.points.length > 0 && (
              <Timeline
                issuer={result.issuer}
                total={result.total}
                points={result.points}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}

/* ─── Timeline ───────────────────────────────────────────────────────────── */

function Timeline({
  issuer,
  total,
  points,
}: {
  issuer: string;
  total: number;
  points: HeartbeatPoint[];
}) {
  const explorerUrl = `https://stellar.expert/explorer/testnet/account/${issuer}`;
  const shown = points.length;
  const capped = total > shown;

  return (
    <div className="flex flex-col gap-6 animate-[verdict-in_220ms_ease-out]">
      {/* ── Summary headline ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Activity
          size={28}
          strokeWidth={1.75}
          className="text-verdigris flex-shrink-0"
          aria-hidden="true"
        />
        <div>
          <h3 className="font-display text-2xl font-[700] text-bone tracking-tight">
            {total} verified {total === 1 ? "attestation" : "attestations"}
          </h3>
          <p className="font-body text-sm text-muted">
            Every pulse below is a passing proof — a false one is impossible to
            publish.{capped ? ` Showing the latest ${shown}.` : ""}
          </p>
        </div>
      </div>

      {/* ── Vertical timeline ────────────────────────────────────────────── */}
      <ol className="relative m-0 list-none space-y-5 p-0 pl-8">
        {/* the line */}
        <span
          aria-hidden="true"
          className="absolute left-[7px] top-2 bottom-2 w-px bg-line"
        />
        {points.map((p) => (
          <PulseNode key={p.id} point={p} />
        ))}
      </ol>

      {/* ── Issuer + explorer ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-line bg-slate p-6 space-y-4">
        <div>
          <p className="font-body text-xs uppercase tracking-widest text-muted mb-1">
            Issuer
          </p>
          <p className="font-mono text-sm text-bone break-all">{issuer}</p>
        </div>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={
            "inline-flex items-center gap-1.5 font-body text-sm text-verdigris " +
            "underline-offset-4 hover:underline " +
            "focus-visible:outline-2 focus-visible:outline-verdigris focus-visible:outline-offset-2 rounded-sm"
          }
        >
          View issuer on Stellar Expert
          <ExternalLink size={13} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

/* ─── PulseNode ──────────────────────────────────────────────────────────── */

function PulseNode({ point }: { point: HeartbeatPoint }) {
  const attestedAt = new Date(point.ledgerTimestamp * 1000).toLocaleString(
    "en-US",
    { dateStyle: "long", timeStyle: "short" },
  );

  return (
    <li className="relative">
      {/* pulse dot, centered on the line (line is at left-[7px] of the ol;
          the ol has pl-8, so the dot sits at -left-8 + 1px) */}
      <span
        aria-hidden="true"
        className="absolute -left-8 top-1.5 flex h-3.5 w-3.5 items-center justify-center"
      >
        <span className="h-3.5 w-3.5 rounded-full border-2 border-verdigris bg-ink" />
      </span>

      <div className="rounded-xl border border-line bg-slate p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="flex items-center gap-2">
            <BadgeCheck
              size={18}
              strokeWidth={1.75}
              className="text-verdigris flex-shrink-0"
              aria-hidden="true"
            />
            <span className="font-display text-base font-[700] text-bone">
              Solvent &amp; within risk limits
            </span>
          </div>
          <span className="font-mono text-xs text-muted">
            #{point.id} · ledger {point.ledgerSeq}
          </span>
        </div>

        <p className="mt-2 font-mono text-sm text-bone">{attestedAt}</p>

        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-3">
          <PolicyStat label="buffer ≥" value={`${point.bufferBps} bps`} />
          <PolicyStat
            label="max conc. ≤"
            value={`${point.maxConcentrationBps} bps`}
          />
          <PolicyStat
            label="min liquid ≥"
            value={`${point.minLiquidityBps} bps`}
          />
        </dl>

        <p
          className="mt-3 font-mono text-xs text-muted break-all"
          title={point.commitment}
        >
          commitment {truncateMiddle(point.commitment)}
        </p>
      </div>
    </li>
  );
}

function PolicyStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-body text-[11px] uppercase tracking-widest text-muted">
        {label}
      </dt>
      <dd className="font-mono text-sm text-bone">{value}</dd>
    </div>
  );
}

/* ─── EmptyResult ────────────────────────────────────────────────────────── */

function EmptyResult() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-slate p-5">
      <SearchX
        size={18}
        className="mt-0.5 flex-shrink-0 text-muted"
        aria-hidden="true"
      />
      <div className="space-y-1">
        <p className="font-body text-sm font-[500] text-bone">
          No heartbeat yet for this issuer.
        </p>
        <p className="font-body text-sm text-muted leading-relaxed">
          This address hasn&rsquo;t published any attestation. Publish one from
          the{" "}
          <a
            href="/issuer"
            className="text-verdigris underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-verdigris focus-visible:outline-offset-2 rounded-sm"
          >
            Issuer page
          </a>
          .
        </p>
      </div>
    </div>
  );
}

/* ─── ErrorResult ────────────────────────────────────────────────────────── */

function ErrorResult({ error }: { error: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-danger/40 bg-slate p-5"
    >
      <AlertTriangle
        size={18}
        className="mt-0.5 flex-shrink-0 text-danger"
        aria-hidden="true"
      />
      <div className="space-y-1">
        <p className="font-body text-sm font-[500] text-danger">
          Could not load the heartbeat
        </p>
        <p className="font-body text-sm text-muted leading-relaxed">{error}</p>
      </div>
    </div>
  );
}
