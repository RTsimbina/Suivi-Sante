import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/authorize";
import { db } from "@/lib/db";
import * as XLSX from "xlsx";

/**
 * Recherche une valeur dans un objet de ligne Excel en ignorant la casse.
 * Parcourt les clés de l'objet et retourne la première correspondance trouvée.
 */
function findColumn(row: Record<string, unknown>, columnName: string): unknown {
  const lower = columnName.toLowerCase();
  for (const key of Object.keys(row)) {
    if (key.toLowerCase() === lower) {
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
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ erreur: "Fichier requis" }, { status: 400 });
    }

    if (!file.name.endsWith(".xlsx")) {
      return NextResponse.json(
        { erreur: "Format de fichier invalide. Seuls les fichiers .xlsx sont acceptés." },
        { status: 400 }
      );
    }

    // Lecture du fichier Excel
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[sheetName]
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { erreur: "Le fichier est vide ou ne contient aucune donnée." },
        { status: 400 }
      );
    }

    let nbSucces = 0;
    let nbErreurs = 0;
    const erreursDetail: { ligne: number; numeroDossier: string; message: string }[] = [];
    const importDossiers: {
      numeroLigne: number;
      statutImport: string;
      erreur: string | null;
      donnees: string;
    }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const ligneNum = i + 2; // Numéro de ligne Excel (en-tête = ligne 1)
      const donnees = JSON.stringify(row);

      // Extraction des colonnes (insensible à la casse)
      const numeroDossier = String(
        findColumn(row, "NumeroDossier") || ""
      ).trim();
      const montantValideRaw = findColumn(row, "MontantValide");
      const dateTraitementRaw = findColumn(row, "DateTraitement");

      // Validation du numéro de dossier
      if (!numeroDossier) {
        nbErreurs++;
        const message = "Numéro de dossier manquant";
        erreursDetail.push({ ligne: ligneNum, numeroDossier: "", message });
        importDossiers.push({
          numeroLigne: ligneNum,
          statutImport: "ERREUR",
          erreur: message,
          donnees,
        });
        continue;
      }

      // Recherche du dossier existant
      const existingDossier = await db.dossier.findUnique({
        where: { numeroDossier },
      });

      if (!existingDossier) {
        nbErreurs++;
        const message = `Aucun dossier trouvé avec le numéro '${numeroDossier}'`;
        erreursDetail.push({ ligne: ligneNum, numeroDossier, message });
        importDossiers.push({
          numeroLigne: ligneNum,
          statutImport: "ERREUR",
          erreur: message,
          donnees,
        });
        continue;
      }

      // Préparation des données de mise à jour
      const updateData: Record<string, unknown> = {};

      // Montant validé par ISA
      if (montantValideRaw !== undefined && montantValideRaw !== null && montantValideRaw !== "") {
        const montant = parseFloat(String(montantValideRaw));
        if (!isNaN(montant) && montant >= 0) {
          updateData.montantValide = montant;
        }
      }

      // Date de traitement technique (date à laquelle l'ISA a traité le dossier)
      if (dateTraitementRaw !== undefined && dateTraitementRaw !== null && dateTraitementRaw !== "") {
        const dateTraitement = new Date(String(dateTraitementRaw));
        if (!isNaN(dateTraitement.getTime())) {
          updateData.dateTraitementTechnique = dateTraitement;
        }
      }

      // Mise à jour du statut : RECU → EN_ANALYSE
      if (existingDossier.statut === "RECU") {
        updateData.statut = "EN_ANALYSE";
      }

      // Vérifier qu'il y a des données à mettre à jour
      if (Object.keys(updateData).length === 0) {
        nbErreurs++;
        const message = `Aucune donnée exploitable pour le dossier '${numeroDossier}'`;
        erreursDetail.push({ ligne: ligneNum, numeroDossier, message });
        importDossiers.push({
          numeroLigne: ligneNum,
          statutImport: "ERREUR",
          erreur: message,
          donnees,
        });
        continue;
      }

      try {
        await db.dossier.update({
          where: { numeroDossier },
          data: updateData,
        });

        nbSucces++;
        importDossiers.push({
          numeroLigne: ligneNum,
          statutImport: "SUCCES",
          erreur: null,
          donnees,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erreur inconnue lors de la mise à jour";
        nbErreurs++;
        erreursDetail.push({ ligne: ligneNum, numeroDossier, message: msg });
        importDossiers.push({
          numeroLigne: ligneNum,
          statutImport: "ERREUR",
          erreur: msg,
          donnees,
        });
      }
    }

    // Création de l'historique d'import avec la source ISA_TECHNIQUE
    const historique = await db.importHistorique.create({
      data: {
        source: "ISA_TECHNIQUE",
        nomFichier: file.name,
        nbLignes: rows.length,
        nbSucces,
        nbErreurs,
        rapport: JSON.stringify(erreursDetail),
      },
    });

    // Création des lignes d'import détaillées
    for (const imp of importDossiers) {
      await db.importDossier.create({
        data: {
          importId: historique.id,
          numeroLigne: imp.numeroLigne,
          statutImport: imp.statutImport,
          erreur: imp.erreur,
          donnees: imp.donnees,
        },
      });
    }

    return NextResponse.json({
      importId: historique.id,
      source: "ISA_TECHNIQUE",
      nomFichier: file.name,
      nbLignes: rows.length,
      nbSucces,
      nbErreurs,
      tauxSucces:
        rows.length > 0 ? Math.round((nbSucces / rows.length) * 100) : 0,
      erreurs: erreursDetail.slice(0, 50),
    });
  } catch (error) {
    console.error("[ISA_TECHNIQUE] Erreur lors de l'importation :", error);
    return NextResponse.json(
      { erreur: "Erreur interne lors de l'importation ISA Technique." },
      { status: 500 }
    );
  }
}