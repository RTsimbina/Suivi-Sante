'use client';

/**
 * Hook du formulaire de création de dossier (refactoring P2 — extrait du
 * monolithe dossier-form.tsx) : référentiels (sociétés, gestionnaires,
 * assurés, prestataires), champs du formulaire, calcul debouncé du ticket
 * modérateur via /api/technique/baremes, gestion des justificatifs et
 * soumission séquencée (POST dossier + PATCH champs additionnels + uploads).
 * Le numéro de dossier est généré CÔTÉ SERVEUR (fix audit P2 : avant,
 * total+1 calculé ici sur la liste — source de doublons dès deux créations
 * simultanées).
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { getParentType } from '@/lib/prestations';
import type {
  Societe, Gestionnaire, AssureOption, PrestataireOption, CalculResult, UploadedFile,
} from './types';

interface UseDossierFormOptions {
  onSuccess?: () => void;
  defaultCategorie?: 'REMBOURSEMENT_ASSURE' | 'REGLEMENT_PRESTATAIRE';
}

export function useDossierForm({ onSuccess, defaultCategorie }: UseDossierFormOptions) {
  const [societes, setSocietes] = useState<Societe[]>([]);
  const [gestionnaires, setGestionnaires] = useState<Gestionnaire[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Champs du formulaire
  const [beneficiaire, setBeneficiaire] = useState('');
  const [assure, setAssure] = useState('');
  const [nSS, setNSS] = useState('');
  const [societeId, setSocieteId] = useState('');
  const [dateSoins, setDateSoins] = useState('');
  const [prestataire, setPrestataire] = useState('');
  const [assuresList, setAssuresList] = useState<AssureOption[]>([]);
  const [prestatairesList, setPrestatairesList] = useState<PrestataireOption[]>([]);
  const [typeDossier, setTypeDossier] = useState('');
  const [montantReclame, setMontantReclame] = useState('');
  const [moyenPaiement, setMoyenPaiement] = useState('');
  const [observations, setObservations] = useState('');
  const [categorieDossier, setCategorieDossier] = useState(defaultCategorie || '');
  const [files, setFiles] = useState<UploadedFile[]>([]);

  // Ticket modérateur auto-calculation
  const [calculResult, setCalculResult] = useState<CalculResult | null>(null);
  const [calculLoading, setCalculLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/dossiers/societes').then(r => r.json()).then(setSocietes).catch(() => {});
    fetch('/api/dossiers/gestionnaires?service=ACCUEIL').then(r => r.json()).then(setGestionnaires).catch(() => {});
    fetch('/api/assures?limit=200').then(r => r.json()).then(data => setAssuresList(data.assures || [])).catch(() => {});
    fetch('/api/prestataires?limit=200').then(r => r.json()).then(data => setPrestatairesList(data.prestataires || [])).catch(() => {});
  }, []);

  // Debounced barème calculation
  const fetchCalcul = useCallback(async () => {
    if (!societeId || !typeDossier || !montantReclame || parseFloat(montantReclame) <= 0) {
      setCalculResult(null);
      return;
    }
    setCalculLoading(true);
    try {
      const baremesBody: Record<string, unknown> = {
          societeId,
          prestation: getParentType(typeDossier),
          montantReclame: parseFloat(montantReclame),
        };
        // Passer assureId et prestataireId pour la vérification du plafond annuel
        if (assure) baremesBody.assureId = assure;
        if (prestataire) baremesBody.prestataireId = prestataire;

      const res = await fetch('/api/technique/baremes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(baremesBody),
      });
      if (!res.ok) {
        setCalculResult(null);
        return;
      }
      const data = await res.json();
      setCalculResult(data);
    } catch {
      setCalculResult(null);
    } finally {
      setCalculLoading(false);
    }
  }, [societeId, typeDossier, montantReclame, assure, prestataire]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!societeId || !typeDossier || !montantReclame || parseFloat(montantReclame) <= 0) {
      setCalculResult(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      fetchCalcul();
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [societeId, typeDossier, montantReclame, assure, prestataire, fetchCalcul]);

  // Sélection d'un assuré : préremplit N° SS et société (comportement du monolithe)
  function choisirAssure(sel: string) {
    setAssure(sel);
    const found = assuresList.find(a => a.id === sel);
    if (found) {
      setNSS(found.nSS || '');
      if (!societeId && found.societeId) setSocieteId(found.societeId);
    }
  }

  function addFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const newFiles = Array.from(e.target.files || []);
    const uploaded: UploadedFile[] = newFiles.map(f => ({
      file: f, type: 'AUTRE', id: Math.random().toString(36).slice(2),
    }));
    setFiles(prev => [...prev, ...uploaded]);
    if (fileRef.current) fileRef.current.value = '';
  }

  function removeFile(id: string) { setFiles(prev => prev.filter(f => f.id !== id)); }
  function updateFileType(id: string, type: string) { setFiles(prev => prev.map(f => f.id === id ? { ...f, type } : f)); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!beneficiaire || !societeId || !typeDossier || !montantReclame) {
      toast.error('Veuillez remplir les champs obligatoires (*)');
      return;
    }
    setLoading(true);
    try {
      // FIX audit P2 : le numéro de dossier est généré CÔTÉ SERVEUR
      // (POST /api/dossiers — avant : total+1 calculé ici sur la liste,
      // source de doublons dès deux créations simultanées).
      const postData: Record<string, unknown> = {
        dateReception: new Date().toISOString().split('T')[0],
        societeId,
        beneficiaire,
        typeDossier,
        categorieDossier: categorieDossier || undefined,
        montantReclame: parseFloat(montantReclame),
        gestionnaireAccueilId: gestionnaires[0]?.id || null,
        assureId: assure || undefined,
        prestataireId: prestataire || undefined,
      };

      // Auto-fill ticket modérateur fields if calculation is available
      if (calculResult) {
        postData.montantValide = calculResult.calcul.montantRembourse;
        postData.ticketModerateur = calculResult.calcul.ticketModerateur;
      }

      const res = await fetch('/api/dossiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postData),
      });

      if (!res.ok) {
        const err = await res.json();
        // Afficher les erreurs de plafond de manière spécifique
        if (err.plafondAtteint) {
          throw new Error(err.error || 'Plafond de couverture atteint');
        }
        throw new Error(err.error || 'Erreur de création');
      }

      const dossier = await res.json();

      // Afficher les alertes de plafond dans un toast
      if (dossier.plafondCheck?.alertes?.length > 0) {
        for (const alerte of dossier.plafondCheck.alertes) {
          if (alerte.type === 'danger' || alerte.type === 'warning') {
            toast.warning(alerte.message);
          }
        }
      }

      // Mettre à jour les champs additionnels (ceux qui ne sont pas dans le POST)
      const updateData: Record<string, unknown> = {};
      if (nSS) updateData.nSS = nSS;
      if (prestataire) updateData.prestataireId = prestataire;
      if (dateSoins) updateData.dateSoins = new Date(dateSoins);
      if (moyenPaiement) updateData.moyenPaiement = moyenPaiement;
      if (observations) updateData.observations = observations;

      if (Object.keys(updateData).length > 0) {
        await fetch(`/api/dossiers/${dossier.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData),
        });
      }

      // Uploader les justificatifs
      if (files.length > 0) {
        setUploadingFiles(files.map(f => f.id));
        for (const f of files) {
          try {
            const fd = new FormData();
            fd.append('file', f.file);
            fd.append('dossierId', dossier.id);
            fd.append('type', f.type);
            await fetch('/api/upload', { method: 'POST', body: fd });
          } catch { /* skip individual errors */ }
          setUploadingFiles(prev => prev.filter(x => x !== f.id));
        }
      }

      toast.success(`Dossier ${dossier.numeroDossier} créé avec succès`);
      // Reset
      setBeneficiaire(''); setAssure(''); setNSS(''); setSocieteId(''); setDateSoins('');
      setPrestataire(''); setTypeDossier(''); setCategorieDossier(''); setMontantReclame(''); setMoyenPaiement(''); setObservations('');
      setFiles([]);
      setCalculResult(null);
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la création');
    } finally {
      setLoading(false);
    }
  }

  return {
    // référentiels
    societes, gestionnaires, assuresList, prestatairesList,
    // champs
    beneficiaire, setBeneficiaire,
    assure, choisirAssure,
    nSS, setNSS,
    societeId, setSocieteId,
    dateSoins, setDateSoins,
    prestataire, setPrestataire,
    typeDossier, setTypeDossier,
    montantReclame, setMontantReclame,
    moyenPaiement, setMoyenPaiement,
    observations, setObservations,
    categorieDossier, setCategorieDossier,
    // calcul
    calculResult, calculLoading,
    // justificatifs
    files, uploadingFiles, fileRef, addFiles, removeFile, updateFileType,
    // soumission
    loading, handleSubmit,
  };
}
