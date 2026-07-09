import { chromium } from 'playwright';

const palette = {
  bg: '#F8FAFC', card: '#FFFFFF', primary: '#1E40AF', accent: '#3B82F6',
  text: '#1F2937', textMuted: '#64748B', border: '#CBD5E1', borderLight: '#E2E8F0',
  entityBg: '#F0F4F8', entityBorder: '#64748B', pkBg: '#DBEAFE', fkBg: '#FFF7ED',
  relationColor: '#94A3B8', titleBg: '#1E3A5F', titleText: '#FFFFFF',
};

const entities = [
  { name: 'Utilisateur', attrs: [
    { n: 'id', t: 'TEXT', pk: true }, { n: 'email', t: 'TEXT', u: true }, { n: 'nom', t: 'TEXT' },
    { n: 'password', t: 'TEXT' }, { n: 'role', t: 'TEXT' }, { n: 'actif', t: 'BOOLEAN' },
    { n: 'avatar', t: 'TEXT?' }, { n: 'dernierLogin', t: 'DATETIME?' },
  ]},
  { name: 'Societe', attrs: [
    { n: 'id', t: 'TEXT', pk: true }, { n: 'nom', t: 'TEXT' },
  ]},
  { name: 'Gestionnaire', attrs: [
    { n: 'id', t: 'TEXT', pk: true }, { n: 'nom', t: 'TEXT' }, { n: 'service', t: 'TEXT' },
  ]},
  { name: 'Contrat', attrs: [
    { n: 'id', t: 'TEXT', pk: true }, { n: 'reference', t: 'TEXT' }, { n: 'budgetAnnuel', t: 'FLOAT' },
    { n: 'budgetUtilise', t: 'FLOAT' }, { n: 'dateDebut', t: 'DATE' }, { n: 'dateFin', t: 'DATE' },
    { n: 'statut', t: 'TEXT' },
  ]},
  { name: 'AppelDeFonds', attrs: [
    { n: 'id', t: 'TEXT', pk: true }, { n: 'montant', t: 'FLOAT' }, { n: 'dateAppel', t: 'DATE' },
    { n: 'datePaiement', t: 'DATE?' }, { n: 'reference', t: 'TEXT?' }, { n: 'statut', t: 'TEXT' },
  ]},
  { name: 'Dossier', attrs: [
    { n: 'id', t: 'TEXT', pk: true }, { n: 'numeroDossier', t: 'TEXT', u: true }, { n: 'dateReception', t: 'DATE' },
    { n: 'beneficiaire', t: 'TEXT' }, { n: 'typeDossier', t: 'TEXT' }, { n: 'montantReclame', t: 'FLOAT' },
    { n: 'montantValide', t: 'FLOAT?' }, { n: 'statut', t: 'TEXT' }, { n: 'source', t: 'TEXT' },
    { n: 'historique', t: 'JSON' }, { n: 'ticketModerateur', t: 'FLOAT?' }, { n: 'motifRejet', t: 'TEXT?' },
  ]},
  { name: 'Commentaire', attrs: [
    { n: 'id', t: 'TEXT', pk: true }, { n: 'contenu', t: 'TEXT' }, { n: 'prive', t: 'BOOLEAN' },
  ]},
  { name: 'Justificatif', attrs: [
    { n: 'id', t: 'TEXT', pk: true }, { n: 'type', t: 'TEXT' }, { n: 'nomFichier', t: 'TEXT' },
    { n: 'chemin', t: 'TEXT' }, { n: 'tailleKo', t: 'FLOAT?' },
  ]},
  { name: 'Assure', attrs: [
    { n: 'id', t: 'TEXT', pk: true }, { n: 'nom', t: 'TEXT' }, { n: 'nSS', t: 'TEXT', u: true },
    { n: 'prenom', t: 'TEXT?' }, { n: 'dateNaissance', t: 'DATE?' }, { n: 'sexe', t: 'TEXT?' },
    { n: 'telephone', t: 'TEXT?' }, { n: 'email', t: 'TEXT?' }, { n: 'actif', t: 'BOOLEAN' },
  ]},
  { name: 'Prestataire', attrs: [
    { n: 'id', t: 'TEXT', pk: true }, { n: 'nom', t: 'TEXT' }, { n: 'type', t: 'TEXT' },
    { n: 'telephone', t: 'TEXT?' }, { n: 'email', t: 'TEXT?' }, { n: 'nif', t: 'TEXT?' },
    { n: 'rib', t: 'TEXT?' }, { n: 'actif', t: 'BOOLEAN' },
  ]},
  { name: 'Bareme', attrs: [
    { n: 'id', t: 'TEXT', pk: true }, { n: 'prestation', t: 'TEXT' },
    { n: 'tauxCouverture', t: 'FLOAT' }, { n: 'plafond', t: 'FLOAT' }, { n: 'active', t: 'BOOLEAN' },
  ]},
  { name: 'Courriel', attrs: [
    { n: 'id', t: 'TEXT', pk: true }, { n: 'type', t: 'TEXT' }, { n: 'expediteur', t: 'TEXT' },
    { n: 'objet', t: 'TEXT' }, { n: 'montant', t: 'FLOAT?' }, { n: 'statut', t: 'TEXT' },
  ]},
  { name: 'ImportHistorique', attrs: [
    { n: 'id', t: 'TEXT', pk: true }, { n: 'source', t: 'TEXT' }, { n: 'nomFichier', t: 'TEXT' },
    { n: 'nbLignes', t: 'INT' }, { n: 'nbSucces', t: 'INT' }, { n: 'nbErreurs', t: 'INT' },
  ]},
  { name: 'ImportDossier', attrs: [
    { n: 'id', t: 'TEXT', pk: true }, { n: 'numeroLigne', t: 'INT' },
    { n: 'statutImport', t: 'TEXT' }, { n: 'erreur', t: 'TEXT?' }, { n: 'donnees', t: 'JSON' },
  ]},
  { name: 'MessageBot', attrs: [
    { n: 'id', t: 'TEXT', pk: true }, { n: 'canal', t: 'TEXT' }, { n: 'expeditieurId', t: 'TEXT' },
    { n: 'expeditieurNom', t: 'TEXT' }, { n: 'message', t: 'TEXT' }, { n: 'reponse', t: 'TEXT' },
  ]},
  { name: 'EntrepriseContact', attrs: [
    { n: 'id', t: 'TEXT', pk: true }, { n: 'nom', t: 'TEXT' }, { n: 'prenom', t: 'TEXT?' },
    { n: 'fonction', t: 'TEXT?' }, { n: 'telephone', t: 'TEXT?' }, { n: 'email', t: 'TEXT?' },
  ]},
];

