import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import { logParametreChange, getUserInfoFromRequest } from "@/lib/audit-log";
import { parseJsonBody } from "@/lib/validation/parse";
import { baremeCreateSchema, baremePatchSchema } from "@/lib/validation";
import {
  detecterChevauchements,
  chargerVersionsCombinaison,
  dedupliquerEnVigueur,
  normaliserPrestation,
  prochaineVersion,
  veilleDe,
  type BaremeDated,
} from "@/lib/baremes-validite";

// ─── P1 « Validité datée des barèmes » ──────────────────────────────────────
// GET   : versions EN VIGUEUR par défaut ; ?historique=1 → toutes les
//         versions vivantes (consultation de l'historique, point 10).
// POST  : création / modification SANS écrasement — un changement de taux ou
//         de plafond CLÔTURE la version courante (valideAu = veille) et
//         CRÉE une nouvelle version (point 2-3). Périodes identiques sans
//         changement de taux = ajustement de période de la version courante.
// PATCH : statut administratif `active` uniquement (distinct de la validité).
// DELETE: soft-delete (supprime=true) — plus JAMAIS de suppression physique :
//         les anciens barèmes restent consultables (point contrainte).
// Chaque écriture trace auteur, ancien/nouveau taux, période et motif dans
// le journal d'audit (point 9).

// GET — Lister les barèmes (optionnel: societeId, ?historique=1, ?date=ISO)
export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const societeId = searchParams.get("societeId");
    const historique = searchParams.get("historique") === "1";
    const dateParam = searchParams.get("date");
    const dateReference = dateParam ? new Date(dateParam) : new Date();
    if (dateParam && Number.isNaN(dateReference.getTime())) {
      return NextResponse.json({ erreur: "Paramètre date invalide (ISO attendu)." }, { status: 400 });
    }

    const where: Record<string, unknown> = { supprime: false };
    if (societeId) where.societeId = societeId;

    const toutes = await db.bareme.findMany({
      where,
      include: { societe: { select: { nom: true } } },
      orderBy: [{ societe: { nom: "asc" } }, { prestation: "asc" }, { version: "asc" }],
    });

    // Vue par défaut : une seule version par combinaison — celle en vigueur à
    // la date de référence (sinon les versions historiques dupliqueraient les
    // lignes dans les écrans de gestion et les contrôles de cohérence).
    const vues = historique ? toutes : dedupliquerEnVigueur(toutes, dateReference);

    return NextResponse.json({
      baremes: vues,
      ...(historique ? {} : { dateReference }),
      total: vues.length,
    });
  } catch (error) {
    console.error('[BAREMES] Erreur:', error);
    return NextResponse.json({ erreur: "Erreur lors de l'opération." }, { status: 500 });
  }
}

