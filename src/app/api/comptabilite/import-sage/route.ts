import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import * as XLSX from "xlsx";

/**
 * Import SAGE Comptabilité
 *
 * Importe les données de paiement depuis un export SAGE.
 * Le fichier SAGE contient généralement les règlements effectués :
 * numéro de dossier, montant payé, date de paiement, référence de pièce, mode de règlement.
 *
 * Colonnes attendues (noms SAGE typiques) :
 *   NumeroDossier / N° Dossier / NoPiece        (obligatoire)
 *   MontantPaye / Montant / NetAPayer          (nombre)
 *   DatePaiement / Date / DateEcheance          (date)
 *   ReferencePaiement / RefPiece / RefReglement (texte)
 *   MoyenPaiement / ModeReglement / TypeReglement
 *   CompteGeneral / Journal                     (pour traçabilité)
 *   StatutPaiement                             (optionnel, force le statut)
 */

const VALID_STATUTS = ["RECU", "EN_ANALYSE", "VALIDE", "EN_COMPTABILITE", "EN_PAIEMENT", "PAYE", "REJETE"];
const VALID_MOYENS = ["VIREMENT", "CHEQUE", "ESPECE", "PRELEVEMENT", "VIREMENT_BANCAIRE", "CARTE"];

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

/**
 * Normalise les noms de colonnes SAGE vers nos clés internes.
 * SAGE utilise souvent des noms spécifiques selon la version et la config.
 */
