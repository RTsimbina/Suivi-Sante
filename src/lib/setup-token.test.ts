import { describe, it, expect } from 'vitest';
import { verifierJetonSetup, cleRateLimitSetup } from '@/lib/setup-token';

// ─── Tests P0 « Sécuriser le jeton d'installation » ──────────────────────────
// Couverture exigée par l'audit : jeton valide, jeton incorrect, jeton vide,
// jeton de longueur différente, configuration serveur manquante, requêtes
// non autorisées. Critère d'acceptation : AUCUNE exception sur des longueurs
// différentes, AUCUN jeton dans l'URL, AUCUNE fuite d'information.

const JETON_SERVEUR = 'setup-token-super-secret-2026!';

describe('verifierJetonSetup — cas conformes', () => {
  it('accepte un jeton valide (Bearer exact)', () => {
    const r = verifierJetonSetup(`Bearer ${JETON_SERVEUR}`, JETON_SERVEUR);
    expect(r.ok).toBe(true);
    expect(r.statut).toBe(200);
    expect(r.erreur).toBeUndefined();
  });

  it('accepte un jeton valide encadré d\'espaces (tolérance d\'en-tête)', () => {
    const r = verifierJetonSetup(`Bearer   ${JETON_SERVEUR}  `, JETON_SERVEUR);
    expect(r.ok).toBe(true);
    expect(r.statut).toBe(200);
  });
});

describe('verifierJetonSetup — jetons invalides (403 générique)', () => {
  it('refuse un jeton incorrect de MÊME longueur (timing-safe)', () => {
    // Même longueur que JETON_SERVEUR, contenu différent
    const faux = 'x'.repeat(JETON_SERVEUR.length);
    const r = verifierJetonSetup(`Bearer ${faux}`, JETON_SERVEUR);
    expect(r.ok).toBe(false);
    expect(r.statut).toBe(403);
    expect(r.erreur).toBe('Token de setup invalide');
  });

  it('refuse un jeton VIDE (Bearer sans valeur) sans exception', () => {
    const r = verifierJetonSetup('Bearer ', JETON_SERVEUR);
    expect(r.ok).toBe(false);
    expect(r.statut).toBe(403);
    expect(r.erreur).toBe('Token de setup invalide');
  });

  it('refuse un jeton de LONGUEUR DIFFÉRENTE sans lever d\'exception (cœur du P0)', () => {
    // Avant correctif : timingSafeEqual levait RangeError → 500 non géré,
    // ce qui fuyait la longueur du jeton attendu (oracle).
    const courts = ['a', 'ab', 'abc', 'a'.repeat(JETON_SERVEUR.length - 1)];
    const longs = [
      'a'.repeat(JETON_SERVEUR.length + 1),
      'a'.repeat(JETON_SERVEUR.length * 2),
      '',
    ];
    for (const candidat of [...courts, ...longs]) {
      const r = verifierJetonSetup(`Bearer ${candidat}`, JETON_SERVEUR);
      expect(r.ok).toBe(false);
      expect(r.statut).toBe(403);
      expect(r.erreur).toBe('Token de setup invalide');
    }
  });

  it('refuse un jeton unicode de longueur buffer différente sans exception', () => {
    // Les caractères multi-octets modifient la longueur du buffer UTF-8
    const r = verifierJetonSetup('Bearer 🔐🔐🔐🔐', JETON_SERVEUR);
    expect(r.ok).toBe(false);
    expect(r.statut).toBe(403);
  });
});

describe('verifierJetonSetup — configuration serveur manquante (503)', () => {
  it('renvoie 503 si SETUP_TOKEN est undefined, même avec un jeton fourni', () => {
    const r = verifierJetonSetup(`Bearer ${JETON_SERVEUR}`, undefined);
    expect(r.ok).toBe(false);
    expect(r.statut).toBe(503);
    expect(r.erreur).toContain('SETUP_TOKEN non configuré');
  });

  it('renvoie 503 si SETUP_TOKEN est vide — jamais de correspondance vide', () => {
    // Un jeton serveur vide ne doit JAMAIS valider une entrée vide.
    const r = verifierJetonSetup('Bearer ', '');
    expect(r.ok).toBe(false);
    expect(r.statut).toBe(503);
  });

  it('ne compare RIEN quand la config manque (motif CONFIG_MANQUANTE en premier)', () => {
    const r = verifierJetonSetup(null, '');
    expect(r.motif).toBe('CONFIG_MANQUANTE');
    expect(r.statut).toBe(503);
  });
});

describe('verifierJetonSetup — requêtes non autorisées (403)', () => {
  it('refuse un en-tête Authorization absent', () => {
    const r = verifierJetonSetup(null, JETON_SERVEUR);
    expect(r.ok).toBe(false);
    expect(r.statut).toBe(403);
    expect(r.erreur).toBe('Token de setup invalide');
  });

  it('refuse un en-tête sans schéma Bearer', () => {
    for (const entete of [JETON_SERVEUR, `Basic ${JETON_SERVEUR}`, `bearer ${JETON_SERVEUR}`]) {
      const r = verifierJetonSetup(entete, JETON_SERVEUR);
      expect(r.ok).toBe(false);
      expect(r.statut).toBe(403);
      expect(r.motif).toBe('SCHEMA_INVALIDE');
    }
  });
});

describe('verifierJetonSetup — anti-fuite d\'information', () => {
  it('ne renvoie JAMAIS le jeton (ni reçu ni attendu) dans les messages', () => {
    const resultats = [
      verifierJetonSetup(null, JETON_SERVEUR),
      verifierJetonSetup('Bearer mauvais-jeton', JETON_SERVEUR),
      verifierJetonSetup('Bearer ', undefined),
      verifierJetonSetup('Bearer x', JETON_SERVEUR),
    ];
    for (const r of resultats) {
      const rendu = JSON.stringify(r);
      expect(rendu).not.toContain(JETON_SERVEUR);
      expect(rendu).not.toContain('mauvais-jeton');
    }
  });

  it('utilise un message 403 UNIQUE quel que soit le motif (aucun oracle)', () => {
    const motifs403 = [
      verifierJetonSetup(null, JETON_SERVEUR), // en-tête absent
      verifierJetonSetup('Token abc', JETON_SERVEUR), // schéma invalide
      verifierJetonSetup('Bearer ', JETON_SERVEUR), // jeton vide
      verifierJetonSetup('Bearer court', JETON_SERVEUR), // longueur différente
      verifierJetonSetup(`Bearer ${'z'.repeat(JETON_SERVEUR.length)}`, JETON_SERVEUR), // incorrect
    ];
    for (const r of motifs403) {
      expect(r.erreur).toBe('Token de setup invalide');
    }
  });
});

describe('cleRateLimitSetup', () => {
  it('construit une clé par IP conforme aux conventions du limiteur', () => {
    expect(cleRateLimitSetup('192.168.1.10')).toBe('setup:ip:192.168.1.10');
    expect(cleRateLimitSetup('unknown')).toBe('setup:ip:unknown');
  });
});
