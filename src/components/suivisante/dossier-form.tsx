'use client';

import { useState, useRef, useCallback, type FormEvent, useEffect } from 'react';
import { Plus, Upload, X, Loader2, FileText, Calculator, AlertTriangle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

interface Societe { id: string; nom: string; }
interface Gestionnaire { id: string; nom: string; service: string; }
interface AssureOption { id: string; nom: string; prenom: string | null; nSS: string | null; societeId: string; }
interface PrestataireOption { id: string; nom: string; type: string; actif?: boolean; }

interface CalculResult {
  bareme: string;
  tauxCouverture: number;
  plafond: number;
  calcul: {
    montantRembourse: number;
    ticketModerateur: number;
  };
  plafondAtteint: boolean;
  explication: string;
}

const TYPES = [
  { value: 'HOSPITALISATION', label: 'Hospitalisation' },
  { value: 'CONSULTATION', label: 'Consultation' },
  { value: 'PHARMACIE', label: 'Pharmacie' },
  { value: 'MATERNITE', label: 'Maternité' },
  { value: 'CHIRURGIE', label: 'Chirurgie' },
  { value: 'EXAMEN', label: 'Examen' },
  { value: 'SOINS DENTAIRES', label: 'Soins Dentaires' },
  { value: 'OPTIQUE', label: 'Optique' },
];

const MOYENS = [
  { value: 'VIREMENT', label: 'Virement bancaire' },
  { value: 'CHEQUE', label: 'Chèque' },
  { value: 'ESPECES', label: 'Espèces' },
  { value: 'MOBILE_MONEY', label: 'Mobile Money' },
  { value: 'AUTRE', label: 'Autre' },
];

const CATEGORIES = [
  { value: 'REMBOURSEMENT_ASSURE', label: 'Remboursement assuré' },
  { value: 'REGLEMENT_PRESTATAIRE', label: 'Règlement prestataire' },
];

const JUSTIF_TYPES = ['FACTURE', 'ORDONNANCE', 'RIB', 'CARNET_SOINS', 'DECOMPTE', 'AUTRE'];
const JUSTIF_LABELS: Record<string, string> = { FACTURE: 'Facture', ORDONNANCE: 'Ordonnance', RIB: 'RIB', CARNET_SOINS: 'Carnet de soins', DECOMPTE: 'Décompte', AUTRE: 'Autre' };

interface UploadedFile { file: File; type: string; id: string; }

interface DossierFormProps {
  onSuccess?: () => void;
  defaultCategorie?: 'REMBOURSEMENT_ASSURE' | 'REGLEMENT_PRESTATAIRE';
}

export default function DossierForm({ onSuccess, defaultCategorie }: DossierFormProps) {
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
      const res = await fetch('/api/technique/baremes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          societeId,
          prestation: typeDossier,
          montantReclame: parseFloat(montantReclame),
        }),
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
  }, [societeId, typeDossier, montantReclame]);

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
  }, [societeId, typeDossier, montantReclame, fetchCalcul]);

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

  function formatAr(amount: number) {
    return amount.toLocaleString('fr-FR') + ' Ar';
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!beneficiaire || !societeId || !typeDossier || !montantReclame) {
      toast.error('Veuillez remplir les champs obligatoires (*)');
      return;
    }
    setLoading(true);
    try {
      // Générer numéro de dossier
      const count = await fetch('/api/dossiers?limit=1').then(r => r.json());
      const total = count.pagination?.total || 0;
      const numeroDossier = `DOS-2026-${String(total + 1).padStart(6, '0')}`;

      const postData: Record<string, unknown> = {
        numeroDossier,
        dateReception: new Date().toISOString().split('T')[0],
        societeId,
        beneficiaire,
        typeDossier,
        categorieDossier: categorieDossier || undefined,
        montantReclame: parseFloat(montantReclame),
        gestionnaireAccueilId: gestionnaires[0]?.id || null,
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
        throw new Error(err.error || 'Erreur de création');
      }

      const dossier = await res.json();

      // Mettre à jour les champs additionnels
      const updateData: Record<string, unknown> = {};
      if (assure) updateData.assureId = assure;
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

      toast.success(`Dossier ${numeroDossier} créé avec succès`);
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

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Plus className="size-5 text-emerald-600" />
          {categorieDossier === 'REGLEMENT_PRESTATAIRE'
            ? 'Nouveau dossier — Règlement Prestataire'
            : categorieDossier === 'REMBOURSEMENT_ASSURE'
              ? 'Nouveau dossier — Remboursement Assuré'
              : 'Nouveau dossier'}
        </h3>

        {/* Section 1: Bénéficiaire */}
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-foreground">Informations du bénéficiaire</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Bénéficiaire *</Label>
              <Input value={beneficiaire} onChange={e => setBeneficiaire(e.target.value)} placeholder="Nom complet" required />
            </div>
            <div className="space-y-1.5">
              <Label>Assuré</Label>
              <select value={assure} onChange={e => {
                const sel = e.target.value;
                setAssure(sel);
                const found = assuresList.find(a => a.id === sel);
                if (found) {
                  setNSS(found.nSS || '');
                  if (!societeId && found.societeId) setSocieteId(found.societeId);
                }
              }} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors">
                <option value="">Sélectionner...</option>
                {assuresList.filter(a => !societeId || a.societeId === societeId).map(a => (
                  <option key={a.id} value={a.id}>{a.prenom ? `${a.prenom} ${a.nom}` : a.nom}{a.nSS ? ` (${a.nSS})` : ''}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>N° Sécurité Sociale</Label>
              <Input value={nSS} onChange={e => setNSS(e.target.value)} placeholder="SS-XXXXXX" />
            </div>
            <div className="space-y-1.5">
              <Label>Entreprise cliente *</Label>
              <select value={societeId} onChange={e => setSocieteId(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors" required>
                <option value="">Sélectionner...</option>
                {societes.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Date des soins</Label>
              <Input type="date" value={dateSoins} onChange={e => setDateSoins(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Prestataire médical</Label>
              <select value={prestataire} onChange={e => setPrestataire(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors">
                <option value="">Sélectionner...</option>
                {prestatairesList.filter(p => p.actif !== false).map(p => (
                  <option key={p.id} value={p.id}>{p.nom} ({p.type})</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <Separator />

        {/* Section 2: Dossier */}
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-foreground">Détails du dossier</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Type de soins *</Label>
              <select value={typeDossier} onChange={e => setTypeDossier(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors" required>
                <option value="">Sélectionner...</option>
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Catégorie</Label>
              <select value={categorieDossier} onChange={e => setCategorieDossier(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors">
                <option value="">Sélectionner...</option>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Montant réclamé (Ar) *</Label>
              <Input type="number" step="0.01" value={montantReclame} onChange={e => setMontantReclame(e.target.value)} placeholder="0.00" required />
            </div>
            <div className="space-y-1.5">
              <Label>Moyen de paiement</Label>
              <select value={moyenPaiement} onChange={e => setMoyenPaiement(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors">
                <option value="">Sélectionner...</option>
                {MOYENS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Auto-calculation: Ticket modérateur */}
        {calculLoading && (
          <div className="flex items-center gap-2 text-sm text-emerald-600">
            <Loader2 className="size-4 animate-spin" />
            <span>Calcul du ticket modérateur en cours...</span>
          </div>
        )}

        {!calculLoading && calculResult && (
          <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-teal-50/60 overflow-hidden">
            <div className="p-4 space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                  <Calculator className="size-4" />
                  <Sparkles className="size-3.5 text-amber-500" />
                  <span>Calcul automatique</span>
                </div>
                {calculResult.plafondAtteint && (
                  <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50 gap-1">
                    <AlertTriangle className="size-3" />
                    Plafond atteint
                  </Badge>
                )}
              </div>

              {/* Barème info */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-emerald-700/80">
                <span><span className="font-medium text-emerald-800">Barème :</span> {calculResult.bareme}</span>
                <span><span className="font-medium text-emerald-800">Taux de couverture :</span> {calculResult.tauxCouverture}%</span>
                <span><span className="font-medium text-emerald-800">Plafond :</span> {formatAr(calculResult.plafond)}</span>
              </div>

              {/* Two columns: Montant remboursé / Ticket modérateur */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-emerald-100/70 border border-emerald-200/60 p-3 text-center">
                  <p className="text-xs font-medium text-emerald-700 mb-1">Montant remboursé</p>
                  <p className="text-lg font-bold text-emerald-700">{formatAr(calculResult.calcul.montantRembourse)}</p>
                </div>
                <div className="rounded-lg bg-amber-50/70 border border-amber-200/60 p-3 text-center">
                  <p className="text-xs font-medium text-amber-700 mb-1">Ticket modérateur</p>
                  <p className="text-lg font-bold text-amber-700">{formatAr(calculResult.calcul.ticketModerateur)}</p>
                </div>
              </div>

              {/* Explanation */}
              {calculResult.explication && (
                <p className="text-xs text-emerald-700/70 italic">{calculResult.explication}</p>
              )}
            </div>
          </Card>
        )}

        <Separator />

        {/* Section 3: Observations */}
        <div className="space-y-1.5">
          <Label>Observations</Label>
          <Textarea value={observations} onChange={e => setObservations(e.target.value)} placeholder="Observations éventuelles..." rows={3} />
        </div>

        <Separator />

        {/* Section 4: Justificatifs */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText className="size-4 text-emerald-600" />
            Justificatifs
          </h4>
          <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-4 text-center hover:border-emerald-400 transition-colors cursor-pointer" onClick={() => fileRef.current?.click()}>
            <Upload className="size-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">Cliquez pour ajouter des fichiers (PDF, JPG, PNG — max 10 Mo)</p>
            <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.gif,.webp" className="hidden" onChange={addFiles} />
          </div>
          {files.length > 0 && (
            <div className="space-y-2">
              {files.map(f => (
                <div key={f.id} className="flex items-center gap-2 rounded-md border p-2">
                  <FileText className="size-4 text-muted-foreground shrink-0" />
                  <span className="text-xs flex-1 truncate">{f.file.name}</span>
                  <select value={f.type} onChange={e => updateFileType(f.id, e.target.value)} className="h-7 text-xs rounded border bg-transparent px-1">
                    {JUSTIF_TYPES.map(t => <option key={t} value={t}>{JUSTIF_LABELS[t]}</option>)}
                  </select>
                  {uploadingFiles.includes(f.id) && <Loader2 className="size-3.5 animate-spin text-emerald-600" />}
                  <button type="button" onClick={() => removeFile(f.id)} className="text-red-500 hover:text-red-700">
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
            {loading ? <><Loader2 className="size-4 animate-spin mr-2" /> Enregistrement...</> : <><Plus className="size-4 mr-2" /> Enregistrer le dossier</>}
          </Button>
        </div>
      </form>
    </Card>
  );
}