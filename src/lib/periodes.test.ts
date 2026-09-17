import { describe, it, expect } from 'vitest';
import {
  FUSEAU_PLATEFORME,
  calculePlage,
  libelleOptionPeriode,
  libellePeriode,
  libellePlage,
  getOptionsPeriode,
  getOptionsAnnee,
  nbPeriodesParAnnee,
  zonedVersUtc,
  decalageFuseauMs,
  anneeCouranteFuseau,
  versDateISO,
  formatDateFrFuseau,
  partiesLocales,
  parserDateISO,
  selectionVersParams,
  plageDepuisParams,
  filtreDateChamp,
  type SelectionPeriode,
} from './periodes';

/** Raccourci : plage → [debutISO, finISO] en UTC pour les assertions. */
function bornesUTC(s: SelectionPeriode): [string, string] {
  const p = calculePlage(s);
  expect(p).not.toBeNull();
  return [p!.debut.toISOString(), p!.fin.toISOString()];
}

describe('fuseau horaire de la plateforme', () => {
  it('utilise Indian/Antananarivo (UTC+3, sans heure d\'été)', () => {
    expect(FUSEAU_PLATEFORME).toBe('Indian/Antananarivo');
    // 1er janvier 2026 00:00 à Antananarivo = 2025-12-31 21:00 UTC
    const t = zonedVersUtc(2026, 1, 1);
    expect(t.toISOString()).toBe('2025-12-31T21:00:00.000Z');
  });

  it('décalage constant de +3h (pas de changement d\'heure)', () => {
    const ete = decalageFuseauMs(new Date('2026-01-15T00:00:00Z'));
    const hiver = decalageFuseauMs(new Date('2026-07-15T00:00:00Z'));
    expect(ete).toBe(3 * 60 * 60 * 1000);
    expect(hiver).toBe(3 * 60 * 60 * 1000);
  });

  it('zonedVersUtc gère les débordements de jour (32 mai → 1er juin)', () => {
    const t = zonedVersUtc(2026, 5, 32);
    expect(t.toISOString()).toBe('2026-05-31T21:00:00.000Z');
  });

  it('anneeCouranteFuseau retourne l\'année en cours dans le fuseau plateforme', () => {
    const annee = anneeCouranteFuseau();
    expect(Number.isInteger(annee)).toBe(true);
    expect(annee).toBeGreaterThanOrEqual(2024);
    expect(annee).toBeLessThanOrEqual(2100);
  });

  it('versDateISO / formatDateFrFuseau formattent dans le fuseau plateforme', () => {
    const instant = new Date('2025-12-31T21:00:00.000Z'); // 01/01/2026 à Antananarivo
    expect(versDateISO(instant)).toBe('2026-01-01');
    expect(formatDateFrFuseau(instant)).toBe('01/01/2026');
  });

  it('parserDateISO rejette les entrées invalides', () => {
    expect(parserDateISO('2026-02-30')).toBeNull();
    expect(parserDateISO('2026-13-01')).toBeNull();
    expect(parserDateISO('01/03/2026')).toBeNull();
    expect(parserDateISO('')).toBeNull();
    expect(parserDateISO(undefined)).toBeNull();
    expect(parserDateISO('2026-03-01')).toEqual({ annee: 2026, mois: 3, jour: 1 });
  });
});

describe('nbPeriodesParAnnee et libellés', () => {
  it('nombre de périodes par année', () => {
    expect(nbPeriodesParAnnee('MENSUEL')).toBe(12);
    expect(nbPeriodesParAnnee('BIMESTRIEL')).toBe(6);
    expect(nbPeriodesParAnnee('TRIMESTRIEL')).toBe(4);
    expect(nbPeriodesParAnnee('SEMESTRIEL')).toBe(2);
    expect(nbPeriodesParAnnee('ANNUEL')).toBe(1);
    expect(nbPeriodesParAnnee('TOUTES')).toBe(0);
  });

  it('libellés français des périodes', () => {
    expect(libelleOptionPeriode('MENSUEL', 2026, 1)).toBe('Janvier 2026');
    expect(libelleOptionPeriode('MENSUEL', 2026, 12)).toBe('Décembre 2026');
    expect(libelleOptionPeriode('BIMESTRIEL', 2026, 1)).toBe('Janvier – Février 2026');
    expect(libelleOptionPeriode('BIMESTRIEL', 2026, 6)).toBe('Novembre – Décembre 2026');
    expect(libelleOptionPeriode('TRIMESTRIEL', 2026, 1)).toBe('T1 2026');
    expect(libelleOptionPeriode('TRIMESTRIEL', 2026, 4)).toBe('T4 2026');
    expect(libelleOptionPeriode('SEMESTRIEL', 2026, 2)).toBe('S2 2026');
    expect(libelleOptionPeriode('ANNUEL', 2026, 1)).toBe('Année 2026');
  });

  it('options de période et d\'années', () => {
    expect(getOptionsPeriode('MENSUEL', 2026)).toHaveLength(12);
    expect(getOptionsPeriode('BIMESTRIEL', 2026)).toHaveLength(6);
    expect(getOptionsPeriode('TRIMESTRIEL', 2026)).toHaveLength(4);
    expect(getOptionsPeriode('SEMESTRIEL', 2026)).toHaveLength(2);
    expect(getOptionsPeriode('ANNUEL', 2026)).toHaveLength(1);
    expect(getOptionsPeriode('TOUTES', 2026)).toHaveLength(0);

    const annees = getOptionsAnnee();
    expect(annees.length).toBeGreaterThanOrEqual(2);
    // Triée de la plus récente à la plus ancienne
    expect(Number(annees[0].value)).toBeGreaterThan(Number(annees[annees.length - 1].value));
  });
});

