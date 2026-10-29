/**
 * Tests de la logique métier Sociétés clientes (src/lib/societe-service.ts).
 *
 * Scénarios d'acceptation couverts (spécifications Sociétés clientes) :
 *   - S3  : unicité du nom insensible casse / accents / séparateurs ;
 *   - S4  : modification — une fiche ne se compare pas à elle-même ;
 *   - S7–S9 : motifs de blocage de suppression (dossiers, assurés, appels de
 *     fonds, paramétrage d'appels) — jamais de 500 FK, jamais de suppression
 *     silencieuse de données comptables ;
 *   - SPEC-6 : garde d'ambiguïté de l'e-mail de contact principal ;
 *   - SPEC-3 : différences champ par champ pour l'audit.
 */

import { describe, it, expect } from 'vitest';

import {
  detecterConflitNom,
  detecterConflitLiaisonEmail,
  differencesSociete,
  messageConflitNom,
  messageSuppressionBloquee,
  motifsBlocageSuppression,
  normaliserEmailLiaison,
  normaliserNom,
} from './societe-service';

describe('normaliserNom — même canon que les prestataires', () => {
  it('minuscules, accents supprimés, ponctuation → espaces, espaces réduits', () => {
    expect(normaliserNom('Techno-Madagascar SARL')).toBe('techno madagascar sarl');
    expect(normaliserNom('  Café   Étoile,  Antananarivo ')).toBe('cafe etoile antananarivo');
    expect(normaliserNom('CLINIQUE SAINT-MICHEL')).toBe('clinique saint michel');
  });
});

describe('S3 — detecterConflitNom : unicité insensible à la casse / accents', () => {
  const EXISTANTES = [
    { id: 'soc-1', nom: 'Techno-Madagascar SARL', nomNormalise: 'techno madagascar sarl' },
    { id: 'soc-2', nom: 'Café Étoile', nomNormalise: 'cafe etoile' },
  ];

  it('S2 — doublon exact refusé', () => {
    const conflit = detecterConflitNom('Techno-Madagascar SARL', EXISTANTES);
    expect(conflit?.id).toBe('soc-1');
  });

  it('S3 — doublon insensible à la casse et aux accents refusé', () => {
    expect(detecterConflitNom('techno-madagascar sarl', EXISTANTES)?.id).toBe('soc-1');
    expect(detecterConflitNom('TECHNO MADAGASCAR SARL', EXISTANTES)?.id).toBe('soc-1');
    expect(detecterConflitNom('Café Étoile'.toLowerCase(), EXISTANTES)?.id).toBe('soc-2');
    // accents différents, même nom normalisé
    expect(detecterConflitNom('Cafe Etoile', EXISTANTES)?.id).toBe('soc-2');
  });

  it('S3 — séparateurs différents (tirets, virgules, espaces multiples) refusés', () => {
    expect(detecterConflitNom('Techno  Madagascar — SARL', EXISTANTES)?.id).toBe('soc-1');
    expect(detecterConflitNom('Café-Étoile', EXISTANTES)?.id).toBe('soc-2');
  });

  it('nom distinct accepté (aucun conflit)', () => {
    expect(detecterConflitNom('Ny Havana Services', EXISTANTES)).toBeNull();
  });

  it('S4 — modification : la fiche en cours est exclue de la comparaison', () => {
    expect(detecterConflitNom('Techno Madagascar Sarl', EXISTANTES, 'soc-1')).toBeNull();
    // mais un conflit avec UNE AUTRE fiche reste détecté
    expect(detecterConflitNom('Café Étoile', EXISTANTES, 'soc-1')?.id).toBe('soc-2');
  });

  it('résilience : nomNormalise absent → recalcul depuis le nom brut', () => {
    const sansColonne = [{ id: 'soc-3', nom: 'Techno Madagascar Sarl' }];
    expect(detecterConflitNom('TECHNO MADAGASCAR SARL', sansColonne)?.id).toBe('soc-3');
  });

  it('message 409 mentionne la fiche en conflit', () => {
    const msg = messageConflitNom(EXISTANTES[0]);
    expect(msg).toContain('Techno-Madagascar SARL');
    expect(msg).toContain('existe déjà');
  });
});

describe('SPEC-6 — detecterConflitLiaisonEmail : un e-mail, une société', () => {
  const EXISTANTES = [
    { id: 'soc-1', nom: 'Techno-Madagascar', emailContactPrincipal: 'DG@techno.mg' },
    { id: 'soc-2', nom: 'Café Étoile', emailContactPrincipal: null },
  ];

  it('e-mail déjà lié à une autre société → conflit (insensible casse + trim)', () => {
    expect(detecterConflitLiaisonEmail('dg@techno.mg', EXISTANTES)?.id).toBe('soc-1');
    expect(detecterConflitLiaisonEmail('  DG@TECHNO.MG ', EXISTANTES)?.id).toBe('soc-1');
  });

  it('e-mail libre accepté', () => {
    expect(detecterConflitLiaisonEmail('contact@etoile.mg', EXISTANTES)).toBeNull();
  });

  it('e-mail vide / absent → aucun contrôle', () => {
    expect(detecterConflitLiaisonEmail('', EXISTANTES)).toBeNull();
    expect(detecterConflitLiaisonEmail(null, EXISTANTES)).toBeNull();
    expect(detecterConflitLiaisonEmail(undefined, EXISTANTES)).toBeNull();
  });

  it('modification : la société en cours est exclue', () => {
    expect(detecterConflitLiaisonEmail('dg@techno.mg', EXISTANTES, 'soc-1')).toBeNull();
  });

  it('normaliserEmailLiaison : trim + minuscules, vide → null', () => {
    expect(normaliserEmailLiaison('  A@B.MG ')).toBe('a@b.mg');
    expect(normaliserEmailLiaison('')).toBeNull();
    expect(normaliserEmailLiaison(null)).toBeNull();
  });
});

