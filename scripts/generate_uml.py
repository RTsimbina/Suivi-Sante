#!/usr/bin/env python3
"""Generate UML Class Diagram for Suivi Sante platform."""

from playwright.sync_api import sync_playwright

UML_HTML = """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: #F8FAFC;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  color: #1E293B;
  padding: 50px 60px 40px;
}
h1 {
  font-size: 26px;
  font-weight: 700;
  color: #0F172A;
  margin-bottom: 6px;
  letter-spacing: -0.5px;
}
.subtitle {
  font-size: 13px;
  color: #64748B;
  margin-bottom: 36px;
}

/* Diagram container */
.uml-diagram {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  justify-content: center;
}

/* UML Class box */
.uml-class {
  background: #FFFFFF;
  border: 1.5px solid #CBD5E1;
  border-radius: 6px;
  width: 290px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  overflow: hidden;
  flex-shrink: 0;
}
.uml-class.wide { width: 420px; }

/* Class name compartment */
.class-name {
  background: #1E293B;
  color: #F1F5F9;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 700;
  text-align: center;
  letter-spacing: 0.3px;
}
.uml-class.highlight .class-name {
  background: #1E3A5F;
}

/* Stereotype */
.stereotype {
  font-size: 10px;
  font-weight: 400;
  color: #94A3B8;
  margin-bottom: 2px;
}

/* Attributes compartment */
.class-attrs {
  padding: 10px 14px;
  border-bottom: 1px solid #E2E8F0;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 11.5px;
  line-height: 1.7;
  color: #334155;
}
.attr-row { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.attr-vis { color: #B45309; font-weight: 700; min-width: 14px; display: inline-block; }
.attr-name { color: #0F172A; }
.attr-type { color: #64748B; font-size: 10.5px; }
.attr-const { color: #94A3B8; font-size: 10px; font-style: italic; }

/* Methods compartment */
.class-methods {
  padding: 8px 14px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.7;
  color: #64748B;
  font-style: italic;
  min-height: 30px;
}

/* Associations section */
.assoc-section {
  margin-top: 40px;
  padding: 24px 28px;
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.assoc-section h2 {
  font-size: 17px;
  font-weight: 700;
  color: #0F172A;
  margin-bottom: 16px;
}

/* Relationship rows */
.rel-grid {
  display: grid;
  grid-template-columns: 1fr 50px 1fr 50px 1fr;
  gap: 0;
  font-size: 12px;
  align-items: center;
}
.rel-header {
  font-weight: 700;
  font-size: 11px;
  color: #64748B;
  padding: 6px 10px;
  border-bottom: 2px solid #E2E8F0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.rel-row {
  padding: 7px 10px;
  border-bottom: 1px solid #F1F5F9;
  display: contents;
}
.rel-row:nth-child(even) .rel-cell { background: #FAFBFC; }
.rel-cell {
  padding: 7px 10px;
  border-bottom: 1px solid #F1F5F9;
}
.rel-class {
  font-weight: 600;
  color: #1E293B;
}
.rel-mult {
  font-weight: 700;
  color: #B45309;
  text-align: center;
}
.rel-type {
  color: #64748B;
  text-align: center;
  font-size: 11px;
}
.rel-label {
  color: #475569;
  font-style: italic;
  text-align: center;
}

/* Legend */
.legend {
  margin-top: 30px;
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #64748B;
}
.legend-item { display: flex; align-items: center; gap: 6px; }
.vis-symbol {
  display: inline-block;
  width: 16px;
  height: 16px;
  text-align: center;
  font-weight: 700;
  font-size: 12px;
  font-family: 'Consolas', monospace;
  color: #B45309;
}
</style>
</head>
<body>

<h1>Diagramme de Classe UML</h1>
<p class="subtitle">Plateforme Suivi Sante &middot; 15 classes &middot; Pattern ActiveRecord (Prisma ORM)</p>

<div class="uml-diagram">

<!-- SOCIETE -->
<div class="uml-class highlight">
  <div class="class-name"><div class="stereotype">&laquo; entity &raquo;</div>SOCIETE</div>
  <div class="class-attrs">
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">id</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">nom</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">createdAt</span> <span class="attr-type">: DateTime</span></div>
  </div>
  <div class="class-methods">baremes, dossiers, contrats, courriels, assures, contacts</div>
</div>

<!-- UTILISATEUR -->
<div class="uml-class highlight">
  <div class="class-name"><div class="stereotype">&laquo; entity &raquo;</div>UTILISATEUR</div>
  <div class="class-attrs">
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">id</span> <span class="attr-type">: String</span> <span class="attr-const">&laquo;PK&raquo;</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">email</span> <span class="attr-type">: String</span> <span class="attr-const">&laquo;unique&raquo;</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">nom</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">password</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">role</span> <span class="attr-type">: String</span> <span class="attr-const">&laquo;ENUM&raquo;</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">actif</span> <span class="attr-type">: Boolean</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">avatar</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">dernierLogin</span> <span class="attr-type">: DateTime?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">createdAt</span> <span class="attr-type">: DateTime</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">updatedAt</span> <span class="attr-type">: DateTime</span></div>
  </div>
  <div class="class-methods">commentaires, dossiersCrees</div>
</div>

<!-- GESTIONNAIRE -->
<div class="uml-class">
  <div class="class-name"><div class="stereotype">&laquo; entity &raquo;</div>GESTIONNAIRE</div>
  <div class="class-attrs">
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">id</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">nom</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">service</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">createdAt</span> <span class="attr-type">: DateTime</span></div>
  </div>
  <div class="class-methods">dossiersAccueil, dossiersTechnique, dossiersCompta</div>
</div>

<!-- CONTRAT -->
<div class="uml-class">
  <div class="class-name"><div class="stereotype">&laquo; entity &raquo;</div>CONTRAT</div>
  <div class="class-attrs">
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">id</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">societeId</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">reference</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">budgetAnnuel</span> <span class="attr-type">: Float</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">budgetUtilise</span> <span class="attr-type">: Float</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">dateDebut</span> <span class="attr-type">: DateTime</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">dateFin</span> <span class="attr-type">: DateTime</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">statut</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">createdAt</span> <span class="attr-type">: DateTime</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">updatedAt</span> <span class="attr-type">: DateTime</span></div>
  </div>
  <div class="class-methods">appelsDeFonds</div>
</div>

<!-- DOSSIER (wide) -->
<div class="uml-class wide">
  <div class="class-name"><div class="stereotype">&laquo; entity &raquo;</div>DOSSIER <span style="font-size:10px;color:#94A3B8;font-weight:400;margin-left:8px;">(entite centrale)</span></div>
  <div class="class-attrs">
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">id</span> <span class="attr-type">: String</span> <span class="attr-const">&laquo;PK&raquo;</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">numeroDossier</span> <span class="attr-type">: String</span> <span class="attr-const">&laquo;unique&raquo;</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">societeId</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">beneficiaire</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">typeDossier</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">categorieDossier</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">gestionnaireAccueilId</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">createurId</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">assureId</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">nSS</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">prestataireId</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">prestataireLegacy</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">dateSoins</span> <span class="attr-type">: DateTime?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">moyenPaiement</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">observations</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">dateTraitementTechnique</span> <span class="attr-type">: DateTime?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">montantReclame</span> <span class="attr-type">: Float</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">montantValide</span> <span class="attr-type">: Float?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">ticketModerateur</span> <span class="attr-type">: Float?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">partPatient</span> <span class="attr-type">: Float?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">partEntreprise</span> <span class="attr-type">: Float?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">gestionnaireTechniqueId</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">motifRejet</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">dateReceptionDecompte</span> <span class="attr-type">: DateTime?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">datePaiement</span> <span class="attr-type">: DateTime?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">referencePaiement</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">montantPaye</span> <span class="attr-type">: Float?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">gestionnaireComptaId</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">statut</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">source</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">historique</span> <span class="attr-type">: String (JSON)</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">createdAt</span> <span class="attr-type">: DateTime</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">updatedAt</span> <span class="attr-type">: DateTime</span></div>
  </div>
  <div class="class-methods">commentaires, justificatifs, importations, courriel, societe, gestionnaireAccueil, createur, assure, prestataire, gestionnaireTechnique, gestionnaireCompta</div>
</div>

<!-- APPEL_DE_FONDS -->
<div class="uml-class">
  <div class="class-name"><div class="stereotype">&laquo; entity &raquo;</div>APPEL_DE_FONDS</div>
  <div class="class-attrs">
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">id</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">contratId</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">montant</span> <span class="attr-type">: Float</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">dateAppel</span> <span class="attr-type">: DateTime</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">datePaiement</span> <span class="attr-type">: DateTime?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">reference</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">statut</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">observations</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">createdAt</span> <span class="attr-type">: DateTime</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">updatedAt</span> <span class="attr-type">: DateTime</span></div>
  </div>
  <div class="class-methods">contrat</div>
</div>

<!-- ASSURE -->
<div class="uml-class">
  <div class="class-name"><div class="stereotype">&laquo; entity &raquo;</div>ASSURE</div>
  <div class="class-attrs">
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">id</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">societeId</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">nom</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">nSS</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">prenom</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">dateNaissance</span> <span class="attr-type">: DateTime?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">sexe</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">telephone</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">email</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">adresse</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">actif</span> <span class="attr-type">: Boolean</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">createdAt</span> <span class="attr-type">: DateTime</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">updatedAt</span> <span class="attr-type">: DateTime</span></div>
  </div>
  <div class="class-methods">societe, dossiers</div>
</div>

<!-- PRESTATAIRE -->
<div class="uml-class">
  <div class="class-name"><div class="stereotype">&laquo; entity &raquo;</div>PRESTATAIRE</div>
  <div class="class-attrs">
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">id</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">nom</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">type</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">telephone</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">email</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">adresse</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">nif</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">statut</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">rib</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">actif</span> <span class="attr-type">: Boolean</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">createdAt</span> <span class="attr-type">: DateTime</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">updatedAt</span> <span class="attr-type">: DateTime</span></div>
  </div>
  <div class="class-methods">dossiers</div>
</div>

<!-- BAREME -->
<div class="uml-class">
  <div class="class-name"><div class="stereotype">&laquo; entity &raquo;</div>BAREME</div>
  <div class="class-attrs">
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">id</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">societeId</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">prestation</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">tauxCouverture</span> <span class="attr-type">: Float</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">plafond</span> <span class="attr-type">: Float</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">description</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">active</span> <span class="attr-type">: Boolean</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">createdAt</span> <span class="attr-type">: DateTime</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">updatedAt</span> <span class="attr-type">: DateTime</span></div>
  </div>
  <div class="class-methods">societe</div>
</div>

<!-- COMMENTAIRE -->
<div class="uml-class">
  <div class="class-name"><div class="stereotype">&laquo; entity &raquo;</div>COMMENTAIRE</div>
  <div class="class-attrs">
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">id</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">dossierId</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">auteurId</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">contenu</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">prive</span> <span class="attr-type">: Boolean</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">createdAt</span> <span class="attr-type">: DateTime</span></div>
  </div>
  <div class="class-methods">dossier, auteur</div>
</div>

<!-- JUSTIFICATIF -->
<div class="uml-class">
  <div class="class-name"><div class="stereotype">&laquo; entity &raquo;</div>JUSTIFICATIF</div>
  <div class="class-attrs">
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">id</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">dossierId</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">type</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">nomFichier</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">chemin</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">tailleKo</span> <span class="attr-type">: Float?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">uploadedBy</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">createdAt</span> <span class="attr-type">: DateTime</span></div>
  </div>
  <div class="class-methods">dossier</div>
</div>

<!-- COURRIEL -->
<div class="uml-class">
  <div class="class-name"><div class="stereotype">&laquo; entity &raquo;</div>COURRIEL</div>
  <div class="class-attrs">
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">id</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">type</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">expediteur</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">objet</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">societeId</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">beneficiaire</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">montant</span> <span class="attr-type">: Float?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">dateCourriel</span> <span class="attr-type">: DateTime</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">dateSoins</span> <span class="attr-type">: DateTime?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">prestataire</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">statut</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">traitePar</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">dateTraitement</span> <span class="attr-type">: DateTime?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">observations</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">dossierId</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">createdAt</span> <span class="attr-type">: DateTime</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">updatedAt</span> <span class="attr-type">: DateTime</span></div>
  </div>
  <div class="class-methods">societe, dossier</div>
</div>

<!-- IMPORT_HISTORIQUE -->
<div class="uml-class">
  <div class="class-name"><div class="stereotype">&laquo; entity &raquo;</div>IMPORT_HISTORIQUE</div>
  <div class="class-attrs">
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">id</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">source</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">nomFichier</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">nbLignes</span> <span class="attr-type">: Int</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">nbSucces</span> <span class="attr-type">: Int</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">nbErreurs</span> <span class="attr-type">: Int</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">rapport</span> <span class="attr-type">: String (JSON)</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">importePar</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">createdAt</span> <span class="attr-type">: DateTime</span></div>
  </div>
  <div class="class-methods">dossiers</div>
</div>

<!-- IMPORT_DOSSIER -->
<div class="uml-class">
  <div class="class-name"><div class="stereotype">&laquo; entity &raquo;</div>IMPORT_DOSSIER</div>
  <div class="class-attrs">
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">id</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">importId</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">dossierId</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">numeroLigne</span> <span class="attr-type">: Int</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">statutImport</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">erreur</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">donnees</span> <span class="attr-type">: String (JSON)</span></div>
  </div>
  <div class="class-methods">importHistorique, dossier</div>
</div>

<!-- MESSAGE_BOT -->
<div class="uml-class">
  <div class="class-name"><div class="stereotype">&laquo; entity &raquo;</div>MESSAGE_BOT</div>
  <div class="class-attrs">
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">id</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">canal</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">expeditieurId</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">expeditieurNom</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">message</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">reponse</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">lu</span> <span class="attr-type">: Boolean</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">createdAt</span> <span class="attr-type">: DateTime</span></div>
  </div>
  <div class="class-methods">(classe isolee)</div>
</div>

<!-- ENTREPRISE_CONTACT -->
<div class="uml-class">
  <div class="class-name"><div class="stereotype">&laquo; entity &raquo;</div>ENTREPRISE_CONTACT</div>
  <div class="class-attrs">
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">id</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">societeId</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">nom</span> <span class="attr-type">: String</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">prenom</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">fonction</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">telephone</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">email</span> <span class="attr-type">: String?</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">actif</span> <span class="attr-type">: Boolean</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">createdAt</span> <span class="attr-type">: DateTime</span></div>
    <div class="attr-row"><span class="attr-vis">+</span> <span class="attr-name">updatedAt</span> <span class="attr-type">: DateTime</span></div>
  </div>
  <div class="class-methods">societe</div>
</div>

</div>

<!-- Relationships section -->
<div class="assoc-section">
  <h2>Relations entre classes (multiplicites UML)</h2>
  <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
    <tr style="border-bottom:2px solid #E2E8F0;">
      <th style="text-align:left;padding:8px 10px;color:#64748B;font-weight:700;">Classe source</th>
      <th style="text-align:center;padding:8px 6px;color:#64748B;font-weight:700;">Mult.</th>
      <th style="text-align:center;padding:8px 6px;color:#64748B;font-weight:700;">Type</th>
      <th style="text-align:center;padding:8px 6px;color:#64748B;font-weight:700;">Mult.</th>
      <th style="text-align:left;padding:8px 10px;color:#64748B;font-weight:700;">Classe cible</th>
      <th style="text-align:left;padding:8px 10px;color:#64748B;font-weight:700;">Role / Nom</th>
    </tr>
    <tr style="border-bottom:1px solid #F1F5F9;"><td style="padding:6px 10px;font-weight:600;">SOCIETE</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">1</td><td style="text-align:center;padding:6px;color:#64748B;">Composition</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..*</td><td style="padding:6px 10px;font-weight:600;">BAREME</td><td style="padding:6px 10px;color:#64748B;font-style:italic;">baremes</td></tr>
    <tr style="border-bottom:1px solid #F1F5F9;background:#FAFBFC;"><td style="padding:6px 10px;font-weight:600;">SOCIETE</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">1</td><td style="text-align:center;padding:6px;color:#64748B;">Aggregation</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..*</td><td style="padding:6px 10px;font-weight:600;">CONTRAT</td><td style="padding:6px 10px;color:#64748B;font-style:italic;">contrats</td></tr>
    <tr style="border-bottom:1px solid #F1F5F9;"><td style="padding:6px 10px;font-weight:600;">SOCIETE</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">1</td><td style="text-align:center;padding:6px;color:#64748B;">Aggregation</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..*</td><td style="padding:6px 10px;font-weight:600;">DOSSIER</td><td style="padding:6px 10px;color:#64748B;font-style:italic;">dossiers</td></tr>
    <tr style="border-bottom:1px solid #F1F5F9;background:#FAFBFC;"><td style="padding:6px 10px;font-weight:600;">SOCIETE</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">1</td><td style="text-align:center;padding:6px;color:#64748B;">Composition</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..*</td><td style="padding:6px 10px;font-weight:600;">ASSURE</td><td style="padding:6px 10px;color:#64748B;font-style:italic;">assures</td></tr>
    <tr style="border-bottom:1px solid #F1F5F9;"><td style="padding:6px 10px;font-weight:600;">SOCIETE</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..1</td><td style="text-align:center;padding:6px;color:#64748B;">Association</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..*</td><td style="padding:6px 10px;font-weight:600;">COURRIEL</td><td style="padding:6px 10px;color:#64748B;font-style:italic;">courriels</td></tr>
    <tr style="border-bottom:1px solid #F1F5F9;background:#FAFBFC;"><td style="padding:6px 10px;font-weight:600;">SOCIETE</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">1</td><td style="text-align:center;padding:6px;color:#64748B;">Composition</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..*</td><td style="padding:6px 10px;font-weight:600;">ENTREPRISE_CONTACT</td><td style="padding:6px 10px;color:#64748B;font-style:italic;">contacts</td></tr>
    <tr style="border-bottom:1px solid #F1F5F9;"><td style="padding:6px 10px;font-weight:600;">CONTRAT</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">1</td><td style="text-align:center;padding:6px;color:#64748B;">Composition</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..*</td><td style="padding:6px 10px;font-weight:600;">APPEL_DE_FONDS</td><td style="padding:6px 10px;color:#64748B;font-style:italic;">appelsDeFonds</td></tr>
    <tr style="border-bottom:1px solid #F1F5F9;background:#FAFBFC;"><td style="padding:6px 10px;font-weight:600;">DOSSIER</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">1</td><td style="text-align:center;padding:6px;color:#64748B;">Composition</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..*</td><td style="padding:6px 10px;font-weight:600;">COMMENTAIRE</td><td style="padding:6px 10px;color:#64748B;font-style:italic;">commentaires</td></tr>
    <tr style="border-bottom:1px solid #F1F5F9;"><td style="padding:6px 10px;font-weight:600;">DOSSIER</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">1</td><td style="text-align:center;padding:6px;color:#64748B;">Composition</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..*</td><td style="padding:6px 10px;font-weight:600;">JUSTIFICATIF</td><td style="padding:6px 10px;color:#64748B;font-style:italic;">justificatifs</td></tr>
    <tr style="border-bottom:1px solid #F1F5F9;background:#FAFBFC;"><td style="padding:6px 10px;font-weight:600;">DOSSIER</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..1</td><td style="text-align:center;padding:6px;color:#64748B;">Association</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..1</td><td style="padding:6px 10px;font-weight:600;">COURRIEL</td><td style="padding:6px 10px;color:#64748B;font-style:italic;">courriel</td></tr>
    <tr style="border-bottom:1px solid #F1F5F9;"><td style="padding:6px 10px;font-weight:600;">DOSSIER</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">1</td><td style="text-align:center;padding:6px;color:#64748B;">Aggregation</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..*</td><td style="padding:6px 10px;font-weight:600;">IMPORT_DOSSIER</td><td style="padding:6px 10px;color:#64748B;font-style:italic;">importations</td></tr>
    <tr style="border-bottom:1px solid #F1F5F9;background:#FAFBFC;"><td style="padding:6px 10px;font-weight:600;">IMPORT_HISTORIQUE</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">1</td><td style="text-align:center;padding:6px;color:#64748B;">Composition</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..*</td><td style="padding:6px 10px;font-weight:600;">IMPORT_DOSSIER</td><td style="padding:6px 10px;color:#64748B;font-style:italic;">dossiers</td></tr>
    <tr style="border-bottom:1px solid #F1F5F9;"><td style="padding:6px 10px;font-weight:600;">UTILISATEUR</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..1</td><td style="text-align:center;padding:6px;color:#64748B;">Association</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..*</td><td style="padding:6px 10px;font-weight:600;">COMMENTAIRE</td><td style="padding:6px 10px;color:#64748B;font-style:italic;">commentaires</td></tr>
    <tr style="border-bottom:1px solid #F1F5F9;background:#FAFBFC;"><td style="padding:6px 10px;font-weight:600;">UTILISATEUR</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..1</td><td style="text-align:center;padding:6px;color:#64748B;">Association</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..*</td><td style="padding:6px 10px;font-weight:600;">DOSSIER</td><td style="padding:6px 10px;color:#64748B;font-style:italic;">dossiersCrees</td></tr>
    <tr style="border-bottom:1px solid #F1F5F9;"><td style="padding:6px 10px;font-weight:600;">GESTIONNAIRE</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..1</td><td style="text-align:center;padding:6px;color:#64748B;">Association</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..*</td><td style="padding:6px 10px;font-weight:600;">DOSSIER</td><td style="padding:6px 10px;color:#64748B;font-style:italic;">GestionnaireAccueil</td></tr>
    <tr style="border-bottom:1px solid #F1F5F9;background:#FAFBFC;"><td style="padding:6px 10px;font-weight:600;">GESTIONNAIRE</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..1</td><td style="text-align:center;padding:6px;color:#64748B;">Association</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..*</td><td style="padding:6px 10px;font-weight:600;">DOSSIER</td><td style="padding:6px 10px;color:#64748B;font-style:italic;">GestionnaireTechnique</td></tr>
    <tr style="border-bottom:1px solid #F1F5F9;"><td style="padding:6px 10px;font-weight:600;">GESTIONNAIRE</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..1</td><td style="text-align:center;padding:6px;color:#64748B;">Association</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..*</td><td style="padding:6px 10px;font-weight:600;">DOSSIER</td><td style="padding:6px 10px;color:#64748B;font-style:italic;">GestionnaireCompta</td></tr>
    <tr style="border-bottom:1px solid #F1F5F9;background:#FAFBFC;"><td style="padding:6px 10px;font-weight:600;">ASSURE</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..1</td><td style="text-align:center;padding:6px;color:#64748B;">Association</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..*</td><td style="padding:6px 10px;font-weight:600;">DOSSIER</td><td style="padding:6px 10px;color:#64748B;font-style:italic;">AssureDossier</td></tr>
    <tr><td style="padding:6px 10px;font-weight:600;">PRESTATAIRE</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..1</td><td style="text-align:center;padding:6px;color:#64748B;">Association</td><td style="text-align:center;padding:6px;color:#B45309;font-weight:700;">0..*</td><td style="padding:6px 10px;font-weight:600;">DOSSIER</td><td style="padding:6px 10px;color:#64748B;font-style:italic;">PrestataireDossier</td></tr>
  </table>
</div>

<div class="legend">
  <div class="legend-item"><span class="vis-symbol">+</span> public</div>
  <div class="legend-item"><span class="vis-symbol">-</span> private</div>
  <div class="legend-item"><span class="vis-symbol">#</span> protected</div>
  <div class="legend-item" style="margin-left:16px;color:#94A3B8;font-style:italic;">String? = nullable &middot; Pattern ActiveRecord (Prisma) &middot; Pas de methodes metier (deleguees au service layer)</div>
</div>

</body>
</html>
"""

OUTPUT_PATH = "/home/z/my-project/download/Diagramme_Classe_Suivi_Sante.png"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1600, "height": 100})
    page.set_content(UML_HTML, wait_until="networkidle")
    
    height = page.evaluate("document.body.scrollHeight")
    width = page.evaluate("document.body.scrollWidth")
    
    page.set_viewport_size({"width": max(width + 120, 1600), "height": height + 100})
    page.screenshot(path=OUTPUT_PATH, full_page=True)
    browser.close()
    print(f"UML saved: {OUTPUT_PATH} ({width}x{height})")