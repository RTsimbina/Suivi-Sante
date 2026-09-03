// ─── Schémas Zod — Imports Excel (formData) ─────────────────────────────────
// La validation par LIGNE Excel (colonnes, doublons, plafonds) est métier et
// reste dans les routes ; ici on valide le conteneur : présence du fichier,
// extension, taille, et les champs texte accompagnant le formulaire.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { categorieDossierSchema } from "./common";

const TAILLE_MAX = 15 * 1024 * 1024; // 15 Mo

export const fichierExcelSchema = z
  .instanceof(File, { message: "Un fichier Excel (.xlsx / .xls) est requis" })
  .refine((f) => f.size > 0, "Le fichier est vide")
  .refine((f) => f.size <= TAILLE_MAX, "Le fichier dépasse la taille maximale de 15 Mo")
  .refine(
    (f) => /\.(xlsx|xls)$/i.test(f.name),
    "Seuls les fichiers .xlsx et .xls sont acceptés"
  );

/** POST /api/import — import de dossiers (ISA / SAGE / EXCEL). */
export const importDossiersSchema = z.object({
  file: fichierExcelSchema,
  source: z.enum(["ISA", "SAGE", "EXCEL"]).default("EXCEL"),
  categorie: categorieDossierSchema.optional(),
});

/** POST /api/assures/import, /api/comptabilite/import-sage, */
/** /api/comptabilite/import-suivi, /api/technique/import-isa : fichier seul. */
export const importFichierSeulSchema = z.object({
  file: fichierExcelSchema,
});
