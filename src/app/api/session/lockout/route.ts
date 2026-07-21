import { NextRequest, NextResponse } from "next/server";

// ── C-04 : Cette route est dorénavant sous /api/session/ (protégé par le middleware JWT) ──
// Ancien emplacement : /api/auth/check-lockout (contournait le middleware car sous /api/auth/)
// L'ancienne route a été supprimée.

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email) {
      // Toujours retourner la même réponse pour éviter l'énumération
      return NextResponse.json({ locked: false, remainingMs: 0 }, { status: 200 });
    }

    const emailStr = String(email).toLowerCase().trim();

    // Vérifier la longueur raisonnable pour éviter l'abus
    if (emailStr.length > 254) {
      return NextResponse.json({ locked: false, remainingMs: 0 }, { status: 200 });
    }

    // Vérifier le format email basique
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
      return NextResponse.json({ locked: false, remainingMs: 0 }, { status: 200 });
    }

    // Importer dynamiquement pour éviter les dépendances circulaires
    const { isLockedOut } = await import("@/lib/auth");
    const status = await isLockedOut(emailStr);

    // Retourner le même format de réponse pour éviter les différences de timing
    return NextResponse.json(status, { status: 200 });
  } catch {
    // Ne jamais exposer d'erreurs internes
    return NextResponse.json({ locked: false, remainingMs: 0 }, { status: 200 });
  }
}