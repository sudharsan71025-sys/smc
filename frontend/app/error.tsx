'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App Error Boundary caught error:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-4 border border-border bg-card p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
        <p className="text-xs text-secondary">
          {error?.message || 'An unexpected error occurred while rendering this page.'}
        </p>
        <div className="pt-2 flex justify-center space-x-3">
          <Button variant="gold" size="sm" onClick={() => reset()} className="text-xs uppercase">
            Try again
          </Button>
          <Button variant="outline" size="sm" onClick={() => (window.location.href = '/')} className="text-xs">
            Return Home
          </Button>
        </div>
      </div>
    </div>
  );
}

