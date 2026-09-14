'use client';

/**
 * Onglet 1 : Sociétés & Barèmes (table, consultation par société, dialog CRUD).
 * Présentateur pur extrait de technique-view.tsx (Vague 3) — JSX inchangé,
 * l'état est fourni par le hook useSocietesBaremes appelé dans TechniqueView.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Building2,
  Filter,
  Ban,
} from 'lucide-react';

import { formatMontant } from '../format';
import { PRESTATION_COLORS } from '@/lib/prestations';
import { PRESTATIONS, PRESTATION_LABELS } from './types';
import { SocietesBaremesState } from './use-societes-baremes';

export default function SocietesBaremesTab({
  state,
}: {
  state: SocietesBaremesState;
}) {
  const {
    societes,
    societesLoading,
    dialogOpen,
    setDialogOpen,
    editingSociete,
    societeNom,
    setSocieteNom,
    baremesForm,
    savingSociete,
    deletingId,
    openCreateDialog,
    openEditDialog,
    handleSaveSociete,
    handleDeleteSociete,
    updateBaremeField,
    filtreSocieteId,
    filtrePrestation,
    setFiltrePrestation,
    baremesLoading,
    baremesFiltres,
    societeSelectionnee,
    handleFiltreSocieteChange,
  } = state;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base font-semibold">Sociétés &amp; Barèmes</CardTitle>
          <Button onClick={openCreateDialog} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Ajouter une société
          </Button>
        </CardHeader>
        <CardContent>
          {societesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : societes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Aucune société enregistrée.</p>
              <p className="text-xs mt-1">Cliquez sur &quot;Ajouter une société&quot; pour commencer.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead className="text-center">Nb Dossiers</TableHead>
                  <TableHead className="text-center">Nb Barèmes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {societes.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.nom}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{s.nbDossiers ?? 0}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{s.nbBaremes ?? (s.baremes?.length ?? 0)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditDialog(s)}
                          title="Modifier"
                          aria-label="Modifier la société"
                        >
                          <Pencil className="h-4 w-4 text-emerald-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDeleteSociete(s.id)}
                          disabled={deletingId === s.id}
                          title="Supprimer"
                          aria-label="Supprimer la société"
                        >
                          {deletingId === s.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-red-500" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-red-500" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ─── Consultation des barèmes par société ─── */}
      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Filter className="h-4 w-4 text-emerald-600" />
            Barèmes par société
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtre société */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="filtre-societe">Société</Label>
              <Select value={filtreSocieteId || '__all__'} onValueChange={handleFiltreSocieteChange}>
                <SelectTrigger id="filtre-societe">
                  <SelectValue placeholder="Sélectionner une société" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">— Toutes les sociétés —</SelectItem>
                  {societes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nom}
                      <span className="ml-2 text-xs text-muted-foreground">({s.nbBaremes ?? (s.baremes?.length ?? 0)} barèmes)</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filtre type de prestation */}
            <div className="w-full sm:w-64 space-y-1.5">
              <Label htmlFor="filtre-prestation">Type de prestation</Label>
              <Select value={filtrePrestation} onValueChange={setFiltrePrestation} disabled={!filtreSocieteId}>
                <SelectTrigger id="filtre-prestation">
                  <SelectValue placeholder="Tous les types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les types</SelectItem>
                  {PRESTATIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRESTATION_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Contenu : barèmes filtrés */}
          {!filtreSocieteId ? (
            <div className="text-center py-10 text-muted-foreground">
              <Building2 className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Sélectionnez une société ci-dessus pour consulter ses barèmes.</p>
            </div>
          ) : baremesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : baremesFiltres.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Ban className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">
                {filtrePrestation !== 'all'
                  ? `Aucun barème configuré pour le type « ${PRESTATION_LABELS[filtrePrestation] || filtrePrestation} ».`
                  : `Aucun barème configuré pour ${societeSelectionnee?.nom || 'cette société'}.`}
              </p>
              <p className="text-xs mt-1">Modifiez la société pour ajouter des barèmes.</p>
            </div>
          ) : (
            <>
              {societeSelectionnee && filtrePrestation === 'all' && (
                <p className="text-sm text-muted-foreground">
                  {baremesFiltres.length} barème(s) configuré(s) pour <span className="font-medium text-foreground">{societeSelectionnee.nom}</span>
                </p>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type de prestation</TableHead>
                    <TableHead className="text-center">Taux de couverture</TableHead>
                    <TableHead className="text-right">Plafond (Ar)</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {baremesFiltres.map((b) => {
                    const hasValues = b.tauxCouverture > 0 || b.plafond > 0;
                    return (
                      <TableRow key={b.prestation} className={!hasValues ? 'opacity-50' : ''}>
                        <TableCell className="font-medium">
                          <Badge variant={hasValues ? 'default' : 'secondary'} className={hasValues ? (PRESTATION_COLORS[b.prestation] || '') : ''}>
                            {PRESTATION_LABELS[b.prestation] || b.prestation}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={hasValues ? 'font-semibold text-emerald-600' : 'text-muted-foreground'}>
                            {b.tauxCouverture > 0 ? `${b.tauxCouverture}%` : '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={hasValues ? 'font-medium' : 'text-muted-foreground'}>
                            {b.plafond > 0 ? formatMontant(b.plafond) : '—'}
                          </span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {b.description || '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Create / Edit Dialog ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSociete ? 'Modifier la société' : 'Nouvelle société'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="societe-nom">Nom de la société</Label>
              <Input
                id="societe-nom"
                placeholder="Ex: CNAPS, MNS, STM..."
                value={societeNom}
                onChange={(e) => setSocieteNom(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold">Barèmes par type de prestation</Label>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Prestation</TableHead>
                      <TableHead className="text-center w-[130px]">Taux (%)</TableHead>
                      <TableHead className="text-center w-[150px]">Plafond (Ar)</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {baremesForm.map((row, idx) => (
                      <TableRow key={row.prestation}>
                        <TableCell className="font-medium text-sm">
                          {PRESTATION_LABELS[row.prestation]}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            className="h-8 text-center"
                            value={row.tauxCouverture || ''}
                            placeholder="0"
                            onChange={(e) =>
                              updateBaremeField(
                                idx,
                                'tauxCouverture',
                                Math.min(100, Math.max(0, Number(e.target.value) || 0))
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            className="h-8 text-center"
                            value={row.plafond || ''}
                            placeholder="0"
                            onChange={(e) =>
                              updateBaremeField(
                                idx,
                                'plafond',
                                Math.max(0, Number(e.target.value) || 0)
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8"
                            value={row.description}
                            placeholder="Optionnel"
                            onChange={(e) =>
                              updateBaremeField(idx, 'description', e.target.value)
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSaveSociete} disabled={savingSociete} className="gap-1.5">
              {savingSociete ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {savingSociete ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
