/**
 * comptes-demo.test.ts — Non-régression des comptes de démonstration.
 * ────────────────────────────────────────────────────────────────────────────
 * 1. Invariants du catalogue (src/lib/comptes-demo.ts) : rôles du référentiel,
 *    e-mails uniques, serviceResponsable réservé au rôle RESPONSABLE_SERVICE.
 * 2. Matrice de permissions SERVEUR par rôle : la fonction matchPermission
 *    (src/lib/api-permissions.ts) est LA source partagée par le middleware
 *    Edge et les routes API — tester cette fonction teste réellement les
 *    contrôles d'autorisation appliqués côté serveur, pas un simple
 *    masquage d'interface.
 */

import { describe, expect, it } from 'vitest';
import {
  COMPTES_DEMO,
  COMPTES_EXTERNES_DEMO,
  COMPTES_INTERNES_DEMO,
  SERVICES_DEMO,
  emailsDemoParService,
  validerCatalogueDemo,
} from './comptes-demo';
import { matchPermission } from './api-permissions';
import { ROLES } from './referentiels';
import type { RoleType } from './auth-context';

// ─── 1. Catalogue ─────────────────────────────────────────────────────────────

describe('Catalogue des comptes de démonstration', () => {
  it('ne comporte aucune erreur structurelle', () => {
    expect(validerCatalogueDemo()).toEqual([]);
  });

  it('utilise uniquement des rôles du référentiel (login fail-closed)', () => {
    for (const compte of COMPTES_DEMO) {
      expect(ROLES as readonly string[]).toContain(compte.role);
    }
  });

  it('ne comporte aucun e-mail en doublon (contrainte unique en base)', () => {
    const emails = COMPTES_DEMO.map((c) => c.email.trim().toLowerCase());
    expect(new Set(emails).size).toBe(emails.length);
  });

  it('réserve serviceResponsable au rôle RESPONSABLE_SERVICE, avec un service valide', () => {
    for (const compte of COMPTES_DEMO) {
      if (compte.role === 'RESPONSABLE_SERVICE') {
        expect(SERVICES_DEMO as readonly string[]).toContain(compte.serviceResponsable);
      } else {
        expect(compte.serviceResponsable).toBeUndefined();
      }
    }
  });

  it('couvre les profils exigés par le cahier des charges de démonstration', () => {
    const parRole = (role: string) => COMPTES_DEMO.filter((c) => c.role === role).length;
    expect(parRole('ADMINISTRATEUR')).toBe(1);
    expect(parRole('ACCUEIL')).toBe(1);
    expect(parRole('TECHNIQUE')).toBe(5);
    expect(parRole('COMPTABILITE')).toBe(4); // 2 comptabilité + 2 finance (rôle existant)
    expect(parRole('SANTE')).toBe(3); // 2 contrôle médical dédiés + compte historique
    expect(parRole('DIRECTION_GENERALE')).toBe(1);
    expect(parRole('RESPONSABLE_SERVICE')).toBe(4); // 1 chef de service par service
    expect(parRole('PORTAIL_CLIENT')).toBe(5); // 1 assuré par société cliente
    expect(parRole('CONTACT_ENTREPRISE')).toBe(5); // 1 représentant par société
    expect(parRole('PRESTATAIRE')).toBe(2);
  });

  it('attribue à chaque service du circuit au moins un collaborateur de démonstration', () => {
    for (const service of SERVICES_DEMO) {
      expect(emailsDemoParService(service).length).toBeGreaterThan(0);
    }
  });

  it('ne réinitialise jamais le mot de passe du compte administrateur de référence', () => {
    const admin = COMPTES_DEMO.find((c) => c.email === 'admin@suivisante.mg');
    expect(admin?.motDePasseVerrouille).toBe(true);
  });
});

// ─── 2. Matrice de permissions SERVEUR (matchPermission — défaut d'accès) ────
//
// Conventions : un « ACCÈS » attendu vaut 200 si le rôle figure dans la
// permission (allowed = true), un « REFUS » attendu doit produire
// allowed = false (401 sans jeton, 403 avec jeton — le middleware et les
// routes partagent cette même fonction).

