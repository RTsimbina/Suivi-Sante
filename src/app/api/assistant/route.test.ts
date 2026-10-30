/**
 * Tests de la traçabilité des consultations de l'Assistant IA
 * (finding F4 de l'audit docs/AUDIT-ASSISTANT-IA.md) :
 *   - chaque POST /api/assistant RÉUSSI écrit UNE ligne d'audit
 *     (QUI / QUOI / QUAND) SANS données métier — ni valeurs de
 *     paramètres, ni résultats (seules les CLÉS de paramètres) ;
 *   - un refus (403 question hors rôle) n'est PAS journalisé comme
 *     consultation ;
 *   - l'échec de l'audit ne fait jamais échouer la consultation.
 *
 * Le moteur est simulé ; l'audit est un espion.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const jwtMocks = vi.hoisted(() => ({
  getToken: vi.fn(),
}));

const auditMocks = vi.hoisted(() => ({
  logParametreChange: vi.fn().mockResolvedValue(undefined),
}));

const engineMocks = vi.hoisted(() => ({
  listerQuestions: vi.fn().mockReturnValue({ role: 'SANTE', questions: [] }),
  executerQuestion: vi.fn(),
}));

vi.mock('next-auth/jwt', () => ({
  getToken: jwtMocks.getToken,
}));

vi.mock('@/lib/audit-log', () => ({
  logParametreChange: auditMocks.logParametreChange,
}));

vi.mock('@/lib/assistant/engine', () => ({
  listerQuestions: engineMocks.listerQuestions,
  executerQuestion: engineMocks.executerQuestion,
}));

vi.mock('@/lib/db', () => ({
  db: {
    // P1 Révocation : le POST relit l'état du compte (existant + actif + version)
    utilisateur: { findUnique: vi.fn().mockResolvedValue({ actif: true, sessionVersion: 1 }) },
    societe: { findMany: vi.fn().mockResolvedValue([]) },
    prestataire: { findMany: vi.fn().mockResolvedValue([]) },
    assure: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { POST } from './route';
import { AssistantError } from '@/lib/assistant/types';

function requetePost(body: unknown): NextRequest {
  return new Request('http://localhost/api/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const TOKEN_INTERNE = {
  id: 'u-1',
  role: 'SANTE',
  nom: 'Gestion Santé',
  email: 'sante@suivisante.mg',
  sessionVersion: 1, // P1 : version de session figée au login
};

beforeEach(() => {
  vi.clearAllMocks();
  jwtMocks.getToken.mockResolvedValue(TOKEN_INTERNE);
  auditMocks.logParametreChange.mockResolvedValue(undefined);
});

describe('traçabilité des consultations assistant (audit F4)', () => {
  it('une consultation réussie écrit UNE ligne d\'audit SANS données métier', async () => {
    engineMocks.executerQuestion.mockResolvedValue({
      questionId: 'COMPTA_RECAP_ENCAISSEMENTS',
      titre: 'Récapitulatif',
      colonnes: [],
      lignes: [],
      totalLignes: 0,
    });

    const res = await POST(requetePost({
      questionId: 'COMPTA_RECAP_ENCAISSEMENTS',
      params: { PERIODE: 'MOIS_EN_COURS', SOCIETE: 'soc-confidentiel' },
    }));

    expect(res.status).toBe(200);
    expect(auditMocks.logParametreChange).toHaveBeenCalledTimes(1);

    const ligne = auditMocks.logParametreChange.mock.calls[0][0];
    expect(ligne.action).toBe('CONSULTATION');
    expect(ligne.champ).toBe('CONSULTATION');
    expect(ligne.niveau).toBe('INFO');
    expect(ligne.entite).toBe('AssistantIA');
    expect(ligne.entiteId).toBe('COMPTA_RECAP_ENCAISSEMENTS');
    expect(ligne.module).toBe('Assistant IA');
    expect(ligne.modifiePar).toBe('Gestion Santé');
    expect(ligne.modifieParId).toBe('u-1');
    expect(ligne.roleUtilisateur).toBe('SANTE');
    expect(ligne.ancienneValeur).toBeNull();
    expect(ligne.nouvelleValeur).toBeNull();

    // AUCUNE donnée métier : CLÉS de paramètres oui, VALEURS non
    const meta = JSON.parse(ligne.metadonnees);
    expect(meta.questionId).toBe('COMPTA_RECAP_ENCAISSEMENTS');
    expect(meta.params).toEqual(['PERIODE', 'SOCIETE']);
    expect(ligne.metadonnees).not.toContain('soc-confidentiel');
    expect(ligne.metadonnees).not.toContain('MOIS_EN_COURS');
  });

  it('un refus (question hors rôle, 403) n\'est PAS journalisé comme consultation', async () => {
    engineMocks.executerQuestion.mockRejectedValue(
      new AssistantError('Accès refusé : cette question appartient à un autre rôle.', 403)
    );

    const res = await POST(requetePost({ questionId: 'ADMIN_USERS_TOTAL' }));

    expect(res.status).toBe(403);
    expect(auditMocks.logParametreChange).not.toHaveBeenCalled();
  });

  it('l\'échec de l\'audit ne fait jamais échouer la consultation', async () => {
    engineMocks.executerQuestion.mockResolvedValue({
      questionId: 'SANTE_DOSSIERS_RECUS',
      titre: 'Dossiers reçus',
      colonnes: [],
      lignes: [],
      totalLignes: 0,
    });
    auditMocks.logParametreChange.mockRejectedValue(new Error('journal indisponible'));

    const res = await POST(requetePost({ questionId: 'SANTE_DOSSIERS_RECUS' }));

    expect(res.status).toBe(200);
  });

  it('une requête sans questionId valide est refusée (400) et rien n\'est tracé', async () => {
    const res = await POST(requetePost({ params: {} }));

    expect(res.status).toBe(400);
    expect(engineMocks.executerQuestion).not.toHaveBeenCalled();
    expect(auditMocks.logParametreChange).not.toHaveBeenCalled();
  });
});
