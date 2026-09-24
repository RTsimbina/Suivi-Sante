/**
 * Tests de la logique de doublons prestataires — les 9 scénarios de la spécification :
 *  1. NIF déjà utilisé → 409, sauf validation Administrateur
 *  2. Num STAT déjà utilisé → 409, sauf validation Administrateur
 *  3. e-mail déjà utilisé → 409, sauf validation Administrateur
 *  4. code déjà utilisé → 409, sauf validation Administrateur
 *  5. nom déjà utilisé (normalisé) → 409
 *  6. validation Administrateur d'un doublon justifié par le même groupe
 *  7. refus de l'exception par un utilisateur non Administrateur
 *  8. enregistrement de la validation dans le Journal d'Audit (métadonnées)
 *  9. l'exception ne contourne pas les autres contrôles de sécurité
 */
import { describe, it, expect } from 'vitest';
import {
  detecterDoublons,
  resoudreDoublons,
  construireMetadonneesException,
  normaliserNom,
  formaterMessageDoublons,
  type PrestataireExistantMin,
} from './prestataire-doublons';
import { prestataireCreateSchema } from './validation/referentiels';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const EXISTANT: PrestataireExistantMin = {
  id: 'presta-1',
  nom: 'Groupe Médical ABC',
  code: 'PRE-001',
  nif: '4001234567',
  stat: '6512311200202345',
  email: 'contact@groupe-abc.mg',
  nomNormalise: 'groupe medical abc',
};

const DONNEES_CREATION = {
  nom: 'Clinique ABC Antananarivo',
  nomNormalise: 'clinique abc antananarivo',
  nif: null as string | null,
  stat: null as string | null,
  email: null as string | null,
  code: null as string | null,
};

function scenario(valeurs: Partial<typeof DONNEES_CREATION>) {
  const donnees = { ...DONNEES_CREATION, ...valeurs };
  const conflits = detecterDoublons(donnees, [EXISTANT]);
  return { conflits, decision: resoudreDoublons({ conflits, roleDemandeur: 'TECHNIQUE', exceptionDemandee: false }) };
}

// ─── Scénarios 1 à 4 : champs uniques bloqués en 409 ────────────────────────

describe.each([
  ['NIF', { nif: '4001234567' }, 'nif'],
  ['Num STAT', { stat: '6512 311 2002 02345' }, 'stat'],
  ['e-mail', { email: 'contact@groupe-abc.mg' }, 'email'],
  ['code prestataire', { code: 'PRE-001' }, 'code'],
] as const)('Scénarios 1-4 : doublon sur %s', (_libelle, valeurs, champAttendu) => {
  it('détecte le conflit et bloque en 409 sans exception', () => {
    const { conflits, decision } = scenario(valeurs);
    expect(conflits).toHaveLength(1);
    expect(conflits[0].champ).toBe(champAttendu);
    expect(conflits[0].prestataireExistantId).toBe('presta-1');
    expect(conflits[0].prestataireExistantNom).toBe('Groupe Médical ABC');
    expect(decision.action).toBe('BLOQUER_409');
  });
});

// ─── Scénario 5 : nom normalisé ─────────────────────────────────────────────

describe('Scénario 5 : doublon de nom / raison sociale normalisée', () => {
  it('détecte le doublon malgré casse, accents et ponctuation', () => {
    expect(normaliserNom('GROUPE  Médical-ABC !')).toBe('groupe medical abc');
    const donnees = {
      ...DONNEES_CREATION,
      nom: 'GROUPE  Médical-ABC !',
      nomNormalise: normaliserNom('GROUPE  Médical-ABC !'),
    };
    const conflits = detecterDoublons(donnees, [EXISTANT]);
    expect(conflits.some(c => c.champ === 'nom')).toBe(true);
  });

  it('ne confond pas deux entités différentes (même NIF, noms distincts)', () => {
    const donnees = {
      ...DONNEES_CREATION,
      nom: 'Clinique ABC Antananarivo',
      nomNormalise: 'clinique abc antananarivo',
      nif: '4001234567',
    };
    const conflits = detecterDoublons(donnees, [EXISTANT]);
    expect(conflits.some(c => c.champ === 'nom')).toBe(false);
    expect(conflits.some(c => c.champ === 'nif')).toBe(true);
  });

  it('ne bloque pas une fiche modifiée sans changer les valeurs (exclusion de soi)', () => {
    const donnees = {
      nom: 'Groupe Médical ABC',
      nomNormalise: 'groupe medical abc',
      nif: '4001234567',
      stat: '6512311200202345',
      email: 'contact@groupe-abc.mg',
      code: 'PRE-001',
    };
    const conflits = detecterDoublons(donnees, [EXISTANT], 'presta-1');
    expect(conflits).toHaveLength(0);
  });
});

