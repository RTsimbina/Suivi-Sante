import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/authorize';
import { db } from '@/lib/db';
import { readExcelRows } from '@/lib/excel';

const STATUTS_VALIDES = ['ASSURE', 'CONJOINT', 'ENFANT'];
const STATUT_ALIASES: Record<string, string> = {
  'ASSURE': 'ASSURE',
  'ASSURE PRINCIPAL': 'ASSURE',
  'PRINCIPAL': 'ASSURE',
  'CONJOINT': 'CONJOINT',
  'CONJOINTE': 'CONJOINT',
  'ENFANT': 'ENFANT',
};

/**
 * Recherche une valeur dans un objet de ligne Excel en ignorant la casse et les accents.
 */
function findColumn(row: Record<string, unknown>, ...names: string[]): unknown {
  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  for (const name of names) {
    const target = normalize(name);
    for (const key of Object.keys(row)) {
      if (normalize(key) === target) {
        return row[key];
      }
    }
  }
  return undefined;
}

/**
 * Parse une date Excel (nombre serial ou chaîne) en Date JS.
 */
function parseExcelDate(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  const str = String(raw).trim();
  if (!str) return null;

  // Format JJ/MM/AAAA ou JJ-MM-AAAA
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const d = new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);
    return isNaN(d.getTime()) ? null : d;
  }

  // Format AAAA-MM-JJ
  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const d = new Date(+iso[1], +iso[2] - 1, +iso[3]);
    return isNaN(d.getTime()) ? null : d;
  }

  // Fallback Date.parse
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Normalise le genre depuis Excel.
 */
function parseSexe(raw: unknown): 'M' | 'F' | null {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase();
  if (['M', 'MASCULIN', 'H', 'HOMME', 'MALE'].includes(s)) return 'M';
  if (['F', 'FEMININ', 'FEMME', 'FEMALE'].includes(s)) return 'F';
  return null;
}

/**
 * Normalise le type de bénéficiaire depuis Excel.
 */
function parseStatut(raw: unknown): string {
  if (!raw) return 'ASSURE';
  const s = String(raw).trim().toUpperCase();
  return STATUT_ALIASES[s] || 'ASSURE';
}

