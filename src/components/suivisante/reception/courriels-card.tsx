'use client';

/**
 * Carte « Courriels » : en-tête avec badge de total et bouton de création,
 * filtres (recherche, type, statut), tableau des courriels avec badges,
 * montants et dates formatés, état vide et pagination partagée. Présentateur
 * pur — extraits tels quels de l'ancien monolithe reception-view.tsx.
 */
import {
  Mail, Plus, Search, Filter, Eye, Receipt, ClipboardList,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatMontantCourt, formatDate } from '../format';
import { SharedPagination, type PaginationState } from '@/components/ui/shared-pagination';
import type { CourrielItem } from './types';
import { TYPE_LABELS, TYPE_COLORS, COURRIEL_STATUT_COLORS, COURRIEL_STATUT_LABELS } from './types';

interface CourrielsCardProps {
  courriels: CourrielItem[];
  pagination: PaginationState;
  loading: boolean;
  filterType: string;
  onFilterTypeChange: (v: string) => void;
  filterStatut: string;
  onFilterStatutChange: (v: string) => void;
  searchQuery: string;
  onSearchQueryChange: (v: string) => void;
  onOpenDetail: (c: CourrielItem) => void;
  onNouveau: () => void;
  onPageChange: (page: number) => void;
}

export default function CourrielsCard({
  courriels, pagination, loading,
  filterType, onFilterTypeChange, filterStatut, onFilterStatutChange,
  searchQuery, onSearchQueryChange,
  onOpenDetail, onNouveau, onPageChange,
}: CourrielsCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-sky-600" />
            <CardTitle className="text-sm font-medium">Courriels</CardTitle>
            {pagination.total > 0 && (
              <Badge variant="outline" className="text-[10px] border-sky-200 dark:border-sky-800 text-sky-600 bg-sky-50 dark:bg-sky-950/40">
                {pagination.total}
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-xs h-8"
            onClick={onNouveau}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Nouveau courriel
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* ─── Filters ──────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par expéditeur, objet, bénéficiaire..."
              className="pl-9 h-9 text-sm"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Select value={filterType} onValueChange={onFilterTypeChange}>
              <SelectTrigger className="h-9 w-auto min-w-[160px] text-sm">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TOUS">Tous les types</SelectItem>
                <SelectItem value="FACTURE_PRESTATAIRE">Facture prestataire</SelectItem>
                <SelectItem value="DOSSIER_REMBOURSEMENT">Dossier remboursement</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatut} onValueChange={onFilterStatutChange}>
              <SelectTrigger className="h-9 w-auto min-w-[130px] text-sm">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TOUS">Tous les statuts</SelectItem>
                <SelectItem value="RECU">Reçu</SelectItem>
                <SelectItem value="TRAITE">Traité</SelectItem>
                <SelectItem value="REJETE">Rejeté</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ─── Table ────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : courriels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Mail className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">Aucun courriel trouvé</p>
            <p className="text-xs mt-1">Commencez par enregistrer un nouveau courriel.</p>
          </div>
        ) : (
          <>
            <div className="rounded-lg border overflow-hidden">
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="text-xs font-semibold h-9">Type</TableHead>
                      <TableHead className="text-xs font-semibold h-9">Expéditeur</TableHead>
                      <TableHead className="text-xs font-semibold h-9">Objet</TableHead>
                      <TableHead className="text-xs font-semibold h-9 hidden md:table-cell">Société</TableHead>
                      <TableHead className="text-xs font-semibold h-9 hidden lg:table-cell">Montant</TableHead>
                      <TableHead className="text-xs font-semibold h-9">Date</TableHead>
                      <TableHead className="text-xs font-semibold h-9">Statut</TableHead>
                      <TableHead className="text-xs font-semibold h-9 w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {courriels.map((c) => (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => onOpenDetail(c)}
                      >
                        <TableCell className="py-2.5">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${TYPE_COLORS[c.type] || ''}`}
                          >
                            {c.type === 'FACTURE_PRESTATAIRE' ? (
                              <Receipt className="h-3 w-3 mr-1" />
                            ) : (
                              <ClipboardList className="h-3 w-3 mr-1" />
                            )}
                            {TYPE_LABELS[c.type] || c.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2.5 text-sm font-medium max-w-[150px] truncate">
                          {c.expediteur}
                        </TableCell>
                        <TableCell className="py-2.5 text-sm text-muted-foreground max-w-[200px] truncate">
                          {c.objet}
                        </TableCell>
                        <TableCell className="py-2.5 text-sm hidden md:table-cell">
                          {c.societe?.nom || '—'}
                        </TableCell>
                        <TableCell className="py-2.5 text-sm font-medium hidden lg:table-cell">
                          {c.montant ? formatMontantCourt(c.montant) : '—'}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(c.dateCourriel)}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${COURRIEL_STATUT_COLORS[c.statut] || ''}`}
                          >
                            {COURRIEL_STATUT_LABELS[c.statut] || c.statut}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onOpenDetail(c); }}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <SharedPagination pagination={pagination} onPageChange={onPageChange} label="courriel" />
          </>
        )}
      </CardContent>
    </Card>
  );
}
