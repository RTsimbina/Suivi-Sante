import { describe, it, expect } from 'vitest';
import {
  resoudrePerimetre,
  perimetreDepuisHeaders,
  refuserHorsPerimetre,
  avecPerimetreSociete,
  avecPerimetreSocieteCourante,
  resoudrePerimetrePrestataire,
  perimetrePrestataireDepuisHeaders,
  refuserHorsPerimetrePrestataire,
  avecPerimetrePrestataire,
  INTERNAL_ROLES,
  EXTERNAL_ROLES,
  ERREUR_SANS_SOCIETE,
  type PerimetreSociete,
} from '@/lib/data-isolation';

// ─── Correctif P1 n°1 : fuite inter-sociétés ────────────────────────────────
// Règle : un rôle externe (PORTAIL_CLIENT, CONTACT_ENTREPRISE) ne voit QUE
// les données de sa société, résolue côté serveur (JWT → headers middleware).
// Un societeId transmis par le navigateur ne peut jamais élargir le périmètre.

const SOCIETE_A = 'societe-a';
const SOCIETE_B = 'societe-b'; // société d'AUTRUI (tentative d'accès)

// ─── resoudrePerimetre ──────────────────────────────────────────────────────

describe('resoudrePerimetre — rôles externes', () => {
  it('PORTAIL_CLIENT est restreint à sa société', () => {
    const p = resoudrePerimetre('PORTAIL_CLIENT', SOCIETE_A);
    expect(p.restricted).toBe(true);
    expect(p.societeId).toBe(SOCIETE_A);
    expect(p.refusal).toBeNull();
  });

  it('CONTACT_ENTREPRISE est restreint à sa société', () => {
    const p = resoudrePerimetre('CONTACT_ENTREPRISE', SOCIETE_B);
    expect(p.restricted).toBe(true);
    expect(p.societeId).toBe(SOCIETE_B);
    expect(p.refusal).toBeNull();
  });

  it('FAIL-CLOSED : PORTAIL_CLIENT sans société rattachée est refusé (pas de liste vide silencieuse)', () => {
    for (const societeId of [null, undefined, '', '   ']) {
      const p = resoudrePerimetre('PORTAIL_CLIENT', societeId);
      expect(p.restricted).toBe(true);
      expect(p.societeId).toBeNull();
      expect(p.refusal).toBe(ERREUR_SANS_SOCIETE);
    }
  });

  it('FAIL-CLOSED : CONTACT_ENTREPRISE sans société rattachée est refusé', () => {
    const p = resoudrePerimetre('CONTACT_ENTREPRISE', null);
    expect(p.refusal).toBe(ERREUR_SANS_SOCIETE);
    expect(p.societeId).toBeNull();
  });

  it('les espaces résiduels du header sont ignorés (trim)', () => {
    const p = resoudrePerimetre('  PORTAIL_CLIENT  ', `  ${SOCIETE_A}  `);
    expect(p.societeId).toBe(SOCIETE_A);
  });
});

describe('resoudrePerimetre — rôles internes', () => {
  it('les 5 rôles internes ont un périmètre global', () => {
    for (const role of INTERNAL_ROLES) {
      const p = resoudrePerimetre(role, null);
      expect(p.restricted).toBe(false);
      expect(p.societeId).toBeNull();
      expect(p.refusal).toBeNull();
    }
  });

  it('un header societeId résiduel est IGNORÉ pour un rôle interne (il ne fait pas foi)', () => {
    const p = resoudrePerimetre('SANTE', SOCIETE_B);
    expect(p.restricted).toBe(false);
    expect(p.societeId).toBeNull();
  });
});

describe('resoudrePerimetre — défense en profondeur', () => {
  it('un rôle inconnu est FAIL-CLOSED (jamais de périmètre global par défaut)', () => {
    const p = resoudrePerimetre('ROLE_INCONNU', SOCIETE_A);
    expect(p.restricted).toBe(true);
    expect(p.refusal).toBe(ERREUR_SANS_SOCIETE);
  });

  it('un rôle vide est FAIL-CLOSED', () => {
    const p = resoudrePerimetre('', SOCIETE_A);
    expect(p.refusal).toBe(ERREUR_SANS_SOCIETE);
  });

  it('la liste des rôles externes ne chevauche jamais les internes', () => {
    for (const role of EXTERNAL_ROLES) {
      expect(INTERNAL_ROLES).not.toContain(role);
    }
  });
});

// ─── perimetreDepuisHeaders (la source = middleware, jamais le navigateur) ──