// ─── Scénario 6 : validation Administrateur du doublon même groupe ──────────

describe("Scénario 6 : exception validée par un Administrateur (même groupe)", () => {
  it("autorise l'enregistrement avec motif traçable", () => {
    const conflits = detecterDoublons({ ...DONNEES_CREATION, nif: '4001234567' }, [EXISTANT]);
    const decision = resoudreDoublons({
      conflits,
      roleDemandeur: 'ADMINISTRATEUR',
      exceptionDemandee: true,
      motif: 'Établissement du même groupe « Groupe Médical ABC » (NIF commun légitime)',
    });
    expect(decision.action).toBe('EXCEPTION_AUTORISEE');
    if (decision.action === 'EXCEPTION_AUTORISEE') {
      expect(decision.motif).toContain('même groupe');
      expect(decision.conflits[0].champ).toBe('nif');
    }
  });

  it('refuse une exception sans motif (motif requis)', () => {
    const conflits = detecterDoublons({ ...DONNEES_CREATION, nif: '4001234567' }, [EXISTANT]);
    const decision = resoudreDoublons({
      conflits, roleDemandeur: 'ADMINISTRATEUR', exceptionDemandee: true, motif: '  ',
    });
    expect(decision.action).toBe('BLOQUER_409');
    if (decision.action === 'BLOQUER_409') expect(decision.raison).toBe('MOTIF_REQUIS');
  });

  it('refuse un motif trop court (non substantiel)', () => {
    const conflits = detecterDoublons({ ...DONNEES_CREATION, nif: '4001234567' }, [EXISTANT]);
    const decision = resoudreDoublons({
      conflits, roleDemandeur: 'ADMINISTRATEUR', exceptionDemandee: true, motif: 'ok',
    });
    expect(decision.action).toBe('BLOQUER_409');
  });
});

// ─── Scénario 7 : refus de l'exception par un non-Administrateur ────────────

describe("Scénario 7 : refus de l'exception pour un non-Administrateur", () => {
  it.each(['TECHNIQUE', 'ACCUEIL', 'COMPTABILITE', 'SANTE'])(
    'refuse l\'exception pour le rôle %s même avec motif', (role) => {
      const conflits = detecterDoublons({ ...DONNEES_CREATION, nif: '4001234567' }, [EXISTANT]);
      const decision = resoudreDoublons({
        conflits, roleDemandeur: role, exceptionDemandee: true,
        motif: 'Appartenance au même groupe de prestataires',
      });
      expect(decision.action).toBe('REFUSER_403');
    }
  );
});

// ─── Scénario 8 : traçabilité de la validation dans l'audit ─────────────────

