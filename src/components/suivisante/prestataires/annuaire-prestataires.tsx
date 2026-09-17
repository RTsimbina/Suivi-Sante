'use client';

/**
 * Liste centralisée de TOUS les prestataires enregistrés dans la plateforme
 * (rubrique GESTION → Prestataires, onglet « Tous les prestataires »).
 *
 * Permet notamment :
 *  - la recherche d'un prestataire (nom, e-mail, téléphone, NIF, Num STAT) ;
 *  - le filtrage par type / statut ;
 *  - l'accès à la fiche détaillée de chaque prestataire ;
 *  - l'identification rapide de son statut (badge Actif / Inactif) ;
 *  - la consultation de son rattachement aux sociétés clientes.
 *
 * Le filtrage est client-side (cohérent avec le reste de la vue) sur la liste
 * complète déjà chargée ; les actions « Fiche » et « Modifier » délèguent au
 * hook parent — la modification n'est proposée qu'aux profils autorisés
 * (Administrateur / Service Technique), et l'autorisation est de toute façon
 * tranchée côté serveur.
 */

import { useMemo, useState } from 'react';
import { Eye, Pencil, Search, Stethoscope, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

import { PrestataireItem, TYPE_LABELS, TYPE_COLORS, STATUT_CONVENTIONNEL_LABELS } from './types';

export default function AnnuairePrestataires({
  prestataires,
  societesParPrestataire,
  canEdit,
  onOuvrirFiche,
  onOuvrirEdition,
}: {
  prestataires: PrestataireItem[];
  societesParPrestataire: Map<string, { societe: { id: string; nom: string }; actif: boolean }[]>;
  canEdit: boolean;
  onOuvrirFiche: (id: string) => void;
  onOuvrirEdition: (p: PrestataireItem) => void;
}) {
  // ─── Filtres locaux ────────────────────────────────────────────────────────
  const [recherche, setRecherche] = useState('');
  const [filtreType, setFiltreType] = useState('');
  const [filtreStatut, setFiltreStatut] = useState<'' | 'actif' | 'inactif'>('');

  const prestatairesFiltres = useMemo(() => {
    let result = prestataires;
    if (recherche.trim()) {
      const q = recherche.trim().toLowerCase();
      result = result.filter(p =>
        p.nom.toLowerCase().includes(q) ||
        (p.email && p.email.toLowerCase().includes(q)) ||
        (p.telephone && p.telephone.includes(q)) ||
        (p.nif && p.nif.toLowerCase().includes(q)) ||
        (p.stat && p.stat.toLowerCase().includes(q)) ||
        (p.statutJuridique && p.statutJuridique.toLowerCase().includes(q))
      );
    }
    if (filtreType) result = result.filter(p => p.type === filtreType);
    if (filtreStatut) result = result.filter(p => (filtreStatut === 'actif' ? p.actif : !p.actif));
    return result;
  }, [prestataires, recherche, filtreType, filtreStatut]);

  return (
    <div className="space-y-3">
      {/* ─── Barre de recherche + filtres ─── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            placeholder="Rechercher par nom, e-mail, NIF, Num STAT..."
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            className="h-9 text-sm pl-9"
          />
        </div>
        <div className="flex gap-2">
          <select
            aria-label="Filtrer par type de prestataire"
            className="h-9 rounded-md border border-input bg-background px-3 text-xs"
            value={filtreType}
            onChange={e => setFiltreType(e.target.value)}
          >
            <option value="">Tous les types</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            aria-label="Filtrer par statut"
            className="h-9 rounded-md border border-input bg-background px-3 text-xs"
            value={filtreStatut}
            onChange={e => setFiltreStatut(e.target.value as '' | 'actif' | 'inactif')}
          >
            <option value="">Tous les statuts</option>
            <option value="actif">Actifs</option>
            <option value="inactif">Inactifs</option>
          </select>
        </div>
      </div>

      {/* ─── Tableau des prestataires ─── */}
      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Prestataire</th>
                <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Type</th>
                <th className="text-left py-2.5 px-3 font-medium text-muted-foreground hidden md:table-cell">Téléphone</th>
                <th className="text-left py-2.5 px-3 font-medium text-muted-foreground hidden lg:table-cell">NIF</th>
                <th className="text-left py-2.5 px-3 font-medium text-muted-foreground hidden xl:table-cell">Sociétés rattachées</th>
                <th className="text-left py-2.5 px-3 font-medium text-muted-foreground hidden lg:table-cell">Dossiers</th>
                <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Statut</th>
                <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {prestatairesFiltres.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-muted-foreground text-xs">
                    {prestataires.length === 0
                      ? 'Aucun prestataire enregistré.'
                      : 'Aucun prestataire ne correspond à la recherche.'}
                  </td>
                </tr>
              ) : (
                prestatairesFiltres.map(p => {
                  const rattachements = societesParPrestataire.get(p.id) ?? [];
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-muted/40 cursor-pointer transition-colors"
                      onClick={() => onOuvrirFiche(p.id)}
                      title={`Ouvrir la fiche de ${p.nom}`}
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <Stethoscope className="h-4 w-4 text-emerald-600 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium truncate max-w-[220px]">{p.nom}</p>
                            {p.email && (
                              <p className="text-[11px] text-muted-foreground truncate max-w-[220px]">{p.email}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant="outline" className={`text-[10px] ${TYPE_COLORS[p.type] ?? TYPE_COLORS.AUTRE}`}>
                          {TYPE_LABELS[p.type] ?? p.type}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-xs hidden md:table-cell">{p.telephone || '—'}</td>
                      <td className="py-2.5 px-3 text-xs hidden lg:table-cell">{p.nif || '—'}</td>
                      <td className="py-2.5 px-3 hidden xl:table-cell">
                        {rattachements.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Aucune</span>
                        ) : (
                          <div className="flex items-center gap-1 flex-wrap">
                            {rattachements.slice(0, 2).map(r => (
                              <Badge
                                key={r.societe.id}
                                variant="outline"
                                className="text-[10px] max-w-[140px] truncate"
                                title={`${r.societe.nom} — convention ${r.actif ? 'active' : 'suspendue'}`}
                              >
                                <Building2 className="h-2.5 w-2.5 mr-1 shrink-0" />
                                <span className="truncate">{r.societe.nom}</span>
                              </Badge>
                            ))}
                            {rattachements.length > 2 && (
                              <span className="text-[10px] text-muted-foreground">+{rattachements.length - 2}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-xs hidden lg:table-cell">{p.nbDossiers ?? 0}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col gap-1 items-start">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${p.actif ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${p.actif ? 'bg-emerald-500' : 'bg-red-500'}`} />
                            {p.actif ? 'Actif' : 'Inactif'}
                          </span>
                          {p.statut && STATUT_CONVENTIONNEL_LABELS[p.statut] && (
                            <span className="text-[10px] text-muted-foreground">
                              {STATUT_CONVENTIONNEL_LABELS[p.statut]}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            title="Voir la fiche détaillée"
                            aria-label={`Voir la fiche de ${p.nom}`}
                            onClick={() => onOuvrirFiche(p.id)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              title="Modifier le prestataire"
                              aria-label={`Modifier ${p.nom}`}
                              onClick={() => onOuvrirEdition(p)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {prestatairesFiltres.length} prestataire(s) affiché(s) sur {prestataires.length}.
      </p>
    </div>
  );
}
