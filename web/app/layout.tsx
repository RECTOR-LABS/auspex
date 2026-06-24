import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Mono, Inter } from "next/font/google";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import "./globals.css";

/* ─── Fonts ──────────────────────────────────────────────────────────────── */

const spaceGrotesk = Space_Grotesk({
  weight: ["500", "700"],
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/* ─── Metadata ───────────────────────────────────────────────────────────── */

export const metadata: Metadata = {
  title: "Auspex — Prove you're solvent, without opening your books",
  description:
    "Zero-knowledge proof of solvency on Stellar. Your book stays on this machine — only the proof is published.",
};

/* ─── Root layout ────────────────────────────────────────────────────────── */

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${ibmPlexMono.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-ink text-bone font-body">
        <Header />
        <main className="flex-1 flex flex-col justify-center">{children}</main>
      </body>
    </html>
  );
}

/* ─── Header ─────────────────────────────────────────────────────────────── */

function Header() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        {/* Wordmark */}
        <Link
          href="/"
          className="flex items-center gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-verdigris focus-visible:outline-offset-2"
          aria-label="Auspex home"
        >
          <ShieldCheck
            size={22}
            strokeWidth={1.75}
            className="text-verdigris"
            aria-hidden="true"
          />
          <span className="font-display text-lg font-[700] tracking-tight text-bone">
            Auspex
          </span>
        </Link>

        {/* Nav links */}
        <nav aria-label="Site navigation">
          <ul className="flex items-center gap-6 list-none m-0 p-0">
            <li>
              <Link
                href="/issuer"
                className="font-body text-sm text-muted transition-colors hover:text-verdigris underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-verdigris focus-visible:outline-offset-2 rounded-sm"
              >
                Issuer
              </Link>
            </li>
            <li>
              <Link
                href="/verify"
                className="font-body text-sm text-muted transition-colors hover:text-verdigris underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-verdigris focus-visible:outline-offset-2 rounded-sm"
              >
                Verify
              </Link>
            </li>
            <li>
              <Link
                href="/heartbeat"
                className="font-body text-sm text-muted transition-colors hover:text-verdigris underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-verdigris focus-visible:outline-offset-2 rounded-sm"
              >
                Heartbeat
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
