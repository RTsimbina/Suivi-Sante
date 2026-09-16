'use client';

/**
 * Colonne droite du layout maître-détail : détail de la société sélectionnée
 * (en-tête, filtres, tableau des liens prestataires, légende) ou état vide.
 * Présentateur pur extrait de prestataires-view.tsx (Vague 3) — JSX inchangé.
 */

import {
  Building2, Users, Search, Unlink, Filter, Stethoscope, Phone,
  ToggleLeft, ToggleRight, CheckCircle2, Ban, AlertTriangle, UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { SocieteItem, LienPS, StatutFilter, TYPE_LABELS, TYPE_COLORS } from './types';

export default function SocietePrestataires({
  selectedSociete,
  selectedLiens,
  filteredLiens,
  canEdit,
  searchPrestataire,
  onSearchPrestataireChange,
  filterType,
  onFilterTypeChange,
  filterStatut,
  onFilterStatutChange,
  deleteConfirm,
  onDeleteConfirm,
  onCancelDelete,
  onToggleActif,
  onUnlink,
  onOpenLinkDialog,
}: {
  selectedSociete: SocieteItem | undefined;
  selectedLiens: LienPS[];
  filteredLiens: LienPS[];
  canEdit: boolean;
  searchPrestataire: string;
  onSearchPrestataireChange: (value: string) => void;
  filterType: string;
  onFilterTypeChange: (value: string) => void;
  filterStatut: StatutFilter;
  onFilterStatutChange: (value: StatutFilter) => void;
  deleteConfirm: string | null;
  onDeleteConfirm: (lienId: string) => void;
  onCancelDelete: () => void;
  onToggleActif: (lienId: string, newActif: boolean) => void;
  onUnlink: (lienId: string) => void;
  onOpenLinkDialog: () => void;
}) {
  return (
    <div className="lg:col-span-8 xl:col-span-9">
      {selectedSociete ? (
        <Card>
          <CardContent className="p-4">
            {/* En-tête société */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold">{selectedSociete.nom}</h3>
                    <Badge className="bg-blue-100 text-blue-700 dark:text-blue-300 text-[10px] border-blue-200 dark:border-blue-800 hover:bg-blue-100">
                      <Users className="h-2.5 w-2.5 mr-0.5" />{selectedLiens.length} prestataire{selectedLiens.length !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="text-emerald-600 font-medium">{selectedLiens.filter(l => l.actif).length} actif(s)</span>
                    <span>·</span>
                    <span className="text-red-500 font-medium">{selectedLiens.filter(l => !l.actif).length} inactif(s)</span>
                    {selectedLiens.length > 0 && (
                      <>
                        <span>·</span>
                        <span className="font-medium">{selectedLiens.reduce((s, l) => s + (l.nbDossiers ?? 0), 0)} dossier(s)</span>
                        <span>·</span>
                        <span className="font-medium">{selectedLiens.reduce((s, l) => s + (l.montantTotal ?? 0), 0).toLocaleString('fr-MG')} Ar réclamés</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              {canEdit && (
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs"
                  onClick={onOpenLinkDialog}
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1" /> Ajouter un prestataire
                </Button>
              )}
            </div>

            {/* Filtres prestataires */}
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Rechercher un prestataire..."
                  value={searchPrestataire}
                  onChange={e => onSearchPrestataireChange(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
              <select
                value={filterType}
                onChange={e => onFilterTypeChange(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-3 text-xs"
              >
                <option value="">Tous les types</option>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <select
                value={filterStatut}
                onChange={e => onFilterStatutChange(e.target.value as StatutFilter)}
                className="h-8 rounded-md border border-input bg-background px-3 text-xs"
              >
                <option value="">Tous les statuts</option>
                <option value="actif">Actif seulement</option>
                <option value="inactif">Inactif seulement</option>
              </select>
            </div>

            {/* Liste des prestataires */}
            {selectedLiens.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground rounded-lg border border-dashed">
                <Unlink className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-xs">Aucun prestataire lié à cette société</p>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 h-7 text-xs"
                    onClick={onOpenLinkDialog}
                  >
                    <UserPlus className="h-3 w-3 mr-1" /> Lier un prestataire
                  </Button>
                )}
              </div>
            ) : filteredLiens.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground rounded-lg border border-dashed">
                <Filter className="h-7 w-7 mx-auto mb-2 opacity-20" />
                <p className="text-xs">Aucun prestataire ne correspond à vos filtres</p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr className="text-left">
                      <th className="py-2.5 px-3 font-medium text-muted-foreground text-xs">Prestataire</th>
                      <th className="py-2.5 px-3 font-medium text-muted-foreground text-xs">Type</th>
                      <th className="py-2.5 px-3 font-medium text-muted-foreground text-xs text-center">Dossiers</th>
                      <th className="py-2.5 px-3 font-medium text-muted-foreground text-xs text-right">Montant réclamé</th>
                      <th className="py-2.5 px-3 font-medium text-muted-foreground text-xs text-center">Statut</th>
                      <th className="py-2.5 px-3 font-medium text-muted-foreground text-xs text-center">Action</th>
                      {canEdit && (
                        <th className="py-2.5 px-3 font-medium text-muted-foreground text-xs text-right">Retirer</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLiens.map(l => (
                      <tr
                        key={l.id}
                        className={cn(
                          'border-b last:border-0 transition-colors',
                          !l.actif && 'bg-red-50/40 dark:bg-red-950/10'
                        )}
                      >
                        {/* Nom + contact */}
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5">
                            <div className={cn(
                              'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
                              l.actif ? 'bg-emerald-100 dark:bg-emerald-950/50' : 'bg-muted'
                            )}>
                              <Stethoscope className={cn(
                                'h-3.5 w-3.5',
                                l.actif ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                              )} />
                            </div>
                            <div className="min-w-0">
                              <p className={cn(
                                'font-medium text-xs truncate',
                                !l.actif && 'text-muted-foreground'
                              )}>
                                {l.prestataire.nom}
                              </p>
                              {l.prestataire.telephone && (
                                <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <Phone className="h-2.5 w-2.5" />{l.prestataire.telephone}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Type */}
                        <td className="py-2.5 px-3">
                          <Badge variant="outline" className={cn('text-[10px]', TYPE_COLORS[l.prestataire.type])}>
                            {TYPE_LABELS[l.prestataire.type] || l.prestataire.type}
                          </Badge>
                        </td>

                        {/* Dossiers */}
                        <td className="py-2.5 px-3 text-center">
                          <span className="text-xs font-medium">{(l.nbDossiers ?? 0) > 0 ? l.nbDossiers : '—'}</span>
                        </td>

                        {/* Montant réclamé */}
                        <td className="py-2.5 px-3 text-right">
                          <span className="text-xs font-medium">
                            {(l.montantTotal ?? 0) > 0 ? (l.montantTotal ?? 0).toLocaleString('fr-MG') + ' Ar' : '—'}
                          </span>
                        </td>

                        {/* Statut actif/inactif */}
                        <td className="py-2.5 px-3 text-center">
                          {canEdit ? (
                            <button
                              onClick={() => onToggleActif(l.id, !l.actif)}
                              className={cn(
                                'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer',
                                l.actif
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-950/60'
                                  : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-950/60'
                              )}
                            >
                              {l.actif ? (
                                <><ToggleRight className="h-3.5 w-3.5" /> Actif</>
                              ) : (
                                <><ToggleLeft className="h-3.5 w-3.5" /> Inactif</>
                              )}
                            </button>
                          ) : (
                            l.actif ? (
                              <Badge className="bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-[10px] hover:bg-emerald-100">
                                <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Actif
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-[10px]">
                                <Ban className="h-2.5 w-2.5 mr-0.5" /> Inactif
                              </Badge>
                            )
                          )}
                        </td>

                        {/* Indication action */}
                        <td className="py-2.5 px-3 text-center">
                          {!l.actif ? (
                            <span className="text-[10px] text-red-500 font-medium flex items-center justify-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Actes refusés
                            </span>
                          ) : (
                            <span className="text-[10px] text-emerald-600 flex items-center justify-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Autorisé
                            </span>
                          )}
                        </td>

                        {/* Bouton retirer */}
                        {canEdit && (
                          <td className="py-2.5 px-3 text-right">
                            {deleteConfirm === l.id ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => onUnlink(l.id)}
                                  className="px-2 py-1 text-[10px] rounded bg-red-600 text-white hover:bg-red-700 cursor-pointer"
                                >
                                  Confirmer
                                </button>
                                <button
                                  onClick={onCancelDelete}
                                  className="px-2 py-1 text-[10px] rounded bg-muted hover:bg-muted/80 cursor-pointer"
                                >
                                  Annuler
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => onDeleteConfirm(l.id)}
                                className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                              >
                                <Unlink className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Légende */}
            {selectedLiens.length > 0 && (
              <div className="mt-3 flex items-center gap-4 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Actif = autorisé
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-red-500" /> Inactif = actes refusés automatiquement
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="text-center py-16 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">Sélectionnez une société</p>
            <p className="text-xs mt-1">Cliquez sur une société pour voir ses prestataires et gérer leur statut</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
