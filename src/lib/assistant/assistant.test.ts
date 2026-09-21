import { describe, it, expect } from 'vitest';
import { CATALOGUE, questionsDuRole, questionParId } from './catalog';
import { listerQuestions, executerQuestion, questionEstAutorisee } from './engine';
import { validerParams, verifierAutorisationParam, isRoleExterne } from './context';
import { resolvePeriode } from './periods';
import { AssistantError } from './types';
import type { AssistantContext, RoleType } from './types';

// ─── Tests de l'Assistant IA à questions prédéfinies ─────────────────────────
// Ces tests vérifient : l'intégrité du catalogue (8 rôles × 20 questions),
// l'application stricte des permissions par rôle et les garde-fous
// d'isolation (rejet des paramètres hors périmètre, validation des périodes).

const CONTEXTES: Record<RoleType, AssistantContext> = {
  ADMINISTRATEUR: { userId: 'u1', role: 'ADMINISTRATEUR', email: 'a@x.mg', nom: 'Admin', assureId: null, societeId: null, prestataireId: null },
  ACCUEIL: { userId: 'u2', role: 'ACCUEIL', email: 'b@x.mg', nom: 'Accueil', assureId: null, societeId: null, prestataireId: null },
  TECHNIQUE: { userId: 'u3', role: 'TECHNIQUE', email: 'c@x.mg', nom: 'Tech', assureId: null, societeId: null, prestataireId: null },
  COMPTABILITE: { userId: 'u4', role: 'COMPTABILITE', email: 'd@x.mg', nom: 'Compta', assureId: null, societeId: null, prestataireId: null },
  SANTE: { userId: 'u5', role: 'SANTE', email: 'e@x.mg', nom: 'Santé', assureId: null, societeId: null, prestataireId: null },
  PORTAIL_CLIENT: { userId: 'u6', role: 'PORTAIL_CLIENT', email: 'f@x.mg', nom: 'Assuré', assureId: 'assure-A', societeId: 'soc-A', prestataireId: null },
  CONTACT_ENTREPRISE: { userId: 'u7', role: 'CONTACT_ENTREPRISE', email: 'g@x.mg', nom: 'Entreprise', assureId: null, societeId: 'soc-A', prestataireId: null },
  PRESTATAIRE: { userId: 'u8', role: 'PRESTATAIRE', email: 'h@x.mg', nom: 'Prestataire', assureId: null, societeId: null, prestataireId: 'presta-A' },
};

// ─── 1. Intégrité du catalogue ───────────────────────────────────────────────

describe('Catalogue — intégrité', () => {
  it('contient exactement 160 questions (8 rôles × 20)', () => {
    expect(CATALOGUE).toHaveLength(160);
  });

  it('propose exactement 20 questions pour chacun des 8 rôles', () => {
    const roles: RoleType[] = [
      'ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE',
      'PORTAIL_CLIENT', 'CONTACT_ENTREPRISE', 'PRESTATAIRE',
    ];
    for (const role of roles) {
      expect(questionsDuRole(role)).toHaveLength(20);
    }
  });

  it('a des identifiants uniques et préfixés par rôle', () => {
    const ids = CATALOGUE.map((q) => q.id);
    expect(new Set(ids).size).toBe(160);
    const prefixes: Record<string, string> = {
      ADMINISTRATEUR: 'ADMIN_', ACCUEIL: 'ACCUEIL_', TECHNIQUE: 'TECH_',
      COMPTABILITE: 'COMPTA_', SANTE: 'CONTROLE_', PORTAIL_CLIENT: 'ASSURE_',
      CONTACT_ENTREPRISE: 'ENTREPRISE_', PRESTATAIRE: 'PRESTATAIRE_',
    };
    for (const q of CATALOGUE) {
      expect(q.id.startsWith(prefixes[q.role])).toBe(true);
    }
  });

  it('a une implémentation et une présentation déclarée pour chaque question', () => {
    for (const q of CATALOGUE) {
      expect(typeof q.impl).toBe('function');
      expect(q.question.length).toBeGreaterThan(5);
      expect(q.categorie.length).toBeGreaterThan(2);
      expect(['NOMBRE', 'MONTANT', 'TABLEAU', 'LISTE', 'GRAPHIQUE', 'KPI', 'TEXTE']).toContain(q.presentation);
    }
  });

  it('déclare des paramètres valides uniquement', () => {
    const clesValides = ['PERIODE', 'SOCIETE', 'PRESTATAIRE', 'ASSURE', 'STATUT', 'ACTE', 'DOSSIER', 'ANNEE'];
    for (const q of CATALOGUE) {
      for (const p of q.params) {
        expect(clesValides).toContain(p.key);
        expect(p.label.length).toBeGreaterThan(2);
      }
    }
  });

  it('expose les questions du catalogue via questionParId', () => {
    expect(questionParId('COMPTA_TOTAL_FACTURES')?.role).toBe('COMPTABILITE');
    expect(questionParId('PRESTATAIRE_FACTURES_IMPAYEES')?.role).toBe('PRESTATAIRE');
    expect(questionParId('ASSURE_REMBOURSEMENT_EN_COURS')?.role).toBe('PORTAIL_CLIENT');
    expect(questionParId('ENTREPRISE_TOTAL_ASSURES')?.role).toBe('CONTACT_ENTREPRISE');
    expect(questionParId('CONTROLE_DOSSIERS_EN_ATTENTE')?.role).toBe('SANTE');
    expect(questionParId('QUESTION_INEXISTANTE')).toBeUndefined();
  });
});

