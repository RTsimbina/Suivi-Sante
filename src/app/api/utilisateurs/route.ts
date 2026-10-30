import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
import { logParametreChange, getUserInfoFromRequest } from '@/lib/audit-log';
import { liaisonContactEntrepriseExiste } from '@/lib/liaison-externe';
import { liaisonPrestataireExiste, resoudreLiaisonPrestataireAvecControle } from '@/lib/liaison-prestataire';
import { parseJsonBody } from '@/lib/validation/parse';
import {
  utilisateurCreateSchema,
  utilisateurUpdateSchema,
  utilisateurPatchSchema,
} from '@/lib/validation';

const ROLE_LABELS: Record<string, string> = {
  ADMINISTRATEUR: 'Administrateur',
  ACCUEIL: 'Accueil',
  TECHNIQUE: 'Service Technique',
  COMPTABILITE: 'Comptabilite',
  SANTE: 'Controle Sante',
  PORTAIL_CLIENT: 'Portail Client',
  CONTACT_ENTREPRISE: 'Contact Entreprise',
  PRESTATAIRE: 'Prestataire',
};

/** Rôles externes dont le compte doit être lié à une entité métier par e-mail. */
const estRoleExterneLiaison = (role: string): boolean =>
  role === 'PORTAIL_CLIENT' || role === 'CONTACT_ENTREPRISE' || role === 'PRESTATAIRE';

// ─── Validation de la liaison des rôles externes ──────────────────────────────
// La liaison assuré↔compte (contact↔compte, prestataire↔compte) repose sur la
// correspondance d'e-mail au moment du login : sans Assure/EntrepriseContact/
// Prestataire portant cet e-mail, le portail affiche « Aucun assuré lié à
// votre compte ». On refuse donc la création/modification d'un compte externe
// sans liaison existante (422) au lieu de produire un compte cassé
// découvrable seulement au login.
async function liaisonExterneExiste(role: string, email: string): Promise<boolean> {
  if (role === 'PORTAIL_CLIENT') {
    const assure = await db.assure.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    return !!assure;
  }
  if (role === 'CONTACT_ENTREPRISE') {
    // Contact déclaré, e-mail du contact principal (« Modifier la société »)
    // ou e-mail général de la société — cf. src/lib/liaison-externe.ts.
    return liaisonContactEntrepriseExiste(email);
  }
  if (role === 'PRESTATAIRE') {
    // Fiche Prestataire portant cet e-mail (GESTION → Prestataires).
    return liaisonPrestataireExiste(email);
  }
  return true; // rôles internes : pas de liaison exigée
}

function erreurLiaisonExterne(role: string, email: string): string {
  if (role === 'PORTAIL_CLIENT') {
    return `Aucun assuré n'a l'e-mail « ${email} » : ce compte Portail Client afficherait une erreur de liaison. Créez d'abord l'assuré avec cet e-mail (ou corrigez l'e-mail saisi).`;
  }
  if (role === 'PRESTATAIRE') {
    return `Aucun prestataire n'a l'e-mail « ${email} » : ce compte Prestataire afficherait une erreur de liaison. Saisissez cet e-mail sur la fiche du prestataire dans GESTION → Prestataires (champ Adresse e-mail), ou corrigez l'e-mail saisi.`;
  }
  return `Aucun contact d'entreprise n'a l'e-mail « ${email} » : ce compte Contact Entreprise afficherait une erreur de liaison. Saisissez cet e-mail comme « Contact principal » dans Modifier la société, sélectionnez la société ci-dessous, ou créez le contact dans Sociétés → Contacts.`;
}

/**
 * PRESTATAIRE — garde d'ambiguïté de la liaison (miroir SPEC-6 des sociétés) :
 * un e-mail partagé par plusieurs fiches (exception de doublon validée par un
 * administrateur, ex. groupe d'établissements) rendrait la liaison portail
 * imprévisible — la résolution prend silencieusement la fiche la plus ancienne.
 * Refus 409 : l'admin corrige les fiches (e-mail distinct par établissement)
 * ou choisit un e-mail présent sur une seule fiche.
 */
