'use client';

/**
 * Hook Contrôle Santé — recherche d'assurés (autocomplétion) et vérification
 * complète des droits (plafonds, consommation, alertes). Extraits tels quels
 * de l'ancien monolithe sante-view.tsx. La remise à zéro du simulateur et de
 * l'historique des actes à chaque nouvelle vérification est orchestrée par la
 * vue mère (sante-view.tsx), qui combine `verifier()` avec les hooks frères.
 */
import { useState, useCallback } from 'react';
import type { SearchResult, VerificationResult } from './types';

export function useSanteVerification() {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [erreur, setErreur] = useState('');

  // Autocomplétion
  const handleSearch = useCallback(async (value: string) => {
    setQuery(value);
    if (value.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    try {
      const res = await fetch(`/api/sante/verifier-assure?q=${encodeURIComponent(value)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.resultats || []);
        setShowResults(true);
      }
    } catch { /* silent */ }
  }, []);

  // Pré-sélection depuis l'autocomplétion : remplit le champ, referme la liste
  const choisirResultat = useCallback((r: SearchResult) => {
    setQuery(r.nSS || `${r.nom} ${r.prenom}`);
    setShowResults(false);
  }, []);

  // Vérification complète
  const verifier = useCallback(async (identifiant: string) => {
    setLoading(true);
    setErreur('');
    setResult(null);
    setShowResults(false);

    try {
      const res = await fetch('/api/sante/verifier-assure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiant }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.erreur || 'Erreur lors de la vérification.');
      } else {
        setResult(data);
      }
    } catch {
      setErreur('Erreur de connexion au serveur.');
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    query, searchResults, showResults, loading, result, erreur,
    setErreur, handleSearch, choisirResultat, verifier,
  };
}
