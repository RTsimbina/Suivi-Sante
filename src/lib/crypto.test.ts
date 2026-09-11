/**
 * Tests unitaires du chiffrement des secrets en base (src/lib/crypto.ts).
 * Contrat de sécurité (correctif audit) : SERVER_ENCRYPTION_KEY OBLIGATOIRE —
 * plus aucun fallback silencieux qui retournait les secrets en clair ou un
 * garbage illisible à l'envoi (erreurs 535 incompréhensibles).
 */

import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, isEncrypted } from '@/lib/crypto';

const CLE = 'cle-de-test-serveur-32-octets-ok';
const AUTRE_CLE = 'une-autre-cle-totalement-differente';

describe('crypto.encrypt', () => {
  it('refuse de chiffrer sans SERVER_ENCRYPTION_KEY (fail-closed)', () => {
    expect(() => encrypt('mot-de-passe', '')).toThrowError(/SERVER_ENCRYPTION_KEY manquante/);
  });

  it('refuse de chiffrer avec une clé undefined', () => {
    expect(() => encrypt('mot-de-passe', undefined as unknown as string)).toThrowError(
      /SERVER_ENCRYPTION_KEY manquante/
    );
  });

  it('produit une charge chiffrée distincte du texte clair', () => {
    const chiffre = encrypt('MonMotDePasse2024!', CLE);
    expect(chiffre).not.toContain('MonMotDePasse2024!');
    expect(chiffre).not.toEqual('MonMotDePasse2024!');
  });

  it('produit deux chiffrés différents pour le même clair (IV aléatoire)', () => {
    expect(encrypt('abc', CLE)).not.toEqual(encrypt('abc', CLE));
  });
});

describe('crypto.decrypt', () => {
  it('déchiffre correctement un chiffré produit avec la même clé', () => {
    const clair = 'p@ssw0rd-SMTP-2026';
    expect(decrypt(encrypt(clair, CLE), CLE)).toBe(clair);
  });

  it('refuse de déchiffrer sans SERVER_ENCRYPTION_KEY (fail-closed)', () => {
    const chiffre = encrypt('secret', CLE);
    expect(() => decrypt(chiffre, '')).toThrowError(/SERVER_ENCRYPTION_KEY manquante/);
  });

  it('échoue bruyamment avec une clé différente de celle du chiffrement', () => {
    const chiffre = encrypt('secret', CLE);
    expect(() => decrypt(chiffre, AUTRE_CLE)).toThrowError(/Déchiffrement impossible/);
  });

  it('échoue bruyamment sur une donnée corrompue', () => {
    const chiffre = encrypt('secret', CLE);
    // Corrompre le corps base64 (longueur suffisante pour passer le garde-fou)
    const corrompu = chiffre.slice(0, -4) + 'AAAA';
    expect(() => decrypt(corrompu, CLE)).toThrowError(/Déchiffrement impossible/);
  });

  it('tolère en lecture un ancien mot de passe court stocké en clair (héritage)', () => {
    // Moins de 29 octets : trop court pour être un chiffré AES-GCM → renvoyé tel quel
    expect(decrypt('abc123', CLE)).toBe('abc123');
  });
});

describe('crypto.isEncrypted', () => {
  it('reconnaît une charge produite par encrypt()', () => {
    expect(isEncrypted(encrypt('x', CLE), CLE)).toBe(true);
  });

  it('rejette un texte clair court', () => {
    expect(isEncrypted('abc123', CLE)).toBe(false);
  });

  it('rejette sans clé (contrat : pas de décision sans configuration)', () => {
    expect(isEncrypted('abc123', '')).toBe(false);
  });
});
