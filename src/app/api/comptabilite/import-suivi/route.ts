import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import * as XLSX from "xlsx";

/**
 * Import Suivi Comptabilité (Excel)
 *
 * Met à jour les dossiers existants avec les données de suivi comptabilité :
 * statut, montant payé, date de paiement, référence de paiement, moyen de paiement.
 *
 * Colonnes attendues :
 *   NumeroDossier (obligatoire)
 *   Statut              — RECU, EN_ANALYSE, VALIDE, EN_COMPTABILITE, EN_PAIEMENT, PAYE, REJETE
 *   MontantPaye         — montant payé (nombre)
 *   DatePaiement        — date de paiement (DD/MM/YYYY ou format Excel)
 *   ReferencePaiement   — référence / numéro de pièce comptable
 *   MoyenPaiement       — VIREMENT, CHEQUE, ESPECE, PRELEVEMENT
 *   Observations        — notes libres
 */

const VALID_STATUTS = ["RECU", "EN_ANALYSE", "VALIDE", "EN_COMPTABILITE", "EN_PAIEMENT", "PAYE", "REJETE"];
const VALID_MOYENS = ["VIREMENT", "CHEQUE", "ESPECE", "PRELEVEMENT", "VIREMENT_BANCAIRE"];

interface Anomalie {
  ligne: number;
  type: "erreur" | "avertissement";
  champ: string;
  message: string;
}

interface LigneResultat {
  numeroLigne: number;
  numeroDossier: string;
  statut: "SUCCES" | "ERREUR" | "IGNOREE";
  erreur: string | null;
  details: string;
}

