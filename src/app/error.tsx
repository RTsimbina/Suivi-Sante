'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCw, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ERROR BOUNDARY]', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="flex justify-center">
          <div className="h-14 w-14 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
            <AlertTriangle className="h-7 w-7 text-red-600 dark:text-red-400" />
          </div>
        </div>
        <h2 className="text-xl font-bold text-foreground">Une erreur est survenue</h2>
        <p className="text-sm text-muted-foreground">
          Cette page n&apos;a pas pu se charger correctement.
        </p>
        {error.message && (
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg p-3 text-left">
            <p className="text-xs font-mono text-red-700 dark:text-red-300 break-all">{error.message}</p>
          </div>
        )}
        <div className="flex gap-3 justify-center">
          <Button
            onClick={reset}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <RotateCw className="h-4 w-4 mr-2" />
            Recharger
          </Button>
          <Button
            variant="outline"
            onClick={() => (window.location.href = '/login')}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Retour connexion
          </Button>
        </div>
      </div>
    </div>
  );
}
