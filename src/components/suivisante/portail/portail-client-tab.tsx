'use client';

/**
 * Onglet « Portail Client (Aperçu) » : recherche publique de dossiers par
 * numéro ou nom, squelette de chargement, états erreur / vide / initial et
 * cartes de résultats. Extrait tel quel de l'ancien monolithe
 * portail-view.tsx.
 */
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, FileText } from 'lucide-react';
import type { PortailDossier } from './types';
import DossierClientCard from './dossier-client-card';

export default function PortailClientTab() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PortailDossier[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const res = await fetch('/api/portail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setResults([]);
      } else {
        setResults(data.results || []);
      }
    } catch {
      setError('Erreur de connexion au serveur');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Formulaire de recherche */}
      <Card className="border-emerald-100 dark:border-emerald-800">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Numéro de dossier ou nom du bénéficiaire
              </label>
              <Input
                placeholder="Ex : DOS-2026-000042 ou Rakoto"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="h-10"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleSearch}
                disabled={loading || !query.trim()}
                className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Search className="h-4 w-4 mr-2" />
                {loading ? 'Recherche...' : 'Rechercher'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Résultats */}
      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Card key={i} className="border-emerald-100 dark:border-emerald-800">
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((j) => (
                    <Skeleton key={j} className="h-8 w-8 rounded-full" />
                  ))}
                </div>
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {error && (
        <Card className="border-red-100 bg-red-50 dark:bg-red-950/40/50">
          <CardContent className="p-4">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && searched && results.length === 0 && (
        <Card className="border-border">
          <CardContent className="p-6 text-center">
            <Search className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              Aucun dossier trouvé pour votre recherche. Vérifiez votre numéro de dossier ou nom.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {results.length} dossier{results.length > 1 ? 's' : ''} trouvé{results.length > 1 ? 's' : ''}
          </p>
          {results.map((d) => (
            <DossierClientCard key={d.numeroDossier} dossier={d} />
          ))}
        </div>
      )}

      {!searched && !loading && (
        <Card className="border-dashed border-border">
          <CardContent className="p-8 text-center">
            <FileText className="h-10 w-10 mx-auto text-emerald-400 mb-3" />
            <p className="text-sm font-medium text-foreground">Recherchez votre dossier</p>
            <p className="text-xs text-muted-foreground mt-1">
              Entrez votre numéro de dossier ou votre nom pour suivre l&apos;état de votre remboursement.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