describe('calculePlage — bornes UTC (fin exclusive)', () => {
  it('MENSUEL : Janvier 2026', () => {
    const [debut, fin] = bornesUTC({ mode: 'MENSUEL', annee: 2026, index: 1 });
    expect(debut).toBe('2025-12-31T21:00:00.000Z'); // 01/01 00:00 locale
    expect(fin).toBe('2026-01-31T21:00:00.000Z');   // 01/02 00:00 locale
  });

  it('MENSUEL : Décembre 2026 (passage à l\'année suivante)', () => {
    const [debut, fin] = bornesUTC({ mode: 'MENSUEL', annee: 2026, index: 12 });
    expect(debut).toBe('2026-11-30T21:00:00.000Z');
    expect(fin).toBe('2026-12-31T21:00:00.000Z');
  });

  it('BIMESTRIEL : Janvier–Février 2026', () => {
    const [debut, fin] = bornesUTC({ mode: 'BIMESTRIEL', annee: 2026, index: 1 });
    expect(debut).toBe('2025-12-31T21:00:00.000Z');
    expect(fin).toBe('2026-02-28T21:00:00.000Z'); // 01/03 00:00 locale
  });

  it('TRIMESTRIEL : T1 et T4 2026', () => {
    const [d1, f1] = bornesUTC({ mode: 'TRIMESTRIEL', annee: 2026, index: 1 });
    expect(d1).toBe('2025-12-31T21:00:00.000Z');
    expect(f1).toBe('2026-03-31T21:00:00.000Z');
    const [d4, f4] = bornesUTC({ mode: 'TRIMESTRIEL', annee: 2026, index: 4 });
    expect(d4).toBe('2026-09-30T21:00:00.000Z');
    expect(f4).toBe('2026-12-31T21:00:00.000Z');
  });

  it('SEMESTRIEL : S2 2026', () => {
    const [debut, fin] = bornesUTC({ mode: 'SEMESTRIEL', annee: 2026, index: 2 });
    expect(debut).toBe('2026-06-30T21:00:00.000Z');
    expect(fin).toBe('2026-12-31T21:00:00.000Z');
  });

  it('ANNUEL : 2026', () => {
    const [debut, fin] = bornesUTC({ mode: 'ANNUEL', annee: 2026 });
    expect(debut).toBe('2025-12-31T21:00:00.000Z');
    expect(fin).toBe('2026-12-31T21:00:00.000Z');
  });

  it('PERSONNALISE : du 01/03/2026 au 31/05/2026 (fin inclusive)', () => {
    const [debut, fin] = bornesUTC({ mode: 'PERSONNALISE', annee: 2026, debut: '2026-03-01', fin: '2026-05-31' });
    expect(debut).toBe('2026-02-28T21:00:00.000Z');
    // Fin exclusive = 01/06 00:00 locale ⇒ couvre bien toute la journée du 31/05
    expect(fin).toBe('2026-05-31T21:00:00.000Z');
  });

  it('retourne null pour les sélections non filtrantes ou invalides', () => {
    expect(calculePlage(null)).toBeNull();
    expect(calculePlage(undefined)).toBeNull();
    expect(calculePlage({ mode: 'TOUTES', annee: 2026 })).toBeNull();
    expect(calculePlage({ mode: 'MENSUEL', annee: 2026 })).toBeNull(); // index manquant
    expect(calculePlage({ mode: 'MENSUEL', annee: 2026, index: 13 })).toBeNull();
    expect(calculePlage({ mode: 'MENSUEL', annee: 2026, index: 0 })).toBeNull();
    expect(calculePlage({ mode: 'TRIMESTRIEL', annee: 2026, index: 5 })).toBeNull();
    expect(calculePlage({ mode: 'ANNUEL', annee: NaN })).toBeNull();
    expect(calculePlage({ mode: 'PERSONNALISE', annee: 2026, debut: '2026-03-01' })).toBeNull(); // fin manquante
    expect(calculePlage({ mode: 'PERSONNALISE', annee: 2026, debut: '2026-05-31', fin: '2026-03-01' })).toBeNull(); // début > fin
    expect(calculePlage({ mode: 'PERSONNALISE', annee: 2026, debut: '31/03/2026', fin: '2026-05-31' })).toBeNull(); // format invalide
  });
});

