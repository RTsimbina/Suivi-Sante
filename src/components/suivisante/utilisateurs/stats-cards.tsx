'use client';

/**
 * Cartes de statistiques rapides de la gestion des utilisateurs (présentateur
 * pur — extrait tel quel de l'ancien monolithe utilisateurs-view.tsx).
 */
import { Users, CheckCircle, XCircle, Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface StatsCardsProps {
  totalUsers: number;
  actifs: number;
  inactifs: number;
  lockedUsers: number;
}

export default function StatsCards({ totalUsers, actifs, inactifs, lockedUsers }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card className="border-0 shadow-sm bg-gradient-to-br from-brand-50 to-brand-100/50 dark:from-brand-950/40 dark:to-brand-900/20">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-brand-600" />
            <div>
              <p className="text-lg font-bold text-brand-700 dark:text-brand-300">{totalUsers}</p>
              <p className="text-[10px] text-brand-600 dark:text-brand-400">Total comptes</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-0 shadow-sm bg-gradient-to-br from-info-50 to-info-100/50 dark:from-info-950/40 dark:to-info-900/20">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-info-600" />
            <div>
              <p className="text-lg font-bold text-info-700 dark:text-info-300">{actifs}</p>
              <p className="text-[10px] text-info-600 dark:text-info-400">Actifs</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-0 shadow-sm bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-900/20">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-amber-600" />
            <div>
              <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{inactifs}</p>
              <p className="text-[10px] text-amber-600 dark:text-amber-400">Inactifs</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-0 shadow-sm bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/40 dark:to-red-900/20">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-red-600" />
            <div>
              <p className="text-lg font-bold text-red-700 dark:text-red-300">{lockedUsers}</p>
              <p className="text-[10px] text-red-600 dark:text-red-400">Verrouilles</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
