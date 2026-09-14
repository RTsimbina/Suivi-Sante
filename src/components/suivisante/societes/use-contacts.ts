'use client';

/**
 * Hook : contacts entreprise d'une société (fetch, CRUD, filtre).
 * Extrait de societes-view.tsx lors du découpage Vague 3 (comportement inchangé).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

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
        setContactFormOpen(false);
        fetchContacts(selectedId);
      }
    } catch { /* silent */ } finally {
      setContactSaving(false);
    }
  };

  const handleDeleteContact = async (id: string) => {
    try {
      const res = await fetch(`/api/entreprise-contacts/${id}`, { method: 'DELETE' });
      if (res.ok && selectedId) fetchContacts(selectedId);
    } catch { /* silent */ }
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