async function refuserSiLiaisonPrestataireAmbigue(
  email: string
): Promise<NextResponse | null> {
  const controlee = await resoudreLiaisonPrestataireAvecControle(email);
  if (controlee.statut !== 'AMBIGU') return null;
  return NextResponse.json(
    {
      erreur:
        `L'e-mail « ${email} » est partagé par ${controlee.nbFiches} fiches prestataire : la liaison du portail serait ambiguë (fiche la plus ancienne, sans garantie d'être la bonne). ` +
        `Corrigez les fiches dans GESTION → Prestataires (un e-mail distinct par établissement) ou utilisez un e-mail présent sur une seule fiche.`,
    },
    { status: 409 }
  );
}

/**
 * Crée le contact d'entreprise manquant pour un compte CONTACT_ENTREPRISE
 * (création en une étape : compte + liaison société). Le societeId doit
 * référencer une société existante — sinon null (→ 422 appelant).
 * Retourne le contact créé, ou null si la société est introuvable.
 */
async function creerContactEntrepriseLiaison(
  societeId: string,
  nom: string,
  email: string
): Promise<{ id: string } | null> {
  const societe = await db.societe.findUnique({
    where: { id: societeId },
    select: { id: true },
  });
  if (!societe) return null;
  return db.entrepriseContact.create({
    data: { societeId, nom, email },
    select: { id: true },
  });
}