const mcdRelations = [
  { from: 'Societe', to: 'Dossier', label: '1,N', label2: '0,N', name: 'possède' },
  { from: 'Societe', to: 'Contrat', label: '1,1', label2: '0,N', name: 'a' },
  { from: 'Societe', to: 'Bareme', label: '1,N', label2: '0,N', name: 'définir' },
  { from: 'Societe', to: 'Assure', label: '1,N', label2: '0,N', name: 'emploie' },
  { from: 'Societe', to: 'EntrepriseContact', label: '1,N', label2: '0,N', name: 'a' },
  { from: 'Societe', to: 'Courriel', label: '0,1', label2: '0,N', name: 'reçoit' },
  { from: 'Contrat', to: 'AppelDeFonds', label: '1,1', label2: '0,N', name: 'génère' },
  { from: 'Dossier', to: 'Commentaire', label: '1,1', label2: '0,N', name: 'a' },
  { from: 'Dossier', to: 'Justificatif', label: '1,1', label2: '0,N', name: 'contient' },
  { from: 'Dossier', to: 'Assure', label: '0,1', label2: '0,N', name: 'concerne' },
  { from: 'Dossier', to: 'Prestataire', label: '0,1', label2: '0,N', name: 'traité par' },
  { from: 'Dossier', to: 'Gestionnaire', label: '0,N', label2: '0,N', name: 'suivi par' },
  { from: 'Dossier', to: 'Utilisateur', label: '0,N', label2: '0,1', name: 'créé par' },
  { from: 'Dossier', to: 'Courriel', label: '0,1', label2: '0,1', name: 'converti de' },
  { from: 'ImportHistorique', to: 'ImportDossier', label: '1,1', label2: '0,N', name: 'détaille' },
  { from: 'ImportDossier', to: 'Dossier', label: '0,1', label2: '0,1', name: 'produit' },
  { from: 'Commentaire', to: 'Utilisateur', label: '0,N', label2: '0,1', name: 'écrit par' },
];

