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
      <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/40 dark:to-emerald-900/20">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-emerald-600" />
            <div>
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{totalUsers}</p>
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400">Total comptes</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/40 dark:to-blue-900/20">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-blue-600" />
            <div>
              <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{actifs}</p>
              <p className="text-[10px] text-blue-600 dark:text-blue-400">Actifs</p>
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