function perm(chemin: string, methode: string, role: RoleType): boolean {
  return matchPermission(chemin, methode, role).allowed;
}

describe('Permissions serveur par rôle de démonstration', () => {
  it('ADMINISTRATEUR : accès global + paramétrage KPI + gestion des utilisateurs', () => {
    const r: RoleType = 'ADMINISTRATEUR';
    expect(perm('/api/dossiers', 'GET', r)).toBe(true);
    expect(perm('/api/dossiers', 'DELETE', r)).toBe(true);
    expect(perm('/api/utilisateurs', 'POST', r)).toBe(true);
    expect(perm('/api/reporting', 'GET', r)).toBe(true);
    expect(perm('/api/kpi/performance', 'GET', r)).toBe(true);
    expect(perm('/api/kpi/objectifs', 'POST', r)).toBe(true);
    expect(perm('/api/kpi/seuils', 'PUT', r)).toBe(true);
    expect(perm('/api/portail-prestataire', 'GET', r)).toBe(true);
  });

  it('ACCUEIL : réception/import + kanban (A-03) mais ni utilisateurs ni finance', () => {
    const r: RoleType = 'ACCUEIL';
    expect(perm('/api/dossiers', 'GET', r)).toBe(true);
    expect(perm('/api/dossiers', 'POST', r)).toBe(true);
    expect(perm('/api/dossiers', 'PATCH', r)).toBe(true);
    expect(perm('/api/import', 'POST', r)).toBe(true);
    expect(perm('/api/reception/courriels', 'POST', r)).toBe(true);
    expect(perm('/api/kpi/ma-performance', 'GET', r)).toBe(true);
    expect(perm('/api/utilisateurs', 'GET', r)).toBe(false);
    expect(perm('/api/reporting', 'GET', r)).toBe(false);
    expect(perm('/api/appels-fonds', 'POST', r)).toBe(false);
    expect(perm('/api/kpi/objectifs', 'POST', r)).toBe(false);
  });

  it('TECHNIQUE : analyse, barèmes (lecture), prestataires CRUD mais ni finance ni paramétrage KPI', () => {
    const r: RoleType = 'TECHNIQUE';
    expect(perm('/api/dossiers', 'GET', r)).toBe(true);
    expect(perm('/api/dossiers', 'PUT', r)).toBe(true);
    expect(perm('/api/prestataires', 'POST', r)).toBe(true);
    expect(perm('/api/technique/baremes', 'GET', r)).toBe(true);
    expect(perm('/api/technique/import-isa', 'POST', r)).toBe(true);
    expect(perm('/api/assures', 'POST', r)).toBe(true);
    expect(perm('/api/kpi/ma-performance', 'GET', r)).toBe(true);
    expect(perm('/api/reporting', 'GET', r)).toBe(false);
    expect(perm('/api/appels-fonds', 'POST', r)).toBe(false);
    expect(perm('/api/kpi/objectifs', 'POST', r)).toBe(false);
    expect(perm('/api/utilisateurs', 'GET', r)).toBe(false);
  });

  it('COMPTABILITE : comptabilisation, finance et reporting mais ni utilisateurs ni paramétrage KPI', () => {
    const r: RoleType = 'COMPTABILITE';
    expect(perm('/api/dossiers', 'GET', r)).toBe(true);
    expect(perm('/api/dossiers', 'PUT', r)).toBe(true);
    expect(perm('/api/reporting', 'GET', r)).toBe(true);
    expect(perm('/api/appels-fonds', 'POST', r)).toBe(true);
    expect(perm('/api/comptabilite/import-sage', 'POST', r)).toBe(true);
    expect(perm('/api/contrats', 'POST', r)).toBe(false); // CRUD contrats : admin seul
    expect(perm('/api/kpis', 'GET', r)).toBe(true);
    expect(perm('/api/utilisateurs', 'GET', r)).toBe(false);
    expect(perm('/api/kpi/objectifs', 'POST', r)).toBe(false);
  });

  it('SANTE : contrôle médical et lecture, JAMAIS les routes financières', () => {
    const r: RoleType = 'SANTE';
    expect(perm('/api/dossiers', 'GET', r)).toBe(true);
    expect(perm('/api/controle-medical/x', 'POST', r)).toBe(true);
    expect(perm('/api/sante/verifier-assure', 'GET', r)).toBe(true);
    expect(perm('/api/sante/simuler-acte', 'POST', r)).toBe(true);
    expect(perm('/api/dossiers/assigner-bulk', 'POST', r)).toBe(true); // champ contrôle médical uniquement
    expect(perm('/api/kpi/ma-performance', 'GET', r)).toBe(true);
    expect(perm('/api/kpis', 'GET', r)).toBe(false); // indicateurs financiers
    expect(perm('/api/reporting', 'GET', r)).toBe(false);
    expect(perm('/api/appels-fonds', 'POST', r)).toBe(false);
    expect(perm('/api/comptabilite/import-suivi', 'POST', r)).toBe(false);
    expect(perm('/api/upload', 'POST', r)).toBe(false);
    expect(perm('/api/utilisateurs', 'GET', r)).toBe(false);
  });

  it('DIRECTION_GENERALE : consultation KPI globale mais ni dossiers ni paramétrage', () => {
    const r: RoleType = 'DIRECTION_GENERALE';
    expect(perm('/api/kpi/performance', 'GET', r)).toBe(true);
    expect(perm('/api/kpi/export', 'GET', r)).toBe(true);
    expect(perm('/api/kpi/alertes', 'GET', r)).toBe(true);
    expect(perm('/api/kpi/ma-performance', 'GET', r)).toBe(true);
    expect(perm('/api/profil', 'GET', r)).toBe(true); // A-08
    expect(perm('/api/dossiers', 'GET', r)).toBe(false);
    expect(perm('/api/utilisateurs', 'GET', r)).toBe(false);
    expect(perm('/api/kpi/objectifs', 'POST', r)).toBe(false); // paramétrage : admin seul
    expect(perm('/api/reporting', 'GET', r)).toBe(false);
  });

  it('RESPONSABLE_SERVICE : KPI de son service + profil, pas de gestion globale', () => {
    const r: RoleType = 'RESPONSABLE_SERVICE';
    expect(perm('/api/kpi/performance', 'GET', r)).toBe(true);
    expect(perm('/api/kpi/alertes', 'GET', r)).toBe(true);
    expect(perm('/api/kpi/ma-performance', 'GET', r)).toBe(true);
    expect(perm('/api/profil', 'PUT', r)).toBe(true); // A-08
    expect(perm('/api/dossiers', 'GET', r)).toBe(false);
    expect(perm('/api/utilisateurs', 'GET', r)).toBe(false);
    expect(perm('/api/kpi/objectifs', 'POST', r)).toBe(false);
  });

  it('PORTAIL_CLIENT : lecture de SES données, aucune écriture métier', () => {
    const r: RoleType = 'PORTAIL_CLIENT';
    expect(perm('/api/dossiers', 'GET', r)).toBe(true);
    expect(perm('/api/portail-client', 'GET', r)).toBe(true);
    expect(perm('/api/portail-client/export', 'GET', r)).toBe(true);
    expect(perm('/api/contrats', 'GET', r)).toBe(true);
    expect(perm('/api/assures', 'GET', r)).toBe(true);
    expect(perm('/api/profil', 'GET', r)).toBe(true);
    expect(perm('/api/dossiers', 'POST', r)).toBe(false);
    expect(perm('/api/dossiers', 'PATCH', r)).toBe(false);
    expect(perm('/api/utilisateurs', 'GET', r)).toBe(false);
    expect(perm('/api/societes', 'GET', r)).toBe(false);
    expect(perm('/api/portail-prestataire', 'GET', r)).toBe(false);
  });

  it('CONTACT_ENTREPRISE : lecture sur sa société, aucune écriture métier', () => {
    const r: RoleType = 'CONTACT_ENTREPRISE';
    expect(perm('/api/dossiers', 'GET', r)).toBe(true);
    expect(perm('/api/societes', 'GET', r)).toBe(true);
    expect(perm('/api/contrats', 'GET', r)).toBe(true);
    expect(perm('/api/assures', 'GET', r)).toBe(true);
    expect(perm('/api/portail-client', 'GET', r)).toBe(true);
    expect(perm('/api/profil', 'PUT', r)).toBe(true);
    expect(perm('/api/dossiers', 'POST', r)).toBe(false);
    expect(perm('/api/assures', 'POST', r)).toBe(false);
    expect(perm('/api/societes', 'DELETE', r)).toBe(false);
    expect(perm('/api/utilisateurs', 'GET', r)).toBe(false);
  });

  it('PRESTATAIRE : portail prestataire + assistant, jamais les routes internes', () => {
    const r: RoleType = 'PRESTATAIRE';
    expect(perm('/api/portail-prestataire', 'GET', r)).toBe(true);
    expect(perm('/api/assistant', 'POST', r)).toBe(true);
    expect(perm('/api/profil', 'GET', r)).toBe(true);
    expect(perm('/api/dossiers', 'GET', r)).toBe(false);
    expect(perm('/api/societes', 'GET', r)).toBe(false);
    expect(perm('/api/kpis', 'GET', r)).toBe(false);
    expect(perm('/api/utilisateurs', 'GET', r)).toBe(false);
    expect(perm('/api/prestataires', 'GET', r)).toBe(false);
  });

  it('défaut d\u2019accès : une route non déclarée est refusée pour tous les rôles', () => {
    for (const role of ROLES) {
      expect(perm('/api/route-inexistante', 'GET', role as RoleType)).toBe(false);
    }
  });

  it('cohérence catalogue ↔ permissions : chaque rôle du catalogue passe la matrice de son périmètre', () => {
    // Garde anti-dérive : si l\u2019on ajoute un rôle au catalogue sans l\u2019intégrer
    // aux permissions, ce test échoue (fail-closed : /api/profil est la seule
    // route commune à tous les rôles du référentiel).
    const rolesCatalogue = new Set(COMPTES_DEMO.map((c) => c.role));
    for (const role of rolesCatalogue) {
      expect(perm('/api/profil', 'GET', role as RoleType)).toBe(true);
    }
  });
});

