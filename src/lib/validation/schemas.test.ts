// ─── Tests des schémas Zod centralisés ──────────────────────────────────────
// Vérifie les correctifs de l'audit :
//   - montants négatifs refusés partout (avant : acceptés sur certaines API)
//   - typeBeneficiaire / typeDossier / statuts validés contre leur énumération
//   - PATCH : champs inconnus supprimés, montants non négatifs
//   - politique mot de passe homogène entre toutes les routes
//   - coercion numérique : "500" accepté, "abc" refusé (plus d'erreur 500 Prisma)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  dossierCreateSchema,
  dossierUpdateSchema,
  appelFondsCreateSchema,
  appelFondsUpdateSchema,
  contratCreateSchema,
  assureCreateSchema,
  utilisateurCreateSchema,
  utilisateurPatchSchema,
  baremeCreateSchema,
  baremePatchSchema,
  courrielUpdateSchema,
} from "./index";

const VALID_DOSSIER = {
  numeroDossier: "DOS-2026-0001",
  dateReception: "2026-01-15",
  societeId: "cm3abc123",
  beneficiaire: "RASOANAIVO Jean",
  typeDossier: "CONSULTATION_SIMPLE",
};

describe("dossierCreateSchema", () => {
  it("accepte un dossier valide", () => {
    const r = dossierCreateSchema.safeParse(VALID_DOSSIER);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.montantReclame).toBe(0); // défaut
      expect(r.data.source).toBe("MANUEL"); // défaut
      expect(r.data.dateReception).toBeInstanceOf(Date);
    }
  });

  it("refuse un montant réclamé négatif", () => {
    const r = dossierCreateSchema.safeParse({ ...VALID_DOSSIER, montantReclame: -5000 });
    expect(r.success).toBe(false);
  });

  it("coercition : accepte '500' (chaîne) et refuse 'abc'", () => {
    const ok = dossierCreateSchema.safeParse({ ...VALID_DOSSIER, montantReclame: "500" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.montantReclame).toBe(500);

    const ko = dossierCreateSchema.safeParse({ ...VALID_DOSSIER, montantReclame: "abc" });
    expect(ko.success).toBe(false);
  });

  it("refuse un typeDossier hors liste (avant : toute chaîne passait)", () => {
    const r = dossierCreateSchema.safeParse({ ...VALID_DOSSIER, typeDossier: "MONTAGE_IKEA" });
    expect(r.success).toBe(false);
  });

  it("refuse une categorieDossier inconnue", () => {
    const r = dossierCreateSchema.safeParse({ ...VALID_DOSSIER, categorieDossier: "AUTRE" });
    expect(r.success).toBe(false);
  });

  it("refuse une date invalide (avant : Invalid Date → 500 Prisma)", () => {
    const r = dossierCreateSchema.safeParse({ ...VALID_DOSSIER, dateReception: "n'importe quoi" });
    expect(r.success).toBe(false);
  });
});

describe("dossierUpdateSchema (PATCH)", () => {
  it("supprime les champs inconnus (whitelist — impossible de modifier montantReclame)", () => {
    const r = dossierUpdateSchema.safeParse({
      montantValide: 1000,
      montantReclame: 999_999, // champ interdit
      historique: "pirate", // champ interdit
      numeroDossier: "HACK", // champ interdit
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({ montantValide: 1000 });
    }
  });

  it("refuse un montantValide négatif (avant : aucun contrôle sur le PATCH)", () => {
    const r = dossierUpdateSchema.safeParse({ montantValide: -1 });
    expect(r.success).toBe(false);
  });

  it("refuse un statut hors liste", () => {
    const r = dossierUpdateSchema.safeParse({ statut: "EN_ATTENTE_CLIENT" });
    expect(r.success).toBe(false);
  });

  it("accepte un statut valide", () => {
    const r = dossierUpdateSchema.safeParse({ statut: "EN_ANALYSE" });
    expect(r.success).toBe(true);
  });
});

describe("appelFondsCreateSchema", () => {
  const VALID = {
    contratId: "cm3contrat1",
    montant: 100_000,
    dateAppel: "2026-02-01",
  };

  it("accepte un appel de fonds valide", () => {
    expect(appelFondsCreateSchema.safeParse(VALID).success).toBe(true);
  });

  it("FIX majeur : refuse un montant négatif (avant : accepté, diminuait le budget)", () => {
    const r = appelFondsCreateSchema.safeParse({ ...VALID, montant: -50_000 });
    expect(r.success).toBe(false);
  });

  it("refuse un montant nul", () => {
    const r = appelFondsCreateSchema.safeParse({ ...VALID, montant: 0 });
    expect(r.success).toBe(false);
  });
});

describe("appelFondsUpdateSchema (PATCH)", () => {
  it("refuse un statut hors liste et un montant négatif", () => {
    expect(appelFondsUpdateSchema.safeParse({ statut: "PAYE" }).success).toBe(false);
    expect(appelFondsUpdateSchema.safeParse({ montant: -10 }).success).toBe(false);
  });

  it("accepte statut ∈ [EN_ATTENTE, REGLE, ANNULE]", () => {
    expect(appelFondsUpdateSchema.safeParse({ statut: "REGLE" }).success).toBe(true);
  });
});

describe("contratCreateSchema", () => {
  const VALID = {
    societeId: "cm3societe1",
    reference: "CTR-2026-001",
    budgetAnnuel: 12_000_000,
    dateDebut: "2026-01-01",
    dateFin: "2026-12-31",
  };

  it("FIX : refuse un budgetAnnuel négatif (avant : accepté)", () => {
    expect(contratCreateSchema.safeParse({ ...VALID, budgetAnnuel: -1 }).success).toBe(false);
  });

  it("FIX : refuse un budgetAnnuel non numérique (avant : NaN passait)", () => {
    expect(contratCreateSchema.safeParse({ ...VALID, budgetAnnuel: "beaucoup" }).success).toBe(false);
  });

  it("refuse dateFin <= dateDebut", () => {
    const r = contratCreateSchema.safeParse({ ...VALID, dateFin: "2025-12-31" });
    expect(r.success).toBe(false);
  });

  it("refuse un statut inconnu (avant : remplacé silencieusement par ACTIF)", () => {
    expect(contratCreateSchema.safeParse({ ...VALID, statut: "GELÉ" }).success).toBe(false);
  });
});

describe("assureCreateSchema", () => {
  const VALID = { societeId: "cm3societe1", nom: "RAKOTO Ampasimbola" };

  it("accepte un assuré minimal (typeBeneficiaire par défaut ASSURE)", () => {
    const r = assureCreateSchema.safeParse(VALID);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.typeBeneficiaire).toBe("ASSURE");
  });

  it("FIX : refuse un typeBeneficiaire hors liste (VOISIN, etc.)", () => {
    expect(assureCreateSchema.safeParse({ ...VALID, typeBeneficiaire: "VOISIN" }).success).toBe(false);
  });

  it("accepte CONJOINT / ENFANT", () => {
    expect(assureCreateSchema.safeParse({ ...VALID, typeBeneficiaire: "CONJOINT" }).success).toBe(true);
    expect(assureCreateSchema.safeParse({ ...VALID, typeBeneficiaire: "ENFANT" }).success).toBe(true);
  });

  it("FIX incohérence : refuse un sexe hors [M, F] (avant : chaîne libre)", () => {
    expect(assureCreateSchema.safeParse({ ...VALID, sexe: "Masculin" }).success).toBe(false);
    expect(assureCreateSchema.safeParse({ ...VALID, sexe: "M" }).success).toBe(true);
  });

  it("FIX : refuse un barème hors [0, 1] (avant : tout float passait)", () => {
    expect(assureCreateSchema.safeParse({ ...VALID, bareme: 80 }).success).toBe(false);
    expect(assureCreateSchema.safeParse({ ...VALID, bareme: 0.8 }).success).toBe(true);
  });
});

