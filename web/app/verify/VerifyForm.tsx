"use client";

import { useActionState } from "react";
import {
  Loader2,
  AlertTriangle,
  BadgeCheck,
  ExternalLink,
  SearchX,
} from "lucide-react";
import AttestationSeal from "@/components/AttestationSeal";
import SealedLedger from "@/components/SealedLedger";
import { readAttestation, type VerifyResult, type AttestationData } from "./actions";

/* ─── Shared style constants ────────────────────────────────────────────── */

const inputBase =
  "w-full rounded-lg border border-line bg-ink px-3 py-2.5 " +
  "font-mono text-sm text-bone placeholder:text-muted " +
  "focus-visible:border-verdigris focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/* ─── VerifyForm ─────────────────────────────────────────────────────────── */

/**
 * Client form: issuer address input → readAttestation server action → result card.
 *
 * Drives the server action via React 19 useActionState:
 *   useActionState(action, initialState) → [state, formAction, pending]
 * Action signature: (prevState: T | null, formData: FormData) → Promise<T>
 *
 * Read-only: no wallet, no signing, no secrets.
 */
export default function VerifyForm() {
  const [result, formAction, pending] = useActionState<
    VerifyResult | null,
    FormData
  >(readAttestation, null);

  return (
    <div className="flex flex-col gap-8">
      {/* ── Input card ───────────────────────────────────────────────────── */}
      <section
        aria-labelledby="verify-form-heading"
        className="rounded-xl border border-line bg-slate p-6 sm:p-8"
      >
        <h2
          id="verify-form-heading"
          className="font-display text-xl font-[700] text-bone mb-6"
        >
          Look up an issuer
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
            <p
              id="issuer-hint"
              className="font-body text-xs text-muted mt-1.5"
            >
              The Stellar address (starts with{" "}
              <code className="font-mono text-xs text-bone">G</code>, 56
              characters) of the issuer whose attestation you want to check.
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
                  <Loader2
                    size={16}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                  Reading chain…
                </>
              ) : (
                "Verify issuer"
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

      {/* ── Result ──────────────────────────────────────────────────────────
          Live region always mounted — ensures screen readers announce results. */}
      <section aria-live="polite" aria-atomic="true">
        {result !== null && (
          <>
            {!result.ok && <ErrorResult error={result.error} />}
            {result.ok && !result.found && <NotFoundResult />}
            {result.ok && result.found && (
              <FoundResult issuer={result.issuer} attestation={result.attestation} />
            )}
          </>
        )}
      </section>
    </div>
  );
}

/* ─── FoundResult ────────────────────────────────────────────────────────── */

interface FoundResultProps {
  issuer: string;
  attestation: AttestationData;
}

function FoundResult({ issuer, attestation }: FoundResultProps) {
  const {
    commitment,
    bufferBps,
    maxConcentrationBps,
    minLiquidityBps,
    ledgerTimestamp,
    ledgerSeq,
  } = attestation;

  const attestedAt = new Date(ledgerTimestamp * 1000).toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const explorerUrl = `https://stellar.expert/explorer/testnet/account/${issuer}`;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Verdict headline ─────────────────────────────────────────────── */}
      {/* prefers-reduced-motion: handled globally via globals.css @media block */}
      <div className="flex items-center gap-3 animate-[verdict-in_220ms_ease-out]">
        <BadgeCheck
          size={28}
          strokeWidth={1.75}
          className="text-verdigris flex-shrink-0"
          aria-hidden="true"
        />
        <h3 className="font-display text-2xl font-[700] text-bone tracking-tight">
          Solvent &amp; within risk limits
        </h3>
      </div>

      {/* ── Seal + Sealed Ledger — the trust moment ──────────────────────── */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        {/* Attestation Seal — verdict + commitment + policy.
            Uses the same verdict-in keyframe as the headline. */}
        <div className="flex-shrink-0 self-center lg:self-auto animate-[verdict-in_220ms_ease-out]">
          <AttestationSeal
            commitment={commitment}
            bufferBps={bufferBps}
            maxConcentrationBps={maxConcentrationBps}
            minLiquidityBps={minLiquidityBps}
          />
        </div>

        {/* Sealed Ledger — the signature ZK element */}
        <div className="flex-shrink-0 self-center lg:self-auto">
          <SealedLedger />
        </div>
      </div>

      {/* ── Attestation metadata ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-line bg-slate p-6 space-y-5">
        <h4 className="font-display text-base font-[700] text-bone">
          Attestation details
        </h4>

        <dl className="space-y-4">
          <div>
            <dt className="font-body text-xs uppercase tracking-widest text-muted mb-1">
              Issuer
            </dt>
            <dd className="font-mono text-sm text-bone break-all">{issuer}</dd>
          </div>

          <div>
            <dt className="font-body text-xs uppercase tracking-widest text-muted mb-1">
              Attested at
            </dt>
            <dd className="font-mono text-sm text-bone">{attestedAt}</dd>
          </div>

          <div>
            <dt className="font-body text-xs uppercase tracking-widest text-muted mb-1">
              Ledger sequence
            </dt>
            <dd className="font-mono text-sm text-bone">{ledgerSeq}</dd>
          </div>

          <div>
            <dt className="font-body text-xs uppercase tracking-widest text-muted mb-1">
              Commitment
            </dt>
            <dd
              className="font-mono text-sm text-bone break-all"
              title={commitment}
            >
              {commitment}
            </dd>
          </div>

          <div>
            <dt className="font-body text-xs uppercase tracking-widest text-muted mb-1">
              Policy proven
            </dt>
            <dd>
              <ul className="space-y-1 list-none m-0 p-0" role="list">
                <li className="font-mono text-sm text-bone">
                  solvency buffer ≥ {bufferBps} bps
                </li>
                <li className="font-mono text-sm text-bone">
                  max concentration ≤ {maxConcentrationBps} bps
                </li>
                <li className="font-mono text-sm text-bone">
                  min liquid ratio ≥ {minLiquidityBps} bps
                </li>
              </ul>
            </dd>
          </div>
        </dl>

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

/* ─── NotFoundResult ─────────────────────────────────────────────────────── */

function NotFoundResult() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-slate p-5">
      <SearchX
        size={18}
        className="mt-0.5 flex-shrink-0 text-muted"
        aria-hidden="true"
      />
      <div className="space-y-1">
        <p className="font-body text-sm font-[500] text-bone">
          No attestation found for this issuer.
        </p>
        <p className="font-body text-sm text-muted leading-relaxed">
          This address hasn&rsquo;t published an attestation yet. Check the
          address, or ask the issuer to publish one from the{" "}
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
          Verification failed
        </p>
        <p className="font-body text-sm text-muted leading-relaxed">{error}</p>
      </div>
    </div>
  );
}
