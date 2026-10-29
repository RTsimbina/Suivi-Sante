import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import {
  perimetreDepuisHeaders,
  refuserHorsPerimetre,
  avecPerimetreSocieteCourante,
} from "@/lib/data-isolation";
import { logParametreChange, getUserInfoFromRequest } from "@/lib/audit-log";
import { messageErreurBase } from "@/lib/erreur-migration";
import { parseJsonBody } from "@/lib/validation/parse";
import { societeCreateSchema } from "@/lib/validation";
import {
  detecterConflitNom,
  detecterConflitLiaisonEmail,
  messageConflitNom,
  normaliserNom,
} from "@/lib/societe-service";

// GET — Lister les sociétés
//
// ─── RÈGLE MÉTIER (décision figée par route.test.ts) ────────────────────────
//   - PORTAIL_CLIENT : volontairement ABSENT d'API_PERMISSIONS → 403. Un
//     assuré n'a pas besoin de la liste des sociétés : ses données (sa
//     société, ses contrats, ses dossiers) sont servies par /api/portail-client.
//   - CONTACT_ENTREPRISE (rôle externe) : where { id: sa société } — résolu
//     côté serveur depuis le JWT (x-user-societeid injecté par le proxy),
//     jamais depuis un paramètre navigateur. Un ?societeId=… client ne peut
//     qu'intersecter, jamais élargir.
//   - Rôles internes autorisés (ADMINISTRATEUR, ACCUEIL, TECHNIQUE,
//     COMPTABILITE, SANTE) : where {} — périmètre global selon leurs
//     permissions (voir API_PERMISSIONS).
//   - Compte externe sans société rattachée : 403 fail-closed
//     (refuserHorsPerimetre), jamais une liste vide silencieuse.
export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const perimetre = perimetreDepuisHeaders(request.headers);
    const isolationError = refuserHorsPerimetre(perimetre);
    if (isolationError) return isolationError;

    const societes = await db.societe.findMany({
      where: avecPerimetreSocieteCourante({}, perimetre),
      orderBy: { nom: "asc" },
      include: {
        _count: { select: { dossiers: true, contrats: true, baremes: true, assures: true } },
      },
    });
    return NextResponse.json({ societes });
  } catch (error) {
    console.error('[SOCIETES] Erreur:', error);
    return NextResponse.json(
      { erreur: messageErreurBase(error, "Erreur lors de l'opération.") },
      { status: 500 }
    );
  }
}

// POST — Créer une société
//
// ─── RÈGLES MÉTIER (SPEC-7 : convergence avec /api/technique/societes) ──────
//   Même détection de doublon normalisé (SPEC-1), même garde d'ambiguïté de
//   la liaison portail (SPEC-6), même audit de création (SPEC-3). Les deux
//   routes partagent le même socle : une seule source de vérité des règles.
export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { nom: userName, id: userId } = await getUserInfoFromRequest(request);

    // ─── Validation Zod centralisée (nom ≥ 2, NIF / téléphone / e-mails
    //     validés par les primitives partagées — SPEC-2) ─────────────────────
    const parsed = await parseJsonBody(request, societeCreateSchema);
    if (!parsed.success) return parsed.response;
    const { nom, adresse, telephone, email, nif, contactPrincipal, emailContactPrincipal, actif } = parsed.data;

    // ─── SPEC-1 : unicité du nom normalisée (auparavant : findFirst exact,
    //     sensible à la casse — « techno » passait face à « Techno ») ────────
    const existantes = await db.societe.findMany({
      select: { id: true, nom: true, nomNormalise: true, emailContactPrincipal: true },
    });
    const conflitNom = detecterConflitNom(nom, existantes);
    if (conflitNom) {
      return NextResponse.json({ erreur: messageConflitNom(conflitNom) }, { status: 409 });
    }

    // ─── SPEC-6 : e-mail de contact principal non ambigu ────────────────────
    if (emailContactPrincipal) {
      const conflitLiaison = detecterConflitLiaisonEmail(emailContactPrincipal, existantes);
      if (conflitLiaison) {
        return NextResponse.json(
          {
            erreur: `Cet e-mail de contact principal est déjà rattaché à la société « ${conflitLiaison.nom} » — un e-mail de contact ne peut lier qu'une seule société (liaison du portail entreprise).`,
          },
          { status: 409 }
        );
      }
    }

    const societe = await db.societe.create({
      data: {
        nom,
        nomNormalise: normaliserNom(nom) || null,
        actif: actif ?? true,
        ...(adresse ? { adresse } : {}),
        ...(telephone ? { telephone } : {}),
        ...(email ? { email } : {}),
        ...(nif ? { nif } : {}),
        ...(contactPrincipal ? { contactPrincipal } : {}),
        ...(emailContactPrincipal ? { emailContactPrincipal } : {}),
      },
    });

    // Audit log : création
    await logParametreChange({
      entite: 'Societe', entiteId: societe.id, champ: 'CREATION',
      ancienneValeur: null, nouvelleValeur: nom,
      modifiePar: userName, modifieParId: userId, objet: nom, request,
    });

    return NextResponse.json({ societe }, { status: 201 });
  } catch (error) {
    console.error("Erreur création société:", error);

    // Rempart dernier niveau : index unique partiel Societe_nomNormalise_unique
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { erreur: 'Une société avec ce nom existe déjà (insensible à la casse et aux accents)' },
        { status: 409 }
      );
    }

    return NextResponse.json({ erreur: "Erreur lors de la création" }, { status: 500 });
  }
}

// DELETE — Supprimer une société (si elle n'a pas de dossiers)
export async function DELETE(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { nom: userName, id: userId } = await getUserInfoFromRequest(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ erreur: "ID de société requis" }, { status: 400 });
    }

    // Vérifier s'il y a des dossiers liés
    const dossierCount = await db.dossier.count({ where: { societeId: id } });
    if (dossierCount > 0) {
      return NextResponse.json({ erreur: `Impossible de supprimer : ${dossierCount} dossier(s) lié(s)` },
        { status: 409 }
      );
    }

    // Récupérer la société pour l'audit
    const societe = await db.societe.findUnique({ where: { id } });

    // Supprimer les barèmes d'abord
    await db.bareme.deleteMany({ where: { societeId: id } });
    // Supprimer les contrats
    await db.contrat.deleteMany({ where: { societeId: id } });

    await db.societe.delete({ where: { id } });

    // Audit log : suppression
    if (societe) {
      await logParametreChange({
        entite: 'Societe', entiteId: id, champ: 'SUPPRESSION',
        ancienneValeur: societe.nom, nouvelleValeur: null,
        modifiePar: userName, modifieParId: userId, objet: societe.nom, societeId: id, request,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur suppression société:", error);
    return NextResponse.json({ erreur: "Erreur lors de la suppression" }, { status: 500 });
  }
}