export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    }

    const allowedExts = [".xlsx", ".xls"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowedExts.includes(ext)) {
      return NextResponse.json({ error: "Format de fichier invalide. Utilisez .xlsx ou .xls" }, { status: 400 });
    }

    // Lecture du fichier Excel
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName]);

    if (rows.length === 0) {
      return NextResponse.json({ error: "Le fichier est vide (aucune ligne de données)" }, { status: 400 });
    }

    const anomalies: Anomalie[] = [];
    const resultats: LigneResultat[] = [];
    let nbSucces = 0;
    let nbErreurs = 0;
    let nbIgnorees = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const ligneNum = i + 2; // Numéro de ligne Excel (1-indexé + en-tête)

      // Extraction du numéro de dossier (champ obligatoire)
      const numeroDossier = String(
        row["NumeroDossier"] || row["numeroDossier"] || row["N° Dossier"] || row["N°Dossier"] || row["No Dossier"] || ""
      ).trim();

      if (!numeroDossier) {
        anomalies.push({
          ligne: ligneNum,
          type: "erreur",
          champ: "NumeroDossier",
          message: "Numéro de dossier manquant — cette ligne est ignorée",
        });
        nbErreurs++;
        resultats.push({
          numeroLigne: ligneNum,
          numeroDossier: "(vide)",
          statut: "ERREUR",
          erreur: "Numéro de dossier manquant",
          details: JSON.stringify(row),
        });
        continue;
      }

      // Recherche du dossier existant
      const existing = await db.dossier.findUnique({ where: { numeroDossier }, select: { numeroDossier: true, statut: true, montantPaye: true, datePaiement: true, referencePaiement: true, moyenPaiement: true, historique: true } });

      if (!existing) {
        anomalies.push({
          ligne: ligneNum,
          type: "avertissement",
          champ: "NumeroDossier",
          message: `Dossier ${numeroDossier} introuvable — ignoré`,
        });
        nbIgnorees++;
        resultats.push({
          numeroLigne: ligneNum,
          numeroDossier,
          statut: "IGNOREE",
          erreur: null,
          details: `Dossier non trouvé dans la base`,
        });
        continue;
      }

      // Extraction des champs de suivi
      const statutRaw = String(row["Statut"] || row["statut"] || row["StatutDossier"] || "").trim().toUpperCase();
      const montantPayeRaw = row["MontantPaye"] || row["montantPaye"] || row["Montant Payé"] || row["Montant"] || "0";
      const datePaiementRaw = row["DatePaiement"] || row["datePaiement"] || row["Date Paiement"] || row["Date"];
      const refPaiement = String(
        row["ReferencePaiement"] || row["referencePaiement"] || row["Référence"] || row["Reference"] || row["RefPaiement"] || ""
      ).trim();
      const moyenPaiementRaw = String(
        row["MoyenPaiement"] || row["moyenPaiement"] || row["Moyen"] || row["ModePaiement"] || ""
      ).trim().toUpperCase().replace(/[\s-]/g, "_");
      const observations = String(row["Observations"] || row["observations"] || row["Notes"] || row["notes"] || "").trim();

      // Validation du statut
      let statut: string | undefined;
      if (statutRaw && VALID_STATUTS.includes(statutRaw)) {
        statut = statutRaw;
      } else if (statutRaw) {
        anomalies.push({
          ligne: ligneNum,
          type: "avertissement",
          champ: "Statut",
          message: `Statut invalide "${statutRaw}" — statut non modifié`,
        });
      }

      // Validation du montant
      let montantPaye: number | undefined;
      if (montantPayeRaw !== null && montantPayeRaw !== undefined && montantPayeRaw !== "") {
        const parsed = parseFloat(String(montantPayeRaw));
        if (!isNaN(parsed) && parsed >= 0) {
          montantPaye = parsed;
          if (parsed > 500_000_000) {
            anomalies.push({
              ligne: ligneNum,
              type: "avertissement",
              champ: "MontantPaye",
              message: `Montant suspect : ${parsed.toLocaleString("fr-FR")} Ar`,
            });
          }
        } else {
          anomalies.push({
            ligne: ligneNum,
            type: "avertissement",
            champ: "MontantPaye",
            message: `Montant invalide "${montantPayeRaw}" — ignoré`,
          });
        }
      }

      // Validation de la date
      let datePaiement: Date | undefined;
      if (datePaiementRaw) {
        if (datePaiementRaw instanceof Date) {
          datePaiement = datePaiementRaw;
        } else {
          const d = new Date(String(datePaiementRaw));
          if (!isNaN(d.getTime())) {
            datePaiement = d;
          } else {
            anomalies.push({
              ligne: ligneNum,
              type: "avertissement",
              champ: "DatePaiement",
              message: `Date invalide "${datePaiementRaw}" — date non mise à jour`,
            });
          }
        }
      }

      // Validation du moyen de paiement
      let moyenPaiement: string | undefined;
      if (moyenPaiementRaw) {
        if (VALID_MOYENS.includes(moyenPaiementRaw)) {
          moyenPaiement = moyenPaiementRaw;
        } else {
          anomalies.push({
            ligne: ligneNum,
            type: "avertissement",
            champ: "MoyenPaiement",
            message: `Moyen de paiement "${moyenPaiementRaw}" non reconnu — non mis à jour`,
          });
        }
      }

      // Construction des données de mise à jour
      const updateData: Record<string, unknown> = {};
      const changements: string[] = [];

      if (statut) {
        updateData.statut = statut;
        changements.push(`Statut: ${existing.statut} → ${statut}`);
      }
      if (montantPaye !== undefined) {
        updateData.montantPaye = montantPaye;
        changements.push(`MontantPayé: ${existing.montantPaye || 0} → ${montantPaye}`);
      }
      if (datePaiement) {
        updateData.datePaiement = datePaiement;
        changements.push(`DatePaiement: ${existing.datePaiement?.toLocaleDateString("fr-FR") || "-"} → ${datePaiement.toLocaleDateString("fr-FR")}`);
      }
      if (refPaiement) {
        updateData.referencePaiement = refPaiement;
        changements.push(`RéfPaiement: ${refPaiement}`);
      }
      if (moyenPaiement) {
        updateData.moyenPaiement = moyenPaiement;
        changements.push(`MoyenPaiement: ${moyenPaiement}`);
      }
      if (observations) {
        updateData.observations = observations;
        changements.push(`Observations ajoutées`);
      }

      // Si aucune donnée à mettre à jour, on ignore
      if (changements.length === 0) {
        nbIgnorees++;
        resultats.push({
          numeroLigne: ligneNum,
          numeroDossier,
          statut: "IGNOREE",
          erreur: null,
          details: "Aucune donnée à mettre à jour",
        });
        continue;
      }

      // Mise à jour de l'historique du dossier (champ JSON string)
      const historiqueEntry = {
        date: new Date().toISOString(),
        action: "IMPORT_SUIVI_COMPTA",
        utilisateur: "Import Suivi Comptabilité",
        details: changements.join("; "),
      };
      let historiqueArr: unknown[] = [];
      try {
        historiqueArr = JSON.parse(existing.historique || "[]");
        if (!Array.isArray(historiqueArr)) historiqueArr = [];
      } catch {
        historiqueArr = [];
      }
      historiqueArr.push(historiqueEntry);

      try {
        await db.dossier.update({
          where: { numeroDossier },
          data: {
            ...updateData,
            historique: JSON.stringify(historiqueArr),
          },
        });

        nbSucces++;
        resultats.push({
          numeroLigne: ligneNum,
          numeroDossier,
          statut: "SUCCES",
          erreur: null,
          details: changements.join("; "),
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erreur inconnue lors de la mise à jour";
        anomalies.push({
          ligne: ligneNum,
          type: "erreur",
          champ: "SYSTEM",
          message: msg,
        });
        nbErreurs++;
        resultats.push({
          numeroLigne: ligneNum,
          numeroDossier,
          statut: "ERREUR",
          erreur: msg,
          details: JSON.stringify(row),
        });
      }
    }

    // Créer l'historique d'import global
    const historique = await db.importHistorique.create({
      data: {
        source: "SUIVI_COMPTA",
        nomFichier: file.name,
        nbLignes: rows.length,
        nbSucces,
        nbErreurs,
        rapport: JSON.stringify(anomalies),
      },
    });

    // Créer les lignes de détail d'import
    for (const r of resultats) {
      await db.importDossier.create({
        data: {
          importId: historique.id,
          numeroLigne: r.numeroLigne,
          statutImport: r.statut,
          erreur: r.erreur,
          donnees: JSON.stringify({ numeroDossier: r.numeroDossier, details: r.details }),
        },
      });
    }

    return NextResponse.json({
      importId: historique.id,
      source: "SUIVI_COMPTA",
      nomFichier: file.name,
      nbLignes: rows.length,
      nbSucces,
      nbErreurs,
      nbIgnorees,
      tauxSucces: rows.length > 0 ? Math.round((nbSucces / rows.length) * 100) : 0,
      anomalies: anomalies.slice(0, 50),
    });
  } catch (error) {
    console.error("[Import Suivi Compta] Erreur:", error);
    return NextResponse.json({ error: "Erreur lors de l'importation du suivi" }, { status: 500 });
  }
}