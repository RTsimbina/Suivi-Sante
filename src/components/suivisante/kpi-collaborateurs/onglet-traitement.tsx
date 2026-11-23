'use client';

/**
 * onglet-traitement.tsx — Onglet « Traitement » du détail dossier.
 *  - Chronologie append-only : périodes de responsabilité (service, responsable,
 *    affectation, début, fin, motifs de réaffectation/retour) + fenêtres de
 *    suspension — lues depuis /api/dossiers/[id]/etapes ;
 *  - Actions serveur : marquer le début de traitement, suspendre/reprendre
 *    (motif obligatoire), retour pour correction (statut conservé), et pour
 *    les profils SANTE/ADMINISTRATEUR, les phases du contrôle médical.
 * Les horodatages sont générés côté serveur ; aucune étape fermée n'est
 * modifiable depuis l'interface.
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Play, Pause, PlayCircle, Undo2, Stethoscope, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

export interface EtapeUI {
  id: string;
  service: string;
  type: string;
  userId: string | null;
  user?: { nom: string; role: string } | null;
  gestionnaire?: { nom: string; service: string } | null;
  statutAvant: string | null;
  statutApres: string | null;
  dateAffectation: string;
  dateDebut: string | null;
  dateFin: string | null;
  motifReaffectation: string | null;
  motifRetour: string | null;
  suspensions: { id: string; motif: string; suspenduA: string; reprisA: string | null }[];
}

interface EtapesBundle { dossier: { statut: string }; etapes: EtapeUI[]; }

const serviceColors: Record<string, string> = {
  ACCUEIL: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300',
  TECHNIQUE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  CONTROLE_MEDICAL: 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300',
  COMPTABILITE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
};
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('fr-FR') : '—');

export default function OngletTraitement({ dossierId, statut }: { dossierId: string; statut: string }) {
  const { role } = useAuth();
  const [bundle, setBundle] = useState<EtapesBundle | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [dialogAction, setDialogAction] = useState<null | 'suspendre' | 'retour'>(null);
  const [motif, setMotif] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    const res = await fetch(`/api/dossiers/${dossierId}/etapes`);
    if (res.ok) setBundle(await res.json());
  }, [dossierId]);

  useEffect(() => { charger(); }, [charger]);

  const agir = async (url: string, corps?: unknown) => {
    setEnvoi(true); setErreur(null); setMessage(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: corps ? { 'Content-Type': 'application/json' } : undefined,
        body: corps ? JSON.stringify(corps) : undefined,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.erreur ?? `Erreur ${res.status}`);
      setMessage(body.erreur ?? 'Opération enregistrée.');
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setEnvoi(false);
      setMotif('');
      setDialogAction(null);
    }
  };

  const etapes = bundle?.etapes ?? [];
  const etapeOuverte = etapes.find((e) => !e.dateFin && e.type === 'TRAVAIL');
  const suspendueOuverte = etapeOuverte?.suspensions.find((s) => !s.reprisA);
  const debutMarque = !!etapeOuverte?.dateDebut;
  const terminal = ['PAYE', 'REJETE'].includes(statut);
  const controleMedicalOuvert = etapes.find((e) => e.service === 'CONTROLE_MEDICAL' && !e.dateFin);
  const peutControleMedical = role === 'SANTE' || role === 'ADMINISTRATEUR';

  return (
    <div className="space-y-4">
      {/* Actions (côté serveur uniquement) */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Actions de traitement</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={envoi || !etapeOuverte || debutMarque || terminal}
            onClick={() => agir(`/api/dossiers/${dossierId}/debut-traitement`)}>
            <Play className="h-4 w-4 mr-1" />Marquer le début
          </Button>
          <Button size="sm" variant="outline" disabled={envoi || !etapeOuverte || !!suspendueOuverte || terminal}
            onClick={() => setDialogAction('suspendre')}>
            <Pause className="h-4 w-4 mr-1" />Suspendre
          </Button>
          <Button size="sm" variant="outline" disabled={envoi || !etapeOuverte || !suspendueOuverte || terminal}
            onClick={() => agir(`/api/dossiers/${dossierId}/reprise`)}>
            <PlayCircle className="h-4 w-4 mr-1" />Reprendre
          </Button>
          <Button size="sm" variant="outline" disabled={envoi || terminal}
            onClick={() => setDialogAction('retour')}>
            <Undo2 className="h-4 w-4 mr-1" />Retour pour correction
          </Button>
          {peutControleMedical && (
            <>
              <Button size="sm" variant="outline" disabled={envoi || !!controleMedicalOuvert}
                onClick={() => agir(`/api/controle-medical/${dossierId}`, { phase: 'DEBUT' })}>
                <Stethoscope className="h-4 w-4 mr-1" />Contrôle médical : début
              </Button>
              <Button size="sm" variant="outline" disabled={envoi || !controleMedicalOuvert}
                onClick={() => agir(`/api/controle-medical/${dossierId}`, { phase: 'FIN' })}>
                <CheckCircle2 className="h-4 w-4 mr-1" />Contrôle médical : fin
              </Button>
            </>
          )}
        </CardContent>
      </Card>
      {message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}
      {erreur && <p className="text-sm text-red-600 dark:text-red-400">{erreur}</p>}

      {/* Chronologie */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Chronologie du traitement (traçabilité)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {etapes.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucune étape enregistrée pour ce dossier.</p>
          )}
          {[...etapes].sort((a, b) => a.dateAffectation.localeCompare(b.dateAffectation)).map((e) => (
            <div key={e.id} className="border rounded-lg p-3 text-sm space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={serviceColors[e.service] ?? ''}>{e.service}</Badge>
                {e.type === 'RETOUR_CORRECTION' && (
                  <Badge variant="outline" className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800">
                    Retour pour correction
                  </Badge>
                )}
                {!e.dateFin && <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800">En cours</Badge>}
                <span className="text-muted-foreground">
                  Responsable : {e.user?.nom ?? e.gestionnaire?.nom ?? 'Non attribué'}
                </span>
              </div>
              <div className="text-muted-foreground">
                Affectation : {fmt(e.dateAffectation)} — Début : {fmt(e.dateDebut)} — Fin : {fmt(e.dateFin)}
              </div>
              {e.motifReaffectation && <div className="text-amber-700 dark:text-amber-300">Motif de réaffectation : {e.motifReaffectation}</div>}
              {e.motifRetour && <div className="text-red-700 dark:text-red-300">Motif du retour : {e.motifRetour}</div>}
              {e.suspensions.map((s) => (
                <div key={s.id} className="text-sky-700 dark:text-sky-300">
                  Suspension : {s.motif} ({fmt(s.suspenduA)} → {fmt(s.reprisA)})
                </div>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Dialog de motif */}
      <Dialog open={dialogAction !== null} onOpenChange={(o) => (o ? null : setDialogAction(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogAction === 'suspendre' ? 'Suspendre le traitement' : 'Retour pour correction'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="kpi-motif">Motif (obligatoire, tracé)</Label>
            <Textarea id="kpi-motif" value={motif} onChange={(e) => setMotif(e.target.value)}
              placeholder="Attente d'une pièce complémentaire, validation externe…" />
            {dialogAction === 'retour' && (
              <p className="text-xs text-muted-foreground">Le statut du dossier est conservé — l&apos;événement alimente le taux de retour pour correction.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAction(null)}>Annuler</Button>
            <Button disabled={envoi || motif.trim().length < 10}
              onClick={() => dialogAction === 'suspendre'
                ? agir(`/api/dossiers/${dossierId}/suspension`, { motif: motif.trim() })
                : agir(`/api/dossiers/${dossierId}/retour-correction`, { motif: motif.trim() })}>
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
