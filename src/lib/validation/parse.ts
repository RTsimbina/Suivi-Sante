// ─── Helpers de validation Zod pour les routes API ──────────────────────────
// Toutes les routes API utilisent ces helpers pour valider le corps des
// requêtes AVANT tout traitement métier (cf. correction audit : validation
// centralisée au lieu de vérifications manuelles hétérogènes).
//
// Usage type dans une route :
//
//   const parsed = await parseJsonBody(request, dossierCreateSchema);
//   if (!parsed.success) return parsed.response;
//   const data = parsed.data; // données typées, validées, champs inconnus supprimés
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import type { ZodType, ZodError } from "zod";

export type ParseSuccess<T> = { success: true; data: T };
export type ParseFailure = { success: false; response: NextResponse };
export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

/** Format d'erreur normalisé : { error, details[] } avec statut 400. */
export function validationErrorResponse(error: ZodError): NextResponse {
  return NextResponse.json(
    {
      error: "Données invalides",
      details: error.issues.map((issue) => ({
        champ: issue.path.join(".") || "(racine)",
        message: issue.message,
        code: issue.code,
      })),
    },
    { status: 400 }
  );
}

/**
 * Lit et valide le corps JSON d'une requête avec un schéma Zod.
 * - corps absent / JSON malformé → 400
 * - données non conformes au schéma → 400 avec le détail par champ
 * - champs inconnus → supprimés (protection contre l'injection de champs)
 */
export async function parseJsonBody<T>(
  request: NextRequest,
  schema: ZodType<T>
): Promise<ParseResult<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Corps de requête JSON invalide" },
        { status: 400 }
      ),
    };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    return { success: false, response: validationErrorResponse(result.error) };
  }
  return { success: true, data: result.data };
}

/**
 * Valide les champs texte d'un FormData (imports Excel : file, source, categorie...).
 * Le fichier lui-même reste un File brut (la validation par ligne Excel est
 * métier et reste dans la route).
 */
export async function parseFormData<T>(
  request: NextRequest,
  schema: ZodType<T>
): Promise<ParseResult<T>> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Formulaire (multipart/form-data) invalide" },
        { status: 400 }
      ),
    };
  }
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    raw[key] = value;
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { success: false, response: validationErrorResponse(result.error) };
  }
  return { success: true, data: result.data };
}

/**
 * Valide les paramètres d'URL (?id=..., ?page=...).
 */
export function parseSearchParams<T>(
  request: NextRequest,
  schema: ZodType<T>
): ParseResult<T> {
  const { searchParams } = new URL(request.url);
  const raw: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    raw[key] = value;
  });
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { success: false, response: validationErrorResponse(result.error) };
  }
  return { success: true, data: result.data };
}