describe('perimetreDepuisHeaders', () => {
  function headersAvec(role: string, societeId?: string): Headers {
    const h = new Headers();
    if (role) h.set('x-user-role', role);
    if (societeId !== undefined) h.set('x-user-societeid', societeId);
    return h;
  }

  it('lit le périmètre externe depuis les headers injectés par le middleware', () => {
    const p = perimetreDepuisHeaders(headersAvec('PORTAIL_CLIENT', SOCIETE_A));
    expect(p.restricted).toBe(true);
    expect(p.societeId).toBe(SOCIETE_A);
  });

  it('headers absents → fail-closed', () => {
    const p = perimetreDepuisHeaders(new Headers());
    expect(p.refusal).toBe(ERREUR_SANS_SOCIETE);
  });

  it('header societeid vide (compte externe mal provisionné) → fail-closed', () => {
    const p = perimetreDepuisHeaders(headersAvec('CONTACT_ENTREPRISE', ''));
    expect(p.refusal).toBe(ERREUR_SANS_SOCIETE);
  });

  it('rôle interne avec header societeid → périmètre global', () => {
    const p = perimetreDepuisHeaders(headersAvec('ADMINISTRATEUR', SOCIETE_A));
    expect(p.restricted).toBe(false);
  });
});

// ─── refuserHorsPerimetre ───────────────────────────────────────────────────

describe('refuserHorsPerimetre', () => {
  it('renvoie null quand le périmètre est valide', () => {
    expect(refuserHorsPerimetre(resoudrePerimetre('PORTAIL_CLIENT', SOCIETE_A))).toBeNull();
    expect(refuserHorsPerimetre(resoudrePerimetre('SANTE', null))).toBeNull();
  });

  it('renvoie une Response 403 avec le message quand le compte externe est sans société', async () => {
    const p = resoudrePerimetre('PORTAIL_CLIENT', null);
    const res = refuserHorsPerimetre(p);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body.erreur).toBe(ERREUR_SANS_SOCIETE);
  });
});

// ─── avecPerimetreSociete (fusion du filtre dans le where Prisma) ───────────

describe('avecPerimetreSociete', () => {
  it('ANTI-SPOOFING : écrase le societeId transmis par le navigateur', () => {
    const p = resoudrePerimetre('PORTAIL_CLIENT', SOCIETE_A);
    const where = avecPerimetreSociete({ societeId: SOCIETE_B, statut: 'VALIDE' }, p);
    expect(where.societeId).toBe(SOCIETE_A); // jamais SOCIETE_B
  });

  it('préserve les autres filtres du where', () => {
    const p = resoudrePerimetre('CONTACT_ENTREPRISE', SOCIETE_A);
    const where = avecPerimetreSociete<Record<string, unknown>>(
      { statut: 'EN_ANALYSE', typeDossier: 'PHARMACIE' },
      p
    );
    expect(where.statut).toBe('EN_ANALYSE');
    expect(where.typeDossier).toBe('PHARMACIE');
    expect(where.societeId).toBe(SOCIETE_A);
  });

  it('no-op pour un rôle interne : le filtre client éventuel est conservé', () => {
    const p = resoudrePerimetre('SANTE', null);
    const where = avecPerimetreSociete({ societeId: SOCIETE_B }, p);
    expect(where.societeId).toBe(SOCIETE_B); // filtre de confort autorisé pour interne
    expect(Object.keys(where)).toHaveLength(1);
  });

  it('no-op défensif si restricted sans societeId (jamais de filtre null)', () => {
    const p: PerimetreSociete = { restricted: true, societeId: null, refusal: null };
    const where = avecPerimetreSociete({ statut: 'VALIDE' }, p);
    expect('societeId' in where).toBe(false);
  });
});

describe('avecPerimetreSocieteCourante (table Societe)', () => {
  it('filtre sur id = société du compte externe', () => {
    const p = resoudrePerimetre('CONTACT_ENTREPRISE', SOCIETE_A);
    const where = avecPerimetreSocieteCourante<Record<string, unknown>>({}, p);
    expect(where.id).toBe(SOCIETE_A);
  });

  it('no-op pour un rôle interne (toutes les sociétés)', () => {
    const p = resoudrePerimetre('ACCUEIL', null);
    const where = avecPerimetreSocieteCourante({}, p);
    expect('id' in where).toBe(false);
  });
});

// ─── Scénario de bout en bout : le flux exact d'un handler corrigé ──────────

