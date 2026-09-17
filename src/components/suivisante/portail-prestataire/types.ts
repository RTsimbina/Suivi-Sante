// ─── Portail Prestataire — types partagés côté client ──────────────────────

export interface DonneesPortail {
  type: 'PRESTATAIRE' | 'ADMINISTRATEUR';
  message?: string;
  prestataire?: ProfilPrestataire;
  societes?: SocieteCliente[];
  kpis?: Kpis;
  derniersActes?: ActeApercu[];
}

export interface ProfilPrestataire {
  id: string;
  nom: string;
  type: string;
  typeLabel: string;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  nif: string | null;
  stat: string | null;
  statutJuridique: string | null;
  statut: string | null;
  actif: boolean;
}

export interface SocieteCliente {
  idLien: string;
  societeId: string;
  nom: string;
  conventionActive: boolean;
  dateLiaison: string;
  nbActes: number;
}

export interface Kpis {
  actesRealises: number;
  assuresPrisEnCharge: number;
  facturesEmises: number;
  facturesEnAttente: number;
  facturesRegles: number;
  montantFacture: number;
  montantRegule: number;
  montantRestant: number;
}

export interface ActeApercu {
  id: string;
  numeroDossier: string;
  typeDossier: string;
  typeLabel: string;
  statut: string;
  beneficiaire: string;
  dateReception: string;
  montantReclame: number;
  montantPaye: number;
  societe: { id: string; nom: string };
  assure: { nom: string; prenom: string; typeBeneficiaire: string } | null;
}

// ─── Barèmes ─────────────────────────────────────────────────────────────────

export interface BaremeItem {
  prestation: string;
  label: string;
  configure: boolean;
  actif: boolean;
  tauxCouverture: number | null;
  plafond: number | null;
  description: string | null;
}

export interface SocieteBaremes {
  societeId: string;
  nom: string;
  conventionActive: boolean;
  dateLiaison: string;
  baremes: BaremeItem[];
}

export interface AssureMinimal {
  id: string;
  nom: string;
  prenom: string;
  nSSMasque: string;
  typeBeneficiaire: string;
  actif: boolean;
  societe: { id: string; nom: string };
}

// ─── Actes ───────────────────────────────────────────────────────────────────

export interface ActeItem {
  id: string;
  numeroDossier: string;
  typeDossier: string;
  typeLabel: string;
  statut: string;
  statutLabel: string;
  beneficiaire: string;
  dateReception: string;
  dateSoins: string | null;
  montantReclame: number;
  montantValide: number | null;
  montantPaye: number | null;
  partPatient: number | null;
  motifRejet: string | null;
  societe: { id: string; nom: string };
  assure: { nom: string; prenom: string; typeBeneficiaire: string } | null;
}

export interface FiltreOption {
  value: string;
  label: string;
}

// ─── Factures ────────────────────────────────────────────────────────────────

export interface FactureItem {
  id: string;
  numeroFacture: string;
  date: string;
  periode: string;
  societe: { id: string; nom: string };
  typeLabel: string;
  montantFacture: number;
  montantRegule: number;
  solde: number;
  statutFacture: string;
  statutFactureLabel: string;
  statutDossier: string;
  dateReglement: string | null;
  referenceReglement: string | null;
}

export interface TotauxFactures {
  montantFacture: number;
  montantRegule: number;
  solde: number;
}
