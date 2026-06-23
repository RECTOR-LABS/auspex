"use client";

import { useActionState } from "react";
import { Loader2, AlertTriangle, ExternalLink } from "lucide-react";
import AttestationSeal from "@/components/AttestationSeal";
import { generateAndPublish, type ActionResult } from "./actions";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface IssuerFormProps {
  /** Stringified healthy.book.json to prefill the textarea. */
  prefillBook: string;
}

/* ─── Label helper ──────────────────────────────────────────────────────── */

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block font-body text-sm font-[500] text-bone mb-1.5"
    >
      {children}
    </label>
  );
}

/* ─── Input shared styles ─────────────────────────────────────────────────
   Tailwind v4 — apply as className strings. No cva; keeping it flat.    */

const inputBase =
  "w-full rounded-lg border border-line bg-ink px-3 py-2.5 " +
  "font-mono text-sm text-bone placeholder:text-muted " +
  "focus-visible:border-verdigris focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-50";

const textareaBase =
  "w-full rounded-lg border border-line bg-ink px-3 py-3 " +
  "font-mono text-sm text-bone placeholder:text-muted leading-relaxed " +
  "resize-y focus-visible:border-verdigris focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/* ─── IssuerForm ─────────────────────────────────────────────────────────── */

/**
 * Client form that drives the generateAndPublish server action via
 * React 19's useActionState (confirmed in web/node_modules/next/dist/docs/01-app/02-guides/forms.md).
 *
 * Signature: useActionState(action, initialState) → [state, formAction, pending]
 * Action signature: (prevState: T | null, formData: FormData) → Promise<T>
 */
export default function IssuerForm({ prefillBook }: IssuerFormProps) {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    generateAndPublish,
    null,
  );

  return (
    <div className="flex flex-col gap-8">
      {/* ── Form card ────────────────────────────────────────────────────── */}
      <section
        aria-labelledby="issuer-form-heading"
        className="rounded-xl border border-line bg-slate p-6 sm:p-8"
      >
        <h2
          id="issuer-form-heading"
          className="font-display text-xl font-[700] text-bone mb-6"
        >
          Generate an attestation
        </h2>

        <form action={formAction} className="flex flex-col gap-6">
          {/* Book JSON */}
          <div>
            <FieldLabel htmlFor="book">Book JSON</FieldLabel>
            {/* Privacy reassurance — design-system required copy */}
            <p className="font-body text-xs text-muted mb-2">
              Your book stays on this machine — only the proof is published.
            </p>
            <textarea
              id="book"
              name="book"
              rows={12}
              defaultValue={prefillBook}
              required
              disabled={pending}
              aria-describedby="book-hint"
              className={textareaBase}
              spellCheck={false}
              autoComplete="off"
            />
            <p id="book-hint" className="font-body text-xs text-muted mt-1.5">
              Must include{" "}
              <code className="font-mono text-xs text-bone">"positions"</code>{" "}
              and{" "}
              <code className="font-mono text-xs text-bone">"liabilities"</code>
              .
            </p>
          </div>

          {/* Policy thresholds */}
          <fieldset className="flex flex-col gap-5">
            <legend className="font-body text-sm font-[500] text-bone mb-1">
              Policy thresholds
            </legend>

            <div className="grid gap-4 sm:grid-cols-3">
              {/* Buffer bps */}
              <div>
                <FieldLabel htmlFor="bufferBps">Solvency buffer (bps)</FieldLabel>
                <input
                  type="number"
                  id="bufferBps"
                  name="bufferBps"
                  defaultValue={10500}
                  min={0}
                  step={1}
                  required
                  disabled={pending}
                  aria-describedby="bufferBps-hint"
                  className={inputBase}
                />
                <p id="bufferBps-hint" className="font-body text-xs text-muted mt-1">
                  Minimum net-asset ratio in basis points
                </p>
              </div>

              {/* Max concentration bps */}
              <div>
                <FieldLabel htmlFor="maxConcentrationBps">
                  Max concentration (bps)
                </FieldLabel>
                <input
                  type="number"
                  id="maxConcentrationBps"
                  name="maxConcentrationBps"
                  defaultValue={5000}
                  min={0}
                  step={1}
                  required
                  disabled={pending}
                  aria-describedby="maxConcentrationBps-hint"
                  className={inputBase}
                />
                <p
                  id="maxConcentrationBps-hint"
                  className="font-body text-xs text-muted mt-1"
                >
                  Maximum single-counterparty exposure
                </p>
              </div>

              {/* Min liquidity bps */}
              <div>
                <FieldLabel htmlFor="minLiquidityBps">
                  Min liquid ratio (bps)
                </FieldLabel>
                <input
                  type="number"
                  id="minLiquidityBps"
                  name="minLiquidityBps"
                  defaultValue={3000}
                  min={0}
                  step={1}
                  required
                  disabled={pending}
                  aria-describedby="minLiquidityBps-hint"
                  className={inputBase}
                />
                <p
                  id="minLiquidityBps-hint"
                  className="font-body text-xs text-muted mt-1"
                >
                  Minimum ratio of liquid assets to total
                </p>
              </div>
            </div>
          </fieldset>

          {/* Submit */}
          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={pending}
              className={
                "inline-flex h-12 items-center justify-center gap-2 rounded-xl " +
                "border border-brass px-6 font-body text-sm font-[600] text-brass " +
                "transition-colors hover:bg-brass hover:text-ink " +
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
                  Generating…
                </>
              ) : (
                "Generate & publish"
              )}
            </button>

            {/* Pending copy */}
            {pending && (
              <p
                className="font-body text-sm text-muted"
                aria-live="polite"
                role="status"
              >
                Generating the proof — this runs the circuit, ~10–20 s
              </p>
            )}
          </div>
        </form>
      </section>

      {/* ── Result ──────────────────────────────────────────────────────────
          The live region is ALWAYS mounted (even when empty) so screen readers
          reliably announce the success/failure that appears inside it. A region
          mounted at the same time as its content is often not announced. */}
      <section aria-live="polite" aria-atomic="true">
        {result !== null &&
          (result.ok ? (
            <SuccessResult result={result} />
          ) : (
            <FailureResult error={result.error} />
          ))}
      </section>
    </div>
  );
}