// POST — Créer une version ou faire évoluer le barème (versionnement)
export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { nom: userName, id: userId } = await getUserInfoFromRequest(request);

    // ─── Validation Zod centralisée (enum prestation, taux 0-100, plafond>0,
    //     cohérence des dates de validité, motif facultatif) ─────────────────
    const parsed = await parseJsonBody(request, baremeCreateSchema);
    if (!parsed.success) return parsed.response;
    const { societeId, prestation, tauxCouverture, plafond, description, motif } = parsed.data;
    const prestationNorm = normaliserPrestation(prestation);

    // Début de validité : défaut = maintenant (début de la journée UTC).
    const maintenant = new Date();
    const valideDu = parsed.data.valideDu ?? new Date(Date.UTC(
      maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate(),
    ));
    const valideAu = parsed.data.valideAu ?? null;

    // ─── Transaction : verrou FOR UPDATE sur la combinaison (sérialise les
    //     créations/modifications concurrentes), anti-chevauchement fiable ──
    const resultat = await db.$transaction(async (tx) => {
      // Charge toutes les versions vivantes de la combinaison.
      const existants = await chargerVersionsCombinaison(tx, { societeId, prestation: prestationNorm });

      // Verrou d'écriture sur les lignes de la combinaison : la transaction
      // concurrente attend le commit puis relit les périodes à jour.
      for (const ex of existants) {
        await tx.$queryRaw`SELECT "id" FROM "Bareme" WHERE "id" = ${ex.id} FOR UPDATE`;
      }

      // Anti-chevauchement (point 7) : la période candidate ne doit chevaucher
      // AUCUNE autre version vivante de la même combinaison métier.
      const conflits = detecterChevauchements(existants, { valideDu, valideAu });
      if (conflits.length > 0) {
        return {
          conflit: true,
          versions: conflits.map((c) => ({ version: c.version, valideDu: c.valideDu, valideAu: c.valideAu })),
        } as const;
      }

      // Version « en cours » : vivante, période ouverte (valideAu null).
      const versionCourante: BaremeDated | undefined = existants.find(
        (b) => !b.supprime && b.valideAu === null,
      );
      const tauxInchange = versionCourante && String(versionCourante.tauxCouverture) === String(tauxCouverture);
      const plafondInchange = versionCourante && String(versionCourante.plafond) === String(plafond);

      // ─── Cas 1 : barème inexistant → première version ────────────────────
      if (!versionCourante) {
        const cree = await tx.bareme.create({
          data: {
            societeId,
            prestation: prestationNorm,
            tauxCouverture,
            plafond,
            description: description || null,
            active: true,
            valideDu,
            valideAu,
            version: prochaineVersion(existants),
          },
        });
        return { conflit: false as const, bareme: cree, ancienne: null, nouvelleVersion: cree.version };
      }

      // ─── Cas 2 : taux ET plafond inchangés → ajustement de PÉRIODE de la
      //     version courante (aucune nouvelle version, aucun écrasement) ────
      if (tauxInchange && plafondInchange) {
        const maj = await tx.bareme.update({
          where: { id: versionCourante.id },
          data: {
            description: description || versionCourante.description,
            valideDu,
            valideAu,
          },
        });
        return { conflit: false as const, bareme: maj, ancienne: versionCourante, nouvelleVersion: maj.version };
      }

      // ─── Cas 3 : taux ou plafond CHANGÉS → nouvelle version ──────────────
      // La modification ne peut pas être antérieure au début de la version
      // courante (elle chevaucherait la période déjà consommée).
      if (valideDu.getTime() <= versionCourante.valideDu.getTime()) {
        return {
          conflit: true,
          versions: [{ version: versionCourante.version, valideDu: versionCourante.valideDu, valideAu: versionCourante.valideAu }],
        } as const;
      }
      // Clôture de la version courante à la VEILLE du nouveau début
      // (continuité sans chevauchement, bornes incluses).
      const cloturee = await tx.bareme.update({
        where: { id: versionCourante.id },
        data: { valideAu: veilleDe(valideDu) },
      });
      const nouvelle = await tx.bareme.create({
        data: {
          societeId,
          prestation: prestationNorm,
          tauxCouverture,
          plafond,
          description: description || versionCourante.description,
          active: true,
          valideDu,
          valideAu,
          version: prochaineVersion(existants),
        },
      });
      return { conflit: false as const, bareme: nouvelle, ancienne: cloturee, nouvelleVersion: nouvelle.version };
    });

    // ─── Anti-chevauchement violé → 409 (aucune écriture) ───────────────────
    if (resultat.conflit) {
      return NextResponse.json(
        {
          erreur:
            "La période de validité demandée chevauche une version existante du barème " +
            `(${prestationNorm}). Clôturez ou ajustez la période en conflit.`,
          versionsEnConflit: resultat.versions.map((v) => ({
            version: v.version,
            valideDu: v.valideDu,
            valideAu: v.valideAu,
          })),
        },
        { status: 409 },
      );
    }

    const { bareme, ancienne } = resultat;

    // ─── Journal d'audit (point 9) : auteur, ancien/nouveau taux, période,
    //     motif. Les valeurs Prisma Decimal sont sérialisées en String. ─────
    if (ancienne) {
      if (String(ancienne.tauxCouverture) !== String(bareme.tauxCouverture)) {
        await logParametreChange({
          entite: 'Bareme', entiteId: bareme.id, champ: 'tauxCouverture',
          ancienneValeur: ancienne.tauxCouverture, nouvelleValeur: bareme.tauxCouverture,
          modifiePar: userName, modifieParId: userId, societeId, objet: prestationNorm,
          motif: motif || undefined,
          metadonnees: {
            versionPrecedente: ancienne.version, nouvelleVersion: bareme.version,
            valideDu: bareme.valideDu, valideAu: bareme.valideAu ?? null,
          },
          request,
        });
      }
      if (String(ancienne.plafond) !== String(bareme.plafond)) {
        await logParametreChange({
          entite: 'Bareme', entiteId: bareme.id, champ: 'plafond',
          ancienneValeur: ancienne.plafond, nouvelleValeur: bareme.plafond,
          modifiePar: userName, modifieParId: userId, societeId, objet: prestationNorm,
          motif: motif || undefined,
          metadonnees: {
            versionPrecedente: ancienne.version, nouvelleVersion: bareme.version,
            valideDu: bareme.valideDu, valideAu: bareme.valideAu ?? null,
          },
          request,
        });
      }
      // Tracer la clôture de période de l'ancienne version (traçabilité P1).
      await logParametreChange({
        entite: 'Bareme', entiteId: ancienne.id, champ: 'valideAu',
        ancienneValeur: ancienne.valideAu ?? 'en cours', nouvelleValeur: ancienne.valideAu,
        modifiePar: userName, modifieParId: userId, societeId, objet: prestationNorm,
        motif: motif || undefined,
        metadonnees: { nouvelleVersion: bareme.version },
        request,
      });
    } else {
      await logParametreChange({
        entite: 'Bareme', entiteId: bareme.id, champ: 'CREATION',
        ancienneValeur: null,
        nouvelleValeur: `taux: ${bareme.tauxCouverture}%, plafond: ${bareme.plafond}, période: ${bareme.valideDu.toISOString()} → ${bareme.valideAu?.toISOString() ?? 'en cours'} (v${bareme.version})`,
        modifiePar: userName, modifieParId: userId, societeId, objet: prestationNorm,
        motif: motif || undefined,
        request,
      });
    }

    return NextResponse.json({ bareme, nouvelleVersion: resultat.nouvelleVersion }, { status: 201 });
  } catch (error) {
    console.error("Erreur création barème:", error);
    return NextResponse.json({ erreur: "Erreur lors de la création du barème" }, { status: 500 });
  }
}

