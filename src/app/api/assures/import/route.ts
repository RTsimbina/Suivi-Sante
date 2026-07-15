import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/authorize';
import { db } from '@/lib/db';
import * as XLSX from 'xlsx';

/**
 * Recherche une valeur dans un objet de ligne Excel en ignorant la casse.
 */
function findColumn(row: Record<string, unknown>, columnName: string): unknown {
  const lower = columnName.toLowerCase();
  for (const key of Object.keys(row)) {
    if (key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '')) {
      return row[key];
    }
  }
  return undefined;
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

    if (!file.name.endsWith('.xlsx')) {
      return NextResponse.json(
        { erreur: 'Format invalide. Seuls les fichiers .xlsx sont acceptés.' },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName]);

    if (rows.length === 0) {
      return NextResponse.json(
        { erreur: 'Le fichier est vide ou ne contient aucune donnée.' },
        { status: 400 },
      );
    }

    // Charger toutes les sociétés une seule fois (pour résoudre nom → id)
    const allSocietes = await db.societe.findMany({ select: { id: true, nom: true } });
    const societeMap = new Map(allSocietes.map((s) => [s.nom.toLowerCase().trim(), s.id]));

    let nbSucces = 0;
    let nbErreurs = 0;
    const erreurs: { ligne: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const ligneNum = i + 2; // Ligne Excel (en-tête = 1)

      // Extraction des colonnes
      const nomRaw = findColumn(row, 'Nom');
      const prenomRaw = findColumn(row, 'Prenom') || findColumn(row, 'Prénom');
      const societeRaw = findColumn(row, 'Societe') || findColumn(row, 'Société');
      const nssRaw = findColumn(row, 'NSS') || findColumn(row, 'NumeroSS') || findColumn(row, 'NuméroSS') || findColumn(row, 'N°SS');
      const dateNaissRaw = findColumn(row, 'DateNaissance') || findColumn(row, 'Date de naissance');
      const sexeRaw = findColumn(row, 'Sexe');
      const telRaw = findColumn(row, 'Telephone') || findColumn(row, 'Téléphone') || findColumn(row, 'Tel');
      const emailRaw = findColumn(row, 'Email') || findColumn(row, 'E-mail') || findColumn(row, 'Courriel');
      const adresseRaw = findColumn(row, 'Adresse');

      const nom = nomRaw ? String(nomRaw).trim() : '';
      if (!nom) {
        nbErreurs++;
        erreurs.push({ ligne: ligneNum, message: 'Nom manquant.' });
        continue;
      }

      // Résoudre la société
      const societeNom = societeRaw ? String(societeRaw).trim() : '';
      const societeId = societeMap.get(societeNom.toLowerCase());
      if (!societeId) {
        nbErreurs++;
        erreurs.push({ ligne: ligneNum, message: `Société "${societeNom}" introuvable. Vérifiez le nom exact.` });
        continue;
      }

      // Vérifier doublon NSS
      const nss = nssRaw ? String(nssRaw).trim() : null;
      if (nss) {
        const existing = await db.assure.findUnique({ where: { nSS: nss } });
        if (existing) {
          nbErreurs++;
          erreurs.push({ ligne: ligneNum, message: `NSS "${nss}" déjà utilisé par ${existing.prenom ? existing.prenom + ' ' : ''}${existing.nom}.` });
          continue;
        }
      }

      // Parser la date de naissance
      let dateNaissance: Date | null = null;
      if (dateNaissRaw) {
        const d = new Date(String(dateNaissRaw));
        if (!isNaN(d.getTime())) {
          dateNaissance = d;
        }
      }

      // Normaliser le sexe
      const sexeStr = sexeRaw ? String(sexeRaw).trim().toUpperCase() : null;
      const sexe = sexeStr === 'M' || sexeStr === 'MASCULIN' || sexeStr === 'H' || sexeStr === 'HOMME'
        ? 'M'
        : sexeStr === 'F' || sexeStr === 'FEMININ' || sexeStr === 'FEMME'
          ? 'F'
          : null;

      try {
        await db.assure.create({
          data: {
            societeId,
            nom,
            prenom: prenomRaw ? String(prenomRaw).trim() : null,
            nSS: nss,
            dateNaissance,
            sexe,
            telephone: telRaw ? String(telRaw).trim() : null,
            email: emailRaw ? String(emailRaw).trim().toLowerCase() : null,
            adresse: adresseRaw ? String(adresseRaw).trim() : null,
            actif: true,
          },
        });
        nbSucces++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erreur inconnue';
        // Ignorer les erreurs d'unicité Prisma (P2002)
        if (msg.includes('P2002') || msg.includes('Unique')) {
          nbErreurs++;
          erreurs.push({ ligne: ligneNum, message: `Assuré "${nom}" existe déjà (doublon).` });
        } else {
          nbErreurs++;
          erreurs.push({ ligne: ligneNum, message: msg });
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