'use client';

/**
 * Hook : contacts entreprise d'une société (fetch, CRUD, filtre).
 * Extrait de societes-view.tsx lors du découpage Vague 3 (comportement inchangé).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';

import { EntrepriseContact } from './types';

export function useContacts(selectedId: string | null) {
  const [contacts, setContacts] = useState<EntrepriseContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<EntrepriseContact | null>(null);
  const [contactSaving, setContactSaving] = useState(false);
  const [contactDeleteId, setContactDeleteId] = useState<string | null>(null);
  const [contactSearch, setContactSearch] = useState('');

  // Formulaire contact
  const [cFormNom, setCFormNom] = useState('');
  const [cFormPrenom, setCFormPrenom] = useState('');
  const [cFormFonction, setCFormFonction] = useState('');
  const [cFormTel, setCFormTel] = useState('');
  const [cFormEmail, setCFormEmail] = useState('');

  const fetchContacts = useCallback(async (societeId: string) => {
    setContactsLoading(true);
    try {
      const res = await fetch(`/api/entreprise-contacts?societeId=${societeId}`);
      if (res.ok) {
        const data = await res.json();
        setContacts(Array.isArray(data.contacts) ? data.contacts : []);
      }
    } catch { /* silent */ } finally {
      setContactsLoading(false);
    }
  }, []);

  // Charger les contacts quand la société sélectionnée change
  useEffect(() => {
    if (selectedId) fetchContacts(selectedId);
  }, [selectedId, fetchContacts]);

  const openNewContact = () => {
    setEditingContact(null);
    setCFormNom(''); setCFormPrenom(''); setCFormFonction(''); setCFormTel(''); setCFormEmail('');
    setContactFormOpen(true);
  };

  const openEditContact = (c: EntrepriseContact) => {
    setEditingContact(c);
    setCFormNom(c.nom); setCFormPrenom(c.prenom || ''); setCFormFonction(c.fonction || '');
    setCFormTel(c.telephone || ''); setCFormEmail(c.email || '');
    setContactFormOpen(true);
  };

  /** Message d'erreur lisible : gère {erreur} (routes métier) ET
   *  {error, details[]} (validation Zod) — avant : échec silencieux. */
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

  const handleSaveContact = async () => {
    if (!cFormNom.trim() || !selectedId) return;
    setContactSaving(true);
    try {
      const url = editingContact ? `/api/entreprise-contacts/${editingContact.id}` : '/api/entreprise-contacts';
      const method = editingContact ? 'PUT' : 'POST';
      const body: Record<string, unknown> = { nom: cFormNom.trim(), prenom: cFormPrenom.trim() || null, fonction: cFormFonction.trim() || null, telephone: cFormTel.trim() || null, email: cFormEmail.trim() || null };
      if (!editingContact) body.societeId = selectedId;
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        toast.success(editingContact ? 'Contact modifie.' : 'Contact ajoute.');
        setContactFormOpen(false);
        fetchContacts(selectedId);
      } else {
        // FIX : l'erreur était silencieuse — l'admin croyait le contact cree,
        // puis la creation du compte echouait avec « aucun contact » (422).
        let data: Record<string, unknown> = {};
        try { data = await res.json(); } catch { /* corps non JSON */ }
        toast.error(messageErreur(data, "Erreur lors de l'enregistrement du contact."));
      }
    } catch {
      toast.error('Erreur reseau');
    } finally {
      setContactSaving(false);
    }
  };

  const handleDeleteContact = async (id: string) => {
    try {
      const res = await fetch(`/api/entreprise-contacts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedId) fetchContacts(selectedId);
      } else {
        let data: Record<string, unknown> = {};
        try { data = await res.json(); } catch { /* corps non JSON */ }
        toast.error(messageErreur(data, "Erreur lors de la suppression du contact."));
      }
    } catch {
      toast.error('Erreur reseau');
    }
    setContactDeleteId(null);
  };

  const filteredContacts = useMemo(() =>
    contacts.filter(c => {
      const q = contactSearch.toLowerCase();
      if (!q) return true;
      return `${c.nom} ${c.prenom || ''} ${c.fonction || ''} ${c.email || ''}`.toLowerCase().includes(q);
    }), [contacts, contactSearch]);

  return {
    contacts,
    filteredContacts,
    contactSearch,
    setContactSearch,
    contactsLoading,
    // Dialog formulaire
    contactFormOpen,
    setContactFormOpen,
    editingContact,
    contactSaving,
    openNewContact,
    openEditContact,
    handleSaveContact,
    // Dialog suppression
    contactDeleteId,
    setContactDeleteId,
    handleDeleteContact,
    // Champs du formulaire
    cFormNom,
    setCFormNom,
    cFormPrenom,
    setCFormPrenom,
    cFormFonction,
    setCFormFonction,
    cFormTel,
    setCFormTel,
    cFormEmail,
    setCFormEmail,
  };
}

export type ContactsState = ReturnType<typeof useContacts>;
