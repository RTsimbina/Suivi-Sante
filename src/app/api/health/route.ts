import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const checks: { name: string; ok: boolean; detail?: string }[] = [];

  // 1. Variables d'environnement
  const hasDbUrl = !!process.env.DATABASE_URL;
  const hasSecret = !!process.env.NEXTAUTH_SECRET;
  const hasSetupToken = !!process.env.SETUP_TOKEN;

  checks.push({
    name: 'DATABASE_URL',
    ok: hasDbUrl,
    detail: hasDbUrl
      ? `${process.env.DATABASE_URL!.slice(0, 40)}...`
      : 'MANQUANTE — ajoutez-la dans Vercel → Settings → Environment Variables',
  });
  checks.push({
    name: 'NEXTAUTH_SECRET',
    ok: hasSecret,
    detail: hasSecret ? 'Configurée' : 'MANQUANTE — requise pour l\'authentification',
  });
  checks.push({
    name: 'SETUP_TOKEN',
    ok: hasSetupToken,
    detail: hasSetupToken ? 'Configuré' : 'MANQUANTE — requise pour /api/setup',
  });

  // 2. Test de connexion BDD
  if (hasDbUrl) {
    try {
      await db.$queryRaw`SELECT 1 as ok`;

      // Vérifier si les tables ont des données
      const userCount = await db.utilisateur.count();

      checks.push({
        name: 'Connexion PostgreSQL',
        ok: true,
        detail: 'Connexion réussie',
      });
      checks.push({
        name: 'Table Utilisateur',
        ok: userCount > 0,
        detail: userCount > 0
          ? `${userCount} utilisateur(s) trouvé(s)`
          : 'Table VIDE — appelez /api/setup?token=VOTRE_TOKEN',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue';
      checks.push({
        name: 'Connexion PostgreSQL',
        ok: false,
        detail: msg.slice(0, 200),
      });
    }
  } else {
    checks.push({
      name: 'Connexion PostgreSQL',
      ok: false,
      detail: 'Impossible de tester — DATABASE_URL manquante',
    });
  }

  const allOk = checks.every(c => c.ok);

  return NextResponse.json({
    status: allOk ? 'ok' : 'erreur',
    checks,
  }, { status: allOk ? 200 : 503 });
}