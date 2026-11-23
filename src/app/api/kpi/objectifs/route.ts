/**
 * /api/kpi/objectifs — Délais cibles par service/type de dossier.
 * GET  : versions en vigueur + historique des anciennes valeurs (ADMINISTRATEUR).
 * POST : modification VERSIONNÉE — la version en vigueur est fermée
 *        (valideAu = maintenant) et une nouvelle ligne est créée ; le motif est
 *        obligatoire et le changement est journalisé (HistoriqueParametre,
 *        audit immuable). Les KPI d'époque restent recalculables.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { logParametreChange, getUserInfoFromRequest } from '@/lib/audit-log';
import { parseJsonBody } from '@/lib/validation/parse';
import { SERVICES_KPI } from '@/lib/kpi-etapes';

const schemaCreation = z.object({
  service: z.enum(SERVICES_KPI),
  typeDossier: z.string().trim().max(80).optional().nullable(),
  delaiMinutes: z.number().int().min(1).max(60 * 24 * 30),
  motif: z.string().trim().min(10).max(500),
});

export async function GET(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;
  const [enVigueur, historique] = await Promise.all([
    db.objectifDelai.findMany({ where: { valideAu: null }, orderBy: [{ service: 'asc' }, { typeDossier: 'asc' }] }),
    db.objectifDelai.findMany({ where: { valideAu: { not: null } }, orderBy: { valideDu: 'desc' }, take: 200 }),
  ]);
  return NextResponse.json({ enVigueur, historique });
}

export async function POST(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;
  const parsed = await parseJsonBody(request, schemaCreation);
  if (!parsed.success) return parsed.response;
  const { service, typeDossier, delaiMinutes, motif } = parsed.data;

  try {
    const { nom, id } = await getUserInfoFromRequest(request);
    const resultat = await db.$transaction(async (tx) => {
      const precedentes = await tx.objectifDelai.findMany({
        where: { service, typeDossier: typeDossier ?? null, valideAu: null },
      });
      const now = new Date();
      for (const p of precedentes) {
        await tx.objectifDelai.update({ where: { id: p.id }, data: { valideAu: now } });
      }
      const cree = await tx.objectifDelai.create({
        data: { service, typeDossier: typeDossier ?? null, delaiMinutes, valideDu: now, motif, creeParId: id ?? '' },
      });
      // Audit immuable : ancienne → nouvelle valeur de l'objectif
      await logParametreChange({
        entite: 'ObjectifDelai', entiteId: cree.id, champ: 'delaiMinutes',
        ancienneValeur: precedentes[0]?.delaiMinutes ?? null, nouvelleValeur: delaiMinutes,
        modifiePar: nom, modifieParId: id ?? undefined,
        action: precedentes.length > 0 ? 'MODIFICATION' : 'CREATION',
        module: 'KPI',
        objet: `Délai cible ${service}${typeDossier ? ` / ${typeDossier}` : ''}`,
        motif, request,
      });
      return cree;
    });
    return NextResponse.json(resultat, { status: 201 });
  } catch (e) {
    console.error('Erreur création objectif KPI :', e);
    return NextResponse.json({ erreur: 'Erreur lors de la modification de l\u2019objectif.' }, { status: 500 });
  }
}