/* ─── Success result ─────────────────────────────────────────────────────── */

interface SuccessResultProps {
  result: Extract<ActionResult, { ok: true }>;
}

function SuccessResult({ result }: SuccessResultProps) {
  const {
    id,
    txHash,
    commitment,
    bufferBps,
    maxConcentrationBps,
    minLiquidityBps,
  } = result;

  // Decode the commitment: strip leading 0x, left-pad to 64 hex chars.
  // AttestationSeal expects a bare 64-char hex string.
  const commitmentHex = commitment.startsWith("0x")
    ? commitment.slice(2).padStart(64, "0")
    : commitment.padStart(64, "0");

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
      {/* Seal — reflects the ACTUAL submitted thresholds, not defaults */}
      <div className="flex-shrink-0">
        <AttestationSeal
          commitment={commitmentHex}
          bufferBps={bufferBps}
          maxConcentrationBps={maxConcentrationBps}
          minLiquidityBps={minLiquidityBps}
        />
      </div>

      {/* Details card */}
      <div className="flex-1 rounded-xl border border-line bg-slate p-6 space-y-5">
        <h3 className="font-display text-lg font-[700] text-bone">
          Attestation published
        </h3>

        <dl className="space-y-4">
          <div>
            <dt className="font-body text-xs uppercase tracking-widest text-muted mb-1">
              Attestation ID
            </dt>
            <dd className="font-mono text-sm text-bone break-all">{id}</dd>
          </div>

          <div>
            <dt className="font-body text-xs uppercase tracking-widest text-muted mb-1">
              Transaction hash
            </dt>
            <dd className="font-mono text-sm text-bone break-all">{txHash}</dd>
          </div>

          <div>
            <dt className="font-body text-xs uppercase tracking-widest text-muted mb-1">
              Commitment
            </dt>
            <dd
              className="font-mono text-sm text-bone break-all"
              title={commitmentHex}
            >
              {commitmentHex}
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
          href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className={
            "inline-flex items-center gap-1.5 font-body text-sm text-verdigris " +
            "underline-offset-4 hover:underline " +
            "focus-visible:outline-2 focus-visible:outline-verdigris focus-visible:outline-offset-2 rounded-sm"
          }
        >
          View on Stellar Expert
          <ExternalLink size={13} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

/* ─── Failure result ─────────────────────────────────────────────────────── */

function FailureResult({ error }: { error: string }) {
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
          No proof generated
        </p>
        <p className="font-body text-sm text-muted leading-relaxed">{error}</p>
      </div>
    </div>
  );
}
