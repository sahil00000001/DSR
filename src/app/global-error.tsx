"use client";

import { BRAND } from "@/lib/constants/brand";

/**
 * Last-resort boundary: catches failures in the root layout itself, where the
 * normal error page (and the design system with it) can't be relied on.
 *
 * It therefore renders its own `<html>`/`<body>` and uses inline styles only —
 * a stylesheet that failed to load is one of the things that lands you here.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#fafbfc",
          color: "#0f1115",
          fontFamily:
            "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
        }}
      >
        <div style={{ maxWidth: "26rem", textAlign: "center" }}>
          <div
            style={{
              width: 44,
              height: 44,
              margin: "0 auto 18px",
              borderRadius: 12,
              background: "#4f46e5",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontSize: 20,
              fontWeight: 700,
            }}
            aria-hidden="true"
          >
            C
          </div>

          <h1 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
            {BRAND.name} couldn&apos;t start
          </h1>
          <p style={{ margin: "0 0 20px", fontSize: 14, lineHeight: 1.6, color: "#5b6472" }}>
            An unexpected error stopped the application from loading. Reloading usually clears it.
          </p>

          {error.digest ? (
            <p style={{ margin: "0 0 20px", fontSize: 11.5, color: "#8a91a0", fontFamily: "monospace" }}>
              Reference: {error.digest}
            </p>
          ) : null}

          <button
            type="button"
            onClick={reset}
            style={{
              padding: "9px 18px",
              borderRadius: 8,
              border: "none",
              background: "#4f46e5",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload {BRAND.name}
          </button>
        </div>
      </body>
    </html>
  );
}
