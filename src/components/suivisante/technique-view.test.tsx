// @vitest-environment jsdom
/**
 * Tests de caractérisation de la vue Technique — filet de sécurité du refactoring
 * de découpage (Vague 3). Ils verrouillent le comportement observable AVANT et
 * APRÈS le découpage en sous-composants : rendu KPI, filtre service, 4 onglets,
 * consultation des barèmes, calcul du ticket modérateur, import ISA, exclusions.
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TechniqueView from './technique-view';

// ─── Stubs jsdom requis par Radix Select et Recharts ─────────────────────────
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
});

// ─── Données de test ──────────────────────────────────────────────────────────
const kpis = {
  technique: {
    totalAnalyses: 10,
    totalValides: 6,
    totalRejetes: 2,
    delaiMoyenAnalyse: 3,
    montantTotalValide: 1_500_000,
    enCours: 2,
  },
  productivite: [
    { gestionnaireNom: 'Rakoto', service: 'TECHNIQUE', nbDossiers: 6, montantTraite: 900_000, tempsMoyenTraitement: 2 },
    { gestionnaireNom: 'Rabe', service: 'ACCUEIL', nbDossiers: 4, montantTraite: 400_000, tempsMoyenTraitement: 1 },
  ],
};

const societes = [
  {
    id: 's1',
    nom: 'CNAPS',
    nbDossiers: 3,
    nbBaremes: 2,
    baremes: [
      { prestation: 'HOSPITALISATION', tauxCouverture: 80, plafond: 100_000, description: 'chambre privée' },
      { prestation: 'CONSULTATION', tauxCouverture: 70, plafond: 50_000, description: '' },
    ],
  },
  {
    id: 's2',
    nom: 'MNS',
    nbDossiers: 1,
    nbBaremes: 1,
    baremes: [{ prestation: 'PHARMACIE', tauxCouverture: 100, plafond: 30_000, description: '' }],
  },
];

const baremesS1 = societes[0].baremes;

const exclusions = [
  {
    id: 'e1', numeroDossier: 'DOS-2024-001', beneficiaire: 'Rasoa A.', societeNom: 'CNAPS',
    typeDossier: 'HOSPITALISATION', montantReclame: 200_000, montantValide: 80_000,
    montantTheorique: 80_000, plafondApplique: 100_000, tauxCouverture: 80,
    ticketModerateur: 120_000, statut: 'VALIDE', motifRejet: null,
    typeEcart: 'depassement' as const, ecart: 120_000, pourcentageCouvert: 40,
  },
  {
    id: 'e2', numeroDossier: 'DOS-2024-002', beneficiaire: 'Hery B.', societeNom: 'MNS',
    typeDossier: 'OPTIQUE', montantReclame: 150_000, montantValide: null,
    montantTheorique: 0, plafondApplique: null, tauxCouverture: null,
    ticketModerateur: null, statut: 'REJETE', motifRejet: 'Prestation exclue du barème',
    typeEcart: 'exclusion' as const, ecart: 150_000, pourcentageCouvert: 0,
  },
];

/** fetch mocké : endpoints technique configurables, sinon échec explicite */
function stubFetch(opts: { societes?: unknown[]; exclusions?: unknown[]; baremesS1?: unknown[] } = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/technique/societes?withBaremes=true')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ societes: opts.societes ?? societes }) });
    }
    if (url.includes('/api/technique/societes/s1')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ societe: { baremes: opts.baremesS1 ?? baremesS1 } }) });
    }
    if (url.includes('/api/technique/exclusions')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ exclusions: opts.exclusions ?? exclusions }) });
    }
    return Promise.reject(new Error('fetch non mocké : ' + url));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('TechniqueView — caractérisation', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    // ResizeObserver : requis par Recharts ResponsiveContainer, absent de jsdom
    // (reposé après chaque unstubAllGlobals).
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  });

  it('affiche un squelette pendant le chargement (kpis null)', () => {
    stubFetch();
    const { container } = render(<TechniqueView kpis={null} loading />);
    expect(container.querySelectorAll('[data-slot="skeleton"], .animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('affiche les 6 KPI techniques et les 4 onglets', async () => {
    stubFetch();
    render(<TechniqueView kpis={kpis} loading={false} />);

    // KPI cards (en-tête toujours visible)
    expect(screen.getByText('Dossiers analysés')).toBeInTheDocument();
    expect(screen.getByText('Validés')).toBeInTheDocument();
    expect(screen.getByText('Montant validé')).toBeInTheDocument();
    // formatMontantCourt(1_500_000) = "1.5 M Ar" (toFixed utilise le point)
    expect(screen.getByText(/1\.5\s?M\s?Ar/)).toBeInTheDocument();

    // Onglets
    expect(screen.getByRole('tab', { name: /Sociétés/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Calcul/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Import/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Exclusions/ })).toBeInTheDocument();
  });

  it('filtre la performance sur le service TECHNIQUE uniquement', async () => {
    stubFetch();
    render(<TechniqueView kpis={kpis} loading={false} />);
    expect(screen.getByText('Rakoto')).toBeInTheDocument();
    expect(screen.queryByText('Rabe')).not.toBeInTheDocument();
    // "Aucune donnée" absent car 1 gestionnaire technique
    expect(screen.queryByText('Aucune donnée de performance disponible.')).not.toBeInTheDocument();
  });

  it('onglet Sociétés : liste les sociétés et permet la consultation des barèmes', async () => {
    const user = userEvent.setup();
    stubFetch();
    render(<TechniqueView kpis={kpis} loading={false} />);

    // Table des sociétés (onglet par défaut)
    expect(await screen.findByText('CNAPS')).toBeInTheDocument();
    expect(screen.getByText('MNS')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ajouter une société/ })).toBeInTheDocument();

    // Sélectionner une société dans le filtre "Barèmes par société"
    await user.click(screen.getByLabelText('Société'));
    const option = await screen.findByRole('option', { name: /CNAPS/ });
    await user.click(option);

    // Les barèmes rechargés depuis l'API s'affichent
    expect(await screen.findByText(/2 barème\(s\) configuré\(s\) pour/)).toBeInTheDocument();
    expect(screen.getByText('Hospitalisation')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('chambre privée')).toBeInTheDocument();
  });

  it('onglet Calcul : calcule le ticket modérateur (taux 80 %, plafond 100 000)', async () => {
    const user = userEvent.setup();
    stubFetch();
    render(<TechniqueView kpis={kpis} loading={false} />);

    await user.click(screen.getByRole('tab', { name: /Calcul/ }));

    // Sélection société
    await user.click(screen.getByLabelText('Société'));
    await user.click(await screen.findByRole('option', { name: 'CNAPS' }));

    // Sélection prestation
    await user.click(screen.getByLabelText('Type de prestation'));
    await user.click(await screen.findByRole('option', { name: 'Hospitalisation' }));

    // Montant réclamé
    await user.type(screen.getByLabelText('Montant réclamé (Ar)'), '100000');

    await user.click(screen.getByRole('button', { name: /Calculer/ }));

    // Résultat : couvert = min(100000, 100000) ; remboursé = 80 000 ; TM = 20 000
    // (les montants apparaissent 2× : bloc résultat + phrase d'explication)
    expect(screen.getByText('Résultat du calcul')).toBeInTheDocument();
    expect(screen.getByText(/80\s?%\s?—\s?Plafond\s?:/)).toBeInTheDocument();
    expect(screen.getByText(/Montant remboursé/)).toBeInTheDocument();
    expect(screen.getAllByText(/80\s?000\s?Ar/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/20\s?000\s?Ar/).length).toBeGreaterThanOrEqual(1);
    // Explication du calcul présente
    expect(screen.getByText(/dans la limite du plafond/)).toBeInTheDocument();
  });

  it('onglet Import : affiche la dropzone et le bouton désactivé sans fichier', async () => {
    const user = userEvent.setup();
    stubFetch();
    render(<TechniqueView kpis={kpis} loading={false} />);

    await user.click(screen.getByRole('tab', { name: /Import/ }));
    expect(screen.getByText(/Glissez-déposez votre fichier/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Importer le fichier/ })).toBeDisabled();
  });

  it('onglet Exclusions : affiche les KPI d\u2019écarts et le tableau des dossiers', async () => {
    const user = userEvent.setup();
    stubFetch();
    render(<TechniqueView kpis={kpis} loading={false} />);

    await user.click(screen.getByRole('tab', { name: /Exclusions/ }));

    // KPI d'analyse des écarts — "Dépassements" apparaît 2× (pill filtre + KPI card)
    expect((await screen.findAllByText('Dépassements')).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Exclusions totales')).toBeInTheDocument();
    expect(screen.getByText('Montant non couvert')).toBeInTheDocument();

    // Tableau filtré : les 2 dossiers sont visibles
    expect(screen.getByText('DOS-2024-001')).toBeInTheDocument();
    expect(screen.getByText('DOS-2024-002')).toBeInTheDocument();
    // Badges type d'écart (présents dans la table ET la légende du footer)
    expect(screen.getAllByText('Dépassement').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Exclusion').length).toBeGreaterThanOrEqual(2);
    // Motif de rejet tronqué à 30 caractères avec tooltip
    expect(screen.getByText(/Prestation exclue du bar/)).toBeInTheDocument();
  });

  it('filtre les exclusions par type via les pills', async () => {
    const user = userEvent.setup();
    stubFetch();
    render(<TechniqueView kpis={kpis} loading={false} />);

    await user.click(screen.getByRole('tab', { name: /Exclusions/ }));
    await screen.findByText('DOS-2024-001');

    // Pill "Rejetés" : aucun dossier rejete dans le jeu de données
    await user.click(screen.getByRole('button', { name: /Rejetés/ }));
    expect(screen.queryByText('DOS-2024-001')).not.toBeInTheDocument();
    expect(screen.getByText('Aucune exclusion ou dépassement détecté')).toBeInTheDocument();

    // Pill "Tous" : les dossiers reviennent
    await user.click(screen.getByRole('button', { name: /Tous/ }));
    expect(await screen.findByText('DOS-2024-001')).toBeInTheDocument();
  });
});
