'use client';

/**
 * Cartes de statistiques du registre (présentateur pur — extrait tel quel de
 * l'ancien monolithe assures-view.tsx ; les compteurs proviennent du comptage
 * serveur, le nombre de sociétés couvertes de la page courante).
 */
import { Users, UserCheck, Heart, Baby, Building2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface StatsCardsProps {
  nbPrincipaux: number;
  nbConjoints: number;
  nbEnfants: number;
  societesCouvertes: number;
}

export default function StatsCards({ nbPrincipaux, nbConjoints, nbEnfants, societesCouvertes }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase font-medium">Total bénéficiaires</p>
              <p className="text-2xl font-bold">{nbPrincipaux + nbConjoints + nbEnfants}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center">
              <Users className="h-5 w-5 text-brand-600" />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase font-medium">Assurés principaux</p>
              <p className="text-2xl font-bold text-brand-600">{nbPrincipaux}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center">
              <UserCheck className="h-5 w-5 text-brand-600" />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
        <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase font-medium">Conjoints</p>
              <p className="text-2xl font-bold text-famille-600">{nbConjoints}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-famille-50 dark:bg-famille-950/40 flex items-center justify-center">
              <Heart className="h-5 w-5 text-famille-600" />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase font-medium">Enfants</p>
              <p className="text-2xl font-bold text-info-600">{nbEnfants}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-info-50 dark:bg-info-950/40 flex items-center justify-center">
              <Baby className="h-5 w-5 text-info-600" />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase font-medium">Sociétés couvertes</p>
              <p className="text-2xl font-bold">{societesCouvertes}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-info-50 dark:bg-info-950/40 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-info-600" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
