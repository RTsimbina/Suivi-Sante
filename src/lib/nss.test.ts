/**
 * Tests P2-03 — Politique de confidentialité du NSS (src/lib/nss.ts).
 *
 *   - masquage strict : seuls les 4 derniers caractères restent lisibles ;
 *   - rôles externes (portails + prestataire) : masquage systématique ;
 *   - personnel interne habilité : NSS complet selon les permissions validées ;
 *   - journalisation des révélations : QUI / QUAND / société / bénéficiaire /
 *     motif, SANS jamais écrire le NSS complet dans le journal ;
 *   - échec du journal non bloquant pour la consultation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const auditMocks = vi.hoisted(() => ({
  logParametreChange: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./audit-log', () => ({
  logParametreChange: auditMocks.logParametreChange,
}));

import {
  masquerNss,
  peutVoirNssComplet,
  nssPourRole,
  journaillerConsultationNss,
} from './nss';

describe('masquerNss — masquage strict', () => {
  it('garde seuls les 4 derniers caractères (format mission 123456789012 → ********9012 équivalent)', () => {
    expect(masquerNss('123456789012')).toBe('••••••••9012');
  });

  it('NSS court : règle uniforme des 4 derniers ; ≤ 4 → totalement masqué', () => {
    expect(masquerNss('12345')).toBe('•2345'); // 4 derniers visibles
    expect(masquerNss('123')).toBe('•••');
    expect(masquerNss('1234')).toBe('••••');
  });

  it('valeurs vides / null / undefined → affichage neutre', () => {
    expect(masquerNss(null)).toBe('—');
    expect(masquerNss(undefined)).toBe('—');
    expect(masquerNss('   ')).toBe('—');
  });
});

describe('peutVoirNssComplet / nssPourRole — politique par rôle', () => {
  it('rôles externes : jamais de NSS complet', () => {
    for (const role of ['PORTAIL_CLIENT', 'CONTACT_ENTREPRISE', 'PRESTATAIRE']) {
      expect(peutVoirNssComplet(role)).toBe(false);
    }
  });

  it('personnel interne habilité : NSS complet selon les permissions validées', () => {
    for (const role of ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE']) {
      expect(peutVoirNssComplet(role)).toBe(true);
    }
  });

  it('rôle absent / inconnu : masqué (fail-closed)', () => {
    expect(peutVoirNssComplet(undefined)).toBe(false);
    expect(peutVoirNssComplet(null)).toBe(false);
    expect(peutVoirNssComplet('ROLE_INCONNU')).toBe(false);
  });

  it('nssPourRole applique la politique : masqué pour un externe, complet pour un habilité', () => {
    expect(nssPourRole('123456789012', 'CONTACT_ENTREPRISE')).toBe('••••••••9012');
    expect(nssPourRole('123456789012', 'SANTE')).toBe('123456789012');
    // Un administrateur DANS le contexte portail reste soumis au masquage
    // systématique de la route (le masquage n'est pas contournable par le rôle)
    expect(nssPourRole('123456789012', 'ADMINISTRATEUR')).toBe('123456789012');
  });

  it('nssPourRole : NSS absent → null (jamais la chaîne de masquage)', () => {
    expect(nssPourRole(null, 'SANTE')).toBeNull();
    expect(nssPourRole('', 'CONTACT_ENTREPRISE')).toBeNull();
  });
});

describe('journaillerConsultationNss — traçabilité SANS fuite', () => {
  beforeEach(() => {
    auditMocks.logParametreChange.mockClear().mockResolvedValue(undefined);
  });

  const REQUETE = new Request('http://localhost/api/sante/verifier-assure', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
  });

  it('journalise QUI / QUAND / société / bénéficiaire / motif — SANS le NSS complet', async () => {
    await journaillerConsultationNss({
      assureId: 'assure-1',
      societeId: 'soc-1',
      beneficiaire: 'Jean RAKOTO',
      modifiePar: 'Dr SANTE',
      modifieParId: 'u-9',
      roleUtilisateur: 'SANTE',
      motif: 'Consultation Contrôle Santé (vérification assuré)',
      request: REQUETE,
    });

    expect(auditMocks.logParametreChange).toHaveBeenCalledTimes(1);
    const params = auditMocks.logParametreChange.mock.calls[0][0];
    expect(params.entite).toBe('Assure');
    expect(params.entiteId).toBe('assure-1'); // référence assuré, pas le NSS
    expect(params.champ).toBe('nSS');
    expect(params.nouvelleValeur).toBe('CONSULTATION_NSS_COMPLET');
    expect(params.action).toBe('CONSULTATION');
    expect(params.niveau).toBe('SENSIBLE');
    expect(params.societeId).toBe('soc-1');
    expect(params.motif).toContain('Contrôle Santé');
    // Le NSS complet n'apparaît NULLE PART dans les paramètres journalisés
    const serialise = JSON.stringify(params);
    expect(serialise).not.toContain('123456789012');
  });

  it('échec du journal NON BLOQUANT (la consultation légitime passe)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    auditMocks.logParametreChange.mockRejectedValue(new Error('journal indisponible'));

    await expect(
      journaillerConsultationNss({
        assureId: 'assure-2',
        modifiePar: 'Dr SANTE',
        motif: 'test',
        request: REQUETE,
      }),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
