import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import { logParametreChange, getUserInfoFromRequest } from "@/lib/audit-log";
import { parseJsonBody } from "@/lib/validation/parse";
import { contactEntrepriseUpdateSchema } from "@/lib/validation";

// ─── RÈGLES MÉTIER (socle Gestion — pilier Audit) ───────────────────────────
// La fiche EntrepriseContact est la source 1 de la liaison externe
// CONTACT_ENTREPRISE (src/lib/liaison-externe.ts) : changer l'e-mail d'un
// contact peut OUVRIR ou FERMER l'accès au portail d'une société cliente —
// chaque modification et chaque suppression sont donc tracées avec l'auteur
// réel, comme les autres écritures de référentiel.

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { id } = await params;
    // ─── Validation Zod centralisée ─────────────────────────────────────────
    // FIX audit : PUT sans aucune validation — un nom absent provoquait une
    // erreur 500 Prisma. Désormais : 400 « Données invalides » avec détail.
    const parsed = await parseJsonBody(request, contactEntrepriseUpdateSchema);
    if (!parsed.success) return parsed.response;
    const { nom, prenom, fonction, telephone, email, actif } = parsed.data;

    const existing = await db.entrepriseContact.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ erreur: "Contact introuvable." }, { status: 404 });
    }

    const contact = await db.entrepriseContact.update({
      where: { id },
      data: {
        nom,
        prenom: prenom ?? null,
        fonction: fonction ?? null,
        telephone: telephone ?? null,
        email: email ?? null,
        ...(actif !== undefined ? { actif } : {}),
      },
    });

    // ─── Audit champ par champ (l'e-mail de liaison portail inclus) ─────────
    const { nom: auteurNom, id: auteurId } = await getUserInfoFromRequest(request);
    const champs: [string, unknown, unknown][] = [
      ['nom', existing.nom, nom],
      ['prenom', existing.prenom, prenom ?? null],
      ['fonction', existing.fonction, fonction ?? null],
      ['telephone', existing.telephone, telephone ?? null],
      ['email', existing.email, email ?? null],
      ...(actif !== undefined ? ([['actif', existing.actif, actif]] as [string, unknown, unknown][]) : []),
    ];
    for (const [champ, ancienne, nouvelle] of champs) {
      if (String(ancienne ?? null) !== String(nouvelle ?? null)) {
        await logParametreChange({
          entite: 'EntrepriseContact',
          entiteId: id,
          champ,
          ancienneValeur: ancienne,
          nouvelleValeur: nouvelle,
          modifiePar: auteurNom,
          modifieParId: auteurId,
          objet: existing.nom,
          societeId: existing.societeId,
          request,
        });
      }
    }

    return NextResponse.json(contact);
  } catch (error) {
    console.error("Error updating contact:", error);
    return NextResponse.json({ erreur: "Erreur" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { id } = await params;

    const existing = await db.entrepriseContact.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ erreur: "Contact introuvable." }, { status: 404 });
    }

    await db.entrepriseContact.delete({ where: { id } });

    // ─── Audit : la suppression d'un contact ferme potentiellement la source 1
    // de liaison d'un compte portail — tracée avec l'auteur réel.
    const { nom: auteurNom, id: auteurId } = await getUserInfoFromRequest(request);
    await logParametreChange({
      entite: 'EntrepriseContact',
      entiteId: id,
      champ: 'SUPPRESSION',
      ancienneValeur: `${existing.nom}${existing.prenom ? ` ${existing.prenom}` : ''}${existing.email ? ` — ${existing.email}` : ''}`,
      nouvelleValeur: null,
      modifiePar: auteurNom,
      modifieParId: auteurId,
      objet: existing.nom,
      societeId: existing.societeId,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting contact:", error);
    return NextResponse.json({ erreur: "Erreur" }, { status: 500 });
  }
}
