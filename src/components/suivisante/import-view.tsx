'use client';

import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from 'react';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, XCircle, Clock, History, FilePlus, Users, Building2, ClipboardList, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import DossierForm from './dossier-form';

// ─── Types ───────────────────────────────────────────────────────
interface Anomalie { ligne: number; type: 'erreur' | 'avertissement'; champ: string; message: string; }
interface ImportResult { importId: string; source: string; nomFichier: string; nbLignes: number; nbSucces: number; nbErreurs: number; tauxSucces: number; anomalies: Anomalie[]; }
interface HistoriqueItem { id: string; source: string; nomFichier: string; nbLignes: number; nbSucces: number; nbErreurs: number; createdAt: string; _count: { dossiers: number }; }

// ─── Composant zone d'import ────────────────────────────────────
function ImportZone({ source, categorie, label, description, columns, icon: Icon, accentColor }: {
  source: string; categorie: string; label: string; description: string;
  columns: string; icon: React.ElementType; accentColor: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleImport(e: FormEvent) {
    e.preventDefault();
    if (!file || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('source', source);
      if (categorie) fd.append('categorie', categorie);
      const res = await fetch('/api/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setResult(data);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) setFile(f);
  }

  return (
    <Card className="p-5">
      <h4 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
        <Icon className={`size-4 ${accentColor}`} />
        {label}
      </h4>
      <p className="text-xs text-muted-foreground mb-3">{description}</p>
      <form onSubmit={handleImport} className="space-y-3">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className={`rounded-lg border-2 border-dashed p-6 text-center hover:border-${accentColor.replace('text-', '')} hover:bg-muted/30 transition-colors cursor-pointer`}
          style={{ borderColor: file ? 'var(--color-primary)' : undefined }}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="size-6 mx-auto text-muted-foreground mb-1.5" />
          <p className="text-xs font-medium">{file ? file.name : 'Glissez ou cliquez'}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">.xlsx, .xls</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">Colonnes attendues : {columns}</p>
        <Button type="submit" disabled={!file || loading} size="sm" className="w-full" style={{ backgroundColor: accentColor.includes('blue') ? '#2563eb' : accentColor.includes('amber') ? '#d97706' : '#059669' }}>
          {loading ? 'Import en cours...' : 'Importer le fichier'}
        </Button>
      </form>
      {result && (
        <div className="mt-3 space-y-2 p-3 rounded-lg border bg-muted/20">
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div><p className="font-bold text-emerald-600">{result.nbSucces}</p><p className="text-muted-foreground">Succès</p></div>
            <div><p className="font-bold text-red-600">{result.nbErreurs}</p><p className="text-muted-foreground">Erreurs</p></div>
            <div><p className="font-bold">{result.tauxSucces}%</p><p className="text-muted-foreground">Taux</p></div>
          </div>
          {result.anomalies.length > 0 && (
            <div className="max-h-28 overflow-y-auto space-y-1">
              {result.anomalies.slice(0, 5).map((a, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[10px]">
                  {a.type === 'erreur' ? <XCircle className="size-3 text-red-500 shrink-0 mt-0.5" /> : <AlertTriangle className="size-3 text-amber-500 shrink-0 mt-0.5" />}
                  <span>Ligne {a.ligne}: {a.message}</span>
                </div>
              ))}
              {result.anomalies.length > 5 && <p className="text-[10px] text-muted-foreground">...et {result.anomalies.length - 5} autres</p>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Composant résultat import ──────────────────────────────────
function ResultBanner({ result }: { result: ImportResult }) {
  return (
    <div className="p-4 rounded-lg border bg-emerald-50 dark:bg-emerald-950/40/50 border-emerald-200 dark:border-emerald-800 flex items-center gap-3">
      <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />
      <div className="flex-1 text-sm">
        <span className="font-semibold">{result.nbSucces}/{result.nbLignes}</span> lignes importées
        {result.nbErreurs > 0 && <span className="text-red-600 ml-2">({result.nbErreurs} erreurs)</span>}
      </div>
      <Badge variant="outline" className="text-xs">{result.tauxSucces}%</Badge>
    </div>
  );
}

// ─── Vue principale ─────────────────────────────────────────────
export default function ImportView() {
  const [historique, setHistorique] = useState<HistoriqueItem[]>([]);
  // États séparés pour chaque dialogue de saisie manuelle
  const [showManualRemboursement, setShowManualRemboursement] = useState(false);
  const [showManualReglement, setShowManualReglement] = useState(false);
  const [formKeyRemb, setFormKeyRemb] = useState(0);
  const [formKeyRegl, setFormKeyRegl] = useState(0);

  async function loadHistorique() {
    try {
      const res = await fetch('/api/import');
      const data = await res.json();
      setHistorique(data.historiques || []);
    } catch { /* silent */ }
  }

  useEffect(() => { loadHistorique(); }, []);

  // Colonnes Excel communes pour les deux flux
  const colonnesCommunes = "NumeroDossier, Beneficiaire, Societe, TypeDossier, MontantReclame, DateReception, CategorieDossier";

  function handleRemboursementCreated() {
    setShowManualRemboursement(false);
    setFormKeyRemb(k => k + 1);
    loadHistorique();
  }

  function handleReglementCreated() {
    setShowManualReglement(false);
    setFormKeyRegl(k => k + 1);
    loadHistorique();
  }

  return (
    <div className="space-y-6">

      {/* ── EN-TÊTE : Deux flux métier ── */}
      <div>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-1">
          <ClipboardList className="size-5 text-emerald-600" />
          Accueil — Enregistrement des dossiers
        </h2>
        <p className="text-sm text-muted-foreground">
          Deux flux d&apos;entrée : les dossiers de remboursement des assurés et les règlements des prestataires.
          Chaque flux peut être enregistré par importation Excel ou par saisie manuelle.
        </p>
      </div>

      {/* ── FLUX 1 : Remboursement Assuré ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">Flux 1 — Remboursement Assuré</h3>
          <Badge className="bg-blue-100 text-blue-700 dark:text-blue-300 text-[10px] border-0">Dossiers venant des assurés des entreprises clientes</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ImportZone
            source="EXCEL"
            categorie="REMBOURSEMENT_ASSURE"
            label="Import Excel — Remboursement"
            description="Crée les dossiers de remboursement déposés par les assurés. Catégorie automatique : REMBOURSEMENT_ASSURE."
            columns={colonnesCommunes}
            icon={FileSpreadsheet}
            accentColor="text-blue-600"
          />
          <Card className="p-5 flex flex-col items-center justify-center text-center space-y-3 border-dashed border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40/30">
            <Plus className="size-8 text-blue-400" />
            <div>
              <h4 className="text-sm font-semibold text-foreground">Saisie manuelle — Remboursement</h4>
              <p className="text-xs text-muted-foreground mt-1">Enregistrer un dossier de remboursement assuré directement via le formulaire.</p>
            </div>
            <Button variant="outline" className="border-blue-300 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:bg-blue-950/40" onClick={() => setShowManualRemboursement(true)}>
              <FilePlus className="size-4 mr-1.5" />
              Nouveau dossier remboursement
            </Button>
          </Card>
        </div>
      </div>

      {/* ── FLUX 2 : Règlement Prestataire ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-amber-600" />
          <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide">Flux 2 — Règlement Prestataire</h3>
          <Badge className="bg-amber-100 text-amber-700 dark:text-amber-300 text-[10px] border-0">Factures venant des prestataires de santé</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ImportZone
            source="EXCEL"
            categorie="REGLEMENT_PRESTATAIRE"
            label="Import Excel — Règlement"
            description="Crée les dossiers de règlement des prestataires (hôpitaux, cliniques, pharmacies...). Catégorie automatique : REGLEMENT_PRESTATAIRE."
            columns={colonnesCommunes}
            icon={FileSpreadsheet}
            accentColor="text-amber-600"
          />
          <Card className="p-5 flex flex-col items-center justify-center text-center space-y-3 border-dashed border-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40/30">
            <Plus className="size-8 text-amber-400" />
            <div>
              <h4 className="text-sm font-semibold text-foreground">Saisie manuelle — Règlement</h4>
              <p className="text-xs text-muted-foreground mt-1">Enregistrer une facture de prestataire pour règlement directement via le formulaire.</p>
            </div>
            <Button variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:bg-amber-950/40" onClick={() => setShowManualReglement(true)}>
              <FilePlus className="size-4 mr-1.5" />
              Nouveau dossier règlement
            </Button>
          </Card>
        </div>
      </div>

      {/* ── DIALOGUE : Saisie manuelle Remboursement Assuré ── */}
      <Dialog open={showManualRemboursement} onOpenChange={setShowManualRemboursement}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="size-5 text-blue-600" />
              Nouveau dossier — Remboursement Assuré
            </DialogTitle>
          </DialogHeader>
          <DossierForm key={formKeyRemb} onSuccess={handleRemboursementCreated} defaultCategorie="REMBOURSEMENT_ASSURE" />
        </DialogContent>
      </Dialog>

      {/* ── DIALOGUE : Saisie manuelle Règlement Prestataire ── */}
      <Dialog open={showManualReglement} onOpenChange={setShowManualReglement}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="size-5 text-amber-600" />
              Nouveau dossier — Règlement Prestataire
            </DialogTitle>
          </DialogHeader>
          <DossierForm key={formKeyRegl} onSuccess={handleReglementCreated} defaultCategorie="REGLEMENT_PRESTATAIRE" />
        </DialogContent>
      </Dialog>

      {/* ── HISTORIQUE DES IMPORTS ── */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <History className="size-5 text-emerald-600" />
            Historique des imports
          </h3>
          <Button variant="outline" size="sm" onClick={loadHistorique}>Actualiser</Button>
        </div>
        {historique.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Aucun import effectué.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4 font-medium text-muted-foreground">Date</th>
                  <th className="py-2 pr-4 font-medium text-muted-foreground">Fichier</th>
                  <th className="py-2 pr-4 font-medium text-muted-foreground">Source</th>
                  <th className="py-2 pr-4 font-medium text-muted-foreground text-right">Lignes</th>
                  <th className="py-2 pr-4 font-medium text-muted-foreground text-right">Succès</th>
                  <th className="py-2 font-medium text-muted-foreground text-right">Erreurs</th>
                </tr>
              </thead>
              <tbody>
                {historique.map((h) => (
                  <tr key={h.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 text-muted-foreground">{new Date(h.createdAt).toLocaleDateString('fr-FR')}</td>
                    <td className="py-2 pr-4 font-medium">{h.nomFichier}</td>
                    <td className="py-2 pr-4"><Badge variant="outline" className="text-xs">{h.source}</Badge></td>
                    <td className="py-2 pr-4 text-right">{h.nbLignes}</td>
                    <td className="py-2 pr-4 text-right text-emerald-600 font-medium">{h.nbSucces}</td>
                    <td className="py-2 text-right text-red-600 font-medium">{h.nbErreurs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}