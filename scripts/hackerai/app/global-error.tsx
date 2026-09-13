"use client";

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
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
        }}
      >
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ opacity: 0.7, marginBottom: 16 }}>
            {error?.digest ? `Reference: ${error.digest}` : "Please try again."}
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid currentColor",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
