/**
 * prestataire-doublons.ts — Détection de doublons prestataires et décision d'exception.
 *
 * Logique PURE (sans accès base) → testable unitairement.
 * La base ne fournit que les lignes candidates ; la décision est centralisée ici.
 *
 * Règles (spécification « Gestion des prestataires ») :
 *  - Unicité par défaut sur : NIF, Num STAT, e-mail, code prestataire, nom normalisé.
 *  - Doublon → HTTP 409 Conflict avec les informations déjà existantes affichées.
 *  - Exception possible UNIQUEMENT sur validation explicite d'un Administrateur
 *    (cas légitime : entités, établissements ou agences d'un même groupe de
 *    prestataires partageant certaines informations communes).
 *  - L'exception n'apporte qu'une dérogation ciblée, toujours tracée dans le
 *    Journal d'Audit ; elle ne désactive jamais les autres contrôles (formats,
 *    permissions, autres doublons) ni les contraintes pour les fiches normales.
 */

// ─── Champs soumis à l'unicité ──────────────────────────────────────────────

export const CHAMPS_DOUBLON = ['nif', 'stat', 'email', 'code', 'nom'] as const;
export type ChampDoublon = (typeof CHAMPS_DOUBLON)[number];

export const CHAMP_LABELS: Record<ChampDoublon, string> = {
  nif: 'NIF',
  stat: 'Num STAT',
  email: 'E-mail',
  code: 'Code prestataire',
  nom: 'Nom / Raison sociale',
};

// ─── Normalisation (cohérente avec la colonne nomNormalise en base) ─────────

/**
 * Normalise un nom / raison sociale :
 * minuscules, suppression des accents, ponctuation → espaces, espaces réduits.
 * Ex : « Clinique ABC - Antananarivo » → "clinique abc antananarivo".
 */
