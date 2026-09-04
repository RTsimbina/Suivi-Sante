import { describe, it, expect } from 'vitest';
import {
  concatenerTxt,
  evaluerSpf,
  evaluerDmarc,
  evaluerDkim,
  extraireDomaineFrom,
} from './dns';

describe('concatenerTxt', () => {
  it('rejoint les chaînes découpées des enregistrements TXT', () => {
    expect(concatenerTxt([['v=spf1 ', 'include:brevo ', '~all']])).toEqual([
      'v=spf1 include:brevo ~all',
    ]);
  });
});

describe('evaluerSpf', () => {
  it('ABSENT quand aucun SPF publié', () => {
    expect(evaluerSpf(null).statut).toBe('ABSENT');
    expect(evaluerSpf(null).erreur).toContain('SPF');
  });

  it('PASS avec un SPF correct', () => {
    const result = evaluerSpf('v=spf1 include:spf.brevo.com ~all');
    expect(result.statut).toBe('PASS');
    expect(result.avertissements).toHaveLength(0);
  });

  it('avertit sans mécanisme « all » strict', () => {
    const result = evaluerSpf('v=spf1 include:spf.brevo.com');
    expect(result.statut).toBe('PASS');
    expect(result.avertissements?.some((a) => a.includes('all'))).toBe(true);
  });
});

describe('evaluerDmarc', () => {
  it('ABSENT quand aucun DMARC publié', () => {
    expect(evaluerDmarc(null).statut).toBe('ABSENT');
    expect(evaluerDmarc(null).erreur).toContain('v=DMARC1');
  });

  it('PASS avec avertissement pour p=none (observation)', () => {
    const result = evaluerDmarc('v=DMARC1; p=none; rua=mailto:dmarc@exemple.com');
    expect(result.statut).toBe('PASS');
    expect(result.avertissements?.some((a) => a.includes('p=none'))).toBe(true);
  });

  it('avertit sans rua (pas de rapports)', () => {
    const result = evaluerDmarc('v=DMARC1; p=reject');
    expect(result.statut).toBe('PASS');
    expect(result.avertissements?.some((a) => a.includes('rua='))).toBe(true);
    expect(result.avertissements?.some((a) => a.includes('p=none'))).toBe(false);
  });
});

describe('evaluerDkim', () => {
  it('ABSENT quand aucune clé publiée', () => {
    expect(evaluerDkim(null).statut).toBe('ABSENT');
  });

  it('PASS avec une clé publique', () => {
    const cle = 'v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC...';
    const result = evaluerDkim(cle);
    expect(result.statut).toBe('PASS');
  });

  it('avertit si la clé est révoquée (p= vide)', () => {
    const result = evaluerDkim('v=DKIM1; k=rsa; p=;');
    expect(result.statut).toBe('PASS');
    expect(result.avertissements?.some((a) => a.includes('révoquée'))).toBe(true);
  });
});

describe('extraireDomaineFrom', () => {
  it('parse « Nom <a@b.com> » et « a@b.com »', () => {
    expect(extraireDomaineFrom('Suivi Santé <noreply@suivisante.mg>')).toBe('suivisante.mg');
    expect(extraireDomaineFrom('noreply@suivisante.mg')).toBe('suivisante.mg');
    expect(extraireDomaineFrom('NOREPLY@Suivisante.MG')).toBe('suivisante.mg');
  });

  it('retourne null sur des entrées invalides', () => {
    expect(extraireDomaineFrom('sans-arobase')).toBeNull();
    expect(extraireDomaineFrom('@domaine.com')).toBeNull();
    expect(extraireDomaineFrom('user@')).toBeNull();
  });
});