describe('libellés de sélection et de plage', () => {
  it('libellePeriode', () => {
    expect(libellePeriode({ mode: 'TOUTES', annee: 2026 })).toBe('Toutes les périodes');
    expect(libellePeriode(null)).toBe('Toutes les périodes');
    expect(libellePeriode({ mode: 'MENSUEL', annee: 2026, index: 1 })).toBe('Janvier 2026');
    expect(libellePeriode({ mode: 'TRIMESTRIEL', annee: 2026, index: 3 })).toBe('T3 2026');
    expect(libellePeriode({ mode: 'ANNUEL', annee: 2026 })).toBe('Année 2026');
    expect(libellePeriode({ mode: 'PERSONNALISE', annee: 2026, debut: '2026-03-01', fin: '2026-05-31' }))
      .toBe('du 01/03/2026 au 31/05/2026');
    expect(libellePeriode({ mode: 'PERSONNALISE', annee: 2026, debut: '2026-03-01' }))
      .toBe('Période personnalisée (incomplète)');
  });

  it('libellePlage affiche les bornes inclusives en français', () => {
    const plage = calculePlage({ mode: 'MENSUEL', annee: 2026, index: 1 });
    expect(libellePlage(plage)).toBe('01/01/2026 → 31/01/2026');
    expect(libellePlage(null)).toBe('');
  });
});

describe('sérialisation URL (client → serveur)', () => {
  it('selectionVersParams produit les paramètres attendus', () => {
    expect(selectionVersParams({ mode: 'TOUTES', annee: 2026 }).toString()).toBe('');
    expect(selectionVersParams(null).toString()).toBe('');
    expect(selectionVersParams({ mode: 'MENSUEL', annee: 2026, index: 3 }).toString())
      .toBe('periodeMode=MENSUEL&periodeAnnee=2026&periodeIndex=3');
    expect(selectionVersParams({ mode: 'ANNUEL', annee: 2026 }).toString())
      .toBe('periodeMode=ANNUEL&periodeAnnee=2026'); // pas d'index pour l'annuel
    expect(selectionVersParams({ mode: 'PERSONNALISE', annee: 2026, debut: '2026-03-01', fin: '2026-05-31' }).toString())
      .toBe('periodeMode=PERSONNALISE&periodeDebut=2026-03-01&periodeFin=2026-05-31');
  });

  it('aller-retour sélection → params → plage pour chaque periodicité', () => {
    const selections: SelectionPeriode[] = [
      { mode: 'MENSUEL', annee: 2026, index: 9 },
      { mode: 'BIMESTRIEL', annee: 2026, index: 2 },
      { mode: 'TRIMESTRIEL', annee: 2026, index: 3 },
      { mode: 'SEMESTRIEL', annee: 2026, index: 1 },
      { mode: 'ANNUEL', annee: 2026 },
      { mode: 'PERSONNALISE', annee: 2026, debut: '2026-01-01', fin: '2026-09-30' },
    ];
    for (const s of selections) {
      const params = selectionVersParams(s);
      const direct = calculePlage(s);
      const viaParams = plageDepuisParams(params);
      expect(viaParams).not.toBeNull();
      expect(viaParams!.debut.getTime()).toBe(direct!.debut.getTime());
      expect(viaParams!.fin.getTime()).toBe(direct!.fin.getTime());
    }
  });

  it('plageDepuisParams retourne null sans paramètres ou avec des valeurs invalides', () => {
    expect(plageDepuisParams(new URLSearchParams())).toBeNull();
    expect(plageDepuisParams(new URLSearchParams('periodeMode=TOUTES'))).toBeNull();
    expect(plageDepuisParams(new URLSearchParams('periodeMode=HEBDOMADAIRE&periodeAnnee=2026'))).toBeNull();
    expect(plageDepuisParams(new URLSearchParams('periodeMode=MENSUEL&periodeAnnee=abc&periodeIndex=2'))).not.toBeNull(); // tolérant : année invalide ⇒ année courante
    expect(plageDepuisParams(new URLSearchParams('periodeMode=PERSONNALISE&periodeDebut=2026-03-01'))).toBeNull();
  });

  it('plageDepuisParams est tolérant : index manquant ⇒ 1, année manquante ⇒ année courante', () => {
    const plage = plageDepuisParams(new URLSearchParams('periodeMode=ANNUEL'));
    expect(plage).not.toBeNull();
    const dureeJours = (plage!.fin.getTime() - plage!.debut.getTime()) / (24 * 3600 * 1000);
    expect([365, 366]).toContain(dureeJours);
  });
});

