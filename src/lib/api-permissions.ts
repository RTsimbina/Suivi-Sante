/**
 * api-permissions.ts — Permissions des routes API (module PUR).
 * ────────────────────────────────────────────────────────────────────────────
 * Contenu extrait de src/lib/authorize.ts (P1 révocation de sessions) :
 * le middleware Edge (src/proxy.ts) importe matchPermission — un module
 * Edge ne peut pas dépendre de Prisma (src/lib/db). authorize.ts garde le
 * re-export pour la compatibilité des imports existants (routes + tests)
 * tout en ajoutant la vérification serveur de révocation de session.
 *
 * ⚠️  Ce module doit rester SANS dépendance Node (aucun import de db, fs,
 *     crypto Node) : il est évalué dans le runtime Edge.
 */

import type { RoleType } from './auth-context';

// ─── Définition des permissions par rôle ────────────────────────────────────

/**
 * Définit quel rôle peut accéder à quelle ressource API.
 * Chaque clé est un préfixe de route API.
 * La valeur est un objet avec :
 *   - roles: liste des rôles autorisés
 *   - methods: (optionnel) méthodes HTTP restrictives { method: [roles] }
 *
 * ⚠️ RÈGLE STRICTE : Le rôle SANTE ne doit JAMAIS avoir accès aux rapports financiers.
 *    Routes financières (réservées ADMINISTRATEUR + COMPTABILITE uniquement) :
 *    - /api/reporting (rapports PDF, suivi contrats, appels de fonds)
 *    - /api/appels-fonds (CRUD appels de fonds)
 *    - /api/comptabilite/* (imports comptables, suivi paiements)
 *    - /api/kpis (indicateurs financiers : montants, paiements)
 *    SANTE a un accès LECTURE SEULE (GET) à : /api/contrats, /api/assures,
 *    /api/prestataires, /api/technique/societes, /api/societes, /api/ia,
 *    /api/portail, /api/dossiers.
 *    L'assistant (/api/assistant) est accessible aux 8 rôles : l'isolation
 *    des données est appliquée côté serveur par le moteur (scope par rôle).
 */
export const API_PERMISSIONS: Record<
  string,
  {
    roles: RoleType[];
    methods?: Partial<Record<string, RoleType[]>>;
  }
