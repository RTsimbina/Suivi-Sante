import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { db } from '@/lib/db';
import { buildContext, validerParams, extrairePeriode, isRoleExterne, verifierAutorisationParam } from '@/lib/assistant/context';
import { listerQuestions, executerQuestion } from '@/lib/assistant/engine';
import type { AssistantContext, ParamOption } from '@/lib/assistant/types';
import { AssistantError } from '@/lib/assistant/types';
import { societesDuPrestataire } from '@/lib/assistant/results';
import { PARENT_TYPES } from '@/lib/prestations';
import type { RoleType } from '@/lib/auth-context';

// ─── API de l'Assistant IA à questions prédéfinies ───────────────────────────
//
// GET  /api/assistant   → questions du rôle + options de paramètres filtrées
// POST /api/assistant   → exécution d'une question (questionId + paramètres)
//
// Sécurité : rôle, périmètre et options proviennent du token NextAuth signé.
// Les options proposées au client sont déjà filtrées selon ses droits.

export async function GET(request: NextRequest) {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ erreur: 'Non authentifié. Veuillez vous reconnecter.' }, { status: 401 });
    }

    const ctx = buildContext(token);
    const listing = listerQuestions(ctx.role);

    // ─── Options de paramètres filtrées selon le rôle ────────────────────────
    const options: Partial<Record<string, ParamOption[]>> = {};

    if (!isRoleExterne(ctx.role)) {
      // Rôles internes : référentiel complet (comportement plateforme)
      const [societes, prestataires, assures] = await Promise.all([
        db.societe.findMany({ orderBy: { nom: 'asc' }, select: { id: true, nom: true }, take: 500 }),
        db.prestataire.findMany({
          where: { actif: true },
          orderBy: { nom: 'asc' },
          select: { id: true, nom: true },
          take: 500,
        }),
        db.assure.findMany({
          orderBy: { createdAt: 'desc' },
          select: { id: true, nom: true, prenom: true, matricule: true },
          take: 500,
        }),
      ]);
      options.SOCIETE = societes.map((s) => ({ id: s.id, label: s.nom }));
      options.PRESTATAIRE = prestataires.map((p) => ({ id: p.id, label: p.nom }));
      options.ASSURE = assures.map((a) => ({
        id: a.id,
        label: [a.nom, a.prenom].filter(Boolean).join(' ') + (a.matricule ? ` (${a.matricule})` : ''),
      }));
    } else if (ctx.role === 'CONTACT_ENTREPRISE' && ctx.societeId) {
      // Entreprise : ses propres assurés uniquement
      const assures = await db.assure.findMany({
        where: { societeId: ctx.societeId },
        orderBy: [{ typeBeneficiaire: 'asc' }, { nom: 'asc' }],
        select: { id: true, nom: true, prenom: true, matricule: true },
        take: 500,
      });
      options.ASSURE = assures.map((a) => ({
        id: a.id,
        label: [a.nom, a.prenom].filter(Boolean).join(' ') + (a.matricule ? ` (${a.matricule})` : ''),
      }));
    } else if (ctx.role === 'PRESTATAIRE' && ctx.prestataireId) {
      // Prestataire : ses sociétés conventionnées uniquement
      const ids = await societesDuPrestataire(ctx.prestataireId);
      const societes = ids.length
        ? await db.societe.findMany({ where: { id: { in: ids } }, orderBy: { nom: 'asc' }, select: { id: true, nom: true } })
        : [];
      options.SOCIETE = societes.map((s) => ({ id: s.id, label: s.nom }));
    }

    // Statuts réels de la plateforme
    options.STATUT = [
      { id: 'RECU', label: 'Reçu' },
      { id: 'EN_ANALYSE', label: 'En analyse' },
      { id: 'VALIDE', label: 'Validé' },
      { id: 'EN_COMPTABILITE', label: 'En comptabilité' },
      { id: 'EN_PAIEMENT', label: 'En paiement' },
      { id: 'PAYE', label: 'Payé' },
      { id: 'REJETE', label: 'Rejeté' },
    ];

    // Actes (types parents de barème — source de vérité src/lib/prestations.ts)
    options.ACTE = PARENT_TYPES.map((p) => ({ id: p, label: p }));

    // Années : dérivées des données (5 dernières années civiles au minimum)
    const now = new Date().getFullYear();
    options.ANNEE = [2, 1, 0].map((k) => ({ id: String(now - k), label: String(now - k) }));

    return NextResponse.json({
      ...listing,
      options,
    });
  } catch (error) {
    if (error instanceof AssistantError) {
      return NextResponse.json({ erreur: error.message }, { status: error.status });
    }
    console.error('[ASSISTANT] Erreur GET :', error);
    return NextResponse.json({ erreur: 'Erreur serveur lors du chargement de l\u2019assistant.' }, { status: 500 });
  }
}

// ─── POST : exécution d'une question ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ erreur: 'Non authentifié. Veuillez vous reconnecter.' }, { status: 401 });
    }

    let body: { questionId?: unknown; params?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ erreur: 'Requête invalide.' }, { status: 400 });
    }

    if (typeof body.questionId !== 'string' || body.questionId.length > 80) {
      return NextResponse.json({ erreur: 'Identifiant de question requis.' }, { status: 400 });
    }

    // Paramètres bruts : uniquement des chaînes acceptées
    const bruts = (typeof body.params === 'object' && body.params !== null ? body.params : {}) as Record<string, unknown>;
    const parametres: Record<string, string> = {};
    for (const [k, v] of Object.entries(bruts)) {
      if (typeof v === 'string' && v.length <= 200) parametres[k] = v;
    }

    const ctx = buildContext(token);

    // Garde supplémentaire : pour les rôles internes qui disposent du
    // paramètre SOCIETE/PRESTATAIRE/ASSURE, les identifiants sont vérifiés
    // en base dans les implémentations ; ici on borne le volume des valeurs.
    const resultat = await executerQuestion(ctx, body.questionId, parametres);

    return NextResponse.json(resultat);
  } catch (error) {
    if (error instanceof AssistantError) {
      return NextResponse.json({ erreur: error.message }, { status: error.status });
    }
    console.error('[ASSISTANT] Erreur POST :', error);
    return NextResponse.json(
      { erreur: 'Erreur serveur lors de l\u2019exécution de la question.' },
      { status: 500 }
    );
  }
}
