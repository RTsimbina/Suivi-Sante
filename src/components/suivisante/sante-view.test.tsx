// @vitest-environment jsdom
/**
 * Tests de caractérisation de la vue Contrôle Santé — filet de sécurité du
 * refactoring de découpage (P2, monolithe 1/3). Ils verrouillent le comportement
 * observable AVANT et APRÈS le découpage en sous-composants : recherche avec
 * autocomplétion, vérification d'assuré (fiche, société, plafonds, seuils,
 * alertes), historique des actes (chargement auto, tableau, pagination,
 * filtres), plafonds par type d'acte expansibles et simulateur multi-actes.
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PeriodeProvider } from '@/lib/periode-context';
import SanteView from './sante-view';

beforeAll(() => {
  // crypto.randomUUID est absent de certains environnements jsdom ; les lignes
  // de simulation en dépendent dès le premier rendu (useState initialisateur).
  if (!globalThis.crypto.randomUUID) {
    let n = 0;
    (globalThis.crypto as { randomUUID?: () => string }).randomUUID = () => `uuid-test-${++n}`;
  }
});

// ─── Données de test ──────────────────────────────────────────────────────────

const resultatsRecherche = [
  { id: 'a1', nom: 'Rakoto', prenom: 'Jean', nSS: '123456789012', actif: true, societe: { nom: 'CNAPS' } },
  { id: 'a2', nom: 'Rabe', prenom: 'Hery', nSS: null, actif: false, societe: { nom: 'MNS' } },
];

const verificationResult = {
  assure: {
    id: 'a1', nom: 'Rakoto', prenom: 'Jean', nSS: '123456789012',
    dateNaissance: '1980-01-15', sexe: 'M', telephone: '034 12 345 67',
    email: 'rakoto@mail.mg', adresse: 'Antananarivo', actif: true,
  },
  societe: { id: 's1', nom: 'CNAPS' },
  plafonds: {
    annuelGlobal: 2_000_000, totalConsomme: 500_000, reliquatGlobal: 1_500_000,
    tauxConsommationGlobal: 25, seuil70: 1_400_000, seuil100: 2_000_000,
  },
  consommationParActe: {
    CONSULTATION: { consomme: 100_000, plafond: 400_000, tauxCouverture: 80, nbActes: 2, description: 'Consultations' },
    PHARMACIE: { consomme: 300_000, plafond: 300_000, tauxCouverture: 100, nbActes: 5, description: 'Médicaments' },
  },
  dossiersRecent: [
    { id: 'd1', numeroDossier: 'DOS-2025-001', typeDossier: 'CONSULTATION', dateReception: '2025-01-10', montantReclame: 50_000, montantValide: 40_000, montantPaye: 40_000, statut: 'PAYE', prestataire: 'Clinique A' },
    { id: 'd2', numeroDossier: 'DOS-2025-002', typeDossier: 'PHARMACIE', dateReception: '2025-02-20', montantReclame: 30_000, montantValide: 24_000, montantPaye: null, statut: 'VALIDE', prestataire: 'Pharmacie B' },
  ],
  alertes: [{ type: 'warning', message: 'Plafond global bientôt atteint', code: 'SEUIL70' }],
};

const actesPage1 = {
  dossiers: [
    { id: 'x1', numeroDossier: 'DOS-2025-010', typeDossier: 'CONSULTATION', beneficiaire: 'Rakoto Jean', dateReception: '2025-03-01', dateSoins: '2025-02-25', montantReclame: 80_000, montantValide: 64_000, montantPaye: null, partPatient: 16_000, statut: 'EN_COURS_COMPTA', prestataireId: 'p1', prestataire: 'Clinique A', prestataireType: 'CLINIQUE' },
    { id: 'x2', numeroDossier: 'DOS-2025-011', typeDossier: 'PHARMACIE', beneficiaire: 'Rakoto Jean', dateReception: '2025-03-05', dateSoins: null, montantReclame: 20_000, montantValide: 20_000, montantPaye: 20_000, partPatient: null, statut: 'PAYE', prestataireId: null, prestataire: null, prestataireType: null },
  ],
  pagination: { page: 1, limit: 10, total: 12, totalPages: 2 },
  filtres: { typesActe: ['CONSULTATION', 'PHARMACIE'], statuts: ['PAYE', 'EN_COURS_COMPTA'] },
};

const actesPage2 = {
  dossiers: [
    { id: 'x3', numeroDossier: 'DOS-2025-020', typeDossier: 'CONSULTATION', beneficiaire: 'Rakoto Jean', dateReception: '2025-04-01', dateSoins: '2025-03-30', montantReclame: 60_000, montantValide: 48_000, montantPaye: 48_000, partPatient: 12_000, statut: 'PAYE', prestataireId: 'p1', prestataire: 'Clinique A', prestataireType: 'CLINIQUE' },
  ],
  pagination: { page: 2, limit: 10, total: 12, totalPages: 2 },
  filtres: { typesActe: ['CONSULTATION', 'PHARMACIE'], statuts: ['PAYE', 'EN_COURS_COMPTA'] },
};

const simulationResult = {
  autorise: true,
  raison: 'RELIQUAT_SUFFISANT',
  message: 'Prise en charge autorisée.',
  details: {
    typeActe: 'CONSULTATION', plafondActe: 400_000, consommeActe: 100_000,
    reliquatActe: 300_000, tauxCouverture: 80, montantDemande: 50_000,
    montantCouvert: 50_000, partAssureur: 50_000, partPatient: 10_000,
    plafondGlobal: 2_000_000, consommeGlobal: 500_000, reliquatGlobal: 1_500_000,
    nbActesIdentiques: 1,
    // L'API renvoie les actes identiques dans details (le front les remonte ensuite)
    actesIdentiques: [{ numeroDossier: 'DOS-2025-001', dateReception: '2025-01-10', montantReclame: 50_000, montantPaye: 40_000, statut: 'PAYE' }],
  },
  actesIdentiques: [{ numeroDossier: 'DOS-2025-001', dateReception: '2025-01-10', montantReclame: 50_000, montantPaye: 40_000, statut: 'PAYE' }],
  alertes: [{ type: 'warning', message: 'Acte identique récent détecté' }],
};

// ─── Stub fetch ───────────────────────────────────────────────────────────────

interface FetchOpts {
  resultats?: unknown[];
  verification?: { ok: boolean; body: unknown };
  simulationError?: boolean;
}

function stubFetch(opts: FetchOpts = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const json = (body: unknown, ok = true) =>
      Promise.resolve({ ok, json: () => Promise.resolve(body) });

    if (url.startsWith('/api/sante/verifier-assure')) {
      if (method === 'GET') return json({ resultats: opts.resultats ?? resultatsRecherche });
      if (opts.verification && !opts.verification.ok) return json(opts.verification.body, false);
      return json(opts.verification?.body ?? verificationResult);
    }
    if (url.startsWith('/api/sante/actes-assure')) {
      const page = Number(new URL(url, 'http://test.local').searchParams.get('page') ?? 1);
      return json(page === 2 ? actesPage2 : actesPage1);
    }
    if (url.startsWith('/api/sante/simuler-acte')) {
      if (opts.simulationError) return Promise.reject(new Error('réseau'));
      return json(simulationResult);
    }
    return Promise.reject(new Error('fetch non mocké : ' + url));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderSante() {
  return render(
    <PeriodeProvider>
      <SanteView />
    </PeriodeProvider>,
  );
}

async function verifierAssure(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText(/Rechercher par N° SS/), 'Rak');
  await user.click(await screen.findByText('Rakoto Jean'));
  await screen.findByText('Informations Assuré');
}

/** Appels actes-assure enregistrés par le stub. */
function appelsActes(fm: ReturnType<typeof stubFetch>) {
  return fm.mock.calls.filter(([u]) => String(u).startsWith('/api/sante/actes-assure'));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Recherche et vérification d'un assuré ────────────────────────────────────

describe('Contrôle Santé — recherche et vérification', () => {
  it('affiche l\'en-tête et désactive Vérifier tant que la requête est trop courte', () => {
    stubFetch();
    renderSante();

    expect(screen.getByText('Contrôle Santé — Vérification Assuré')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Vérifier/ })).toBeDisabled();
  });

  it('l\'autocomplétion liste les assurés (actifs et inactifs) et le clic lance la vérification', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderSante();

    await user.type(screen.getByPlaceholderText(/Rechercher par N° SS/), 'Rak');

    // Le dropdown liste les deux résultats avec leur badge d'état
    expect(await screen.findByText('Rakoto Jean')).toBeInTheDocument();
    expect(screen.getByText('Rabe Hery')).toBeInTheDocument();
    expect(screen.getByText('Inactif')).toBeInTheDocument();

    // Clic sur le premier résultat → POST avec l'identifiant (id) de l'assuré
    await user.click(screen.getByText('Rakoto Jean'));
    await waitFor(() => {
      const post = fm.mock.calls.find(
        ([u, i]) => String(u).startsWith('/api/sante/verifier-assure') && (i as RequestInit | undefined)?.method === 'POST',
      );
      expect(post).toBeDefined();
      expect(JSON.parse((post![1] as RequestInit).body as string).identifiant).toBe('a1');
    });
    expect(await screen.findByText('Informations Assuré')).toBeInTheDocument();
  });

  it('affiche la fiche assuré, la société, le plafond global et les seuils', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderSante();

    await verifierAssure(user);

    expect(screen.getByText('Société Cliente')).toBeInTheDocument();
    expect(screen.getByText('CNAPS')).toBeInTheDocument();
    expect(screen.getByText('Plafond annuel global')).toBeInTheDocument();
    expect(screen.getByText(/^2\s?000\s?000\s?Ar$/)).toBeInTheDocument();
    expect(screen.getByText(/Consommé : 500\s?000\s?Ar/)).toBeInTheDocument();
    expect(screen.getByText(/Reliquat : 1\s?500\s?000\s?Ar/)).toBeInTheDocument();
    expect(screen.getByText(/Seuil 70%/)).toBeInTheDocument();
    expect(screen.getByText(/1\s?400\s?000\s?Ar/)).toBeInTheDocument();
    expect(screen.getByText(/Seuil 100%/)).toBeInTheDocument();
    expect(screen.getByText('123456789012')).toBeInTheDocument();
    expect(screen.getByText('Plafond global bientôt atteint')).toBeInTheDocument();
  });

  it('affiche l\'erreur renvoyée par l\'API quand la vérification échoue', async () => {
    const user = userEvent.setup();
    stubFetch({ verification: { ok: false, body: { erreur: 'Assuré introuvable.' } } });
    renderSante();

    await user.type(screen.getByPlaceholderText(/Rechercher par N° SS/), 'XY');
    await user.click(screen.getByRole('button', { name: /Vérifier/ }));

    expect(await screen.findByText('Assuré introuvable.')).toBeInTheDocument();
    expect(screen.queryByText('Informations Assuré')).not.toBeInTheDocument();
  });
});

