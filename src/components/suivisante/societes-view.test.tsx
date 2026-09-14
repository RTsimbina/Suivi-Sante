// @vitest-environment jsdom
/**
 * Tests de caractérisation de la vue Sociétés — filet de sécurité du refactoring
 * de découpage (Vague 3, monolithe 2/4). Ils verrouillent le comportement
 * observable AVANT et APRÈS le découpage : stats, liste maître, auto-sélection,
 * détail (contrats, onglets Barèmes/Assurés/Prestataires/Contacts), recherche.
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SocietesView from './societes-view';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// ─── Données de test ──────────────────────────────────────────────────────────
const societes = [
  {
    id: 's1', nom: 'CNAPS', adresse: 'Antananarivo', telephone: '034 11 111 11',
    email: 'contact@cnaps.mg', nif: 'NIF001', contactPrincipal: 'Rakoto', actif: true,
    createdAt: '2024-01-15T00:00:00Z',
    _count: { dossiers: 12, contrats: 1, assures: 8, baremes: 3 },
  },
  {
    id: 's2', nom: 'MNS', actif: false,
    createdAt: '2024-02-01T00:00:00Z',
    _count: { dossiers: 4, contrats: 0, assures: 3, baremes: 1 },
  },
];

const detailsS1 = {
  baremes: [
    { id: 'b1', prestation: 'CONSULTATION', tauxCouverture: 70, plafond: 50_000, description: '', active: true },
    { id: 'b2', prestation: 'HOSPITALISATION', tauxCouverture: 90, plafond: 1_000_000, description: '', active: true },
    { id: 'b3', prestation: 'PHARMACIE', tauxCouverture: 100, plafond: 30_000, description: '', active: false },
    { id: 'b4', prestation: 'OPTIQUE', tauxCouverture: 50, plafond: 100_000, description: '', active: true },
  ],
  assures: [
    {
      id: 'a1', nom: 'Rasoa', prenom: 'A.', nSS: '123', matricule: 'M-001',
      typeBeneficiaire: 'ASSURE', actif: true, _count: { dossiers: 3 },
    },
  ],
  prestataires: [
    { id: 'p1', lienId: 'l1', nom: 'Clinique A', type: 'CLINIQUE', actifGlobal: true, actifSociete: true, nbDossiers: 5, montantTotal: 250_000 },
    { id: 'p2', lienId: 'l2', nom: 'Optique B', type: 'OPTICIEN', actifGlobal: true, actifSociete: false, nbDossiers: 1, montantTotal: 40_000 },
  ],
};

const contactsS1 = {
  contacts: [
    {
      id: 'c1', societeId: 's1', nom: 'Rakoto', prenom: 'Jean', fonction: 'DRH',
      telephone: '034 22 222 22', email: 'drh@cnaps.mg', actif: true,
      createdAt: '2024-03-01T00:00:00Z',
    },
  ],
};

const contrats = [
  {
    societe: { id: 's1' }, reference: 'CTR-2024-001', budgetAnnuel: 10_000_000,
    budgetUtilise: 4_000_000, statut: 'ACTIF', dateFin: '2024-12-31',
  },
];

function stubFetch() {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    // ⚠️ Les patterns les plus spécifiques d'abord : /details doit passer
    // avant le pattern générique de la liste.
    if (url.includes('/api/technique/societes/s1/details')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(detailsS1) });
    }
    if (url.startsWith('/api/entreprise-contacts')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(contactsS1) });
    }
    if (url.startsWith('/api/contrats')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(contrats) });
    }
    if (url.startsWith('/api/technique/societes')) {
      // Respecte le paramètre search (filtre côté "API")
      const q = new URL(url, 'http://localhost').searchParams.get('search') || '';
      const list = q
        ? societes.filter((s) => s.nom.toLowerCase().includes(q.toLowerCase()))
        : societes;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(list) });
    }
    return Promise.reject(new Error('fetch non mocké : ' + url));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('SocietesView — caractérisation', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('affiche les 5 statistiques agrégées', async () => {
    stubFetch();
    render(<SocietesView userRole="ADMINISTRATEUR" />);

    expect(await screen.findByText('Sociétés (1 actives)')).toBeInTheDocument();
    expect(screen.getByText('Assurés totaux')).toBeInTheDocument();
    expect(screen.getByText('Barèmes configurés')).toBeInTheDocument();
    expect(screen.getByText('Dossiers totaux')).toBeInTheDocument();
    expect(screen.getByText('Contrats actifs')).toBeInTheDocument();

    // Totaux agrégés : 8+3 assurés, 12+4 dossiers (valeurs uniques dans la page)
    expect(screen.getByText('11')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
  });

  it('liste les sociétés et sélectionne automatiquement la première', async () => {
    stubFetch();
    render(<SocietesView userRole="ADMINISTRATEUR" />);

    // CNAPS apparaît dans la liste ET l'en-tête du détail (auto-sélection)
    expect((await screen.findAllByText('CNAPS')).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('MNS')).toBeInTheDocument();

    // Détail auto-chargé pour CNAPS
    expect(await screen.findByText('NIF: NIF001')).toBeInTheDocument();
    expect(screen.getByText('contact@cnaps.mg')).toBeInTheDocument();
    // Badge "Active"
    expect(screen.getByText(/Active/)).toBeInTheDocument();
    // Bouton Rapport PDF dans l'en-tête du détail
    expect(screen.getByRole('button', { name: /Rapport PDF/ })).toBeInTheDocument();
  });

  it('onglet Barèmes (défaut) : affiche les barèmes de la société', async () => {
    stubFetch();
    render(<SocietesView userRole="ADMINISTRATEUR" />);

    expect(await screen.findByText('Consultation')).toBeInTheDocument();
    expect(screen.getByText('Hospitalisation')).toBeInTheDocument();
    expect(screen.getByText('70%')).toBeInTheDocument();
    expect(screen.getByText(/50\s?000\s?Ar/)).toBeInTheDocument();
    expect(screen.getByText(/1\s?000\s?000\s?Ar/)).toBeInTheDocument();
  });

  it('affiche les contrats et soldes de la société sélectionnée', async () => {
    stubFetch();
    render(<SocietesView userRole="ADMINISTRATEUR" />);

    expect(await screen.findByText('Contrats et soldes')).toBeInTheDocument();
    expect(screen.getByText('CTR-2024-001')).toBeInTheDocument();
    // Solde = 10 000 000 - 4 000 000
    expect(screen.getByText(/6\s?000\s?000\s?Ar/)).toBeInTheDocument();
  });

  it('onglet Assurés : affiche les bénéficiaires avec type et matricule', async () => {
    const user = userEvent.setup();
    stubFetch();
    render(<SocietesView userRole="ADMINISTRATEUR" />);

    await user.click(await screen.findByRole('button', { name: /Assurés/ }));
    expect(await screen.findByText('A. Rasoa')).toBeInTheDocument();
    expect(screen.getByText('Assuré')).toBeInTheDocument();
    expect(screen.getByText('M-001')).toBeInTheDocument();
  });

  it('onglet Prestataires : stats actifs/inactifs et tableau', async () => {
    const user = userEvent.setup();
    stubFetch();
    render(<SocietesView userRole="ADMINISTRATEUR" />);

    await user.click(await screen.findByRole('button', { name: /Prestataires/ }));
    expect(await screen.findByText(/1 actif\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 inactif\(s\)/)).toBeInTheDocument();
    expect(screen.getByText('Clinique A')).toBeInTheDocument();
    expect(screen.getByText('Optique B')).toBeInTheDocument();
    expect(screen.getByText('Clinique')).toBeInTheDocument();
  });

  it('onglet Contacts : affiche les contacts entreprise et le bouton Ajouter', async () => {
    const user = userEvent.setup();
    stubFetch();
    render(<SocietesView userRole="ADMINISTRATEUR" />);

    await user.click(await screen.findByRole('button', { name: /Contacts/ }));
    expect(await screen.findByText('Jean Rakoto')).toBeInTheDocument();
    expect(screen.getByText('DRH')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ajouter/ })).toBeInTheDocument();
  });

  it('la recherche recharge la liste filtrée depuis l\u2019API', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch();
    render(<SocietesView userRole="ADMINISTRATEUR" />);

    await screen.findByText('NIF: NIF001');

    const input = screen.getByPlaceholderText('Rechercher une société...');
    await user.type(input, 'MNS');

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/technique/societes?search=MNS');
    });
    // Le mock renvoie uniquement MNS : CNAPS disparaît de la liste
    await waitFor(() => {
      expect(screen.queryAllByText('CNAPS')).toHaveLength(0);
    });
    expect(screen.getByText('MNS')).toBeInTheDocument();
  });

  it('masque les actions d\u2019écriture sans rôle autorisé', async () => {
    stubFetch();
    render(<SocietesView />);

    expect(await screen.findByText('NIF: NIF001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nouvelle société/ })).not.toBeInTheDocument();
  });

  it('ouvre le dialog de création de société (rôle autorisé)', async () => {
    const user = userEvent.setup();
    stubFetch();
    render(<SocietesView userRole="ADMINISTRATEUR" />);

    await screen.findByText('NIF: NIF001');
    await user.click(screen.getByRole('button', { name: /Nouvelle société/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Nouvelle société')).toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText('Nom de la société')).toBeInTheDocument();
  });
});