// PATCH — Désactiver/activer un barème (statut ADMINISTRATIF — la validité
// temporelle est gérée par POST ; la désactivation ne clôture PAS la période).
export async function PATCH(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { nom: userName, id: userId } = await getUserInfoFromRequest(request);

    // ─── Validation Zod centralisée (id requis, active booléen strict) ──────
    // FIX audit : la chaîne "false" (truthy) activait le barème au lieu de
    // le désactiver. Le schéma garantit un vrai booléen.
    const parsed = await parseJsonBody(request, baremePatchSchema);
    if (!parsed.success) return parsed.response;
    const { id, active } = parsed.data;

    // Récupérer l'ancien barème pour l'audit
    const existing = await db.bareme.findUnique({ where: { id }, include: { societe: { select: { id: true, nom: true } } } });
    if (!existing || existing.supprime) {
      return NextResponse.json({ erreur: "Barème introuvable." }, { status: 404 });
    }

    const bareme = await db.bareme.update({
      where: { id },
      data: { active },
    });

    // Audit log
    if (existing.active !== bareme.active) {
      await logParametreChange({
        entite: 'Bareme', entiteId: id, champ: 'active',
        ancienneValeur: existing.active, nouvelleValeur: bareme.active,
        modifiePar: userName, modifieParId: userId,
        societeId: existing.societeId, objet: `${existing.prestation} (v${existing.version}) — ${existing.societe?.nom || ''}`,
        request,
      });
    }

    return NextResponse.json({ bareme });
  } catch (error) {
    console.error("Erreur mise à jour barème:", error);
    return NextResponse.json({ erreur: "Erreur lors de la mise à jour" }, { status: 500 });
  }
}

// DELETE — Retrait administratif du barème (SOFT-DELETE : supprime=true,
// désactivation + clôture de la période en cours). Les données historiques
// (versions passées et justifications des remboursements) restent intactes.
export async function DELETE(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ erreur: "ID du barème requis" }, { status: 400 });
    }

    // Récupérer le barème avant retrait pour l'audit
    const existing = await db.bareme.findUnique({ where: { id } });
    if (!existing || existing.supprime) {
      return NextResponse.json({ erreur: "Barème introuvable ou déjà retiré." }, { status: 404 });
    }

    const { nom: userName, id: userId } = await getUserInfoFromRequest(request);

    const bareme = await db.bareme.update({
      where: { id },
      data: {
        supprime: true,
        active: false,
        // Clôture de la période en cours au retrait (si pas déjà clôturée).
        valideAu: existing.valideAu ?? new Date(),
      },
    });

    // Audit log : retrait = description complète, aucune suppression physique
    const societe = await db.societe.findUnique({ where: { id: existing.societeId }, select: { id: true, nom: true } }).catch(() => null);
    await logParametreChange({
      entite: 'Bareme', entiteId: id, champ: 'RETRAIT',
      ancienneValeur: `v${existing.version} ${existing.prestation} (taux: ${existing.tauxCouverture}%, plafond: ${existing.plafond}, période: ${existing.valideDu.toISOString()} → ${existing.valideAu?.toISOString() ?? 'en cours'})`,
      nouvelleValeur: null,
      modifiePar: userName, modifieParId: userId,
      societeId: existing.societeId, objet: `${existing.prestation} (v${existing.version}) — ${societe?.nom || ''}`,
      request,
    });

    return NextResponse.json({ success: true, bareme });
  } catch (error) {
    console.error("Erreur suppression barème:", error);
    return NextResponse.json({ erreur: "Erreur lors de la suppression" }, { status: 500 });
  }
}