describe('CHAÎNE COMPLÈTE — simulation du flux handler', () => {
  it('PORTAIL_CLIENT tente ?societeId=SOCIETE_B → where final = SA société uniquement', () => {
    // 1. Middleware : headers écrasés depuis le JWT (non falsifiables)
    const headers = new Headers({
      'x-user-role': 'PORTAIL_CLIENT',
      'x-user-societeid': SOCIETE_A,
    });

    // 2. Handler : le navigateur demande la société B (attaque)
    const societeIdClient = SOCIETE_B;

    // 3. Résolution du périmètre serveur
    const perimetre = perimetreDepuisHeaders(headers);
    expect(refuserHorsPerimetre(perimetre)).toBeNull();

    // 4. Where construit depuis les searchParams (le client y met SOCIETE_B)
    const where = {
      ...(societeIdClient ? { societeId: societeIdClient } : {}),
      statut: 'VALIDE',
    };

    // 5. Fusion du périmètre : le societeId client est ÉCRASÉ
    const whereFiltre = avecPerimetreSociete(where, perimetre);

    expect(whereFiltre.societeId).toBe(SOCIETE_A);
    expect(whereFiltre.statut).toBe('VALIDE');
    expect(JSON.stringify(whereFiltre)).not.toContain(SOCIETE_B);
  });

  it('CONTACT_ENTREPRISE sans société → le handler sort 403 avant toute requête DB', () => {
    const headers = new Headers({
      'x-user-role': 'CONTACT_ENTREPRISE',
      'x-user-societeid': '',
    });
    const perimetre = perimetreDepuisHeaders(headers);
    const res = refuserHorsPerimetre(perimetre);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it('SANTE avec filtre de confort ?societeId → comportement inchangé', () => {
    const headers = new Headers({ 'x-user-role': 'SANTE' });
    const perimetre = perimetreDepuisHeaders(headers);
    const whereFiltre = avecPerimetreSociete({ societeId: SOCIETE_B }, perimetre);
    expect(whereFiltre.societeId).toBe(SOCIETE_B); // filtre client conservé pour interne
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ─── Périmètre PRESTATAIRE (Portail Prestataire) ───────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

describe('resoudrePerimetre — rôle PRESTATAIRE sur les routes à périmètre société', () => {
  it('FAIL-CLOSED : un PRESTATAIRE est refusé sur les routes à périmètre société', () => {
    const p = resoudrePerimetre('PRESTATAIRE', SOCIETE_A);
    expect(p.refusal).not.toBeNull();
    expect(refuserHorsPerimetre(p)?.status).toBe(403);
  });

  it('FAIL-CLOSED : refusé même sans societeId (chaîne incomplète)', () => {
    const p = resoudrePerimetre('PRESTATAIRE', null);
    expect(p.refusal).not.toBeNull();
  });
});

describe('perimetrePrestataire (Portail Prestataire)', () => {
  it('PRESTATAIRE avec prestataireId → restreint à SON prestataire', () => {
    const p = resoudrePerimetrePrestataire('PRESTATAIRE', 'prest-A');
    expect(p.restricted).toBe(true);
    expect(p.prestataireId).toBe('prest-A');
    expect(p.refusal).toBeNull();
  });

  it('FAIL-CLOSED : PRESTATAIRE sans prestataireId → refus 403 actionnable', () => {
    const p = resoudrePerimetrePrestataire('PRESTATAIRE', null);
    expect(p.restricted).toBe(true);
    expect(p.refusal).not.toBeNull();
    const res = refuserHorsPerimetrePrestataire(p);
    expect(res?.status).toBe(403);
  });

  it('espaces parasites trimés (résilience)', () => {
    const p = resoudrePerimetrePrestataire('  PRESTATAIRE  ', '  prest-A  ');
    expect(p.prestataireId).toBe('prest-A');
  });

  it('ADMINISTRATEUR → périmètre global (mode démonstration, jamais restreint à un prestataire)', () => {
    const p = resoudrePerimetrePrestataire('ADMINISTRATEUR', null);
    expect(p.restricted).toBe(false);
    expect(p.refusal).toBeNull();
  });

  it('rôle inconnu → refus par défaut', () => {
    const p = resoudrePerimetrePrestataire('ACCUEIL', null);
    expect(p.refusal).not.toBeNull();
  });

  it('headers middleware → périmètre prestataire (x-user-prestataireid)', () => {
    const headers = new Headers({
      'x-user-role': 'PRESTATAIRE',
      'x-user-prestataireid': 'prest-A',
    });
    const p = perimetrePrestataireDepuisHeaders(headers);
    expect(p.prestataireId).toBe('prest-A');
  });
});

describe('avecPerimetrePrestataire — écrasement du prestataireId client', () => {
  it('un ?prestataireId=B manipulé est ÉCRASÉ par l\u2019identité serveur (A)', () => {
    const p = resoudrePerimetrePrestataire('PRESTATAIRE', 'prest-A');
    const where = avecPerimetrePrestataire<Record<string, unknown>>(
      { prestataireId: 'prest-B', statut: 'VALIDE' },
      p
    );
    expect(where.prestataireId).toBe('prest-A'); // jamais prest-B
    expect(where.statut).toBe('VALIDE');
  });

  it('no-op pour ADMINISTRATEUR (mode démonstration)', () => {
    const p = resoudrePerimetrePrestataire('ADMINISTRATEUR', null);
    const where = avecPerimetrePrestataire({ statut: 'VALIDE' }, p);
    expect('prestataireId' in where).toBe(false);
  });
});
