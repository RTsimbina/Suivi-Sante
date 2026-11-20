/**
 * P2 — Exemples concrets : dossiers reçus en N+1 pour des soins réalisés en N.
 *
 * Règle actuelle (BIZ-2, décision métier n°1 à valider) :
 *   - la fenêtre annuelle de CONSOMMATION est ancrée sur l'année de
 *     `dateReception` (fenetreAnnuelle) ;
 *   - `dateSoins` ne sert qu'à choisir la VERSION du barème (datePrestation).
 *
 * Ce script n'utilise PAS la base : il applique la logique canonique
 * (fenetreAnnuelle + bornes de requête identiques à plafond-check.ts) pour
 * produire des exemples chiffrés.
 */

function fenetreAnnuelle(dateReference: Date): { debut: Date; fin: Date; annee: number } {
  const annee = dateReference.getFullYear();
  return {
    debut: new Date(annee, 0, 1),
    fin: new Date(annee, 11, 31, 23, 59, 59),
    annee,
  };
}

const STATUTS_CONSOMMATION = ['EN_ANALYSE', 'VALIDE', 'EN_COMPTABILITE', 'EN_PAIEMENT', 'PAYE'];

interface DossierDemo {
  numero: string;
  dateSoins: Date;
  dateReception: Date;
  type: string;
  montant: number;
}

/** Renvoie la consommation attribuée à chaque fenêtre annuelle. */
function attribuer(dossiers: DossierDemo[]) {
  const parAnnee = new Map<number, { dossiers: string[]; total: number }>();
  for (const d of dossiers) {
    const fen = fenetreAnnuelle(d.dateReception);
    const sac = parAnnee.get(fen.annee) ?? { dossiers: [], total: 0 };
    sac.dossiers.push(`${d.numero} (soins ${d.dateSoins.getFullYear()}, ${d.montant.toLocaleString('fr-FR')} Ar)`);
    sac.total += d.montant;
    parAnnee.set(fen.annee, sac);
  }
  return parAnnee;
}

const dossiers: DossierDemo[] = [
  { numero: 'D-001', dateSoins: new Date(2026, 2, 10), dateReception: new Date(2026, 2, 20), type: 'CONSULTATION', montant: 40_000 },
  { numero: 'D-002', dateSoins: new Date(2026, 11, 28), dateReception: new Date(2027, 0, 5), type: 'CONSULTATION', montant: 80_000 },
  { numero: 'D-003', dateSoins: new Date(2026, 11, 30), dateReception: new Date(2027, 0, 8), type: 'HOSPITALISATION', montant: 120_000 },
  { numero: 'D-004', dateSoins: new Date(2027, 0, 12), dateReception: new Date(2027, 0, 15), type: 'CONSULTATION', montant: 30_000 },
];

const PLAFOND = 100_000;

console.log('═══ Exemple : plafond CONSULTATION = 100 000 Ar/an — soins en N, réception en N+1 ═══\n');
for (const d of dossiers) {
  const fen = fenetreAnnuelle(d.dateReception);
  console.log(`${d.numero} — soins ${d.dateSoins.toISOString().slice(0, 10)} | réception ${d.dateReception.toISOString().slice(0, 10)} → consommation imputée sur l'exercice ${fen.annee} (soins ${d.dateSoins.getFullYear()})`);
}

console.log('\n═══ Attribution par fenêtre annuelle (dossier D-002 exclu ? NON : imputé 2027) ═══');
const attribution = attribuer(dossiers);
for (const [annee, sac] of [...attribution.entries()].sort()) {
  console.log(`\nExercice ${annee} :`);
  sac.dossiers.forEach(l => console.log(`  • ${l}`));
  console.log(`  TOTAL consommé : ${sac.total.toLocaleString('fr-FR')} Ar / plafond 100 000 Ar`);
}

console.log('\n═══ Lecture métier ═══');
console.log(`• D-002 : soins 2026-12-28, réception 2027-01-05 → compte sur 2027 (PAS sur 2026).
  Le plafond 2026 de l'assuré n'est PAS consommé par ces soins de fin décembre 2026 :
  40 000 Ar seulement (D-001) restent imputés à 2026, reliquat 2026 = 60 000 Ar.
• D-003 (hospitalisation de décembre 2026 reçue le 08/01/2027) : imputée à 2027.
• Conséquence plafonds : les soins de fin d'année N peuvent « glisser » en N+1 ;
  l'exercice N reste ouvert aux dossiers reçus jusqu'au 31/12/N.
• Contrats/appels de fonds : le budget exercice suit l'année de réception,
  pas celle des soins — un décalage de charge entre exercices est possible.
• Remboursements réceptionnés après la fin d'année : conservés dans leur
  exercice de réception (aucun reproportionnement automatique).`);
