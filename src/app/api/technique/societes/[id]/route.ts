import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { logParametreChange, getUserInfoFromRequest } from '@/lib/audit-log';
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
import {
  chargerVersionsCombinaison,
  normaliserPrestation,
  prochaineVersion,
} from '@/lib/baremes-validite';

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
        // P1 : toutes les VERSIONS vivantes (l'écran affiche les périodes de
        // validité et l'historique des taux) — les barèmes retirés
        // (soft-supprimés) restent exclus.
        baremes: {
          where: { supprime: false },
          orderBy: [{ prestation: 'asc' }, { version: 'asc' }],
        },
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

    // ─── P1 « Validité datée des barèmes » : VERSIONNEMENT (plus d'upsert) ──
    // Un changement de taux/plafond CLÔTURE la version courante et CRÉE une
    // nouvelle version — les anciens taux ne sont jamais écrasés. Les barèmes
    // retirés de la liste sont SOFT-supprimés (consultables, jamais perdus).
    // Les périodes d'évolution sont implicites : remplacement instantané à
    // l'instant courant (clôture à now − 1 ms : continuité sans chevauchement).
    const dateEvolution = new Date();
    const clotureInstantanee = new Date(dateEvolution.getTime() - 1);
    const baremesFournis = baremes && baremes.length > 0;

    // Mettre à jour la société et ses barèmes (versionnement)
    const updatedSociete = await db.$transaction(async (tx) => {
      if (baremesFournis && baremes) {
        const prestationsEnvoyees = baremes.map((b) => normaliserPrestation(b.prestation));

        // 1) Retraits : soft-delete des barèmes vivants absents de la liste
        //    (les versions passées et les justifications des remboursements
        //    restent intactes — plus aucun deleteMany).
        const retirables = existing.baremes.filter(
          (eb) => !eb.supprime && !prestationsEnvoyees.includes(normaliserPrestation(eb.prestation)),
        );
        for (const rb of retirables) {
          await tx.bareme.update({
            where: { id: rb.id },
            data: { supprime: true, active: false, valideAu: rb.valideAu ?? clotureInstantanee },
          });
          await logParametreChange({
            entite: 'Bareme', entiteId: rb.id, champ: 'RETRAIT',
            ancienneValeur: `v${rb.version} ${rb.prestation} (taux: ${rb.tauxCouverture}%, plafond: ${rb.plafond})`,
            nouvelleValeur: null,
            modifiePar: userName, modifieParId: userId, societeId: id, objet: rb.prestation, request,
          });
        }

        // 2) Évolution de chaque barème fourni (versionnement par prestation)
        for (const b of baremes) {
          const prestationNorm = normaliserPrestation(b.prestation);
          const versions = await chargerVersionsCombinaison(tx, { societeId: id, prestation: prestationNorm });
          const courante = versions.find((v) => !v.supprime && v.valideAu === null);
          const tauxInchange = courante && String(courante.tauxCouverture) === String(b.tauxCouverture);
          const plafondInchange = courante && String(courante.plafond) === String(b.plafond);

          if (courante && tauxInchange && plafondInchange) {
            // Tarif inchangé : mise à jour administrative simple (description,
            // statut actif) — la période de validité est conservée.
            await tx.bareme.update({
              where: { id: courante.id },
              data: { description: b.description ?? null, active: b.active ?? true },
            });
          } else if (courante) {
            // Changement de tarif : clôture instantanée puis nouvelle version.
            await tx.bareme.update({
              where: { id: courante.id },
              data: { valideAu: clotureInstantanee },
            });
            const nouvelle = await tx.bareme.create({
              data: {
                societeId: id,
                prestation: prestationNorm,
                tauxCouverture: b.tauxCouverture,
                plafond: b.plafond,
                description: b.description ?? null,
                active: b.active ?? true,
                valideDu: dateEvolution,
                version: prochaineVersion(versions),
              },
            });
            // Audit : ancien taux → nouveau taux, avec numéros de versions
            await logParametreChange({
              entite: 'Bareme', entiteId: nouvelle.id, champ: 'tauxCouverture',
              ancienneValeur: courante.tauxCouverture, nouvelleValeur: b.tauxCouverture,
              modifiePar: userName, modifieParId: userId, societeId: id, objet: prestationNorm,
              metadonnees: JSON.stringify({
                versionPrecedente: courante.version, nouvelleVersion: nouvelle.version,
                plafondPrecedent: String(courante.plafond), plafondNouveau: String(b.plafond),
              }),
              request,
            });
          } else {
            // Première version (ou réajout après retrait) : création v+1.
            const cree = await tx.bareme.create({
              data: {
                societeId: id,
                prestation: prestationNorm,
                tauxCouverture: b.tauxCouverture,
                plafond: b.plafond,
                description: b.description ?? null,
                active: b.active ?? true,
                valideDu: dateEvolution,
                version: prochaineVersion(versions),
              },
            });
            await logParametreChange({
              entite: 'Bareme', entiteId: cree.id, champ: 'CREATION',
              ancienneValeur: null,
              nouvelleValeur: `taux: ${cree.tauxCouverture}%, plafond: ${cree.plafond}, période: ${cree.valideDu.toISOString()} → en cours (v${cree.version})`,
              modifiePar: userName, modifieParId: userId, societeId: id, objet: prestationNorm, request,
            });
          }
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
