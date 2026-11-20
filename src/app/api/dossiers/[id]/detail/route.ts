import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import {
  perimetreDepuisHeaders,
  refuserHorsPerimetre,
} from "@/lib/data-isolation";
import { masquerDossierPourRole } from "@/lib/services/serialisation-dossier";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { id } = await params;

    // ─── Isolation des données (RLS applicatif, voir data-isolation.ts) ────
    // Rôles externes : le dossier doit appartenir à LEUR société (JWT).
    // Hors périmètre → 404 (ne pas révéler l'existence du dossier).
    const perimetre = perimetreDepuisHeaders(request.headers);
    const isolationError = refuserHorsPerimetre(perimetre);
    if (isolationError) return isolationError;

    const dossier = await db.dossier.findUnique({
      where:
        perimetre.restricted && perimetre.societeId
          ? { id, societeId: perimetre.societeId }
          : { id },
      include: {
        societe: true,
        assure: true,
        prestataire: true,
        gestionnaireAccueil: true,
        gestionnaireTechnique: true,
        gestionnaireCompta: true,
        createur: { select: { id: true, nom: true, email: true, role: true } },
        commentaires: {
          orderBy: { createdAt: "desc" },
          include: { auteur: { select: { id: true, nom: true, role: true } } },
        },
        justificatifs: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!dossier) {
      return NextResponse.json({ erreur: "Dossier introuvable" }, { status: 404 });
    }

    // Parser l'historique JSON
    let historiqueParsed: { date: string; statut: string; commentaire: string }[] = [];
    try {
      historiqueParsed = JSON.parse(dossier.historique);
    } catch {
      historiqueParsed = [];
    }

    // ─── SEC-1 : confidentialité alignée sur la route de liste (P2-03) ──────
    // Les rôles externes reçoivent le NSS du dossier et de l'assuré masqués
    // et SANS les commentaires privés ; sérialisation centralisée dans
    // src/lib/services/serialisation-dossier.ts (source unique avec la liste).
    const dossierSortie = masquerDossierPourRole(
      { ...dossier, historiqueParsed },
      perimetre.restricted,
    );

    return NextResponse.json(dossierSortie);
  } catch (error) {
    console.error('[DOSSIER_DETAIL] Erreur:', error);
    return NextResponse.json({ erreur: "Erreur lors du chargement du dossier." }, { status: 500 });
  }
}