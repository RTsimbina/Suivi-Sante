/**
 * API — GET /api/mail/dns-check
 * ─────────────────────────────
 * Vérification SPF / DKIM / DMARC du domaine d'expédition (plan §18-20).
 * Réservé à l'ADMINISTRATEUR.
 *
 * Le domaine est déduit de :
 *   1. la variable MAIL_FROM_EMAIL si définie ;
 *   2. sinon l'expéditeur configuré (page Configuration ou SMTP_FROM).
 *
 * Le sélecteur DKIM provient de MAIL_DKIM_SELECTOR (défaut « mail »).
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/authorize';
import { getSmtpConfigForUI } from '@/lib/email';
import { verifierDnsDomaine, extraireDomaineFrom } from '@/lib/mail/dns';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const refus = await checkAuth(request);
  if (refus) return refus;

  // ── Détermine le domaine d'expédition ────────────────────────────────────
  let from = process.env.MAIL_FROM_EMAIL || '';
  if (!from) {
    const config = await getSmtpConfigForUI();
    from = config?.from || '';
  }
  if (!from) {
    return NextResponse.json(
      {
        erreur:
          "Aucun expéditeur configuré — définissez MAIL_FROM_EMAIL, ou configurez le relais SMTP dans la page Configuration.",
      },
      { status: 400 }
    );
  }

  const domaine = extraireDomaineFrom(from);
  if (!domaine) {
    return NextResponse.json(
      { erreur: `Expéditeur « ${from} » invalide — impossible d'en extraire le domaine.` },
      { status: 400 }
    );
  }

  // ── Vérification DNS (SPF + DKIM + DMARC en parallèle) ───────────────────
  try {
    const resultat = await verifierDnsDomaine(domaine);
    return NextResponse.json({ ...resultat, fromEmail: from.trim() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { erreur: `Échec de la vérification DNS : ${message}` },
      { status: 500 }
    );
  }
}
