'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function PMError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error for debugging
    console.error('PM Dashboard Error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-6 text-center p-8 max-w-md">
        <AlertCircle className="h-16 w-16 text-destructive" />
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">A aparut o eroare</h2>
          <p className="text-muted-foreground">
            Nu s-a putut incarca pagina PM Dashboard. 
            Te rugam sa incerci din nou sau sa revii mai tarziu.
          </p>
          {(error.message || error.digest) && (
            <div className="mt-4 rounded border border-destructive/30 bg-destructive/10 p-3 text-left text-xs text-destructive">
              <p className="font-semibold">Detalii tehnice temporare:</p>
              {error.message && <p className="mt-1 font-mono break-words">{error.message}</p>}
              {error.digest && <p className="mt-1 font-mono break-words">digest: {error.digest}</p>}
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <Link href="/">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Inapoi acasa
            </Button>
          </Link>
          <Button onClick={reset}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Incearca din nou
          </Button>
        </div>
      </div>
    </div>
  );
}
