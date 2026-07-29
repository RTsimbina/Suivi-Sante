import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { logParametreChange, getUserIdFromRequest } from '@/lib/audit-log';

// ─── Helper : synchroniser PrestataireSociete depuis les dossiers ─────────────
async function syncFromDossiers(): Promise<number> {
  const existingLinks = await db.prestataireSociete.findMany({
    select: { prestataireId: true, societeId: true },
  });
  const existingSet = new Set(
    existingLinks.map(l => `${l.prestataireId}|${l.societeId}`)
  );

  let created = 0;

  // Source 1 : Dossiers avec prestataireId FK
  const dossiersFK = await db.dossier.findMany({
    where: { prestataireId: { not: null } },
    select: { prestataireId: true, societeId: true },
    distinct: ['prestataireId', 'societeId'],
  });

  const toCreateFromFK = dossiersFK.filter(
    d => !existingSet.has(`${d.prestataireId!}|${d.societeId}`)
  );

  if (toCreateFromFK.length > 0) {
    const result = await db.prestataireSociete.createMany({
      data: toCreateFromFK.map(d => ({
        prestataireId: d.prestataireId!,
        societeId: d.societeId,
        actif: true,
      })),
      skipDuplicates: true,
    });
    created += result.count;
    for (const d of toCreateFromFK) {
      existingSet.add(`${d.prestataireId!}|${d.societeId}`);
    }
  }

  // Source 2 : Dossiers avec prestataireLegacy (nom texte)
  const dossiersLegacy = await db.dossier.findMany({
    where: {
      AND: [
        { prestataireLegacy: { not: null } },
        { NOT: { prestataireLegacy: '' } },
      ],
    },
    select: { prestataireLegacy: true, societeId: true },
    distinct: ['prestataireLegacy', 'societeId'],
  });

  if (dossiersLegacy.length > 0) {
    const allPrestataires = await db.prestataire.findMany({
      select: { id: true, nom: true },
    });
    const prestaByName = new Map<string, string[]>();
    for (const p of allPrestataires) {
      const key = p.nom.trim().toLowerCase();
      if (!prestaByName.has(key)) prestaByName.set(key, []);
      prestaByName.get(key)!.push(p.id);
    }

    const toCreateFromLegacy: { prestataireId: string; societeId: string }[] = [];
    for (const d of dossiersLegacy) {
      const legacyName = d.prestataireLegacy!.trim().toLowerCase();
      const matchedIds = prestaByName.get(legacyName);
      if (!matchedIds) continue;
      for (const prestaId of matchedIds) {
        if (!existingSet.has(`${prestaId}|${d.societeId}`)) {
          toCreateFromLegacy.push({ prestataireId: prestaId, societeId: d.societeId });
          existingSet.add(`${prestaId}|${d.societeId}`);
        }
      }
    }

    if (toCreateFromLegacy.length > 0) {
      for (let i = 0; i < toCreateFromLegacy.length; i += 100) {
        const batch = toCreateFromLegacy.slice(i, i + 100);
        const result = await db.prestataireSociete.createMany({
          data: batch.map(d => ({
            prestataireId: d.prestataireId,
            societeId: d.societeId,
            actif: true,
          })),
          skipDuplicates: true,
        });
        created += result.count;
      }
    }
  }

  return created;
}

// ─── Helper : récupérer les stats dossiers par (prestataireId, societeId) ─────
async function getDossierStats(): Promise<Map<string, { nbDossiers: number; montantTotal: number }>> {
  const statsMap = new Map<string, { nbDossiers: number; montantTotal: number }>();
  try {
    const dossierStats = await db.dossier.groupBy({
      by: ['prestataireId', 'societeId'],
      where: { prestataireId: { not: null } },
      _count: true,
      _sum: { montantReclame: true },
    });
    for (const stat of dossierStats) {
      if (stat.prestataireId && stat.societeId) {
        statsMap.set(`${stat.prestataireId}|${stat.societeId}`, {
          nbDossiers: stat._count,
          montantTotal: stat._sum.montantReclame ?? 0,
        });
      }
    }
  } catch (err) {
    console.error('Erreur calcul stats dossiers (fallback à 0) :', err);
  }
  return statsMap;
}

