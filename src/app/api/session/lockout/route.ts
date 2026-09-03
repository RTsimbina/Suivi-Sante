import { NextRequest, NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/validation/parse";
import { lockoutCheckSchema } from "@/lib/validation";

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