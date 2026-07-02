'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText,
  Download,
  Clock,
  User,
  Building2,
  Calendar,
  CreditCard,
  MessageSquare,
  Send,
  Loader2,
  Eye,
  EyeOff,
  Paperclip,
  X,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDate, formatMontant, statutLabel, statutColor, typeDossierLabel } from './format';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────

interface DossierDetail {
  id: string;
  numeroDossier: string;
  dateReception: string;
  beneficiaire: string;
  assure: string | null;
  nSS: string | null;
  typeDossier: string;
  statut: string;
  source: string;
  prestataire: string | null;
  dateSoins: string | null;
  moyenPaiement: string | null;
  observations: string | null;
  montantReclame: number;
  montantValide: number | null;
  ticketModerateur: number | null;
  partPatient: number | null;
  partEntreprise: number | null;
  motifRejet: string | null;
  dateTraitementTechnique: string | null;
  dateReceptionDecompte: string | null;
  datePaiement: string | null;
  referencePaiement: string | null;
  montantPaye: number | null;
  historiqueParsed: HistoriqueEntry[];
  societe: { id: string; nom: string };
  gestionnaireAccueil: { id: string; nom: string; service: string } | null;
  gestionnaireTechnique: { id: string; nom: string; service: string } | null;
  gestionnaireCompta: { id: string; nom: string; service: string } | null;
  createur: { id: string; nom: string; email: string; role: string } | null;
  commentaires: CommentaireWithAuteur[];
  justificatifs: {
    id: string;
    type: string;
    nomFichier: string;
    chemin: string;
    tailleKo: number | null;
    createdAt: string;
  }[];
}

interface CommentaireWithAuteur {
  id: string;
  contenu: string;
  prive: boolean;
  createdAt: string;
  auteur: { id: string; nom: string; email: string; role: string } | null;
}

interface HistoriqueEntry {
  date: string;
  statut: string;
  commentaire?: string;
  userId?: string;
}

const STATUTS = ['RECU', 'EN_ANALYSE', 'VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE', 'REJETE'];

const JUSTIFICATIF_LABELS: Record<string, string> = {
  FACTURE: 'Facture',
  ORDONNANCE: 'Ordonnance',
  RIB: 'RIB',
  CARNET_SOINS: 'Carnet de soins',
  DECOMPTE: 'Décompte',
  AUTRE: 'Autre',
};

const JUSTIFICATIF_COLORS: Record<string, string> = {
  FACTURE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ORDONNANCE: 'bg-sky-50 text-sky-700 border-sky-200',
  RIB: 'bg-amber-50 text-amber-700 border-amber-200',
  CARNET_SOINS: 'bg-purple-50 text-purple-700 border-purple-200',
  DECOMPTE: 'bg-orange-50 text-orange-700 border-orange-200',
  AUTRE: 'bg-gray-50 text-gray-600 border-gray-200',
};

const HISTORIQUE_STATUT_COLORS: Record<string, string> = {
  RECU: 'bg-slate-500',
  EN_ANALYSE: 'bg-amber-500',
  VALIDE: 'bg-emerald-500',
  EN_COMPTABILITE: 'bg-sky-500',
  EN_PAIEMENT: 'bg-indigo-500',
  PAYE: 'bg-teal-500',
  REJETE: 'bg-red-500',
};

// ── Component ──────────────────────────────────────────────────────────────

interface DossierDetailProps {
  dossierId: string;
  onClose: () => void;
}

