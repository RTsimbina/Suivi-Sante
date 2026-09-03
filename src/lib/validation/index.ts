// ─── Point d'entrée central de la validation API ────────────────────────────
// Chaque route API importe son schéma depuis ici :
//   import { dossierCreateSchema } from "@/lib/validation";
//   import { parseJsonBody } from "@/lib/validation/parse";

export * from "./common";
export * from "./dossiers";
export * from "./finances";
export * from "./referentiels";
export * from "./imports";
export * from "./divers";
