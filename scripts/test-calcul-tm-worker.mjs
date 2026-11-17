/**
 * test-calcul-tm-worker.mjs — Worker des tests du calcul du ticket
 * modérateur centralisé (P2-04). Exécuté via `node --import tsx` avec
 * DATABASE_URL pointant sur le cluster Postgres embarqué de l'orchestrateur.
 *
 * Modes :
 *   --mode=setup                                  Crée les tables minimales
 *   --mode=seed --type=societe --id=S --nom=N     Société
 *   --mode=seed --type=assure --id=A --societe=S  Assuré
 *   --mode=seed --type=bareme --societe=S --acte=X --taux=80 --plafond=500000
 *   --mode=seed --type=dossier --assure=A --societe=S --acte=X
 *                 --montant=N --statut=VALIDE|EN_ANALYSE|REJETE|RECU
 *   --mode=create --societe=S --assure=A --acte=X --montant=N
 *        Réplique EXACTEMENT le pattern du POST /api/dossiers :
 *        verifierPlafondAnnuel (moteur centralisé) puis $transaction avec
 *        FOR UPDATE du barème + re-vérification + recalcul par le service.
 *   --mode=validate --dossier=D
 *        Réplique le pattern du PATCH (EN_ANALYSE → VALIDE) : $transaction +
 *        FOR UPDATE + re-vérification de la consommation à jour.
 *   --mode=state --societe=S --assure=A --acte=X   {consomme, dossiers}
 *
 * Sortie : une ligne JSON préfixée ##TM## par mode (filtrage des logs Prisma).
 */