// ─── Historique des actes ─────────────────────────────────────────────────────

describe('Contrôle Santé — historique des actes', () => {
  it('charge automatiquement l\'historique après vérification (période partagée : aucune date)', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderSante();

    await verifierAssure(user);

    expect(await screen.findByText('Historique des actes réalisés')).toBeInTheDocument();
    expect(await screen.findByText('DOS-2025-010')).toBeInTheDocument();

    const appels = appelsActes(fm);
    expect(appels.length).toBeGreaterThan(0);
    const firstUrl = String(appels[0][0]);
    expect(firstUrl).toContain('assureId=a1');
    expect(firstUrl).toContain('page=1');
    expect(firstUrl).toContain('limit=10');
    // Le filtre de période est sur « Toutes les périodes » par défaut
    expect(firstUrl).not.toContain('dateDebut=');
    expect(firstUrl).not.toContain('dateFin=');

    // Badge du total (12 actes sur 2 pages)
    expect(screen.getByText('12 actes')).toBeInTheDocument();
  });

  it('affiche le tableau des actes avec statuts lisibles, prestataire et montants formatés', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderSante();

    await verifierAssure(user);
    await screen.findByText('DOS-2025-010');

    const table = screen.getByRole('table');
    expect(within(table).getByText('DOS-2025-011')).toBeInTheDocument();
    expect(within(table).getByText('EN COURS COMPTA')).toBeInTheDocument();
    expect(within(table).getByText(/80\s?000\s?Ar/)).toBeInTheDocument();
    expect(within(table).getByText('Clinique A')).toBeInTheDocument();
    // Le sélecteur de statut propose les statuts renvoyés par l'API (underscores traduits)
    expect(screen.getByText(/Tous les statuts/)).toBeInTheDocument();
  });

  it('pagine l\'historique et recharge la page demandée', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderSante();

    await verifierAssure(user);
    await screen.findByText('DOS-2025-010');

    await user.click(screen.getByRole('button', { name: '2' }));
    expect(await screen.findByText('DOS-2025-020')).toBeInTheDocument();
    expect(appelsActes(fm).some(([u]) => String(u).includes('page=2'))).toBe(true);
  });

  it('applique les filtres du panneau (recherche, type, statut) sur l\'historique', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderSante();

    await verifierAssure(user);
    await screen.findByText('DOS-2025-010');

    // Le panneau de filtres est ouvert par défaut
    await user.type(screen.getByPlaceholderText('N° dossier, bénéficiaire...'), 'DOS');
    const [selectType, selectStatut] = screen.getAllByRole('combobox');
    await user.selectOptions(selectType, 'CONSULTATION');
    await user.selectOptions(selectStatut, 'PAYE');
    await user.click(screen.getByRole('button', { name: /Rechercher/ }));

    await waitFor(() => {
      const lastUrl = String(fm.mock.calls[fm.mock.calls.length - 1][0]);
      expect(lastUrl).toContain('search=DOS');
      expect(lastUrl).toContain('typeDossier=CONSULTATION');
      expect(lastUrl).toContain('statut=PAYE');
    });
  });
});

