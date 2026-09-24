'use client';

/**
 * doublon-exception.tsx — Panneau d'affichage des doublons détectés (409)
 * et de validation d'exception par l'Administrateur.
 *
 * Spécification :
 *  - le système détecte le doublon et affiche CLAIREMENT l'information déjà
 *    existante (champ, valeur, fiche porteuse) ;
 *  - l'utilisateur ne peut pas contourner le contrôle : sans validation
 *    Administrateur, l'enregistrement reste bloqué ;
 *  - l'Administrateur doit indiquer/confirmer le motif de l'exception
 *    (ex : appartenance au même groupe de prestataires) — validation
 *    enregistrée dans le Journal d'Audit côté serveur.
 */

import { ShieldAlert, Info, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { GroupeItem, DoublonInfo } from './types';

const CHAMP_LABELS: Record<string, string> = {
  nif: 'NIF',
  stat: 'Num STAT',
  email: 'E-mail',
  code: 'Code prestataire',
  nom: 'Nom / Raison sociale',
};

export default function DoublonExceptionPanel({
  doublons,
  isAdmin,
  saving,
  groupes,
  motif,
  onMotifChange,
  onConfirmer,
  onModifierSaisie,
}: {
  doublons: DoublonInfo[];
  isAdmin: boolean;
  saving: boolean;
  groupes: GroupeItem[];
  motif: string;
  onMotifChange: (motif: string) => void;
  onConfirmer: () => void;
  onModifierSaisie: () => void;
}) {
  if (doublons.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
            Doublon(s) détecté(s) — enregistrement bloqué
          </p>
          <ul className="mt-1.5 space-y-1">
            {doublons.map((d, i) => (
              <li
                key={`${d.champ}-${d.valeur}-${d.prestataireExistantId}-${i}`}
                className="text-xs text-amber-800 dark:text-amber-300 flex flex-wrap items-center gap-1"
              >
                <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 dark:text-amber-300">
                  {CHAMP_LABELS[d.champ] ?? d.champ}
                </Badge>
                <span className="font-mono font-medium">« {d.valeur} »</span>
                <span>déjà utilisé(e) par</span>
                <span className="font-semibold">{d.prestataireExistantNom}</span>
                {d.prestataireExistantCode && (
                  <span className="text-amber-600 dark:text-amber-400">(code {d.prestataireExistantCode})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {!isAdmin ? (
        <div className="flex items-start gap-2 p-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40">
          <Info className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-700 dark:text-red-300">
            Si ce doublon est légitime (ex : établissements d&apos;un même groupe de
            prestataires), seul un <span className="font-semibold">Administrateur</span> peut
            valider l&apos;exception. L&apos;enregistrement restera bloqué sinon.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-amber-400 dark:border-amber-700 bg-white dark:bg-background p-3 space-y-2">
          <p className="text-xs font-semibold">Validation d&apos;exception par l&apos;Administrateur</p>
          <p className="text-[11px] text-muted-foreground">
            Confirmez et motivez l&apos;exception (ex : appartenance au même groupe de
            prestataires utilisant légitimement des informations communes). Cette
            validation sera enregistrée dans le Journal d&apos;Audit.
          </p>
          <div className="space-y-1">
            <Label className="text-xs font-medium">
              Motif de l&apos;exception <span className="text-red-500">*</span>
            </Label>
            <textarea
              value={motif}
              onChange={e => onMotifChange(e.target.value)}
              placeholder="Ex : Le NIF est partagé car « Clinique ABC Antananarivo » appartient au même groupe « Groupe Médical ABC »."
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white h-8 text-xs"
              disabled={saving || motif.trim().length < 5}
              onClick={onConfirmer}
            >
              Valider l&apos;exception et enregistrer
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={onModifierSaisie}
            >
              <AlertTriangle className="h-3 w-3 mr-1" /> Modifier la saisie
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
