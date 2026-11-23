import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import { logAuditOperation, getUserInfoFromRequest } from '@/lib/audit-log';
import {
  perimetreDepuisHeaders,
  refuserHorsPerimetre,
  avecPerimetreSociete,
} from "@/lib/data-isolation";
import { Prisma } from "@prisma/client";
<<<<<<< HEAD
import { verifierPlafondAnnuel, fenetreAnnuelle, type PlafondCheckResult } from "@/lib/plafond-check";
=======
import { verifierPlafondAnnuel, type PlafondCheckResult } from "@/lib/plafond-check";
import { synchroniserEtapes } from "@/lib/kpi-etapes";
>>>>>>> fc1a06c (feat(kpi): module de performance individuelle des collaborateurs)
import { trouverBaremeValide } from "@/lib/baremes-validite";
import { sommer, superieurOuEgal, enNombre } from "@/lib/money";
import { calculerRemboursement } from "@/lib/services/calcul-remboursement";
import { parseJsonBody } from "@/lib/validation/parse";
import { dossierCreateSchema } from "@/lib/validation";
import {
  genererNumeroDossier,
  avecRetryNumeroDossier,
} from "@/lib/numero-dossier";
import { plageDepuisParams, filtreDateChamp } from "@/lib/periodes";
import { masquerDossierPourRole } from "@/lib/services/serialisation-dossier";

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const { searchParams } = new URL(request.url);
    const statut = searchParams.get("statut") || undefined;
    const service = searchParams.get("service") || undefined;
    const societe = searchParams.get("societe") || undefined;
    const search = searchParams.get("search") || undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      1000,
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10))
    );

    // ─── Isolation des données (RLS applicatif, voir data-isolation.ts) ────
    // Rôles externes : périmètre société FORCÉ depuis le JWT — tout
    // ?societeId client est ignoré (écrasé). Fail-closed si compte sans société.
    const perimetre = perimetreDepuisHeaders(request.headers);
    const isolationError = refuserHorsPerimetre(perimetre);
    if (isolationError) return isolationError;

    const where: Prisma.DossierWhereInput = {};

    // ─── Filtre de période réutilisable (date de référence : Dossier.dateReception) ───
    // Appliqué AVANT avecPerimetreSociete : le périmètre société reste garanti par-dessus.
    const plage = plageDepuisParams(searchParams);
    Object.assign(where, filtreDateChamp('dateReception', plage));

    // Filter by statut (supports comma-separated: "VALIDE,REJETE")
    if (statut) {
      const statuts = statut.split(',').map(s => s.trim()).filter(Boolean);
      if (statuts.length === 1) {
        where.statut = statuts[0];
      } else if (statuts.length > 1) {
        where.statut = { in: statuts };
      }
    }

    // Filter by service — maps to which gestionnaire relation to check
    if (service === "RECEPTION") {
      where.gestionnaireAccueilId = { not: null };
    } else if (service === "TECHNIQUE") {
      where.gestionnaireTechniqueId = { not: null };
    } else if (service === "COMPTABILITE") {
      where.gestionnaireComptaId = { not: null };
    }

    // Filter by societe name (case-insensitive)
    if (societe) {
      where.societe = {
        nom: { contains: societe, mode: "insensitive" },
      };
    }

    // Search by beneficiaire or numeroDossier
    if (search) {
      where.OR = [
        { beneficiaire: { contains: search, mode: "insensitive" } },
        { numeroDossier: { contains: search, mode: "insensitive" } },
      ];
    }

    // ─── Fusion du périmètre : écrase tout societeId client pour les rôles restreints ───
    const skip = (page - 1) * limit;

    const whereFiltre = avecPerimetreSociete(where, perimetre);

    const [dossiers, total] = await Promise.all([
      db.dossier.findMany({
        where: whereFiltre,
        include: {
          societe: true,
          gestionnaireAccueil: true,
          gestionnaireTechnique: true,
          gestionnaireCompta: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      db.dossier.count({ where: whereFiltre }),
    ]);

    // ─── P2-03 / SEC-1 : confidentialité du NSS et des commentaires privés ──
    // Le NSS (copié sur le dossier à la saisie) n'est JAMAIS transmis aux
    // rôles externes : masquage côté backend avant sérialisation. La
    // sérialisation est centralisée avec la route de détail
    // (src/lib/services/serialisation-dossier.ts) pour éviter toute
    // divergence entre liste et détail.
    const dossiersSortie = dossiers.map(d => masquerDossierPourRole(d, perimetre.restricted));

    return NextResponse.json({
      dossiers: dossiersSortie,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching dossiers:", error);
    return NextResponse.json({ erreur: "Erreur lors de la récupération des dossiers" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    // ─── Validation Zod centralisée (type, champs requis, montants, enums) ──
    const parsed = await parseJsonBody(request, dossierCreateSchema);
    if (!parsed.success) return parsed.response;
    const {
      dateReception,
      societeId,
      beneficiaire,
      typeDossier,
      categorieDossier,
      gestionnaireAccueilId,
      montantReclame,
      assureId,
      nSS,
      prestataireId,
      dateSoins,
      moyenPaiement,
      observations,
      source,
      montantValide,
      ticketModerateur,
    } = parsed.data;
    // numeroDossier du client volontairement ignoré : généré côté serveur
    // (voir numéro-dossier.ts — avant : total+1 calculé sur la liste du
    // demandeur, source de doublons dès deux créations simultanées).

    // ─── Vérification du plafond annuel ────────────────────────────────────
    // Si un assureId est fourni, vérifier que le plafond n'est pas atteint.
    // Ce contrôle est le même que simuler-acte, appliqué automatiquement.
    let plafondResult: PlafondCheckResult | null = null;
    if (assureId && societeId && typeDossier && montantReclame) {
      // P1 : le contrôle de plafond utilise la version du barème valide À LA
      // DATE DE LA PRESTATION (dateSoins, à défaut dateReception).
      plafondResult = await verifierPlafondAnnuel({
        assureId,
        societeId,
        typeActe: typeDossier,
        montantDemande: montantReclame,
        prestataireId: prestataireId || undefined,
        datePrestation: dateSoins ?? dateReception,
        dateReception, // BIZ-2 : fenêtre de consommation = année de réception
      });

      // Bloquer si le plafond est atteint (assuré inactif, plafond acte/global épuisé)
      if (!plafondResult.autorise &&
          ['ASSURE_INACTIF', 'PLAFOND_ACTE_ATTEINT', 'PLAFOND_GLOBAL_ATTEINT', 'PRESTATAIRE_INACTIF'].includes(plafondResult.raison)) {
        return NextResponse.json({ erreur: plafondResult.message,
            plafondAtteint: true,
            plafondDetails: plafondResult.details,
            raison: plafondResult.raison,
          },
          { status: 422 }
        );
      }
    }

    const userId = request.headers.get('x-user-id') || '';

    // ─── SPEC-5 : société active exigée pour un NOUVEAU dossier ─────────────
    // Une société inactive reste consultable (historique, dossiers existants)
    // mais n'accepte plus de création. Contrôle AVANT la transaction — refus
    // motivé 422 (jamais une erreur FK brute en aval si l'ID est inconnu).
    const societeCible = await db.societe.findUnique({
      where: { id: societeId },
      select: { id: true, nom: true, actif: true },
    });
    if (!societeCible) {
      return NextResponse.json({ erreur: 'Société introuvable.' }, { status: 422 });
    }
    if (!societeCible.actif) {
      return NextResponse.json(
        { erreur: `La société « ${societeCible.nom} » est inactive : elle n'accepte plus de nouveaux dossiers.` },
        { status: 422 }
      );
    }

    // ─── Historique initial ────────────────────────────────────────────────
    const historiqueEntries: Record<string, unknown>[] = [
      { date: new Date().toISOString(), statut: "RECU", commentaire: "Dossier créé manuellement" },
    ];

    // Ajouter les alertes de plafond dans l'historique
    if (plafondResult && plafondResult.alertes.length > 0) {
      for (const alerte of plafondResult.alertes) {
        historiqueEntries.push({
          date: new Date().toISOString(),
          statut: "RECU",
          commentaire: `[PLAFOND] ${alerte.message}`,
        });
      }
    }

    // ─── Calcul du montant validé ──────────────────────────────────────────
    // Si le plafond a été vérifié et le montant est partiellement couvert,
    // recalculer montantValide selon le reliquat
    let finalMontantValide = montantValide || null;
    let finalTicketModerateur = ticketModerateur || null;

    if (plafondResult) {
      // P2-04 : règle MÉTIER UNIFIÉE (src/lib/services/calcul-remboursement.ts)
      // — l'assureur valide la prise en charge AUTORISÉE (le plafond annuel
      // borne la prise en charge après application du taux) et le ticket
      // modérateur = dépense − autorisée. Plus aucun calcul local parallèle :
      // les valeurs proviennent du même service que la simulation et la
      // vérification de plafond.
      finalMontantValide = plafondResult.details.partAssureur ?? null;
      finalTicketModerateur = plafondResult.details.ticketModerateur ?? null;
    }

    // ─── P1 : référence du barème à FIGER sur le dossier ───────────────────
    // Le dossier conserve la version exacte utilisée au calcul (id, taux,
    // plafond, période) : le montant reste justifiable même après évolution
    // ou retrait du barème. Aucune rétroactivité sur les dossiers existants.
    // Préférence : la version sélectionnée par le contrôle de plafond (même
    // date de prestation) ; à défaut, celle relue dans la transaction.
    let baremeReference: NonNullable<PlafondCheckResult['details']['baremeApplique']> | null =
      plafondResult?.details.baremeApplique ?? null;

    // Transaction : numéro de dossier généré côté serveur, verrou FOR UPDATE
    // sur le barème (sérialise les créations concurrentes d'un même plafond)
    // et re-vérification du plafond — le tout ATOMIQUE. En cas de collision
    // résiduelle de numéro (course inter-transactions, trou de suppression),
    // avecRetryNumeroDossier rejoue avec un décalage (contrainte UNIQUE = juge).
    const annee =
      dateReception instanceof Date
        ? dateReception.getFullYear()
        : new Date().getFullYear();

    // BIZ-2 : fenêtre de consommation canonique (année de réception) — le
    // chemin transactionnel utilise la MÊME fenêtre que verifierPlafondAnnuel
    // (ancien comportement : année courante ici, divergente du PATCH).
    const fenetreConsommation = fenetreAnnuelle(
      dateReception instanceof Date ? dateReception : new Date(),
    );

    const dossier = await avecRetryNumeroDossier((decalage) =>
      db.$transaction(async (tx) => {
        // Re-vérifier le plafond dans la transaction
        if (assureId && societeId && typeDossier && montantReclame) {
          const baremeTx = await trouverBaremeValide(tx, {
            societeId,
            prestation: typeDossier,
            date: dateSoins ?? dateReception,
          });
          if (baremeTx && !baremeReference) {
            baremeReference = {
              id: baremeTx.id,
              version: baremeTx.version,
              tauxCouverture: baremeTx.tauxCouverture,
              plafond: String(baremeTx.plafond),
              valideDu: baremeTx.valideDu.toISOString(),
              valideAu: baremeTx.valideAu ? baremeTx.valideAu.toISOString() : null,
            };
          }
          if (baremeTx) {
            // FOR UPDATE : la 2e transaction concurrente attend le commit de
            // la 1re, puis relit un total consommé à jour (READ COMMITTED)
            // — avant : deux créations simultanées passaient toutes deux
            // le contrôle et dépassaient le plafond.
            await tx.$queryRaw`SELECT "id" FROM "Bareme" WHERE "id" = ${baremeTx.id} FOR UPDATE`;
          }
          const plafondTx = await tx.dossier.findMany({
            where: {
              assureId,
              societeId,
              typeDossier,
              dateReception: { gte: fenetreConsommation.debut, lte: fenetreConsommation.fin },
              statut: { in: ['EN_ANALYSE', 'VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE'] },
            },
            select: { montantValide: true, montantPaye: true, montantReclame: true },
          });
          const consomme = sommer(plafondTx.map(d => d.montantPaye ?? d.montantValide ?? d.montantReclame));
          if (baremeTx && superieurOuEgal(consomme, baremeTx.plafond)) {
            throw new Error(`PLAFOND_ATTEINT_TRANSACTION: Plafond ${typeDossier} atteint lors de la création`);
          }
          // ─── P2-04 : recalcul dans la transaction (consommation À JOUR) ──
          // Le montant pré-calculé hors transaction peut reposer sur une
          // consommation périmée (une création concurrente a committé pendant
          // l'attente du FOR UPDATE) : on recalcule via le SERVICE CENTRAL
          // avec la consommation relue à l'intérieur de la transaction —
          // le montant validé ne dépasse JAMAIS le reliquat réel.
          if (baremeTx) {
            const calculTx = calculerRemboursement({
              montantFrais: montantReclame,
              tauxCouverture: baremeTx.tauxCouverture,
              plafondAnnuel: enNombre(baremeTx.plafond) ?? 0,
              consommationAnterieure: enNombre(consomme) ?? 0,
            });
            finalMontantValide = calculTx.priseEnChargeAutorisee;
            finalTicketModerateur = calculTx.ticketModerateur;
          }
        }

        // ─── Numéro de dossier : GÉNÉRÉ CÔTÉ SERVEUR, dans la transaction ──
        const numeroDossier = await genererNumeroDossier(tx, annee, decalage);

        const dossierCree = await tx.dossier.create({
      data: {
        numeroDossier,
        dateReception,
        societeId,
        beneficiaire,
        typeDossier,
        categorieDossier: categorieDossier ?? null,
        gestionnaireAccueilId: gestionnaireAccueilId ?? null,
        createurId: userId,
        montantReclame,
        assureId: assureId ?? null,
        nSS: nSS ?? null,
        prestataireId: prestataireId ?? null,
        dateSoins: dateSoins ?? null,
        // ─── P1 : justification du remboursement (version du barème figée) ──
        baremeId: baremeReference?.id ?? null,
        baremePrestation: baremeReference ? typeDossier : null,
        baremeTaux: baremeReference?.tauxCouverture ?? null,
        baremePlafond: baremeReference?.plafond ?? null,
        baremeValideDu: baremeReference ? new Date(baremeReference.valideDu) : null,
        baremeValideAu: baremeReference?.valideAu ? new Date(baremeReference.valideAu) : null,
        moyenPaiement: moyenPaiement ?? null,
        observations: observations ?? null,
        statut: "RECU",
        source,
        montantValide: finalMontantValide,
        ticketModerateur: finalTicketModerateur,
        historique: JSON.stringify(historiqueEntries),
      },
      include: {
        societe: true,
        gestionnaireAccueil: true,
        gestionnaireTechnique: true,
        gestionnaireCompta: true,
      },
    });

      // ─── KPI : ouverture de la période de responsabilité ACCUEIL ─────────
      // Traçabilité serveur dans la même transaction que la création.
      await synchroniserEtapes(tx, {
        dossierId: dossierCree.id,
        statutAvant: null,
        statutApres: 'RECU',
        gestionnairesApres: { ACCUEIL: gestionnaireAccueilId ?? null },
        userId,
        userRole: request.headers.get('x-user-role'),
        source: 'CIRCUIT',
      });
      return dossierCree;
    })); // fin avecRetryNumeroDossier($transaction)

    // Attraper l'erreur de plafond de la transaction
    const response: Record<string, unknown> = { ...dossier } as Record<string, unknown>;
    if (plafondResult) {
      response.plafondCheck = plafondResult;
    }

    // ─── Audit : création de dossier (operationId) ─────────────────────────
    const { nom: auditNom, id: auditId } = await getUserInfoFromRequest(request);
    await logAuditOperation({
      entite: 'Dossier',
      entiteId: dossier.id,
      action: 'CREATION',
      modifiePar: auditNom,
      modifieParId: auditId,
      objet: `Dossier ${dossier.numeroDossier} — ${dossier.beneficiaire}`,
      societeId: dossier.societeId,
      resume: `Montant réclamé : ${dossier.montantReclame} Ar`,
      request,
    });

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    // Perte de course sur le plafond (re-vérification transactionnelle) :
    // réponse 422 explicite au lieu d'une 500 générique.
    if (error instanceof Error && error.message.startsWith('PLAFOND_ATTEINT_TRANSACTION')) {
      return NextResponse.json(
        { erreur: error.message.replace('PLAFOND_ATTEINT_TRANSACTION: ', ''), plafondAtteint: true },
        { status: 422 }
      );
    }
    console.error("Error creating dossier:", error);
    return NextResponse.json({ erreur: "Erreur lors de la création du dossier" },
      { status: 500 }
    );
  }
}