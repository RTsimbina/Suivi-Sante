'use client';

/**
 * Fiche détaillée d'un prestataire (rubrique GESTION → Prestataires).
 *
 * Présente de manière claire et structurée :
 *  - identité : Nom / Raison sociale, Type / Catégorie, Statut juridique, NIF, Num STAT ;
 *  - contact : Téléphone, Adresse e-mail, Adresse ;
 *  - bancaire : RIB / coordonnées bancaires ;
 *  - état : Actif / Inactif, statut conventionnel ;
 *  - sociétés clientes rattachées (conventions actives / suspendues) ;
 *  - activité : nombre de dossiers.
 *
 * La donnée vient de GET /api/prestataires/[id] (frais, inclut les rattachements).
 * Le bouton « Modifier le prestataire » n'apparaît que pour les profils
 * autorisés (Administrateur / Service Technique) — l'autorisation reste de
 * toute façon tranchée côté serveur (403 sinon).
 */

import { Building2, CheckCircle2, Circle, Loader2, Pencil, Stethoscope, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

import { PrestataireItem, TYPE_LABELS, TYPE_COLORS, STATUT_CONVENTIONNEL_LABELS } from './types';
import { formatDate } from '../format';

function FicheField({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-sm ${mono ? 'font-mono' : ''} ${value ? '' : 'text-muted-foreground'}`}>
        {value || '—'}
      </p>
    </div>
  );
}

export default function FichePrestataireDialog({
  open,
  onOpenChange,
  prestataire,
  loading,
  canEdit,
  onModifier,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prestataire: PrestataireItem | null;
  loading: boolean;
  canEdit: boolean;
  onModifier: () => void;
}) {
  const rattachements = prestataire
    ? ((prestataire as PrestataireItem & { societes?: { id: string; societe: { id: string; nom: string }; actif: boolean }[] }).societes ?? [])
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
          </div>
        ) : !prestataire ? null : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                <Stethoscope className="h-5 w-5 text-emerald-600" />
                <span>{prestataire.nom}</span>
                <Badge variant="outline" className={`text-[10px] ${TYPE_COLORS[prestataire.type] ?? TYPE_COLORS.AUTRE}`}>
                  {TYPE_LABELS[prestataire.type] ?? prestataire.type}
                </Badge>
                <Badge
                  className={
                    prestataire.actif
                      ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                      : 'bg-red-100 text-red-700 border-red-200'
                  }
                  variant="outline"
                >
                  {prestataire.actif ? 'Actif' : 'Inactif'}
                </Badge>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* ─── Identité ─── */}
              <section className="rounded-lg border p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground">IDENTITÉ</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FicheField label="Nom / Raison sociale" value={prestataire.nom} />
                  <FicheField label="Type / Catégorie" value={TYPE_LABELS[prestataire.type] ?? prestataire.type} />
                  <FicheField label="Statut juridique" value={prestataire.statutJuridique} />
                  <FicheField label="Statut conventionnel" value={prestataire.statut ? (STATUT_CONVENTIONNEL_LABELS[prestataire.statut] ?? prestataire.statut) : null} />
                  <FicheField label="NIF (Numéro d'Identification Fiscale)" value={prestataire.nif} mono />
                  <FicheField label="Num STAT (Numéro Statistique)" value={prestataire.stat} mono />
                </div>
              </section>

              {/* ─── Contact ─── */}
              <section className="rounded-lg border p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground">CONTACT</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FicheField label="Téléphone" value={prestataire.telephone} mono />
                  <FicheField label="Adresse e-mail" value={prestataire.email} />
                  <FicheField label="Adresse" value={prestataire.adresse} />
                  <FicheField label="Nombre de dossiers" value={String(prestataire.nbDossiers ?? 0)} />
                </div>
              </section>

              {/* ─── Coordonnées bancaires ─── */}
              <section className="rounded-lg border p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground">COORDONNÉES BANCAIRES</p>
                <FicheField label="RIB" value={prestataire.rib} mono />
              </section>

              {/* ─── Sociétés clientes rattachées ─── */}
              <section className="rounded-lg border p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground">SOCIÉTÉS CLIENTES RATTACHÉES</p>
                {rattachements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucun rattachement à une société cliente.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {rattachements.map(r => (
                      <li key={r.id ?? r.societe.id} className="flex items-center gap-2 text-sm">
                        <Building2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        <span className="truncate">{r.societe.nom}</span>
                        {r.actif ? (
                          <Badge variant="outline" className="text-[10px] border-emerald-200 text-emerald-700 gap-1">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Convention active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] border-red-200 text-red-700 gap-1">
                            <XCircle className="h-2.5 w-2.5" /> Convention suspendue
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* ─── Méta ─── */}
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Circle className="h-2 w-2" />
                Fiche chargée le {formatDate(new Date())} — toute modification est enregistrée dans le Journal d&apos;Audit des Paramétrages.
              </p>
            </div>

            {/* ─── Actions ─── */}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Fermer
              </Button>
              {canEdit && (
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={onModifier}
                >
                  <Pencil className="h-4 w-4 mr-1.5" /> Modifier le prestataire
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