// ─── GET : Liste des utilisateurs ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await checkAuth(request);
  if (auth) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const filtreRole = searchParams.get('role') || '';
    const filtreActif = searchParams.get('actif');
    const recherche = searchParams.get('q') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

    const where: Record<string, unknown> = {};

    if (filtreRole) where.role = filtreRole;
    if (filtreActif !== null && filtreActif !== '') {
      where.actif = filtreActif === 'true';
    }
    if (recherche) {
      where.OR = [
        { email: { contains: recherche, mode: 'insensitive' } },
        { nom: { contains: recherche, mode: 'insensitive' } },
      ];
    }

    const [utilisateurs, total] = await Promise.all([
      db.utilisateur.findMany({
        where,
        select: {
          id: true,
          email: true,
          nom: true,
          role: true,
          actif: true,
          avatar: true,
          dernierLogin: true,
          createdAt: true,
          updatedAt: true,
          failedAttempts: true,
          lockoutUntil: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.utilisateur.count({ where }),
    ]);

    // Enrichir avec le label de rôle + l'état de liaison des rôles externes.
    // Visibilité : un compte PORTAIL_CLIENT / CONTACT_ENTREPRISE sans assuré /
    // contact portant cet e-mail produit l'erreur « Aucun assuré lié à votre
    // compte » au portail — on l'affiche AVANT que le client ne se connecte.
    //
    // ⚠️ L'enrichissement est BEST-EFFORT : il ne doit JAMAIS faire échouer
    // la liste. En production (2026-09), le code déployé avant la migration
    // Prisma « emailContactPrincipal » faisait planter cette requête SQL →
    // 500 → « Aucun utilisateur trouvé » pour TOUS les comptes. Désormais :
    // en cas d'erreur ici, la liste est renvoyée quand même, simplement sans
    // badge de liaison (liaisonExterne = null = inconnu).
    let erreurBadge = false;
    const emailsExternes = utilisateurs
      .filter(u => estRoleExterneLiaison(u.role))
      .map(u => u.email);

    const assuresParEmail = new Set<string>();
    const contactsParEmail = new Set<string>();
    const societesParEmail = new Set<string>();
    const prestatairesParEmail = new Set<string>();
    if (emailsExternes.length > 0) {
      try {
        const [assures, contacts, societesLiees, prestataires] = await Promise.all([
          db.assure.findMany({
            where: { email: { in: emailsExternes, mode: 'insensitive' } },
            select: { email: true },
          }),
          db.entrepriseContact.findMany({
            where: { email: { in: emailsExternes, mode: 'insensitive' } },
            select: { email: true },
          }),
          db.societe.findMany({
            where: {
              OR: [
                { emailContactPrincipal: { in: emailsExternes, mode: 'insensitive' } },
                { email: { in: emailsExternes, mode: 'insensitive' } },
              ],
            },
            select: { email: true, emailContactPrincipal: true },
          }),
          db.prestataire.findMany({
            where: { email: { in: emailsExternes, mode: 'insensitive' } },
            select: { email: true },
          }),
        ]);
        assures.forEach(a => assuresParEmail.add((a.email ?? '').trim().toLowerCase()));
        contacts.forEach(c => contactsParEmail.add((c.email ?? '').trim().toLowerCase()));
        societesLiees.forEach(s => {
          if (s.emailContactPrincipal) societesParEmail.add(s.emailContactPrincipal.trim().toLowerCase());
          if (s.email) societesParEmail.add(s.email.trim().toLowerCase());
        });
        prestataires.forEach(p => prestatairesParEmail.add((p.email ?? '').trim().toLowerCase()));
      } catch (error) {
        // Migration 20260916120000 non déployée, base indisponible, etc. :
        // on dégrade le badge, pas la liste.
        erreurBadge = true;
        console.error('[UTILISATEURS] Enrichissement liaison indisponible (liste renvoyée sans badge) :', error);
      }
    }

    const enriched = utilisateurs.map(u => {
      let liaisonExterne: boolean | null = null;
      if (!erreurBadge) {
        if (u.role === 'PORTAIL_CLIENT') {
          liaisonExterne = assuresParEmail.has(u.email.trim().toLowerCase());
        } else if (u.role === 'CONTACT_ENTREPRISE') {
          liaisonExterne = contactsParEmail.has(u.email.trim().toLowerCase()) ||
            societesParEmail.has(u.email.trim().toLowerCase());
        } else if (u.role === 'PRESTATAIRE') {
          liaisonExterne = prestatairesParEmail.has(u.email.trim().toLowerCase());
        }
      }
      return {
        ...u,
        roleLabel: ROLE_LABELS[u.role] || u.role,
        liaisonExterne,
      };
    });

    return NextResponse.json({
      utilisateurs: enriched,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('[UTILISATEURS] Erreur GET :', error);
    return NextResponse.json(
      { erreur: 'Erreur lors du chargement des utilisateurs.' },
      { status: 500 }
    );
  }
}

// ─── POST : Creer un nouvel utilisateur ────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await checkAuth(request);
  if (auth) return auth;

  try {
    // ─── Validation Zod centralisée (email, mot de passe, rôle) ─────────────
    const parsed = await parseJsonBody(request, utilisateurCreateSchema);
    if (!parsed.success) return parsed.response;
    const { nom, password, role } = parsed.data;
    const emailTrimmed = parsed.data.email.toLowerCase();
    const nomTrimmed = nom;
    const societeId = parsed.data.societeId || undefined;

    // Verifier l'unicite de l'email
    const existing = await db.utilisateur.findUnique({
      where: { email: emailTrimmed },
    });
    if (existing) {
      return NextResponse.json(
        { erreur: 'Un compte avec cet e-mail existe deja.' },
        { status: 409 }
      );
    }

    // Rôles externes : exiger une liaison assuré/contact/prestataire sur cet e-mail.
    // CONTACT_ENTREPRISE : si le contact n'existe pas mais qu'une société est
    // fournie, création en une étape du contact lié (compte représentant
    // opérationnel immédiatement — sinon l'admin était bloqué par le 422).
    if (estRoleExterneLiaison(role) &&
        !(await liaisonExterneExiste(role, emailTrimmed))) {
      if (role === 'CONTACT_ENTREPRISE' && societeId) {
        const contactCree = await creerContactEntrepriseLiaison(societeId, nomTrimmed, emailTrimmed);
        if (!contactCree) {
          return NextResponse.json(
            { erreur: 'La société sélectionnée est introuvable. Vérifiez la sélection et réessayez.' },
            { status: 422 }
          );
        }
      } else {
        return NextResponse.json(
          { erreur: erreurLiaisonExterne(role, emailTrimmed) },
          { status: 422 }
        );
      }
    }

    // PRESTATAIRE : la liaison existe mais ne doit pas être ambiguë (409).
    if (role === 'PRESTATAIRE') {
      const refus = await refuserSiLiaisonPrestataireAmbigue(emailTrimmed);
      if (refus) return refus;
    }

    // Hasher le mot de passe
    const hashedPassword = await hash(password, 12);

    // Creer l'utilisateur
    const utilisateur = await db.utilisateur.create({
      data: {
        email: emailTrimmed,
        nom: nomTrimmed,
        password: hashedPassword,
        role,
        actif: true,
      },
      select: {
        id: true,
        email: true,
        nom: true,
        role: true,
        actif: true,
        avatar: true,
        createdAt: true,
      },
    });

    // ─── Audit (socle Gestion — pilier Audit) : FON-002 « traces dans le
    // journal d'audit ». JAMAIS de mot de passe dans le journal (ni clair,
    // ni hashé) — seul le fait de la création est tracé.
    const { nom: auteurNom, id: auteurId } = await getUserInfoFromRequest(request);
    await logParametreChange({
      entite: 'Utilisateur',
      entiteId: utilisateur.id,
      champ: 'CREATION',
      ancienneValeur: null,
      nouvelleValeur: `${utilisateur.email} (${utilisateur.nom}) — rôle ${utilisateur.role}`,
      modifiePar: auteurNom,
      modifieParId: auteurId,
      objet: utilisateur.email,
      request,
    });

    return NextResponse.json({
      message: 'Utilisateur cree avec succes.',
      utilisateur: { ...utilisateur, roleLabel: ROLE_LABELS[utilisateur.role] || utilisateur.role },
    }, { status: 201 });
  } catch (error) {
    console.error('[UTILISATEURS] Erreur POST :', error);
    return NextResponse.json(
      { erreur: 'Erreur lors de la creation de l\'utilisateur.' },
      { status: 500 }
    );
  }
}

// ─── PUT : Modifier un utilisateur ─────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  const auth = await checkAuth(request);
  if (auth) return auth;

  try {
    // ─── Validation Zod centralisée (whitelist, email, mot de passe, rôle) ──
    const parsed = await parseJsonBody(request, utilisateurUpdateSchema);
    if (!parsed.success) return parsed.response;
    const { id, email, nom, role, password } = parsed.data;
    const societeId = parsed.data.societeId || undefined;

    // Verifier que l'utilisateur existe
    const existing = await db.utilisateur.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json(
        { erreur: 'Utilisateur introuvable.' },
        { status: 404 }
      );
    }

    // Construire les donnees de mise a jour (règles déjà validées par Zod)
    const data: Record<string, unknown> = {};

    if (nom !== undefined) {
      data.nom = nom;
    }

    if (email !== undefined) {
      const emailTrimmed = email.toLowerCase();
      // Verifier l'unicité si l'email change
      if (emailTrimmed !== existing.email) {
        const duplicate = await db.utilisateur.findUnique({
          where: { email: emailTrimmed },
        });
        if (duplicate) {
          return NextResponse.json(
            { erreur: 'Un autre compte utilise deja cet e-mail.' },
            { status: 409 }
          );
        }
      }
      data.email = emailTrimmed;
    }

    // Le schéma Zod garantit role ∈ ROLES_UTILISATEUR
    if (role !== undefined) {
      data.role = role;
    }

    // Rôles externes : re-valider la liaison si l'e-mail change ou si le rôle
    // vient de basculer vers un rôle externe (sinon compte externe cassé).
    const roleFinal = role ?? existing.role;
    const emailFinal = (data.email as string | undefined) ?? existing.email;
    const basculeVersExterne =
      role !== undefined &&
      !estRoleExterneLiaison(existing.role) &&
      estRoleExterneLiaison(roleFinal);
    if (
      estRoleExterneLiaison(roleFinal) &&
      (data.email !== undefined || basculeVersExterne)
    ) {
      if (!(await liaisonExterneExiste(roleFinal, emailFinal))) {
        // CONTACT_ENTREPRISE : création en une étape du contact lié si une
        // société est fournie (sinon l'admin reste bloqué au 422).
        if (roleFinal === 'CONTACT_ENTREPRISE' && societeId) {
          const contactCree = await creerContactEntrepriseLiaison(
            societeId,
            (data.nom as string | undefined) ?? existing.nom,
            emailFinal
          );
          if (!contactCree) {
            return NextResponse.json(
              { erreur: 'La société sélectionnée est introuvable. Vérifiez la sélection et réessayez.' },
              { status: 422 }
            );
          }
        } else {
          return NextResponse.json(
            { erreur: erreurLiaisonExterne(roleFinal, emailFinal) },
            { status: 422 }
          );
        }
      }

      // PRESTATAIRE : la liaison (re)validée ne doit pas être ambiguë (409).
      if (roleFinal === 'PRESTATAIRE') {
        const refus = await refuserSiLiaisonPrestataireAmbigue(emailFinal);
        if (refus) return refus;
      }
    }

    if (password !== undefined) {
      data.password = await hash(password, 12);
    }

    const utilisateur = await db.utilisateur.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        nom: true,
        role: true,
        actif: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // ─── Audit (socle Gestion — pilier Audit) : chaque champ réellement
    // modifié est tracé. Le mot de passe n'est JAMAIS journalisé (ni l'ancien
    // hash, ni le nouveau) — le changement est tracé en tant que fait
    // (« (modifié) »), pour répondre à « qui a changé ce mot de passe ».
    const { nom: auteurNom, id: auteurId } = await getUserInfoFromRequest(request);
    const modifications: { champ: string; ancienne: unknown; nouvelle: unknown }[] = [];
    if (data.nom !== undefined && existing.nom !== data.nom) {
      modifications.push({ champ: 'nom', ancienne: existing.nom, nouvelle: data.nom });
    }
    if (data.email !== undefined && existing.email !== data.email) {
      modifications.push({ champ: 'email', ancienne: existing.email, nouvelle: data.email });
    }
    if (data.role !== undefined && existing.role !== data.role) {
      modifications.push({ champ: 'role', ancienne: existing.role, nouvelle: data.role });
    }
    if (data.password !== undefined) {
      modifications.push({ champ: 'password', ancienne: '(hash existant)', nouvelle: '(modifié)' });
    }
    for (const m of modifications) {
      await logParametreChange({
        entite: 'Utilisateur',
        entiteId: id,
        champ: m.champ,
        ancienneValeur: m.ancienne,
        nouvelleValeur: m.nouvelle,
        modifiePar: auteurNom,
        modifieParId: auteurId,
        objet: existing.email,
        request,
      });
    }

    return NextResponse.json({
      message: 'Utilisateur mis a jour avec succes.',
      utilisateur: { ...utilisateur, roleLabel: ROLE_LABELS[utilisateur.role] || utilisateur.role },
    });
  } catch (error) {
    console.error('[UTILISATEURS] Erreur PUT :', error);
    return NextResponse.json(
      { erreur: 'Erreur lors de la modification de l\'utilisateur.' },
      { status: 500 }
    );
  }
}