export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ erreur: 'Fichier requis.' }, { status: 400 });
    }

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json(
        { erreur: 'Format invalide. Seuls les fichiers .xlsx et .xls sont acceptés.' },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows } = await readExcelRows(buffer);

    if (rows.length === 0) {
      return NextResponse.json(
        { erreur: 'Le fichier est vide ou ne contient aucune donnée.' },
        { status: 400 },
      );
    }

    // ─── Charger les référentiels ───────────────────────────────────────────
    const allSocietes = await db.societe.findMany({ select: { id: true, nom: true } });
    const societeMap = new Map(
      allSocietes.map((s) => [
        s.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(),
        s.id,
      ]),
    );

    // Matricule → assure principal (pour rattachement des ayants droit)
    const assurePrincipalMap = new Map<string, string>(); // matricule → id
    const matriculeSet = new Set<string>(); // tous les matricules du fichier

    // Passes de lecture : collecter les matricules existants et du fichier
    // Charger les assurés existants par matricule et par nSS
    const existingByMatricule = new Map<string, any>();
    const existingByNSS = new Map<string, any>();
    const existingAssures = await db.assure.findMany({
      select: { id: true, matricule: true, nSS: true, nom: true, prenom: true },
    });
    for (const a of existingAssures) {
      if (a.matricule) existingByMatricule.set(a.matricule, a);
      if (a.nSS) existingByNSS.set(a.nSS, a);
    }

    // ─── Pré-validation : vérifier les colonnes obligatoires ────────────────
    const firstRow = rows[0];
    const hasNom = findColumn(firstRow, 'Nom') !== undefined;
    const hasMatricule = findColumn(firstRow, 'Matricule') !== undefined;
    const hasSociete = findColumn(firstRow, 'Societe', 'Société', 'Societe client', 'Société client', 'Employeur') !== undefined;
    const hasStatut = findColumn(firstRow, 'Statut', 'Type', 'Type bénéficiaire') !== undefined;

    if (!hasNom) {
      return NextResponse.json({ erreur: 'Colonne "Nom" manquante dans le fichier.' }, { status: 400 });
    }
    if (!hasMatricule) {
      return NextResponse.json({ erreur: 'Colonne "Matricule" manquante dans le fichier.' }, { status: 400 });
    }
    if (!hasSociete) {
      return NextResponse.json({ erreur: 'Colonne "Société client" manquante dans le fichier.' }, { status: 400 });
    }

    // ─── Phase 1 : Créer les assurés principaux d'abord ─────────────────────
    let nbSucces = 0;
    let nbErreurs = 0;
    const erreurs: { ligne: number; message: string }[] = [];

    // Trier : assurés principaux d'abord, puis ayants droit
    const indexedRows = rows.map((row, i) => ({ row, index: i }));
    const principaux = indexedRows.filter(({ row }) => {
      const statut = parseStatut(findColumn(row, 'Statut', 'Type', 'Type bénéficiaire'));
      return statut === 'ASSURE';
    });
    const ayantsDroit = indexedRows.filter(({ row }) => {
      const statut = parseStatut(findColumn(row, 'Statut', 'Type', 'Type bénéficiaire'));
      return statut !== 'ASSURE';
    });
    const orderedRows = [...principaux, ...ayantsDroit];

    for (const { row, index } of orderedRows) {
      const ligneNum = index + 2; // Ligne Excel (en-tête = 1)

      // ── Extraction des colonnes ──────────────────────────────────────────
      const nomRaw = findColumn(row, 'Nom');
      const prenomRaw = findColumn(row, 'Prenom', 'Prénom', 'Prénoms');
      const matriculeRaw = findColumn(row, 'Matricule');
      const societeRaw = findColumn(row, 'Societe', 'Société', 'Societe client', 'Société client', 'Employeur');
      const statutRaw = findColumn(row, 'Statut', 'Type', 'Type bénéficiaire');
      const sexeRaw = findColumn(row, 'Genre', 'Sexe');
      const dateNaissRaw = findColumn(row, 'DateNaissance', 'Date de naissance', 'Date naissance');
      const dateEffetRaw = findColumn(row, 'DateEffet', 'Date d\'effet', 'Date effet', 'Date_debut');
      const familleRaw = findColumn(row, 'Famille', 'CodeFamille', 'Code famille', 'Code_famille');
      const baremeRaw = findColumn(row, 'Barème', 'Baréme', 'Barème', 'Bareme');
      const assureRaw = findColumn(row, 'Assuré(e)', 'Assure', 'Assuré', 'Assure principal');
      const telRaw = findColumn(row, 'Telephone', 'Téléphone', 'Tel');
      const emailRaw = findColumn(row, 'Email', 'E-mail', 'Courriel');
      const nssRaw = findColumn(row, 'NSS', 'NumeroSS', 'NuméroSS', 'N°SS', 'N° SS');

      // ── Validations obligatoires ─────────────────────────────────────────
      const nom = nomRaw ? String(nomRaw).trim() : '';
      if (!nom) {
        nbErreurs++;
        erreurs.push({ ligne: ligneNum, message: 'Nom manquant.' });
        continue;
      }

      const matricule = matriculeRaw ? String(matriculeRaw).trim() : '';
      if (!matricule) {
        nbErreurs++;
        erreurs.push({ ligne: ligneNum, message: 'Matricule manquant.' });
        continue;
      }

      // Vérifier doublon de matricule (dans le fichier)
      if (matriculeSet.has(matricule)) {
        nbErreurs++;
        erreurs.push({ ligne: ligneNum, message: `Matricule "${matricule}" dupliqué dans le fichier.` });
        continue;
      }
      matriculeSet.add(matricule);

      // Vérifier doublon de matricule (en base)
      const existingMat = existingByMatricule.get(matricule);
      if (existingMat) {
        nbErreurs++;
        erreurs.push({
          ligne: ligneNum,
          message: `Matricule "${matricule}" déjà utilisé par ${existingMat.prenom ? existingMat.prenom + ' ' : ''}${existingMat.nom}.`,
        });
        continue;
      }

      // ── Résoudre la société ─────────────────────────────────────────────
      const societeNom = societeRaw ? String(societeRaw).trim() : '';
      const societeKey = societeNom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const societeId = societeMap.get(societeKey);
      if (!societeId) {
        nbErreurs++;
        erreurs.push({
          ligne: ligneNum,
          message: `Société "${societeNom}" introuvable. Vérifiez le nom exact.`,
        });
        continue;
      }

      // ── Résoudre le type de bénéficiaire ────────────────────────────────
      const typeBeneficiaire = parseStatut(statutRaw);

      // ── Résoudre l'assuré principal (pour les ayants droit) ─────────────
      let assurePrincipalId: string | null = null;
      if (typeBeneficiaire !== 'ASSURE') {
        // Chercher par le champ "Assuré(e)" qui contient le matricule ou le nom de l'assuré principal
        const assureRef = assureRaw ? String(assureRaw).trim() : '';
        if (assureRef) {
          // D'abord chercher par matricule dans la map des principaux créés
          if (assurePrincipalMap.has(assureRef)) {
            assurePrincipalId = assurePrincipalMap.get(assureRef)!;
          } else {
            // Chercher en base par matricule
            const existing = existingByMatricule.get(assureRef);
            if (existing) {
              assurePrincipalId = existing.id;
            }
          }
        }
        if (!assurePrincipalId && matriculeSet.size > 0) {
          // Fallback : chercher le premier ASSURE du même code famille
          const codeFamille = familleRaw ? String(familleRaw).trim() : '';
          // On ne peut pas facilement faire ce lookup ici, on le signalera
        }
      }

      // ── NSS : vérifier doublon ──────────────────────────────────────────
      const nss = nssRaw ? String(nssRaw).trim() : null;
      if (nss) {
        const existingNss = existingByNSS.get(nss);
        if (existingNss) {
          nbErreurs++;
          erreurs.push({
            ligne: ligneNum,
            message: `NSS "${nss}" déjà utilisé par ${existingNss.prenom ? existingNss.prenom + ' ' : ''}${existingNss.nom}.`,
          });
          continue;
        }
      }

      // ── Date de naissance : validation ──────────────────────────────────
      const dateNaissance = parseExcelDate(dateNaissRaw);

      // ── Date d'effet : validation ───────────────────────────────────────
      const dateEffet = parseExcelDate(dateEffetRaw);

      // ── Barème ─────────────────────────────────────────────────────────
      let bareme: number | null = null;
      if (baremeRaw !== undefined && baremeRaw !== null && baremeRaw !== '') {
        const b = parseFloat(String(baremeRaw).replace(',', '.'));
        if (!isNaN(b) && b > 0 && b <= 1) {
          bareme = b;
        }
      }

      // ── Créer l'assuré ─────────────────────────────────────────────────
      try {
        const assure = await db.assure.create({
          data: {
            societeId,
            nom,
            prenom: prenomRaw ? String(prenomRaw).trim() : null,
            matricule: matricule || null,
            nSS: nss,
            typeBeneficiaire,
            assurePrincipalId: assurePrincipalId || null,
            codeFamille: familleRaw ? String(familleRaw).trim() : null,
            dateNaissance,
            sexe: parseSexe(sexeRaw),
            dateEffet,
            bareme,
            telephone: telRaw ? String(telRaw).trim() : null,
            email: emailRaw ? String(emailRaw).trim().toLowerCase() : null,
            actif: true,
          },
        });

        // Si c'est un assuré principal, le mémoriser pour le rattachement des ayants droit
        if (typeBeneficiaire === 'ASSURE') {
          assurePrincipalMap.set(matricule, assure.id);
          existingByMatricule.set(matricule, assure);
          if (nss) existingByNSS.set(nss, assure);
        }

        nbSucces++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erreur inconnue';
        if (msg.includes('P2002') || msg.includes('Unique')) {
          nbErreurs++;
          erreurs.push({ ligne: ligneNum, message: `Assuré "${nom}" existe déjà (doublon matricule ou NSS).` });
        } else {
          nbErreurs++;
          erreurs.push({ ligne: ligneNum, message: msg });
        }
      }
    }

    // ─── Phase 2 : Rattachement des ayants droit non rattachés ──────────────
    // Certains ayants droit n'ont pas pu être rattachés car l'assuré principal
    // n'était pas encore créé. On fait une passe de correction.
    const unattached = await db.assure.findMany({
      where: {
        typeBeneficiaire: { in: ['CONJOINT', 'ENFANT'] },
        assurePrincipalId: null,
      },
      include: { societe: { select: { id: true, nom: true } } },
    });

    for (const ad of unattached) {
      // Chercher un assuré principal dans la même société avec le même codeFamille
      if (ad.codeFamille) {
        const principal = await db.assure.findFirst({
          where: {
            societeId: ad.societeId,
            codeFamille: ad.codeFamille,
            typeBeneficiaire: 'ASSURE',
          },
        });
        if (principal) {
          await db.assure.update({
            where: { id: ad.id },
            data: { assurePrincipalId: principal.id },
          });
        }
      }
    }

    return NextResponse.json({
      nbLignes: rows.length,
      nbSucces,
      nbErreurs,
      tauxSucces: rows.length > 0 ? Math.round((nbSucces / rows.length) * 100) : 0,
      erreurs: erreurs.slice(0, 50),
    });
  } catch (error) {
    console.error('[IMPORT_ASSURES] Erreur :', error);
    return NextResponse.json(
      { erreur: "Erreur interne lors de l'importation des assurés." },
      { status: 500 },
    );
  }
}
