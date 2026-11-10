'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground font-sans">
        <div className="max-w-md space-y-4 border border-border bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold">Application Error</h2>
          <p className="text-xs text-muted-foreground">
            A critical error occurred. Please refresh or try again.
          </p>
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-black text-white text-xs uppercase tracking-wider font-medium"
          >
            Reload Application
          </button>
        </div>
      </body>
    </html>
  );
}
