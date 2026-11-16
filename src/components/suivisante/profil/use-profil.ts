'use client';

/**
 * Hook de la vue Profil (refactoring P2 — extrait du monolithe
 * profil-view.tsx) : chargement du profil (/api/profil) et de l'historique
 * des modifications (/api/profil/historique), changement de mot de passe
 * (politique partagée motDePasseSchema) et sélection d'avatar. Les actions
 * rafraîchissent automatiquement les données concernées.
 */
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { motDePasseSchema } from '@/lib/validation';
import type { HistoriqueEntry, ProfilData } from './types';

export function useProfil() {
  const [profil, setProfil] = useState<ProfilData | null>(null);
  const [loading, setLoading] = useState(true);

  // Historique
  const [historique, setHistorique] = useState<HistoriqueEntry[]>([]);
  const [loadingHistorique, setLoadingHistorique] = useState(true);

  // Mot de passe
  const [ancienMdp, setAncienMdp] = useState('');
  const [nouveauMdp, setNouveauMdp] = useState('');
  const [confirmMdp, setConfirmMdp] = useState('');
  const [submittingMdp, setSubmittingMdp] = useState(false);

  // Avatar
  const [avatarLoading, setAvatarLoading] = useState(false);

  // ─── Fetch profil ────────────────────────────────────────────────────────

  const fetchProfil = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/profil');
      if (res.status === 401) return;
      if (!res.ok) {
        toast.error('Erreur de chargement du profil');
        return;
      }
      const data = await res.json();
      setProfil(data.utilisateur);
    } catch {
      toast.error('Erreur de chargement du profil');
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Fetch historique ────────────────────────────────────────────────────

  const fetchHistorique = useCallback(async () => {
    try {
      setLoadingHistorique(true);
      const res = await fetch('/api/profil/historique');
      if (res.status === 401) return;
      if (!res.ok) return;
      const data = await res.json();
      setHistorique(data.entries || []);
    } catch {
      // silencieux
    } finally {
      setLoadingHistorique(false);
    }
  }, []);

  useEffect(() => {
    fetchProfil();
    fetchHistorique();
  }, [fetchProfil, fetchHistorique]);

  // ─── Changement mot de passe ─────────────────────────────────────────────

  async function handleChangeMdp(e: React.FormEvent) {
    e.preventDefault();
    if (nouveauMdp !== confirmMdp) {
      toast.error('La confirmation ne correspond pas au nouveau mot de passe');
      return;
    }
    // Politique partagée (validations/common) : min 8 + lettre + chiffre
    const mdpCheck = motDePasseSchema.safeParse(nouveauMdp);
    if (!mdpCheck.success) {
      toast.error(mdpCheck.error.issues[0]?.message || 'Mot de passe invalide');
      return;
    }
    setSubmittingMdp(true);
    try {
      const res = await fetch('/api/profil/changer-mot-de-passe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ancienMotDePasse: ancienMdp, nouveauMotDePasse: nouveauMdp }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.erreur || 'Erreur'); return; }
      toast.success('Mot de passe modifié avec succès');
      setAncienMdp(''); setNouveauMdp(''); setConfirmMdp('');
      fetchHistorique(); // rafraîchir l'historique
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setSubmittingMdp(false);
    }
  }

  // ─── Changement avatar ───────────────────────────────────────────────────

  async function handleChangeAvatar(key: string | null) {
    setAvatarLoading(true);
    try {
      const res = await fetch('/api/profil/avatar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar: key }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.erreur || 'Erreur'); return; }
      toast.success(key ? 'Avatar mis à jour' : 'Avatar supprimé');
      fetchProfil(); // rafraîchir le profil
      fetchHistorique(); // rafraîchir l'historique
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setAvatarLoading(false);
    }
  }

  return {
    profil, loading,
    historique, loadingHistorique,
    ancienMdp, setAncienMdp,
    nouveauMdp, setNouveauMdp,
    confirmMdp, setConfirmMdp,
    submittingMdp, handleChangeMdp,
    avatarLoading, handleChangeAvatar,
  };
}
