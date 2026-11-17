/**
 * nss.ts — Politique de confidentialité du Numéro de Sécurité Sociale (NSS).
 *
 * PRINCIPE (P2-03) : le NSS complet n'est jamais transmis aux rôles EXTERNES
 * (portails) ni aux utilisateurs non habilités. Le masquage est appliqué
 * CÔTÉ BACKEND, avant sérialisation de la réponse — le masquage visuel React
 * n'est jamais suffisant. Les exports (CSV/PDF) consomment les mêmes
 * fonctions : ils héritent de la politique sans code distinct.
 *
 * RÔLES (cf. src/lib/data-isolation.ts) :
 *   - Rôles internes (ADMINISTRATEUR, ACCUEIL, TECHNIQUE, COMPTABILITE, SANTE)
 *     → personnel habilité : NSS complet selon les permissions métier déjà
 *     validées (API_PERMISSIONS). Être administrateur ne suffit PAS à
 *     contourner le masquage des routes externes : /api/portail-client masque
 *     systématiquement, quel que soit le rôle.
 *   - Rôles externes (PORTAIL_CLIENT, CONTACT_ENTREPRISE, PRESTATAIRE)
 *     → NSS masqué : seuls les 4 derniers caractères restent lisibles
 *     (ex. 123456789012 → ••••••••9012), l'assuré reste identifiable par
 *     nom/prénom/matricule.
 *
 * JOURNALISATION (P2-03C) : toute révélation exceptionnelle du NSS complet
 * (consultation ciblée d'un assuré par le personnel habilité, ex. Contrôle
 * Santé) est tracée via journaillerConsultationNss — QUI (id + rôle), QUAND,
 * quelle société, quel bénéficiaire (par identifiant, JAMAIS par NSS), quel
 * motif. Le NSS complet n'est jamais écrit dans le journal (immutabilité du
 * journal : src/lib/audit-immutabilite.test.ts).
 */

import { logParametreChange } from './audit-log';
import { INTERNAL_ROLES } from './referentiels';

/**
 * Rôles EXTERNES pour la politique NSS : jamais de NSS complet.
 * NB : PRESTATAIRE a un périmètre distinct dans data-isolation.ts (conventionne
 * avec plusieurs sociétés) mais reste un rôle externe au sens confidentialité —
 * le NSS complet lui est masqué comme aux autres portails.
 */
const ROLES_EXTERNES_NSS = ['PORTAIL_CLIENT', 'CONTACT_ENTREPRISE', 'PRESTATAIRE'] as const;

/** Masque un NSS pour AFFICHAGE : seuls les 4 derniers caractères restent lisibles. */
export function masquerNss(nss: string | null | undefined): string {
  const brut = (nss || '').trim();
  if (!brut) return '—';
  if (brut.length <= 4) return '•'.repeat(brut.length);
  return `${'•'.repeat(brut.length - 4)}${brut.slice(-4)}`;
}

/**
 * Politique FAIL-CLOSED : seuls les rôles INTERNES habilités (liste blanche
 * INTERNAL_ROLES — ADMINISTRATEUR, ACCUEIL, TECHNIQUE, COMPTABILITE, SANTE)
 * voient le NSS complet. Tout autre rôle (externes, PRESTATAIRE, rôle
 * inconnu, rôle absent) reçoit le NSS masqué.
 */
export function peutVoirNssComplet(role: string | null | undefined): boolean {
  return !!role && INTERNAL_ROLES.includes(role as (typeof INTERNAL_ROLES)[number]);
}

/**
 * Applique la politique : NSS complet pour le personnel habilité, masqué
 * pour les rôles externes. Fonction unique utilisée par toutes les routes
 * qui sérialisent un assuré (aucune exception, aucun masquage visuel).
 */
export function nssPourRole(
  nss: string | null | undefined,
  role: string | null | undefined,
): string | null {
  const brut = (nss ?? '').trim();
  if (!brut) return null;
  return peutVoirNssComplet(role) ? brut : masquerNss(brut);
}

/** Paramètres de journalisation d'une révélation exceptionnelle du NSS complet. */
export interface ConsultationNssParams {
  /** Identifiant de l'assuré concerné (JAMAIS son NSS). */
  assureId: string;
  /** Société concernée (isolation + filtrage du journal). */
  societeId?: string | null;
  /** Nom/prénom du bénéficiaire (identifiant métier, non sensible au sens NSS). */
  beneficiaire?: string;
  /** Qui consulte : nom affichable + identifiant + rôle. */
  modifiePar: string;
  modifieParId?: string;
  roleUtilisateur?: string;
  /** Motif de la consultation (ex. 'Vérification Contrôle Santé'). */
  motif: string;
  /** Requête HTTP (IP / navigateur / session extraits par audit-log). */
  request?: Request;
}

/**
 * Trace une révélation exceptionnelle du NSS complet dans le journal d'audit
 * immuable. Échec non bloquant : la consultation légitime ne doit jamais
 * échouer parce que le journal est indisponible. Le NSS complet n'est JAMAIS
 * passé à cette fonction : seule la référence de l'assuré est journalisée.
 */
export async function journaillerConsultationNss(
  params: ConsultationNssParams,
): Promise<void> {
  try {
    await logParametreChange({
      entite: 'Assure',
      entiteId: params.assureId,
      champ: 'nSS',
      ancienneValeur: null,
      // Valeur fixe, SANS le NSS lui-même : le journal prouve le QUI / QUAND /
      // QUOI sans jamais recopier la donnée confidentielle.
      nouvelleValeur: 'CONSULTATION_NSS_COMPLET',
      action: 'CONSULTATION',
      niveau: 'SENSIBLE',
      module: 'NSS',
      objet: params.beneficiaire
        ? `Révélation NSS — bénéficiaire : ${params.beneficiaire}`
        : 'Révélation NSS',
      societeId: params.societeId ?? undefined,
      motif: params.motif,
      modifiePar: params.modifiePar,
      modifieParId: params.modifieParId,
      roleUtilisateur: params.roleUtilisateur,
      request: params.request,
    });
  } catch (error) {
    console.error(
      `[NSS] Échec de la journalisation de consultation (assuré ${params.assureId}):`,
      error,
    );
  }
}
