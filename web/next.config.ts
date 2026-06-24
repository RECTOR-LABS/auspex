import type { NextConfig } from "next";

/* ─── Security headers ───────────────────────────────────────────────────────
 * Applied to every route. The issuer page accepts a private balance sheet, so
 * framing is denied (clickjacking) and every resource origin is constrained.
 *
 * CSP notes:
 *  - script-src needs 'unsafe-inline' for Next's hydration bootstrap (this app
 *    has no nonce pipeline) and, in development only, 'unsafe-eval' for Turbopack
 *    Fast Refresh; production drops 'unsafe-eval'. A nonce-based policy is the
 *    stricter future upgrade.
 *  - style-src needs 'unsafe-inline' for Tailwind/Next injected styles and the
 *    design system's inline style attributes.
 *  - connect-src allows same-origin (server actions) plus the Soroban testnet
 *    RPC the verify flow reads.
 *  - fonts are self-hosted by next/font, so font-src 'self' is sufficient.
 * ─────────────────────────────────────────────────────────────────────────── */

const isDev = process.env.NODE_ENV === "development";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://soroban-testnet.stellar.org",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