describe("Scénario 8 : métadonnées d'audit de la validation d'exception", () => {
  it('contient tous les champs exigés par la spécification', () => {
    const conflits = detecterDoublons({ ...DONNEES_CREATION, nif: '4001234567' }, [EXISTANT]);
    const meta = JSON.parse(construireMetadonneesException(conflits[0], {
      prestataireId: 'presta-2',
      prestataireNom: 'Clinique ABC Antananarivo',
      motif: 'Appartenance au même groupe',
      valideParNom: 'Rakoto Admin',
      valideParId: 'user-1',
      valideParRole: 'ADMINISTRATEUR',
      dateValidation: new Date('2026-09-24T10:00:00Z'),
    }));

    expect(meta.type).toBe('EXCEPTION_DOUBLON');
    expect(meta.donneeConcernee).toBe('NIF');
    expect(meta.valeurDoublon).toBe('4001234567');
    expect(meta.prestataireConcerne).toEqual({ id: 'presta-2', nom: 'Clinique ABC Antananarivo' });
    expect(meta.prestataireExistant).toEqual({ id: 'presta-1', nom: 'Groupe Médical ABC', code: 'PRE-001' });
    expect(meta.motif).toBe('Appartenance au même groupe');
    expect(meta.validePar).toEqual({ nom: 'Rakoto Admin', id: 'user-1', role: 'ADMINISTRATEUR' });
    expect(meta.dateValidation).toBe('2026-09-24T10:00:00.000Z');
  });

  it('formate un message 409 explicite', () => {
    const conflits = detecterDoublons({ ...DONNEES_CREATION, nif: '4001234567' }, [EXISTANT]);
    const message = formaterMessageDoublons(conflits);
    expect(message).toContain('NIF');
    expect(message).toContain('4001234567');
    expect(message).toContain('Groupe Médical ABC');
  });
});

// ─── Scénario 9 : l'exception ne contourne pas les autres contrôles ─────────

describe("Scénario 9 : l'exception ne contourne pas les autres contrôles", () => {
  it('les validations de format Zod restent bloquantes même avec exception demandée', () => {
    const r = prestataireCreateSchema.safeParse({
      nom: 'Clinique ABC Antananarivo', type: 'CLINIQUE', nif: '12', email: 'pas-un-email',
    });
    expect(r.success).toBe(false);
  });

  it('un doublon non couvert reste bloquant pour une fiche déjà dérogée', () => {
    // Fiche presta-2 déjà dérogée pour NIF 4001234567 ; introduction d'un NOUVEAU
    // doublon (e-mail) → doit rester bloquée tant que non validée.
    const exceptionsPreexistantes = [{ prestataireId: 'presta-2', champ: 'nif', valeur: '4001234567' }];
    const conflits = detecterDoublons(
      { ...DONNEES_CREATION, nif: '4001234567', email: 'contact@groupe-abc.mg' },
      [EXISTANT]
    );
    const decision = resoudreDoublons({
      conflits, roleDemandeur: 'TECHNIQUE', exceptionDemandee: false, exceptionsPreexistantes,
    });
    expect(decision.action).toBe('BLOQUER_409');
    if (decision.action === 'BLOQUER_409') {
      expect(decision.conflits).toHaveLength(1);
      expect(decision.conflits[0].champ).toBe('email');
    }
  });

  it('les exceptions déjà validées couvrent leurs champs et valeurs exacts', () => {
    const exceptionsPreexistantes = [
      { prestataireId: 'presta-2', champ: 'nif', valeur: '4001234567' },
      { prestataireId: 'presta-2', champ: 'email', valeur: 'contact@groupe-abc.mg' },
    ];
    const conflits = detecterDoublons(
      { ...DONNEES_CREATION, nif: '4001234567', email: 'contact@groupe-abc.mg' },
      [EXISTANT]
    );
    const decision = resoudreDoublons({
      conflits, roleDemandeur: 'TECHNIQUE', exceptionDemandee: false, exceptionsPreexistantes,
    });
    expect(decision.action).toBe('CREER_DIRECT');
  });

  it("une valeur différente sur le même champ n'est pas couverte", () => {
    const exceptionsPreexistantes = [{ prestataireId: 'presta-2', champ: 'nif', valeur: '9999999999' }];
    const conflits = detecterDoublons({ ...DONNEES_CREATION, nif: '4001234567' }, [EXISTANT]);
    const decision = resoudreDoublons({
      conflits, roleDemandeur: 'ADMINISTRATEUR', exceptionDemandee: false, exceptionsPreexistantes,
    });
    expect(decision.action).toBe('BLOQUER_409');
  });
});

// ─── Absence de doublon ─────────────────────────────────────────────────────

describe('Aucun doublon → création directe', () => {
  it('passe sans conflit ni exception', () => {
    const decision = resoudreDoublons({
      conflits: [], roleDemandeur: 'TECHNIQUE', exceptionDemandee: false,
    });
    expect(decision.action).toBe('CREER_DIRECT');
  });
});
