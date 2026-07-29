// ─── Types de Prestation — Source de vérité ─────────────────────────────────
// Hierarchy: PARENT → [sous-types]
// Dossier.typeDossier  = sous-type  (ex: HOSPITALISATION_CHIRURGICAL)
// Bareme.prestation    = parent     (ex: HOSPITALISATION)
// ─────────────────────────────────────────────────────────────────────────────

// ─── Structure hiérarchique ─────────────────────────────────────────────────

export const PRESTATION_HIERARCHY: Record<string, string[]> = {
  HOSPITALISATION: ['CHIRURGICAL', 'MEDICAL'],
  CONSULTATION: ['SPECIALISE', 'PRE_NATAL', 'SIMPLE'],
  EXAMEN: [],
  ACCOUCHEMENT: ['CHIRURGICAL', 'NORMAL'],
  IMAGERIE: [],
  OPTIQUE: [],
  PHARMACIE: [],
  DENTAIRES: ['SOIN', 'DETARTRAGE', 'EXTRACTION', 'PROTHESE', 'ORTHODONTIE'],
} as const;

// ─── Listes plates ──────────────────────────────────────────────────────────

/** Types parent (pour Bareme.prestation) */
export const PARENT_TYPES: readonly string[] = Object.keys(PRESTATION_HIERARCHY);

/** Tous les sous-types (pour Dossier.typeDossier) */
export const ALL_SOUS_TYPES: string[] = [];
for (const [parent, children] of Object.entries(PRESTATION_HIERARCHY)) {
  if (children.length === 0) {
    ALL_SOUS_TYPES.push(parent);
  } else {
    for (const child of children) {
      ALL_SOUS_TYPES.push(`${parent}_${child}`);
    }
  }
}

// ─── Labels ─────────────────────────────────────────────────────────────────

/** Label pour un type parent */
export const PARENT_LABELS: Record<string, string> = {
  HOSPITALISATION: 'Hospitalisation',
  CONSULTATION: 'Consultation',
  EXAMEN: 'Examen',
  ACCOUCHEMENT: 'Accouchement',
  IMAGERIE: 'Imagerie',
  OPTIQUE: 'Optique',
  PHARMACIE: 'Pharmacie',
  DENTAIRES: 'Dentaires',
};

/** Label pour un sous-type complet (ex: HOSPITALISATION_CHIRURGICAL → 'Hospitalisation - Chirurgical') */
export const SOUS_TYPE_LABELS: Record<string, string> = {};
for (const [parent, children] of Object.entries(PRESTATION_HIERARCHY)) {
  if (children.length === 0) {
    SOUS_TYPE_LABELS[parent] = PARENT_LABELS[parent];
  } else {
    for (const child of children) {
      const key = `${parent}_${child}`;
      const childLabel = child.charAt(0) + child.slice(1).toLowerCase().replace(/_/g, ' ');
      SOUS_TYPE_LABELS[key] = `${PARENT_LABELS[parent]} - ${childLabel}`;
    }
  }
}

// ─── Couleurs (pour les badges) ─────────────────────────────────────────────

export const PRESTATION_COLORS: Record<string, string> = {
  HOSPITALISATION: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  CONSULTATION: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  EXAMEN: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  ACCOUCHEMENT: 'bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300',
  IMAGERIE: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  OPTIQUE: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300',
  PHARMACIE: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  DENTAIRES: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
};

/** Couleur pour un sous-type (hérite de son parent) */
export function getSousTypeColor(sousType: string): string {
  const parent = getParentType(sousType);
  return PRESTATION_COLORS[parent] || 'bg-muted text-muted-foreground';
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extrait le type parent à partir d'un sous-type.
 * Gère la compatibilité ascendante avec les anciens types plats.
 *
 * Exemples :
 *   'HOSPITALISATION_CHIRURGICAL' → 'HOSPITALISATION'
 *   'CONSULTATION'                → 'CONSULTATION'  (type sans sous-type)
 *   'MATERNITE'                   → 'ACCOUCHEMENT'  (ancien type → nouveau parent)
 *   'CHIRURGIE'                   → 'HOSPITALISATION' (ancien type → meilleur parent)
 *   'SOINS DENTAIRES'             → 'DENTAIRES'     (ancien type → nouveau parent)
 */
export function getParentType(sousType: string): string {
  if (!sousType) return '';

  // 1. Déjà un parent valide (ex: EXAMEN, PHARMACIE)
  if (PARENT_TYPES.includes(sousType as any)) return sousType;

  // 2. Sous-type avec séparateur _ (ex: HOSPITALISATION_CHIRURGICAL)
  const parts = sousType.split('_');
  if (parts.length >= 2) {
    const candidate = parts[0];
    if (PARENT_TYPES.includes(candidate as any)) return candidate;
  }

  // 3. Compatibilité ascendante : anciens types plats
  const LEGACY_MAP: Record<string, string> = {
    MATERNITE: 'ACCOUCHEMENT',
    CHIRURGIE: 'HOSPITALISATION',
    'SOINS DENTAIRES': 'DENTAIRES',
  };
  if (LEGACY_MAP[sousType]) return LEGACY_MAP[sousType];

  // 4. Fallback : retourner tel quel
  return sousType;
}

/**
 * Label lisible pour n'importe quel type (parent, sous-type, ou ancien type).
 */
export function getPrestationLabel(type: string): string {
  if (!type) return '';
  // Sous-type
  if (SOUS_TYPE_LABELS[type]) return SOUS_TYPE_LABELS[type];
  // Parent
  if (PARENT_LABELS[type]) return PARENT_LABELS[type];
  // Anciens types (compatibilité)
  const LEGACY_LABELS: Record<string, string> = {
    MATERNITE: 'Maternité',
    CHIRURGIE: 'Chirurgie',
    'SOINS DENTAIRES': 'Soins Dentaires',
  };
  if (LEGACY_LABELS[type]) return LEGACY_LABELS[type];
  // Fallback
  return type.charAt(0) + type.slice(1).toLowerCase().replace(/_/g, ' ');
}

/**
 * Options pour un select HTML (groupées par parent).
 */
export function getPrestationSelectOptions(): { group: string; options: { value: string; label: string }[] }[] {
  return PARENT_TYPES.map(parent => ({
    group: PARENT_LABELS[parent],
    options: (PRESTATION_HIERARCHY[parent].length === 0
      ? [{ value: parent, label: PARENT_LABELS[parent] }]
      : PRESTATION_HIERARCHY[parent].map(child => ({
          value: `${parent}_${child}`,
          label: child.charAt(0) + child.slice(1).toLowerCase().replace(/_/g, ' '),
        }))
    ),
  }));
}
