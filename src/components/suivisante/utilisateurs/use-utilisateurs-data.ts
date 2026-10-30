'use client';

/**
 * Hook Utilisateurs — état et traitements de la gestion des comptes :
 * listing filtré côté serveur (jamais vidé sur erreur serveur), création/
 * édition (POST/PUT), bascule d'activation (PATCH), suppression en deux
 * temps, référentiel des sociétés et vérification de liaison en direct des
 * comptes CONTACT_ENTREPRISE (débounce 400 ms sur l'e-mail). Extraits tels
 * quels de l'ancien monolithe utilisateurs-view.tsx.
 */
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import type { Utilisateur, FormData, SocieteRef, LiaisonInfo } from './types';
import { EMPTY_FORM } from './types';

export function useUtilisateursData() {
  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtreRole, setFiltreRole] = useState('');
  const [filtreActif, setFiltreActif] = useState('');

  // Dialog etat
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Utilisateur | null>(null);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Liaison CONTACT_ENTREPRISE : référentiel sociétés + vérification en direct
  const [societes, setSocietes] = useState<SocieteRef[]>([]);
  const [liaison, setLiaison] = useState<LiaisonInfo | null>(null);

  // Suppression
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ─── Fetch ────────────────────────────────────────────────────────────────

  const fetchUtilisateurs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (filtreRole) params.set('role', filtreRole);
      if (filtreActif !== '') params.set('actif', filtreActif);

      const res = await fetch(`/api/utilisateurs?${params.toString()}`);
      if (res.status === 401 || res.status === 403) return;
      // Ne JAMAIS vider la liste sur une erreur serveur : un 500 ici
      // (« Aucun utilisateur trouvé » pour tous les comptes, sept. 2026)
      // doit rester visible comme une erreur, pas comme une liste vide.
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(
          data && typeof data === 'object'
            ? messageErreur(data as Record<string, unknown>, 'Erreur lors du chargement des utilisateurs')
            : `Erreur ${res.status} lors du chargement des utilisateurs`
        );
        return;
      }
      setUtilisateurs(Array.isArray(data?.utilisateurs) ? data.utilisateurs : []);
    } catch {
      toast.error('Erreur de chargement des utilisateurs');
    } finally {
      setLoading(false);
    }
  }, [search, filtreRole, filtreActif]);

  useEffect(() => { fetchUtilisateurs(); }, [fetchUtilisateurs]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  // Référentiel sociétés (chargé une fois, pour la liaison Contact Entreprise)
  async function ensureSocietes() {
    if (societes.length > 0) return;
    try {
      const res = await fetch('/api/societes');
      if (res.ok) {
        const data = await res.json();
        setSocietes(Array.isArray(data.societes) ? data.societes : []);
      }
    } catch { /* silencieux : le sélecteur restera vide */ }
  }

  // Vérification de liaison en direct pour CONTACT_ENTREPRISE : l'e-mail saisi
  // correspond-il à un contact d'entreprise existant ? (débounce 400 ms)
  useEffect(() => {
    if (!dialogOpen || formData.role !== 'CONTACT_ENTREPRISE') {
      setLiaison(null);
      return;
    }
    const email = formData.email.trim();
    if (!email) {
      setLiaison({ etat: 'VERIFIE', detail: '' });
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/entreprise-contacts');
        if (!res.ok) {
          setLiaison(null);
          return;
        }
        const data = await res.json();
        const contacts = Array.isArray(data.contacts) ? data.contacts : [];
        const trouve = contacts.find(
          (c: { email?: string | null }) => (c.email || '').trim().toLowerCase() === email.toLowerCase()
        );
        if (trouve) {
          const nomSociete = trouve.societe?.nom || 'société inconnue';
          setLiaison({ etat: 'TROUVE', detail: `Contact existant : ${trouve.prenom ? trouve.prenom + ' ' : ''}${trouve.nom} — ${nomSociete}` });
        } else if (formData.societeId) {
          setLiaison({ etat: 'CREABLE', detail: "Aucun contact avec cet e-mail : le contact sera créé automatiquement dans la société sélectionnée à l'enregistrement." });
        } else {
          setLiaison({ etat: 'BLOQUE', detail: "Aucun contact d'entreprise avec cet e-mail : sélectionnez la société du représentant ci-dessous pour créer la liaison automatiquement." });
        }
      } catch {
        setLiaison(null);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [dialogOpen, formData.role, formData.email, formData.societeId]);

  function openCreateDialog() {
    setEditingUser(null);
    setFormData(EMPTY_FORM);
    setShowPassword(false);
    setLiaison(null);
    setDialogOpen(true);
    ensureSocietes();
  }

  function openEditDialog(user: Utilisateur) {
    setEditingUser(user);
    setFormData({
      email: user.email,
      nom: user.nom,
      password: '',
      role: user.role,
      societeId: '',
    });
    setShowPassword(false);
    setLiaison(null);
    setDialogOpen(true);
    ensureSocietes();
  }

  /** Message d'erreur lisible : gère {erreur} (routes métier) ET
   *  {error, details[]} (validation Zod — auparavant avalé par le toast). */
  function messageErreur(data: Record<string, unknown>, defaut: string): string {
    if (typeof data?.erreur === 'string' && data.erreur) return data.erreur;
    if (typeof data?.error === 'string' && data.error) {
      const details = Array.isArray(data.details) ? data.details : [];
      const premier = details[0] as { champ?: string; message?: string } | undefined;
      if (premier?.message) {
        const champ = premier.champ && premier.champ !== '(racine)' ? `${premier.champ} : ` : '';
        return `${data.error} — ${champ}${premier.message}`;
      }
      return data.error;
    }
    return defaut;
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      const isEdit = !!editingUser;
      const url = '/api/utilisateurs';
      const method = isEdit ? 'PUT' : 'POST';

      const body: Record<string, unknown> = {
        email: formData.email,
        nom: formData.nom,
        role: formData.role,
      };

      // CONTACT_ENTREPRISE : transmettre la société pour la création en une
      // étape du contact lié (ignoré par l'API si un contact existe déjà).
      if (formData.role === 'CONTACT_ENTREPRISE' && formData.societeId) {
        body.societeId = formData.societeId;
      }

      if (isEdit) {
        body.id = editingUser.id;
        if (formData.password) body.password = formData.password;
      } else {
        body.password = formData.password;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(messageErreur(data, "Erreur lors de l'operation"));
        return;
      }

      toast.success(data.message || (isEdit ? 'Utilisateur modifie.' : 'Utilisateur cree.'));
      setDialogOpen(false);
      fetchUtilisateurs();
    } catch {
      toast.error('Erreur reseau');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActif(user: Utilisateur) {
    const newActif = !user.actif;
    const action = newActif ? 'activer' : 'desactiver';

    try {
      const res = await fetch('/api/utilisateurs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, actif: newActif }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.erreur || `Erreur lors de l'${action}ion`);
        return;
      }
      toast.success(data.message || `Utilisateur ${action}.`);
      fetchUtilisateurs();
    } catch {
      toast.error('Erreur reseau');
    }
  }

  async function supprimer(id: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/utilisateurs?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.erreur || 'Erreur lors de la suppression');
        return;
      }
      toast.success(data.message || 'Utilisateur supprime.');
      setDeleteConfirm(null);
      fetchUtilisateurs();
    } catch {
      toast.error('Erreur reseau');
    } finally {
      setDeleting(false);
    }
  }

  return {
    // données + filtres
    utilisateurs, loading, search, setSearch, filtreRole, setFiltreRole, filtreActif, setFiltreActif,
    // dérivés
    totalUsers: utilisateurs.length,
    actifs: utilisateurs.filter(u => u.actif).length,
    inactifs: utilisateurs.filter(u => !u.actif).length,
    lockedUsers: utilisateurs.filter(
      u => u.lockoutUntil && new Date(u.lockoutUntil) > new Date()
    ).length,
    // dialog / formulaire
    dialogOpen, setDialogOpen, editingUser, formData, setFormData,
    submitting, showPassword, setShowPassword,
    openCreateDialog, openEditDialog, enregistrer,
    // liaison CONTACT_ENTREPRISE
    societes, liaison,
    // actions ligne
    toggleActif, supprimer, deleteConfirm, setDeleteConfirm, deleting,
  };
}
