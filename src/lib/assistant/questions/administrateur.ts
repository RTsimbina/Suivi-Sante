import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import type { AssistantContext, ParamValeurs, QuestionDef } from '../types';
import { resolvePeriode } from '../periods';
import { extrairePeriode } from '../context';
import {
  resultatNombre, resultatMontant, resultatTableau, resultatListe,
  resultatGraphique, resultatKpi, resultatVide,
  round2, enNombre, fmtAr, fmtNb, statutLabel, STATUTS_EN_COURS, STATUTS_ATTENTE,
  serieMensuelle, LIMITE_LISTE,
} from '../results';
import { findRetards, findAnomalies } from '@/lib/kpi-queries';

// ─── Catalogue ADMINISTRATEUR — 20 questions prédéfinies ─────────────────────
// Périmètre : global (comportement plateforme des rôles internes).
// Mapping réel : « factures » = dossiers de soins réclamés (montantReclame) ;
// « règlements » = paiements effectués (montantPaye / datePaiement).

const T = (question: string) => ({ question });
const P = (params: ParamValeurs) => resolvePeriode(extrairePeriode(params));

function scopeSql(ctx: AssistantContext): Prisma.Sql {
  switch (ctx.role) {
    case 'CONTACT_ENTREPRISE':
      return Prisma.sql`AND "societeId" = ${ctx.societeId}`;
    case 'PRESTATAIRE':
      return Prisma.sql`AND "prestataireId" = ${ctx.prestataireId}`;
    default:
      return Prisma.empty;
  }
}

function scopeWhere(ctx: AssistantContext): Record<string, unknown> {
  switch (ctx.role) {
    case 'CONTACT_ENTREPRISE':
      return { societeId: ctx.societeId };
    case 'PRESTATAIRE':
      return { prestataireId: ctx.prestataireId };
    default:
      return {};
  }
}

