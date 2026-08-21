import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { db } from '@/lib/db';
import { checkAuth } from '@/lib/authorize';

// ─── Rôles disponibles pour la création d'utilisateurs ───────────────────────
const VALID_ROLES = [
  'ADMINISTRATEUR',
  'ACCUEIL',
  'TECHNIQUE',
  'COMPTABILITE',
  'SANTE',
  'PORTAIL_CLIENT',
  'CONTACT_ENTREPRISE',
] as const;

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
    const body = await request.json();
    const { email, nom, password, role } = body;

    // Validations
    if (!email || !nom || !password || !role) {
      return NextResponse.json(
        { erreur: 'Tous les champs sont obligatoires (email, nom, mot de passe, role).' },
        { status: 400 }
      );
    }

    const emailTrimmed = email.toLowerCase().trim();
    const nomTrimmed = nom.trim();

    // Valider le format email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailTrimmed)) {
      return NextResponse.json(
        { erreur: 'Format d\'adresse e-mail invalide.' },
        { status: 400 }
      );
    }

    // Valider le role
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { erreur: `Role invalide. Roles autorises : ${VALID_ROLES.join(', ')}` },
        { status: 400 }
      );
    }

    // Valider la longueur du mot de passe
    if (password.length < 6) {
      return NextResponse.json(
        { erreur: 'Le mot de passe doit contenir au moins 6 caracteres.' },
        { status: 400 }
      );
    }

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
    const body = await request.json();
    const { id, email, nom, role, password } = body;

    if (!id) {
      return NextResponse.json(
        { erreur: 'Identifiant utilisateur requis.' },
        { status: 400 }
      );
    }

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

    // Construire les donnees de mise a jour
    const data: Record<string, unknown> = {};

    if (nom !== undefined) {
      const nomTrimmed = nom.trim();
      if (!nomTrimmed) {
        return NextResponse.json(
          { erreur: 'Le nom ne peut pas etre vide.' },
          { status: 400 }
        );
      }
      data.nom = nomTrimmed;
    }

    if (email !== undefined) {
      const emailTrimmed = email.toLowerCase().trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailTrimmed)) {
        return NextResponse.json(
          { erreur: 'Format d\'e-mail invalide.' },
          { status: 400 }
        );
      }
      // Verifier l'unicite si l'email change
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

    if (role !== undefined) {
      if (!VALID_ROLES.includes(role)) {
        return NextResponse.json(
          { erreur: `Role invalide. Roles autorises : ${VALID_ROLES.join(', ')}` },
          { status: 400 }
        );
      }
      data.role = role;
    }

    if (password !== undefined && password !== '') {
      if (password.length < 6) {
        return NextResponse.json(
          { erreur: 'Le mot de passe doit contenir au moins 6 caracteres.' },
          { status: 400 }
        );
      }
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
    const body = await request.json();
    const { id, actif } = body;

    if (!id || actif === undefined) {
      return NextResponse.json(
        { erreur: 'Identifiant et statut actif requis.' },
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
