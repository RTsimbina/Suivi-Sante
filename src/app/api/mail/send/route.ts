/**
 * API — POST /api/mail/send
 * ─────────────────────────
 * Point d'entrée HTTP du service de messagerie centralisé.
 * Chaque demande passe la chaîne complète : authentification → validation →
 * anti-abus → rate-limiting → génération → file d'attente (logs & suivi).
 *
 * Authentification (brique 1 de l'architecture cible) :
 *   - session NextAuth (rôles autorisés : voir API_PERMISSIONS['/api/mail/send'])
 *   - ou machine : `Authorization: Bearer $MAIL_API_KEY`
 *
 * Codes de retour :
 *   202 → accepté et mis en file d'attente (ou envoyé si traiter=true)
 *   400 → demande malformée (Zod) / adresse invalide
 *   401/403 → non authentifié / rôle refusé
 *   422 → rejeté par l'anti-abus (domaine bloqué, taille, MX inexistant…)
 *   429 → quota d'envoi atteint (par destinataire ou global)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkAuth } from '@/lib/authorize';
import { estAppelMachineAutorise } from '@/lib/mail/api-auth';
import { envoyerCourriel, type ResultatCourriel } from '@/lib/mail';

export const maxDuration = 60;

// ─── Schéma de la demande (Zod) ──────────────────────────────────────────────

const schemaEnvoi = z
  .object({
    destinataires: z.array(z.string().max(254)).min(1).max(50),
    cc: z.array(z.string().max(254)).max(25).optional(),
    bcc: z.array(z.string().max(254)).max(25).optional(),
    sujet: z.string().max(255).optional(),
    texte: z.string().max(1_500_000).optional(),
    html: z.string().max(1_500_000).optional(),
    template: z.enum(['reinitialisation-mdp', 'notification', 'test']).optional(),
    donnees: z.record(z.string(), z.unknown()).optional(),
    piecesJointes: z
      .array(
        z.object({
          nom: z.string().max(255),
          contenuBase64: z.string().max(12_000_000), // ~9 Mo en base64
          contentType: z.string().max(100).optional(),
        })
      )
      .max(5)
      .optional(),
    fromPersonnalise: z.string().max(354).optional(),
    replyTo: z.string().max(254).optional(),
    categorie: z.string().max(50).optional(),
    priorite: z.number().int().min(1).max(9).optional(),
    traiter: z.boolean().optional(),
  })
  .refine((d) => !!d.template || (!!d.sujet && (!!d.texte || !!d.html)), {
    message: 'Un template, ou bien un sujet avec un corps (texte et/ou html), est requis.',
  });

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 1. AUTHENTIFICATION — session NextAuth (middleware) ou clé API machine
  const machine = await estAppelMachineAutorise(request);
  if (!machine) {
    const refus = await checkAuth(request);
    if (refus) return refus; // 401 / 403
  }

  // 2. VALIDATION STRUCTURELLE — Zod
  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ erreur: 'Corps JSON invalide.' }, { status: 400 });
  }

  const parse = schemaEnvoi.safeParse(corps);
  if (!parse.success) {
    return NextResponse.json(
      {
        erreur: 'Demande invalide.',
        details: parse.error.issues.map((i) => ({
          champ: i.path.join('.'),
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }
  const d = parse.data;

  // 3→7. VALIDATION MÉTIER + ANTI-ABUS + RATE LIMIT + GÉNÉRATION + FILE
  const resultat: ResultatCourriel = await envoyerCourriel({
    destinataires: d.destinataires,
    cc: d.cc,
    bcc: d.bcc,
    sujet: d.sujet,
    texte: d.texte,
    html: d.html,
    template: d.template,
    donnees: d.donnees,
    piecesJointes: d.piecesJointes,
    fromPersonnalise: d.fromPersonnalise,
    replyTo: d.replyTo,
    categorie: d.categorie,
    priorite: d.priorite,
    traiter: d.traiter,
    source: 'api/mail/send',
    sourceId: machine ? 'api-key' : (request.headers.get('x-user-id') || 'session'),
  });

  if (!resultat.accepte) {
    const status = resultat.code === 'QUOTA' ? 429 : resultat.code === 'REJETE' ? 422 : 400;
    return NextResponse.json(
      { erreur: resultat.motif, code: resultat.code },
      { status }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      id: resultat.envoi?.id,
      statut: resultat.envoi?.statut,
      livraison: resultat.envoi?.livraison,
      message: resultat.envoi?.statut === 'ENVOYE'
        ? 'E-mail envoyé.'
        : 'E-mail accepté dans la file d\'attente.',
    },
    { status: 202 }
  );
}