describe("utilisateurCreateSchema", () => {
  it("accepte un utilisateur valide", () => {
    const r = utilisateurCreateSchema.safeParse({
      email: "agent@exemple.com",
      nom: "Agent Accueil",
      password: "motdepasse1",
      role: "ACCUEIL",
    });
    expect(r.success).toBe(true);
  });

  it("refuse un mot de passe faible (homogène sur toutes les routes compte)", () => {
    const base = { email: "a@b.com", nom: "X", role: "ACCUEIL" as const };
    expect(utilisateurCreateSchema.safeParse({ ...base, password: "court1" }).success).toBe(false);
    expect(utilisateurCreateSchema.safeParse({ ...base, password: "sanschiffre" }).success).toBe(false);
    expect(utilisateurCreateSchema.safeParse({ ...base, password: "12345678" }).success).toBe(false);
  });

  it("refuse un rôle hors liste", () => {
    const r = utilisateurCreateSchema.safeParse({
      email: "a@b.com", nom: "X", password: "motdepasse1", role: "SUPERADMIN",
    });
    expect(r.success).toBe(false);
  });
});

describe("utilisateurPatchSchema", () => {
  it("FIX : refuse actif='false' en chaîne (avant : truthy envoyé à Prisma)", () => {
    expect(utilisateurPatchSchema.safeParse({ id: "x", actif: "false" }).success).toBe(false);
    expect(utilisateurPatchSchema.safeParse({ id: "x", actif: false }).success).toBe(true);
  });
});

describe("baremeCreateSchema", () => {
  const VALID = { societeId: "cm3s1", prestation: "PHARMACIE", tauxCouverture: 80, plafond: 500_000 };

  it("accepte un barème valide (parent ou sous-type)", () => {
    expect(baremeCreateSchema.safeParse(VALID).success).toBe(true);
    expect(baremeCreateSchema.safeParse({ ...VALID, prestation: "DENTAIRES_PROTHESE" }).success).toBe(true);
  });

  it("refuse un plafond nul ou négatif (incohérence unifiée)", () => {
    expect(baremeCreateSchema.safeParse({ ...VALID, plafond: 0 }).success).toBe(false);
    expect(baremeCreateSchema.safeParse({ ...VALID, plafond: -100 }).success).toBe(false);
  });

  it("refuse un taux hors [0, 100]", () => {
    expect(baremeCreateSchema.safeParse({ ...VALID, tauxCouverture: 150 }).success).toBe(false);
  });
});

describe("baremePatchSchema", () => {
  it("FIX : refuse active='false' en chaîne (avant : réactivait le barème)", () => {
    expect(baremePatchSchema.safeParse({ id: "x", active: "false" }).success).toBe(false);
    expect(baremePatchSchema.safeParse({ id: "x", active: false }).success).toBe(true);
  });
});

describe("courrielUpdateSchema (PATCH)", () => {
  it("FIX : refuse un montant négatif (avant : aucun contrôle sur le PATCH)", () => {
    expect(courrielUpdateSchema.safeParse({ montant: -1000 }).success).toBe(false);
  });

  it("accepte un montant positif ou null", () => {
    expect(courrielUpdateSchema.safeParse({ montant: 25_000 }).success).toBe(true);
    expect(courrielUpdateSchema.safeParse({ montant: null }).success).toBe(true);
  });

  it("refuse un statut hors liste", () => {
    expect(courrielUpdateSchema.safeParse({ statut: "ARCHIVE" }).success).toBe(false);
  });
});