const argv = process.argv.slice(2);
const arg = (name, fallback = undefined) => {
  const prefix = `--${name}=`;
  const withEq = argv.find((a) => a.startsWith(prefix));
  if (withEq !== undefined) return withEq.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

const TAG = "##TM##";
const mode = arg("mode", "");
const annee = new Date().getFullYear();
const STATUTS_CONSOMMENT = ["EN_ANALYSE", "VALIDE", "EN_COMPTABILITE", "EN_PAIEMENT", "PAYE"];

const { db } = await import(new URL("../src/lib/db.ts", import.meta.url).href);
const { verifierPlafondAnnuel } = await import(new URL("../src/lib/plafond-check.ts", import.meta.url).href);
const { trouverBaremeValide } = await import(new URL("../src/lib/baremes-validite.ts", import.meta.url).href);
const { sommer, enNombre, superieurOuEgal } = await import(new URL("../src/lib/money.ts", import.meta.url).href);
const { calculerRemboursement } = await import(new URL("../src/lib/services/calcul-remboursement.ts", import.meta.url).href);

try {
  if (mode === "setup") {
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "Societe" (
        "id" TEXT PRIMARY KEY,
        "nom" TEXT NOT NULL,
        "nomNormalise" TEXT,
        "actif" BOOLEAN NOT NULL DEFAULT true
      )`;
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "Assure" (
        "id" TEXT PRIMARY KEY,
        "societeId" TEXT NOT NULL REFERENCES "Societe"("id"),
        "nom" TEXT NOT NULL,
        "typeBeneficiaire" TEXT NOT NULL DEFAULT 'ASSURE',
        "actif" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`;
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "Bareme" (
        "id" TEXT PRIMARY KEY,
        "societeId" TEXT NOT NULL REFERENCES "Societe"("id"),
        "prestation" TEXT NOT NULL,
        "tauxCouverture" DOUBLE PRECISION NOT NULL,
        "plafond" DECIMAL(18,2) NOT NULL,
        "description" TEXT,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "valideDu" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "valideAu" TIMESTAMPTZ(3),
        "version" INTEGER NOT NULL DEFAULT 1,
        "supprime" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`;
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "Dossier" (
        "id" TEXT PRIMARY KEY,
        "numeroDossier" TEXT NOT NULL UNIQUE,
        "dateReception" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "societeId" TEXT NOT NULL REFERENCES "Societe"("id"),
        "beneficiaire" TEXT NOT NULL,
        "typeDossier" TEXT NOT NULL,
        "categorieDossier" TEXT,
        "createurId" TEXT,
        "gestionnaireAccueilId" TEXT,
        "gestionnaireTechniqueId" TEXT,
        "gestionnaireComptaId" TEXT,
        "assureId" TEXT REFERENCES "Assure"("id"),
        "nSS" TEXT,
        "prestataireId" TEXT,
        "prestataireLegacy" TEXT,
        "dateSoins" TIMESTAMPTZ(3),
        "moyenPaiement" TEXT,
        "observations" TEXT,
        "dateTraitementTechnique" TIMESTAMPTZ(3),
        "montantReclame" DECIMAL(18,2) NOT NULL,
        "montantValide" DECIMAL(18,2),
        "ticketModerateur" DECIMAL(18,2),
        "partPatient" DECIMAL(18,2),
        "partEntreprise" DECIMAL(18,2),
        "baremeId" TEXT,
        "baremePrestation" TEXT,
        "baremeTaux" DOUBLE PRECISION,
        "baremePlafond" DECIMAL(18,2),
        "baremeValideDu" TIMESTAMPTZ(3),
        "baremeValideAu" TIMESTAMPTZ(3),
        "motifRejet" TEXT,
        "dateReceptionDecompte" TIMESTAMPTZ(3),
        "datePaiement" TIMESTAMPTZ(3),
        "referencePaiement" TEXT,
        "montantPaye" DECIMAL(18,2),
        "statut" TEXT NOT NULL DEFAULT 'RECU',
        "source" TEXT NOT NULL DEFAULT 'EXCEL',
        "historique" TEXT NOT NULL DEFAULT '[]',
        "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`;
    console.log(TAG + JSON.stringify({ mode, ok: true }));
  } else if (mode === "seed") {
    const type = arg("type");
    if (type === "societe") {
      await db.$executeRaw`
        INSERT INTO "Societe" ("id", "nom")
        VALUES (${arg("id")}, ${arg("nom")})
        ON CONFLICT ("id") DO NOTHING`;
    } else if (type === "assure") {
      await db.$executeRaw`
        INSERT INTO "Assure" ("id", "societeId", "nom")
        VALUES (${arg("id")}, ${arg("societe")}, ${arg("nom") ?? 'Assuré test'})
        ON CONFLICT ("id") DO NOTHING`;
    } else if (type === "bareme") {
      await db.$executeRaw`
        INSERT INTO "Bareme" ("id", "societeId", "prestation", "tauxCouverture", "plafond")
        VALUES (${arg("id")}, ${arg("societe")}, ${arg("acte")}, ${Number(arg("taux"))}, ${arg("plafond")}::numeric)
        ON CONFLICT ("id") DO NOTHING`;
    } else if (type === "dossier") {
      await db.$executeRaw`
        INSERT INTO "Dossier" ("id", "numeroDossier", "societeId", "beneficiaire", "typeDossier",
                               "montantReclame", "statut", "assureId")
        VALUES (${arg("id")}, ${"SEED-" + arg("id")}, ${arg("societe")}, 'Assuré test',
                ${arg("acte")}, ${arg("montant")}::numeric, ${arg("statut")}, ${arg("assure")})
        ON CONFLICT ("id") DO NOTHING`;
    }
    console.log(TAG + JSON.stringify({ mode, ok: true }));
  } else if (mode === "create") {
    // ─── Réplique EXACTE du POST /api/dossiers (moteur centralisé + tx) ────
    const societeId = arg("societe");
    const assureId = arg("assure");
    const typeActe = arg("acte");
    const montantDemande = Number(arg("montant"));

    const verification = await verifierPlafondAnnuel({
      assureId,
      societeId,
      typeActe,
      montantDemande,
    });
    const bloquantes = ['ASSURE_INACTIF', 'PLAFOND_ACTE_ATTEINT', 'PLAFOND_GLOBAL_ATTEINT', 'PRESTATAIRE_INACTIF', 'ACTE_NON_COVERT'];
    if (!verification.autorise && bloquantes.includes(verification.raison)) {
      console.log(TAG + JSON.stringify({ mode, ok: false, raison: verification.raison, message: verification.message }));
      process.exit(0);
    }

    try {
      const dossier = await db.$transaction(async (tx) => {
        const baremeTx = await trouverBaremeValide(tx, {
          societeId,
          prestation: typeActe,
          date: new Date(),
        });
        if (baremeTx) {
          await tx.$queryRaw`SELECT "id" FROM "Bareme" WHERE "id" = ${baremeTx.id} FOR UPDATE`;
          const dossiersAnnee = await tx.dossier.findMany({
            where: {
              assureId,
              societeId,
              typeDossier: typeActe,
              dateReception: {
                gte: new Date(annee, 0, 1),
                lte: new Date(annee, 11, 31, 23, 59, 59),
              },
              statut: { in: STATUTS_CONSOMMENT },
            },
            select: { montantPaye: true, montantValide: true, montantReclame: true },
          });
          const consomme = sommer(
            dossiersAnnee.map(d => d.montantPaye ?? d.montantValide ?? d.montantReclame),
          );
          if (superieurOuEgal(consomme, baremeTx.plafond)) {
            throw new Error(`PLAFOND_ATTEINT_TRANSACTION: Plafond ${typeActe} atteint lors de la création`);
          }
          // P2-04 : recalcul par le SERVICE CENTRAL avec la consommation À JOUR
          const calculTx = calculerRemboursement({
            montantFrais: montantDemande,
            tauxCouverture: baremeTx.tauxCouverture,
            plafondAnnuel: enNombre(baremeTx.plafond) ?? 0,
            consommationAnterieure: enNombre(consomme) ?? 0,
          });
          return tx.dossier.create({
            data: {
              numeroDossier: `TM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              dateReception: new Date(),
              societeId,
              beneficiaire: 'Assuré test',
              typeDossier: typeActe,
              montantReclame: montantDemande,
              assureId,
              statut: 'RECU',
              montantValide: calculTx.priseEnChargeAutorisee,
              ticketModerateur: calculTx.ticketModerateur,
            },
          });
        }
        throw new Error('NO_BAREME');
      });
      console.log(TAG + JSON.stringify({
        mode, ok: true,
        montantValide: enNombre(dossier.montantValide),
        ticketModerateur: enNombre(dossier.ticketModerateur),
        numero: dossier.numeroDossier,
      }));
    } catch (e) {
      if (e instanceof Error && e.message.includes('PLAFOND_ATTEINT_TRANSACTION')) {
        console.log(TAG + JSON.stringify({ mode, ok: false, raison: 'PLAFOND_ATTEINT_TRANSACTION' }));
      } else {
        throw e;
      }
    }
  } else if (mode === "validate") {
    // ─── Réplique EXACTE du PATCH (RECU → EN_ANALYSE, P2-04D8) ─────────────
    // Entrée en consommation : le dossier AJOUTE son montant au reliquat —
    // sérialisation FOR UPDATE + vérification consommé + montant ≤ plafond.
    const dossierId = arg("dossier");
    try {
      await db.$transaction(async (tx) => {
        const dossier = await tx.dossier.findUnique({ where: { id: dossierId } });
        if (!dossier) throw new Error('DOSSIER_INTROUVABLE');
        const baremeTx = await trouverBaremeValide(tx, {
          societeId: dossier.societeId,
          prestation: dossier.typeDossier,
          date: dossier.dateSoins ?? dossier.dateReception,
        });
        if (baremeTx) {
          await tx.$queryRaw`SELECT "id" FROM "Bareme" WHERE "id" = ${baremeTx.id} FOR UPDATE`;
          const dossiersAnnee = await tx.dossier.findMany({
            where: {
              assureId: dossier.assureId,
              societeId: dossier.societeId,
              typeDossier: dossier.typeDossier,
              dateReception: {
                gte: new Date(annee, 0, 1),
                lte: new Date(annee, 11, 31, 23, 59, 59),
              },
              statut: { in: STATUTS_CONSOMMENT },
              id: { not: dossierId },
            },
            select: { montantPaye: true, montantValide: true, montantReclame: true, statut: true },
          });
          const consomme = sommer(
            dossiersAnnee.map(d => d.montantPaye ?? d.montantValide ?? d.montantReclame),
          );
          const consommeVu = enNombre(consomme) ?? 0;
          const montant = enNombre(dossier.montantReclame) ?? 0;
          // NB : Decimal + number en JS concatène (valueOf → string) —
          // toujours utiliser Decimal.plus pour l'addition monétaire.
          if (superieurOuEgal(
            consomme.plus(montant),
            baremeTx.plafond,
          )) {
            console.log(TAG + JSON.stringify({ mode, ok: false, raison: 'PLAFOND_ATTEINT_TRANSACTION', consommeVu, montant }));
            throw new Error(`PLAFOND_ATTEINT_TRANSACTION: Plafond ${dossier.typeDossier} atteint lors du passage en analyse`);
          }
        }
        await tx.dossier.update({ where: { id: dossierId }, data: { statut: 'EN_ANALYSE' } });
      });
      console.log(TAG + JSON.stringify({ mode, ok: true }));
    } catch (e) {
      if (e instanceof Error && e.message.includes('PLAFOND_ATTEINT_TRANSACTION')) {
        // Le résultat détaillé a déjà été émis avant le throw
      } else {
        throw e;
      }
    }
  } else if (mode === "state") {
    const assureId = arg("assure");
    const societeId = arg("societe");
    const typeActe = arg("acte");
    const dossiersAnnee = await db.dossier.findMany({
      where: {
        assureId,
        societeId,
        typeDossier: typeActe,
        dateReception: {
          gte: new Date(annee, 0, 1),
          lte: new Date(annee, 11, 31, 23, 59, 59),
        },
      },
      select: { statut: true, montantPaye: true, montantValide: true, montantReclame: true, numeroDossier: true },
    });
    const consomme = sommer(
      dossiersAnnee
        .filter(d => STATUTS_CONSOMMENT.includes(d.statut))
        .map(d => d.montantPaye ?? d.montantValide ?? d.montantReclame),
    );
    console.log(TAG + JSON.stringify({
      mode,
      consomme: enNombre(consomme) ?? 0,
      dossiers: dossiersAnnee.map(d => ({ numero: d.numeroDossier, statut: d.statut, montantValide: enNombre(d.montantValide), ticketModerateur: enNombre(d.ticketModerateur) })),
    }));
  }
  await db.$disconnect();
} catch (error) {
  console.error(String(error).slice(0, 400));
  process.exit(1);
}
