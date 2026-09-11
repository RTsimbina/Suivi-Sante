/**
 * Test du contrat TLS strict des connexions SMTP sortantes.
 * Régression : les options étaient réglées sur `rejectUnauthorized: false`
 * (ports 465 et 587), désactivant toute validation du certificat serveur —
 * interception MITM possible des identifiants et du contenu des courriels.
 */

import { describe, it, expect } from 'vitest';
import { optionsTlsSmtp } from '@/lib/mail/tls';

describe('optionsTlsSmtp', () => {
  it('exige la validation du certificat serveur (rejectUnauthorized: true)', () => {
    expect(optionsTlsSmtp().rejectUnauthorized).toBe(true);
  });

  it('ne propose aucune option de contournement de la validation', () => {
    const options = optionsTlsSmtp() as Record<string, unknown>;
    const valeurs = Object.values(options);
    expect(valeurs).not.toContain(false);
  });
});
