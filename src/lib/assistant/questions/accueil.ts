import { db } from '@/lib/db';
import type { ParamValeurs, QuestionDef } from '../types';
import { AssistantError } from '../types';
import {
  resultatNombre, resultatTableau, resultatListe, resultatKpi, resultatVide,
  fmtAr, fmtNb, statutLabel, STATUTS_ATTENTE, COLONNES_DOSSIER, lignesDossiers, LIMITE_LISTE,
} from '../results';

// ─── Catalogue ACCUEIL — 20 questions prédéfinies ────────────────────────────
// Périmètre : global (rôle interne de réception/enregistrement).

const T = (question: string) => ({ question });

function debutJournee(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export const questionsAccueil: QuestionDef[] = [
  // ─── Assurés ───────────────────────────────────────────────────────────────
  {
    id: 'ACCUEIL_ASSURES_TOTAL',
    role: 'ACCUEIL',
    categorie: 'Assurés',
    question: "Combien d'assurés sont actuellement enregistrés ?",
    params: [],
    presentation: 'NOMBRE',
    async impl() {
      const total = await db.assure.count();
      return resultatNombre(T('Assurés enregistrés'), total, `${fmtNb(total)} assuré(s) enregistré(s).`);
    },
  },
  {
    id: 'ACCUEIL_ASSURES_ACTIFS',
    role: 'ACCUEIL',
    categorie: 'Assurés',
    question: "Combien d'assurés sont actifs ?",
    params: [],
    presentation: 'NOMBRE',
    async impl() {
      const total = await db.assure.count({ where: { actif: true } });
      return resultatNombre(T('Assurés actifs'), total, `${fmtNb(total)} assuré(s) actif(s).`);
    },
  },
  {
    id: 'ACCUEIL_ASSURES_RECENTS',
    role: 'ACCUEIL',
    categorie: 'Assurés',
    question: 'Quels sont les assurés récemment enregistrés ?',
    params: [],
    presentation: 'LISTE',
    async impl() {
      const assures = await db.assure.findMany({
        orderBy: { createdAt: 'desc' },
        take: LIMITE_LISTE,
        select: { nom: true, prenom: true, matricule: true, societeId: true, createdAt: true, societe: { select: { nom: true } } },
      });
      return resultatListe(
        T('Assurés récemment enregistrés'),
        [
          { key: 'nom', label: 'Nom', type: 'texte' },
          { key: 'societe', label: 'Société', type: 'texte' },
          { key: 'matricule', label: 'Matricule', type: 'texte' },
          { key: 'date', label: 'Enregistré le', type: 'date' },
        ],
        assures.map((a) => ({
          nom: [a.nom, a.prenom].filter(Boolean).join(' '),
          societe: a.societe?.nom ?? '—',
          matricule: a.matricule ?? '—',
          date: a.createdAt.toISOString(),
        })),
        assures.length,
        `${assures.length} dernier(s) assuré(s) enregistré(s).`
      );
    },
  },
  {
    id: 'ACCUEIL_ASSURES_A_VERIFIER',
    role: 'ACCUEIL',
    categorie: 'Assurés',
    question: "Quels sont les assurés dont le dossier doit être vérifié ?",
    params: [],
    presentation: 'LISTE',
    note: 'Assurés ayant au moins un dossier au statut Reçu ou En analyse.',
    async impl() {
      const dossiers = await db.dossier.findMany({
        where: { statut: { in: STATUTS_ATTENTE }, assureId: { not: null } },
        select: { assureId: true, numeroDossier: true },
        orderBy: { dateReception: 'desc' },
        take: LIMITE_LISTE * 2,
      });
      if (dossiers.length === 0) return resultatVide(T('Assurés à vérifier'));
      const ids = [...new Set(dossiers.map((d) => d.assureId!).filter(Boolean))].slice(0, LIMITE_LISTE);
      const assures = await db.assure.findMany({
        where: { id: { in: ids } },
        select: { nom: true, prenom: true, matricule: true, societe: { select: { nom: true } }, _count: { select: { dossiers: true } } },
      });
      return resultatListe(
        T('Assurés dont le dossier doit être vérifié'),
        [
          { key: 'nom', label: 'Assuré', type: 'texte' },
          { key: 'societe', label: 'Société', type: 'texte' },
          { key: 'nb', label: 'Dossiers au total', type: 'nombre' },
        ],
        assures.map((a) => ({
          nom: [a.nom, a.prenom].filter(Boolean).join(' '),
          societe: a.societe?.nom ?? '—',
          nb: a._count.dossiers,
        })),
        assures.length,
        `${assures.length} assuré(s) ont un dossier en attente de vérification (Reçu / En analyse).`
      );
    },
  },
  {
    id: 'ACCUEIL_ASSURES_MULTI_DOSSIERS',
    role: 'ACCUEIL',
    categorie: 'Assurés',
    question: 'Quels assurés ont plusieurs dossiers en cours ?',
    params: [],
    presentation: 'TABLEAU',
    async impl() {
      const rows = await db.dossier.groupBy({
        by: ['assureId'],
        where: { statut: { notIn: ['PAYE', 'REJETE'] }, assureId: { not: null } },
        _count: { assureId: true },
      });
      const multi = rows.filter((r) => r._count.assureId > 1);
      if (multi.length === 0) return resultatVide(T('Assurés multi-dossiers'));
      const ids = multi.map((r) => r.assureId!);
      const assures = await db.assure.findMany({
        where: { id: { in: ids } },
        select: { id: true, nom: true, prenom: true, societe: { select: { nom: true } } },
      });
      const map = new Map(assures.map((a) => [a.id, a]));
      const lignes = multi
        .map((r) => ({
          nom: map.has(r.assureId!)
            ? [map.get(r.assureId!)!.nom, map.get(r.assureId!)!.prenom].filter(Boolean).join(' ')
            : 'Inconnu',
          societe: map.get(r.assureId!)?.societe?.nom ?? '—',
          nb: r._count.assureId,
        }))
        .sort((a, b) => b.nb - a.nb)
        .slice(0, LIMITE_LISTE);
      return resultatTableau(
        T('Assurés avec plusieurs dossiers en cours'),
        [
          { key: 'nom', label: 'Assuré', type: 'texte' },
          { key: 'societe', label: 'Société', type: 'texte' },
          { key: 'nb', label: 'Dossiers en cours', type: 'nombre' },
        ],
        lignes, lignes.length,
        `${lignes.length} assuré(s) ont plusieurs dossiers simultanément en cours.`);
    },
  },

  // ─── Dossiers ──────────────────────────────────────────────────────────────
  {
    id: 'ACCUEIL_DOSSIERS_AUJOURDHUI',
    role: 'ACCUEIL',
    categorie: 'Dossiers',
    question: "Combien de dossiers ont été créés aujourd'hui ?",
    params: [],
    presentation: 'NOMBRE',
    async impl() {
      const total = await db.dossier.count({ where: { createdAt: { gte: debutJournee() } } });
      return resultatNombre(T("Dossiers créés aujourd'hui"), total, `${fmtNb(total)} dossier(s) créé(s) aujourd'hui.`);
    },
  },
  {
    id: 'ACCUEIL_DOSSIERS_ATTENTE',
    role: 'ACCUEIL',
    categorie: 'Dossiers',
    question: 'Combien de dossiers sont actuellement en attente ?',
    params: [],
    presentation: 'NOMBRE',
    async impl() {
      const total = await db.dossier.count({ where: { statut: { in: STATUTS_ATTENTE } } });
      return resultatNombre(T('Dossiers en attente'), total, `${fmtNb(total)} dossier(s) en attente (Reçu / En analyse).`);
    },
  },
  {
    id: 'ACCUEIL_DOSSIERS_ATTENTE_LONGTEMPS',
    role: 'ACCUEIL',
    categorie: 'Dossiers',
    question: 'Quels dossiers sont en attente depuis le plus longtemps ?',
    params: [],
    presentation: 'LISTE',
    async impl() {
      const total = await db.dossier.count({ where: { statut: { in: STATUTS_ATTENTE } } });
      const dossiers = await db.dossier.findMany({
        where: { statut: { in: STATUTS_ATTENTE } },
        orderBy: { dateReception: 'asc' },
        take: LIMITE_LISTE,
        select: { numeroDossier: true, beneficiaire: true, typeDossier: true, statut: true, dateReception: true, montantReclame: true },
      });
      if (dossiers.length === 0) return resultatVide(T('Dossiers en attente les plus anciens'));
      return resultatListe(
        T('Dossiers en attente depuis le plus longtemps'),
        COLONNES_DOSSIER,
        dossiers.map((d) => ({
          numero: d.numeroDossier,
          beneficiaire: d.beneficiaire,
          type: d.typeDossier,
          statut: statutLabel(d.statut),
          date: d.dateReception.toISOString(),
          montant: Math.round(d.montantReclame * 100) / 100,
        })),
        total,
        `Les ${dossiers.length} dossier(s) en attente les plus anciens (sur ${fmtNb(total)}).`
      );
    },
  },
  {
    id: 'ACCUEIL_STATUT_DOSSIER',
    role: 'ACCUEIL',
    categorie: 'Dossiers',
    question: "Quel est le statut d'un dossier donné ?",
    params: [{ key: 'DOSSIER', label: 'Numéro de dossier', required: true, aide: 'Format : DOS-AAAA-XXXXXX' }],
    presentation: 'TABLEAU',
    async impl(_ctx, params) {
      const numero = params.DOSSIER?.trim().toUpperCase();
      if (!numero) throw new AssistantError('Numéro de dossier requis.');
      const d = await db.dossier.findUnique({
        where: { numeroDossier: numero },
        select: {
          numeroDossier: true, beneficiaire: true, typeDossier: true, statut: true,
          dateReception: true, montantReclame: true, montantValide: true, montantPaye: true,
          datePaiement: true, motifRejet: true, societe: { select: { nom: true } },
        },
      });
      if (!d) return resultatVide(T(`Statut du dossier ${numero}`));
      return resultatTableau(
        T(`Statut du dossier ${numero}`),
        [
          { key: 'champ', label: 'Information', type: 'texte' },
          { key: 'valeur', label: 'Valeur', type: 'texte' },
        ],
        [
          { champ: 'Numéro', valeur: d.numeroDossier },
          { champ: 'Bénéficiaire', valeur: d.beneficiaire },
          { champ: 'Société', valeur: d.societe?.nom ?? '—' },
          { champ: 'Acte', valeur: d.typeDossier },
          { champ: 'Statut', valeur: statutLabel(d.statut) },
          { champ: 'Date de réception', valeur: d.dateReception.toISOString() },
          { champ: 'Montant réclamé', valeur: Math.round(d.montantReclame * 100) / 100 },
          { champ: 'Montant validé', valeur: d.montantValide !== null ? Math.round(d.montantValide * 100) / 100 : '—' },
          { champ: 'Montant payé', valeur: d.montantPaye !== null ? Math.round(d.montantPaye * 100) / 100 : '—' },
          { champ: 'Date de paiement', valeur: d.datePaiement ? d.datePaiement.toISOString() : '—' },
          { champ: 'Motif de rejet', valeur: d.motifRejet ?? '—' },
        ],
        11,
        `Dossier ${d.numeroDossier} : ${statutLabel(d.statut)}.`
      );
    },
  },
  {
    id: 'ACCUEIL_DERNIER_DOSSIER_ASSURE',
    role: 'ACCUEIL',
    categorie: 'Dossiers',
    question: 'Quel est le dernier dossier créé pour un assuré ?',
    params: [{ key: 'ASSURE', label: 'Assuré', required: true }],
    presentation: 'LISTE',
    async impl(_ctx, params) {
      const assureId = params.ASSURE;
      if (!assureId) throw new AssistantError('Assuré requis.');
      const assure = await db.assure.findUnique({
        where: { id: assureId },
        select: { nom: true, prenom: true },
      });
      if (!assure) return resultatVide(T('Dernier dossier de l\u2019assuré'));
      const dossiers = await lignesDossiers({ assureId }, 'createdAt', 5);
      if (dossiers.total === 0) return resultatVide(T('Dernier dossier de l\u2019assuré'));
      return resultatListe(
        T(`Dernier dossier de ${[assure.nom, assure.prenom].filter(Boolean).join(' ')}`),
        COLONNES_DOSSIER,
        dossiers.lignes,
        dossiers.total,
        `${fmtNb(dossiers.total)} dossier(s) au total, les plus récents d'abord.`
      );
    },
  },

  // ─── Sociétés & contrats ───────────────────────────────────────────────────
  {
    id: 'ACCUEIL_ASSURES_SOCIETE',
    role: 'ACCUEIL',
    categorie: 'Sociétés & contrats',
    question: 'Quels assurés sont rattachés à une société donnée ?',
    params: [{ key: 'SOCIETE', label: 'Société', required: true }],
    presentation: 'LISTE',
    async impl(_ctx, params) {
      const societeId = params.SOCIETE;
      if (!societeId) throw new AssistantError('Société requise.');
      const [total, assures] = await Promise.all([
        db.assure.count({ where: { societeId } }),
        db.assure.findMany({
          where: { societeId },
          orderBy: [{ typeBeneficiaire: 'asc' }, { nom: 'asc' }],
          take: LIMITE_LISTE,
          select: { nom: true, prenom: true, matricule: true, typeBeneficiaire: true, actif: true },
        }),
      ]);
      if (total === 0) return resultatVide(T('Assurés de la société'));
      return resultatListe(
        T('Assurés rattachés à la société sélectionnée'),
        [
          { key: 'nom', label: 'Nom', type: 'texte' },
          { key: 'type', label: 'Type', type: 'texte' },
          { key: 'matricule', label: 'Matricule', type: 'texte' },
          { key: 'actif', label: 'Actif', type: 'texte' },
        ],
        assures.map((a) => ({
          nom: [a.nom, a.prenom].filter(Boolean).join(' '),
          type: a.typeBeneficiaire,
          matricule: a.matricule ?? '—',
          actif: a.actif ? 'Oui' : 'Non',
        })),
        total,
        `${fmtNb(total)} assuré(s) rattaché(s) à cette société (${assures.length} affiché(s)).`
      );
    },
  },
  {
    id: 'ACCUEIL_NB_ASSURES_SOCIETE',
    role: 'ACCUEIL',
    categorie: 'Sociétés & contrats',
    question: "Combien d'assurés sont rattachés à une société ?",
    params: [{ key: 'SOCIETE', label: 'Société', required: true }],
    presentation: 'NOMBRE',
    async impl(_ctx, params) {
      const societeId = params.SOCIETE;
      if (!societeId) throw new AssistantError('Société requise.');
      const [total, principaux] = await Promise.all([
        db.assure.count({ where: { societeId } }),
        db.assure.count({ where: { societeId, typeBeneficiaire: 'ASSURE' } }),
      ]);
      return resultatNombre(T("Assurés de la société"), total,
        `${fmtNb(total)} assuré(s) rattaché(s), dont ${fmtNb(principaux)} assuré(s) principal/aux (reste : ayants droit).`);
    },
  },
  {
    id: 'ACCUEIL_CONTRATS_ACTIFS',
    role: 'ACCUEIL',
    categorie: 'Sociétés & contrats',
    question: 'Quels contrats sont actuellement actifs ?',
    params: [],
    presentation: 'LISTE',
    async impl() {
      const [total, contrats] = await Promise.all([
        db.contrat.count({ where: { statut: 'ACTIF' } }),
        db.contrat.findMany({
          where: { statut: 'ACTIF' },
          orderBy: { dateFin: 'asc' },
          take: LIMITE_LISTE,
          select: { reference: true, societe: { select: { nom: true } }, budgetAnnuel: true, budgetUtilise: true, dateFin: true },
        }),
      ]);
      if (total === 0) return resultatVide(T('Contrats actifs'));
      return resultatListe(
        T('Contrats actuellement actifs'),
        [
          { key: 'ref', label: 'Référence', type: 'texte' },
          { key: 'societe', label: 'Société', type: 'texte' },
          { key: 'budget', label: 'Budget annuel', type: 'montant' },
          { key: 'utilise', label: 'Budget utilisé', type: 'montant' },
          { key: 'fin', label: 'Échéance', type: 'date' },
        ],
        contrats.map((c) => ({
          ref: c.reference,
          societe: c.societe.nom,
          budget: Math.round(c.budgetAnnuel * 100) / 100,
          utilise: Math.round(c.budgetUtilise * 100) / 100,
          fin: c.dateFin.toISOString(),
        })),
        total,
        `${fmtNb(total)} contrat(s) actif(s), échéance la plus proche d'abord.`
      );
    },
  },
  {
    id: 'ACCUEIL_CONTRATS_ECHEANCE',
    role: 'ACCUEIL',
    categorie: 'Sociétés & contrats',
    question: 'Quels contrats arrivent prochainement à échéance ?',
    params: [],
    presentation: 'LISTE',
    note: 'Contrats ACTIF dont la date de fin survient dans les 90 prochains jours.',
    async impl() {
      const limite = new Date();
      limite.setDate(limite.getDate() + 90);
      limite.setHours(23, 59, 59, 999);
      const contrats = await db.contrat.findMany({
        where: { statut: 'ACTIF', dateFin: { lte: limite } },
        orderBy: { dateFin: 'asc' },
        take: LIMITE_LISTE,
        select: { reference: true, societe: { select: { nom: true } }, dateFin: true },
      });
      if (contrats.length === 0) return resultatVide(T('Contrats à échéance prochaine'));
      return resultatListe(
        T('Contrats arrivant à échéance (90 jours)'),
        [
          { key: 'ref', label: 'Référence', type: 'texte' },
          { key: 'societe', label: 'Société', type: 'texte' },
          { key: 'fin', label: 'Échéance', type: 'date' },
        ],
        contrats.map((c) => ({ ref: c.reference, societe: c.societe.nom, fin: c.dateFin.toISOString() })),
        contrats.length,
        `${contrats.length} contrat(s) actif(s) à échéance dans les 90 prochains jours.`
      );
    },
  },

  // ─── Activité ──────────────────────────────────────────────────────────────
  {
    id: 'ACCUEIL_DEMANDES_AUJOURDHUI',
    role: 'ACCUEIL',
    categorie: 'Activité',
    question: "Combien de demandes ont été enregistrées aujourd'hui ?",
    params: [],
    presentation: 'NOMBRE',
    async impl() {
      const total = await db.dossier.count({ where: { dateReception: { gte: debutJournee() } } });
      return resultatNombre(T("Demandes enregistrées aujourd'hui"), total,
        `${fmtNb(total)} demande(s) reçue(s) aujourd'hui (date de réception du jour).`);
    },
  },
  {
    id: 'ACCUEIL_DEMANDES_A_TRAITER',
    role: 'ACCUEIL',
    categorie: 'Activité',
    question: 'Combien de demandes sont encore à traiter ?',
    params: [],
    presentation: 'NOMBRE',
    async impl() {
      const total = await db.dossier.count({ where: { statut: 'RECU' } });
      return resultatNombre(T('Demandes à traiter'), total,
        `${fmtNb(total)} demande(s) au statut « Reçu » restent à traiter.`);
    },
  },
  {
    id: 'ACCUEIL_DOSSIERS_MAJ_RECENTS',
    role: 'ACCUEIL',
    categorie: 'Activité',
    question: 'Quels dossiers ont été récemment mis à jour ?',
    params: [],
    presentation: 'LISTE',
    async impl() {
      const total = await db.dossier.count();
      const dossiers = await db.dossier.findMany({
        orderBy: { updatedAt: 'desc' },
        take: LIMITE_LISTE,
        select: { numeroDossier: true, beneficiaire: true, typeDossier: true, statut: true, dateReception: true, montantReclame: true },
      });
      return resultatListe(
        T('Dossiers récemment mis à jour'),
        COLONNES_DOSSIER,
        dossiers.map((d) => ({
          numero: d.numeroDossier,
          beneficiaire: d.beneficiaire,
          type: d.typeDossier,
          statut: statutLabel(d.statut),
          date: d.dateReception.toISOString(),
          montant: Math.round(d.montantReclame * 100) / 100,
        })),
        total,
        `Les ${dossiers.length} dossier(s) mis à jour le plus récemment.`
      );
    },
  },
  {
    id: 'ACCUEIL_DOSSIERS_PAR_STATUT',
    role: 'ACCUEIL',
    categorie: 'Activité',
    question: 'Quel est le nombre de dossiers par statut ?',
    params: [],
    presentation: 'TABLEAU',
    async impl() {
      const rows = await db.dossier.groupBy({ by: ['statut'], _count: { statut: true } });
      rows.sort((a, b) => b._count.statut - a._count.statut);
      return resultatTableau(
        T('Nombre de dossiers par statut'),
        [
          { key: 'statut', label: 'Statut', type: 'statut' },
          { key: 'nb', label: 'Nombre', type: 'nombre' },
        ],
        rows.map((r) => ({ statut: statutLabel(r.statut), nb: r._count.statut })),
        rows.length,
        `${rows.length} statut(s) représenté(s) dans la base.`
      );
    },
  },
  {
    id: 'ACCUEIL_ACTIVITE_AUJOURDHUI',
    role: 'ACCUEIL',
    categorie: 'Activité',
    question: "Quelle est l'activité enregistrée aujourd'hui ?",
    params: [],
    presentation: 'KPI',
    async impl() {
      const depuis = debutJournee();
      const [cree, maj, attends] = await Promise.all([
        db.dossier.count({ where: { createdAt: { gte: depuis } } }),
        db.dossier.count({ where: { updatedAt: { gte: depuis } } }),
        db.dossier.count({ where: { statut: { in: STATUTS_ATTENTE } } }),
      ]);
      return resultatKpi(
        T("Activité d'aujourd'hui"),
        [
          { label: "Dossiers créés aujourd'hui", valeur: cree, type: 'nombre' },
          { label: "Dossiers mis à jour aujourd'hui", valeur: maj, type: 'nombre' },
          { label: 'Dossiers en attente (total)', valeur: attends, type: 'nombre' },
        ],
        `Aujourd'hui : ${cree} création(s) et ${maj} mise(s) à jour de dossiers ; ${attends} dossier(s) restent en attente.`
      );
    },
  },
  {
    id: 'ACCUEIL_CONTROLES_AVANT_TRAITEMENT',
    role: 'ACCUEIL',
    categorie: 'Activité',
    question: 'Quelles informations dois-je vérifier avant de traiter un dossier ?',
    params: [],
    presentation: 'KPI',
    note: 'Contrôles de complétude réels : dossiers Reçu sans assuré rattaché, sans montant, ou sans justificatif.',
    async impl() {
      const depuis5j = new Date(Date.now() - 30 * 86_400_000);
      const [sansAssure, sansMontant, avecJustif] = await Promise.all([
        db.dossier.count({ where: { statut: 'RECU', assureId: null, dateReception: { gte: depuis5j } } }),
        db.dossier.count({ where: { statut: 'RECU', montantReclame: { lte: 0 }, dateReception: { gte: depuis5j } } }),
        db.dossier.findMany({
          where: { statut: 'RECU', dateReception: { gte: depuis5j } },
          select: { id: true, numeroDossier: true },
          take: 200,
        }),
      ]);
      const idsAvecJustif = new Set(
        (await db.justificatif.findMany({
          where: { dossierId: { in: avecJustif.map((d) => d.id) } },
          select: { dossierId: true },
        })).map((j) => j.dossierId)
      );
      const sansJustif = avecJustif.filter((d) => !idsAvecJustif.has(d.id)).length;
      const total = sansAssure + sansMontant + sansJustif;
      if (total === 0) return resultatVide(T('Contrôles avant traitement'));
      return resultatKpi(
        T('Contrôles de complétude à effectuer (dossiers Reçu, 30 derniers jours)'),
        [
          { label: 'Dossiers sans assuré rattaché', valeur: sansAssure, type: 'nombre' },
          { label: 'Dossiers sans montant réclamé', valeur: sansMontant, type: 'nombre' },
          { label: 'Dossiers sans justificatif', valeur: sansJustif, type: 'nombre' },
        ],
        `${fmtNb(total)} contrôle(s) de complétude à effectuer avant traitement (assuré rattaché, montant, justificatifs).`
      );
    },
  },
];
