import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { db } from '@/lib/db';
import { enNombre, sommer } from '@/lib/money';

// ─── GET : Données du portail client ──────────────────────────────────────
// Renvoie les données filtrées selon le rôle externe connecté :
//   - PORTAIL_CLIENT : données de l'assuré (avec ayants droit, contrats, dossiers)
//   - CONTACT_ENTREPRISE : données de la société (assurés, contrats, dossiers)
//   - ADMINISTRATEUR : toutes les données (pour test)

// ─── Résolution de secours des identifiants de portail ────────────────────
// Le JWT fige assureId/societeId pour toute la session (8 h). Si la liaison
// (e-mail assuré / contact d'entreprise) a été créée ou corrigée APRÈS la
// connexion, le token ne la contient pas — et si l'assuré a été supprimé/
// recréé, le token pointe vers un id mort. Dans ces deux cas, on re-résout
// DEPUIS LA BASE à partir de l'e-mail authentifié du token (jamais d'entrée
// client), ce qui auto-répare le compte sans attendre une reconnexion.

async function resoudreAssureParEmail(email: string) {
  return db.assure.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, societeId: true },
  });
}

async function resoudreSocieteIdParEmailContact(email: string): Promise<string | null> {
  const contact = await db.entrepriseContact.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { societeId: true },
  });
  return contact?.societeId ?? null;
}

