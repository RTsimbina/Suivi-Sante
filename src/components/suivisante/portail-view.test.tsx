// @vitest-environment jsdom
/**
 * Tests de caractérisation de la vue Portail client — filet de sécurité du
 * refactoring de découpage (P2). Ils verrouillent le comportement observable
 * AVANT et APRÈS l'éclatement en dossier portail/ : recherche publique de
 * dossiers (cartes avec pipeline visuel et messages contextuels par statut),
 * chatbot externe (messages, réponse bot, actions rapides) et portail
 * sécurisé entreprise (KPIs, contrats & solde, dossiers).
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PortailView from './portail-view';

// ─── Données de test ──────────────────────────────────────────────────────────

const resultats = [
  { numeroDossier: 'DOS-2026-000042', statut: 'PAYE', statutLabel: 'Payé', typeDossier: 'HOSPITALISATION', dateReception: '2026-01-15', montantReclame: 200_000, montantPaye: 160_000, datePaiement: '2026-02-01', referencePaiement: 'VIR-2026-001', prestataire: 'Clinique A' },
  { numeroDossier: 'DOS-2026-000043', statut: 'REJETE', statutLabel: 'Rejeté', typeDossier: 'PHARMACIE', dateReception: '2026-01-20', montantReclame: 50_000, motifRejet: 'Prestation non couverte' },
  { numeroDossier: 'DOS-2026-000044', statut: 'EN_ANALYSE', statutLabel: 'En analyse', typeDossier: 'CONSULTATION', dateReception: '2026-02-05', montantReclame: 80_000, prestataire: 'Dr. Rakoto' },
  { numeroDossier: 'DOS-2026-000045', statut: 'RECU', statutLabel: 'Reçu', typeDossier: 'OPTIQUE', dateReception: '2026-02-10', montantReclame: 120_000 },
];

const dossiersSociete = resultats.slice(0, 3);

const contrats = [
  {
    id: 'c1', societeId: 's1', societe: { nom: 'CNAPS' }, typeContrat: 'FORFAITAIRE',
    budgetAnnuel: 500_000, budgetUtilise: 160_000, soldeDisponible: 340_000,
    _count: { appelsDeFonds: 2 },
  },
];

interface FetchOpts { erreur?: string }

function stubFetch(opts: FetchOpts = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const json = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

    if (url.startsWith('/api/portail')) {
      if (method === 'POST') {
        return json(opts.erreur
          ? { error: opts.erreur }
          : { results: resultats, total: resultats.length, resume: 'Résumé de vos dossiers' });
      }
    }
    if (url.startsWith('/api/societes')) return json([{ id: 's1', nom: 'CNAPS' }, { id: 's2', nom: 'MNS' }]);
    if (url.startsWith('/api/contrats')) return json({ contrats });
    if (url.startsWith('/api/dossiers')) return json({ dossiers: dossiersSociete });
    return Promise.reject(new Error('fetch non mocké : ' + url));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPortail() {
  return render(<PortailView />);
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ─── Onglet Portail Client (recherche publique) ──────────────────────────────

describe('Portail — recherche publique de dossiers', () => {
  it('affiche la bannière, les 3 onglets et l\'état initial de la recherche', () => {
    stubFetch();
    renderPortail();

    expect(screen.getByText('Aperçu du portail client')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Portail Client/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Chatbot Externe/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Portail Sécurisé/ })).toBeInTheDocument();
    expect(screen.getByText('Recherchez votre dossier')).toBeInTheDocument();
  });

  it('interdit la recherche vide (bouton désactivé)', () => {
    stubFetch();
    renderPortail();

    expect(screen.getByRole('button', { name: /Rechercher/ })).toBeDisabled();
  });

  it('affiche les dossiers trouvés avec pipeline, montants et message par statut', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderPortail();

    await user.type(screen.getByPlaceholderText('Ex : DOS-2026-000042 ou Rakoto'), 'Rakoto');
    await user.click(screen.getByRole('button', { name: /Rechercher/ }));

    expect(await screen.findByText('DOS-2026-000042')).toBeInTheDocument();
    expect(screen.getByText('DOS-2026-000043')).toBeInTheDocument();
    expect(screen.getByText('DOS-2026-000044')).toBeInTheDocument();
    expect(screen.getByText('4 dossiers trouvés')).toBeInTheDocument();

    // Payload de recherche
    const post = fm.mock.calls.find(([u, i]) => String(u).startsWith('/api/portail') && (i as RequestInit | undefined)?.method === 'POST');
    expect(JSON.parse((post![1] as RequestInit).body as string)).toEqual({ query: 'Rakoto' });

    // PAYE : montant payé, référence, message de remboursement
    expect(screen.getByText('Montant payé')).toBeInTheDocument();
    expect(screen.getByText('VIR-2026-001')).toBeInTheDocument();
    expect(screen.getByText(/remboursement de/)).toBeInTheDocument();

    // REJETE : motif
    expect(screen.getByText('Prestation non couverte')).toBeInTheDocument();

    // EN_ANALYSE : service médical
    expect(screen.getByText('service médical')).toBeInTheDocument();

    // RECU : attente de prise en charge
    expect(screen.getByText(/en attente de prise en charge/)).toBeInTheDocument();

    // Montants formatés
    expect(screen.getByText('200 000 Ar')).toBeInTheDocument();
    expect(screen.getByText('160 000 Ar')).toBeInTheDocument();
  });

  it('affiche l\'état vide quand aucun dossier ne correspond', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    fm.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.startsWith('/api/portail') && method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [], total: 0 }) });
      }
      if (url.startsWith('/api/societes')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      return Promise.reject(new Error('fetch non mocké : ' + url));
    });
    renderPortail();

    await user.type(screen.getByPlaceholderText('Ex : DOS-2026-000042 ou Rakoto'), 'Inconnu');
    await user.click(screen.getByRole('button', { name: /Rechercher/ }));

    expect(await screen.findByText(/Aucun dossier trouvé pour votre recherche/)).toBeInTheDocument();
  });

  it('affiche l\'erreur renvoyée par l\'API', async () => {
    const user = userEvent.setup();
    stubFetch({ erreur: 'Recherche trop courte.' });
    renderPortail();

    await user.type(screen.getByPlaceholderText('Ex : DOS-2026-000042 ou Rakoto'), 'Ra');
    await user.click(screen.getByRole('button', { name: /Rechercher/ }));

    expect(await screen.findByText('Recherche trop courte.')).toBeInTheDocument();
  });
});

// ─── Onglet Chatbot Externe ───────────────────────────────────────────────────

describe('Portail — chatbot externe', () => {
  it('affiche l\'assistant avec ses messages d\'accueil et les actions rapides', async () => {
    stubFetch();
    renderPortail();
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: /Chatbot Externe/ }));

    expect(await screen.findByText('Suivi Santé - Assistant')).toBeInTheDocument();
    expect(screen.getByText(/Bonjour ! Je suis l'assistant Suivi Santé/)).toBeInTheDocument();
    expect(screen.getByText('Statut remboursement')).toBeInTheDocument();
    // L'envoi sans saisie est impossible
    expect(screen.getByRole('button', { name: 'Envoyer le message' })).toBeDisabled();
  });

  it('répond avec le résumé de l\'API quand des dossiers sont trouvés', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderPortail();

    await user.click(screen.getByRole('tab', { name: /Chatbot Externe/ }));
    await screen.findByText('Suivi Santé - Assistant');

    await user.type(screen.getByPlaceholderText('Saisissez votre message...'), 'Rakoto');
    await user.click(screen.getByRole('button', { name: 'Envoyer le message' }));

    // Le message utilisateur est affiché
    expect(screen.getByText('Rakoto')).toBeInTheDocument();
    // La réponse bot provient de portailData.resume
    expect(await screen.findByText('Résumé de vos dossiers')).toBeInTheDocument();
    const post = fm.mock.calls.find(([u, i]) => String(u).startsWith('/api/portail') && (i as RequestInit | undefined)?.method === 'POST');
    expect(JSON.parse((post![1] as RequestInit).body as string)).toEqual({ query: 'Rakoto' });
  });

  it('déclenche une recherche depuis une action rapide', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderPortail();

    await user.click(screen.getByRole('tab', { name: /Chatbot Externe/ }));
    await screen.findByText('Statut remboursement');

    await user.click(screen.getByText('Statut remboursement'));
    await waitFor(() => {
      const post = fm.mock.calls.find(([u, i]) => String(u).startsWith('/api/portail') && (i as RequestInit | undefined)?.method === 'POST');
      expect(JSON.parse((post![1] as RequestInit).body as string)).toEqual({ query: 'Statut de mon remboursement' });
    });
    expect(await screen.findByText('Résumé de vos dossiers')).toBeInTheDocument();
  });

  it('répond qu\'aucune information n\'a été trouvée sans résultat structuré', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    fm.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/api/portail')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [], total: 0 }) });
      }
      return Promise.reject(new Error('fetch non mocké : ' + url));
    });
    renderPortail();

    await user.click(screen.getByRole('tab', { name: /Chatbot Externe/ }));
    await screen.findByText('Suivi Santé - Assistant');

    await user.type(screen.getByPlaceholderText('Saisissez votre message...'), 'Xyz');
    await user.click(screen.getByRole('button', { name: 'Envoyer le message' }));

    expect(await screen.findByText(/je n'ai pas pu trouver d'information correspondante/)).toBeInTheDocument();
  });
});

// ─── Onglet Portail Sécurisé ──────────────────────────────────────────────────

describe('Portail — portail sécurisé entreprise', () => {
  it('invite à sélectionner l\'entreprise avant tout accès aux données', async () => {
    stubFetch();
    renderPortail();
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: /Portail Sécurisé/ }));

    expect(await screen.findByText('Choisissez votre entreprise ci-dessus pour accéder à vos KPIs, contrats et dossiers.')).toBeInTheDocument();
    expect(screen.queryByText('Total dossiers')).not.toBeInTheDocument();
  });

  it('charge KPIs, contrats et dossiers après sélection de l\'entreprise', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderPortail();

    await user.click(screen.getByRole('tab', { name: /Portail Sécurisé/ }));
    await screen.findByText('Choisissez votre entreprise ci-dessus pour accéder à vos KPIs, contrats et dossiers.');

    const select = document.body.querySelector('select') as HTMLSelectElement;
    await user.selectOptions(select, 's1');

    // KPIs calculés depuis les dossiers de l'entreprise
    expect(await screen.findByText('Total dossiers')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('330 000 Ar')).toBeInTheDocument();  // réclamé
    expect(screen.getByText('160 000 Ar')).toBeInTheDocument();  // payé
    expect(screen.getByText('48.5%')).toBeInTheDocument();       // taux paiement

    // Paramètres de requête
    const dossiersCall = fm.mock.calls.find(([u]) => String(u).startsWith('/api/dossiers'));
    expect(String(dossiersCall![0])).toContain('societeId=s1');

    // Contrats & solde
    expect(screen.getByText('Contrats & Solde')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('FORFAITAIRE')).toBeInTheDocument();
    expect(within(table).getByText('500 000 Ar')).toBeInTheDocument();
    expect(within(table).getByText('340 000 Ar')).toBeInTheDocument();

    // Dossiers de l'entreprise (cartes)
    expect(screen.getByText("Dossiers de l'entreprise (3)")).toBeInTheDocument();
    expect(screen.getByText('DOS-2026-000042')).toBeInTheDocument();
    expect(screen.getByText('DOS-2026-000044')).toBeInTheDocument();
  });

  it('affiche l\'état sans dossier pour une entreprise sans dossiers', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    fm.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/societes')) return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 's9', nom: 'Vide SA' }]) });
      if (url.startsWith('/api/contrats')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ contrats: [] }) });
      if (url.startsWith('/api/dossiers')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ dossiers: [] }) });
      return Promise.reject(new Error('fetch non mocké : ' + url));
    });
    renderPortail();

    await user.click(screen.getByRole('tab', { name: /Portail Sécurisé/ }));
    await screen.findByText('Choisissez votre entreprise ci-dessus pour accéder à vos KPIs, contrats et dossiers.');

    const select = document.body.querySelector('select') as HTMLSelectElement;
    await user.selectOptions(select, 's9');

    expect(await screen.findByText(/Aucun dossier trouvé pour cette entreprise/)).toBeInTheDocument();
  });
});