describe('filtreDateChamp (builder Prisma)', () => {
  it('retourne un objet vide sans plage', () => {
    expect(filtreDateChamp('dateReception', null)).toEqual({});
  });

  it('construit { champ: { gte, lt } } avec les bornes de la plage', () => {
    const plage = calculePlage({ mode: 'MENSUEL', annee: 2026, index: 1 })!;
    const filtre = filtreDateChamp('dateReception', plage);
    expect(Object.keys(filtre)).toEqual(['dateReception']);
    expect(filtre.dateReception.gte.toISOString()).toBe('2025-12-31T21:00:00.000Z');
    expect(filtre.dateReception.lt.toISOString()).toBe('2026-01-31T21:00:00.000Z');
  });
});

describe('invariant bucketing SQL ↔ zéro-remplissage', () => {
  /**
   * Miroir JS du SQL de getMonthlyVolume :
   *   TO_CHAR(("dateReception" AT TIME ZONE 'UTC') AT TIME ZONE 'Indian/Antananarivo', 'YYYY-MM')
   * La colonne stocke des instants UTC naïfs ; partiesLocales(d + 0ms) effectue la même
   * conversion (UTC → heure murale Antananarivo). Tout instant DANS la plage doit tomber
   * sur un mois zéro-rempli par le graphique (sinon le total du graphique ≠ total KPI).
   */
  it('chaque instant de la plage tombe dans un mois zéro-rempli (plusieurs periodicités)', () => {
    const selections: SelectionPeriode[] = [
      { mode: 'MENSUEL', annee: 2026, index: 1 },           // Janvier (chevauche décembre 2025 en UTC)
      { mode: 'MENSUEL', annee: 2026, index: 12 },          // Décembre (chevauche janvier 2027 en UTC)
      { mode: 'BIMESTRIEL', annee: 2026, index: 6 },        // Nov.–Déc.
      { mode: 'TRIMESTRIEL', annee: 2026, index: 4 },       // T4
      { mode: 'ANNUEL', annee: 2026 },                      // Année entière
      { mode: 'PERSONNALISE', annee: 2026, debut: '2026-01-01', fin: '2026-09-30' },
    ];

    for (const s of selections) {
      const plage = calculePlage(s)!;
      // Zéro-remplissage identique à kpi-queries.getMonthlyVolume
      const moisCouverts = new Set<string>();
      const dernier = partiesLocales(new Date(plage.fin.getTime() - 1));
      let cy = partiesLocales(plage.debut).annee;
      let cm = partiesLocales(plage.debut).mois;
      while (cy < dernier.annee || (cy === dernier.annee && cm <= dernier.mois)) {
        moisCouverts.add(`${cy}-${String(cm).padStart(2, '0')}`);
        cm++;
        if (cm > 12) { cm = 1; cy++; }
      }

      // Échantillonnage : chaque heure de la plage (plus les bornes exactes)
      const pas = 3600_000;
      for (let t = plage.debut.getTime(); t < plage.fin.getTime(); t += pas) {
        const p = partiesLocales(new Date(t));
        const cle = `${p.annee}-${String(p.mois).padStart(2, '0')}`;
        expect(moisCouverts.has(cle)).toBe(true);
      }
      const derniereHeure = new Date(plage.fin.getTime() - 1);
      const pFin = partiesLocales(derniereHeure);
      expect(moisCouverts.has(`${pFin.annee}-${String(pFin.mois).padStart(2, '0')}`)).toBe(true);
    }
  });

  it('les instants hors plage tombent hors des mois zéro-remplis (cas limite janvier)', () => {
    // Janvier 2026 en local = [31/12 21:00Z, 31/01 21:00Z) :
    // un dossier à 20:00Z le 31/12 (hors plage) doit être bucketé « 2025-12 »
    const plage = calculePlage({ mode: 'MENSUEL', annee: 2026, index: 1 })!;
    const avant = new Date(plage.debut.getTime() - 3600_000); // 31/12 20:00Z
    expect(partiesLocales(avant)).toEqual({ annee: 2025, mois: 12, jour: 31 });
    // et un dossier à 22:00Z le 31/12 (dans la plage) doit être bucketé « 2026-01 »
    const dedans = new Date(plage.debut.getTime() + 3600_000); // 31/12 22:00Z
    expect(partiesLocales(dedans).mois).toBe(1);
    expect(partiesLocales(dedans).annee).toBe(2026);
  });
});
