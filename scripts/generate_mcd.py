#!/usr/bin/env python3
"""Generate MCD (Modèle Conceptuel de Données) for Suivi Santé platform."""

from playwright.sync_api import sync_playwright
import html

MCD_HTML = """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: #F8FAFC;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  color: #1E293B;
  padding: 60px 80px;
}
h1 {
  font-size: 28px;
  font-weight: 700;
  color: #0F172A;
  margin-bottom: 8px;
  letter-spacing: -0.5px;
}
.subtitle {
  font-size: 14px;
  color: #64748B;
  margin-bottom: 40px;
}
/* Grid layout */
.diagram {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  grid-template-rows: repeat(4, auto);
  gap: 30px 24px;
  position: relative;
}
/* Entity card */
.entity {
  background: #FFFFFF;
  border: 2px solid #CBD5E1;
  border-radius: 10px;
  padding: 16px 18px;
  min-width: 210px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  transition: box-shadow 0.2s;
}
.entity:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.entity.name-center { text-align: center; }
.entity-name {
  font-weight: 700;
  font-size: 15px;
  color: #0F172A;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 2px solid #E2E8F0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.entity.attr {
  font-size: 12px;
  color: #475569;
  line-height: 1.8;
}
.entity.attr .pk { color: #B45309; font-weight: 600; }
.entity.attr .uk { color: #0369A1; font-style: italic; }
.entity.attr .type { color: #94A3B8; font-size: 11px; }
.entity.attr .sep { color: #CBD5E1; }

/* Highlighted entity (core) */
.entity.core { border-color: #3B82F6; border-width: 2.5px; }
.entity.core .entity-name { color: #1D4ED8; }
.entity.secondary { border-color: #8B5CF6; border-width: 2px; }
.entity.secondary .entity-name { color: #6D28D9; }

/* Legend */
.legend {
  margin-top: 50px;
  display: flex;
  gap: 30px;
  flex-wrap: wrap;
  font-size: 13px;
  color: #475569;
}
.legend-item { display: flex; align-items: center; gap: 8px; }
.legend-dot {
  width: 14px; height: 14px; border-radius: 4px; border: 2px solid;
}
.legend-dot.core { border-color: #3B82F6; background: #EFF6FF; }
.legend-dot.secondary { border-color: #8B5CF6; background: #F5F3FF; }
.legend-dot.normal { border-color: #CBD5E1; background: #FFF; }

/* Cardinality notation */
.card-info {
  margin-top: 30px;
  padding: 20px 24px;
  background: #F1F5F9;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.9;
  color: #334155;
}
.card-info h2 {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 12px;
  color: #0F172A;
}
.card-info .rel {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.card-info .card { font-weight: 700; color: #1D4ED8; min-width: 24px; text-align: center; }
.card-info .arrow { color: #94A3B8; }

/* Associations table */
.assoc-table {
  margin-top: 20px;
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.assoc-table th {
  background: #E2E8F0;
  padding: 8px 12px;
  text-align: left;
  font-weight: 600;
  color: #334155;
}
.assoc-table td {
  padding: 7px 12px;
  border-bottom: 1px solid #E2E8F0;
  color: #475569;
}
.assoc-table tr:nth-child(even) td { background: #F8FAFC; }
.assoc-table .ent-name { font-weight: 600; color: #1E293B; }
.assoc-table .card-n { font-weight: 700; color: #B45309; }

/* Grid positions */
.pos-0-0 { grid-column: 1; grid-row: 1; }
.pos-0-1 { grid-column: 3; grid-row: 1; }
.pos-0-2 { grid-column: 5; grid-row: 1; }
.pos-1-0 { grid-column: 1; grid-row: 2; }
.pos-1-1 { grid-column: 2; grid-row: 2; }
.pos-1-2 { grid-column: 3; grid-row: 2; }
.pos-1-3 { grid-column: 4; grid-row: 2; }
.pos-1-4 { grid-column: 5; grid-row: 2; }
.pos-2-0 { grid-column: 1; grid-row: 3; }
.pos-2-1 { grid-column: 2; grid-row: 3; }
.pos-2-2 { grid-column: 3; grid-row: 3; }
.pos-2-3 { grid-column: 4; grid-row: 3; }
.pos-2-4 { grid-column: 5; grid-row: 3; }
.pos-3-0 { grid-column: 1; grid-row: 4; }
.pos-3-1 { grid-column: 2; grid-row: 4; }
.pos-3-2 { grid-column: 4; grid-row: 4; }
.pos-3-3 { grid-column: 5; grid-row: 4; }
</style>
</head>
<body>

<h1>MCD — Modele Conceptuel de Donnees</h1>
<p class="subtitle">Plateforme Suivi Sante &middot; 15 entites &middot; 19 associations</p>

<div class="diagram">

  <!-- Row 1: Core entities -->
  <div class="entity core name-center pos-0-0">
    <div class="entity-name">SOCIETE</div>
    <div class="attr">
      <span class="pk">id</span> <span class="sep">:</span> <span class="type">String</span><br>
      nom <span class="sep">:</span> <span class="type">String</span><br>
    </div>
  </div>

  <div class="entity core name-center pos-0-1">
    <div class="entity-name">DOSSIER</div>
    <div class="attr">
      <span class="pk">id</span> <span class="sep">:</span> <span class="type">String</span><br>
      <span class="uk">numeroDossier</span> <span class="sep">:</span> <span class="type">String</span><br>
      beneficiaire <span class="sep">:</span> <span class="type">String</span><br>
      typeDossier <span class="sep">:</span> <span class="type">String</span><br>
      statut <span class="sep">:</span> <span class="type">String</span><br>
      montantReclame <span class="sep">:</span> <span class="type">Float</span><br>
    </div>
  </div>

  <div class="entity core name-center pos-0-2">
    <div class="entity-name">UTILISATEUR</div>
    <div class="attr">
      <span class="pk">id</span> <span class="sep">:</span> <span class="type">String</span><br>
      <span class="uk">email</span> <span class="sep">:</span> <span class="type">String</span><br>
      nom <span class="sep">:</span> <span class="type">String</span><br>
      role <span class="sep">:</span> <span class="type">String</span><br>
      actif <span class="sep">:</span> <span class="type">Boolean</span><br>
    </div>
  </div>

  <!-- Row 2 -->
  <div class="entity secondary pos-1-0">
    <div class="entity-name">CONTRAT</div>
    <div class="attr">
      <span class="pk">id</span> <span class="sep">:</span> <span class="type">String</span><br>
      reference <span class="sep">:</span> <span class="type">String</span><br>
      budgetAnnuel <span class="sep">:</span> <span class="type">Float</span><br>
      statut <span class="sep">:</span> <span class="type">String</span><br>
      dateDebut <span class="sep">:</span> <span class="type">DateTime</span><br>
      dateFin <span class="sep">:</span> <span class="type">DateTime</span><br>
    </div>
  </div>

  <div class="entity pos-1-1">
    <div class="entity-name">GESTIONNAIRE</div>
    <div class="attr">
      <span class="pk">id</span> <span class="sep">:</span> <span class="type">String</span><br>
      nom <span class="sep">:</span> <span class="type">String</span><br>
      service <span class="sep">:</span> <span class="type">String</span><br>
    </div>
  </div>

  <div class="entity pos-1-3">
    <div class="entity-name">ASSURE</div>
    <div class="attr">
      <span class="pk">id</span> <span class="sep">:</span> <span class="type">String</span><br>
      <span class="uk">nSS</span> <span class="sep">:</span> <span class="type">String</span><br>
      nom <span class="sep">:</span> <span class="type">String</span><br>
      prenom <span class="sep">:</span> <span class="type">String</span><br>
      actif <span class="sep">:</span> <span class="type">Boolean</span><br>
    </div>
  </div>

  <div class="entity pos-1-4">
    <div class="entity-name">PRESTATAIRE</div>
    <div class="attr">
      <span class="pk">id</span> <span class="sep">:</span> <span class="type">String</span><br>
      nom <span class="sep">:</span> <span class="type">String</span><br>
      type <span class="sep">:</span> <span class="type">String</span><br>
      nif <span class="sep">:</span> <span class="type">String</span><br>
      actif <span class="sep">:</span> <span class="type">Boolean</span><br>
    </div>
  </div>

  <!-- Row 3 -->
  <div class="entity pos-2-0">
    <div class="entity-name">APPEL_DE_FONDS</div>
    <div class="attr">
      <span class="pk">id</span> <span class="sep">:</span> <span class="type">String</span><br>
      montant <span class="sep">:</span> <span class="type">Float</span><br>
      dateAppel <span class="sep">:</span> <span class="type">DateTime</span><br>
      statut <span class="sep">:</span> <span class="type">String</span><br>
      datePaiement <span class="sep">:</span> <span class="type">DateTime</span><br>
    </div>
  </div>

  <div class="entity pos-2-1">
    <div class="entity-name">COMMENTAIRE</div>
    <div class="attr">
      <span class="pk">id</span> <span class="sep">:</span> <span class="type">String</span><br>
      contenu <span class="sep">:</span> <span class="type">String</span><br>
      prive <span class="sep">:</span> <span class="type">Boolean</span><br>
    </div>
  </div>

  <div class="entity pos-2-2">
    <div class="entity-name">JUSTIFICATIF</div>
    <div class="attr">
      <span class="pk">id</span> <span class="sep">:</span> <span class="type">String</span><br>
      type <span class="sep">:</span> <span class="type">String</span><br>
      nomFichier <span class="sep">:</span> <span class="type">String</span><br>
      chemin <span class="sep">:</span> <span class="type">String</span><br>
    </div>
  </div>

  <div class="entity pos-2-3">
    <div class="entity-name">BAREME</div>
    <div class="attr">
      <span class="pk">id</span> <span class="sep">:</span> <span class="type">String</span><br>
      prestation <span class="sep">:</span> <span class="type">String</span><br>
      tauxCouverture <span class="sep">:</span> <span class="type">Float</span><br>
      plafond <span class="sep">:</span> <span class="type">Float</span><br>
      <span class="uk">(societeId, prestation)</span>
    </div>
  </div>

  <div class="entity pos-2-4">
    <div class="entity-name">COURRIEL</div>
    <div class="attr">
      <span class="pk">id</span> <span class="sep">:</span> <span class="type">String</span><br>
      type <span class="sep">:</span> <span class="type">String</span><br>
      expediteur <span class="sep">:</span> <span class="type">String</span><br>
      objet <span class="sep">:</span> <span class="type">String</span><br>
      statut <span class="sep">:</span> <span class="type">String</span><br>
    </div>
  </div>

  <!-- Row 4 -->
  <div class="entity pos-3-0">
    <div class="entity-name">IMPORT_HISTORIQUE</div>
    <div class="attr">
      <span class="pk">id</span> <span class="sep">:</span> <span class="type">String</span><br>
      source <span class="sep">:</span> <span class="type">String</span><br>
      nomFichier <span class="sep">:</span> <span class="type">String</span><br>
      nbLignes <span class="sep">:</span> <span class="type">Int</span><br>
    </div>
  </div>

  <div class="entity pos-3-1">
    <div class="entity-name">IMPORT_DOSSIER</div>
    <div class="attr">
      <span class="pk">id</span> <span class="sep">:</span> <span class="type">String</span><br>
      numeroLigne <span class="sep">:</span> <span class="type">Int</span><br>
      statutImport <span class="sep">:</span> <span class="type">String</span><br>
    </div>
  </div>

  <div class="entity pos-3-2">
    <div class="entity-name">MESSAGE_BOT</div>
    <div class="attr">
      <span class="pk">id</span> <span class="sep">:</span> <span class="type">String</span><br>
      canal <span class="sep">:</span> <span class="type">String</span><br>
      message <span class="sep">:</span> <span class="type">String</span><br>
      reponse <span class="sep">:</span> <span class="type">String</span><br>
      lu <span class="sep">:</span> <span class="type">Boolean</span><br>
    </div>
  </div>

  <div class="entity pos-3-3">
    <div class="entity-name">ENTREPRISE_CONTACT</div>
    <div class="attr">
      <span class="pk">id</span> <span class="sep">:</span> <span class="type">String</span><br>
      nom <span class="sep">:</span> <span class="type">String</span><br>
      prenom <span class="sep">:</span> <span class="type">String</span><br>
      fonction <span class="sep">:</span> <span class="type">String</span><br>
    </div>
  </div>

</div>

<div class="card-info">
  <h2>Associations et Cardinalites</h2>
  <table class="assoc-table">
    <tr>
      <th>Entite source</th>
      <th>Card.</th>
      <th>Entite cible</th>
      <th>Card.</th>
      <th>Association</th>
    </tr>
    <tr>
      <td class="ent-name">SOCIETE</td>
      <td class="card-n">1,1</td>
      <td class="ent-name">BAREME</td>
      <td class="card-n">0,n</td>
      <td>Definir</td>
    </tr>
    <tr>
      <td class="ent-name">SOCIETE</td>
      <td class="card-n">1,1</td>
      <td class="ent-name">CONTRAT</td>
      <td class="card-n">0,n</td>
      <td>Signer</td>
    </tr>
    <tr>
      <td class="ent-name">SOCIETE</td>
      <td class="card-n">1,1</td>
      <td class="ent-name">DOSSIER</td>
      <td class="card-n">0,n</td>
      <td>Posseder</td>
    </tr>
    <tr>
      <td class="ent-name">SOCIETE</td>
      <td class="card-n">1,1</td>
      <td class="ent-name">ASSURE</td>
      <td class="card-n">0,n</td>
      <td>Employer</td>
    </tr>
    <tr>
      <td class="ent-name">SOCIETE</td>
      <td class="card-n">0,1</td>
      <td class="ent-name">COURRIEL</td>
      <td class="card-n">0,n</td>
      <td>Recevoir</td>
    </tr>
    <tr>
      <td class="ent-name">SOCIETE</td>
      <td class="card-n">1,1</td>
      <td class="ent-name">ENTREPRISE_CONTACT</td>
      <td class="card-n">0,n</td>
      <td>Avoir</td>
    </tr>
    <tr>
      <td class="ent-name">CONTRAT</td>
      <td class="card-n">1,1</td>
      <td class="ent-name">APPEL_DE_FONDS</td>
      <td class="card-n">0,n</td>
      <td>Generer</td>
    </tr>
    <tr>
      <td class="ent-name">DOSSIER</td>
      <td class="card-n">1,1</td>
      <td class="ent-name">COMMENTAIRE</td>
      <td class="card-n">0,n</td>
      <td>Contenir</td>
    </tr>
    <tr>
      <td class="ent-name">DOSSIER</td>
      <td class="card-n">1,1</td>
      <td class="ent-name">JUSTIFICATIF</td>
      <td class="card-n">0,n</td>
      <td>Joindre</td>
    </tr>
    <tr>
      <td class="ent-name">DOSSIER</td>
      <td class="card-n">0,1</td>
      <td class="ent-name">COURRIEL</td>
      <td class="card-n">0,1</td>
      <td>Associer</td>
    </tr>
    <tr>
      <td class="ent-name">DOSSIER</td>
      <td class="card-n">1,1</td>
      <td class="ent-name">IMPORT_DOSSIER</td>
      <td class="card-n">0,n</td>
      <td>Importer</td>
    </tr>
    <tr>
      <td class="ent-name">IMPORT_HISTORIQUE</td>
      <td class="card-n">1,1</td>
      <td class="ent-name">IMPORT_DOSSIER</td>
      <td class="card-n">0,n</td>
      <td>Detaille</td>
    </tr>
    <tr>
      <td class="ent-name">UTILISATEUR</td>
      <td class="card-n">0,1</td>
      <td class="ent-name">COMMENTAIRE</td>
      <td class="card-n">0,n</td>
      <td>Ecrire</td>
    </tr>
    <tr>
      <td class="ent-name">UTILISATEUR</td>
      <td class="card-n">0,1</td>
      <td class="ent-name">DOSSIER</td>
      <td class="card-n">0,n</td>
      <td>Creer</td>
    </tr>
    <tr>
      <td class="ent-name">GESTIONNAIRE</td>
      <td class="card-n">0,1</td>
      <td class="ent-name">DOSSIER</td>
      <td class="card-n">0,n</td>
      <td>Accueillir</td>
    </tr>
    <tr>
      <td class="ent-name">GESTIONNAIRE</td>
      <td class="card-n">0,1</td>
      <td class="ent-name">DOSSIER</td>
      <td class="card-n">0,n</td>
      <td>Traiter (tech.)</td>
    </tr>
    <tr>
      <td class="ent-name">GESTIONNAIRE</td>
      <td class="card-n">0,1</td>
      <td class="ent-name">DOSSIER</td>
      <td class="card-n">0,n</td>
      <td>Gerer (compta)</td>
    </tr>
    <tr>
      <td class="ent-name">ASSURE</td>
      <td class="card-n">0,1</td>
      <td class="ent-name">DOSSIER</td>
      <td class="card-n">0,n</td>
      <td>Beneficier</td>
    </tr>
    <tr>
      <td class="ent-name">PRESTATAIRE</td>
      <td class="card-n">0,1</td>
      <td class="ent-name">DOSSIER</td>
      <td class="card-n">0,n</td>
      <td>Fournir</td>
    </tr>
  </table>
</div>

<div class="legend">
  <div class="legend-item"><div class="legend-dot core"></div> Entite principale (noyau)</div>
  <div class="legend-item"><div class="legend-dot secondary"></div> Entite secondaire</div>
  <div class="legend-item"><div class="legend-dot normal"></div> Entite satellite</div>
</div>

</body>
</html>
"""

OUTPUT_PATH = "/home/z/my-project/download/MCD_Suivi_Sante.png"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 100})
    page.set_content(MCD_HTML, wait_until="networkidle")
    
    # Get the full page height
    height = page.evaluate("document.body.scrollHeight")
    width = page.evaluate("document.body.scrollWidth")
    
    page.set_viewport_size({"width": max(width + 160, 1400), "height": height + 100})
    page.screenshot(path=OUTPUT_PATH, full_page=True)
    browser.close()
    print(f"MCD saved: {OUTPUT_PATH} ({width}x{height})")