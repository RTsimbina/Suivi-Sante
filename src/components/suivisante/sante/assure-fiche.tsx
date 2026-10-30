'use client';

/**
 * Fiche assuré (identité, statut) + société cliente avec jauge du plafond
 * annuel global et seuils 70 % / 100 % (présentateur pur — extrait tel quel
 * de l'ancien monolithe sante-view.tsx).
 */
import { User, Building2, CheckCircle2, Ban } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { formatAr, formatPercent, getBarColor, getBarDarkColor, type VerificationResult } from './types';

export default function AssureFiche({ result }: { result: VerificationResult }) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <User className="h-4 w-4" /> Informations Assuré
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">{result.assure.nom} {result.assure.prenom}</span>
            <Badge variant={result.assure.actif ? 'outline' : 'destructive'} className="text-xs">
              {result.assure.actif ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <Ban className="h-3 w-3 mr-1" />}
              {result.assure.actif ? 'Actif' : 'Inactif'}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <p>N° SS : <span className="text-foreground font-medium">{result.assure.nSS || '—'}</span></p>
            <p>Sexe : <span className="text-foreground font-medium">{result.assure.sexe || '—'}</span></p>
            <p>Tél : <span className="text-foreground font-medium">{result.assure.telephone || '—'}</span></p>
            <p>Email : <span className="text-foreground font-medium truncate">{result.assure.email || '—'}</span></p>
            <p className="col-span-2">Adresse : <span className="text-foreground font-medium">{result.assure.adresse || '—'}</span></p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Société Cliente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm font-semibold">{result.societe.nom}</p>
          <Separator />
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Plafond annuel global</span>
              <span className="font-medium">{formatAr(result.plafonds.annuelGlobal)}</span>
            </div>
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', getBarColor(result.plafonds.tauxConsommationGlobal), getBarDarkColor(result.plafonds.tauxConsommationGlobal))}
                style={{ width: `${Math.min(result.plafonds.tauxConsommationGlobal, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>Consommé : {formatAr(result.plafonds.totalConsomme)} ({formatPercent(result.plafonds.tauxConsommationGlobal)})</span>
              <span>Reliquat : {formatAr(result.plafonds.reliquatGlobal)}</span>
            </div>
            {/* Seuils 70% et 100% */}
            <div className="flex gap-4 mt-1.5">
              <span className="text-[10px] text-amber-600 dark:text-amber-400">Seuil 70% : {formatAr(result.plafonds.seuil70)}</span>
              <span className="text-[10px] text-red-600 dark:text-red-400">Seuil 100% : {formatAr(result.plafonds.seuil100)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