export default function DossierDetail({ dossierId, onClose }: DossierDetailProps) {
  const { toast } = useToast();
  const [dossier, setDossier] = useState<DossierDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentaire, setCommentaire] = useState('');
  const [commentPrive, setCommentPrive] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'historique' | 'commentaires' | 'justificatifs'>('info');

  const fetchDossier = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dossiers/${dossierId}/detail`);
      if (res.ok) {
        const data = await res.json();
        setDossier(data);
      } else {
        toast({ title: 'Erreur', description: 'Dossier introuvable', variant: 'destructive' });
        onClose();
      }
    } catch {
      toast({ title: 'Erreur', description: 'Erreur de chargement', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [dossierId, onClose, toast]);

  useEffect(() => {
    fetchDossier();
  }, [fetchDossier]);

  const handleAddComment = async () => {
    if (!commentaire.trim()) return;
    setSendingComment(true);
    try {
      const res = await fetch(`/api/dossiers/${dossierId}/commentaires`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenu: commentaire, prive: commentPrive }),
      });
      if (res.ok) {
        const newComment = await res.json();
        setDossier((prev) => prev ? { ...prev, commentaires: [...prev.commentaires, newComment] } : prev);
        setCommentaire('');
        toast({ title: 'Commentaire ajouté' });
      }
    } catch {
      toast({ title: 'Erreur', description: "Impossible d'ajouter le commentaire", variant: 'destructive' });
    } finally {
      setSendingComment(false);
    }
  };

  const handleStatutChange = async (newStatut: string) => {
    try {
      const res = await fetch(`/api/dossiers/${dossierId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: newStatut }),
      });
      if (res.ok) {
        fetchDossier();
        toast({ title: 'Statut mis à jour', description: statutLabel(newStatut) });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de changer le statut', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <Dialog open onOpenChange={() => onClose()}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden p-0">
          <div className="p-6 space-y-4">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-40" />
            <div className="grid grid-cols-2 gap-4 pt-4">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!dossier) return null;

  const tabs = [
    { key: 'info' as const, label: 'Informations', icon: FileText },
    { key: 'historique' as const, label: `Historique (${dossier.historiqueParsed?.length || 0})`, icon: Clock },
    { key: 'commentaires' as const, label: `Commentaires (${dossier.commentaires?.length || 0})`, icon: MessageSquare },
    { key: 'justificatifs' as const, label: `Pièces (${dossier.justificatifs?.length || 0})`, icon: Paperclip },
  ];

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden p-0 flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle className="text-lg">
                  <span className="font-mono text-emerald-600">{dossier.numeroDossier}</span>
                  <span className="mx-2 text-muted-foreground">—</span>
                  {dossier.beneficiaire}
                </DialogTitle>
                <DialogDescription className="mt-1 flex items-center gap-3 flex-wrap">
                  <span className="flex items-center gap-1 text-xs">
                    <Building2 className="h-3 w-3" />
                    {dossier.societe?.nom}
                  </span>
                  <span className="flex items-center gap-1 text-xs">
                    <Calendar className="h-3 w-3" />
                    {formatDate(dossier.dateReception)}
                  </span>
                  <Badge variant="outline" className={cn('text-xs', statutColor(dossier.statut))}>
                    {statutLabel(dossier.statut)}
                  </Badge>
                </DialogDescription>
              </div>
              <Select value={dossier.statut} onValueChange={handleStatutChange}>
                <SelectTrigger className="h-9 w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUTS.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {statutLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 border-b -mb-px">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors',
                    activeTab === tab.key
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6">
            {/* Tab: Informations */}
            {activeTab === 'info' && (
              <div className="space-y-6">
                {/* Bénéficiaire */}
                <InfoSection title="Bénéficiaire & Assuré">
                  <InfoRow label="Bénéficiaire" value={dossier.beneficiaire} icon={User} />
                  <InfoRow label="Assuré" value={dossier.assure} />
                  <InfoRow label="N° SS" value={dossier.nSS} />
                  <InfoRow label="Société" value={dossier.societe?.nom} icon={Building2} />
                </InfoSection>

                {/* Dossier */}
                <InfoSection title="Détails du dossier">
                  <InfoRow label="Type" value={typeDossierLabel(dossier.typeDossier)} />
                  <InfoRow label="Source" value={dossier.source} />
                  <InfoRow label="Montant réclamé" value={formatMontant(dossier.montantReclame)} icon={CreditCard} highlight />
                  {dossier.montantValide !== null && (
                    <InfoRow label="Montant validé" value={formatMontant(dossier.montantValide)} />
                  )}
                  {dossier.montantPaye !== null && (
                    <InfoRow label="Montant payé" value={formatMontant(dossier.montantPaye)} />
                  )}
                  {dossier.motifRejet && (
                    <div className="flex items-start gap-2 py-1.5">
                      <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Motif de rejet</p>
                        <p className="text-sm font-medium text-red-600">{dossier.motifRejet}</p>
                      </div>
                    </div>
                  )}
                </InfoSection>

                {/* Soins */}
                <InfoSection title="Soins & Paiement">
                  <InfoRow label="Date des soins" value={dossier.dateSoins ? formatDate(dossier.dateSoins) : null} icon={Calendar} />
                  <InfoRow label="Prestataire" value={dossier.prestataire} />
                  <InfoRow label="Moyen de paiement" value={dossier.moyenPaiement} />
                  {dossier.referencePaiement && (
                    <InfoRow label="Réf. paiement" value={dossier.referencePaiement} />
                  )}
                </InfoSection>

                {/* Gestionnaires */}
                <InfoSection title="Gestionnaires">
                  <InfoRow label="Accueil" value={dossier.gestionnaireAccueil?.nom} />
                  <InfoRow label="Technique" value={dossier.gestionnaireTechnique?.nom} />
                  <InfoRow label="Comptabilité" value={dossier.gestionnaireCompta?.nom} />
                  <InfoRow label="Créé par" value={dossier.createur?.nom} />
                </InfoSection>

                {/* Observations */}
                {dossier.observations && (
                  <InfoSection title="Observations">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{dossier.observations}</p>
                  </InfoSection>
                )}
              </div>
            )}

            {/* Tab: Historique */}
            {activeTab === 'historique' && (
              <div className="space-y-1">
                {dossier.historiqueParsed && dossier.historiqueParsed.length > 0 ? (
                  dossier.historiqueParsed.map((entry, i) => (
                    <div key={i} className="flex gap-3 relative">
                      {/* Timeline line */}
                      {i < dossier.historiqueParsed.length - 1 && (
                        <div className="absolute left-[11px] top-6 bottom-0 w-px bg-gray-200" />
                      )}
                      {/* Dot */}
                      <div className={cn(
                        'h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 z-10',
                        HISTORIQUE_STATUT_COLORS[entry.statut] || 'bg-gray-400',
                        'text-white'
                      )}>
                        {i === dossier.historiqueParsed.length - 1 ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowRight className="h-3 w-3" />
                        )}
                      </div>
                      {/* Content */}
                      <div className="pb-6 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={cn('text-xs', statutColor(entry.statut))}>
                            {statutLabel(entry.statut)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(entry.date)}
                          </span>
                        </div>
                        {entry.commentaire && (
                          <p className="text-sm text-muted-foreground mt-1">{entry.commentaire}</p>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Aucun historique disponible
                  </p>
                )}
              </div>
            )}

            {/* Tab: Commentaires */}
            {activeTab === 'commentaires' && (
              <div className="space-y-4">
                {/* Add comment form */}
                <Card className="border-emerald-100">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Textarea
                        placeholder="Ajouter un commentaire..."
                        className="min-h-[60px] resize-y text-sm"
                        rows={2}
                        value={commentaire}
                        onChange={(e) => setCommentaire(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setCommentPrive(!commentPrive)}
                        className={cn(
                          'flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors',
                          commentPrive ? 'bg-amber-50 text-amber-700' : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {commentPrive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {commentPrive ? 'Commentaire interne' : 'Visible par tous'}
                      </button>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white h-8"
                        onClick={handleAddComment}
                        disabled={sendingComment || !commentaire.trim()}
                      >
                        {sendingComment ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5 mr-1" />
                        )}
                        Envoyer
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Comments list */}
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {dossier.commentaires && dossier.commentaires.length > 0 ? (
                    dossier.commentaires.map((c) => (
                      <div key={c.id} className="flex gap-3 p-3 rounded-lg bg-muted/30">
                        <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                          <User className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{c.auteur?.nom || 'Utilisateur'}</span>
                            {c.prive && (
                              <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-600 bg-amber-50">
                                <EyeOff className="h-2.5 w-2.5 mr-0.5" />
                                Interne
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {formatDate(c.createdAt)}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{c.contenu}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Aucun commentaire pour ce dossier
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Tab: Justificatifs */}
            {activeTab === 'justificatifs' && (
              <div className="space-y-3">
                {dossier.justificatifs && dossier.justificatifs.length > 0 ? (
                  dossier.justificatifs.map((j) => (
                    <div
                      key={j.id}
                      className="flex items-center gap-3 p-3 rounded-lg border bg-white hover:bg-gray-50 transition-colors"
                    >
                      <div className="h-10 w-10 rounded-md bg-emerald-50 flex items-center justify-center shrink-0">
                        <FileText className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{j.nomFichier}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className={cn('text-[10px]', JUSTIFICATIF_COLORS[j.type] || JUSTIFICATIF_COLORS.AUTRE)}>
                            {JUSTIFICATIF_LABELS[j.type] || j.type}
                          </Badge>
                          {j.tailleKo && (
                            <span className="text-xs text-muted-foreground">{j.tailleKo} Ko</span>
                          )}
                          <span className="text-xs text-muted-foreground">{formatDate(j.createdAt)}</span>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="h-8 text-xs gap-1" asChild>
                        <a href={`/${j.chemin}`} download={j.nomFichier} target="_blank" rel="noopener noreferrer">
                          <Download className="h-3.5 w-3.5" />
                          Télécharger
                        </a>
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12">
                    <Paperclip className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      Aucun justificatif téléchargé pour ce dossier
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{title}</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">{children}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string | null | undefined;
  icon?: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('text-sm', highlight ? 'font-semibold text-emerald-700' : 'font-medium')}>
          {value || <span className="text-muted-foreground font-normal">—</span>}
        </p>
      </div>
    </div>
  );
}