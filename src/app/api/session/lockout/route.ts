import { NextRequest, NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/validation/parse";
import { lockoutCheckSchema } from "@/lib/validation";
import { limiterRouteSensible } from "@/lib/route-rate-limit";

// ── C-04 : Cette route est dorénavant sous /api/session/ (protégé par le middleware JWT) ──
// Ancien emplacement : /api/auth/check-lockout (contournait le middleware car sous /api/auth/)
// L'ancienne route a été supprimée.

export async function POST(request: NextRequest) {
  try {
    // ─── Validation Zod centralisée (format email, ≤ 254 caractères) ────────
    const parsed = await parseJsonBody(request, lockoutCheckSchema);
    if (!parsed.success) {
      // Toujours retourner la même réponse pour éviter l'énumération
      return NextResponse.json({ locked: false, remainingMs: 0 }, { status: 200 });
    }
    const emailStr = parsed.data.email.toLowerCase();

    // ─── P1 : limitation par IP ET par e-mail déclaré ────────────────────────
    // L'état de verrouillage ne doit pas devenir un oracle interrogeable en
    // masse : les rafales sont coupées en 429 (message unique, clé construite
    // sur l'e-mail FOURNI — aucune énumération), l'usage légitime passe.
    const limite = await limiterRouteSensible(request.headers, {
      prefixe: 'lockout',
      ip: {
        envLimite: 'LOCKOUT_CHECK_IP_LIMIT',
        limiteDefaut: 20,
        envFenetre: 'LOCKOUT_CHECK_IP_WINDOW',
        fenetreDefaut: 60,
      },
      identite: {
        envLimite: 'LOCKOUT_CHECK_EMAIL_LIMIT',
        limiteDefaut: 5,
        envFenetre: 'LOCKOUT_CHECK_EMAIL_WINDOW',
        fenetreDefaut: 60,
        valeur: emailStr,
      },
    });
    if (!limite.ok) return limite.reponse;

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