'use client';

/**
 * Bannières de la vue Prestataires : erreur de chargement, incitation à la
 * synchronisation manuelle, aide sur le statut par société.
 * Présentateur pur extrait de prestataires-view.tsx (Vague 3) — JSX inchangé,
 * la condition d'affichage de la bannière sync est fournie via `show`.
 */

import { AlertTriangle, Link2, Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Erreur de chargement des liens (migration manquante, réseau...). */
export function FetchErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40">
      <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
      <div>
        <p className="text-xs font-medium text-red-700 dark:text-red-300">Erreur de chargement</p>
        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{message}</p>
        <p className="text-[10px] text-red-500 dark:text-red-500 mt-1">La table PrestataireSociete doit être créée en base de données. Vérifiez que la migration a été appliquée (npm run db:migrate:deploy).</p>
      </div>
    </div>
  );
}

/** Encart proposant la synchronisation manuelle depuis les dossiers. */
export function SyncNeededBanner({
  show,
  message,
  result,
  syncing,
  onSync,
}: {
  show: boolean;
  message: string;
  result: string;
  syncing: boolean;
  onSync: () => void;
}) {
  if (!show) return null;
  return (
    <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center shrink-0">
          <Link2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Aucun lien prestataire-société</p>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
            {message || 'Les prestataires doivent être liés aux sociétés pour gérer leur statut (actif/inactif). '}
            Cliquez ci-dessous pour créer automatiquement les liens à partir des dossiers existants.
          </p>
          {result && (
            <p className="text-xs mt-2 font-medium text-emerald-700 dark:text-emerald-300">{result}</p>
          )}
          <div className="mt-3">
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs"
              onClick={onSync}
              disabled={syncing}
            >
              {syncing && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {syncing ? 'Synchronisation...' : 'Synchroniser manuellement depuis les dossiers'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Aide contextuelle sur la sémantique Actif / Inactif par société. */
export function InfoBanner() {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40">
      <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
      <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
        <span className="font-semibold">Statut par société :</span>{' '}
        <span className="font-medium text-emerald-700 dark:text-emerald-300">Actif</span> = le prestataire est autorisé pour cette société.{' '}
        <span className="font-medium text-red-700 dark:text-red-300">Inactif</span> = les actes de ce prestataire seront{' '}
        <span className="font-semibold">refusés automatiquement</span> pour cette société.
      </p>
    </div>
  );
}