const layout = [
  ['Societe', 'Dossier', 'Utilisateur', 'Assure'],
  ['Contrat', 'Prestataire', 'Gestionnaire', 'Bareme'],
  ['AppelDeFonds', 'Commentaire', 'Justificatif', 'Courriel'],
  ['ImportHistorique', 'ImportDossier', 'MessageBot', 'EntrepriseContact'],
];

const colW = 260, colGap = 60, padX = 40, padTop = 120;
const rowGap = 50;

const positions: Record<string, {x: number, y: number}> = {};
for (let r = 0; r < layout.length; r++) {
  for (let c = 0; c < layout[r].length; c++) {
    positions[layout[r][c]] = {
      x: padX + c * (colW + colGap) + colW / 2,
      y: padTop + r * 210,
    };
  }
}

const totalMcdW = padX * 2 + 4 * colW + 3 * colGap;
const totalMcdH = padTop + 4 * 210 + 40;

let entityBoxes = '';
for (const e of entities) {
  const pos = positions[e.name];
  const x = pos.x - colW / 2;
  const y = pos.y;
  entityBoxes += `<div class="mcd-entity" style="left:${x}px;top:${y}px;width:${colW}px;">
    <div class="mcd-entity-title">${e.name}</div>
    ${e.attrs.map(a => `<div class="mcd-attr">${a.pk ? '<span class="pk-icon">PK</span> ' : a.u ? '<span class="u-icon">U</span> ' : '  '}${a.n} <span class="mcd-type">${a.t}</span></div>`).join('')}
  </div>`;
}

let svgLines = '';
for (const rel of mcdRelations) {
  const from = positions[rel.from];
  const to = positions[rel.to];
  if (!from || !to) continue;
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  svgLines += `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${palette.relationColor}" stroke-width="1.5" stroke-dasharray="6,3"/>
    <rect x="${mx - 32}" y="${my - 10}" width="64" height="20" rx="4" fill="${palette.bg}" stroke="${palette.border}" stroke-width="0.5"/>
    <text x="${mx}" y="${my + 4}" text-anchor="middle" font-size="9" fill="${palette.textMuted}">${rel.label} — ${rel.label2}</text>
    <text x="${mx}" y="${my - 13}" text-anchor="middle" font-size="8" fill="${palette.accent}" font-style="italic">${rel.name}</text>`;
}