// ─── GET : Lister tous les liens prestataire-société ────────────────────────

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const societeId = searchParams.get('societeId');
    const prestataireId = searchParams.get('prestataireId');

    const where: Record<string, unknown> = {};
    if (societeId) where.societeId = societeId;
    if (prestataireId) where.prestataireId = prestataireId;

    // ── Auto-sync si la table est vide ─────────────────────────────────────
    try {
      const linkCount = await db.prestataireSociete.count();
      if (linkCount === 0) {
        const created = await syncFromDossiers();
        console.log(`[PrestataireSociete] Auto-sync : ${created} lien(s) créé(s).`);
      }
    } catch (syncErr) {
      console.error('[PrestataireSociete] Erreur auto-sync (table peut ne pas exister) :', syncErr);
    }

    // ── Récupérer les liens ────────────────────────────────────────────────
    const liens = await db.prestataireSociete.findMany({
      where,
      include: {
        prestataire: { select: { id: true, nom: true, type: true, telephone: true, actif: true } },
        societe: { select: { id: true, nom: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // ── Stats dossiers : une seule requête groupBy globale ────────────────
    const statsMap = await getDossierStats();

    // ── Enrichir les liens avec les stats ──────────────────────────────────
    const enrichedLiens = liens.map(l => {
      const stats = statsMap.get(`${l.prestataireId}|${l.societeId}`);
      return {
        ...l,
        nbDossiers: stats?.nbDossiers ?? 0,
        montantTotal: stats?.montantTotal ?? 0,
      };
    });

    return NextResponse.json({ liens: enrichedLiens });
  } catch (error) {
    console.error('Erreur récupération liens prestataire-société :', error);
    return NextResponse.json({ erreur: 'Erreur serveur.' }, { status: 500 });
  }
}

// ─── POST : Lier un prestataire à une société ───────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const userId = getUserIdFromRequest(request);
    const body = await request.json();
    const { prestataireId, societeId } = body as { prestataireId?: string; societeId?: string };

    if (!prestataireId || !societeId) {
      return NextResponse.json({ erreur: 'prestataireId et societeId requis.' }, { status: 400 });
    }

    const [prestataire, societe] = await Promise.all([
      db.prestataire.findUnique({ where: { id: prestataireId } }),
      db.societe.findUnique({ where: { id: societeId } }),
    ]);

    if (!prestataire) return NextResponse.json({ erreur: 'Prestataire introuvable.' }, { status: 404 });
    if (!societe) return NextResponse.json({ erreur: 'Société introuvable.' }, { status: 404 });

    const lien = await db.prestataireSociete.upsert({
      where: { prestataireId_societeId: { prestataireId, societeId } },
      update: { actif: true },
      create: { prestataireId, societeId, actif: true },
    });

    await logParametreChange({
      entite: 'PrestataireSociete', entiteId: lien.id, champ: 'CREATION',
      ancienneValeur: null, nouvelleValeur: `${prestataire.nom} → ${societe.nom}`, modifiePar: userId,
    });

    return NextResponse.json({ lien }, { status: 201 });
  } catch (error) {
    console.error('Erreur création lien :', error);
    return NextResponse.json({ erreur: 'Erreur serveur.' }, { status: 500 });
  }
}

// ─── PATCH : Toggle actif/inactif ────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const userId = getUserIdFromRequest(request);
    const body = await request.json();
    const { id, actif } = body as { id?: string; actif?: boolean };

    if (!id || actif === undefined) {
      return NextResponse.json({ erreur: 'id et actif requis.' }, { status: 400 });
    }

    const existing = await db.prestataireSociete.findUnique({
      where: { id },
      include: { prestataire: true, societe: true },
    });

    if (!existing) return NextResponse.json({ erreur: 'Lien introuvable.' }, { status: 404 });

    const updated = await db.prestataireSociete.update({
      where: { id },
      data: { actif },
    });

    await logParametreChange({
      entite: 'PrestataireSociete', entiteId: id, champ: 'actif',
      ancienneValeur: existing.actif ? 'Actif' : 'Inactif',
      nouvelleValeur: actif ? 'Actif' : 'Inactif',
      modifiePar: userId,
    });

    return NextResponse.json({
      lien: updated,
      message: actif
        ? `${existing.prestataire.nom} réactivé pour ${existing.societe.nom}.`
        : `${existing.prestataire.nom} désactivé pour ${existing.societe.nom}. Les actes seront refusés automatiquement.`,
    });
  } catch (error) {
    console.error('Erreur toggle lien :', error);
    return NextResponse.json({ erreur: 'Erreur serveur.' }, { status: 500 });
  }
}

// ─── DELETE : Retirer un prestataire d'une société ──────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const userId = getUserIdFromRequest(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ erreur: 'id requis.' }, { status: 400 });

    const existing = await db.prestataireSociete.findUnique({
      where: { id },
      include: { prestataire: true, societe: true },
    });

    if (!existing) return NextResponse.json({ erreur: 'Lien introuvable.' }, { status: 404 });

    await db.prestataireSociete.delete({ where: { id } });

    await logParametreChange({
      entite: 'PrestataireSociete', entiteId: id, champ: 'SUPPRESSION',
      ancienneValeur: `${existing.prestataire.nom} → ${existing.societe.nom}`,
      nouvelleValeur: null, modifiePar: userId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur suppression lien :', error);
    return NextResponse.json({ erreur: 'Erreur serveur.' }, { status: 500 });
  }
}
