'use client';

/**
 * Hook d'upload des justificatifs (refactoring P2 — extrait du monolithe
 * dossier-detail.tsx) : état du formulaire (fichier, type, progression) +
 * envoi POST multipart /api/upload, remise à zéro du champ fichier puis
 * rafraîchissement du dossier via le callback onAjoute.
 */
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

interface UseDossierJustificatifsOptions {
  dossierId: string;
  onAjoute: () => void;
}

export function useDossierJustificatifs({ dossierId, onAjoute }: UseDossierJustificatifsOptions) {
  const { toast } = useToast();
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState('FACTURE');
  const [uploading, setUploading] = useState(false);

  const envoyer = async () => {
    if (!uploadFile || !dossierId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('dossierId', dossierId);
      formData.append('type', uploadType);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: 'Erreur', description: err.erreur || "Échec de l'upload", variant: 'destructive' });
        return;
      }
      toast({ title: 'Fichier ajouté', description: `${uploadFile.name} a été téléchargé avec succès` });
      setUploadFile(null);
      const fileInput = document.getElementById('upload-justificatif') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      onAjoute();
    } catch {
      toast({ title: 'Erreur réseau', description: "Impossible de télécharger le fichier", variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  return { uploadFile, setUploadFile, uploadType, setUploadType, uploading, envoyer };
}