const mcdPage = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box;}
body{background:${palette.bg};font-family:'Segoe UI',system-ui,sans-serif;}
.c{position:relative;width:${totalMcdW}px;height:${totalMcdH}px;}
.hdr{position:absolute;top:0;left:0;right:0;height:90px;background:${palette.titleBg};display:flex;flex-direction:column;justify-content:center;padding:0 40px;}
.hdr h1{color:#fff;font-size:22px;font-weight:700;letter-spacing:.5px;}
.hdr p{color:#94A3B8;font-size:13px;margin-top:4px;}
.svg-l{position:absolute;top:90px;left:0;width:${totalMcdW}px;height:${totalMcdH-90}px;pointer-events:none;}
.mcd-entity{position:absolute;background:${palette.card};border:1.5px solid ${palette.entityBorder};border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);}
.mcd-entity-title{background:${palette.entityBg};padding:6px 12px;font-size:13px;font-weight:700;color:${palette.primary};border-bottom:1px solid ${palette.borderLight};}
.mcd-attr{padding:3px 12px;font-size:11px;color:${palette.text};font-family:Consolas,Monaco,monospace;}
.mcd-type{color:${palette.textMuted};font-size:10px;}
.pk-icon{display:inline-block;background:#DBEAFE;color:#1E40AF;font-size:8px;font-weight:700;padding:1px 4px;border-radius:3px;margin-right:4px;}
.u-icon{display:inline-block;background:#F0FDF4;color:#065F46;font-size:8px;font-weight:700;padding:1px 4px;border-radius:3px;margin-right:4px;}
</style></head><body>
<div class="c">
  <div class="hdr"><h1>MCD — Modèle Conceptuel de Données</h1><p>Suivi Santé — 16 entités · 17 associations · Méthode Merise</p></div>
  <div class="svg-l"><svg width="${totalMcdW}" height="${totalMcdH-90}" xmlns="http://www.w3.org/2000/svg">${svgLines}</svg></div>
  ${entityBoxes}
</div></body></html>`;

// ─── MLD ─────────────────────────────────────────────────────────────────

const mldTables = [
  { name: 'Utilisateur', cols: ['id TEXT PK', 'email TEXT UNIQUE NOT NULL', 'nom TEXT NOT NULL', 'password TEXT NOT NULL', 'role TEXT DEFAULT UTILISATEUR', 'actif BOOLEAN DEFAULT true', 'avatar TEXT', 'dernierLogin TIMESTAMP'] },
  { name: 'Societe', cols: ['id TEXT PK', 'nom TEXT NOT NULL', 'createdAt TIMESTAMP'] },
  { name: 'Gestionnaire', cols: ['id TEXT PK', 'nom TEXT NOT NULL', 'service TEXT NOT NULL', 'createdAt TIMESTAMP'] },
  { name: 'Contrat', cols: ['id TEXT PK', 'societeId TEXT FK → Societe.id', 'reference TEXT NOT NULL', 'budgetAnnuel FLOAT NOT NULL', 'budgetUtilise FLOAT DEFAULT 0', 'dateDebut TIMESTAMP', 'dateFin TIMESTAMP', 'statut TEXT DEFAULT ACTIF'] },
  { name: 'AppelDeFonds', cols: ['id TEXT PK', 'contratId TEXT FK → Contrat.id', 'montant FLOAT NOT NULL', 'dateAppel TIMESTAMP', 'datePaiement TIMESTAMP', 'reference TEXT', 'statut TEXT DEFAULT EN_ATTENTE'] },
  { name: 'Dossier', cols: ['id TEXT PK', 'numeroDossier TEXT UNIQUE', 'societeId TEXT FK → Societe.id', 'beneficiaire TEXT NOT NULL', 'typeDossier TEXT NOT NULL', 'assureId TEXT FK → Assure.id', 'prestataireId TEXT FK → Prestataire.id', 'gestionnaireAccueilId TEXT FK', 'gestionnaireTechniqueId TEXT FK', 'createurId TEXT FK → Utilisateur.id', 'gestionnaireComptaId TEXT FK', 'montantReclame FLOAT', 'montantValide FLOAT', 'statut TEXT DEFAULT RECU', 'source TEXT DEFAULT EXCEL', 'historique TEXT DEFAULT []', 'motifRejet TEXT', '+ 8 autres colonnes...'] },
  { name: 'Commentaire', cols: ['id TEXT PK', 'dossierId TEXT FK → Dossier.id', 'auteurId TEXT FK → Utilisateur.id', 'contenu TEXT NOT NULL', 'prive BOOLEAN DEFAULT false'] },
  { name: 'Justificatif', cols: ['id TEXT PK', 'dossierId TEXT FK → Dossier.id', 'type TEXT NOT NULL', 'nomFichier TEXT NOT NULL', 'chemin TEXT NOT NULL', 'tailleKo FLOAT'] },
  { name: 'Assure', cols: ['id TEXT PK', 'societeId TEXT FK → Societe.id', 'nom TEXT NOT NULL', 'nSS TEXT UNIQUE', 'prenom TEXT', 'dateNaissance TIMESTAMP', 'sexe TEXT', 'telephone TEXT', 'email TEXT', 'actif BOOLEAN DEFAULT true'] },
  { name: 'Prestataire', cols: ['id TEXT PK', 'nom TEXT NOT NULL', 'type TEXT NOT NULL', 'telephone TEXT', 'email TEXT', 'adresse TEXT', 'nif TEXT', 'rib TEXT', 'actif BOOLEAN DEFAULT true'] },
  { name: 'Bareme', cols: ['id TEXT PK', 'societeId TEXT FK → Societe.id', 'prestation TEXT NOT NULL', 'tauxCouverture FLOAT', 'plafond FLOAT', 'active BOOLEAN DEFAULT true', 'UNIQUE(societeId, prestation)'] },
  { name: 'Courriel', cols: ['id TEXT PK', 'type TEXT NOT NULL', 'expediteur TEXT NOT NULL', 'objet TEXT NOT NULL', 'societeId TEXT FK → Societe.id', 'dossierId TEXT UNIQUE FK', 'montant FLOAT', 'statut TEXT DEFAULT RECU'] },
  { name: 'ImportHistorique', cols: ['id TEXT PK', 'source TEXT NOT NULL', 'nomFichier TEXT NOT NULL', 'nbLignes INT NOT NULL', 'nbSucces INT DEFAULT 0', 'nbErreurs INT DEFAULT 0', 'rapport TEXT DEFAULT []'] },
  { name: 'ImportDossier', cols: ['id TEXT PK', 'importId TEXT FK → ImportHistorique.id', 'dossierId TEXT FK → Dossier.id', 'numeroLigne INT NOT NULL', 'statutImport TEXT DEFAULT SUCCES', 'erreur TEXT', 'donnees TEXT DEFAULT {}'] },
  { name: 'MessageBot', cols: ['id TEXT PK', 'canal TEXT NOT NULL', 'expeditieurId TEXT NOT NULL', 'expeditieurNom TEXT NOT NULL', 'message TEXT NOT NULL', 'reponse TEXT NOT NULL', 'lu BOOLEAN DEFAULT false'] },
  { name: 'EntrepriseContact', cols: ['id TEXT PK', 'societeId TEXT FK → Societe.id', 'nom TEXT NOT NULL', 'prenom TEXT', 'fonction TEXT', 'telephone TEXT', 'email TEXT', 'actif BOOLEAN DEFAULT true'] },
];

const mldCols = 4, mldColW = 320, mldColGap = 24, mldPadX = 24, mldPadTop = 100;
const mldRows = Math.ceil(mldTables.length / mldCols);
const totalMldW = mldPadX * 2 + mldCols * mldColW + (mldCols - 1) * mldColGap;
const totalMldH = mldPadTop + mldRows * 300 + 40;

let mldHtml = '';
for (let i = 0; i < mldTables.length; i++) {
  const t = mldTables[i];
  const c = i % mldCols;
  const r = Math.floor(i / mldCols);
  const x = mldPadX + c * (mldColW + mldColGap);
  const y = mldPadTop + r * 300;
  mldHtml += `<div class="mld-table" style="left:${x}px;top:${y}px;width:${mldColW}px;">
    <div class="mld-table-title">${t.name}</div>
    <div class="mld-table-cols">${t.cols.map(col => {
      const isPK = col.includes('PK');
      const isFK = col.includes('FK');
      const isUnique = col.includes('UNIQUE');
      return `<div class="mld-col ${isPK ? 'pk' : ''} ${isFK ? 'fk' : ''}">${col}</div>`;
    }).join('')}</div>
  </div>`;
}

const mldPage = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box;}
body{background:${palette.bg};font-family:'Segoe UI',system-ui,sans-serif;}
.c{position:relative;width:${totalMldW}px;height:${totalMldH}px;}
.hdr{position:absolute;top:0;left:0;right:0;height:90px;background:${palette.titleBg};display:flex;flex-direction:column;justify-content:center;padding:0 40px;}
.hdr h1{color:#fff;font-size:22px;font-weight:700;}
.hdr p{color:#94A3B8;font-size:13px;margin-top:4px;}
.legend{position:absolute;top:100px;right:24px;background:#fff;border:1px solid ${palette.border};border-radius:8px;padding:10px 14px;font-size:11px;color:${palette.text};box-shadow:0 1px 3px rgba(0,0,0,.06);}
.legend-item{display:flex;align-items:center;gap:8px;margin:3px 0;}
.legend-sq{width:14px;height:14px;border-radius:3px;}
.mld-table{position:absolute;background:${palette.card};border:1.5px solid ${palette.entityBorder};border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);}
.mld-table-title{background:${palette.entityBg};padding:6px 12px;font-size:12px;font-weight:700;color:${palette.primary};border-bottom:1px solid ${palette.borderLight};}
.mld-table-cols{padding:4px 0;}
.mld-col{padding:2.5px 10px;font-size:10px;color:${palette.text};font-family:Consolas,Monaco,monospace;border-bottom:1px solid ${palette.borderLight};line-height:1.4;}
.mld-col:last-child{border-bottom:none;}
.mld-col.pk{background:${palette.pkBg};font-weight:600;}
.mld-col.fk{background:${palette.fkBg};}
</style></head><body>
<div class="c">
  <div class="hdr"><h1>MLD — Modèle Logique de Données</h1><p>Suivi Santé — PostgreSQL · relationMode = prisma · 16 tables</p></div>
  <div class="legend">
    <div class="legend-item"><div class="legend-sq" style="background:${palette.pkBg};border:1px solid #3B82F6;"></div> Clé primaire (PK)</div>
    <div class="legend-item"><div class="legend-sq" style="background:${palette.fkBg};border:1px solid #F59E0B;"></div> Clé étrangère (FK)</div>
  </div>
  ${mldHtml}
</div></body></html>`;

// ─── CLASS DIAGRAM ───────────────────────────────────────────────────────

const umlClasses = [
  { name: 'Utilisateur', attrs: ['- id: String', '- email: String', '- nom: String', '- password: String', '- role: RoleUtilisateur', '- actif: boolean', '- avatar: String?', '- dernierLogin: Date?'], methods: ['+ commentaires(): Commentaire[]', '+ dossiersCrees(): Dossier[]'] },
  { name: 'Societe', attrs: ['- id: String', '- nom: String'], methods: ['+ baremes(): Bareme[]', '+ dossiers(): Dossier[]', '+ contrats(): Contrat[]', '+ assures(): Assure[]', '+ contacts(): EntrepriseContact[]'] },
  { name: 'Gestionnaire', attrs: ['- id: String', '- nom: String', '- service: String'], methods: ['+ dossiersAccueil(): Dossier[]', '+ dossiersTechnique(): Dossier[]', '+ dossiersCompta(): Dossier[]'] },
  { name: 'Dossier', attrs: ['- id: String', '- numeroDossier: String', '- statut: StatutDossier', '- montantReclame: Float', '- montantValide: Float?', '- historique: JSON', '- source: SourceDossier', '- beneficiaire: String', '- typeDossier: String', '- motifRejet: String?', '- ticketModerateur: Float?', '- partPatient: Float?', '- partEntreprise: Float?'], methods: ['+ commentaires(): Commentaire[]', '+ justificatifs(): Justificatif[]', '+ avancerStatut(nouveau: StatutDossier)'] },
  { name: 'Contrat', attrs: ['- id: String', '- reference: String', '- budgetAnnuel: Float', '- budgetUtilise: Float', '- dateDebut: Date', '- dateFin: Date', '- statut: StatutContrat'], methods: ['+ appelsDeFonds(): AppelDeFonds[]', '+ tauxUtilisation(): number'] },
  { name: 'Assure', attrs: ['- id: String', '- nom: String', '- nSS: String?', '- prenom: String?', '- dateNaissance: Date?', '- sexe: String?', '- telephone: String?', '- email: String?', '- actif: boolean'], methods: ['+ dossiers(): Dossier[]'] },
  { name: 'Prestataire', attrs: ['- id: String', '- nom: String', '- type: TypePrestataire', '- telephone: String?', '- email: String?', '- nif: String?', '- rib: String?', '- actif: boolean'], methods: ['+ dossiers(): Dossier[]'] },
  { name: 'Bareme', attrs: ['- id: String', '- prestation: String', '- tauxCouverture: Float', '- plafond: Float', '- description: String?', '- active: boolean'], methods: [] },
  { name: 'Commentaire', attrs: ['- id: String', '- contenu: String', '- prive: boolean'], methods: [] },
  { name: 'AppelDeFonds', attrs: ['- id: String', '- montant: Float', '- dateAppel: Date', '- datePaiement: Date?', '- reference: String?', '- statut: StatutAppel', '- observations: String?'], methods: [] },
];

const enums = [
  { name: 'StatutDossier', values: ['RECU', 'EN_ANALYSE', 'VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE', 'REJETE'] },
  { name: 'RoleUtilisateur', values: ['ADMINISTRATEUR', 'ACCUEIL', 'TECHNIQUE', 'COMPTABILITE', 'UTILISATEUR'] },
  { name: 'TypePrestataire', values: ['HOPITAL', 'CLINIQUE', 'PHARMACIE', 'CABINET_MEDICAL', 'LABORATOIRE', 'DENTAIRE', 'OPTICIEN'] },
];

const umlRelations = [
  { from: 'Societe', to: 'Dossier', fc: '1', tc: '*', label: 'possède' },
  { from: 'Societe', to: 'Contrat', fc: '1', tc: '*', label: '' },
  { from: 'Societe', to: 'Assure', fc: '1', tc: '*', label: 'emploie' },
  { from: 'Contrat', to: 'AppelDeFonds', fc: '1', tc: '*', label: '' },
  { from: 'Dossier', to: 'Commentaire', fc: '1', tc: '*', label: '' },
  { from: 'Dossier', to: 'Assure', fc: '*', tc: '0..1', label: '' },
  { from: 'Dossier', to: 'Prestataire', fc: '*', tc: '0..1', label: '' },
  { from: 'Dossier', to: 'Gestionnaire', fc: '*', tc: '*', label: 'suivi par' },
  { from: 'Dossier', to: 'Utilisateur', fc: '*', tc: '0..1', label: 'créé par' },
  { from: 'Utilisateur', to: 'Commentaire', fc: '1', tc: '*', label: 'écrit' },
];

const uCols = 5, uColW = 290, uColGap = 50, uPadX = 40, uPadTop = 110;
const uPositions: Record<string, {x:number,y:number,w:number,h:number}> = {};
const uLayout = [
  ['Utilisateur', 'Societe', 'Dossier', 'Contrat', 'Gestionnaire'],
  ['Assure', 'Prestataire', 'Bareme', 'Commentaire', 'AppelDeFonds'],
];

for (let r = 0; r < uLayout.length; r++) {
  for (let c = 0; c < uLayout[r].length; c++) {
    const cls = umlClasses.find(cl => cl.name === uLayout[r][c]);
    if (!cls) continue;
    const h = 34 + cls.attrs.length * 20 + (cls.methods.length > 0 ? cls.methods.length * 20 + 6 : 0) + 8;
    const x = uPadX + c * (uColW + uColGap);
    const y = uPadTop + r * 380;
    uPositions[cls.name] = { x, y, w: uColW, h };
  }
}

const enumX = uPadX + uCols * (uColW + uColGap) + 30;
let enumsHtml = '';
for (let i = 0; i < enums.length; i++) {
  const en = enums[i];
  const y = uPadTop + i * 110;
  enumsHtml += `<div class="uml-enum" style="left:${enumX}px;top:${y}px;width:230px;">
    <div class="enum-title">《enum》${en.name}</div>
    <div class="enum-vals">${en.values.map(v => `<span class="enum-val">${v}</span>`).join('')}</div>
  </div>`;
}

let classBoxes = '';
for (const cls of umlClasses) {
  const pos = uPositions[cls.name];
  if (!pos) continue;
  const methodsBlock = cls.methods.length > 0
    ? `<div class="uml-div"></div><div class="uml-methods">${cls.methods.map(m => `<div class="uml-m">${m}</div>`).join('')}</div>`
    : '';
  classBoxes += `<div class="uml-class" style="left:${pos.x}px;top:${pos.y}px;width:${pos.w}px;">
    <div class="uml-name">${cls.name}</div>
    <div class="uml-div"></div>
    <div class="uml-attrs">${cls.attrs.map(a => `<div class="uml-a">${a}</div>`).join('')}</div>
    ${methodsBlock}
  </div>`;
}

let uSvg = '';
for (const rel of umlRelations) {
  const from = uPositions[rel.from];
  const to = uPositions[rel.to];
  if (!from || !to) continue;
  const fx = from.x + from.w / 2, fy = from.y + from.h / 2;
  const tx = to.x + to.w / 2, ty = to.y + to.h / 2;
  uSvg += `<line x1="${fx}" y1="${fy}" x2="${tx}" y2="${ty}" stroke="${palette.relationColor}" stroke-width="1.5"/>
    <text x="${fx+8}" y="${fy-6}" font-size="11" fill="${palette.accent}" font-weight="bold">${rel.fc}</text>
    <text x="${tx-8}" y="${ty-6}" font-size="11" fill="${palette.accent}" font-weight="bold" text-anchor="end">${rel.tc}</text>
    ${rel.label ? `<text x="${(fx+tx)/2}" y="${(fy+ty)/2-6}" font-size="9" fill="${palette.textMuted}" text-anchor="middle" font-style="italic">${rel.label}</text>` : ''}`;
}

const totalUW = enumX + 270;
const totalUH = uPadTop + 2 * 380 + 40;

const classPage = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box;}
body{background:${palette.bg};font-family:'Segoe UI',system-ui,sans-serif;}
.c{position:relative;width:${totalUW}px;height:${totalUH}px;}
.hdr{position:absolute;top:0;left:0;right:0;height:90px;background:${palette.titleBg};display:flex;flex-direction:column;justify-content:center;padding:0 40px;}
.hdr h1{color:#fff;font-size:22px;font-weight:700;}
.hdr p{color:#94A3B8;font-size:13px;margin-top:4px;}
.svg-l{position:absolute;top:90px;left:0;width:${totalUW}px;height:${totalUH-90}px;pointer-events:none;}
.uml-class{position:absolute;background:${palette.card};border:1.5px solid ${palette.entityBorder};border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);}
.uml-name{padding:8px 12px;font-size:13px;font-weight:700;color:#fff;background:${palette.primary};text-align:center;}
.uml-div{height:1px;background:${palette.border};}
.uml-attrs{padding:6px 10px;}
.uml-a{padding:2px 4px;font-size:10.5px;color:${palette.text};font-family:Consolas,Monaco,monospace;}
.uml-methods{padding:6px 10px;}
.uml-m{padding:2px 4px;font-size:10.5px;color:${palette.accent};font-family:Consolas,Monaco,monospace;}
.uml-enum{position:absolute;background:#FFFBEB;border:1.5px dashed #F59E0B;border-radius:8px;overflow:hidden;}
.enum-title{padding:6px 10px;font-size:11px;font-weight:600;color:#92400E;background:#FEF3C7;text-align:center;border-bottom:1px dashed #F59E0B;}
.enum-vals{padding:6px 10px;}
.enum-val{display:inline-block;font-size:10px;color:#92400E;font-family:Consolas,monospace;background:#FFFBEB;border:1px solid #FDE68A;border-radius:3px;padding:1px 5px;margin:2px 2px;}
</style></head><body>
<div class="c">
  <div class="hdr"><h1>Diagramme de Classe UML</h1><p>Suivi Santé — 10 classes principales · 3 énumérations · 10 associations</p></div>
  <div class="svg-l"><svg width="${totalUW}" height="${totalUH-90}" xmlns="http://www.w3.org/2000/svg">${uSvg}</svg></div>
  ${classBoxes}${enumsHtml}
</div></body></html>`;

// ─── RENDER ───────────────────────────────────────────────────────────────

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  console.log('MCD...');
  await page.setContent(mcdPage);
  await page.setViewportSize({ width: totalMcdW, height: totalMcdH });
  await page.screenshot({ path: '/home/z/my-project/download/MCD_Suivi_Sante.png' });

  console.log('MLD...');
  await page.setContent(mldPage);
  await page.setViewportSize({ width: totalMldW, height: totalMldH });
  await page.screenshot({ path: '/home/z/my-project/download/MLD_Suivi_Sante.png' });

  console.log('Diagramme de Classe...');
  await page.setContent(classPage);
  await page.setViewportSize({ width: totalUW, height: totalUH });
  await page.screenshot({ path: '/home/z/my-project/download/Diagramme_Classe_Suivi_Sante.png' });

  await browser.close();
  console.log('Done');
}
main().catch(e => { console.error(e); process.exit(1); });