'use client';

/**
 * Hook du formulaire de commentaires (refactoring P2 — extrait du monolithe
 * dossier-detail.tsx) : état du brouillon (texte, visibilité) + envoi POST
 * /api/dossiers/{id}/commentaires, puis insertion locale via le callback
 * onAjoute fourni par le hook useDossierDetail.
 */
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { CommentaireWithAuteur } from './types';

interface UseDossierCommentairesOptions {
  dossierId: string;
  onAjoute: (commentaire: CommentaireWithAuteur) => void;
}

export function useDossierCommentaires({ dossierId, onAjoute }: UseDossierCommentairesOptions) {
  const { toast } = useToast();
  const [commentaire, setCommentaire] = useState('');
  const [commentPrive, setCommentPrive] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);

  const envoyer = async () => {
    if (!commentaire.trim()) return;
    setSendingComment(true);
    try {
      const res = await fetch(`/api/dossiers/${dossierId}/commentaires`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenu: commentaire, prive: commentPrive }),
      });
      if (res.ok) {
        const nouveau = await res.json();
        onAjoute(nouveau);
        setCommentaire('');
        toast({ title: 'Commentaire ajouté' });
      }
    } catch {
      toast({ title: 'Erreur', description: "Impossible d'ajouter le commentaire", variant: 'destructive' });
    } finally {
      setSendingComment(false);
    }
  };

  return {
    commentaire,
    setCommentaire,
    commentPrive,
    setCommentPrive,
    sendingComment,
    envoyer,
  };
}