describe('S7–S9 — motifsBlocageSuppression : suppression protégée étendue', () => {
  it('S6 — société sans aucune dépendance : aucun blocage', () => {
    expect(
      motifsBlocageSuppression({ dossiers: 0, assures: 0, appelsDeFonds: 0, modeCalculAppelFonds: 0 })
    ).toEqual([]);
  });

  it('S7 — dossiers rattachés → blocage chiffré', () => {
    const blocages = motifsBlocageSuppression({ dossiers: 12, assures: 0, appelsDeFonds: 0, modeCalculAppelFonds: 0 });
    expect(blocages).toHaveLength(1);
    expect(blocages[0].libelle).toBe('dossiers');
    expect(blocages[0].detail).toContain('12 dossier(s)');
  });

  it('S8 — assurés rattachés (sans dossiers) → blocage (jamais de 500 FK)', () => {
    const blocages = motifsBlocageSuppression({ dossiers: 0, assures: 30, appelsDeFonds: 0, modeCalculAppelFonds: 0 });
    expect(blocages.map((b) => b.libelle)).toEqual(['assurés']);
    expect(blocages[0].detail).toContain('30 assuré(s)');
  });

  it('S9 — appels de fonds sur contrats → blocage : contrats non supprimés silencieusement', () => {
    const blocages = motifsBlocageSuppression({ dossiers: 0, assures: 0, appelsDeFonds: 5, modeCalculAppelFonds: 0 });
    expect(blocages.map((b) => b.libelle)).toEqual(['appels de fonds']);
    expect(blocages[0].detail).toContain('5 appel(s) de fonds');
  });

  it('paramétrage ModeCalculAppelFonds → blocage dédié', () => {
    const blocages = motifsBlocageSuppression({ dossiers: 0, assures: 0, appelsDeFonds: 0, modeCalculAppelFonds: 1 });
    expect(blocages.map((b) => b.libelle)).toEqual(['paramétrage des appels de fonds']);
  });

  it('blocages cumulés : tous les motifs listés ensemble', () => {
    const blocages = motifsBlocageSuppression({ dossiers: 3, assures: 7, appelsDeFonds: 2, modeCalculAppelFonds: 1 });
    expect(blocages.map((b) => b.libelle)).toEqual([
      'dossiers',
      'assurés',
      'appels de fonds',
      'paramétrage des appels de fonds',
    ]);
    const msg = messageSuppressionBloquee(blocages);
    expect(msg).toContain('Impossible de supprimer');
    expect(msg).toContain('3 dossier(s)');
    expect(msg).toContain('7 assuré(s)');
  });
});

describe('SPEC-3 — differencesSociete : audit champ par champ', () => {
  const EXISTANTE = {
    id: 'soc-1',
    nom: 'Techno-Madagascar',
    adresse: 'Anosy',
    telephone: '034 11 111 11',
    email: 'contact@techno.mg',
    nif: '4001234567',
    contactPrincipal: 'Rakoto Jean',
    emailContactPrincipal: 'dg@techno.mg',
    actif: true,
  };

  it('aucun champ fourni → aucune différence', () => {
    expect(differencesSociete(EXISTANTE, {})).toEqual([]);
  });

  it('champ inchangé → non audité', () => {
    const diffs = differencesSociete(EXISTANTE, { nom: 'Techno-Madagascar' });
    expect(diffs).toEqual([]);
  });

  it('champ modifié → une ligne avec ancienne / nouvelle valeur', () => {
    const diffs = differencesSociete(EXISTANTE, { contactPrincipal: 'Rakoto Jeanne' });
    expect(diffs).toEqual([
      { champ: 'contactPrincipal', ancienne: 'Rakoto Jean', nouvelle: 'Rakoto Jeanne' },
    ]);
  });

  it('S5 — changement de la liaison portail emailContactPrincipal audité', () => {
    const diffs = differencesSociete(EXISTANTE, { emailContactPrincipal: 'nouveau@techno.mg' });
    expect(diffs).toEqual([
      { champ: 'emailContactPrincipal', ancienne: 'dg@techno.mg', nouvelle: 'nouveau@techno.mg' },
    ]);
  });

  it('S11 — bascule actif → inactif audité (true → false)', () => {
    const diffs = differencesSociete(EXISTANTE, { actif: false });
    expect(diffs).toEqual([{ champ: 'actif', ancienne: true, nouvelle: false }]);
  });

  it('champ vidé explicitement (null) audité comme une modification', () => {
    const diffs = differencesSociete(EXISTANTE, { adresse: null });
    expect(diffs).toEqual([{ champ: 'adresse', ancienne: 'Anosy', nouvelle: null }]);
  });

  it('plusieurs champs modifiés → une ligne par champ', () => {
    const diffs = differencesSociete(EXISTANTE, { nom: 'Techno MG', actif: false, telephone: null });
    expect(diffs.map((d) => d.champ).sort()).toEqual(['actif', 'nom', 'telephone']);
  });
});