// ─── Plafonds par type d'acte ─────────────────────────────────────────────────

describe('Contrôle Santé — plafonds par type d\'acte', () => {
  it('déplie les dossiers récents du type d\'acte consulté', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderSante();

    await verifierAssure(user);

    expect(screen.getByText(/Plafonds par type d'acte/)).toBeInTheDocument();
    // Le bloc CONSULTATION : consommé / plafond affiché sur la droite
    await user.click(screen.getByText(/^100\s?000\s?Ar\s?\/\s?400\s?000\s?Ar$/));

    expect(screen.getByText(/Dossiers CONSULTATION de l'année/)).toBeInTheDocument();
    // Seuls les dossiers du type consulté sont listés (filtre métier)
    expect(screen.getByText('DOS-2025-001')).toBeInTheDocument();
    expect(screen.queryByText('DOS-2025-002')).not.toBeInTheDocument();
  });

  it('signale le plafond saturé (reliquat à 0 Ar)', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderSante();

    await verifierAssure(user);

    // PHARMACIE : 300 000 / 300 000 → reliquat plafonné à 0
    expect(screen.getByText(/^300\s?000\s?Ar\s?\/\s?300\s?000\s?Ar$/)).toBeInTheDocument();
    expect(screen.getByText('Reliquat : 0 Ar')).toBeInTheDocument();
  });
});

// ─── Simulateur multi-actes ───────────────────────────────────────────────────

describe('Contrôle Santé — simulateur multi-actes', () => {
  it('exige un type et un montant avant de permettre la simulation', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderSante();

    await verifierAssure(user);

    expect(screen.getByRole('button', { name: /Simuler/ })).toBeDisabled();
  });

  it('simule un acte et affiche le verdict, les détails et les actes identiques', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderSante();

    await verifierAssure(user);

    await user.selectOptions(screen.getByDisplayValue('-- Sélectionner --'), 'CONSULTATION');
    await user.type(screen.getByPlaceholderText('Ex: 150000'), '50000');
    await user.click(screen.getByRole('button', { name: /Simuler/ }));

    expect(await screen.findByText('ACTE AUTORISÉ')).toBeInTheDocument();
    // Payload envoyé à l'API
    const simCall = fm.mock.calls.find(([u, i]) => String(u).startsWith('/api/sante/simuler-acte'));
    expect(simCall).toBeDefined();
    expect(JSON.parse((simCall![1] as RequestInit).body as string)).toEqual({
      assureId: 'a1',
      typeActe: 'CONSULTATION',
      montantDemande: 50_000,
    });
    // Détails du verdict
    expect(screen.getByText('Plafond acte')).toBeInTheDocument();
    expect(screen.getByText(/^400\s?000\s?Ar$/)).toBeInTheDocument();
    expect(screen.getByText('Montant couvert')).toBeInTheDocument();
    // Le montant couvert (50 000 Ar) apparaît aussi dans les actes identiques
    expect(screen.getAllByText(/^50\s?000\s?Ar$/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Actes identiques déjà réalisés/)).toBeInTheDocument();
    expect(screen.getByText('DOS-2025-001')).toBeInTheDocument();
    expect(screen.getByText('Acte identique récent détecté')).toBeInTheDocument();
  });

  it('résume une simulation de plusieurs actes (totaux demandé / couvert / patient)', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderSante();

    await verifierAssure(user);

    await user.click(screen.getByRole('button', { name: /Ajouter un acte/ }));
    const [sim1, sim2] = screen.getAllByDisplayValue('-- Sélectionner --');
    await user.selectOptions(sim1, 'CONSULTATION');
    await user.type(screen.getAllByPlaceholderText('Ex: 150000')[0], '50000');
    await user.selectOptions(sim2, 'PHARMACIE');
    await user.type(screen.getAllByPlaceholderText('Ex: 150000')[1], '20000');

    await user.click(screen.getByRole('button', { name: /Simuler 2 actes/ }));

    expect(await screen.findByText('Résumé de la simulation')).toBeInTheDocument();
    expect(screen.getByText('Actes simulés')).toBeInTheDocument();
    expect(screen.getByText(/^70\s?000\s?Ar$/)).toBeInTheDocument();  // 50 000 + 20 000
    // 100 000 Ar apparaît aussi comme « Déjà consommé » dans les résultats détaillés
    expect(screen.getAllByText(/^100\s?000\s?Ar$/).length).toBeGreaterThan(0); // 2 × 50 000 couverts
    // 20 000 Ar (part patient) apparaît aussi dans le tableau de l'historique
    expect(screen.getAllByText(/^20\s?000\s?Ar$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('ACTE AUTORISÉ').length).toBe(2);
  });

  it('affiche l\'erreur globale quand la simulation échoue (réseau)', async () => {
    const user = userEvent.setup();
    stubFetch({ simulationError: true });
    renderSante();

    await verifierAssure(user);

    await user.selectOptions(screen.getByDisplayValue('-- Sélectionner --'), 'CONSULTATION');
    await user.type(screen.getByPlaceholderText('Ex: 150000'), '50000');
    await user.click(screen.getByRole('button', { name: /Simuler/ }));

    expect(await screen.findByText('Erreur lors de la simulation.')).toBeInTheDocument();
  });
});
