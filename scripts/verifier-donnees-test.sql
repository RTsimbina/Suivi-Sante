-- verifier-donnees-test.sql — Contrôles de cohérence du jeu de données démo.
-- Chaque contrôle attend 0 ; un résultat non nul indique une incohérence métier.
-- Usage : psql ... -f scripts/verifier-donnees-test.sql
\echo ══ 1. VOLUMES ══
SELECT (SELECT count(*) FROM "Societe" WHERE email LIKE '%.demo.mg') AS societes_demo,
       (SELECT count(*) FROM "Assure") AS assures_total,
       (SELECT count(*) FROM "Assure" WHERE "typeBeneficiaire" = 'ASSURE') AS assurés_principaux,
       (SELECT count(*) FROM "Assure" WHERE "typeBeneficiaire" <> 'ASSURE') AS ayants_droit,
       (SELECT count(*) FROM "Prestataire" WHERE code LIKE 'DEM-%') AS prestataires,
       (SELECT count(*) FROM "PrestataireSociete") AS conventions,
       (SELECT count(*) FROM "Dossier") AS dossiers,
       (SELECT count(*) FROM "EtapeTraitement") AS etapes_kpi,
       (SELECT count(*) FROM "EtapeSuspension") AS suspensions,
       (SELECT count(*) FROM "Contrat") AS contrats,
       (SELECT count(*) FROM "Bareme") AS baremes,
       (SELECT count(*) FROM "AppelDeFonds") AS appels_fonds;

\echo ══ 2. STATUTS : cohérence minimale exigée par le code applicatif ══
SELECT 'PAYE sans montantPaye' AS controle, count(*) AS violations FROM "Dossier"
 WHERE statut = 'PAYE' AND ("montantPaye" IS NULL OR "datePaiement" IS NULL OR "referencePaiement" IS NULL)
UNION ALL
SELECT 'REJETE sans motifRejet', count(*) FROM "Dossier" WHERE statut = 'REJETE' AND "motifRejet" IS NULL
UNION ALL
SELECT 'EN_ANALYSE+ sans dateTraitementTechnique (hors rejet accueil)', count(*) FROM "Dossier"
 WHERE statut NOT IN ('RECU') AND NOT (statut = 'REJETE' AND "dateTraitementTechnique" IS NULL)
   AND "dateTraitementTechnique" IS NULL
UNION ALL
SELECT 'EN_COMPTABILITE+ sans dateReceptionDecompte', count(*) FROM "Dossier"
 WHERE statut IN ('EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE') AND "dateReceptionDecompte" IS NULL
UNION ALL
SELECT 'PAYE/EN_PAIEMENT sans moyenPaiement', count(*) FROM "Dossier"
 WHERE statut IN ('EN_PAIEMENT', 'PAYE') AND "moyenPaiement" IS NULL
UNION ALL
SELECT 'montantValide > montantReclame', count(*) FROM "Dossier" WHERE "montantValide" > "montantReclame"
UNION ALL
SELECT 'ticketModerateur ≠ frais − validé', count(*) FROM "Dossier"
 WHERE "montantValide" IS NOT NULL AND ROUND("montantReclame" - "montantValide", 2) <> "ticketModerateur"
UNION ALL
SELECT 'écart payé/validé > 10 %', count(*) FROM "Dossier"
 WHERE statut = 'PAYE' AND "montantValide" > 0
   AND ABS("montantPaye" - "montantValide") / "montantValide" > 0.10
UNION ALL
SELECT 'dateSoins > dateReception', count(*) FROM "Dossier" WHERE "dateSoins" > "dateReception"
UNION ALL
SELECT 'datePaiement < dateReceptionDecompte', count(*) FROM "Dossier"
 WHERE "datePaiement" IS NOT NULL AND "datePaiement" < "dateReceptionDecompte"
UNION ALL
SELECT 'histo:PAYE 2026 avec montantValide NULL', count(*) FROM "Dossier"
 WHERE statut = 'PAYE' AND "montantValide" IS NULL;

\echo ══ 3. PLAFONDS : consommation annuelle par assuré/prestation ≤ plafond ══
SELECT 'consommation annuelle > plafond (par assuré, année, prestation)' AS controle, count(*) AS violations
FROM (
  SELECT d."assureId", d."baremePrestation", EXTRACT(YEAR FROM d."dateReception") AS annee,
         SUM(d."montantValide") AS consomme, MAX(d."baremePlafond") AS plafond
  FROM "Dossier" d
  WHERE d."montantValide" IS NOT NULL AND d."baremePrestation" IS NOT NULL
  GROUP BY 1, 2, 3
) x WHERE consomme > plafond + 0.01;

\echo ══ 4. NUMEROS DE DOSSIERS : séquences sans trou par année ══
SELECT "numeroDossier" LIKE 'DOS-%' AS format_ok, count(*) AS total,
       count(DISTINCT SUBSTRING("numeroDossier" FROM 5 FOR 4)) AS annees
FROM "Dossier" GROUP BY 1;
SELECT annee, count(*) AS dossiers, min(seq) AS min_seq, max(seq) AS max_seq,
       max(seq) - min(seq) + 1 - count(*) AS trous