export const questionsAdministrateur: QuestionDef[] = [
  // ─── Utilisateurs ──────────────────────────────────────────────────────────
  {
    id: 'ADMIN_UTILISATEURS_ACTIFS',
    role: 'ADMINISTRATEUR',
    categorie: 'Utilisateurs',
    question: "Combien d'utilisateurs sont actuellement actifs ?",
    params: [],
    presentation: 'NOMBRE',
    async impl() {
      const total = await db.utilisateur.count({ where: { actif: true } });
      const totalTous = await db.utilisateur.count();
      return resultatNombre(T('Utilisateurs actifs'), total,
        `${fmtNb(total)} utilisateur(s) actif(s) sur ${fmtNb(totalTous)} compte(s) enregistré(s).`, null, 'utilisateurs');
    },
  },
  {
    id: 'ADMIN_UTILISATEURS_PAR_ROLE',
    role: 'ADMINISTRATEUR',
    categorie: 'Utilisateurs',
    question: "Combien d'utilisateurs sont enregistrés par rôle ?",
    params: [],
    presentation: 'TABLEAU',
    async impl() {
      const rows = await db.utilisateur.groupBy({ by: ['role'], _count: { role: true } });
      rows.sort((a, b) => b._count.role - a._count.role);
      return resultatTableau(
        T('Utilisateurs par rôle'),
        [{ key: 'role', label: 'Rôle', type: 'texte' }, { key: 'nb', label: 'Nombre', type: 'nombre' }],
        rows.map((r) => ({ role: r.role, nb: r._count.role })),
        rows.length,
        `${rows.length} rôle(s) occupé(s) sur la plateforme.`
      );
    },
  },
  {
    id: 'ADMIN_UTILISATEURS_RECENTS',
    role: 'ADMINISTRATEUR',
    categorie: 'Utilisateurs',
    question: 'Quels sont les utilisateurs récemment créés ?',
    params: [],
    presentation: 'LISTE',
    async impl() {
      const users = await db.utilisateur.findMany({
        orderBy: { createdAt: 'desc' },
        take: LIMITE_LISTE,
        select: { nom: true, email: true, role: true, createdAt: true },
      });
      return resultatListe(
        T('Utilisateurs récemment créés'),
        [
          { key: 'nom', label: 'Nom', type: 'texte' },
          { key: 'email', label: 'E-mail', type: 'texte' },
          { key: 'role', label: 'Rôle', type: 'texte' },
          { key: 'date', label: 'Créé le', type: 'date' },
        ],
        users.map((u) => ({ nom: u.nom, email: u.email, role: u.role, date: u.createdAt.toISOString() })),
        users.length,
        `${users.length} dernier(s) compte(s) créé(s).`
      );
    },
  },
  {
    id: 'ADMIN_UTILISATEURS_DESACTIVES',
    role: 'ADMINISTRATEUR',
    categorie: 'Utilisateurs',
    question: 'Quels utilisateurs ont été récemment désactivés ?',
    params: [],
    presentation: 'LISTE',
    async impl() {
      const users = await db.utilisateur.findMany({
        where: { actif: false },
        orderBy: { updatedAt: 'desc' },
        take: LIMITE_LISTE,
        select: { nom: true, email: true, role: true, updatedAt: true },
      });
      if (users.length === 0) return resultatVide(T('Utilisateurs désactivés'));
      return resultatListe(
        T('Utilisateurs récemment désactivés'),
        [
          { key: 'nom', label: 'Nom', type: 'texte' },
          { key: 'email', label: 'E-mail', type: 'texte' },
          { key: 'role', label: 'Rôle', type: 'texte' },
          { key: 'date', label: 'Désactivé le', type: 'date' },
        ],
        users.map((u) => ({ nom: u.nom, email: u.email, role: u.role, date: u.updatedAt.toISOString() })),
        users.length,
        `${users.length} compte(s) désactivé(s).`
      );
    },
  },

  // ─── Référentiel ───────────────────────────────────────────────────────────
  {
    id: 'ADMIN_SOCIETES_ACTIVES',
    role: 'ADMINISTRATEUR',
    categorie: 'Référentiel',
    question: 'Combien de sociétés clientes sont actives ?',
    params: [],
    presentation: 'NOMBRE',
    async impl() {
      const actives = await db.societe.count({ where: { contrats: { some: { statut: 'ACTIF' } } } });
      const total = await db.societe.count();
      return resultatNombre(T('Sociétés actives'), actives,
        `${fmtNb(actives)} société(s) cliente(s) active(s) (avec contrat ACTIF) sur ${fmtNb(total)} enregistrée(s).`, null, 'sociétés');
    },
  },
  {
    id: 'ADMIN_PRESTATAIRES_ACTIFS',
    role: 'ADMINISTRATEUR',
    categorie: 'Référentiel',
    question: 'Combien de prestataires sont actifs ?',
    params: [],
    presentation: 'NOMBRE',
    async impl() {
      const actifs = await db.prestataire.count({ where: { actif: true } });
      const total = await db.prestataire.count();
      return resultatNombre(T('Prestataires actifs'), actifs,
        `${fmtNb(actifs)} prestataire(s) actif(s) sur ${fmtNb(total)} enregistré(s).`, null, 'prestataires');
    },
  },
  {
    id: 'ADMIN_ASSURES_TOTAL',
    role: 'ADMINISTRATEUR',
    categorie: 'Référentiel',
    question: "Combien d'assurés sont enregistrés ?",
    params: [],
    presentation: 'NOMBRE',
    async impl() {
      const total = await db.assure.count();
      const actifs = await db.assure.count({ where: { actif: true } });
      return resultatNombre(T('Assurés enregistrés'), total,
        `${fmtNb(total)} assuré(s) enregistré(s), dont ${fmtNb(actifs)} actif(s).`, null, 'assurés');
    },
  },
  {
    id: 'ADMIN_CONTRATS_ACTIFS',
    role: 'ADMINISTRATEUR',
    categorie: 'Référentiel',
    question: 'Combien de contrats sont actuellement actifs ?',
    params: [],
    presentation: 'NOMBRE',
    async impl() {
      const total = await db.contrat.count({ where: { statut: 'ACTIF' } });
      return resultatNombre(T('Contrats actifs'), total,
        `${fmtNb(total)} contrat(s) actuellement au statut ACTIF.`, null, 'contrats');
    },
  },

  // ─── Dossiers ──────────────────────────────────────────────────────────────
  {
    id: 'ADMIN_DOSSIERS_OUVERTS',
    role: 'ADMINISTRATEUR',
    categorie: 'Dossiers',
    question: 'Combien de dossiers sont actuellement ouverts ?',
    params: [],
    presentation: 'NOMBRE',
    async impl(ctx) {
      const total = await db.dossier.count({
        where: { statut: { in: STATUTS_EN_COURS }, ...scopeWhere(ctx) },
      });
      const totalTous = await db.dossier.count({ where: scopeWhere(ctx) });
      return resultatNombre(T('Dossiers ouverts'), total,
        `${fmtNb(total)} dossier(s) ouvert(s) (non clôturé(s)) sur ${fmtNb(totalTous)} au total.`);
    },
  },
  {
    id: 'ADMIN_DOSSIERS_ATTENTE',
    role: 'ADMINISTRATEUR',
    categorie: 'Dossiers',
    question: 'Combien de dossiers sont en attente de traitement ?',
    params: [],
    presentation: 'NOMBRE',
    async impl(ctx) {
      const total = await db.dossier.count({
        where: { statut: { in: STATUTS_ATTENTE }, ...scopeWhere(ctx) },
      });
      return resultatNombre(T('Dossiers en attente'), total,
        `${fmtNb(total)} dossier(s) en attente (Reçu ou En analyse).`);
    },
  },
  {
    id: 'ADMIN_REPARTITION_STATUT',
    role: 'ADMINISTRATEUR',
    categorie: 'Dossiers',
    question: 'Quelle est la répartition des dossiers par statut ?',
    params: [],
    presentation: 'TABLEAU',
    async impl(ctx) {
      const rows = await db.dossier.groupBy({
        by: ['statut'],
        _count: { statut: true },
        where: scopeWhere(ctx) as Prisma.DossierWhereInput,
      });
      const total = rows.reduce((s, r) => s + r._count.statut, 0);
      rows.sort((a, b) => b._count.statut - a._count.statut);
      return resultatTableau(
        T('Répartition par statut'),
        [
          { key: 'statut', label: 'Statut', type: 'statut' },
          { key: 'nb', label: 'Nombre', type: 'nombre' },
          { key: 'pct', label: 'Part (%)', type: 'nombre' },
        ],
        rows.map((r) => ({
          statut: statutLabel(r.statut),
          nb: r._count.statut,
          pct: total > 0 ? Math.round((r._count.statut / total) * 100) : 0,
        })),
        rows.length,
        `Répartition de ${fmtNb(total)} dossier(s) par statut de traitement.`
      );
    },
  },
  {
    id: 'ADMIN_SOCIETES_TOP_DOSSIERS',
    role: 'ADMINISTRATEUR',
    categorie: 'Dossiers',
    question: 'Quelles sociétés clientes ont le plus de dossiers ?',
    params: [],
    presentation: 'TABLEAU',
    async impl() {
      const rows = await db.dossier.groupBy({
        by: ['societeId'],
        _count: true,
        _sum: { montantReclame: true, montantPaye: true },
      });
      const ids = rows.map((r) => r.societeId);
      const societes = await db.societe.findMany({ where: { id: { in: ids } }, select: { id: true, nom: true } });
      const noms = new Map(societes.map((s) => [s.id, s.nom]));
      const lignes = rows
        .map((r) => ({
          societe: noms.get(r.societeId) ?? 'Inconnu',
          nb: r._count,
          montant: round2(r._sum.montantReclame),
          paye: round2(r._sum.montantPaye),
        }))
        .sort((a, b) => b.nb - a.nb)
        .slice(0, LIMITE_LISTE);
      if (lignes.length === 0) return resultatVide(T('Top sociétés'));
      return resultatTableau(
        T('Sociétés avec le plus de dossiers'),
        [
          { key: 'societe', label: 'Société', type: 'texte' },
          { key: 'nb', label: 'Nb dossiers', type: 'nombre' },
          { key: 'montant', label: 'Réclamé', type: 'montant' },
          { key: 'paye', label: 'Payé', type: 'montant' },
        ],
        lignes,
        lignes.length,
        `Classement des sociétés clientes par volume de dossiers.`
      );
    },
  },

  // ─── Finances ──────────────────────────────────────────────────────────────
  {
    id: 'ADMIN_TOTAL_REMBOURSEMENTS',
    role: 'ADMINISTRATEUR',
    categorie: 'Finances',
    question: 'Quel est le montant total des remboursements sur une période donnée ?',
    params: [{ key: 'PERIODE', label: 'Période' }],
    presentation: 'MONTANT',
    async impl(ctx, params) {
      const periode = P(params);
      const res = await db.dossier.aggregate({
        where: { statut: 'PAYE', datePaiement: { gte: periode.du, lte: periode.au }, ...scopeWhere(ctx) },
        _sum: { montantPaye: true },
        _count: true,
      });
      const total = round2(res._sum.montantPaye);
      return resultatMontant(T('Total remboursements'), total,
        `${fmtAr(total)} versés au titre de ${fmtNb(res._count)} remboursement(s) — ${periode.label}.`, periode);
    },
  },
  {
    id: 'ADMIN_TOTAL_FACTURES',
    role: 'ADMINISTRATEUR',
    categorie: 'Finances',
    question: 'Quel est le montant total des factures émises sur une période donnée ?',
    params: [{ key: 'PERIODE', label: 'Période' }],
    presentation: 'MONTANT',
    note: 'Les « factures » correspondent aux dossiers de soins réclamés par les prestataires (montant réclamé).',
    async impl(ctx, params) {
      const periode = P(params);
      const res = await db.dossier.aggregate({
        where: { dateReception: { gte: periode.du, lte: periode.au }, ...scopeWhere(ctx) },
        _sum: { montantReclame: true },
        _count: true,
      });
      const total = round2(res._sum.montantReclame);
      return resultatMontant(T('Total factures émises'), total,
        `${fmtAr(total)} réclamés au titre de ${fmtNb(res._count)} dossier(s) de soins — ${periode.label}.`, periode);
    },
  },
  {
    id: 'ADMIN_TOTAL_REGLEMENTS',
    role: 'ADMINISTRATEUR',
    categorie: 'Finances',
    question: 'Quel est le montant total des règlements effectués sur une période donnée ?',
    params: [{ key: 'PERIODE', label: 'Période' }],
    presentation: 'MONTANT',
    async impl(ctx, params) {
      const periode = P(params);
      const res = await db.dossier.aggregate({
        where: { datePaiement: { gte: periode.du, lte: periode.au }, ...scopeWhere(ctx) },
        _sum: { montantPaye: true },
      });
      const total = round2(res._sum.montantPaye);
      return resultatMontant(T('Total règlements'), total,
        `${fmtAr(total)} de règlements enregistrés — ${periode.label}.`, periode);
    },
  },
  {
    id: 'ADMIN_FACTURES_IMPAYEES',
    role: 'ADMINISTRATEUR',
    categorie: 'Finances',
    question: 'Quel est le montant des factures actuellement impayées ?',
    params: [],
    presentation: 'MONTANT',
    async impl(ctx) {
      const res = await db.dossier.aggregate({
        where: { statut: { in: STATUTS_EN_COURS }, ...scopeWhere(ctx) },
        _sum: { montantReclame: true, montantPaye: true },
        _count: true,
      });
      const solde = round2(enNombre(res._sum.montantReclame) - enNombre(res._sum.montantPaye));
      return resultatMontant(T('Factures impayées'), solde,
        `${fmtAr(solde)} restant à régler sur ${fmtNb(res._count)} dossier(s) en cours.`);
    },
  },
  {
    id: 'ADMIN_PRESTATAIRES_TOP',
    role: 'ADMINISTRATEUR',
    categorie: 'Finances',
    question: 'Quels sont les prestataires les plus actifs sur une période donnée ?',
    params: [{ key: 'PERIODE', label: 'Période' }],
    presentation: 'TABLEAU',
    async impl(ctx, params) {
      const periode = P(params);
      const rows = await db.dossier.groupBy({
        by: ['prestataireId'],
        where: {
          dateReception: { gte: periode.du, lte: periode.au },
          prestataireId: { not: null },
          ...scopeWhere(ctx),
        } as Prisma.DossierWhereInput,
        _count: true,
        _sum: { montantReclame: true },
      });
      const ids = rows.map((r) => r.prestataireId!).filter(Boolean);
      const prests = ids.length
        ? await db.prestataire.findMany({ where: { id: { in: ids } }, select: { id: true, nom: true } })
        : [];
      const noms = new Map(prests.map((p) => [p.id, p.nom]));
      const lignes = rows
        .map((r) => ({ prestataire: noms.get(r.prestataireId!) ?? 'Inconnu', nb: r._count, montant: round2(r._sum.montantReclame) }))
        .sort((a, b) => b.nb - a.nb)
        .slice(0, LIMITE_LISTE);
      if (lignes.length === 0) return resultatVide(T('Top prestataires'), periode);
      return resultatTableau(
        T('Prestataires les plus actifs'),
        [
          { key: 'prestataire', label: 'Prestataire', type: 'texte' },
          { key: 'nb', label: 'Nb dossiers', type: 'nombre' },
          { key: 'montant', label: 'Montant réclamé', type: 'montant' },
        ],
        lignes, lignes.length,
        `Classement des prestataires par volume de dossiers — ${periode.label}.`, periode);
    },
  },
  {
    id: 'ADMIN_EVOLUTION_REMBOURSEMENTS',
    role: 'ADMINISTRATEUR',
    categorie: 'Finances',
    question: "Quelle est l'évolution des remboursements par mois ?",
    params: [{ key: 'PERIODE', label: 'Période' }],
    presentation: 'GRAPHIQUE',
    async impl(ctx, params) {
      const periode = P(params);
      const serie = await serieMensuelle({
        champDate: 'datePaiement',
        champSomme: 'montantPaye',
        periode,
        filtres: [scopeSql(ctx)],
      });
      const total = serie.reduce((s, p) => s + p.valeur, 0);
      if (total === 0) return resultatVide(T('Évolution remboursements'), periode);
      return resultatGraphique(T('Évolution des remboursements par mois'),
        serie, 'Montant payé (Ar)',
        `Total de ${fmtAr(total)} réparti par mois de paiement — ${periode.label}.`, periode);
    },
  },

  // ─── Suivi & audit ─────────────────────────────────────────────────────────
  {
    id: 'ADMIN_DERNIERES_OPERATIONS',
    role: 'ADMINISTRATEUR',
    categorie: 'Suivi & audit',
    question: 'Quelles sont les dernières opérations enregistrées dans la plateforme ?',
    params: [],
    presentation: 'LISTE',
    async impl() {
      const ops = await db.historiqueParametre.findMany({
        orderBy: { dateModification: 'desc' },
        take: LIMITE_LISTE,
        select: { dateModification: true, module: true, objet: true, action: true, modifiePar: true },
      });
      if (ops.length === 0) return resultatVide(T('Dernières opérations'));
      return resultatListe(
        T('Dernières opérations enregistrées'),
        [
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'module', label: 'Module', type: 'texte' },
          { key: 'objet', label: 'Objet', type: 'texte' },
          { key: 'action', label: 'Action', type: 'texte' },
          { key: 'par', label: 'Par', type: 'texte' },
        ],
        ops.map((o) => ({
          date: o.dateModification.toISOString(),
          module: o.module ?? '—',
          objet: o.objet ?? '—',
          action: o.action,
          par: o.modifiePar,
        })),
        ops.length,
        `${ops.length} dernière(s) opération(s) tracée(s) dans le journal d'audit.`
      );
    },
  },
  {
    id: 'ADMIN_ANOMALIES_VERIFIER',
    role: 'ADMINISTRATEUR',
    categorie: 'Suivi & audit',
    question: 'Quelles anomalies ou opérations nécessitent une vérification ?',
    params: [],
    presentation: 'KPI',
    async impl() {
      const [retards, anomalies] = await Promise.all([findRetards(), findAnomalies()]);
      if (retards.length === 0 && anomalies.length === 0) {
        return resultatVide(T('Anomalies à vérifier'));
      }
      return resultatKpi(
        T('Opérations nécessitant une vérification'),
        [
          { label: 'Dossiers en retard de traitement', valeur: retards.length, type: 'nombre' },
          { label: 'Anomalies détectées', valeur: anomalies.length, type: 'nombre' },
        ],
        `${retards.length} retard(s) et ${anomalies.length} anomalie(s) détectée(s) par les contrôles automatiques de la plateforme.`);
    },
  },
];