// ─── PATCH : Activer / Desactiver un utilisateur ───────────────────────────────
export async function PATCH(request: NextRequest) {
  const auth = await checkAuth(request);
  if (auth) return auth;

  try {
    // ─── Validation Zod centralisée ─────────────────────────────────────────
    // FIX audit : pas de typeof sur `actif` — une chaîne "false" (truthy)
    // était envoyée telle quelle à Prisma. Le schéma garantit un booléen.
    const parsed = await parseJsonBody(request, utilisateurPatchSchema);
    if (!parsed.success) return parsed.response;
    const { id, actif } = parsed.data;

    const existing = await db.utilisateur.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { erreur: 'Utilisateur introuvable.' },
        { status: 404 }
      );
    }

    // ─── P1 « Révocation des sessions » ────────────────────────────────────
    // Un changement RÉEL de statut (désactivation OU réactivation) incrémente
    // Utilisateur.sessionVersion DANS LA MÊME TRANSACTION : tout jeton JWT
    // émis avant l'opération porte une version périmée et est REFUSÉ à la
    // première requête protégée (src/lib/session-revocation.ts) — révocation
    // immédiate de toutes les sessions ouvertes, y compris les autres
    // appareils. L'incrément à la RÉACTIVATION garantit qu'un jeton volé
    // avant la désactivation ne redevient jamais valide après.
    const changementStatut = existing.actif !== actif;
    const utilisateur = changementStatut
      ? await db.$transaction(async (tx) =>
          tx.utilisateur.update({
            where: { id },
            data: { actif, sessionVersion: { increment: 1 } },
            select: {
              id: true,
              email: true,
              nom: true,
              role: true,
              actif: true,
              avatar: true,
              updatedAt: true,
            },
          }),
        )
      : await db.utilisateur.update({
          where: { id },
          data: { actif },
          select: {
            id: true,
            email: true,
            nom: true,
            role: true,
            actif: true,
            avatar: true,
            updatedAt: true,
          },
        });

    // ─── Audit (socle Gestion — pilier Audit) : l'activation / désactivation
    // d'un compte est un événement de sécurité majeur — toujours tracée avec
    // l'auteur réel. La RÉVOCATION des sessions est tracée dans les
    // métadonnées (numéro de version) — JAMAIS de jeton, cookie ou secret.
    if (changementStatut) {
      const { nom: auteurNom, id: auteurId } = await getUserInfoFromRequest(request);
      await logParametreChange({
        entite: 'Utilisateur',
        entiteId: id,
        champ: 'actif',
        ancienneValeur: existing.actif,
        nouvelleValeur: actif,
        modifiePar: auteurNom,
        modifieParId: auteurId,
        objet: existing.email,
        metadonnees: JSON.stringify({
          sessionsRevoquees: true,
          sessionVersion: (utilisateur as { sessionVersion?: number }).sessionVersion ?? null,
        }),
        request,
      });
    }

    return NextResponse.json({
      message: actif ? 'Utilisateur active.' : 'Utilisateur desactive.',
      utilisateur: { ...utilisateur, roleLabel: ROLE_LABELS[utilisateur.role] || utilisateur.role },
    });
  } catch (error) {
    console.error('[UTILISATEURS] Erreur PATCH :', error);
    return NextResponse.json(
      { erreur: 'Erreur lors de la modification du statut.' },
      { status: 500 }
    );
  }
}

