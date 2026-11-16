'use client';

/**
 * Hook de l'assistant IA (refactoring P2 — extrait du monolithe
 * assistant-view.tsx) : chargement du catalogue du rôle (questions + options
 * filtrées côté serveur), recherche/filtrage par catégorie, sélection d'une
 * question avec ses paramètres et envoi de la question à /api/assistant.
 * Les réponses sont calculées depuis la base, sans service d'IA externe.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import type { AssistantResult } from '@/lib/assistant/types';
import type { CatalogueResponse, Message, QuestionPublique } from './types';

export function useAssistant() {
  const [catalogue, setCatalogue] = useState<CatalogueResponse | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [questionActive, setQuestionActive] = useState<QuestionPublique | null>(null);
  const [parametres, setParametres] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState(false);
  const [recherche, setRecherche] = useState('');

  // Charger le catalogue du rôle (côté serveur : questions + options filtrées)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/assistant');
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setErreur(data.erreur || 'Impossible de charger l\u2019assistant.');
          return;
        }
        const data: CatalogueResponse = await res.json();
        setCatalogue(data);
        setMessages([
          {
            id: 'bienvenue',
            role: 'assistant',
            texte: `Bonjour ! Je suis votre assistant. Choisissez une question dans la liste : je répondrai directement à partir des données de la plateforme, en respectant strictement votre rôle et votre périmètre. (${data.total} questions disponibles)`,
          },
        ]);
      } catch {
        setErreur('Erreur réseau lors du chargement de l\u2019assistant.');
      } finally {
        setChargement(false);
      }
    })();
  }, []);

  const categories = useMemo(() => {
    if (!catalogue) return [];
    const filtree = recherche.trim()
      ? catalogue.questions.filter((q) =>
          q.question.toLowerCase().includes(recherche.trim().toLowerCase()) ||
          q.categorie.toLowerCase().includes(recherche.trim().toLowerCase()))
      : catalogue.questions;
    const map = new Map<string, QuestionPublique[]>();
    for (const q of filtree) {
      const list = map.get(q.categorie) ?? [];
      list.push(q);
      map.set(q.categorie, list);
    }
    return [...map.entries()];
  }, [catalogue, recherche]);

  const choisirQuestion = useCallback((q: QuestionPublique) => {
    setQuestionActive(q);
    setParametres({});
  }, []);

  const fermerQuestion = useCallback(() => {
    setQuestionActive(null);
    setParametres({});
  }, []);

  const changerParametre = useCallback((cle: string, valeur: string) => {
    setParametres((prev) => ({ ...prev, [cle]: valeur }));
  }, []);

  const poserQuestion = useCallback(async () => {
    if (!questionActive || enCours) return;
    // Vérifier les paramètres requis
    for (const p of questionActive.params) {
      if (p.required && !parametres[p.key]?.trim()) {
        return; // le bouton est désactivé mais double sécurité
      }
    }
    const corps: Record<string, string> = {};
    for (const p of questionActive.params) {
      const val = parametres[p.key];
      if (val) corps[p.key] = val;
    }

    const idUser = `u-${Date.now()}`;
    const idBot = `b-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: idUser, role: 'user', texte: questionActive.question },
    ]);
    setEnCours(true);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: questionActive.id, params: corps }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => [...prev, { id: idBot, role: 'assistant', erreur: data.erreur || 'Erreur lors du traitement de la question.' }]);
      } else {
        setMessages((prev) => [...prev, { id: idBot, role: 'assistant', resultat: data as AssistantResult }]);
      }
    } catch {
      setMessages((prev) => [...prev, { id: idBot, role: 'assistant', erreur: 'Erreur réseau. Veuillez réessayer.' }]);
    } finally {
      setEnCours(false);
    }
  }, [questionActive, parametres, enCours]);

  const requisComplets =
    !!questionActive &&
    questionActive.params.filter((p) => p.required).every((p) => parametres[p.key]?.trim());

  return {
    catalogue, chargement, erreur,
    messages, questionActive, parametres, enCours,
    recherche, setRecherche,
    categories, choisirQuestion, fermerQuestion,
    changerParametre, poserQuestion, requisComplets,
  };
}
