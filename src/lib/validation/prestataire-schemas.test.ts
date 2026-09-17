/**
 * Tests des schémas Zod Prestataire — validations de format exigées par le
 * module GESTION → PRESTATAIRES : e-mail, téléphone, NIF, Num STAT, RIB,
 * champs obligatoires. Ces primitives sont partagées par l'API ET les
 * formulaires (une seule source de vérité).
 */

import { describe, it, expect } from 'vitest';
import {
  prestataireCreateSchema,
  prestataireUpdateSchema,
} from './referentiels';
import {
  nifSchema,
  numStatSchema,
  ribSchema,
  telephoneLibreSchema,
  emailOptionnel,
} from './common';

describe('schéma NIF', () => {
  it('accepte un NIF numérique avec séparateurs', () => {
    expect(nifSchema.parse('3000 123 456')).toBe('3000 123 456');
    expect(nifSchema.parse('4002345678')).toBe('4002345678');
  });
  it('accepte un NIF alphanumérique avec tirets/points', () => {
    expect(nifSchema.parse('AB-1234.5678')).toBe('AB-1234.5678');
  });
  it('refuse un NIF trop court ou avec lettres en trop faible quantité', () => {
    expect(nifSchema.safeParse('1234567').success).toBe(false); // 7 caractères
  });
  it('refuse les caractères spéciaux non prévus', () => {
    expect(nifSchema.safeParse('3000/123/456').success).toBe(false);
  });
  it('tolère une valeur vide (champ optionnel → null)', () => {
    expect(nifSchema.parse('')).toBeNull();
    expect(nifSchema.parse(null)).toBeNull();
  });
});

describe('schéma Num STAT', () => {
  it('accepte un numéro statistique de 10 à 20 chiffres groupés', () => {
    expect(numStatSchema.parse('6512 311 2001 01234')).toBe('6512 311 2001 01234');
    expect(numStatSchema.parse('1234567890')).toBe('1234567890');
  });
  it('refuse les lettres', () => {
    expect(numStatSchema.safeParse('6512 311 2001 0123A').success).toBe(false);
  });
  it('refuse moins de 10 chiffres', () => {
    expect(numStatSchema.safeParse('123456789').success).toBe(false);
  });
  it('tolère une valeur vide (champ optionnel → null)', () => {
    expect(numStatSchema.parse('')).toBeNull();
  });
});

describe('schéma RIB', () => {
  it('accepte un compte numérique national groupé (format seed)', () => {
    expect(ribSchema.parse('000 12345 67890 12 3')).toBe('000 12345 67890 12 3');
  });
  it('accepte un IBAN malgache', () => {
    expect(ribSchema.safeParse('MG47 0000 1234 5678 9012 3456 7').success).toBe(true);
  });
  it('refuse un compte trop court (cohérence bancaire)', () => {
    expect(ribSchema.safeParse('12345').success).toBe(false);
  });
  it('refuse un mélange non-IBAN de lettres et de chiffres', () => {
    expect(ribSchema.safeParse('BNI-1234-A-789012345678').success).toBe(false);
  });
  it('tolère une valeur vide (champ optionnel → null)', () => {
    expect(ribSchema.parse('')).toBeNull();
  });
});

describe('schéma téléphone', () => {
  it('accepte les formats malgaches et internationaux', () => {
    expect(telephoneLibreSchema.parse('034 11 111 11')).toBe('034 11 111 11');
    expect(telephoneLibreSchema.parse('+261 34 12 345 67')).toBe('+261 34 12 345 67');
  });
  it('refuse trop peu de chiffres', () => {
    expect(telephoneLibreSchema.safeParse('034 12').success).toBe(false);
  });
  it('refuse les lettres', () => {
    expect(telephoneLibreSchema.safeParse('abc 034 11 111 11').success).toBe(false);
  });
});

describe('prestataireCreateSchema — champs obligatoires + formats croisés', () => {
  const base = { nom: 'Clinique Test', type: 'CLINIQUE' };

  it('exige le nom et le type', () => {
    expect(prestataireCreateSchema.safeParse({}).success).toBe(false);
    expect(prestataireCreateSchema.safeParse({ nom: 'X' }).success).toBe(false);
  });

  it('accepte une fiche complète', () => {
    const parsed = prestataireCreateSchema.parse({
      ...base,
      telephone: '034 11 111 11',
      email: 'contact@clinique.mg',
      adresse: 'Anosy',
      nif: '4001234567',
      stat: '6512 311 2002 02345',
      statutJuridique: 'SARL',
      statut: 'CONVENTIONNE',
      rib: '000 12345 67890 12 3',
    });
    expect(parsed.statutJuridique).toBe('SARL');
    expect(parsed.stat).toBe('6512 311 2002 02345');
  });

  it('refuse un e-mail mal formé', () => {
    const res = prestataireCreateSchema.safeParse({ ...base, email: 'pas-un-email' });
    expect(res.success).toBe(false);
    if (!res.success) {
      const message = res.error.issues.map(i => i.message).join(' ');
      expect(message).toContain('email');
    }
  });

  it('refuse un NIF mal formé', () => {
    expect(prestataireCreateSchema.safeParse({ ...base, nif: '12' }).success).toBe(false);
  });

  it('refuse un Num STAT mal formé', () => {
    expect(prestataireCreateSchema.safeParse({ ...base, stat: 'ABC' }).success).toBe(false);
  });

  it('transforme les champs vides en null (aucune chaîne vide en base)', () => {
    const parsed = prestataireCreateSchema.parse({ ...base, email: '', nif: '' });
    expect(emailOptionnel.parse('')).toBeNull();
    expect(parsed.email).toBeNull();
    expect(parsed.nif).toBeNull();
  });
});

describe('prestataireUpdateSchema', () => {
  it('exige un identifiant et tolère des champs partiellement fournis', () => {
    const parsed = prestataireUpdateSchema.parse({ id: 'p1', telephone: '032 22 222 22' });
    expect(parsed.telephone).toBe('032 22 222 22');
    expect(parsed.nom).toBeUndefined();
  });

  it('refuse un type hors énumération', () => {
    expect(
      prestataireUpdateSchema.safeParse({ id: 'p1', type: 'SUPERMARCHE' }).success
    ).toBe(false);
  });
});
