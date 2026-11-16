'use client';

/**
 * Détail d'un dossier — page d'assemblage (refactoring P2 : le monolithe de
 * 821 lignes est découpé dans le dossier `dossiers/`).
 *
 * Rôle de cette page principale :
 *  - orchestration : les 4 hooks (chargement/statut, commentaires,
 *    justificatifs, alertes IA) et la réinitialisation de l'onglet actif ;
 *  - affichage transverse : dialog, squelette de chargement, barre d'onglets
 *    pilotée par DossierHeader ;
 *  - délégation : InfoTab, IaTab, HistoriqueTab, CommentairesTab et
 *    JustificatifsTab.
 */
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import DossierHeader, { type OngletDossier } from './dossiers/dossier-header';
import InfoTab from './dossiers/info-tab';
import IaTab from './dossiers/ia-tab';
import HistoriqueTab from './dossiers/historique-tab';
import CommentairesTab from './dossiers/commentaires-tab';
import JustificatifsTab from './dossiers/justificatifs-tab';
import { useDossierDetail } from './dossiers/use-dossier-detail';
import { useDossierCommentaires } from './dossiers/use-dossier-commentaires';
import { useDossierJustificatifs } from './dossiers/use-dossier-justificatifs';
import { useDossierAlertesIa } from './dossiers/use-dossier-alertes-ia';

interface DossierDetailProps {
  dossierId: string;
  onClose: () => void;
}

export default function DossierDetail({ dossierId, onClose }: DossierDetailProps) {
  const [activeTab, setActiveTab] = useState<OngletDossier>('info');

  const { dossier, loading, rafraichir, insererCommentaire, changerStatut } = useDossierDetail({ dossierId, onClose });
  const { alertes, loadingAlertes } = useDossierAlertesIa(dossier);
  const commentaires = useDossierCommentaires({ dossierId, onAjoute: insererCommentaire });
  const justificatifs = useDossierJustificatifs({ dossierId, onAjoute: rafraichir });

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

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden p-0 flex flex-col">
        {/* En-tête + onglets */}
        <DossierHeader
          dossier={dossier}
          nbAlertesIa={alertes.length}
          ongletActif={activeTab}
          onOngletChange={setActiveTab}
          onStatutChange={changerStatut}
        />

        {/* Contenu de l'onglet actif */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6">
            {activeTab === 'ia' && (
              <IaTab dossier={dossier} alertes={alertes} loadingAlertes={loadingAlertes} />
            )}
            {activeTab === 'info' && <InfoTab dossier={dossier} />}
            {activeTab === 'historique' && <HistoriqueTab historique={dossier.historiqueParsed} />}
            {activeTab === 'commentaires' && (
              <CommentairesTab
                commentaires={dossier.commentaires}
                commentaire={commentaires.commentaire}
                onCommentaireChange={commentaires.setCommentaire}
                commentPrive={commentaires.commentPrive}
                onTogglePrive={() => commentaires.setCommentPrive(!commentaires.commentPrive)}
                sendingComment={commentaires.sendingComment}
                onEnvoyer={commentaires.envoyer}
              />
            )}
            {activeTab === 'justificatifs' && (
              <JustificatifsTab
                justificatifs={dossier.justificatifs}
                uploadFile={justificatifs.uploadFile}
                uploadType={justificatifs.uploadType}
                onTypeChange={justificatifs.setUploadType}
                onSelectFichier={justificatifs.setUploadFile}
                uploading={justificatifs.uploading}
                onEnvoyer={justificatifs.envoyer}
              />
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