function extraireChamp(row: Record<string, unknown>, ...candidates: string[]): unknown {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== null && String(row[c]).trim() !== "") return row[c];
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
      return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    }

    const allowedExts = [".xlsx", ".xls", ".csv"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowedExts.includes(ext)) {
      return NextResponse.json(
        { error: "Format invalide. Utilisez .xlsx, .xls ou .csv" },
        { status: 400 }
      );
    }

    // Lecture du fichier
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
    let totalMontant = 0;

    // Charger tous les numéros de dossier existants pour le matching rapide
    const existingDossiers = await db.dossier.findMany({
      select: { numeroDossier: true, statut: true, montantPaye: true, montantReclame: true, historique: true },
    });
    const dossierMap = new Map(existingDossiers.map((d) => [d.numeroDossier, d]));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const ligneNum = i + 2;

      // Extraction du numéro de dossier — plusieurs noms possibles venant de SAGE
      const numeroDossier = String(
        extraireChamp(
          row,
          "NumeroDossier",
          "numeroDossier",
          "N° Dossier",
          "NoDossier",
          "No Dossier",
          "NoPiece",
          "N° Pièce",
          "RefDossier",
          "ReferenceDossier",
          "Réf Dossier"
        ) || ""
      ).trim();

      if (!numeroDossier) {
        anomalies.push({
          ligne: ligneNum,
          type: "erreur",
          champ: "NumeroDossier",
          message: "Numéro de dossier manquant",
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

      // Vérification existence du dossier
      const existing = dossierMap.get(numeroDossier);
      if (!existing) {
        anomalies.push({
          ligne: ligneNum,
          type: "avertissement",
          champ: "NumeroDossier",
          message: `Dossier ${numeroDossier} non trouvé en base — ignoré`,
        });
        nbIgnorees++;
        resultats.push({
          numeroLigne: ligneNum,
          numeroDossier,
          statut: "IGNOREE",
          erreur: null,
          details: "Dossier absent de la base de données",
        });
        continue;
      }

      // Extraction des champs SAGE
      const montantPayeRaw = extraireChamp(row, "MontantPaye", "montantPaye", "Montant Payé", "Montant", "NetAPayer", "Net à Payer", "MontantReglement");
      const datePaiementRaw = extraireChamp(row, "DatePaiement", "datePaiement", "Date Paiement", "Date", "DateEcheance", "DateEcriture", "Date Écriture");
      const refPaiementRaw = extraireChamp(row, "ReferencePaiement", "referencePaiement", "Référence", "Reference", "RefPiece", "Ref Pièce", "RefReglement", "N° Pièce", "NoPiece");
      const moyenPaiementRaw = extraireChamp(row, "MoyenPaiement", "moyenPaiement", "Moyen", "ModeReglement", "Mode Règlement", "TypeReglement", "Type Règlement", "LibelleReglement");
      const statutPaiementRaw = extraireChamp(row, "StatutPaiement", "statutPaiement", "Statut", "Etat");
      const compteGeneral = String(extraireChamp(row, "CompteGeneral", "compteGeneral", "Compte", "Journal") || "").trim();

      // Parsing montant
      let montantPaye: number | undefined;
      if (montantPayeRaw !== undefined) {
        const parsed = parseFloat(String(montantPayeRaw).replace(/\s/g, "").replace(",", "."));
        if (!isNaN(parsed) && parsed >= 0) {
          montantPaye = parsed;
          if (parsed > 1_000_000_000) {
            anomalies.push({
              ligne: ligneNum,
              type: "avertissement",
              champ: "MontantPaye",
              message: `Montant très élevé : ${parsed.toLocaleString("fr-FR")} Ar`,
            });
          }
        } else {
          anomalies.push({
            ligne: ligneNum,
            type: "avertissement",
            champ: "MontantPaye",
            message: `Montant non parsable "${montantPayeRaw}"`,
          });
        }
      }

      // Parsing date
      let datePaiement: Date | undefined;
      if (datePaiementRaw !== undefined) {
        if (datePaiementRaw instanceof Date) {
          datePaiement = datePaiementRaw;
        } else {
          const str = String(datePaiementRaw);
          // Essayer le format SAGE DD/MM/YYYY
          const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
          if (match) {
            const day = parseInt(match[1], 10);
            const month = parseInt(match[2], 10) - 1;
            const year = parseInt(match[3], 10);
            const fullYear = year < 100 ? 2000 + year : year;
            const d = new Date(fullYear, month, day);
            if (!isNaN(d.getTime())) datePaiement = d;
          }
          if (!datePaiement) {
            const d = new Date(str);
            if (!isNaN(d.getTime())) datePaiement = d;
          }
          if (!datePaiement) {
            anomalies.push({
              ligne: ligneNum,
              type: "avertissement",
              champ: "DatePaiement",
              message: `Date non reconnue "${str}"`,
            });
          }
        }
      }

      const refPaiement = refPaiementRaw !== undefined ? String(refPaiementRaw).trim() : undefined;

      // Normalisation moyen de paiement
      let moyenPaiement: string | undefined;
      if (moyenPaiementRaw !== undefined) {
        const normalized = String(moyenPaiementRaw).trim().toUpperCase().replace(/[\s-]/g, "_");
        // Mapping des libellés SAGE courants
        const mapping: Record<string, string> = {
          VIREMENT: "VIREMENT",
          VIREMENT_BANCAIRE: "VIREMENT_BANCAIRE",
          "VIREMENT BANCAIRE": "VIREMENT_BANCAIRE",
          VB: "VIREMENT_BANCAIRE",
          CHEQUE: "CHEQUE",
          CHÈQUE: "CHEQUE",
          CHQ: "CHEQUE",
          ESPECE: "ESPECE",
          ESPÈCE: "ESPECE",
          PRELEVEMENT: "PRELEVEMENT",
          PRÉLÈVEMENT: "PRELEVEMENT",
          CARTTE: "CARTE",
          CARTE: "CARTE",
        };
        moyenPaiement = mapping[normalized] || (VALID_MOYENS.includes(normalized) ? normalized : undefined);
        if (!moyenPaiement && String(moyenPaiementRaw).trim()) {
          anomalies.push({
            ligne: ligneNum,
            type: "avertissement",
            champ: "MoyenPaiement",
            message: `Moyen de paiement "${moyenPaiementRaw}" non reconnu`,
          });
        }
      }

      // Validation du statut
      let statutPaiement: string | undefined;
      if (statutPaiementRaw !== undefined) {
        const s = String(statutPaiementRaw).trim().toUpperCase();
        if (VALID_STATUTS.includes(s)) {
          statutPaiement = s;
        } else if (s) {
          anomalies.push({
            ligne: ligneNum,
            type: "avertissement",
            champ: "StatutPaiement",
            message: `Statut "${s}" non reconnu`,
          });
        }
      }

      // Construction de la mise à jour
      const updateData: Record<string, unknown> = {};
      const changements: string[] = [];

      if (montantPaye !== undefined) {
        updateData.montantPaye = montantPaye;
        totalMontant += montantPaye;
        changements.push(`MontantPayé: ${existing.montantPaye || 0} → ${montantPaye}`);
      }

      if (datePaiement) {
        updateData.datePaiement = datePaiement;
        changements.push(`DatePaiement: ${datePaiement.toLocaleDateString("fr-FR")}`);
      }

      if (refPaiement) {
        updateData.referencePaiement = refPaiement;
        changements.push(`RéfPaiement: ${refPaiement}`);
      }

      if (moyenPaiement) {
        updateData.moyenPaiement = moyenPaiement;
        changements.push(`Moyen: ${moyenPaiement}`);
      }

      if (compteGeneral) {
        changements.push(`Compte SAGE: ${compteGeneral}`);
      }

      // Détermination automatique du statut si un paiement est enregistré
      if (montantPaye !== undefined && datePaiement && !statutPaiement) {
        statutPaiement = "PAYE";
        changements.push(`Statut auto → PAYE`);
      } else if (montantPaye !== undefined && !statutPaiement) {
        statutPaiement = "EN_PAIEMENT";
        changements.push(`Statut auto → EN_PAIEMENT`);
      }

      if (statutPaiement && VALID_STATUTS.includes(statutPaiement)) {
        updateData.statut = statutPaiement;
      }

      if (changements.length === 0) {
        nbIgnorees++;
        resultats.push({
          numeroLigne: ligneNum,
          numeroDossier,
          statut: "IGNOREE",
          erreur: null,
          details: "Aucune donnée exploitable",
        });
        continue;
      }

      // Mise à jour de l'historique du dossier (champ JSON string)
      const historiqueEntry = {
        date: new Date().toISOString(),
        action: "IMPORT_SAGE",
        utilisateur: "Import SAGE Comptabilité",
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
            source: "SAGE",
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
        const msg = err instanceof Error ? err.message : "Erreur inconnue";
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

    // Historique d'import global
    const historique = await db.importHistorique.create({
      data: {
        source: "SAGE",
        nomFichier: file.name,
        nbLignes: rows.length,
        nbSucces,
        nbErreurs,
        rapport: JSON.stringify(anomalies),
      },
    });

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
      source: "SAGE",
      nomFichier: file.name,
      nbLignes: rows.length,
      nbSucces,
      nbErreurs,
      nbIgnorees,
      totalMontantImporte: totalMontant,
      tauxSucces: rows.length > 0 ? Math.round((nbSucces / rows.length) * 100) : 0,
      anomalies: anomalies.slice(0, 50),
    });
  } catch (error) {
    console.error("[Import SAGE] Erreur:", error);
    return NextResponse.json({ error: "Erreur lors de l'importation SAGE" }, { status: 500 });
  }
}
