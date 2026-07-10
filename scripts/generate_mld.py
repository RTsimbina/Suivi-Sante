#!/usr/bin/env python3
"""Generate MLD (Modele Logique de Donnees) for Suivi Sante platform."""

from playwright.sync_api import sync_playwright

MLD_HTML = """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: #F8FAFC;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  color: #1E293B;
  padding: 60px 70px;
}
h1 {
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 28px;
  font-weight: 700;
  color: #0F172A;
  margin-bottom: 8px;
  letter-spacing: -0.5px;
}
.subtitle {
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 14px;
  color: #64748B;
  margin-bottom: 40px;
}

.tables-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 28px;
}

/* Table card */
.table-card {
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.table-card.wide { grid-column: span 2; }

.table-header {
  background: #1E293B;
  color: #F8FAFC;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.table-header .badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(255,255,255,0.15);
  color: #CBD5E1;
}

.table-body {
  padding: 0;
}
.table-row {
  display: flex;
  padding: 6px 16px;
  font-size: 12px;
  border-bottom: 1px solid #F1F5F9;
  align-items: center;
  gap: 8px;
}
.table-row:last-child { border-bottom: none; }
.table-row:nth-child(even) { background: #FAFBFC; }

.col-key {
  min-width: 18px;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}
.col-key.pk { color: #B45309; }
.col-key.fk { color: #0369A1; }
.col-key.uk { color: #6D28D9; }

.col-name {
  flex: 1;
  font-weight: 500;
  color: #0F172A;
}
.col-name.nullable { color: #64748B; font-style: italic; }

.col-type {
  min-width: 70px;
  text-align: right;
  color: #64748B;
  font-size: 11px;
}

.col-const {
  min-width: 80px;
  text-align: right;
  font-size: 10px;
  font-weight: 600;
  color: #94A3B8;
}
.col-const.pk-badge {
  background: #FEF3C7;
  color: #B45309;
  padding: 1px 6px;
  border-radius: 3px;
}
.col-const.fk-badge {
  background: #EFF6FF;
  color: #0369A1;
  padding: 1px 6px;
  border-radius: 3px;
}
.col-const.uk-badge {
  background: #F5F3FF;
  color: #6D28D9;
  padding: 1px 6px;
  border-radius: 3px;
}

/* Footer legend */
.legend {
  margin-top: 40px;
  font-family: 'Segoe UI', system-ui, sans-serif;
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #64748B;
}
.legend-item { display: flex; align-items: center; gap: 6px; }
.legend-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px; height: 20px;
  font-weight: 700;
  font-size: 11px;
  border-radius: 4px;
  font-family: 'Consolas', monospace;
}
.legend-key.pk-l { background: #FEF3C7; color: #B45309; }
.legend-key.fk-l { background: #EFF6FF; color: #0369A1; }
.legend-key.uk-l { background: #F5F3FF; color: #6D28D9; }
</style>
</head>
<body>

<h1>MLD &mdash; Modele Logique de Donnees</h1>
<p class="subtitle">Plateforme Suivi Sante &middot; PostgreSQL &middot; 15 relations &middot; relationMode = "prisma"</p>

<div class="tables-grid">

<!-- 1. UTILISATEUR -->
<div class="table-card">
  <div class="table-header">UTILISATEUR <span class="badge">15 tables</span></div>
  <div class="table-body">
    <div class="table-row">
      <span class="col-key pk">PK</span>
      <span class="col-name">id</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const pk-badge">PRIMARY KEY</span>
    </div>
    <div class="table-row">
      <span class="col-key uk">UQ</span>
      <span class="col-name">email</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const uk-badge">UNIQUE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">nom</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">password</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">role</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">DEFAULT</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">actif</span>
      <span class="col-type">BOOLEAN</span>
      <span class="col-const">DEFAULT true</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">avatar</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">dernierLogin</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">createdAt</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">DEFAULT now()</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">updatedAt</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">AUTO UPDATE</span>
    </div>
  </div>
</div>

<!-- 2. SOCIETE -->
<div class="table-card">
  <div class="table-header">SOCIETE</div>
  <div class="table-body">
    <div class="table-row">
      <span class="col-key pk">PK</span>
      <span class="col-name">id</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const pk-badge">PRIMARY KEY</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">nom</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">createdAt</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">DEFAULT now()</span>
    </div>
  </div>
</div>

<!-- 3. GESTIONNAIRE -->
<div class="table-card">
  <div class="table-header">GESTIONNAIRE</div>
  <div class="table-body">
    <div class="table-row">
      <span class="col-key pk">PK</span>
      <span class="col-name">id</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const pk-badge">PRIMARY KEY</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">nom</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">service</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">createdAt</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">DEFAULT now()</span>
    </div>
  </div>
</div>

<!-- 4. CONTRAT -->
<div class="table-card">
  <div class="table-header">CONTRAT</div>
  <div class="table-body">
    <div class="table-row">
      <span class="col-key pk">PK</span>
      <span class="col-name">id</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const pk-badge">PRIMARY KEY</span>
    </div>
    <div class="table-row">
      <span class="col-key fk">FK</span>
      <span class="col-name">societeId</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const fk-badge">REFERENCES SOCIETE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">reference</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">budgetAnnuel</span>
      <span class="col-type">DOUBLE PRECISION</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">budgetUtilise</span>
      <span class="col-type">DOUBLE PRECISION</span>
      <span class="col-const">DEFAULT 0</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">dateDebut</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">dateFin</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">statut</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">DEFAULT ACTIF</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">createdAt</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">DEFAULT now()</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">updatedAt</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">AUTO UPDATE</span>
    </div>
  </div>
</div>

<!-- 5. APPEL_DE_FONDS -->
<div class="table-card">
  <div class="table-header">APPEL_DE_FONDS</div>
  <div class="table-body">
    <div class="table-row">
      <span class="col-key pk">PK</span>
      <span class="col-name">id</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const pk-badge">PRIMARY KEY</span>
    </div>
    <div class="table-row">
      <span class="col-key fk">FK</span>
      <span class="col-name">contratId</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const fk-badge">REFERENCES CONTRAT</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">montant</span>
      <span class="col-type">DOUBLE PRECISION</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">dateAppel</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">datePaiement</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">reference</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">statut</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">DEFAULT EN_ATTENTE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">observations</span>
      <span class="col-type">TEXT</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">createdAt</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">DEFAULT now()</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">updatedAt</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">AUTO UPDATE</span>
    </div>
  </div>
</div>

<!-- 6. DOSSIER (wide) -->
<div class="table-card wide">
  <div class="table-header">DOSSIER <span class="badge">entite centrale - 28 colonnes</span></div>
  <div class="table-body">
    <div class="table-row">
      <span class="col-key pk">PK</span>
      <span class="col-name">id</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const pk-badge">PRIMARY KEY</span>
    </div>
    <div class="table-row">
      <span class="col-key uk">UQ</span>
      <span class="col-name">numeroDossier</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const uk-badge">UNIQUE</span>
    </div>
    <div class="table-row">
      <span class="col-key fk">FK</span>
      <span class="col-name">societeId</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const fk-badge">REFERENCES SOCIETE</span>
    </div>
    <div class="table-row">
      <span class="col-key fk">FK</span>
      <span class="col-name nullable">gestionnaireAccueilId</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const fk-badge">REFERENCES GESTIONNAIRE</span>
    </div>
    <div class="table-row">
      <span class="col-key fk">FK</span>
      <span class="col-name nullable">createurId</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const fk-badge">REFERENCES UTILISATEUR</span>
    </div>
    <div class="table-row">
      <span class="col-key fk">FK</span>
      <span class="col-name nullable">assureId</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const fk-badge">REFERENCES ASSURE</span>
    </div>
    <div class="table-row">
      <span class="col-key fk">FK</span>
      <span class="col-name nullable">prestataireId</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const fk-badge">REFERENCES PRESTATAIRE</span>
    </div>
    <div class="table-row">
      <span class="col-key fk">FK</span>
      <span class="col-name nullable">gestionnaireTechniqueId</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const fk-badge">REFERENCES GESTIONNAIRE</span>
    </div>
    <div class="table-row">
      <span class="col-key fk">FK</span>
      <span class="col-name nullable">gestionnaireComptaId</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const fk-badge">REFERENCES GESTIONNAIRE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">dateReception</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">beneficiaire</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">typeDossier</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">categorieDossier</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">nSS</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">prestataireLegacy</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">dateSoins</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">moyenPaiement</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">observations</span>
      <span class="col-type">TEXT</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">dateTraitementTechnique</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">montantReclame</span>
      <span class="col-type">DOUBLE PRECISION</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">montantValide</span>
      <span class="col-type">DOUBLE PRECISION</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">ticketModerateur</span>
      <span class="col-type">DOUBLE PRECISION</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">partPatient</span>
      <span class="col-type">DOUBLE PRECISION</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">partEntreprise</span>
      <span class="col-type">DOUBLE PRECISION</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">motifRejet</span>
      <span class="col-type">TEXT</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">dateReceptionDecompte</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">datePaiement</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">referencePaiement</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">montantPaye</span>
      <span class="col-type">DOUBLE PRECISION</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">statut</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">DEFAULT RECU</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">source</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">DEFAULT EXCEL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">historique</span>
      <span class="col-type">TEXT</span>
      <span class="col-const">DEFAULT []</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">createdAt</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">DEFAULT now()</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">updatedAt</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">AUTO UPDATE</span>
    </div>
  </div>
</div>

<!-- 7. COMMENTAIRE -->
<div class="table-card">
  <div class="table-header">COMMENTAIRE</div>
  <div class="table-body">
    <div class="table-row">
      <span class="col-key pk">PK</span>
      <span class="col-name">id</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const pk-badge">PRIMARY KEY</span>
    </div>
    <div class="table-row">
      <span class="col-key fk">FK</span>
      <span class="col-name">dossierId</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const fk-badge">REFERENCES DOSSIER</span>
    </div>
    <div class="table-row">
      <span class="col-key fk">FK</span>
      <span class="col-name nullable">auteurId</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const fk-badge">REFERENCES UTILISATEUR</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">contenu</span>
      <span class="col-type">TEXT</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">prive</span>
      <span class="col-type">BOOLEAN</span>
      <span class="col-const">DEFAULT false</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">createdAt</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">DEFAULT now()</span>
    </div>
  </div>
</div>

<!-- 8. JUSTIFICATIF -->
<div class="table-card">
  <div class="table-header">JUSTIFICATIF</div>
  <div class="table-body">
    <div class="table-row">
      <span class="col-key pk">PK</span>
      <span class="col-name">id</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const pk-badge">PRIMARY KEY</span>
    </div>
    <div class="table-row">
      <span class="col-key fk">FK</span>
      <span class="col-name">dossierId</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const fk-badge">REFERENCES DOSSIER</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">type</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">nomFichier</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">chemin</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">tailleKo</span>
      <span class="col-type">DOUBLE PRECISION</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">uploadedBy</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">createdAt</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">DEFAULT now()</span>
    </div>
  </div>
</div>

<!-- 9. IMPORT_HISTORIQUE -->
<div class="table-card">
  <div class="table-header">IMPORT_HISTORIQUE</div>
  <div class="table-body">
    <div class="table-row">
      <span class="col-key pk">PK</span>
      <span class="col-name">id</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const pk-badge">PRIMARY KEY</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">source</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">nomFichier</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">nbLignes</span>
      <span class="col-type">INTEGER</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">nbSucces</span>
      <span class="col-type">INTEGER</span>
      <span class="col-const">DEFAULT 0</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">nbErreurs</span>
      <span class="col-type">INTEGER</span>
      <span class="col-const">DEFAULT 0</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">rapport</span>
      <span class="col-type">TEXT</span>
      <span class="col-const">DEFAULT []</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">importePar</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">createdAt</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">DEFAULT now()</span>
    </div>
  </div>
</div>

<!-- 10. BAREME -->
<div class="table-card">
  <div class="table-header">BAREME</div>
  <div class="table-body">
    <div class="table-row">
      <span class="col-key pk">PK</span>
      <span class="col-name">id</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const pk-badge">PRIMARY KEY</span>
    </div>
    <div class="table-row">
      <span class="col-key fk">FK</span>
      <span class="col-name">societeId</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const fk-badge">REFERENCES SOCIETE</span>
    </div>
    <div class="table-row">
      <span class="col-key uk">UQ</span>
      <span class="col-name">prestation</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const uk-badge">UNIQUE(socId,pres)</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">tauxCouverture</span>
      <span class="col-type">DOUBLE PRECISION</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">plafond</span>
      <span class="col-type">DOUBLE PRECISION</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">description</span>
      <span class="col-type">TEXT</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">active</span>
      <span class="col-type">BOOLEAN</span>
      <span class="col-const">DEFAULT true</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">createdAt</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">DEFAULT now()</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">updatedAt</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">AUTO UPDATE</span>
    </div>
  </div>
</div>

<!-- 11. IMPORT_DOSSIER -->
<div class="table-card">
  <div class="table-header">IMPORT_DOSSIER</div>
  <div class="table-body">
    <div class="table-row">
      <span class="col-key pk">PK</span>
      <span class="col-name">id</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const pk-badge">PRIMARY KEY</span>
    </div>
    <div class="table-row">
      <span class="col-key fk">FK</span>
      <span class="col-name">importId</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const fk-badge">REFERENCES IMPORT_HISTORIQUE</span>
    </div>
    <div class="table-row">
      <span class="col-key fk">FK</span>
      <span class="col-name nullable">dossierId</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const fk-badge">REFERENCES DOSSIER</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">numeroLigne</span>
      <span class="col-type">INTEGER</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">statutImport</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">DEFAULT SUCCES</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">erreur</span>
      <span class="col-type">TEXT</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">donnees</span>
      <span class="col-type">TEXT</span>
      <span class="col-const">DEFAULT {}</span>
    </div>
  </div>
</div>

<!-- 12. ASSURE -->
<div class="table-card">
  <div class="table-header">ASSURE</div>
  <div class="table-body">
    <div class="table-row">
      <span class="col-key pk">PK</span>
      <span class="col-name">id</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const pk-badge">PRIMARY KEY</span>
    </div>
    <div class="table-row">
      <span class="col-key fk">FK</span>
      <span class="col-name">societeId</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const fk-badge">REFERENCES SOCIETE</span>
    </div>
    <div class="table-row">
      <span class="col-key uk">UQ</span>
      <span class="col-name nullable">nSS</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const uk-badge">UNIQUE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">nom</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">prenom</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">dateNaissance</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">sexe</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">telephone</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">email</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">adresse</span>
      <span class="col-type">TEXT</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">actif</span>
      <span class="col-type">BOOLEAN</span>
      <span class="col-const">DEFAULT true</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">createdAt</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">DEFAULT now()</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">updatedAt</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">AUTO UPDATE</span>
    </div>
  </div>
</div>

<!-- 13. PRESTATAIRE -->
<div class="table-card">
  <div class="table-header">PRESTATAIRE</div>
  <div class="table-body">
    <div class="table-row">
      <span class="col-key pk">PK</span>
      <span class="col-name">id</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const pk-badge">PRIMARY KEY</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">nom</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">type</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">telephone</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">email</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">adresse</span>
      <span class="col-type">TEXT</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">nif</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">statut</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">rib</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">actif</span>
      <span class="col-type">BOOLEAN</span>
      <span class="col-const">DEFAULT true</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">createdAt</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">DEFAULT now()</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">updatedAt</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">AUTO UPDATE</span>
    </div>
  </div>
</div>

<!-- 14. COURRIEL -->
<div class="table-card">
  <div class="table-header">COURRIEL</div>
  <div class="table-body">
    <div class="table-row">
      <span class="col-key pk">PK</span>
      <span class="col-name">id</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const pk-badge">PRIMARY KEY</span>
    </div>
    <div class="table-row">
      <span class="col-key fk">FK</span>
      <span class="col-name nullable">societeId</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const fk-badge">REFERENCES SOCIETE</span>
    </div>
    <div class="table-row">
      <span class="col-key uk">UQ</span>
      <span class="col-name nullable">dossierId</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const fk-badge">REFERENCES DOSSIER</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">type</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">expediteur</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">objet</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">beneficiaire</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">montant</span>
      <span class="col-type">DOUBLE PRECISION</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">dateCourriel</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">DEFAULT now()</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">dateSoins</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">prestataire</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">statut</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">DEFAULT RECU</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">traitePar</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">dateTraitement</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">observations</span>
      <span class="col-type">TEXT</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">createdAt</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">DEFAULT now()</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">updatedAt</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">AUTO UPDATE</span>
    </div>
  </div>
</div>

<!-- 15. MESSAGE_BOT -->
<div class="table-card">
  <div class="table-header">MESSAGE_BOT</div>
  <div class="table-body">
    <div class="table-row">
      <span class="col-key pk">PK</span>
      <span class="col-name">id</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const pk-badge">PRIMARY KEY</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">canal</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">expeditieurId</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">expeditieurNom</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">message</span>
      <span class="col-type">TEXT</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">reponse</span>
      <span class="col-type">TEXT</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">lu</span>
      <span class="col-type">BOOLEAN</span>
      <span class="col-const">DEFAULT false</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">createdAt</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">DEFAULT now()</span>
    </div>
  </div>
</div>

<!-- 16. ENTREPRISE_CONTACT -->
<div class="table-card">
  <div class="table-header">ENTREPRISE_CONTACT</div>
  <div class="table-body">
    <div class="table-row">
      <span class="col-key pk">PK</span>
      <span class="col-name">id</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const pk-badge">PRIMARY KEY</span>
    </div>
    <div class="table-row">
      <span class="col-key fk">FK</span>
      <span class="col-name">societeId</span>
      <span class="col-type">VARCHAR(30)</span>
      <span class="col-const fk-badge">REFERENCES SOCIETE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">nom</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NOT NULL</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">prenom</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">fonction</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">telephone</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name nullable">email</span>
      <span class="col-type">VARCHAR(191)</span>
      <span class="col-const">NULLABLE</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">actif</span>
      <span class="col-type">BOOLEAN</span>
      <span class="col-const">DEFAULT true</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">createdAt</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">DEFAULT now()</span>
    </div>
    <div class="table-row">
      <span class="col-key"></span>
      <span class="col-name">updatedAt</span>
      <span class="col-type">TIMESTAMP</span>
      <span class="col-const">AUTO UPDATE</span>
    </div>
  </div>
</div>

</div>

<div class="legend">
  <div class="legend-item"><span class="legend-key pk-l">PK</span> Cle primaire</div>
  <div class="legend-item"><span class="legend-key fk-l">FK</span> Cle etrangere</div>
  <div class="legend-item"><span class="legend-key uk-l">UQ</span> Contrainte d'unicite</div>
  <div class="legend-item" style="margin-left:20px;font-style:italic;">relationMode = "prisma" (pas de FK physiques en BDD, gerees par Prisma au niveau applicatif)</div>
</div>

</body>
</html>
"""

OUTPUT_PATH = "/home/z/my-project/download/MLD_Suivi_Sante.png"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1600, "height": 100})
    page.set_content(MLD_HTML, wait_until="networkidle")
    
    height = page.evaluate("document.body.scrollHeight")
    width = page.evaluate("document.body.scrollWidth")
    
    page.set_viewport_size({"width": max(width + 140, 1600), "height": height + 100})
    page.screenshot(path=OUTPUT_PATH, full_page=True)
    browser.close()
    print(f"MLD saved: {OUTPUT_PATH} ({width}x{height})")