> = {
  '/api/dossiers/assigner-bulk': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE'],
    // SANTE : uniquement pour le champ CONTROLE_MEDICAL (contrôle applicatif
    // dans la route — un champ Accueil/Technique/Compta reste refusé à SANTE).
  },
  '/api/portail-client': {
    roles: ['PORTAIL_CLIENT', 'CONTACT_ENTREPRISE', 'ADMINISTRATEUR'],
  },
  // P2-02 : export CSV/PDF des dossiers autorisés — mêmes rôles que la
  // lecture (périmètre société et confidentialité NSS identiques).
  '/api/portail-client/export': {
    roles: ['PORTAIL_CLIENT', 'CONTACT_ENTREPRISE', 'ADMINISTRATEUR'],
  },
  // ─── Portail Prestataire (rôles externes prestataires de soins) ─────────
  // L'identité du prestataire est résolue CÔTÉ SERVEUR (JWT → liaison par
  // e-mail) : aucun prestataireId transmis par le navigateur n'est accepté.
  '/api/portail-prestataire': {
    roles: ['PRESTATAIRE', 'ADMINISTRATEUR'],
  },
  '/api/dossiers': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE', 'PORTAIL_CLIENT', 'CONTACT_ENTREPRISE'],
    methods: {
      POST: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE'], // Créer un dossier
      PUT: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE'],
      DELETE: ['ADMINISTRATEUR'],
      PATCH: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE'], // Changer statut
      // ACCUEIL sur PATCH (A-03) : uniquement le glisser-déposer Kanban —
      // transitions RECU → EN_ANALYSE / REJETE (DOSSIER_ROLE_TRANSITIONS).
      // La route /api/dossiers/[id] borne ce rôle au seul champ `statut` :
      // aucune modification générale de dossier n'est ouverte à ACCUEIL.
      // PORTAIL_CLIENT et CONTACT_ENTREPRISE : lecture seule (GET)
    },
  },
  '/api/kpis': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE'],
    // SANTE volontairement exclu : données financières
  },
  // ─── Module KPI — Performance des collaborateurs ─────────────────────────
  // Consultation GLOBALE (tableaux de bord, exports, alertes) :
  // ADMINISTRATEUR + DIRECTION_GENERALE (R1 — consultation globale sans le
  // compte admin) + RESPONSABLE_SERVICE (R2 — portée FORCÉE côté serveur à
  // son service, cf. resoudrePerimetreKpi / routes : tout paramètre service
  // contradictoire est écrasé, fail-closed si aucun service associé).
  // Le PARAMÉTRAGE (objectifs, seuils) reste réservé à ADMINISTRATEUR :
  // aucune entrée DIRECTION_GENERALE / RESPONSABLE_SERVICE ici.
  '/api/kpi/performance': {
    roles: ['ADMINISTRATEUR', 'DIRECTION_GENERALE', 'RESPONSABLE_SERVICE'],
  },
  '/api/kpi/export': {
    roles: ['ADMINISTRATEUR', 'DIRECTION_GENERALE', 'RESPONSABLE_SERVICE'],
  },
  '/api/kpi/alertes': {
    roles: ['ADMINISTRATEUR', 'DIRECTION_GENERALE', 'RESPONSABLE_SERVICE'],
  },
  '/api/kpi/objectifs': {
    roles: ['ADMINISTRATEUR'],
  },
  '/api/kpi/seuils': {
    roles: ['ADMINISTRATEUR'],
  },
  // Espace personnel : l'identifiant mesuré est TOUJOURS celui du JWT
  // (côté serveur, cf. /api/kpi/ma-performance) — aucun contournement
  // possible via URL/paramètre, quel que soit le rôle.
  '/api/kpi/ma-performance': {
    roles: ['ADMINISTRATEUR', 'DIRECTION_GENERALE', 'RESPONSABLE_SERVICE', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE'],
  },
  // Contrôle médical : étapes hors circuit des statuts, rôles habilités SANTE
  // (rôle « Contrôle Santé ») et ADMINISTRATEUR.
  '/api/controle-medical': {
    roles: ['SANTE', 'ADMINISTRATEUR'],
  },
  '/api/ia': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE'],
  },
  '/api/assistant': {
    roles: [
      'ADMINISTRATEUR',
      'ACCUEIL',
      'TECHNIQUE',
      'COMPTABILITE',
      'SANTE',
      'PORTAIL_CLIENT',
      'CONTACT_ENTREPRISE',
      'PRESTATAIRE',
    ],
    methods: {
      GET: [
        'ADMINISTRATEUR',
        'ACCUEIL',
        'TECHNIQUE',
        'COMPTABILITE',
        'SANTE',
        'PORTAIL_CLIENT',
        'CONTACT_ENTREPRISE',
        'PRESTATAIRE',
      ],
      POST: [
        'ADMINISTRATEUR',
        'ACCUEIL',
        'TECHNIQUE',
        'COMPTABILITE',
        'SANTE',
        'PORTAIL_CLIENT',
        'CONTACT_ENTREPRISE',
        'PRESTATAIRE',
      ],
    },
  },
  '/api/import': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL'],
  },
  '/api/comptabilite/import-suivi': {
    roles: ['ADMINISTRATEUR', 'COMPTABILITE'],
    methods: {
      POST: ['ADMINISTRATEUR', 'COMPTABILITE'],
    },
  },
  '/api/comptabilite/import-sage': {
    roles: ['ADMINISTRATEUR', 'COMPTABILITE'],
    methods: {
      POST: ['ADMINISTRATEUR', 'COMPTABILITE'],
    },
  },
  '/api/technique/import-isa': {
    roles: ['ADMINISTRATEUR', 'TECHNIQUE'],
  },
  '/api/contrats': {
    roles: ['ADMINISTRATEUR', 'COMPTABILITE', 'SANTE', 'PORTAIL_CLIENT', 'CONTACT_ENTREPRISE'],
    methods: {
      POST: ['ADMINISTRATEUR'],
      PUT: ['ADMINISTRATEUR'],
      DELETE: ['ADMINISTRATEUR'],
      // SANTE, PORTAIL_CLIENT, CONTACT_ENTREPRISE : lecture seule (GET)
    },
  },
  '/api/appels-fonds': {
    roles: ['ADMINISTRATEUR', 'COMPTABILITE'],
    methods: {
      POST: ['ADMINISTRATEUR', 'COMPTABILITE'],
      PUT: ['ADMINISTRATEUR', 'COMPTABILITE'],
      DELETE: ['ADMINISTRATEUR'],
    },
  },
  '/api/portail': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE'],
  },
  '/api/upload': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE'],
    // SANTE exclu : upload réservé aux rôles opérationnels
  },
  '/api/reporting': {
    roles: ['ADMINISTRATEUR', 'COMPTABILITE'],
  },
  '/api/technique/exclusions': {
    roles: ['ADMINISTRATEUR', 'TECHNIQUE', 'COMPTABILITE', 'ACCUEIL'],
  },
  '/api/technique/societes': {
    roles: ['ADMINISTRATEUR', 'TECHNIQUE', 'SANTE', 'ACCUEIL', 'COMPTABILITE'],
    methods: {
      POST: ['ADMINISTRATEUR', 'TECHNIQUE'],
      PUT: ['ADMINISTRATEUR', 'TECHNIQUE'],
      DELETE: ['ADMINISTRATEUR'],
      // SANTE, ACCUEIL, COMPTABILITE : lecture seule (GET)
    },
  },
  '/api/technique/baremes': {
    roles: ['ADMINISTRATEUR', 'TECHNIQUE', 'ACCUEIL', 'COMPTABILITE'],
    methods: {
      POST: ['ADMINISTRATEUR'],
      PUT: ['ADMINISTRATEUR'],
      DELETE: ['ADMINISTRATEUR'],
    },
  },
  '/api/assures': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE', 'PORTAIL_CLIENT', 'CONTACT_ENTREPRISE'],
    methods: {
      POST: ['ADMINISTRATEUR', 'TECHNIQUE'],
      PUT: ['ADMINISTRATEUR', 'TECHNIQUE'],
      DELETE: ['ADMINISTRATEUR', 'TECHNIQUE'],
      // SANTE, PORTAIL_CLIENT, CONTACT_ENTREPRISE : lecture seule (GET)
    },
  },
  '/api/assures/import': {
    roles: ['ADMINISTRATEUR', 'TECHNIQUE'],
    methods: {
      POST: ['ADMINISTRATEUR', 'TECHNIQUE'],
    },
  },
  '/api/prestataires': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE'],
    methods: {
      // CRUD complet : Administrateur ET Service Technique (spécification
      // « Gestion des prestataires »). ACCUEIL/COMPTABILITE/SANTE : lecture
      // seule (GET). Contrôle serveur — jamais uniquement côté interface.
      POST: ['ADMINISTRATEUR', 'TECHNIQUE'],
      PUT: ['ADMINISTRATEUR', 'TECHNIQUE'],
      DELETE: ['ADMINISTRATEUR', 'TECHNIQUE'],
    },
  },
  '/api/prestataires/verifier-doublons': {
    // Contrôle de lecture réservé aux profils de saisie (avant enregistrement)
    roles: ['ADMINISTRATEUR', 'TECHNIQUE'],
  },
  '/api/prestataires/groupes': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE'],
    methods: {
      POST: ['ADMINISTRATEUR', 'TECHNIQUE'],
    },
  },
  '/api/prestataires/societes/sync': {
    roles: ['ADMINISTRATEUR', 'TECHNIQUE'],
  },
  '/api/prestataires/societes': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE'],
    methods: {
      POST: ['ADMINISTRATEUR', 'TECHNIQUE'],
      PATCH: ['ADMINISTRATEUR', 'TECHNIQUE'],
      DELETE: ['ADMINISTRATEUR'],
      // SANTE : lecture seule (GET)
    },
  },
  '/api/bot-messages': {
    roles: ['ADMINISTRATEUR'],
  },
  '/api/bot-status': {
    roles: ['ADMINISTRATEUR'],
  },
  '/api/email-mensuel': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL'],
    methods: {
      DELETE: ['ADMINISTRATEUR'],
    },
  },
  '/api/email-config': {
    roles: ['ADMINISTRATEUR'],
  },
  // ─── Service de messagerie centralisé ────────────────────────────────────
  '/api/mail': {
    roles: ['ADMINISTRATEUR'], // GET = logs et suivi des envois
    methods: {
      GET: ['ADMINISTRATEUR'],
    },
  },
  '/api/mail/send': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE'],
    methods: {
      POST: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE'],
    },
  },
  '/api/mail/process': {
    roles: ['ADMINISTRATEUR', 'TECHNIQUE'],
    methods: {
      POST: ['ADMINISTRATEUR', 'TECHNIQUE'],
    },
  },
  '/api/mail/dns-check': {
    roles: ['ADMINISTRATEUR'], // GET = statut SPF / DKIM / DMARC du domaine
  },
  '/api/alertes': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE'],
  },
  '/api/entreprise-contacts': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE'],
    methods: {
      POST: ['ADMINISTRATEUR', 'ACCUEIL'],
      PUT: ['ADMINISTRATEUR', 'ACCUEIL'],
      DELETE: ['ADMINISTRATEUR'],
    },
  },
  '/api/societes': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE', 'CONTACT_ENTREPRISE'],
    methods: {
      POST: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE'],
      DELETE: ['ADMINISTRATEUR'],
      // SANTE, CONTACT_ENTREPRISE : lecture seule (GET)
    },
  },
  '/api/baremes': {
    roles: ['ADMINISTRATEUR', 'TECHNIQUE', 'ACCUEIL', 'COMPTABILITE'],
  },
  '/api/sante/verifier-assure': {
    roles: ['ADMINISTRATEUR', 'SANTE', 'ACCUEIL', 'TECHNIQUE'],
  },
  '/api/sante/simuler-acte': {
    roles: ['ADMINISTRATEUR', 'SANTE', 'ACCUEIL', 'TECHNIQUE'],
  },
  '/api/sante/actes-assure': {
    roles: ['ADMINISTRATEUR', 'SANTE', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE'],
  },
  '/api/profil': {
    // DIRECTION_GENERALE + RESPONSABLE_SERVICE ajoutés (A-08) : les 2 rôles
    // créés par les évolutions R1/R2 n'avaient accès NI à la consultation de
    // leur profil NI au changement de mot de passe (403 fail-closed). Le
    // préfixe couvre aussi /profil/changer-mot-de-passe, /historique, /avatar.
    // PRESTATAIRE ajouté (comptes de démonstration, même logique A-08) :
    // le 3e rôle externe était le seul du référentiel sans accès à SON
    // propre profil (403) — l'identité reste résolue côté serveur depuis le
    // JWT (token.email) : il ne consulte et modifie que son propre compte.
    roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE', 'PORTAIL_CLIENT', 'CONTACT_ENTREPRISE', 'PRESTATAIRE', 'DIRECTION_GENERALE', 'RESPONSABLE_SERVICE'],
  },
  '/api/utilisateurs': {
    roles: ['ADMINISTRATEUR'],
    methods: {
      GET: ['ADMINISTRATEUR'],
      POST: ['ADMINISTRATEUR'],
      PUT: ['ADMINISTRATEUR'],
      PATCH: ['ADMINISTRATEUR'],
      DELETE: ['ADMINISTRATEUR'],
    },
  },
  '/api/historique-parametres': {
    roles: ['ADMINISTRATEUR'],
  },
  '/api/entreprises': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'SANTE'],
  },
  '/api/reception/courriels': {
    roles: ['ADMINISTRATEUR', 'ACCUEIL'],
    methods: {
      POST: ['ADMINISTRATEUR', 'ACCUEIL'],
      PUT: ['ADMINISTRATEUR', 'ACCUEIL'],
      PATCH: ['ADMINISTRATEUR', 'ACCUEIL'],
      DELETE: ['ADMINISTRATEUR'],
    },
  },
};

