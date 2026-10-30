'use client';

/**
 * Registre des bénéficiaires : tableau des familles (principal + ayants droit
 * expandables), confirmation de suppression inline en deux temps, état vide
 * et pagination partagée. Extrait tel quel de l'ancien monolithe
 * assures-view.tsx, y compris le sous-composant AssureFamilyRow.
 */
import {
  Pencil, Trash2, Loader2, X, FileText, ChevronRight, ChevronDown, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { SharedPagination, type PaginationState } from '@/components/ui/shared-pagination';
import { TYPE_BENEF_LABELS, TYPE_BENEF_COLORS, formatDate, formatAge, type Assure } from './types';

interface FamilleRow {
  principal: Assure;
  ayantsDroit: Assure[];
}

interface FamillesTableProps {
  familles: FamilleRow[];
  loading: boolean;
  expandedFamilies: Set<string>;
  toggleFamily: (id: string) => void;
  canEdit: boolean;
  deleteConfirm: string | null;
  setDeleteConfirm: (id: string | null) => void;
  saving: boolean;
  supprimer: (id: string) => void;
  openEdit: (a: Assure) => void;
  pagination: PaginationState;
  changerPage: (page: number) => void;
  totalBeneficiaires: number;
}

export default function FamillesTable({
  familles, loading, expandedFamilies, toggleFamily, canEdit,
  deleteConfirm, setDeleteConfirm, saving, supprimer, openEdit,
  pagination, changerPage, totalBeneficiaires,
}: FamillesTableProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">
          Registre des bénéficiaires ({totalBeneficiaires})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase w-8"></th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">Bénéficiaire</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase hidden md:table-cell">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase hidden lg:table-cell">Société</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase hidden lg:table-cell">Matricule</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase hidden xl:table-cell">Date d'effet</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase hidden xl:table-cell">Barème</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase hidden lg:table-cell">Dossiers</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">Statut</th>
                  {canEdit && <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {familles.map(({ principal, ayantsDroit }) => {
                  const isExpanded = expandedFamilies.has(principal.id);
                  const hasAyantsDroit = ayantsDroit.length > 0;
                  return (
                    <AssureFamilyRow
                      key={principal.id}
                      assure={principal}
                      ayantsDroit={ayantsDroit}
                      isExpanded={isExpanded}
                      hasAyantsDroit={hasAyantsDroit}
                      canEdit={canEdit}
                      deleteConfirm={deleteConfirm}
                      saving={saving}
                      onToggle={() => toggleFamily(principal.id)}
                      onEdit={openEdit}
                      onDelete={setDeleteConfirm}
                      handleDelete={supprimer}
                    />
                  );
                })}
              </tbody>
            </table>
            {familles.length === 0 && !loading && (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Aucun bénéficiaire trouvé</p>
              </div>
            )}
            </div>
            <SharedPagination
              pagination={pagination}
              onPageChange={changerPage}
              label="bénéficiaire"
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Sous-composant : Ligne famille ──────────────────────────────────────────

function AssureFamilyRow({
  assure: principal,
  ayantsDroit,
  isExpanded,
  hasAyantsDroit,
  canEdit,
  deleteConfirm,
  saving,
  onToggle,
  onEdit,
  onDelete,
  handleDelete,
}: {
  assure: Assure;
  ayantsDroit: Assure[];
  isExpanded: boolean;
  hasAyantsDroit: boolean;
  canEdit: boolean;
  deleteConfirm: string | null;
  saving: boolean;
  onToggle: () => void;
  onEdit: (a: Assure) => void;
  onDelete: (id: string | null) => void;
  handleDelete: (id: string) => void;
}) {
  const age = formatAge(principal.dateNaissance);

  return (
    <>
      <tr className={cn(
        'border-b hover:bg-muted/20 transition-colors',
        hasAyantsDroit && 'cursor-pointer',
      )} onClick={hasAyantsDroit ? onToggle : undefined}>
        <td className="px-4 py-3">
          {hasAyantsDroit && (
            isExpanded
              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-xs font-semibold flex-shrink-0">
              {principal.nom[0]}{principal.prenom ? principal.prenom[0] : ''}
            </div>
            <div className="min-w-0">
              <p className="font-medium truncate">{principal.prenom ? `${principal.prenom} ${principal.nom}` : principal.nom}</p>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                {principal.matricule && <span className="font-mono">{principal.matricule}</span>}
                {age && <span>{age}</span>}
                {principal.dateEffet && <span className="text-emerald-600">Effet: {formatDate(principal.dateEffet)}</span>}
              </div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 hidden md:table-cell">
          <Badge className={cn('text-[10px]', TYPE_BENEF_COLORS[principal.typeBeneficiaire] || 'bg-muted text-muted-foreground')}>
            {TYPE_BENEF_LABELS[principal.typeBeneficiaire] || principal.typeBeneficiaire}
          </Badge>
        </td>
        <td className="px-4 py-3 hidden lg:table-cell">
          <Badge variant="outline" className="text-[11px] bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
            {principal.societe.nom}
          </Badge>
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell font-mono">{principal.matricule || '—'}</td>
        <td className="px-4 py-3 text-xs text-muted-foreground hidden xl:table-cell">{formatDate(principal.dateEffet)}</td>
        <td className="px-4 py-3 text-xs text-muted-foreground hidden xl:table-cell font-mono">{principal.bareme ?? '—'}</td>
        <td className="px-4 py-3 hidden lg:table-cell">
          <span className="text-sm font-medium flex items-center gap-1">
            <FileText className="h-3 w-3 text-muted-foreground" />{principal._count.dossiers}
          </span>
        </td>
        <td className="px-4 py-3">
          <Badge variant={principal.actif ? 'default' : 'destructive'} className={cn('text-[11px]', principal.actif ? 'bg-emerald-600 text-white' : '')}>
            {principal.actif ? 'Actif' : 'Inactif'}
          </Badge>
        </td>
        {canEdit && (
          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-end gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(principal)} aria-label="Modifier l'assuré"><Pencil className="h-3.5 w-3.5" /></Button>
              {deleteConfirm === principal.id ? (
                <div className="flex items-center gap-1">
                  <Button variant="destructive" size="sm" className="h-7 text-xs px-2" onClick={() => handleDelete(principal.id)} disabled={saving}>{saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Oui'}</Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(null)} aria-label="Annuler la suppression"><X className="h-3.5 w-3.5" /></Button>
                </div>
              ) : (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:bg-red-950/40" onClick={() => onDelete(principal.id)} aria-label="Supprimer l'assuré"><Trash2 className="h-3.5 w-3.5" /></Button>
              )}
            </div>
          </td>
        )}
      </tr>

      {/* Ayants droit (expandables) */}
      {isExpanded && ayantsDroit.map(ad => (
        <tr key={ad.id} className="border-b last:border-0 bg-muted/10 hover:bg-muted/30 transition-colors">
          <td className="px-4 py-2.5"></td>
          <td className="px-4 py-2.5">
            <div className="flex items-center gap-3 ml-4">
              <div className={cn('h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0', TYPE_BENEF_COLORS[ad.typeBeneficiaire] || 'bg-muted')}>
                {ad.nom[0]}{ad.prenom ? ad.prenom[0] : ''}
              </div>
              <div className="min-w-0">
                <p className="text-sm truncate">{ad.prenom ? `${ad.prenom} ${ad.nom}` : ad.nom}</p>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {ad.matricule && <span className="font-mono">{ad.matricule}</span>}
                  {formatAge(ad.dateNaissance) && <span>{formatAge(ad.dateNaissance)}</span>}
                </div>
              </div>
            </div>
          </td>
          <td className="px-4 py-2.5 hidden md:table-cell">
            <Badge className={cn('text-[10px]', TYPE_BENEF_COLORS[ad.typeBeneficiaire] || 'bg-muted text-muted-foreground')}>
              {TYPE_BENEF_LABELS[ad.typeBeneficiaire] || ad.typeBeneficiaire}
            </Badge>
          </td>
          <td className="px-4 py-2.5 hidden lg:table-cell text-xs text-muted-foreground">—</td>
          <td className="px-4 py-2.5 text-xs text-muted-foreground hidden lg:table-cell font-mono">{ad.matricule || '—'}</td>
          <td className="px-4 py-2.5 text-xs text-muted-foreground hidden xl:table-cell">{formatDate(ad.dateEffet)}</td>
          <td className="px-4 py-2.5 text-xs text-muted-foreground hidden xl:table-cell">{ad.bareme ?? '—'}</td>
          <td className="px-4 py-2.5 hidden lg:table-cell">
            <span className="text-sm font-medium flex items-center gap-1">
              <FileText className="h-3 w-3 text-muted-foreground" />{ad._count.dossiers}
            </span>
          </td>
          <td className="px-4 py-2.5">
            <Badge variant={ad.actif ? 'default' : 'destructive'} className={cn('text-[11px]', ad.actif ? 'bg-emerald-600 text-white' : '')}>
              {ad.actif ? 'Actif' : 'Inactif'}
            </Badge>
          </td>
          {canEdit && (
            <td className="px-4 py-2.5 text-right">
              <div className="flex items-center justify-end gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(ad)} aria-label="Modifier l'adresse"><Pencil className="h-3 w-3" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:bg-red-950/40" onClick={() => handleDelete(ad.id)} aria-label="Supprimer l'adresse"><Trash2 className="h-3 w-3" /></Button>
              </div>
            </td>
          )}
        </tr>
      ))}
    </>
  );
}
