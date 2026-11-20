'use client';

/**
 * Présentateur des 5 cartes d'alerte de la vue Intelligence IA (refactoring
 * P2 — extrait du monolithe ia-view.tsx) : retards, anomalies, risque de
 * retard, et deux cartes cliquables qui déplient leur section de détail.
 */
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertTriangle, ShieldAlert, TrendingUp, FileX, AlertOctagon, ChevronDown,
} from 'lucide-react';
import { getRisqueTextColor, getRisqueLabel } from './types';
import type { IaData } from './types';

interface IaCartesAlertesProps {
  data: IaData;
  expandedCards: Set<string>;
  onToggleCard: (key: string) => void;
}

export default function IaCartesAlertes({ data, expandedCards, onToggleCard }: IaCartesAlertesProps) {
  const { retards, anomalies, piecesManquantes, incoherences, previsions } = data;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* Carte 1 : Dossiers en retard */}
      <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/50">
              <AlertTriangle className="size-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-400">
                Dossiers en retard
              </p>
              <p className="text-2xl font-bold text-red-800 dark:text-red-300">
                {retards.length}
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs text-red-600/80 dark:text-red-500/80">
            Dossiers nécessitant une attention immédiate
          </p>
        </CardContent>
      </Card>

      {/* Carte 2 : Anomalies détectées */}
      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50">
              <ShieldAlert className="size-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Anomalies détectées
              </p>
              <p className="text-2xl font-bold text-amber-800 dark:text-amber-300">
                {anomalies.length}
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs text-amber-600/80 dark:text-amber-500/80">
            Écarts et irrégularités identifiés par l&apos;IA
          </p>
        </CardContent>
      </Card>

      {/* Carte 3 : Risque de retard — ORANGE VOLONTAIREMENT CONSERVÉ :
          la couleur orange (tendance / projection de risque, TrendingUp) a
          une signification DISTINCTE de l'amber des avertissements (cartes
          2 et 4) — ne pas uniformiser ces deux familles. */}
      <Card className="border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/40">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/50">
              <TrendingUp className="size-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-orange-700 dark:text-orange-400">
                Risque de retard
              </p>
              <p className={`text-2xl font-bold ${getRisqueTextColor(previsions.risqueRetard)}`}>
                {previsions.risqueRetard}%
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs text-orange-600/80 dark:text-orange-500/80">
            Niveau de risque : {getRisqueLabel(previsions.risqueRetard)}
          </p>
        </CardContent>
      </Card>

      {/* Carte 4 : Pièces justificatives manquantes (amber, cliquable) */}
      <Card
        className="border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => onToggleCard('pieces')}
      >
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50">
              <FileX className="size-5 text-amber-700 dark:text-amber-300" />
            </div>
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
                Pièces manquantes
              </p>
              <p className="text-2xl font-bold text-amber-900 dark:text-amber-300">
                {piecesManquantes.length}
              </p>
            </div>
            <ChevronDown className={`ml-auto size-4 text-amber-500 transition-transform ${expandedCards.has('pieces') ? 'rotate-180' : ''}`} />
          </div>
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300/80">
            Dossiers sans justificatifs depuis &gt;3 jours
          </p>
        </CardContent>
      </Card>

      {/* Carte 5 : Incohérences de traitement (red, cliquable) */}
      <Card
        className="border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => onToggleCard('incoherences')}
      >
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/50">
              <AlertOctagon className="size-5 text-red-700 dark:text-red-300" />
            </div>
            <div>
              <p className="text-sm font-medium text-red-800 dark:text-red-400">
                Incohérences
              </p>
              <p className="text-2xl font-bold text-red-900 dark:text-red-300">
                {incoherences.length}
              </p>
            </div>
            <ChevronDown className={`ml-auto size-4 text-red-500 transition-transform ${expandedCards.has('incoherences') ? 'rotate-180' : ''}`} />
          </div>
          <p className="mt-2 text-xs text-red-700 dark:text-red-300/80">
            Anomalies de traitement des dossiers
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
