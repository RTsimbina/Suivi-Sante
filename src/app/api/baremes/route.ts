import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import { logParametreChange, getUserInfoFromRequest } from "@/lib/audit-log";
import { PARENT_TYPES, ALL_SOUS_TYPES } from "@/lib/prestations";

const PRESTATIONS_VALIDES = [...ALL_SOUS_TYPES];

// GET — Lister les barèmes (optionnel: filtrer par societeId)
export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const societeId = searchParams.get("societeId");

    const where = societeId ? { societeId, active: true } : { active: true };

    const baremes = await db.bareme.findMany({
      where,
      include: { societe: { select: { nom: true } } },
      orderBy: [{ societe: { nom: "asc" } }, { prestation: "asc" }],
    });

    return NextResponse.json({ baremes });
  } catch {
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}

// POST — Créer ou mettre à jour un barème (upsert)
export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { nom: userName, id: userId } = await getUserInfoFromRequest(request);
    const body = await request.json();
    const { societeId, prestation, tauxCouverture, plafond, description } = body;

    if (!societeId || !prestation) {
      return NextResponse.json({ error: "societeId et prestation requis" }, { status: 400 });
    }
    if (!PRESTATIONS_VALIDES.includes(prestation) && !PARENT_TYPES.includes(prestation)) {
      return NextResponse.json({ error: `Prestation invalide. Valeurs: ${[...PRESTATIONS_VALIDES, ...PARENT_TYPES].join(", ")}` }, { status: 400 });
    }
    if (tauxCouverture === undefined || tauxCouverture < 0 || tauxCouverture > 100) {
      return NextResponse.json({ error: "tauxCouverture doit être entre 0 et 100" }, { status: 400 });
    }
    if (plafond === undefined || plafond <= 0) {
      return NextResponse.json({ error: "plafond doit être un montant positif" }, { status: 400 });
    }

    // Récupérer l'ancien barème s'il existe (pour l'audit)
    const existing = await db.bareme.findUnique({
      where: { societeId_prestation: { societeId, prestation } },
    });

    const bareme = await db.bareme.upsert({
      where: { societeId_prestation: { societeId, prestation } },
      update: {
        tauxCouverture,
        plafond,
        description: description || null,
        active: true,
      },
      create: {
        societeId,
        prestation,
        tauxCouverture,
        plafond,
        description: description || null,
      },
    });

    // Audit log : logger les modifications sur un barème existant
    if (existing) {
      const logId = bareme.id;
      if (String(existing.tauxCouverture) !== String(tauxCouverture)) {
        await logParametreChange({
          entite: 'Bareme', entiteId: logId, champ: 'tauxCouverture',
          ancienneValeur: existing.tauxCouverture, nouvelleValeur: tauxCouverture,
          modifiePar: userName, modifieParId: userId, societeId, objet: prestation, request,
        });
      }
      if (String(existing.plafond) !== String(plafond)) {
        await logParametreChange({
          entite: 'Bareme', entiteId: logId, champ: 'plafond',
          ancienneValeur: existing.plafond, nouvelleValeur: plafond,
          modifiePar: userName, modifieParId: userId, societeId, objet: prestation, request,
        });
      }
      if ((existing.description || '') !== (description || '')) {
        await logParametreChange({
          entite: 'Bareme', entiteId: logId, champ: 'description',
          ancienneValeur: existing.description || '', nouvelleValeur: description || '',
          modifiePar: userName, modifieParId: userId, societeId, objet: prestation, request,
        });
      }
      if (!existing.active) {
        await logParametreChange({
          entite: 'Bareme', entiteId: logId, champ: 'active',
          ancienneValeur: false, nouvelleValeur: true,
          modifiePar: userName, modifieParId: userId, societeId, objet: prestation, request,
        });
      }
    }

    return NextResponse.json({ bareme }, { status: 201 });
  } catch (error) {
    console.error("Erreur création barème:", error);
    return NextResponse.json({ error: "Erreur lors de la création du barème" }, { status: 500 });
  }
}

// PATCH — Désactiver/activer un barème
export async function PATCH(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { nom: userName, id: userId } = await getUserInfoFromRequest(request);
    const body = await request.json();
    const { id, active } = body;

    if (!id) {
      return NextResponse.json({ error: "ID du barème requis" }, { status: 400 });
    }

    // Récupérer l'ancien barème pour l'audit
    const existing = await db.bareme.findUnique({ where: { id }, include: { societe: { select: { id: true, nom: true } } } });

    const bareme = await db.bareme.update({
      where: { id },
      data: { active: active !== undefined ? active : false },
    });

    // Audit log
    if (existing && existing.active !== bareme.active) {
      await logParametreChange({
        entite: 'Bareme', entiteId: id, champ: 'active',
        ancienneValeur: existing.active, nouvelleValeur: bareme.active,
        modifiePar: userName, modifieParId: userId,
        societeId: existing.societe?.id, objet: `${existing.prestation} — ${existing.societe?.nom || ''}`,
        request,
      });
    }

    return NextResponse.json({ bareme });
  } catch (error) {
    console.error("Erreur mise à jour barème:", error);
    return NextResponse.json({ error: "Erreur lors de la mise à jour" }, { status: 500 });
  }
}

// DELETE — Supprimer un barème
export async function DELETE(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID du barème requis" }, { status: 400 });
    }

    // Récupérer le barème avant suppression pour l'audit
    const existing = await db.bareme.findUnique({ where: { id } });

    await db.bareme.delete({ where: { id } });

    // Audit log : suppression = ancienneValeur complète, nouvelleValeur vide
    if (existing) {
      const { nom: userName, id: userId } = await getUserInfoFromRequest(request);
      const societe = await db.societe.findUnique({ where: { id: existing.societeId }, select: { id: true, nom: true } }).catch(() => null);
      await logParametreChange({
        entite: 'Bareme', entiteId: id, champ: 'SUPPRESSION',
        ancienneValeur: `${existing.prestation} (taux: ${existing.tauxCouverture}%, plafond: ${existing.plafond})`,
        nouvelleValeur: null,
        modifiePar: userName, modifieParId: userId,
        societeId: existing.societeId, objet: `${existing.prestation} — ${societe?.nom || ''}`,
        request,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur suppression barème:", error);
    return NextResponse.json({ error: "Erreur lors de la suppression" }, { status: 500 });
  }
}