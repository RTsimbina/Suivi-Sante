import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { logParametreChange, getUserInfoFromRequest } from '@/lib/audit-log';
import { Prisma } from '@prisma/client';
import { parseJsonBody } from '@/lib/validation/parse';
import { societeTechniqueUpdateSchema } from '@/lib/validation';
import {
  detecterConflitNom,
  detecterConflitLiaisonEmail,
  differencesSociete,
  messageConflitNom,
  messageSuppressionBloquee,
  motifsBlocageSuppression,
  normaliserNom,
} from '@/lib/societe-service';

// ─── GET : Récupérer une société avec ses barèmes ─────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { id } = await params;

    const societe = await db.societe.findUnique({
      where: { id },
      include: {
        baremes: { orderBy: { prestation: 'asc' } },
        _count: { select: { dossiers: true, contrats: true } },
      },
    });

    if (!societe) {
      return NextResponse.json(
        { erreur: 'Société introuvable.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ societe });
  } catch (error) {
    console.error('Erreur lors de la récupération de la société :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors de la récupération de la société.' },
      { status: 500 }
    );
  }
}

// ─── PUT : Mettre à jour une société et/ou ses barèmes ────────────────────────
//
// ─── RÈGLES MÉTIER (spécifications Sociétés clientes — figées par tests) ────
//   SPEC-1 : collision de nom normalisé (hors fiche en cours) → 409.
//   SPEC-3 : chaque champ réellement modifié est audité (nom, adresse,
//            téléphone, e-mail, NIF, contact principal, e-mail de liaison
//            portail, actif) — rôle figé + operationId. La liaison portail
//            (emailContactPrincipal) est auditée comme les autres : le
//            journal doit répondre « qui a changé la liaison du portail ».
//   SPEC-6 : un e-mail de contact principal ne peut lier qu'UNE société.

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { nom: userName, id: userId } = await getUserInfoFromRequest(request);
    const { id } = await params;

    // ─── Validation Zod centralisée (whitelist, NIF/téléphone/e-mails, barèmes
    //     : enum, taux, plafond) ──────────────────────────────────────────────
    const parsed = await parseJsonBody(request, societeTechniqueUpdateSchema);
    if (!parsed.success) return parsed.response;
    const { nom, adresse, telephone, email, nif, contactPrincipal, emailContactPrincipal, actif, baremes } = parsed.data;

    // Vérifier que la société existe
    const existing = await db.societe.findUnique({
      where: { id },
      include: { baremes: true },
    });

    if (!existing) {
      return NextResponse.json(
        { erreur: 'Société introuvable.' },
        { status: 404 }
      );
    }

    // ─── SPEC-1 / SPEC-6 : collisions de nom et d'e-mail de liaison ─────────
    // Chargées si le nom change (collision nom) OU si l'e-mail de liaison
    // change (garde d'ambiguïté) — les deux contrôles sont indépendants.
    const nomChange = nom !== undefined && nom !== existing.nom;
    const liaisonChange = emailContactPrincipal !== undefined &&
      (emailContactPrincipal ?? null) !== existing.emailContactPrincipal;
    if (nomChange || liaisonChange) {
      const existantes = await db.societe.findMany({
        select: { id: true, nom: true, nomNormalise: true, emailContactPrincipal: true },
      });

      if (nomChange) {
        const conflitNom = detecterConflitNom(nom, existantes, id);
        if (conflitNom) {
          return NextResponse.json({ erreur: messageConflitNom(conflitNom) }, { status: 409 });
        }
      }

      // ─── SPEC-6 : e-mail de contact principal non ambigu ────────────────
      if (emailContactPrincipal) {
        const conflitLiaison = detecterConflitLiaisonEmail(emailContactPrincipal, existantes, id);
        if (conflitLiaison) {
          return NextResponse.json(
            {
              erreur: `Cet e-mail de contact principal est déjà rattaché à la société « ${conflitLiaison.nom} » — un e-mail de contact ne peut lier qu'une seule société (liaison du portail entreprise).`,
            },
            { status: 409 }
          );
        }
      }
    }

    // ─── SPEC-3 : audit des champs de la fiche (avant écriture) ─────────────
    // Les valeurs nulles explicites (null) signifient « vider le champ » —
    // elles sont auditées comme une modification à part entière.
    const modificationsFiche = differencesSociete(existing, {
      ...(nom !== undefined ? { nom } : {}),
      ...(adresse !== undefined ? { adresse } : {}),
      ...(telephone !== undefined ? { telephone } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(nif !== undefined ? { nif } : {}),
      ...(contactPrincipal !== undefined ? { contactPrincipal } : {}),
      ...(emailContactPrincipal !== undefined ? { emailContactPrincipal } : {}),
      ...(actif !== undefined ? { actif } : {}),
    });

    // Vérifier les doublons de prestation dans le tableau (les types, taux et
    // plafonds sont déjà garantis par le schéma Zod)
    if (baremes && baremes.length > 0) {
      const prestations = baremes.map((b) => b.prestation);
      const doublons = prestations.filter((p, i) => prestations.indexOf(p) !== i);
      if (doublons.length > 0) {
        return NextResponse.json(
          { erreur: `Prestations en doublon : ${[...new Set(doublons)].join(', ')}.` },
          { status: 400 }
        );
      }
    }

    // Préparer les opérations de barèmes (upsert par prestation)
    let baremesOperations: Prisma.BaremeCreateWithoutSocieteInput[] | undefined;
    if (baremes && baremes.length > 0) {
      baremesOperations = baremes.map((b) => ({
        prestation: b.prestation,
        tauxCouverture: b.tauxCouverture,
        plafond: b.plafond,
        description: b.description ?? null,
        active: b.active ?? true,
      }));
    }

    // Mettre à jour la société et ses barèmes (upsert par prestation)
    const updatedSociete = await db.$transaction(async (tx) => {
      // Si des barèmes sont fournis, les mettre à jour via upsert
      if (baremes && baremesOperations) {
        // D'abord supprimer les barèmes existants qui ne sont plus dans la liste
        const prestationsEnvoyees = baremes.map((b) => b.prestation);
        const removedBaremes = existing.baremes.filter(
          (eb) => !prestationsEnvoyees.includes(eb.prestation)
        );

        await tx.bareme.deleteMany({
          where: {
            societeId: id,
            prestation: { notIn: prestationsEnvoyees },
          },
        });

        // Puis upsert chaque barème
        for (const b of baremesOperations) {
          const existingBareme = existing.baremes.find(
            (eb) => eb.prestation === b.prestation
          );

          await tx.bareme.upsert({
            where: {
              societeId_prestation: {
                societeId: id,
                prestation: b.prestation,
              },
            },
            update: {
              tauxCouverture: b.tauxCouverture,
              plafond: b.plafond,
              description: b.description ?? null,
              active: b.active ?? true,
            },
            create: {
              societeId: id,
              prestation: b.prestation,
              tauxCouverture: b.tauxCouverture,
              plafond: b.plafond,
              description: b.description ?? null,
              active: b.active ?? true,
            },
          });

          // Audit log pour chaque barème modifié/créé
          if (existingBareme) {
            if (String(existingBareme.tauxCouverture) !== String(b.tauxCouverture)) {
              await logParametreChange({
                entite: 'Bareme', entiteId: existingBareme.id, champ: 'tauxCouverture',
                ancienneValeur: existingBareme.tauxCouverture, nouvelleValeur: b.tauxCouverture,
                modifiePar: userName, modifieParId: userId, societeId: id, objet: b.prestation, request,
              });
            }
            if (String(existingBareme.plafond) !== String(b.plafond)) {
              await logParametreChange({
                entite: 'Bareme', entiteId: existingBareme.id, champ: 'plafond',
                ancienneValeur: existingBareme.plafond, nouvelleValeur: b.plafond,
                modifiePar: userName, modifieParId: userId, societeId: id, objet: b.prestation, request,
              });
            }
          }
        }

        // Audit log pour les barèmes supprimés
        for (const rb of removedBaremes) {
          await logParametreChange({
            entite: 'Bareme', entiteId: rb.id, champ: 'SUPPRESSION',
            ancienneValeur: `${rb.prestation} (taux: ${rb.tauxCouverture}%, plafond: ${rb.plafond})`,
            nouvelleValeur: null,
            modifiePar: userName, modifieParId: userId, societeId: id, objet: rb.prestation, request,
          });
        }
      }

      return tx.societe.update({
        where: { id },
        data: {
          ...(nom !== undefined
            ? { nom, nomNormalise: normaliserNom(nom) || null }
            : {}),
          ...(adresse !== undefined ? { adresse: adresse ?? null } : {}),
          ...(telephone !== undefined ? { telephone: telephone ?? null } : {}),
          ...(email !== undefined ? { email: email ?? null } : {}),
          ...(nif !== undefined ? { nif: nif ?? null } : {}),
          ...(contactPrincipal !== undefined ? { contactPrincipal: contactPrincipal ?? null } : {}),
          ...(emailContactPrincipal !== undefined ? { emailContactPrincipal: emailContactPrincipal ?? null } : {}),
          ...(actif !== undefined ? { actif } : {}),
        },
        include: {
          baremes: { orderBy: { prestation: 'asc' } },
          _count: { select: { dossiers: true, contrats: true } },
        },
      });
    });

    // ─── SPEC-3 : audit champ par champ de la fiche société ─────────────────
    for (const diff of modificationsFiche) {
      await logParametreChange({
        entite: 'Societe',
        entiteId: id,
        champ: diff.champ,
        ancienneValeur: diff.ancienne,
        nouvelleValeur: diff.nouvelle,
        modifiePar: userName,
        modifieParId: userId,
        objet: existing.nom,
        societeId: id,
        request,
      });
    }

    return NextResponse.json({
      message: 'Société mise à jour avec succès.',
      societe: updatedSociete,
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la société :', error);

    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { erreur: 'Une société avec ce nom existe déjà (insensible à la casse et aux accents).' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { erreur: 'Erreur serveur lors de la mise à jour de la société.' },
      { status: 500 }
    );
  }
}

// ─── DELETE : Supprimer une société ───────────────────────────────────────────
//
// ─── RÈGLES MÉTIER (spécifications Sociétés clientes — figées par tests) ────
//   SPEC-4 : refus 409 MOTIVÉ si dossiers, assurés, appels de fonds (sur les
//            contrats) ou paramétrage d'appels de fonds rattachés — JAMAIS de
//            violation de clé étrangère brute (500) et JAMAIS de suppression
//            silencieuse de données comptables. Les contrats ne partent qu'en
//            l'absence totale d'appels de fonds ; barèmes, conventions
//            prestataires (cascade) et contacts (cascade) partent avec la
//            société ; les courriels sont détachés (SET NULL).
//   SPEC-3 : l'audit est écrit AVANT la suppression (l'entrée doit survivre à
//            la fiche supprimée) et porte les comptes de dépendances.

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const { nom: userName, id: userId } = await getUserInfoFromRequest(request);
    const { id } = await params;

    // Vérifier que la société existe
    const societe = await db.societe.findUnique({
      where: { id },
      include: {
        baremes: true,
        _count: { select: { dossiers: true, contrats: true, assures: true } },
      },
    });

    if (!societe) {
      return NextResponse.json(
        { erreur: 'Société introuvable.' },
        { status: 404 }
      );
    }

    // ─── SPEC-4 : mesurer TOUTES les dépendances qui bloquent ───────────────
    // Appels de fonds rattachés aux contrats de la société (les contrats
    // seraient supprimés par le nettoyage — leurs appels doivent d'abord
    // empêcher la suppression) + paramétrage ModeCalculAppelFonds (FK
    // RESTRICT en base : sans contrôle applicatif → 500 brut).
    const [appelsDeFonds, modeCalcul] = await Promise.all([
      db.appelDeFonds.count({ where: { contrat: { societeId: id } } }),
      db.modeCalculAppelFonds.count({ where: { societeId: id } }),
    ]);

    const blocages = motifsBlocageSuppression({
      dossiers: societe._count.dossiers,
      assures: societe._count.assures,
      appelsDeFonds,
      modeCalculAppelFonds: modeCalcul,
    });

    if (blocages.length > 0) {
      return NextResponse.json(
        { erreur: messageSuppressionBloquee(blocages), blocages },
        { status: 409 }
      );
    }

    // ─── SPEC-3 : audit AVANT la suppression (l'entrée d'audit doit survivre
    //     à la fiche supprimée) — enrichie avec les comptes de dépendances.
    await logParametreChange({
      entite: 'Societe', entiteId: id, champ: 'SUPPRESSION',
      ancienneValeur: `${societe.nom} (${societe.baremes.length} barème(s), ${societe._count.contrats} contrat(s))`,
      nouvelleValeur: null,
      modifiePar: userName, modifieParId: userId, objet: societe.nom, societeId: id, request,
    });

    // Suppression ordonnée respectant les FK : barèmes puis contrats (aucun
    // appel de fonds à ce stade — contrôlé ci-dessus) puis la société. Les
    // conventions prestataires et contacts partent en cascade, les courriels
    // sont détachés (SET NULL).
    await db.$transaction(async (tx) => {
      await tx.bareme.deleteMany({ where: { societeId: id } });
      await tx.contrat.deleteMany({ where: { societeId: id } });
      await tx.societe.delete({ where: { id } });
    });

    return NextResponse.json({
      message: `La société "${societe.nom}" a été supprimée avec succès.`,
    });
  } catch (error) {
    console.error('Erreur lors de la suppression de la société :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors de la suppression de la société.' },
      { status: 500 }
    );
  }
}