export interface PermissionCheckResult {
  allowed: boolean;
  error: string;
  status: number;
}

/**
 * Vérifie si un rôle est autorisé à accéder à une route API avec une méthode HTTP.
 *
 * Utilise le PLUS LONG préfixe correspondant dans API_PERMISSIONS pour gérer
 * correctement les sous-routes (ex: /api/assures/import doit matcher
 * /api/assures/import et non /api/assures).
 *
 * ⚠️  DÉFAUT D'ACCÈS (default-deny) : toute route API non déclarée
 *     dans API_PERMISSIONS est automatiquement refusée (403).
 *
 * ⚠️  FONCTION PARTAGÉE : utilisée par `authorizeRequest` (routes API, Node)
 *     ET par le middleware `src/proxy.ts` (Edge). Ne pas y introduire de
 *     dépendance Node-specific.
 */
export function matchPermission(
  pathname: string,
  method: string,
  userRole: RoleType
): PermissionCheckResult {
  // Trouver le préfixe le plus long qui correspond
  let matchedPrefix = '';
  for (const prefix of Object.keys(API_PERMISSIONS)) {
    if (pathname.startsWith(prefix) && prefix.length > matchedPrefix.length) {
      matchedPrefix = prefix;
    }
  }

  // Route non définie dans les permissions → accès refusé par défaut
  if (!matchedPrefix) {
    return {
      allowed: false,
      error: 'Route API non reconnue.',
      status: 403,
    };
  }

  const permission = API_PERMISSIONS[matchedPrefix];
  const upperMethod = method.toUpperCase();

  // Vérifier les permissions par méthode (si défini)
  if (permission.methods && permission.methods[upperMethod]) {
    const allowedRoles = permission.methods[upperMethod];
    if (!allowedRoles.includes(userRole)) {
      return {
        allowed: false,
        error: `Accès refusé. Le rôle '${userRole}' ne peut pas effectuer l'action ${upperMethod} sur cette ressource.`,
        status: 403,
      };
    }
    return { allowed: true, error: '', status: 200 };
  }

  // Sinon vérifier les rôles généraux
  if (!permission.roles.includes(userRole)) {
    return {
      allowed: false,
      error: `Accès refusé. Le rôle '${userRole}' n'est pas autorisé à accéder à cette ressource.`,
      status: 403,
    };
  }

  return { allowed: true, error: '', status: 200 };
}