// ─── DELETE : Supprimer un utilisateur ─────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  const auth = await checkAuth(request);
  if (auth) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { erreur: 'Identifiant utilisateur requis.' },
        { status: 400 }
      );
    }

    // Empêcher la suppression de son propre compte
    const token = await (await import('next-auth/jwt')).getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (token?.id === id) {
      return NextResponse.json(
        { erreur: 'Vous ne pouvez pas supprimer votre propre compte.' },
        { status: 400 }
      );
    }

    const existing = await db.utilisateur.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { erreur: 'Utilisateur introuvable.' },
        { status: 404 }
      );
    }

    await db.utilisateur.delete({ where: { id } });

    // Audit log — auteur RÉEL (l'administrateur qui supprime), pas « SYSTEM » :
    // le journal doit répondre « qui a supprimé ce compte ». Non bloquant :
    // la suppression est déjà effective.
    try {
      const { nom: auteurNom, id: auteurId } = await getUserInfoFromRequest(request);
      await logParametreChange({
        entite: 'Utilisateur',
        entiteId: id,
        champ: 'SUPPRESSION',
        ancienneValeur: `${existing.nom} (${existing.email}), Rôle : ${existing.role}`,
        nouvelleValeur: null,
        modifiePar: auteurNom || 'SYSTEM',
        modifieParId: auteurId,
        objet: existing.email,
        request,
      });
    } catch { /* ne pas bloquer */ }

    return NextResponse.json({
      message: `Utilisateur ${existing.nom} (${existing.email}) supprime.`,
    });
  } catch (error) {
    console.error('[UTILISATEURS] Erreur DELETE :', error);
    return NextResponse.json(
      { erreur: 'Erreur lors de la suppression de l\'utilisateur.' },
      { status: 500 }
    );
  }
}
