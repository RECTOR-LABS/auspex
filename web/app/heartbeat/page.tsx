import HeartbeatForm from "./HeartbeatForm";

/* ─── Metadata ───────────────────────────────────────────────────────────── */

export const metadata = {
  title: "Solvency heartbeat — Auspex",
  description:
    "Trace an issuer's full history of zero-knowledge solvency attestations over time. No balance-sheet numbers are revealed.",
};

/* ─── Page ───────────────────────────────────────────────────────────────── */

/**
 * Server component shell; delegates interactivity to HeartbeatForm.
 * Read-only — no secrets. Anyone can trace any issuer's heartbeat.
 */
export default function HeartbeatPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-12">
      <header className="mb-10">
        <h1 className="font-display text-3xl font-[700] text-bone tracking-tight sm:text-4xl">
          Solvency heartbeat
        </h1>
        <p className="mt-3 font-body text-base text-muted max-w-xl leading-relaxed">
          Recurring attestations form a verifiable health signal over time. Enter
          an issuer&rsquo;s Stellar address to trace every solvency proof they
          have published — never any positions, only the verdict and the policy.
        </p>
      </header>

      <HeartbeatForm />
    </div>
  );
}
