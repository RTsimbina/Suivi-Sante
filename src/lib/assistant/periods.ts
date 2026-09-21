import { Prisma } from '@prisma/client';
import type { PeriodeParams, PeriodeResolue, PeriodePreset } from './types';
import { AssistantError } from './types';

// ─── Résolution des périodes (100 % côté serveur) ────────────────────────────

const MS_DAY = 86_400_000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Résout une période à partir des paramètres fournis.
 * Valeur par défaut : année courante.
 * Les dates personnalisées sont strictement validées (format ISO, ordre).
 */
export function resolvePeriode(params: PeriodeParams | undefined): PeriodeResolue {
  const now = new Date();
  const preset: PeriodePreset = (params?.preset as PeriodePreset) || 'ANNEE_COURANTE';

  switch (preset) {
    case 'AUJOURDHUI': {
      const du = startOfDay(now);
      return { du, au: endOfDay(now), label: `Aujourd'hui (${formatDate(du)})` };
    }
    case '7_DERNIERS_JOURS': {
      const du = startOfDay(new Date(now.getTime() - 6 * MS_DAY));
      return { du, au: endOfDay(now), label: `Du ${formatDate(du)} au ${formatDate(now)}` };
    }
    case '30_DERNIERS_JOURS': {
      const du = startOfDay(new Date(now.getTime() - 29 * MS_DAY));
      return { du, au: endOfDay(now), label: `Du ${formatDate(du)} au ${formatDate(now)}` };
    }
    case '90_DERNIERS_JOURS': {
      const du = startOfDay(new Date(now.getTime() - 89 * MS_DAY));
      return { du, au: endOfDay(now), label: `Du ${formatDate(du)} au ${formatDate(now)}` };
    }
    case 'CE_MOIS': {
      const du = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      return { du, au: endOfDay(now), label: `Mois de ${du.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}` };
    }
    case 'MOIS_DERNIER': {
      const du = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      const au = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
      return { du, au, label: `Mois de ${du.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}` };
    }
    case 'TRIMESTRE_COURANT': {
      const trimestre = Math.floor(now.getMonth() / 3);
      const du = startOfDay(new Date(now.getFullYear(), trimestre * 3, 1));
      return { du, au: endOfDay(now), label: `T${trimestre + 1} ${now.getFullYear()}` };
    }
    case 'ANNEE_COURANTE': {
      const du = startOfDay(new Date(now.getFullYear(), 0, 1));
      return { du, au: endOfDay(now), label: `Année ${now.getFullYear()}` };
    }
    case 'ANNEE_DERNIERE': {
      const y = now.getFullYear() - 1;
      return {
        du: startOfDay(new Date(y, 0, 1)),
        au: endOfDay(new Date(y, 11, 31)),
        label: `Année ${y}`,
      };
    }
    case 'PERSONNALISEE': {
      if (!params?.du || !params?.au) {
        throw new AssistantError('Période personnalisée incomplète : dates de début et de fin requises.');
      }
      const du = new Date(`${params.du}T00:00:00`);
      const au = new Date(`${params.au}T23:59:59.999`);
      if (isNaN(du.getTime()) || isNaN(au.getTime())) {
        throw new AssistantError('Dates de période invalides (format attendu : AAAA-MM-JJ).');
      }
      if (du.getTime() > au.getTime()) {
        throw new AssistantError('Période invalide : la date de début doit précéder la date de fin.');
      }
      // Garde-fou : maximum 3 ans de fenêtre
      if (au.getTime() - du.getTime() > 366 * 3 * MS_DAY) {
        throw new AssistantError('Période trop étendue : maximum 3 ans.');
      }
      return { du, au, label: `Du ${formatDate(du)} au ${formatDate(au)}` };
    }
    default:
      throw new AssistantError(`Période inconnue : ${String(preset)}`);
  }
}

/** Where Prisma standard sur un champ date pour une période donnée */
export function periodeWhere(field: string, periode: PeriodeResolue) {
  return { [field]: { gte: periode.du, lte: periode.au } };
}

/** Liste blanche des champs de date utilisables en SQL brut */
const CHAMPS_DATE: Record<string, true> = {
  dateReception: true,
  datePaiement: true,
  dateSoins: true,
  dateTraitementTechnique: true,
  dateReceptionDecompte: true,
  createdAt: true,
  updatedAt: true,
};

/** Table autorisée pour les requêtes de séries (liste blanche) */
const TABLES: Record<string, true> = { Dossier: true };

/**
 * Fragment SQL sûr pour les requêtes brutes : le champ vient d'une liste
 * blanche (jamais du client) et les dates sont des paramètres liés.
 */
export function periodeSqlFrag(field: string, periode: PeriodeResolue): Prisma.Sql {
  if (!CHAMPS_DATE[field]) throw new AssistantError('Champ de date non autorisé.');
  return Prisma.sql`AND "${Prisma.raw(field)}" >= ${periode.du} AND "${Prisma.raw(field)}" <= ${periode.au}`;
}

/** Fragment SQL sûr pour filtrer par colonne d'identifiant (valeur liée) */
export function egalSqlFrag(colonne: string, valeur: string | null): Prisma.Sql {
  if (!valeur) return Prisma.empty;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(colonne)) throw new AssistantError('Colonne non autorisée.');
  if (!/^[a-zA-Z0-9_-]+$/.test(valeur)) throw new AssistantError('Identifiant invalide.');
  return Prisma.sql`AND "${Prisma.raw(colonne)}" = ${valeur}`;
}
