'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDate, formatMontant, statutLabel, statutColor, typeDossierLabel } from './format';

interface Dossier {
  id: string;
  numeroDossier: string;
  dateReception: string;
  beneficiaire: string;
  typeDossier: string;
  statut: string;
  montantReclame: number;
  montantValide: number | null;
  montantPaye: number | null;
  societe: { nom: string };
  gestionnaireAccueil: { nom: string } | null;
  gestionnaireTechnique: { nom: string } | null;
  gestionnaireCompta: { nom: string } | null;
}

export default function DossiersView() {
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statutFilter, setStatutFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const limit = 15;

  const fetchDossiers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set('search', search);
      if (statutFilter) params.set('statut', statutFilter);
      const res = await fetch(`/api/dossiers?${params}`);
      const data = await res.json();
      setDossiers(data.dossiers || []);
      setTotal(data.pagination?.total || 0);
    } catch {
      setDossiers([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, statutFilter]);

  useEffect(() => { fetchDossiers(); }, [fetchDossiers]);

  const totalPages = Math.ceil(total / limit);
  const statuts = ['RECU', 'EN_ANALYSE', 'VALIDE', 'REJETE', 'EN_PAIEMENT', 'PAYE'];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <CardTitle className="text-sm font-medium">Tous les dossiers ({total})</CardTitle>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pl-8 w-full sm:w-56"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {statuts.map(s => (
                  <Button
                    key={s}
                    variant={statutFilter === s ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => { setStatutFilter(statutFilter === s ? '' : s); setPage(1); }}
                  >
                    {statutLabel(s)}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <div className="min-w-[900px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 font-medium">N° Dossier</th>
                        <th className="pb-2 font-medium">Date</th>
                        <th className="pb-2 font-medium">Bénéficiaire</th>
                        <th className="pb-2 font-medium">Société</th>
                        <th className="pb-2 font-medium">Type</th>
                        <th className="pb-2 font-medium text-right">Réclamé</th>
                        <th className="pb-2 font-medium text-right">Payé</th>
                        <th className="pb-2 font-medium">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dossiers.length === 0 ? (
                        <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">Aucun dossier trouvé</td></tr>
                      ) : dossiers.map((d) => (
                        <tr key={d.id} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="py-2 font-mono text-xs font-medium">{d.numeroDossier}</td>
                          <td className="py-2 text-xs">{formatDate(d.dateReception)}</td>
                          <td className="py-2 font-medium">{d.beneficiaire}</td>
                          <td className="py-2 text-xs">{d.societe?.nom}</td>
                          <td className="py-2 text-xs">{typeDossierLabel(d.typeDossier)}</td>
                          <td className="py-2 text-right text-xs">{formatMontant(d.montantReclame)}</td>
                          <td className="py-2 text-right text-xs">{d.montantPaye ? formatMontant(d.montantPaye) : '—'}</td>
                          <td className="py-2"><Badge variant="outline" className={statutColor(d.statut)}>{statutLabel(d.statut)}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-xs text-muted-foreground">Page {page} sur {totalPages}</p>
                  <div className="flex gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}