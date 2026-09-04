/**
 * API — GET /api/mail
 * ───────────────────
 * Logs et suivi du service de messagerie (brique 7 de l'architecture cible).
 * Réservé à l'ADMINISTRATEUR (voir API_PERMISSIONS['/api/mail']).
 *
 * Retourne les statistiques de la file + la liste des derniers envois
 * (métadonnées uniquement — les corps HTML/texte ne sont jamais exposés).
 *
 * Paramètres de requête :
 *   statut    EN_ATTENTE | EN_COURS | ENVOYE | ECHEC (optionnel)
 *   categorie filtre par catégorie fonctionnelle (optionnel)
 *   limite    1..100 (défaut 25)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { statistiquesFile } from '@/lib/mail/queue';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const statut = params.get('statut') || undefined;
  const categorie = params.get('categorie') || undefined;
  const limite = Math.min(Math.max(Number(params.get('limite')) || 25, 1), 100);

  const [stats, envois] = await Promise.all([
    statistiquesFile(),
    db.courrielSortant.findMany({
      where: {
        ...(statut ? { statut } : {}),
        ...(categorie ? { categorie } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limite,
      select: {
        id: true,
        destinatairePrincipal: true,
        sujet: true,
        statut: true,
        tentatives: true,
        maxTentatives: true,
        categorie: true,
        source: true,
        sourceId: true,
        priorite: true,
        template: true,
        messageId: true,
        derniereErreur: true,
        createdAt: true,
        envoyeLe: true,
        prochaineTentative: true,
      },
    }),
  ]);

  return NextResponse.json({ stats, envois });
}
