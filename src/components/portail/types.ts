/**
 * types.ts — Types du portail client (découpage P2-01 de l'ancien monolithe
 * src/app/portail/page.tsx).
 */

export interface PortailDossier {
  id: string;
  numeroDossier: string;
  statut: string;
  typeDossier: string;
  beneficiaire: string;
  dateReception: string;
  dateSoins?: string | null;
  montantReclame: number;
  montantValide?: number | null;
  montantPaye?: number | null;
  partPatient?: number | null;
  datePaiement?: string | null;
  referencePaiement?: string | null;
  motifRejet?: string | null;
  assure?: { nom: string; prenom: string | null; typeBeneficiaire: string } | null;
}

/** P2-02 : métadonnées de pagination renvoyées par le backend. */
export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PortailData {
  type: 'PORTAIL_CLIENT' | 'CONTACT_ENTREPRISE';
  assure?: {
    id: string;
    nom: string;
    prenom: string | null;
    nSS?: string | null;
    matricule?: string | null;
    typeBeneficiaire: string;
    dateNaissance?: string | null;
    sexe?: string | null;
    dateEffet?: string | null;
    bareme?: number | null;
    telephone?: string | null;
    email?: string | null;
    adresse?: string | null;
    actif?: boolean;
    codeFamille?: string | null;
  };
  societe: { id: string; nom: string; adresse?: string | null; telephone?: string | null; email?: string | null };
  famille?: {
    id: string;
    nom: string;
    prenom: string | null;
    typeBeneficiaire: string;
    dateNaissance?: string | null;
    codeFamille?: string | null;
    actif?: boolean;
    _count?: { dossiers: number };
  }[];
  assures?: {
    id: string;
    nom: string;
    prenom: string | null;
    nSS?: string | null;
    matricule?: string | null;
    typeBeneficiaire: string;
    dateEffet?: string | null;
    actif?: boolean;
    nbDossiers?: number;
  }[];
  contrats: {
    id: string;
    reference: string;
    budgetAnnuel: number;
    budgetUtilise: number;
    dateDebut: string;
    dateFin: string;
    statut: string;
  }[];
  baremes?: {
    id: string;
    prestation: string;
    tauxCouverture: number;
    plafond: number;
    description?: string | null;
  }[];
  dossiers: PortailDossier[];
  pagination?: PaginationInfo;
  kpis: Record<string, number>;
}