FROM (SELECT SUBSTRING("numeroDossier" FROM 5 FOR 4) AS annee,
             SUBSTRING("numeroDossier" FROM 10)::int AS seq FROM "Dossier") t
GROUP BY annee ORDER BY annee;

\echo ══ 5. ÉTAPES KPI : cohérence des périodes de responsabilité ══
SELECT 'étape ouverte sur dossier terminal', count(*) FROM "EtapeTraitement" e
 JOIN "Dossier" d ON d.id = e."dossierId"
 WHERE e."dateFin" IS NULL AND d.statut IN ('PAYE', 'REJETE')
UNION ALL
SELECT 'étape fermée sur dossier RECU (hors contrôle médical)', count(*) FROM "EtapeTraitement" e
 JOIN "Dossier" d ON d.id = e."dossierId"
 WHERE e."dateFin" IS NOT NULL AND d.statut = 'RECU' AND e.service <> 'CONTROLE_MEDICAL'
UNION ALL
SELECT 'dateFin < dateAffectation', count(*) FROM "EtapeTraitement" WHERE "dateFin" < "dateAffectation"
UNION ALL
SELECT 'dateFin < dateDebut', count(*) FROM "EtapeTraitement" WHERE "dateFin" IS NOT NULL AND "dateDebut" > "dateFin"
UNION ALL
SELECT 'étape ACCUEIL sans userId (KPI individuel vide)', count(*) FROM "EtapeTraitement"
 WHERE service = 'ACCUEIL' AND "userId" IS NULL
UNION ALL
SELECT 'source ≠ MIGRATION/CIRCUIT/MANUEL', count(*) FROM "EtapeTraitement"
 WHERE source NOT IN ('MIGRATION', 'CIRCUIT', 'MANUEL')
UNION ALL
SELECT 'RETOUR_CORRECTION sans motifRetour', count(*) FROM "EtapeTraitement"
 WHERE type = 'RETOUR_CORRECTION' AND "motifRetour" IS NULL;

\echo ══ 6. RÉFÉRENTIELS : intégrité des valeurs ══
SELECT 'statut hors référentiel', count(*) FROM "Dossier"
 WHERE statut NOT IN ('RECU', 'EN_ANALYSE', 'VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE', 'REJETE')
UNION ALL
SELECT 'typeDossier hors référentiel (19 sous-types)', count(*) FROM "Dossier"
 WHERE "typeDossier" NOT IN ('HOSPITALISATION_CHIRURGICAL', 'HOSPITALISATION_MEDICAL', 'CONSULTATION_SPECIALISE',
  'CONSULTATION_PRE_NATAL', 'CONSULTATION_SIMPLE', 'EXAMEN', 'ACCOUCHEMENT_CHIRURGICAL', 'ACCOUCHEMENT_NORMAL',
  'IMAGERIE', 'OPTIQUE', 'PHARMACIE', 'DENTAIRES_SOIN', 'DENTAIRES_DETARTRAGE', 'DENTAIRES_EXTRACTION',
  'DENTAIRES_PROTHESE', 'DENTAIRES_ORTHODONTIE')
UNION ALL
SELECT 'categorieDossier hors référentiel', count(*) FROM "Dossier"
 WHERE "categorieDossier" IS NOT NULL AND "categorieDossier" NOT IN ('REMBOURSEMENT_ASSURE', 'REGLEMENT_PRESTATAIRE')
UNION ALL
SELECT 'moyenPaiement hors référentiel', count(*) FROM "Dossier"
 WHERE "moyenPaiement" IS NOT NULL AND "moyenPaiement" NOT IN
       ('VIREMENT', 'CHEQUE', 'ESPECES', 'MOBILE_MONEY', 'PRELEVEMENT', 'CARTE', 'AUTRE')
UNION ALL
SELECT 'source hors référentiel', count(*) FROM "Dossier"
 WHERE source NOT IN ('MANUEL', 'ISA', 'SAGE', 'EXCEL')
UNION ALL
SELECT 'rôle hors référentiel (10 rôles)', count(*) FROM "Utilisateur"
 WHERE role NOT IN ('ADMINISTRATEUR', 'DIRECTION_GENERALE', 'RESPONSABLE_SERVICE', 'ACCUEIL', 'TECHNIQUE',
                    'COMPTABILITE', 'SANTE', 'PORTAIL_CLIENT', 'CONTACT_ENTREPRISE', 'PRESTATAIRE')
UNION ALL
SELECT 'RESPONSABLE_SERVICE sans serviceResponsable', count(*) FROM "Utilisateur"
 WHERE role = 'RESPONSABLE_SERVICE' AND "serviceResponsable" IS NULL;

\echo ══ 7. RÉPARTITION (pour le rapport) ══
SELECT statut, count(*) AS dossiers, ROUND(SUM("montantReclame"), 0) AS engages,
       ROUND(SUM("montantValide"), 0) AS valides, ROUND(SUM("montantPaye"), 0) AS payes
FROM "Dossier" GROUP BY statut ORDER BY count(*) DESC;
SELECT service, count(*) AS etapes,
       count(*) FILTER (WHERE "dateFin" IS NULL) AS ouvertes,
       count(*) FILTER (WHERE type = 'RETOUR_CORRECTION') AS retours
FROM "EtapeTraitement" GROUP BY service ORDER BY service;
