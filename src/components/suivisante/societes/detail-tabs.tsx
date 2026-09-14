'use client';

/**
 * Les 4 onglets du panneau de détail société : Barèmes, Assurés, Prestataires,
 * Contacts entreprise. Présentateurs purs extraits de societes-view.tsx
 * (Vague 3) — JSX copié à l'identique.
 */

import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Search, Plus, Pencil, Trash2, Loader2, CheckCircle2, X,
  Users, Stethoscope, Percent, BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PRESTATION_COLORS, getPrestationLabel } from '@/lib/prestations';

import {
  BaremeDetail,
  AssureDetail,
  PrestataireDetail,
  EntrepriseContact,
  TYPE_BENEF_LABELS,
  TYPE_BENEF_COLORS,
  PRESTA_TYPE_LABELS,
} from './types';

// ─── Onglet Barèmes ──────────────────────────────────────────────────────────

export function BaremesTab({ baremes, search, onSearchChange, totalCount }: {
  baremes: BaremeDetail[];
  search: string;
  onSearchChange: (v: string) => void;
  totalCount: number;
}) {
  return (
    <div>
      {totalCount > 3 && (
        <div className="relative w-56 mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filtrer par prestation..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      )}
      {baremes.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground rounded-lg border border-dashed">
          <Percent className="h-8 w-8 mx-auto mb-2 opacity-20" />
          <p className="text-xs">Aucun barème configuré</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr className="text-left">
                <th className="py-2.5 px-3 font-medium text-muted-foreground">Prestation</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground text-center">Taux</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground text-right">Plafond</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground text-center">Statut</th>
              </tr>
            </thead>
            <tbody>
              {baremes.map(b => (
                <tr key={b.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-2.5 px-3">
                    <Badge className={cn('text-[11px]', PRESTATION_COLORS[b.prestation] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300')}>
                      {getPrestationLabel(b.prestation)}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-semibold text-emerald-600 dark:text-emerald-400">{b.tauxCouverture}%</td>
                  <td className="py-2.5 px-3 text-right font-mono">{b.plafond.toLocaleString('fr-FR')} Ar</td>
                  <td className="py-2.5 px-3 text-center">
                    {b.active ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground mx-auto" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Onglet Assurés ──────────────────────────────────────────────────────────

export function AssuresTab({ assures, search, onSearchChange, totalCount }: {
  assures: AssureDetail[];
  search: string;
  onSearchChange: (v: string) => void;
  totalCount: number;
}) {
  return (
    <div>
      {totalCount > 3 && (
        <div className="relative w-56 mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filtrer par nom, matricule..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      )}
      {assures.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground rounded-lg border border-dashed">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
          <p className="text-xs">Aucun bénéficiaire trouvé</p>
        </div>
      ) : (
        <div className="max-h-[50vh] overflow-y-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 sticky top-0">
              <tr className="text-left">
                <th className="py-2.5 px-3 font-medium text-muted-foreground">Bénéficiaire</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground">Type</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground">Matricule</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground text-center">Barème</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground text-center">Dossiers</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground text-center">Statut</th>
              </tr>
            </thead>
            <tbody>
              {assures.map(a => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300">
                          {a.prenom?.[0]}{a.nom[0]}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-xs">{a.prenom} {a.nom}</p>
                        {a.email && <p className="text-[10px] text-muted-foreground">{a.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <Badge className={cn('text-[9px]', TYPE_BENEF_COLORS[a.typeBeneficiaire || ''] || 'bg-muted text-muted-foreground')}>
                      {TYPE_BENEF_LABELS[a.typeBeneficiaire || ''] || 'Assuré'}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-muted-foreground text-xs">{a.matricule || '-'}</td>
                  <td className="py-2.5 px-3 text-center text-xs font-mono">{a.bareme ?? '-'}</td>
                  <td className="py-2.5 px-3 text-center">
                    <Badge variant="outline" className="text-[10px]">{a._count.dossiers}</Badge>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {a.actif ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground mx-auto" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Onglet Prestataires ─────────────────────────────────────────────────────

export function PrestatairesTab({ prestataires, search, onSearchChange, totalCount }: {
  prestataires: PrestataireDetail[];
  search: string;
  onSearchChange: (v: string) => void;
  totalCount: number;
}) {
  const nbActifs = prestataires.filter(p => p.actifSociete).length;
  const nbInactifs = prestataires.filter(p => !p.actifSociete).length;

  return (
    <div>
      {/* Stats rapides */}
      {prestataires.length > 0 && (
        <div className="flex items-center gap-4 mb-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            <span className="font-medium text-emerald-600">{nbActifs} actif(s)</span>
          </span>
          <span className="flex items-center gap-1">
            <X className="h-3 w-3 text-red-500" />
            <span className="font-medium text-red-600">{nbInactifs} inactif(s) — actes refusés automatiquement</span>
          </span>
        </div>
      )}

      {totalCount > 3 && (
        <div className="relative w-56 mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filtrer par nom, type..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      )}
      {prestataires.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground rounded-lg border border-dashed">
          <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-20" />
          <p className="text-xs">Aucun prestataire lié à cette société</p>
        </div>
      ) : (
        <div className="max-h-[50vh] overflow-y-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 sticky top-0">
              <tr className="text-left">
                <th className="py-2.5 px-3 font-medium text-muted-foreground">Prestataire</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground">Type</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground">Téléphone</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground text-center">Dossiers</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground text-right">Montant total</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground text-center">Statut société</th>
              </tr>
            </thead>
            <tbody>
              {prestataires.map(p => (
                <tr key={p.lienId} className={cn(
                  'border-b last:border-0 transition-colors',
                  !p.actifSociete && 'bg-red-50/40 dark:bg-red-950/10'
                )}>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2.5">
                      <div className={cn(
                        'h-8 w-8 rounded-full flex items-center justify-center shrink-0',
                        p.actifSociete ? 'bg-purple-100 dark:bg-purple-950/40' : 'bg-muted'
                      )}>
                        <Stethoscope className={cn(
                          'h-4 w-4',
                          p.actifSociete ? 'text-purple-700 dark:text-purple-300' : 'text-muted-foreground'
                        )} />
                      </div>
                      <div>
                        <p className={cn('font-medium text-xs', !p.actifSociete && 'text-muted-foreground')}>{p.nom}</p>
                        {!p.actifGlobal && (
                          <p className="text-[9px] text-amber-600">Inactif (global)</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <Badge variant="outline" className="text-[10px]">
                      {PRESTA_TYPE_LABELS[p.type] || p.type || '-'}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3 text-xs">{p.telephone || '-'}</td>
                  <td className="py-2.5 px-3 text-center">
                    <Badge variant="outline" className="text-[10px]">{p.nbDossiers}</Badge>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-semibold">
                    {p.montantTotal.toLocaleString('fr-FR')} Ar
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {p.actifSociete ? (
                      <Badge className="bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-[10px] hover:bg-emerald-100">
                        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Actif
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px]">
                        <X className="h-2.5 w-2.5 mr-0.5" /> Inactif
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Onglet Contacts entreprise ──────────────────────────────────────────────

export function ContactsTab({ contacts, search, onSearchChange, totalCount, loading, onAdd, onEdit, onDelete }: {
  contacts: EntrepriseContact[];
  search: string;
  onSearchChange: (v: string) => void;
  totalCount: number;
  loading: boolean;
  onAdd: () => void;
  onEdit: (c: EntrepriseContact) => void;
  onDelete: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
        <span className="ml-2 text-xs text-muted-foreground">Chargement des contacts...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        {totalCount > 3 && (
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Filtrer par nom, fonction..."
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
        )}
        <Button size="sm" onClick={onAdd} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs gap-1">
          <Plus className="h-3.5 w-3.5" /> Ajouter
        </Button>
      </div>
      {contacts.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground rounded-lg border border-dashed">
          <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-20" />
          <p className="text-xs">Aucun contact enregistré pour cette société</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr className="text-left">
                <th className="py-2.5 px-3 font-medium text-muted-foreground">Nom complet</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground">Fonction</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground">Téléphone</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground">Email</th>
                <th className="py-2.5 px-3 font-medium text-muted-foreground text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-teal-50 dark:bg-teal-950/40 flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-bold text-teal-700 dark:text-teal-300">
                          {(c.prenom?.[0] || '')}{c.nom[0]}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-xs">{c.prenom} {c.nom}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-xs text-muted-foreground">{c.fonction || '-'}</td>
                  <td className="py-2.5 px-3 text-xs">{c.telephone || '-'}</td>
                  <td className="py-2.5 px-3 text-xs">{c.email || '-'}</td>
                  <td className="py-2.5 px-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(c)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-600" onClick={() => onDelete(c.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