// ─── 2. Permissions par rôle ─────────────────────────────────────────────────

describe('Moteur — permissions par rôle', () => {
  it('refuse une question inexistante (404)', async () => {
    await expect(
      executerQuestion(CONTEXTES.ADMINISTRATEUR, 'INVENTEE_PAR_LE_CLIENT', {})
    ).rejects.toMatchObject({ status: 404 });
  });

  it('refuse une question d\u2019un autre rôle (403) — défense serveur', async () => {
    // Un COMPTABILITE tente une question réservée à l'administrateur
    await expect(
      executerQuestion(CONTEXTES.COMPTABILITE, 'ADMIN_UTILISATEURS_ACTIFS', {})
    ).rejects.toMatchObject({ status: 403 });

    // Un PORTAIL_CLIENT tente une question Comptabilité (données financières globales)
    await expect(
      executerQuestion(CONTEXTES.PORTAIL_CLIENT, 'COMPTA_TOTAL_FACTURES', {})
    ).rejects.toMatchObject({ status: 403 });

    // Un SANTE tente une question Comptabilité
    await expect(
      executerQuestion(CONTEXTES.SANTE, 'COMPTA_FACTURES_IMPAYEES', {})
    ).rejects.toMatchObject({ status: 403 });
  });

  it('expose uniquement les questions du rôle via listerQuestions', () => {
    const liste = listerQuestions('PRESTATAIRE');
    expect(liste.total).toBe(20);
    for (const q of liste.questions) {
      expect(q.id.startsWith('PRESTATAIRE_')).toBe(true);
    }
  });

  it('questionEstAutorisee vérifie la correspondance rôle-question', () => {
    expect(questionEstAutorisee('PRESTATAIRE', 'PRESTATAIRE_TOTAL_FACTURES')).toBe(true);
    expect(questionEstAutorisee('PRESTATAIRE', 'PRESTATAIRE_SITUATION_PAIEMENT')).toBe(true);
    expect(questionEstAutorisee('PRESTATAIRE', 'ADMIN_UTILISATEURS_ACTIFS')).toBe(false);
  });

  it('refuse l\u2019exécution pour un rôle externe sans rattachement de données (403)', async () => {
    const sansRattachement: AssistantContext = {
      ...CONTEXTES.PRESTATAIRE,
      prestataireId: null,
    };
    await expect(
      executerQuestion(sansRattachement, 'PRESTATAIRE_TOTAL_FACTURES', {})
    ).rejects.toMatchObject({ status: 403 });

    const assureSansLien: AssistantContext = {
      ...CONTEXTES.PORTAIL_CLIENT,
      assureId: null,
    };
    await expect(
      executerQuestion(assureSansLien, 'ASSURE_DOSSIERS_EN_COURS', {})
    ).rejects.toMatchObject({ status: 403 });
  });

  it('exige un paramètre obligatoire manquant (400)', async () => {
    await expect(
      executerQuestion(CONTEXTES.PRESTATAIRE, 'PRESTATAIRE_STATUT_FACTURE', {})
    ).rejects.toMatchObject({ status: 400 });
  });
});

