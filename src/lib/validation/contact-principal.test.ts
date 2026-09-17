/**
 * Tests du schéma « societeTechniqueCreateSchema » — nom / e-mail du contact
 * principal (règle métier demandée par l'admin) :
 *   - `contactPrincipal` reçoit le NOM SEUL du représentant (information) ;
 *   - `emailContactPrincipal` (champ DÉDIÉ) reçoit son e-mail et sert de
 *     liaison au compte CONTACT_ENTREPRISE (src/lib/liaison-externe.ts).
 * Le champ e-mail ne doit jamais être mélangé au nom (ni inversé).
 */

import { describe, it, expect } from 'vitest';
import {
  societeTechniqueCreateSchema,
  societeTechniqueUpdateSchema,
} from '@/lib/validation/finances';

const BASE = {
  nom: 'SANLAM MADAGASCAR ASSURANCE',
};

describe('societeTechniqueCreateSchema — contact principal (nom seul)', () => {
  it('accepte le nom seul du contact principal', () => {
    const r = societeTechniqueCreateSchema.safeParse({
      ...BASE,
      contactPrincipal: 'Hery Rakotomalala',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.contactPrincipal).toBe('Hery Rakotomalala');
  });

  it('accepte contactPrincipal + emailContactPrincipal ensemble (flux « Modifier la société »)', () => {
    const r = societeTechniqueCreateSchema.safeParse({
      ...BASE,
      contactPrincipal: 'Voahangy Ravelomanana',
      emailContactPrincipal: 'contact.telma@telma.mg',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.contactPrincipal).toBe('Voahangy Ravelomanana');
      expect(r.data.emailContactPrincipal).toBe('contact.telma@telma.mg');
    }
  });

  it('contactPrincipal optionnel (société sans représentant déclaré)', () => {
    const r = societeTechniqueCreateSchema.safeParse(BASE);
    expect(r.success).toBe(true);
  });

  it('normalise une chaîne d\u2019espaces en chaîne vide (champ optionnel)', () => {
    const r = societeTechniqueCreateSchema.safeParse({
      ...BASE,
      contactPrincipal: '   ',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.contactPrincipal).toBe('');
  });

  it('rejette un contactPrincipal trop long (> 200)', () => {
    const r = societeTechniqueCreateSchema.safeParse({
      ...BASE,
      contactPrincipal: 'A'.repeat(201),
    });
    expect(r.success).toBe(false);
  });
});

describe('societeTechniqueCreateSchema — e-mail du contact principal (champ dédié)', () => {
  it('accepte un e-mail valide dans le champ dédié', () => {
    const r = societeTechniqueCreateSchema.safeParse({
      ...BASE,
      emailContactPrincipal: 'contact.airtel@airtel.mg',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.emailContactPrincipal).toBe('contact.airtel@airtel.mg');
  });

  it('rejette un e-mail invalide (faute de frappe)', () => {
    for (const mauvais of ['pas-un-email', 'contact.airtel@', '@airtel.mg', 'deux@@airtel.mg']) {
      const r = societeTechniqueCreateSchema.safeParse({
        ...BASE,
        emailContactPrincipal: mauvais,
      });
      expect(r.success).toBe(false);
    }
  });

  it('accepte l\u2019absence du champ (null)', () => {
    const r = societeTechniqueCreateSchema.safeParse({
      ...BASE,
      emailContactPrincipal: null,
    });
    expect(r.success).toBe(true);
  });

  it('nom de société requis, e-mail de la société validé séparément', () => {
    const r = societeTechniqueCreateSchema.safeParse({
      nom: 'BNI MADAGASCAR',
      email: 'contact@bni.mg',
      contactPrincipal: 'Tojo Randrianarivelo',
      emailContactPrincipal: 'contact.bni@bni.mg',
    });
    expect(r.success).toBe(true);
  });

  it('nom de société vide (espaces) → rejeté', () => {
    const r = societeTechniqueCreateSchema.safeParse({ nom: '   ' });
    expect(r.success).toBe(false);
  });
});

describe('societeTechniqueUpdateSchema — modification partielle', () => {
  it('accepte la mise à jour du seul e-mail du contact principal', () => {
    const r = societeTechniqueUpdateSchema.safeParse({
      emailContactPrincipal: 'nouveau.contact@sanlam.mg',
    });
    expect(r.success).toBe(true);
  });

  it('rejette un e-mail invalide en mise à jour', () => {
    const r = societeTechniqueUpdateSchema.safeParse({
      emailContactPrincipal: 'cassé',
    });
    expect(r.success).toBe(false);
  });
});
