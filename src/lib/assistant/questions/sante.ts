import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import type { ParamValeurs, QuestionDef } from '../types';
import { AssistantError } from '../types';
import { resolvePeriode } from '../periods';
import { extrairePeriode } from '../context';
import {
  resultatNombre, resultatMontant, resultatTableau, resultatListe,
  resultatGraphique, resultatVide,
  round2, fmtAr, fmtNb, statutLabel, STATUTS_ATTENTE,
  serieMensuelle, COLONNES_DOSSIER, LIMITE_LISTE,
} from '../results';
import { findRetards } from '@/lib/kpi-queries';

// ─── Catalogue CONTRÔLE SANTÉ — 20 questions prédéfinies ─────────────────────
// Périmètre : dossiers de soins, contrôle médical, rejets. Ce rôle n'accède
// volontairement pas aux questions financières de synthèse (règle plateforme).

const T = (question: string) => ({ question });
const P = (params: ParamValeurs) => resolvePeriode(extrairePeriode(params));

function debutJournee(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export const questionsSante: QuestionDef[] = [
  // ─── Dossiers de contrôle ──────────────────────────────────────────────────
  {
    id: 'CONTROLE_DOSSIERS_EN_ATTENTE',
    role: 'SANTE',
    categorie: 'Dossiers de contrôle',
    question: 'Combien de dossiers sont actuellement en attente de contrôle ?',
    params: [],
    presentation: 'NOMBRE',
    async impl() {
      const total = await db.dossier.count({ where: { statut: { in: STATUTS_ATTENTE } } });
      return resultatNombre(T('Dossiers en attente de contrôle'), total,
        `${fmtNb(total)} dossier(s) en attente de contrôle (Reçu / En analyse).`);
    },
  },
  {
    id: 'CONTROLE_DOSSIERS_JOUR',
    role: 'SANTE',
    categorie: 'Dossiers de contrôle',
    question: "Combien de dossiers ont été contrôlés aujourd'hui ?",
    params: [],
    presentation: 'NOMBRE',
    async impl() {
      const total = await db.dossier.count({
        where: { dateTraitementTechnique: { gte: debutJournee() } },
      });
      return resultatNombre(T("Dossiers contrôlés aujourd'hui"), total,
        `${fmtNb(total)} dossier(s) passé(s) en contrôle technique aujourd'hui.`);
    },
  },
  {
    id: 'CONTROLE_DOSSIERS_VALIDES',
    role: 'SANTE',
    categorie: 'Dossiers de contrôle',
    question: 'Combien de dossiers ont été validés ?',
    params: [],
    presentation: 'NOMBRE',
    async impl() {
      const total = await db.dossier.count({ where: { statut: { in: ['VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE'] } } });
      return resultatNombre(T('Dossiers validés'), total,
        `${fmtNb(total)} dossier(s) validé(s) (statut après contrôle, jusqu'au paiement).`);
    },
  },
  {
    id: 'CONTROLE_DOSSIERS_REJETES',
    role: 'SANTE',
    categorie: 'Dossiers de contrôle',
    question: 'Combien de dossiers ont été rejetés ?',
    params: [],
    presentation: 'NOMBRE',
    async impl() {
      const total = await db.dossier.count({ where: { statut: 'REJETE' } });
      return resultatNombre(T('Dossiers rejetés'), total, `${fmtNb(total)} dossier(s) rejeté(s) au total.`);
    },
  },
  {
    id: 'CONTROLE_DOSSIERS_PIECES_ATTENTE',
    role: 'SANTE',
    categorie: 'Dossiers de contrôle',
    question: 'Combien de dossiers sont en attente de pièces complémentaires ?',
    params: [],
    presentation: 'NOMBRE',
    note: 'Dossiers en analyse sans aucun justificatif joint.',
    async impl() {
      const candidats = await db.dossier.findMany({
        where: { statut: { in: ['RECU', 'EN_ANALYSE'] } },
        select: { id: true },
        take: 500,
      });
      const ids = candidats.map((d) => d.id);
      const avecJustif = ids.length
        ? new Set(
            (await db.justificatif.findMany({
              where: { dossierId: { in: ids } },
              select: { dossierId: true },
            })).map((j) => j.dossierId)
          )
        : new Set<string>();
      const total = candidats.filter((d) => !avecJustif.has(d.id)).length;
      return resultatNombre(T('Dossiers en attente de pièces complémentaires'), total,
        `${fmtNb(total)} dossier(s) en cours sans justificatif joint (pièces à demander).`);
    },
  },
  {
    id: 'CONTROLE_DOSSIERS_ATTENTE_LISTE',
    role: 'SANTE',
    categorie: 'Dossiers de contrôle',
    question: 'Quels dossiers sont actuellement en attente de contrôle ?',
    params: [],
    presentation: 'LISTE',
    async impl() {
      const where: Prisma.DossierWhereInput = { statut: { in: STATUTS_ATTENTE } };
      const { total, lignes } = await lignesLocales(where, 'dateReception');
      if (total === 0) return resultatVide(T('Dossiers en attente de contrôle'));
      return resultatListe(T('Dossiers actuellement en attente de contrôle'), COLONNES_DOSSIER, lignes, total,
        `${fmtNb(total)} dossier(s) en attente (les plus récents d'abord).`);
    },
  },
  {
    id: 'CONTROLE_DOSSIERS_REJETES_LISTE',
    role: 'SANTE',
    categorie: 'Dossiers de contrôle',
    question: 'Quels dossiers ont été rejetés ?',
    params: [],
    presentation: 'LISTE',
    async impl() {
      const where: Prisma.DossierWhereInput = { statut: 'REJETE' };
      const total = await db.dossier.count({ where });
      const dossiers = await db.dossier.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: LIMITE_LISTE,
        select: {
          numeroDossier: true, beneficiaire: true, typeDossier: true, statut: true,
          dateReception: true, montantReclame: true, motifRejet: true,
        },
      });
      if (total === 0) return resultatVide(T('Dossiers rejetés'));
      return resultatListe(
        T('Dossiers rejetés (motifs inclus)'),
        [...COLONNES_DOSSIER, { key: 'motif', label: 'Motif de rejet', type: 'texte' }],
        dossiers.map((d) => ({
          numero: d.numeroDossier,
          beneficiaire: d.beneficiaire,
          type: d.typeDossier,
          statut: statutLabel(d.statut),
          date: d.dateReception.toISOString(),
          montant: round2(d.montantReclame),
          motif: d.motifRejet ?? '—',
        })),
        total,
        `${fmtNb(total)} dossier(s) rejeté(s).`
      );
    },
  },
  {
    id: 'CONTROLE_MOTIFS_REJET',
    role: 'SANTE',
    categorie: 'Dossiers de contrôle',
    question: 'Quels sont les motifs de rejet les plus fréquents ?',
    params: [],
    presentation: 'TABLEAU',
    async impl() {
      const rows = await db.dossier.groupBy({
        by: ['motifRejet'],
        where: { statut: 'REJETE' },
        _count: { motifRejet: true },
      });
      const lignes = rows
        .filter((r) => r.motifRejet)
        .sort((a, b) => b._count.motifRejet - a._count.motifRejet)
        .slice(0, LIMITE_LISTE);
      if (lignes.length === 0) return resultatVide(T('Motifs de rejet'));
      return resultatTableau(
        T('Motifs de rejet les plus fréquents'),
        [
          { key: 'motif', label: 'Motif', type: 'texte' },
          { key: 'nb', label: 'Nombre', type: 'nombre' },
        ],
        lignes.map((r) => ({ motif: r.motifRejet ?? '—', nb: r._count.motifRejet })),
        lignes.length,
        `${lignes.length} motif(s) de rejet enregistré(s) sur les dossiers rejetés.`
      );
    },
  },
  {
    id: 'CONTROLE_ATTENTE_LONGTEMPS',
    role: 'SANTE',
    categorie: 'Dossiers de contrôle',
    question: 'Quels dossiers sont en attente depuis le plus longtemps ?',
    params: [],
    presentation: 'LISTE',
    async impl() {
      const where: Prisma.DossierWhereInput = { statut: { in: STATUTS_ATTENTE } };
      const total = await db.dossier.count({ where });
      const dossiers = await db.dossier.findMany({
        where,
        orderBy: { dateReception: 'asc' },
        take: LIMITE_LISTE,
        select: {
          numeroDossier: true, beneficiaire: true, typeDossier: true, statut: true,
          dateReception: true, montantReclame: true,
        },
      });
      if (total === 0) return resultatVide(T('Dossiers en attente les plus anciens'));
      return resultatListe(T('Dossiers en attente depuis le plus longtemps'), COLONNES_DOSSIER,
        dossiers.map((d) => ({
          numero: d.numeroDossier,
          beneficiaire: d.beneficiaire,
          type: d.typeDossier,
          statut: statutLabel(d.statut),
          date: d.dateReception.toISOString(),
          montant: round2(d.montantReclame),
        })),
        total,
        `Les ${dossiers.length} dossiers en attente les plus anciens (sur ${fmtNb(total)}).`
      );
    },
  },

  // ─── Prestations & actes ───────────────────────────────────────────────────
  {
    id: 'CONTROLE_PRESTATIONS_PERIODE',
    role: 'SANTE',
    categorie: 'Prestations',
    question: 'Combien de prestations ont été réalisées sur une période donnée ?',
    params: [{ key: 'PERIODE', label: 'Période' }],
    presentation: 'NOMBRE',
    async impl(_ctx, params) {
      const periode = P(params);
      const total = await db.dossier.count({ where: { dateSoins: { gte: periode.du, lte: periode.au } } });
      return resultatNombre(T('Prestations réalisées'), total,
        `${fmtNb(total)} prestation(s) avec date de soins sur la période — ${periode.label}.`, periode);
    },
  },
  {
    id: 'CONTROLE_ACTES_TOP',
    role: 'SANTE',
    categorie: 'Prestations',
    question: 'Quels actes médicaux sont les plus réalisés ?',
    params: [],
    presentation: 'TABLEAU',
    async impl() {
      const rows = await db.dossier.groupBy({
        by: ['typeDossier'],
        _count: { typeDossier: true },
        _sum: { montantReclame: true },
      });
      const lignes = rows
        .sort((a, b) => b._count.typeDossier - a._count.typeDossier)
        .slice(0, LIMITE_LISTE);
      if (lignes.length === 0) return resultatVide(T('Actes les plus réalisés'));
      return resultatTableau(
        T('Actes médicaux les plus réalisés'),
        [
          { key: 'acte', label: 'Acte', type: 'texte' },
          { key: 'nb', label: 'Nombre', type: 'nombre' },
          { key: 'montant', label: 'Montant réclamé', type: 'montant' },
        ],
        lignes.map((r) => ({ acte: r.typeDossier, nb: r._count.typeDossier, montant: round2(r._sum.montantReclame) })),
        lignes.length,
        `${lignes.length} type(s) d'acte(s) enregistré(s).`
      );
    },
  },
  {
    id: 'CONTROLE_PRESTATAIRES_TOP',
    role: 'SANTE',
    categorie: 'Prestations',
    question: 'Quels prestataires ont réalisé le plus d\u2019actes ?',
    params: [],
    presentation: 'TABLEAU',
    async impl() {
      const rows = await db.dossier.groupBy({
        by: ['prestataireId'],
        where: { prestataireId: { not: null } },
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
      if (lignes.length === 0) return resultatVide(T('Top prestataires'));
      return resultatTableau(
        T('Prestataires ayant réalisé le plus d\u2019actes'),
        [
          { key: 'prestataire', label: 'Prestataire', type: 'texte' },
          { key: 'nb', label: 'Nb dossiers', type: 'nombre' },
          { key: 'montant', label: 'Montant réclamé', type: 'montant' },
        ],
        lignes, lignes.length, `${lignes.length} prestataire(s) référencé(s) sur les dossiers.`);
    },
  },
  {
    id: 'CONTROLE_ACTES_PRESTATAIRE',
    role: 'SANTE',
    categorie: 'Prestations',
    question: "Combien d'actes ont été réalisés par un prestataire donné ?",
    params: [{ key: 'PRESTATAIRE', label: 'Prestataire', required: true }],
    presentation: 'NOMBRE',
    async impl(_ctx, params) {
      const prestataireId = params.PRESTATAIRE;
      if (!prestataireId) throw new AssistantError('Prestataire requis.');
      const prest = await db.prestataire.findUnique({ where: { id: prestataireId }, select: { nom: true } });
      if (!prest) return resultatVide(T("Actes du prestataire"));
      const total = await db.dossier.count({ where: { prestataireId } });
      return resultatNombre(T(`Actes réalisés par ${prest.nom}`), total,
        `${fmtNb(total)} dossier(s) de soins rattaché(s) à ${prest.nom}.`);
    },
  },

  // ─── Montants contrôlés ────────────────────────────────────────────────────
  {
    id: 'CONTROLE_MONTANT_CONTROLE',
    role: 'SANTE',
    categorie: 'Montants contrôlés',
    question: 'Quel est le montant total des prestations contrôlées ?',
    params: [],
    presentation: 'MONTANT',
    async impl() {
      const res = await db.dossier.aggregate({
        where: { dateTraitementTechnique: { not: null } },
        _sum: { montantReclame: true },
        _count: true,
      });
      return resultatMontant(T('Montant des prestations contrôlées'), round2(res._sum.montantReclame),
        `${fmtAr(round2(res._sum.montantReclame))} réclamés sur ${fmtNb(res._count)} dossier(s) passés en contrôle.`);
    },
  },
  {
    id: 'CONTROLE_MONTANT_VALIDE',
    role: 'SANTE',
    categorie: 'Montants contrôlés',
    question: 'Quel est le montant total des prestations validées ?',
    params: [],
    presentation: 'MONTANT',
    async impl() {
      const res = await db.dossier.aggregate({ _sum: { montantValide: true } });
      return resultatMontant(T('Montant des prestations validées'), round2(res._sum.montantValide),
        `${fmtAr(round2(res._sum.montantValide))} de montants validés au contrôle.`);
    },
  },
  {
    id: 'CONTROLE_MONTANT_REJETE',
    role: 'SANTE',
    categorie: 'Montants contrôlés',
    question: 'Quel est le montant total des prestations rejetées ?',
    params: [],
    presentation: 'MONTANT',
    async impl() {
      const res = await db.dossier.aggregate({
        where: { statut: 'REJETE' },
        _sum: { montantReclame: true },
        _count: true,
      });
      return resultatMontant(T('Montant des prestations rejetées'), round2(res._sum.montantReclame),
        `${fmtAr(round2(res._sum.montantReclame))} réclamés sur ${fmtNb(res._count)} dossier(s) rejeté(s).`);
    },
  },
  {
    id: 'CONTROLE_REPARTITION_STATUT',
    role: 'SANTE',
    categorie: 'Montants contrôlés',
    question: 'Quelle est la répartition des dossiers par statut de contrôle ?',
    params: [],
    presentation: 'TABLEAU',
    async impl() {
      const rows = await db.dossier.groupBy({ by: ['statut'], _count: { statut: true } });
      rows.sort((a, b) => b._count.statut - a._count.statut);
      return resultatTableau(
        T('Répartition des dossiers par statut'),
        [
          { key: 'statut', label: 'Statut', type: 'statut' },
          { key: 'nb', label: 'Nombre', type: 'nombre' },
        ],
        rows.map((r) => ({ statut: statutLabel(r.statut), nb: r._count.statut })),
        rows.length,
        `${rows.length} statut(s) de traitement représenté(s).`
      );
    },
  },
  {
    id: 'CONTROLE_EVOLUTION_CONTROLES',
    role: 'SANTE',
    categorie: 'Montants contrôlés',
    question: "Quelle est l'évolution du nombre de dossiers contrôlés ?",
    params: [{ key: 'PERIODE', label: 'Période' }],
    presentation: 'GRAPHIQUE',
    async impl(_ctx, params) {
      const periode = P(params);
      const serie = await serieMensuelle({ champDate: 'dateTraitementTechnique', periode });
      const total = serie.reduce((s, p) => s + p.valeur, 0);
      if (total === 0) return resultatVide(T('Évolution des dossiers contrôlés'), periode);
      return resultatGraphique(T('Évolution du nombre de dossiers contrôlés'), serie, 'Dossiers contrôlés',
        `${fmtNb(total)} dossier(s) contrôlé(s) — ${periode.label}.`, periode);
    },
  },

  // ─── Vigilance ─────────────────────────────────────────────────────────────
  {
    id: 'CONTROLE_PRESTATAIRES_REJETS',
    role: 'SANTE',
    categorie: 'Vigilance',
    question: 'Quels prestataires présentent le plus de dossiers rejetés ?',
    params: [],
    presentation: 'TABLEAU',
    async impl() {
      const rows = await db.dossier.groupBy({
        by: ['prestataireId'],
        where: { statut: 'REJETE', prestataireId: { not: null } },
        _count: true,
      });
      const ids = rows.map((r) => r.prestataireId!).filter(Boolean);
      const prests = ids.length
        ? await db.prestataire.findMany({ where: { id: { in: ids } }, select: { id: true, nom: true } })
        : [];
      const noms = new Map(prests.map((p) => [p.id, p.nom]));
      const lignes = rows
        .map((r) => ({ prestataire: noms.get(r.prestataireId!) ?? 'Inconnu', nb: r._count }))
        .sort((a, b) => b.nb - a.nb)
        .slice(0, LIMITE_LISTE);
      if (lignes.length === 0) return resultatVide(T('Prestataires avec rejets'));
      return resultatTableau(
        T('Prestataires présentant le plus de dossiers rejetés'),
        [
          { key: 'prestataire', label: 'Prestataire', type: 'texte' },
          { key: 'nb', label: 'Dossiers rejetés', type: 'nombre' },
        ],
        lignes, lignes.length, `${lignes.length} prestataire(s) avec au moins un dossier rejeté.`);
    },
  },
  {
    id: 'CONTROLE_PRESTATIONS_ATTENTION',
    role: 'SANTE',
    categorie: 'Vigilance',
    question: 'Quelles prestations nécessitent une attention particulière ?',
    params: [],
    presentation: 'LISTE',
    note: 'Dossiers dépassant les délais de traitement de référence (contrôles automatiques).',
    async impl() {
      const retards = await findRetards();
      if (retards.length === 0) return resultatVide(T('Prestations à surveiller'));
      return resultatListe(
        T('Prestations nécessitant une attention particulière (délais dépassés)'),
        [
          { key: 'numero', label: 'N° dossier', type: 'texte' },
          { key: 'beneficiaire', label: 'Bénéficiaire', type: 'texte' },
          { key: 'statut', label: 'Statut', type: 'statut' },
          { key: 'retard', label: 'Jours de retard', type: 'nombre' },
          { key: 'service', label: 'Service en cause', type: 'texte' },
        ],
        retards.slice(0, LIMITE_LISTE).map((r) => ({
          numero: r.numeroDossier,
          beneficiaire: r.beneficiaire,
          statut: statutLabel(r.statut),
          retard: r.joursRetard,
          service: r.serviceEnCause,
        })),
        retards.length,
        `${fmtNb(retards.length)} dossier(s) dépassent les délais de traitement de référence.`
      );
    },
  },
];

// ─── Helper local ────────────────────────────────────────────────────────────

async function lignesLocales(where: Prisma.DossierWhereInput, orderBy: 'dateReception' | 'updatedAt') {
  const [total, dossiers] = await Promise.all([
    db.dossier.count({ where }),
    db.dossier.findMany({
      where,
      orderBy: { [orderBy]: 'desc' },
      take: LIMITE_LISTE,
      select: {
        numeroDossier: true, beneficiaire: true, typeDossier: true, statut: true,
        dateReception: true, montantReclame: true,
      },
    }),
  ]);
  return {
    total,
    lignes: dossiers.map((d) => ({
      numero: d.numeroDossier,
      beneficiaire: d.beneficiaire,
      type: d.typeDossier,
      statut: statutLabel(d.statut),
      date: d.dateReception.toISOString(),
      montant: round2(d.montantReclame),
    })),
  };
}