// ─── 3. Garde-fous d'isolation ───────────────────────────────────────────────

describe('Sécurité — garde-fous d\u2019isolation', () => {
  it('validerParams ne laisse passer que les paramètres déclarés', () => {
    const declares = [{ key: 'PERIODE' as const, label: 'Période' }];
    const valides = validerParams(declares, {
      PERIODE: 'CE_MOIS',
      SOCIETE: 'soc-B',          // non déclaré → ignoré
      DOSSIER: "'; DROP TABLE;--", // non déclaré → ignoré
    } as never);
    expect(valides).toEqual({ PERIODE: 'CE_MOIS' });
  });

  it('validerParams rejette les valeurs non textuelles et trop longues', () => {
    const declares = [{ key: 'DOSSIER' as const, label: 'N° dossier' }];
    expect(() => validerParams(declares, { DOSSIER: 42 as never })).toThrow(AssistantError);
    expect(() => validerParams(declares, { DOSSIER: 'x'.repeat(500) })).toThrow(AssistantError);
  });

  it('verifierAutorisationParam rejette une entité hors périmètre (403)', () => {
    // Prestataire A tente d'accéder à la société d'un autre périmètre
    expect(() =>
      verifierAutorisationParam(['soc-A', 'soc-B'], 'soc-C', 'société')
    ).toThrowError(/hors de votre périmètre/);

    // Rôle interne (liste null = accès global) : accepté
    expect(verifierAutorisationParam(null, 'soc-C', 'société')).toBe('soc-C');

    // Paramètre vide : neutre
    expect(verifierAutorisationParam(['soc-A'], undefined, 'société')).toBeUndefined();
  });

  it('isRoleExterne distingue rôles internes et externes', () => {
    expect(isRoleExterne('ADMINISTRATEUR')).toBe(false);
    expect(isRoleExterne('SANTE')).toBe(false);
    expect(isRoleExterne('PORTAIL_CLIENT')).toBe(true);
    expect(isRoleExterne('CONTACT_ENTREPRISE')).toBe(true);
    expect(isRoleExterne('PRESTATAIRE')).toBe(true);
  });
});

// ─── 4. Périodes ─────────────────────────────────────────────────────────────

describe('Périodes — validation serveur', () => {
  it('résout les périodes prédéfinies', () => {
    const p = resolvePeriode({ preset: 'CE_MOIS' });
    expect(p.du.getTime()).toBeLessThan(p.au.getTime());
    expect(p.label).toContain(new Date().toLocaleDateString('fr-FR', { month: 'long' }));
  });

  it('utilise l\u2019année courante par défaut', () => {
    const p = resolvePeriode(undefined);
    expect(p.du.getFullYear()).toBe(new Date().getFullYear());
  });

  it('rejette une période personnalisée inversée', () => {
    expect(() =>
      resolvePeriode({ preset: 'PERSONNALISEE', du: '2026-06-30', au: '2026-01-01' })
    ).toThrow(AssistantError);
  });

  it('rejette une période personnalisée incomplète ou invalide', () => {
    expect(() => resolvePeriode({ preset: 'PERSONNALISEE' })).toThrow(AssistantError);
    expect(() =>
      resolvePeriode({ preset: 'PERSONNALISEE', du: 'pas-une-date', au: '2026-01-01' })
    ).toThrow(AssistantError);
  });

  it('borne la fenêtre personnalisée à 3 ans', () => {
    expect(() =>
      resolvePeriode({ preset: 'PERSONNALISEE', du: '2020-01-01', au: '2026-01-01' })
    ).toThrow(AssistantError);
  });
});
