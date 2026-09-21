import { db } from '@/lib/db';
import type { ParamValeurs, QuestionDef } from '../types';
import { AssistantError } from '../types';
import {
  resultatNombre, resultatTableau, resultatListe, resultatVide,
  fmtNb, LIMITE_LISTE,
} from '../results';

// ─── Catalogue SERVICE TECHNIQUE — 20 questions prédéfinies ──────────────────
// Référentiel : prestataires, sociétés, barèmes (actes), historique du
// paramétrage (journal d'audit HistoriqueParametre).

const T = (question: string) => ({ question });

const ENTITES_REFERENCE = ['Bareme', 'Prestataire', 'Societe', 'Assure', 'Contrat'];

export const questionsTechnique: QuestionDef[] = [
  // ─── Prestataires ──────────────────────────────────────────────────────────
  {
    id: 'TECH_PRESTATAIRES_ACTIFS',
    role: 'TECHNIQUE',
    categorie: 'Prestataires',
    question: 'Combien de prestataires sont actuellement actifs ?',
    params: [],
    presentation: 'NOMBRE',
    async impl() {
      const total = await db.prestataire.count({ where: { actif: true } });
      return resultatNombre(T('Prestataires actifs'), total, `${fmtNb(total)} prestataire(s) actif(s).`);
    },
  },
  {
    id: 'TECH_PRESTATAIRES_NOUVEAUX',
    role: 'TECHNIQUE',
    categorie: 'Prestataires',
    question: 'Quels sont les prestataires nouvellement enregistrés ?',
    params: [],
    presentation: 'LISTE',
    async impl() {
      const prests = await db.prestataire.findMany({
        orderBy: { createdAt: 'desc' },
        take: LIMITE_LISTE,
        select: { nom: true, type: true, telephone: true, createdAt: true },
      });
      return resultatListe(
        T('Prestataires nouvellement enregistrés'),
        [
          { key: 'nom', label: 'Prestataire', type: 'texte' },
          { key: 'type', label: 'Type', type: 'texte' },
          { key: 'telephone', label: 'Téléphone', type: 'texte' },
          { key: 'date', label: 'Enregistré le', type: 'date' },
        ],
        prests.map((p) => ({
          nom: p.nom, type: p.type, telephone: p.telephone ?? '—', date: p.createdAt.toISOString(),
        })),
        prests.length,
        `${prests.length} dernier(s) prestataire(s) enregistré(s).`
      );
    },
  },
  {
    id: 'TECH_PRESTATAIRES_SOCIETE',
    role: 'TECHNIQUE',
    categorie: 'Prestataires',
    question: 'Quels prestataires sont rattachés à une société donnée ?',
    params: [{ key: 'SOCIETE', label: 'Société', required: true }],
    presentation: 'LISTE',
    async impl(_ctx, params) {
      const societeId = params.SOCIETE;
      if (!societeId) throw new AssistantError('Société requise.');
      const liaisons = await db.prestataireSociete.findMany({
        where: { societeId },
        include: { prestataire: { select: { nom: true, type: true, actif: true } } },
        orderBy: { createdAt: 'desc' },
        take: LIMITE_LISTE,
      });
      if (liaisons.length === 0) return resultatVide(T('Prestataires de la société'));
      return resultatListe(
        T('Prestataires rattachés à la société sélectionnée'),
        [
          { key: 'nom', label: 'Prestataire', type: 'texte' },
          { key: 'type', label: 'Type', type: 'texte' },
          { key: 'actif', label: 'Liaison active', type: 'texte' },
        ],
        liaisons.map((l) => ({
          nom: l.prestataire.nom,
          type: l.prestataire.type,
          actif: l.actif ? 'Oui' : 'Non',
        })),
        liaisons.length,
        `${liaisons.length} prestataire(s) rattaché(s) à cette société.`
      );
    },
  },
  {
    id: 'TECH_PRESTATAIRES_MULTI_SOCIETES',
    role: 'TECHNIQUE',
    categorie: 'Prestataires',
    question: 'Quels prestataires ont plusieurs sociétés clientes ?',
    params: [],
    presentation: 'TABLEAU',
    async impl() {
      const rows = await db.prestataireSociete.groupBy({
        by: ['prestataireId'],
        _count: { societeId: true },
        having: { prestataireId: { _count: { gte: 2 } } },
      });
      if (rows.length === 0) return resultatVide(T('Prestataires multi-sociétés'));
      const ids = rows.map((r) => r.prestataireId);
      const prests = await db.prestataire.findMany({
        where: { id: { in: ids } },
        select: { id: true, nom: true, type: true },
      });
      const map = new Map(prests.map((p) => [p.id, p]));
      const lignes = rows
        .map((r) => ({
          nom: map.get(r.prestataireId)?.nom ?? 'Inconnu',
          type: map.get(r.prestataireId)?.type ?? '—',
          nb: r._count.societeId,
        }))
        .sort((a, b) => b.nb - a.nb)
        .slice(0, LIMITE_LISTE);
      return resultatTableau(
        T('Prestataires ayant plusieurs sociétés clientes'),
        [
          { key: 'nom', label: 'Prestataire', type: 'texte' },
          { key: 'type', label: 'Type', type: 'texte' },
          { key: 'nb', label: 'Nb sociétés', type: 'nombre' },
        ],
        lignes, lignes.length,
        `${lignes.length} prestataire(s) lié(s) à plusieurs sociétés clientes.`);
    },
  },
  {
    id: 'TECH_PRESTATAIRES_INCOMPLETS',
    role: 'TECHNIQUE',
    categorie: 'Prestataires',
    question: 'Quels prestataires ont des informations incomplètes ?',
    params: [],
    presentation: 'LISTE',
    note: 'Prestataires actifs dont le téléphone, l\u2019e-mail, le NIF ou l\u2019adresse est manquant.',
    async impl() {
      const prests = await db.prestataire.findMany({
        where: {
          actif: true,
          OR: [{ telephone: null }, { email: null }, { nif: null }, { adresse: null }],
        },
        select: { nom: true, type: true, telephone: true, email: true, nif: true, adresse: true },
        orderBy: { nom: 'asc' },
        take: LIMITE_LISTE,
      });
      if (prests.length === 0) return resultatVide(T('Prestataires incomplets'));
      return resultatListe(
        T('Prestataires avec informations incomplètes'),
        [
          { key: 'nom', label: 'Prestataire', type: 'texte' },
          { key: 'telephone', label: 'Téléphone', type: 'texte' },
          { key: 'email', label: 'E-mail', type: 'texte' },
          { key: 'nif', label: 'NIF', type: 'texte' },
        ],
        prests.map((p) => ({
          nom: p.nom,
          telephone: p.telephone ?? 'Manquant',
          email: p.email ?? 'Manquant',
          nif: p.nif ?? 'Manquant',
        })),
        prests.length,
        `${prests.length} prestataire(s) actif(s) ont au moins une information administrative manquante.`
      );
    },
  },

  // ─── Actes médicaux & barèmes ──────────────────────────────────────────────
  {
    id: 'TECH_ACTES_PARAMETRES',
    role: 'TECHNIQUE',
    categorie: 'Actes & barèmes',
    question: 'Combien d\u2019actes médicaux sont paramétrés ?',
    params: [],
    presentation: 'NOMBRE',
    note: 'Actes présents dans au moins un barème (paramétrage réel de la plateforme).',
    async impl() {
      const rows = await db.bareme.groupBy({ by: ['prestation'] });
      return resultatNombre(T('Actes médicaux paramétrés'), rows.length,
        `${fmtNb(rows.length)} acte(s) médical/aux distinct(s) paramétré(s) dans les barèmes.`);
    },
  },
  {
    id: 'TECH_ACTES_ACTIFS',
    role: 'TECHNIQUE',
    categorie: 'Actes & barèmes',
    question: 'Quels actes médicaux sont actifs ?',
    params: [],
    presentation: 'LISTE',
    async impl() {
      const rows = await db.bareme.groupBy({
        by: ['prestation'],
        where: { active: true },
        _count: { societeId: true },
      });
      if (rows.length === 0) return resultatVide(T('Actes actifs'));
      rows.sort((a, b) => b._count.societeId - a._count.societeId);
      return resultatListe(
        T('Actes médicaux actifs (barèmes actifs)'),
        [
          { key: 'acte', label: 'Acte', type: 'texte' },
          { key: 'nb', label: 'Sociétés couvertes', type: 'nombre' },
        ],
        rows.map((r) => ({ acte: r.prestation, nb: r._count.societeId })),
        rows.length,
        `${rows.length} acte(s) couvert(s) par au moins un barème actif.`
      );
    },
  },
  {
    id: 'TECH_ACTES_AVEC_BAREME',
    role: 'TECHNIQUE',
    categorie: 'Actes & barèmes',
    question: 'Quels actes médicaux sont associés à un barème ?',
    params: [],
    presentation: 'TABLEAU',
    async impl() {
      const rows = await db.bareme.groupBy({
        by: ['prestation'],
        _count: { societeId: true },
        _avg: { tauxCouverture: true, plafond: true },
      });
      if (rows.length === 0) return resultatVide(T('Actes avec barème'));
      rows.sort((a, b) => b._count.societeId - a._count.societeId);
      return resultatTableau(
        T('Actes associés à un barème (toutes sociétés)'),
        [
          { key: 'acte', label: 'Acte', type: 'texte' },
          { key: 'nb', label: 'Nb barèmes', type: 'nombre' },
          { key: 'taux', label: 'Taux moyen (%)', type: 'nombre' },
          { key: 'plafond', label: 'Plafond moyen', type: 'montant' },
        ],
        rows.map((r) => ({
          acte: r.prestation,
          nb: r._count.societeId,
          taux: Math.round((r._avg.tauxCouverture ?? 0) * 100),
          plafond: Math.round(r._avg.plafond ?? 0),
        })),
        rows.length,
        `${rows.length} acte(s) distinct(s) dans les barèmes (moyennes par acte).`
      );
    },
  },
  {
    id: 'TECH_BAREMES_ACTIFS',
    role: 'TECHNIQUE',
    categorie: 'Actes & barèmes',
    question: 'Quels barèmes sont actuellement actifs ?',
    params: [],
    presentation: 'LISTE',
    async impl() {
      const [total, baremes] = await Promise.all([
        db.bareme.count({ where: { active: true } }),
        db.bareme.findMany({
          where: { active: true },
          orderBy: [{ societe: { nom: 'asc' } }, { prestation: 'asc' }],
          take: LIMITE_LISTE,
          select: {
            prestation: true, tauxCouverture: true, plafond: true,
            societe: { select: { nom: true } },
          },
        }),
      ]);
      if (total === 0) return resultatVide(T('Barèmes actifs'));
      return resultatListe(
        T('Barèmes actuellement actifs'),
        [
          { key: 'societe', label: 'Société', type: 'texte' },
          { key: 'acte', label: 'Acte', type: 'texte' },
          { key: 'taux', label: 'Taux (%)', type: 'nombre' },
          { key: 'plafond', label: 'Plafond', type: 'montant' },
        ],
        baremes.map((b) => ({
          societe: b.societe.nom,
          acte: b.prestation,
          taux: Math.round(b.tauxCouverture * 100),
          plafond: Math.round(b.plafond),
        })),
        total,
        `${fmtNb(total)} barème(s) actif(s) (${baremes.length} affiché(s)).`
      );
    },
  },
  {
    id: 'TECH_BAREMES_SOCIETE',
    role: 'TECHNIQUE',
    categorie: 'Actes & barèmes',
    question: 'Quels barèmes sont associés à une société donnée ?',
    params: [{ key: 'SOCIETE', label: 'Société', required: true }],
    presentation: 'LISTE',
    async impl(_ctx, params) {
      const societeId = params.SOCIETE;
      if (!societeId) throw new AssistantError('Société requise.');
      const baremes = await db.bareme.findMany({
        where: { societeId },
        orderBy: { prestation: 'asc' },
        select: { prestation: true, tauxCouverture: true, plafond: true, active: true },
      });
      if (baremes.length === 0) return resultatVide(T('Barèmes de la société'));
      return resultatListe(
        T('Barèmes de la société sélectionnée'),
        [
          { key: 'acte', label: 'Acte', type: 'texte' },
          { key: 'taux', label: 'Taux (%)', type: 'nombre' },
          { key: 'plafond', label: 'Plafond', type: 'montant' },
          { key: 'actif', label: 'Actif', type: 'texte' },
        ],
        baremes.map((b) => ({
          acte: b.prestation,
          taux: Math.round(b.tauxCouverture * 100),
          plafond: Math.round(b.plafond),
          actif: b.active ? 'Oui' : 'Non',
        })),
        baremes.length,
        `${baremes.length} barème(s) paramétré(s) pour cette société.`
      );
    },
  },
  {
    id: 'TECH_ACTES_PRESTATAIRE',
    role: 'TECHNIQUE',
    categorie: 'Actes & barèmes',
    question: 'Quels actes sont disponibles pour un prestataire donné ?',
    params: [{ key: 'PRESTATAIRE', label: 'Prestataire', required: true }],
    presentation: 'LISTE',
    note: 'Actes couverts par les barèmes actifs des sociétés clientes auxquelles ce prestataire est rattaché.',
    async impl(_ctx, params) {
      const prestataireId = params.PRESTATAIRE;
      if (!prestataireId) throw new AssistantError('Prestataire requis.');
      const liaisons = await db.prestataireSociete.findMany({
        where: { prestataireId, actif: true },
        select: { societeId: true },
      });
      const societeIds = liaisons.map((l) => l.societeId);
      if (societeIds.length === 0) return resultatVide(T('Actes disponibles pour le prestataire'));
      const baremes = await db.bareme.findMany({
        where: { societeId: { in: societeIds }, active: true },
        select: { prestation: true, societe: { select: { nom: true } } },
        orderBy: { prestation: 'asc' },
      });
      if (baremes.length === 0) return resultatVide(T('Actes disponibles pour le prestataire'));
      const parActe = new Map<string, string[]>();
      for (const b of baremes) {
        const list = parActe.get(b.prestation) ?? [];
        list.push(b.societe.nom);
        parActe.set(b.prestation, list);
      }
      const lignes = [...parActe.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([acte, societes]) => ({ acte, societes: [...new Set(societes)].join(', ') }));
      return resultatListe(
        T('Actes disponibles pour ce prestataire (barèmes actifs de ses sociétés)'),
        [
          { key: 'acte', label: 'Acte', type: 'texte' },
          { key: 'societes', label: 'Sociétés couvertes', type: 'texte' },
        ],
        lignes,
        lignes.length,
        `${lignes.length} acte(s) disponible(s) via les barèmes actifs des sociétés rattachées.`
      );
    },
  },
  {
    id: 'TECH_PRESTATAIRES_POUR_ACTE',
    role: 'TECHNIQUE',
    categorie: 'Actes & barèmes',
    question: 'Quels prestataires peuvent réaliser un acte donné ?',
    params: [{ key: 'ACTE', label: 'Acte (prestation)', required: true }],
    presentation: 'LISTE',
    note: 'Prestataires actifs rattachés à au moins une société couvrant cet acte dans son barème.',
    async impl(_ctx, params) {
      const acte = params.ACTE;
      if (!acte) throw new AssistantError('Acte requis.');
      const baremes = await db.bareme.findMany({
        where: { prestation: acte, active: true },
        select: { societeId: true },
      });
      const societeIds = [...new Set(baremes.map((b) => b.societeId))];
      if (societeIds.length === 0) return resultatVide(T(`Prestataires pour l\u2019acte ${acte}`));
      const liaisons = await db.prestataireSociete.findMany({
        where: { societeId: { in: societeIds }, actif: true, prestataire: { actif: true } },
        include: { prestataire: { select: { nom: true, type: true } } },
        take: LIMITE_LISTE,
      });
      const map = new Map<string, { nom: string; type: string; societes: number }>();
      for (const l of liaisons) {
        const ex = map.get(l.prestataireId);
        if (ex) ex.societes += 1;
        else map.set(l.prestataireId, { nom: l.prestataire.nom, type: l.prestataire.type, societes: 1 });
      }
      const lignes = [...map.values()].sort((a, b) => b.societes - a.societes);
      return resultatListe(
        T(`Prestataires pouvant réaliser l'acte « ${acte} »`),
        [
          { key: 'nom', label: 'Prestataire', type: 'texte' },
          { key: 'type', label: 'Type', type: 'texte' },
          { key: 'nb', label: 'Sociétés couvertes', type: 'nombre' },
        ],
        lignes.map((l) => ({ nom: l.nom, type: l.type, nb: l.societes })),
        lignes.length,
        `${lignes.length} prestataire(s) actif(s) rattaché(s) à des sociétés couvrant cet acte.`
      );
    },
  },

  // ─── Paramétrage & audit ───────────────────────────────────────────────────
  {
    id: 'TECH_PARAMS_RECENTS',
    role: 'TECHNIQUE',
    categorie: 'Paramétrage & audit',
    question: 'Quels paramètres ont été récemment modifiés ?',
    params: [],
    presentation: 'LISTE',
    async impl() {
      const ops = await db.historiqueParametre.findMany({
        orderBy: { dateModification: 'desc' },
        take: LIMITE_LISTE,
        select: { dateModification: true, entite: true, objet: true, champ: true, action: true, modifiePar: true },
      });
      if (ops.length === 0) return resultatVide(T('Paramètres récemment modifiés'));
      return resultatListe(
        T('Paramètres récemment modifiés'),
        [
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'entite', label: 'Entité', type: 'texte' },
          { key: 'objet', label: 'Objet', type: 'texte' },
          { key: 'champ', label: 'Champ', type: 'texte' },
          { key: 'par', label: 'Par', type: 'texte' },
        ],
        ops.map((o) => ({
          date: o.dateModification.toISOString(),
          entite: o.entite,
          objet: o.objet ?? '—',
          champ: o.champ,
          par: o.modifiePar,
        })),
        ops.length,
        `${ops.length} dernière(s) modification(s) du paramétrage (journal d'audit).`
      );
    },
  },
  {
    id: 'TECH_MODIFS_PARAMETRAGE',
    role: 'TECHNIQUE',
    categorie: 'Paramétrage & audit',
    question: 'Quelles modifications ont été effectuées dans le paramétrage ?',
    params: [],
    presentation: 'TABLEAU',
    async impl() {
      const rows = await db.historiqueParametre.groupBy({
        by: ['entite', 'action'],
        _count: { entite: true },
        where: { entite: { in: ENTITES_REFERENCE } },
      });
      if (rows.length === 0) return resultatVide(T('Modifications du paramétrage'));
      rows.sort((a, b) => b._count.entite - a._count.entite);
      return resultatTableau(
        T('Modifications du paramétrage par entité et action'),
        [
          { key: 'entite', label: 'Entité', type: 'texte' },
          { key: 'action', label: 'Action', type: 'texte' },
          { key: 'nb', label: 'Nombre', type: 'nombre' },
        ],
        rows.map((r) => ({ entite: r.entite, action: r.action, nb: r._count.entite })),
        rows.length,
        `${rows.length} combinaison(s) entité/action dans l'historique du paramétrage.`
      );
    },
  },
  {
    id: 'TECH_AUTEUR_MODIF',
    role: 'TECHNIQUE',
    categorie: 'Paramétrage & audit',
    question: 'Qui a effectué une modification donnée ?',
    params: [{ key: 'DOSSIER', label: 'N° dossier ou objet modifié', required: true }],
    presentation: 'LISTE',
    async impl(_ctx, params) {
      const terme = params.DOSSIER?.trim().toUpperCase();
      if (!terme) throw new AssistantError('Numéro de dossier ou objet requis.');
      const ops = await db.historiqueParametre.findMany({
        where: {
          OR: [
            { objet: { contains: terme, mode: 'insensitive' as const } },
            { entiteId: terme },
          ],
        },
        orderBy: { dateModification: 'desc' },
        take: LIMITE_LISTE,
        select: { dateModification: true, entite: true, champ: true, action: true, modifiePar: true, motif: true },
      });
      if (ops.length === 0) return resultatVide(T(`Auteur des modifications de « ${terme} »`));
      return resultatListe(
        T(`Auteur des modifications de « ${terme} »`),
        [
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'entite', label: 'Entité', type: 'texte' },
          { key: 'champ', label: 'Champ', type: 'texte' },
          { key: 'action', label: 'Action', type: 'texte' },
          { key: 'par', label: 'Auteur', type: 'texte' },
        ],
        ops.map((o) => ({
          date: o.dateModification.toISOString(),
          entite: o.entite,
          champ: o.champ,
          action: o.action,
          par: o.modifiePar,
        })),
        ops.length,
        `${ops.length} modification(s) tracée(s) pour cet objet.`
      );
    },
  },
  {
    id: 'TECH_SOCIETES_PARAMS_INCOMPLETS',
    role: 'TECHNIQUE',
    categorie: 'Paramétrage & audit',
    question: 'Quelles sociétés ont des paramètres incomplets ?',
    params: [],
    presentation: 'LISTE',
    note: 'Sociétés sans barème actif ou sans mode de calcul d\u2019appel de fonds configuré.',
    async impl() {
      const societes = await db.societe.findMany({
        select: {
          id: true, nom: true,
          _count: { select: { baremes: true } },
          modeCalculAppelFonds: { select: { id: true } },
        },
        orderBy: { nom: 'asc' },
      });
      const incompletes = societes.filter((s) => s._count.baremes === 0 || !s.modeCalculAppelFonds);
      if (incompletes.length === 0) return resultatVide(T('Sociétés incomplètes'));
      return resultatListe(
        T('Sociétés avec paramétrage incomplet'),
        [
          { key: 'nom', label: 'Société', type: 'texte' },
          { key: 'baremes', label: 'Nb barèmes', type: 'nombre' },
          { key: 'appelFonds', label: 'Mode appel de fonds', type: 'texte' },
        ],
        incompletes.slice(0, LIMITE_LISTE).map((s) => ({
          nom: s.nom,
          baremes: s._count.baremes,
          appelFonds: s.modeCalculAppelFonds ? 'Configuré' : 'Non configuré',
        })),
        incompletes.length,
        `${incompletes.length} société(s) sans barème ou sans mode de calcul d'appel de fonds.`
      );
    },
  },
  {
    id: 'TECH_PRESTATAIRES_ADMIN_MANQUANT',
    role: 'TECHNIQUE',
    categorie: 'Paramétrage & audit',
    question: 'Quels prestataires ont des informations administratives manquantes ?',
    params: [],
    presentation: 'LISTE',
    note: 'Prestataires actifs sans NIF ou sans RIB enregistré.',
    async impl() {
      const prests = await db.prestataire.findMany({
        where: { actif: true, OR: [{ nif: null }, { rib: null }] },
        select: { nom: true, type: true, nif: true, rib: true },
        orderBy: { nom: 'asc' },
        take: LIMITE_LISTE,
      });
      if (prests.length === 0) return resultatVide(T('Prestataires sans informations administratives'));
      return resultatListe(
        T('Prestataires sans informations administratives (NIF / RIB)'),
        [
          { key: 'nom', label: 'Prestataire', type: 'texte' },
          { key: 'nif', label: 'NIF', type: 'texte' },
          { key: 'rib', label: 'RIB', type: 'texte' },
        ],
        prests.map((p) => ({ nom: p.nom, nif: p.nif ?? 'Manquant', rib: p.rib ?? 'Manquant' })),
        prests.length,
        `${prests.length} prestataire(s) actif(s) sans NIF ou sans RIB.`
      );
    },
  },
  {
    id: 'TECH_CONTRATS_MAJ_TECHNIQUE',
    role: 'TECHNIQUE',
    categorie: 'Paramétrage & audit',
    question: 'Quels contrats nécessitent une mise à jour technique ?',
    params: [],
    presentation: 'LISTE',
    note: 'Contrats expirés ou arrivant à échéance dans les 90 jours.',
    async impl() {
      const limite = new Date();
      limite.setDate(limite.getDate() + 90);
      const contrats = await db.contrat.findMany({
        where: { dateFin: { lte: limite } },
        orderBy: { dateFin: 'asc' },
        take: LIMITE_LISTE,
        select: { reference: true, statut: true, dateFin: true, societe: { select: { nom: true } } },
      });
      if (contrats.length === 0) return resultatVide(T('Contrats à mettre à jour'));
      return resultatListe(
        T('Contrats nécessitant une mise à jour (expirés / à échéance < 90 j)'),
        [
          { key: 'ref', label: 'Référence', type: 'texte' },
          { key: 'societe', label: 'Société', type: 'texte' },
          { key: 'statut', label: 'Statut', type: 'texte' },
          { key: 'fin', label: 'Date de fin', type: 'date' },
        ],
        contrats.map((c) => ({
          ref: c.reference, societe: c.societe.nom, statut: c.statut, fin: c.dateFin.toISOString(),
        })),
        contrats.length,
        `${contrats.length} contrat(s) expiré(s) ou arrivant à échéance dans les 90 jours.`
      );
    },
  },
  {
    id: 'TECH_REF_RECENTES',
    role: 'TECHNIQUE',
    categorie: 'Paramétrage & audit',
    question: 'Quelles données de référence ont été récemment modifiées ?',
    params: [],
    presentation: 'LISTE',
    async impl() {
      const ops = await db.historiqueParametre.findMany({
        where: { entite: { in: ENTITES_REFERENCE } },
        orderBy: { dateModification: 'desc' },
        take: LIMITE_LISTE,
        select: { dateModification: true, entite: true, objet: true, champ: true, action: true, modifiePar: true },
      });
      if (ops.length === 0) return resultatVide(T('Données de référence récentes'));
      return resultatListe(
        T('Données de référence récemment modifiées'),
        [
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'entite', label: 'Entité', type: 'texte' },
          { key: 'objet', label: 'Objet', type: 'texte' },
          { key: 'champ', label: 'Champ', type: 'texte' },
          { key: 'par', label: 'Par', type: 'texte' },
        ],
        ops.map((o) => ({
          date: o.dateModification.toISOString(),
          entite: o.entite, objet: o.objet ?? '—', champ: o.champ, action: o.action, par: o.modifiePar,
        })),
        ops.length,
        `${ops.length} dernière(s) modification(s) du référentiel (barèmes, prestataires, sociétés, assurés, contrats).`
      );
    },
  },
  {
    id: 'TECH_PARAMS_A_VERIFIER',
    role: 'TECHNIQUE',
    categorie: 'Paramétrage & audit',
    question: 'Quelles opérations de paramétrage nécessitent une vérification ?',
    params: [],
    presentation: 'LISTE',
    note: 'Opérations du journal d\u2019audit classées SENSIBLE ou CRITIQUE.',
    async impl() {
      const ops = await db.historiqueParametre.findMany({
        where: { niveau: { in: ['SENSIBLE', 'CRITIQUE'] } },
        orderBy: { dateModification: 'desc' },
        take: LIMITE_LISTE,
        select: { dateModification: true, module: true, objet: true, action: true, niveau: true, modifiePar: true },
      });
      if (ops.length === 0) return resultatVide(T('Opérations à vérifier'));
      return resultatListe(
        T('Opérations de paramétrage à vérifier (sensibles / critiques)'),
        [
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'module', label: 'Module', type: 'texte' },
          { key: 'objet', label: 'Objet', type: 'texte' },
          { key: 'action', label: 'Action', type: 'texte' },
          { key: 'niveau', label: 'Niveau', type: 'texte' },
          { key: 'par', label: 'Par', type: 'texte' },
        ],
        ops.map((o) => ({
          date: o.dateModification.toISOString(),
          module: o.module ?? '—', objet: o.objet ?? '—', action: o.action, niveau: o.niveau, par: o.modifiePar,
        })),
        ops.length,
        `${ops.length} opération(s) sensible(s) ou critique(s) tracée(s).`
      );
    },
  },
];
