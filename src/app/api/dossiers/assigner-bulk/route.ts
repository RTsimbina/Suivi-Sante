import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { parseJsonBody } from '@/lib/validation/parse';
import { assignerBulkSchema } from '@/lib/validation';
import { synchroniserEtapeControleMedical } from '@/lib/kpi-etapes';

/**
 * POST /api/dossiers/assigner-bulk
 *
 * Assigne en masse un gestionnaire à une liste de dossiers.
 * Body : { dossierIds: string[], champ: 'ACCUEIL' | 'TECHNIQUE' | 'COMPTABILITE' | 'CONTROLE_MEDICAL', gestionnaireId: string }
 * R3 : le champ CONTROLE_MEDICAL (assignation native du contrôle médical) est
 * réservé aux rôles SANTE / ADMINISTRATEUR ; l'étape KPI ouverte du contrôle
 * médical est synchronisée (complétion / réaffectation) après la mise à jour.
 */
export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    // ─── Validation Zod centralisée (liste, enum, identifiants) ─────────────
    const parsed = await parseJsonBody(request, assignerBulkSchema);
    if (!parsed.success) return parsed.response;
    const { dossierIds, champ, gestionnaireId } = parsed.data;

    // ─── R3 : garde applicatif champ × rôle (la matrice autorise SANTE pour
    // toute la route — elle ne peut pas distinguer les champs) ───────────────
    const userRole = request.headers.get('x-user-role');
    if (champ === 'CONTROLE_MEDICAL' && userRole !== 'SANTE' && userRole !== 'ADMINISTRATEUR') {
      return NextResponse.json(
        { erreur: "L'assignation du contrôle médical est réservée au Contrôle Santé et à l'administrateur." },
        { status: 403 }
      );
    }

    // Limiter à 200 dossiers par requête
    const ids = dossierIds.slice(0, 200);

    // Vérifier que le gestionnaire existe et a le bon service
    const gestionnaire = await db.gestionnaire.findUnique({
      where: { id: gestionnaireId },
      select: { id: true, nom: true, service: true },
    });

    if (!gestionnaire) {
      return NextResponse.json({ erreur: 'Gestionnaire introuvable.' }, { status: 404 });
    }

    if (gestionnaire.service !== champ) {
      return NextResponse.json({ erreur: `Ce gestionnaire appartient au service ${gestionnaire.service}, pas à ${champ}.` },
        { status: 400 }
      );
    }

    // Construire le champ Prisma
    const fieldMap = {
      ACCUEIL: 'gestionnaireAccueilId',
      TECHNIQUE: 'gestionnaireTechniqueId',
      COMPTABILITE: 'gestionnaireComptaId',
      CONTROLE_MEDICAL: 'gestionnaireControleMedicalId',
    } as const;

    const prismaField = fieldMap[champ];

    // Compter combien étaient effectivement non assignés
    const nonAssignes = await db.dossier.findMany({
      where: { id: { in: ids }, [prismaField]: null },
      select: { id: true },
    });

    const nonAssigneIds = nonAssignes.map(d => d.id);

    if (nonAssigneIds.length === 0) {
      return NextResponse.json({
        message: 'Tous les dossiers sélectionnés sont déjà assignés.',
        updated: 0,
        skipped: ids.length,
      });
    }

    // Mise à jour en masse
    const result = await db.dossier.updateMany({
      where: { id: { in: nonAssigneIds } },
      data: { [prismaField]: gestionnaireId },
    });

    // Ajouter une entrée dans l'historique pour chaque dossier mis à jour
    const historiqueComment = `Assigné en masse à ${gestionnaire.nom} (${champ})`;
    const dossiers = await db.dossier.findMany({
      where: { id: { in: nonAssigneIds } },
      select: { id: true, historique: true },
    });

    for (const d of dossiers) {
      const currentH: unknown[] = (() => { try { return JSON.parse(d.historique || '[]'); } catch { return []; } })();
      currentH.push({ date: new Date().toISOString(), statut: 'ASSIGNATION', commentaire: historiqueComment });
      await db.dossier.update({ where: { id: d.id }, data: { historique: JSON.stringify(currentH) } });
    }

    // ─── R3 : synchronisation de l'étape KPI du contrôle médical ─────────────
    // L'étape ouverte porte désormais l'assignation (complétion) — les vraies
    // réaffectations passent par la route PATCH du dossier (désaffectation
    // incluse), l'assignation en masse ne touche que les dossiers non assignés.
    if (champ === 'CONTROLE_MEDICAL') {
      for (const dossierId of nonAssigneIds) {
        await db.$transaction((tx) => synchroniserEtapeControleMedical(tx, dossierId, gestionnaireId));
      }
    }

    return NextResponse.json({
      message: `${result.count} dossier(s) assigné(s) à ${gestionnaire.nom}.`,
      updated: result.count,
      skipped: ids.length - nonAssigneIds.length,
      gestionnaire: { id: gestionnaire.id, nom: gestionnaire.nom, service: gestionnaire.service },
    });
  } catch (error) {
    console.error('Erreur assignation en masse:', error);
    return NextResponse.json({ erreur: 'Erreur lors de l\'assignation en masse.' }, { status: 500 });
  }
}
