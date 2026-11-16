'use client';

/**
 * Hook du détail dossier (refactoring P2 — extrait du monolithe
 * dossier-detail.tsx) : chargement via /api/dossiers/{id}/detail,
 * changement de statut (PATCH) et insertion locale d'un commentaire ajouté.
 */
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { statutLabel } from '../format';
import type { CommentaireWithAuteur, DossierDetail } from './types';

interface UseDossierDetailOptions {
  dossierId: string;
  onClose: () => void;
}

export function useDossierDetail({ dossierId, onClose }: UseDossierDetailOptions) {
  const { toast } = useToast();
  const [dossier, setDossier] = useState<DossierDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const rafraichir = useCallback(async () => {
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
    rafraichir();
  }, [rafraichir]);

  // Le commentaire ajouté est inséré localement (comportement du monolithe :
  // la liste est complétée sans rechargement complet du dossier).
  const insererCommentaire = useCallback((nouveau: CommentaireWithAuteur) => {
    setDossier((prev) => prev ? { ...prev, commentaires: [...prev.commentaires, nouveau] } : prev);
  }, []);

  const changerStatut = useCallback(async (nouveauStatut: string) => {
    try {
      const res = await fetch(`/api/dossiers/${dossierId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: nouveauStatut }),
      });
      if (res.ok) {
        rafraichir();
        toast({ title: 'Statut mis à jour', description: statutLabel(nouveauStatut) });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de changer le statut', variant: 'destructive' });
    }
  }, [dossierId, rafraichir, toast]);

  return { dossier, loading, rafraichir, insererCommentaire, changerStatut };
}