describe('Comptes externes — liaisons attendues', () => {
  it('chaque société de démonstration a un CONTACT_ENTREPRISE et un PORTAIL_CLIENT dédiés', () => {
    for (const soc of [
      { contact: 'contact.sanlam@sanlam.mg', portail: 'portail.sanlam@suivisante.mg' },
      { contact: 'contact.telma@telma.mg', portail: 'portail.telma@suivisante.mg' },
      { contact: 'j.rakotoarison@jirama.mg', portail: 'portail.jirama@suivisante.mg' },
      { contact: 'contact.airtel@airtel.mg', portail: 'portail.airtel@suivisante.mg' },
      { contact: 'contact.bni@bni.mg', portail: 'portail.bni@suivisante.mg' },
    ]) {
      expect(COMPTES_EXTERNES_DEMO.some((c) => c.email === soc.contact && c.role === 'CONTACT_ENTREPRISE')).toBe(true);
      expect(COMPTES_EXTERNES_DEMO.some((c) => c.email === soc.portail && c.role === 'PORTAIL_CLIENT')).toBe(true);
    }
  });

  it('les comptes PRESTATAIRE utilisent l\u2019e-mail de facturation de leur fiche (rôle du référentiel, jamais PORTAIL_PRESTATAIRE)', () => {
    const prestataires = COMPTES_EXTERNES_DEMO.filter((c) => c.role === 'PRESTATAIRE');
    expect(prestataires.map((c) => c.email).sort()).toEqual(
      ['contact@clinique-saintemarie.mg', 'facturation@hopital-principal.mg'].sort(),
    );
    // Garde anti-régression du bug historique : le rôle « PORTAIL_PRESTATAIRE »
    // n\u2019existe pas dans le référentiel — un compte ainsi nommé ne peut
    // même pas se connecter (fail-closed dans src/lib/auth.ts).
    expect((ROLES as readonly string[])).not.toContain('PORTAIL_PRESTATAIRE');
  });
});
