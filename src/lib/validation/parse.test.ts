// ─── Tests des helpers de parsing API (parseJsonBody) ───────────────────────
// Vérifie le flux complet : corps malformé → 400, données invalides → 400
// avec détail par champ, données valides → data typée, champs inconnus
// supprimés.

import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { parseJsonBody } from "./parse";
import { utilisateurPatchSchema } from "./index";
import { z } from "zod";

function makeRequest(body: string | unknown): NextRequest {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return new NextRequest("http://localhost:3000/api/test", {
    method: "POST",
    body: raw,
    headers: { "content-type": "application/json" },
  });
}

describe("parseJsonBody", () => {
  const schema = z.object({ nom: z.string().min(2) });

  it("retourne les données validées pour un corps correct", async () => {
    const r = await parseJsonBody(makeRequest({ nom: "RAKOTO" }), schema);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.nom).toBe("RAKOTO");
  });

  it("retourne une réponse 400 pour un corps JSON malformé", async () => {
    const r = await parseJsonBody(makeRequest("{pas du json"), schema);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.response.status).toBe(400);
  });

  it("retourne une réponse 400 avec le détail par champ en cas d'échec", async () => {
    const r = await parseJsonBody(makeRequest({ nom: "A" }), schema);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.response.status).toBe(400);
      const json = (await r.response.json()) as {
        error: string;
        details: { champ: string; message: string }[];
      };
      expect(json.error).toBe("Données invalides");
      expect(json.details[0].champ).toBe("nom");
    }
  });

  it("application de bout en bout : le PATCH utilisateur supprime les champs inconnus", async () => {
    const r = await parseJsonBody(
      makeRequest({ id: "abc", actif: false, password: "pirate" }),
      utilisateurPatchSchema
    );
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ id: "abc", actif: false });
  });
});
