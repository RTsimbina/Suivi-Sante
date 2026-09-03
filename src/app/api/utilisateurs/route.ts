import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';
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
};

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

    // Enrichir avec le label de role
    const enriched = utilisateurs.map(u => ({
      ...u,
      roleLabel: ROLE_LABELS[u.role] || u.role,
    }));

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

    const utilisateur = await db.utilisateur.update({
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

    // Audit log
    try {
      await db.historiqueParametre.create({
        data: {
          entite: 'Utilisateur',
          entiteId: id,
          champ: 'SUPPRESSION',
          ancienneValeur: `${existing.nom} (${existing.email}), Role: ${existing.role}`,
          nouvelleValeur: null,
          modifiePar: 'SYSTEM',
        },
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
