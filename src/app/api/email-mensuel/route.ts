import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/authorize";
import { envoyerRapportMensuel, envoyerTestEmail } from "@/lib/email-mensuel";
import { verifierSMTP, smtpEstConfigure } from "@/lib/email";

// GET: Vérifier la connexion SMTP
export async function GET(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'test') {
    const email = searchParams.get('email');
    if (!email) {
      return NextResponse.json({ erreur: "Paramètre 'email' requis pour le test" }, { status: 400 });
    }

    if (!smtpEstConfigure()) {
      return NextResponse.json(
        { erreur: "SMTP non configure. Ajoutez SMTP_HOST, SMTP_PORT, SMTP_USER et SMTP_PASS dans .env" },
        { status: 503 }
      );
    }

    const result = await envoyerTestEmail(email);
    if (result.ok) {
      return NextResponse.json({ message: `Email de test envoyé à ${email}` });
    }
    return NextResponse.json({ erreur: `Échec de l'envoi : ${result.erreur}` }, { status: 500 });
  }

  // Vérification SMTP
  const smtp = await verifierSMTP();
  return NextResponse.json(smtp);
}

// POST: Déclencher manuellement l'envoi mensuel
export async function POST(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;

  if (!smtpEstConfigure()) {
    return NextResponse.json(
      { erreur: "SMTP non configure. Ajoutez SMTP_HOST, SMTP_PORT, SMTP_USER et SMTP_PASS dans .env" },
      { status: 503 }
    );
  }

  try {
    const result = await envoyerRapportMensuel();
    return NextResponse.json({
      message: `Rapport mensuel envoyé à ${result.envoyes} société(s)`,
      ...result,
    });
  } catch (error) {
    console.error('[EMAIL MENSUEL] Erreur:', error);
    return NextResponse.json(
      { erreur: "Erreur lors de l'envoi du rapport mensuel" },
      { status: 500 }
    );
  }
}