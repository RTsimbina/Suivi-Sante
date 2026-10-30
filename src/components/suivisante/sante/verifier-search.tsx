'use client';

/**
 * Barre de recherche d'assuré avec liste d'autocomplétion cliquable
 * (présentateur pur — aucun état, aucun fetch ; extraits tels quels de
 * l'ancien monolithe sante-view.tsx).
 */
import { Search, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { SearchResult } from './types';

interface VerifierSearchProps {
  query: string;
  loading: boolean;
  searchResults: SearchResult[];
  showResults: boolean;
  onSearch: (value: string) => void;
  onVerifier: (identifiant: string) => void;
  onResultClick: (r: SearchResult) => void;
}

export default function VerifierSearch({
  query, loading, searchResults, showResults,
  onSearch, onVerifier, onResultClick,
}: VerifierSearchProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par N° SS, nom, prénom, email ou téléphone..."
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onVerifier(query)}
            className="pl-10 pr-24"
            disabled={loading}
          />
          <Button
            onClick={() => onVerifier(query)}
            disabled={loading || query.length < 2}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-emerald-600 hover:bg-emerald-700 h-7 text-xs px-3"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
            Vérifier
          </Button>

          {/* Autocomplétion */}
          {showResults && searchResults.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {searchResults.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onResultClick(r)}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted transition-colors text-left cursor-pointer"
                >
                  <div>
                    <p className="text-sm font-medium">{r.nom} {r.prenom}</p>
                    <p className="text-xs text-muted-foreground">{r.nSS || '—'} · {r.societe.nom}</p>
                  </div>
                  <Badge variant={r.actif ? 'outline' : 'destructive'} className="text-[10px]">
                    {r.actif ? 'Actif' : 'Inactif'}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
