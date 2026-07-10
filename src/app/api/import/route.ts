import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAuth } from "@/lib/authorize";
import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";
import fs from "fs";
import path from "path";

const VALID_STATUTS = ["RECU", "EN_ANALYSE", "VALIDE", "EN_COMPTABILITE", "EN_PAIEMENT", "PAYE", "REJETE"];

interface Anomalie {
  ligne: number;
  type: "erreur" | "avertissement";
  champ: string;
  message: string;
  donnees: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const source = (formData.get("source") as string) || "EXCEL";
    const categorieDossier = (formData.get("categorie") as string) || "";

    if (!file) {
      return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    }
    if (!["ISA", "SAGE", "EXCEL"].includes(source)) {
      return NextResponse.json({ error: "Source invalide (ISA, SAGE ou EXCEL)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName]);

    const anomalies: Anomalie[] = [];
    let nbSucces = 0;
    let nbErreurs = 0;
    const importDossiers: { numeroLigne: number; statutImport: string; erreur: string | null; donnees: string }[] = [];

    // Récupérer toutes les sociétés pour le matching
    const allSocietes = await db.societe.findMany();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const ligneNum = i + 2; // Excel line number (1-indexed + header)
      const donnees = JSON.stringify(row);

      // Validation des champs obligatoires communs
      const numeroDossier = String(row["NumeroDossier"] || row["numeroDossier"] || row["N° Dossier"] || "").trim();
      const beneficiaire = String(row["Beneficiaire"] || row["beneficiaire"] || row["Bénéficiaire"] || "").trim();
      const societeNom = String(row["Societe"] || row["societe"] || row["Entreprise"] || "").trim();
      const typeDossier = String(row["TypeDossier"] || row["typeDossier"] || row["Type"] || "").trim();
      const montantReclame = parseFloat(String(row["MontantReclame"] || row["montantReclame"] || row["Montant"] || "0"));

      // Catégorie du dossier : depuis Excel ou paramètre du formulaire
      const VALID_CATEGORIES = ["REMBOURSEMENT_ASSURE", "REGLEMENT_PRESTATAIRE"];
      let catDossier = String(row["CategorieDossier"] || row["categorieDossier"] || row["Categorie"] || "").trim().toUpperCase();
      if (!VALID_CATEGORIES.includes(catDossier) && VALID_CATEGORIES.includes(categorieDossier.toUpperCase())) {
        catDossier = categorieDossier.toUpperCase();
      }
      if (!VALID_CATEGORIES.includes(catDossier)) catDossier = "";

      // Validations
      if (!numeroDossier) {
        anomalies.push({ ligne: ligneNum, type: "erreur", champ: "NumeroDossier", message: "Numéro de dossier manquant", donnees: row });
        nbErreurs++;
        importDossiers.push({ numeroLigne: ligneNum, statutImport: "ERREUR", erreur: "Numéro de dossier manquant", donnees });
        continue;
      }
      if (!beneficiaire) {
        anomalies.push({ ligne: ligneNum, type: "erreur", champ: "Beneficiaire", message: "Bénéficiaire manquant", donnees: row });
        nbErreurs++;
        importDossiers.push({ numeroLigne: ligneNum, statutImport: "ERREUR", erreur: "Bénéficiaire manquant", donnees });
        continue;
      }

      // Vérification montant suspect
      if (montantReclame > 50_000_000) {
        anomalies.push({ ligne: ligneNum, type: "avertissement", champ: "MontantReclame", message: `Montant suspect: ${montantReclame.toLocaleString("fr-FR")} Ar`, donnees: row });
      }

      // Trouver ou créer la société
      let societe = allSocietes.find((s) => s.nom.toLowerCase() === societeNom.toLowerCase());
      if (!societe && societeNom) {
        societe = await db.societe.create({ data: { nom: societeNom } });
        allSocietes.push(societe);
      }

      // Parser la date
      const dateReceptionRaw = row["DateReception"] || row["dateReception"] || row["Date"];
      let dateReception: Date | undefined;
      if (dateReceptionRaw) {
        const d = new Date(String(dateReceptionRaw));
        if (!isNaN(d.getTime())) dateReception = d;
        else {
          anomalies.push({ ligne: ligneNum, type: "avertissement", champ: "DateReception", message: "Date invalide, date du jour utilisée", donnees: row });
          dateReception = new Date();
        }
      } else {
        dateReception = new Date();
      }

      try {
        // Vérifier si le dossier existe déjà
        const existing = await db.dossier.findUnique({ where: { numeroDossier } });

        const updateData: Prisma.DossierCreateInput | Prisma.DossierUpdateInput = {};

        // Données ISA : mise à jour technique
        if (source === "ISA") {
          const montantValide = parseFloat(String(row["MontantValide"] || "0")) || undefined;
          const statutTechnique = String(row["StatutTechnique"] || row["Statut"] || "").trim().toUpperCase();
          const dateTraitement = row["DateTraitement"] ? new Date(String(row["DateTraitement"])) : undefined;

          if (montantValide) (updateData as Record<string, unknown>).montantValide = montantValide;
          if (VALID_STATUTS.includes(statutTechnique)) (updateData as Record<string, unknown>).statut = statutTechnique;
          if (dateTraitement && !isNaN(dateTraitement.getTime())) (updateData as Record<string, unknown>).dateTraitementTechnique = dateTraitement;
          (updateData as Record<string, unknown>).source = "ISA";
        }

        // Données SAGE : mise à jour paiement
        if (source === "SAGE") {
          const montantPaye = parseFloat(String(row["MontantPaye"] || "0")) || undefined;
          const datePaiement = row["DatePaiement"] ? new Date(String(row["DatePaiement"])) : undefined;
          const refPaiement = String(row["ReferencePaiement"] || row["Référence"] || "").trim() || undefined;
          const statutPaiement = String(row["StatutPaiement"] || "").trim().toUpperCase();

          if (montantPaye) (updateData as Record<string, unknown>).montantPaye = montantPaye;
          if (datePaiement && !isNaN(datePaiement.getTime())) {
            (updateData as Record<string, unknown>).datePaiement = datePaiement;
            if (VALID_STATUTS.includes(statutPaiement)) (updateData as Record<string, unknown>).statut = statutPaiement;
            else if (!existing?.statut || existing.statut === "EN_PAIEMENT") (updateData as Record<string, unknown>).statut = "PAYE";
          }
          if (refPaiement) (updateData as Record<string, unknown>).referencePaiement = refPaiement;
          (updateData as Record<string, unknown>).source = "SAGE";
        }

        if (existing) {
          // Mise à jour du dossier existant
          await db.dossier.update({
            where: { numeroDossier },
            data: updateData as Prisma.DossierUpdateInput,
          });
        } else {
          // Création nouveau dossier
          const createData: Record<string, unknown> = {
            numeroDossier,
            dateReception,
            beneficiaire,
            typeDossier: typeDossier || "CONSULTATION",
            categorieDossier: catDossier || null,
            societe: societe ? { connect: { id: societe.id } } : undefined,
            montantReclame: montantReclame || 0,
            statut: "RECU",
            source,
          };

          // Ajouter les données spécifiques ISA/SAGE si présentes
          if (source === "ISA" && (updateData as Record<string, unknown>).montantValide) {
            createData.montantValide = (updateData as Record<string, unknown>).montantValide;
          }
          if (source === "SAGE" && (updateData as Record<string, unknown>).montantPaye) {
            createData.montantPaye = (updateData as Record<string, unknown>).montantPaye;
          }

          await db.dossier.create({ data: createData as Prisma.DossierCreateInput });
        }

        nbSucces++;
        importDossiers.push({ numeroLigne: ligneNum, statutImport: "SUCCES", erreur: null, donnees });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erreur inconnue";
        anomalies.push({ ligne: ligneNum, type: "erreur", champ: "SYSTEM", message: msg, donnees: row });
        nbErreurs++;
        importDossiers.push({ numeroLigne: ligneNum, statutImport: "ERREUR", erreur: msg, donnees });
      }
    }

    // Créer l'historique d'import
    const historique = await db.importHistorique.create({
      data: {
        source,
        nomFichier: file.name,
        nbLignes: rows.length,
        nbSucces,
        nbErreurs,
        rapport: JSON.stringify(anomalies),
      },
    });

    // Créer les lignes d'import
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
      source,
      nomFichier: file.name,
      nbLignes: rows.length,
      nbSucces,
      nbErreurs,
      tauxSucces: rows.length > 0 ? Math.round((nbSucces / rows.length) * 100) : 0,
      anomalies: anomalies.slice(0, 50), // Limiter à 50
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json({ error: "Erreur lors de l'importation" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const authError = await checkAuth(request);
    if (authError) return authError;
    const historiques = await db.importHistorique.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { _count: { select: { dossiers: true } } },
    });
    return NextResponse.json({ historiques });
  } catch {
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}