export function normaliserNom(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// ─── Types ──────────────────────────────────────────────────────────────────

/** Données candidates (déjà normalisées côté appelant) */
export interface DonneesPrestataireNormalisees {
  nom?: string | null;
  nomNormalise?: string | null;
  nif?: string | null;
  stat?: string | null;
  email?: string | null;
  code?: string | null;
}

/** Ligne minimale d'un prestataire existant (issue de la base) */
export interface PrestataireExistantMin {
  id: string;
  nom: string;
  code: string | null;
  nif: string | null;
  stat: string | null;
  email: string | null;
  nomNormalise: string | null;
}

/** Un doublon détecté : le champ, la valeur et la fiche qui la porte déjà */
export interface ConflitDoublon {
  champ: ChampDoublon;
  valeur: string;
  prestataireExistantId: string;
  prestataireExistantNom: string;
  prestataireExistantCode: string | null;
}

/** Exception de doublon déjà enregistrée en base (couverture champ + valeur) */
export interface ExceptionPreexistante {
  /** ID du prestataire dérogé (non utilisé par la logique de couverture) */
  prestataireId?: string;
  champ: string;
  valeur: string;
}

// ─── Détection ──────────────────────────────────────────────────────────────

function comparer(champ: ChampDoublon, valeurCandidate: string, existant: PrestataireExistantMin): string | null {
  switch (champ) {
    case 'nif': {
      // Comparaison insensible aux séparateurs et à la casse (ex. 4001-234-567 ≡ 4001234567)
      const nifExistant = (existant.nif || '').replace(/[\s.-]/g, '').toUpperCase();
      return nifExistant === valeurCandidate ? existant.nif : null;
    }
    case 'stat':
      return (existant.stat || '').replace(/\D/g, '') === valeurCandidate ? existant.stat : null;
    case 'email':
      return (existant.email || '').toLowerCase().trim() === valeurCandidate ? existant.email : null;
    case 'code':
      return (existant.code || '').toUpperCase().trim() === valeurCandidate ? existant.code : null;
    case 'nom': {
      const nomExistant = existant.nomNormalise ?? normaliserNom(existant.nom || '');
      return nomExistant === valeurCandidate ? existant.nom : null;
    }
    default:
      return null;
  }
}

function valeurCandidate(donnees: DonneesPrestataireNormalisees, champ: ChampDoublon): string | null {
  switch (champ) {
    case 'nif':
      return donnees.nif ? donnees.nif.toUpperCase().replace(/[\s.-]/g, '') : null;
    case 'stat':
      return donnees.stat ? donnees.stat.replace(/\D/g, '') : null;
    case 'email':
      return donnees.email ? donnees.email.toLowerCase().trim() : null;
    case 'code':
      return donnees.code ? donnees.code.toUpperCase().trim() : null;
    case 'nom':
      return donnees.nomNormalise ?? (donnees.nom ? normaliserNom(donnees.nom) : null);
    default:
      return null;
  }
}

/**
 * Détecte les doublons entre les données candidates et les prestataires existants.
 * `exclureId` évite qu'une fiche se compare à elle-même (modification).
 */
export function detecterDoublons(
  donnees: DonneesPrestataireNormalisees,
  existants: PrestataireExistantMin[],
  exclureId?: string
): ConflitDoublon[] {
  const conflits: ConflitDoublon[] = [];
  const vus = new Set<string>();

  for (const champ of CHAMPS_DOUBLON) {
    const valeur = valeurCandidate(donnees, champ);
    if (!valeur) continue;
    for (const existant of existants) {
      if (exclureId && existant.id === exclureId) continue;
      const valeurExiste = comparer(champ, valeur, existant);
      if (valeurExiste) {
        const cle = `${champ}|${valeur}|${existant.id}`;
        if (!vus.has(cle)) {
          vus.add(cle);
          conflits.push({
            champ,
            valeur,
            prestataireExistantId: existant.id,
            prestataireExistantNom: existant.nom,
            prestataireExistantCode: existant.code,
          });
        }
      }
    }
  }

  return conflits;
}

// ─── Décision ───────────────────────────────────────────────────────────────

export type DecisionDoublon =
  | { action: 'CREER_DIRECT' }
  | { action: 'BLOQUER_409'; conflits: ConflitDoublon[]; raison?: 'DOUBLONS' | 'MOTIF_REQUIS' }
  | { action: 'REFUSER_403'; conflits: ConflitDoublon[] }
  | { action: 'EXCEPTION_AUTORISEE'; conflits: ConflitDoublon[]; motif: string };

export interface ParametresDecision {
  conflits: ConflitDoublon[];
  /** Rôle de l'utilisateur qui soumet l'opération */
  roleDemandeur: string;
  /** L'utilisateur demande-t-il une exception de doublon ? */
  exceptionDemandee: boolean;
  /** Motif fourni (appartenance au même groupe, etc.) */
  motif?: string | null;
  /** Exceptions déjà validées pour CE prestataire (fiche déjà dérogée) */
  exceptionsPreexistantes?: ExceptionPreexistante[];
}

const MOTIF_MIN_LONGUEUR = 5;

/**
 * Décide du sort d'une création / modification face aux doublons détectés.
 *
 * - Aucun conflit (ou tous couverts par des exceptions déjà validées) → CREER_DIRECT.
 * - Conflits sans demande d'exception → BLOQUER_409 (l'appelant renvoie 409 + détails).
 * - Exception demandée par un non-Administrateur → REFUSER_403.
 * - Exception demandée sans motif substantiel → BLOQUER_409 (motif requis).
 * - Exception demandée par un Administrateur avec motif → EXCEPTION_AUTORISEE.
 */
export function resoudreDoublons(params: ParametresDecision): DecisionDoublon {
  const { conflits, roleDemandeur, exceptionDemandee, motif, exceptionsPreexistantes } = params;

  // 1. Conflits déjà couverts par une exception validée (même champ + même valeur)
  const couvertes = new Set(
    (exceptionsPreexistantes ?? []).map((e) => `${e.champ}|${e.valeur}`)
  );
  const conflitsRestants = conflits.filter(
    (c) => !couvertes.has(`${c.champ}|${c.valeur}`)
  );

  if (conflitsRestants.length === 0) {
    return { action: 'CREER_DIRECT' };
  }

  // 2. Sans demande d'exception → blocage standard 409
  if (!exceptionDemandee) {
    return { action: 'BLOQUER_409', conflits: conflitsRestants, raison: 'DOUBLONS' };
  }

  // 3. L'exception est réservée à l'Administrateur
  if (roleDemandeur !== 'ADMINISTRATEUR') {
    return { action: 'REFUSER_403', conflits: conflitsRestants };
  }

  // 4. Motif obligatoire (ex : appartenance au même groupe de prestataires)
  if (!motif || motif.trim().length < MOTIF_MIN_LONGUEUR) {
    return { action: 'BLOQUER_409', conflits: conflitsRestants, raison: 'MOTIF_REQUIS' };
  }

  // 5. Exception explicitement autorisée par un Administrateur, motif traçable
  return { action: 'EXCEPTION_AUTORISEE', conflits: conflitsRestants, motif: motif.trim() };
}

// ─── Construction de l'entrée d'audit pour une exception ────────────────────

export interface ContexteAuditException {
  prestataireId: string;
  prestataireNom: string;
  motif: string;
  valideParNom: string;
  valideParId: string;
  valideParRole: string;
  dateValidation: Date;
  groupeId?: string | null;
  groupeNom?: string | null;
}

/**
 * Métadonnées JSON tracées dans le Journal d'Audit pour une validation
 * d'exception : donnée en doublon, fiche existante, motif, Administrateur
 * ayant validé, son rôle, date et heure de validation.
 */
export function construireMetadonneesException(
  conflit: ConflitDoublon,
  ctx: ContexteAuditException
): string {
  return JSON.stringify({
    type: 'EXCEPTION_DOUBLON',
    donneeConcernee: CHAMP_LABELS[conflit.champ],
    champ: conflit.champ,
    valeurDoublon: conflit.valeur,
    prestataireConcerne: { id: ctx.prestataireId, nom: ctx.prestataireNom },
    prestataireExistant: {
      id: conflit.prestataireExistantId,
      nom: conflit.prestataireExistantNom,
      code: conflit.prestataireExistantCode,
    },
    motif: ctx.motif,
    validePar: { nom: ctx.valideParNom, id: ctx.valideParId, role: ctx.valideParRole },
    dateValidation: ctx.dateValidation.toISOString(),
    groupe: ctx.groupeId ? { id: ctx.groupeId, nom: ctx.groupeNom } : null,
  });
}

// ─── Message utilisateur pour un 409 ────────────────────────────────────────

export function formaterMessageDoublons(conflits: ConflitDoublon[]): string {
  const details = conflits
    .map(
      (c) =>
        `${CHAMP_LABELS[c.champ]} « ${c.valeur} » déjà utilisé(e) par ${c.prestataireExistantNom}${
          c.prestataireExistantCode ? ` (code ${c.prestataireExistantCode})` : ''
        }`
    )
    .join(' ; ');
  return `Des doublons ont été détectés : ${details}.`;
}