async function chargerAssure(id: string) {
  return db.assure.findUnique({
    where: { id },
    include: {
      societe: { select: { id: true, nom: true, adresse: true, telephone: true, email: true } },
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token) {
      return NextResponse.json({ erreur: 'Non authentifié.' }, { status: 401 });
    }

    const role = token.role as string;
    let assureId = token.assureId as string | undefined;
    let societeId = token.societeId as string | undefined;
    const userId = token.id as string;
    const emailToken = (token.email as string | undefined)?.trim() ?? '';

    // Rôles internes n'ont rien à faire ici
    if (!['PORTAIL_CLIENT', 'CONTACT_ENTREPRISE', 'ADMINISTRATEUR'].includes(role)) {
      return NextResponse.json({ erreur: 'Accès refusé.' }, { status: 403 });
    }

    // ─── Mode PORTAIL_CLIENT : vue assuré ───
    if (role === 'PORTAIL_CLIENT') {
      // Re-résolution par e-mail si le token ne porte pas l'assuré
      // (session ouverte avant la création/correction de la liaison).
      if (!assureId && emailToken) {
        const resolu = await resoudreAssureParEmail(emailToken);
        if (resolu) {
          assureId = resolu.id;
          societeId = resolu.societeId ?? societeId;
        }
      }

      if (!assureId) {
        console.error(
          `[PORTAIL CLIENT] Compte ${emailToken || userId} (rôle ${role}) : aucun Assure en base ` +
          `avec cet e-mail. Vérifiez l'e-mail de l'assuré côté Assurés/Configuration.`
        );
        return NextResponse.json(
          {
            erreur:
              `Aucun assuré lié à votre compte${emailToken ? ` (e-mail recherché : ${emailToken})` : ''}. ` +
              `Vérifiez que l'assuré a exactement cet e-mail dans la base ; une fois corrigé, rechargez cette page.`,
          },
          { status: 403 }
        );
      }

      // Récupérer l'assuré avec sa société
      let assure = await chargerAssure(assureId);

      // Id du token périmé (assuré supprimé puis recréé) → re-résolution par e-mail
      if (!assure && emailToken) {
        const resolu = await resoudreAssureParEmail(emailToken);
        if (resolu && resolu.id !== assureId) {
          assureId = resolu.id;
          societeId = resolu.societeId ?? societeId;
          assure = await chargerAssure(assureId);
        }
      }

      if (!assure) {
        return NextResponse.json({ erreur: 'Assuré introuvable.' }, { status: 404 });
      }

      // Récupérer les ayants droit (conjoint + enfants)
      const ayantsDroit = await db.assure.findMany({
        where: {
          OR: [
            { assurePrincipalId: assureId },
            { id: assureId },
          ],
        },
        include: {
          societe: { select: { id: true, nom: true } },
          _count: { select: { dossiers: true } },
        },
        orderBy: [{ typeBeneficiaire: 'asc' }, { createdAt: 'desc' }],
      });

      // Familles : regrouper par codeFamille ou par assurePrincipalId
      const familleMembers = ayantsDroit.filter(a => a.id !== assureId);
      const principalRecord = ayantsDroit.find(a => a.id === assureId);

      // Récupérer les contrats de la société
      const contrats = await db.contrat.findMany({
        where: {
          societeId: assure.societeId,
          statut: 'ACTIF',
        },
        orderBy: { createdAt: 'desc' },
      });

      // Récupérer les dossiers de toute la famille
      const allAssureIds = ayantsDroit.map(a => a.id);
      const dossiers = await db.dossier.findMany({
        where: {
          assureId: { in: allAssureIds },
        },
        include: {
          societe: { select: { id: true, nom: true } },
          assure: { select: { id: true, nom: true, prenom: true, typeBeneficiaire: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      // Récupérer les barèmes de la société
      const baremes = await db.bareme.findMany({
        where: { societeId: assure.societeId, active: true },
      });

      // Stats rapides — sommes EXACTES en Decimal (plan P3)
      const totalDossiers = dossiers.length;
      const totalReclame = enNombre(sommer(dossiers.map(d => d.montantReclame))) ?? 0;
      const totalPaye = enNombre(sommer(
        dossiers.filter(d => d.statut === 'PAYE').map(d => d.montantPaye)
      )) ?? 0;
      const enCours = dossiers.filter(d => !['PAYE', 'REJETE'].includes(d.statut)).length;
      const rejetes = dossiers.filter(d => d.statut === 'REJETE').length;

      return NextResponse.json({
        type: 'PORTAIL_CLIENT',
        assure: {
          id: assure.id,
          nom: assure.nom,
          prenom: assure.prenom,
          nSS: assure.nSS,
          matricule: assure.matricule,
          typeBeneficiaire: assure.typeBeneficiaire,
          dateNaissance: assure.dateNaissance,
          sexe: assure.sexe,
          dateEffet: assure.dateEffet,
          bareme: assure.bareme,
          telephone: assure.telephone,
          email: assure.email,
          adresse: assure.adresse,
          actif: assure.actif,
          codeFamille: assure.codeFamille,
        },
        societe: assure.societe,
        famille: familleMembers,
        contrats: contrats.map(c => ({
          id: c.id,
          reference: c.reference,
          budgetAnnuel: c.budgetAnnuel,
          budgetUtilise: c.budgetUtilise,
          dateDebut: c.dateDebut,
          dateFin: c.dateFin,
          statut: c.statut,
        })),
        baremes: baremes.map(b => ({
          id: b.id,
          prestation: b.prestation,
          tauxCouverture: b.tauxCouverture,
          plafond: b.plafond,
          description: b.description,
        })),
        dossiers: dossiers.map(d => ({
          id: d.id,
          numeroDossier: d.numeroDossier,
          statut: d.statut,
          typeDossier: d.typeDossier,
          beneficiaire: d.beneficiaire,
          dateReception: d.dateReception,
          dateSoins: d.dateSoins,
          montantReclame: d.montantReclame,
          montantValide: d.montantValide,
          montantPaye: d.montantPaye,
          partPatient: d.partPatient,
          datePaiement: d.datePaiement,
          referencePaiement: d.referencePaiement,
          motifRejet: d.motifRejet,
          assure: d.assure ? {
            nom: d.assure.nom,
            prenom: d.assure.prenom,
            typeBeneficiaire: d.assure.typeBeneficiaire,
          } : null,
        })),
        kpis: { totalDossiers, totalReclame, totalPaye, enCours, rejetes },
      });
    }

    // ─── Mode CONTACT_ENTREPRISE : vue entreprise ───
    if (role === 'CONTACT_ENTREPRISE') {
      // Re-résolution par e-mail du contact si le token ne porte pas la société
      if (!societeId && emailToken) {
        societeId = (await resoudreSocieteIdParEmailContact(emailToken)) ?? undefined;
      }

      if (!societeId) {
        console.error(
          `[PORTAIL CLIENT] Compte ${emailToken || userId} (rôle ${role}) : aucun EntrepriseContact ` +
          `avec cet e-mail. Vérifiez l'e-mail du contact côté Configuration.`
        );
        return NextResponse.json(
          {
            erreur:
              `Aucune société liée à votre compte${emailToken ? ` (e-mail recherché : ${emailToken})` : ''}. ` +
              `Vérifiez que le contact d'entreprise a exactement cet e-mail dans la base ; une fois corrigé, rechargez cette page.`,
          },
          { status: 403 }
        );
      }

      const societe = await db.societe.findUnique({
        where: { id: societeId },
      });

      if (!societe) {
        return NextResponse.json({ erreur: 'Société introuvable.' }, { status: 404 });
      }

      // Récupérer les assurés de cette société
      const assures = await db.assure.findMany({
        where: { societeId },
        include: {
          _count: { select: { dossiers: true } },
        },
        orderBy: [{ typeBeneficiaire: 'asc' }, { nom: 'asc' }],
      });

      // Récupérer les contrats
      const contrats = await db.contrat.findMany({
        where: { societeId },
        orderBy: { createdAt: 'desc' },
      });

      // Récupérer les dossiers
      const dossiers = await db.dossier.findMany({
        where: { societeId },
        include: {
          assure: { select: { id: true, nom: true, prenom: true, typeBeneficiaire: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });

      // Stats
      const totalAssures = assures.filter(a => a.typeBeneficiaire === 'ASSURE').length;
      const totalAyantsDroit = assures.filter(a => a.typeBeneficiaire !== 'ASSURE').length;
      const totalDossiers = dossiers.length;
      const totalReclame = enNombre(sommer(dossiers.map(d => d.montantReclame))) ?? 0;
      const totalPaye = enNombre(sommer(
        dossiers.filter(d => d.statut === 'PAYE').map(d => d.montantPaye)
      )) ?? 0;
      const enCours = dossiers.filter(d => !['PAYE', 'REJETE'].includes(d.statut)).length;
      const rejetes = dossiers.filter(d => d.statut === 'REJETE').length;

      return NextResponse.json({
        type: 'CONTACT_ENTREPRISE',
        societe: {
          id: societe.id,
          nom: societe.nom,
          adresse: societe.adresse,
          telephone: societe.telephone,
          email: societe.email,
        },
        assures: assures.map(a => ({
          id: a.id,
          nom: a.nom,
          prenom: a.prenom,
          nSS: a.nSS,
          matricule: a.matricule,
          typeBeneficiaire: a.typeBeneficiaire,
          dateEffet: a.dateEffet,
          actif: a.actif,
          nbDossiers: a._count.dossiers,
        })),
        contrats: contrats.map(c => ({
          id: c.id,
          reference: c.reference,
          budgetAnnuel: c.budgetAnnuel,
          budgetUtilise: c.budgetUtilise,
          dateDebut: c.dateDebut,
          dateFin: c.dateFin,
          statut: c.statut,
        })),
        dossiers: dossiers.map(d => ({
          id: d.id,
          numeroDossier: d.numeroDossier,
          statut: d.statut,
          typeDossier: d.typeDossier,
          beneficiaire: d.beneficiaire,
          dateReception: d.dateReception,
          dateSoins: d.dateSoins,
          montantReclame: d.montantReclame,
          montantValide: d.montantValide,
          montantPaye: d.montantPaye,
          partPatient: d.partPatient,
          datePaiement: d.datePaiement,
          referencePaiement: d.referencePaiement,
          motifRejet: d.motifRejet,
          assure: d.assure ? {
            nom: d.assure.nom,
            prenom: d.assure.prenom,
            typeBeneficiaire: d.assure.typeBeneficiaire,
          } : null,
        })),
        kpis: {
          totalAssures,
          totalAyantsDroit,
          totalDossiers,
          totalReclame,
          totalPaye,
          enCours,
          rejetes,
        },
      });
    }

    // ─── ADMINISTRATEUR : mode test (utiliser assureId/societeId du token si fournis) ───
    return NextResponse.json({
      type: 'ADMINISTRATEUR',
      message: 'Mode administrateur. Utilisez un compte portail pour tester.',
    });
  } catch (error) {
    console.error('[PORTAIL CLIENT] Erreur :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors du chargement des données.' },
      { status: 500 }
    );
  }
}
