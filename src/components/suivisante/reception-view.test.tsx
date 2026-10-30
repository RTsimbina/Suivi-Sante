// @vitest-environment jsdom
/**
 * Tests de caractérisation de la vue Réception — filet de sécurité du
 * refactoring de découpage (P2, monolithe 2/3). Ils verrouillent le
 * comportement observable AVANT et APRÈS le découpage en sous-composants :
 * squelette de chargement, KPI, pipeline, carte des informations capturées,
 * liste paginée des courriels (badges type/statut, montants, dates),
 * recherche et filtres serveur, pagination, création (POST + toasts),
 * détail/édition (PATCH) et suppression confirmée (DELETE).
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { PeriodeProvider } from '@/lib/periode-context';
import ReceptionView from './reception-view';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeAll(() => {
  // Stubs jsdom requis par Radix Select / Dialog
  Element.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
});

// ─── Données de test ──────────────────────────────────────────────────────────

const kpis = { reception: { totalEnregistres: 120, tempsMoyenAvantTransfert: 2.5, enAttente: 7 } };

const societes = [{ id: 's1', nom: 'CNAPS' }, { id: 's2', nom: 'MNS' }];

const courriels = [
  {
    id: 'c1', type: 'FACTURE_PRESTATAIRE', expediteur: 'Clinique Sainte-Marie',
    objet: 'Facture #FAC-2026-0451', societeId: 's1', societe: { id: 's1', nom: 'CNAPS' },
    beneficiaire: 'Rakoto Jean', montant: 150_000,
    dateCourriel: '2026-02-10T00:00:00Z', dateSoins: '2026-02-01',
    prestataire: 'Dr. Rakoto', statut: 'RECU', traitePar: null, dateTraitement: null,
    observations: null, dossierId: null, dossier: null, createdAt: '2026-02-10T00:00:00Z',
  },
  {
    id: 'c2', type: 'DOSSIER_REMBOURSEMENT', expediteur: 'Jean Dupont',
    objet: 'Demande remboursement hospitalisation', societeId: 's2', societe: { id: 's2', nom: 'MNS' },
    beneficiaire: null, montant: null,
    dateCourriel: '2026-02-12T12:00:00Z', dateSoins: null,
    prestataire: null, statut: 'TRAITE', traitePar: 'Rabe Hery', dateTraitement: '2026-02-13T12:00:00Z',
    observations: 'Dossier complet', dossierId: 'd9', dossier: { id: 'd9', numeroDossier: 'DOS-2026-009' },
    createdAt: '2026-02-12T12:00:00Z',
  },
];

const pagination = { page: 1, limit: 20, total: 42, totalPages: 3 };

interface FetchOpts {
  courriels?: unknown[];
  creationOk?: boolean;
}

function stubFetch(opts: FetchOpts = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const json = (body: unknown, ok = true) =>
      Promise.resolve({ ok, json: () => Promise.resolve(body) });

    if (url.startsWith('/api/reception/courriels/')) {
      if (method === 'PATCH') return json({ message: 'Courriel mis à jour.' });
      return json({});
    }
    if (url.startsWith('/api/reception/courriels')) {
      if (method === 'POST') return json(opts.creationOk === false ? { erreur: 'Doublon détecté.' } : {}, opts.creationOk === false ? false : true);
      return json({ courriels: opts.courriels ?? courriels, pagination });
    }
    if (url.startsWith('/api/dossiers/societes')) return json({ societes });
    return Promise.reject(new Error('fetch non mocké : ' + url));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderReception(opts: { kpis?: unknown; loading?: boolean } = {}) {
  return render(
    <PeriodeProvider>
      <ReceptionView kpis={(opts.kpis !== undefined ? opts.kpis : kpis) as Record<string, unknown> | null} loading={opts.loading ?? false} />
    </PeriodeProvider>,
  );
}

/** Appels liste (GET) des courriels enregistrés par le stub. */
function appelsListe(fm: ReturnType<typeof stubFetch>) {
  return fm.mock.calls.filter(
    ([u, i]) => String(u).startsWith('/api/reception/courriels') && (i as RequestInit | undefined)?.method === undefined,
  );
}

/** URL du dernier GET liste des courriels enregistré par le stub. */
function dernierAppelListe(fm: ReturnType<typeof stubFetch>): string {
  const appels = appelsListe(fm);
  return appels.length ? String(appels[appels.length - 1][0]) : '';
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ─── Chargement et indicateurs ────────────────────────────────────────────────

describe('Réception — chargement et indicateurs', () => {
  it('affiche un squelette tant que les KPIs ne sont pas chargés', () => {
    renderReception({ kpis: null });
    expect(screen.queryByText('Pipeline de traitement des dossiers')).not.toBeInTheDocument();
  });

  it('affiche les 3 indicateurs et le pipeline de traitement', () => {
    stubFetch();
    renderReception();

    expect(screen.getByText('Total enregistrés')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('Temps moyen avant transfert')).toBeInTheDocument();
    expect(screen.getByText('2.5')).toBeInTheDocument();
    expect(screen.getByText('En attente de transfert')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();

    expect(screen.getByText('Pipeline de traitement des dossiers')).toBeInTheDocument();
    // Desktop + mobile : chaque étape est rendue deux fois
    expect(screen.getAllByText('Réception').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Service Technique').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Comptabilité').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Paiement').length).toBeGreaterThanOrEqual(1);
  });

  it('affiche la carte des informations capturées à la réception', () => {
    stubFetch();
    renderReception();

    expect(screen.getByText('Informations capturées à la réception')).toBeInTheDocument();
    expect(screen.getByText('Généré par le serveur')).toBeInTheDocument();
    expect(screen.getByText('Excel (Power Automate)')).toBeInTheDocument();
  });
});

// ─── Liste des courriels ──────────────────────────────────────────────────────

describe('Réception — liste des courriels', () => {
  it('affiche les courriels avec badges type/statut, montants et dates formatés', async () => {
    stubFetch();
    renderReception();

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Clinique Sainte-Marie')).toBeInTheDocument();
    expect(within(table).getByText('Facture #FAC-2026-0451')).toBeInTheDocument();
    expect(within(table).getByText('Facture prestataire')).toBeInTheDocument();
    expect(within(table).getByText('150 K Ar')).toBeInTheDocument();
    expect(within(table).getByText('10/02/2026')).toBeInTheDocument();
    expect(within(table).getByText('Reçu')).toBeInTheDocument();
    expect(within(table).getByText('Jean Dupont')).toBeInTheDocument();
    expect(within(table).getByText('Dossier remboursement')).toBeInTheDocument();
    expect(within(table).getByText('Traité')).toBeInTheDocument();
    expect(within(table).getByText('12/02/2026')).toBeInTheDocument();
    expect(within(table).getByText('MNS')).toBeInTheDocument();

    // Badge du total + pagination partagée
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('42 courriels • Page 1 sur 3')).toBeInTheDocument();
  });

  it('affiche l\'état vide quand aucun courriel ne correspond', async () => {
    stubFetch({ courriels: [] });
    renderReception();

    expect(await screen.findByText('Aucun courriel trouvé')).toBeInTheDocument();
  });

  it('relance le chargement serveur à la recherche et aux filtres', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderReception();
    await screen.findByText('Clinique Sainte-Marie');

    await user.type(screen.getByPlaceholderText('Rechercher par expéditeur, objet, bénéficiaire...'), 'clinique');
    await waitFor(() => {
      expect(dernierAppelListe(fm)).toContain('search=clinique');
    });

    // Filtre type (Radix Select)
    await user.click(screen.getAllByRole('combobox')[0]);
    await user.click(await screen.findByRole('option', { name: 'Facture prestataire' }));
    await waitFor(() => {
      const lastUrl = dernierAppelListe(fm);
      expect(lastUrl).toContain('search=clinique');
      expect(lastUrl).toContain('type=FACTURE_PRESTATAIRE');
    });

    // Filtre statut (2e Radix Select)
    await user.click(screen.getAllByRole('combobox')[1]);
    await user.click(await screen.findByRole('option', { name: 'Reçu' }));
    await waitFor(() => {
      const lastUrl = dernierAppelListe(fm);
      expect(lastUrl).toContain('type=FACTURE_PRESTATAIRE');
      expect(lastUrl).toContain('statut=RECU');
    });
  });

  it('pagine via la pagination partagée', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderReception();
    await screen.findByText('Clinique Sainte-Marie');

    await user.click(screen.getByRole('button', { name: 'Page suivante' }));
    await waitFor(() => {
      expect(dernierAppelListe(fm)).toContain('page=2');
    });
  });
});

// ─── Création d'un courriel ───────────────────────────────────────────────────

describe('Réception — création d\'un courriel', () => {
  it('ouvre le formulaire vide et bloque l\'enregistrement sans expéditeur ni objet', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderReception();
    await screen.findByText('Clinique Sainte-Marie');

    await user.click(screen.getByRole('button', { name: /Nouveau courriel/ }));

    expect(screen.getByText('Enregistrer un courriel')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ex: Clinique Sainte-Marie')).toHaveValue('');
    expect(screen.getByPlaceholderText('Ex: Facture #FAC-2026-0451')).toHaveValue('');
    expect(screen.getByRole('button', { name: /Enregistrer/ })).toBeDisabled();
  });

  it('enregistre une facture prestataire (POST, toast de succès, refetch page 1)', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderReception();
    await screen.findByText('Clinique Sainte-Marie');

    await user.click(screen.getByRole('button', { name: /Nouveau courriel/ }));
    await user.type(screen.getByPlaceholderText('Ex: Clinique Sainte-Marie'), 'Clinique Test');
    await user.type(screen.getByPlaceholderText('Ex: Facture #FAC-2026-0451'), 'Facture test');
    await user.type(screen.getByPlaceholderText('0'), '250000');
    await user.type(screen.getByPlaceholderText('Ex: Dr. Rakoto, Pharmacie Centrale...'), 'Dr. Test');
    await user.click(screen.getByRole('button', { name: /Enregistrer/ }));

    await waitFor(() => {
      const post = fm.mock.calls.find(
        ([u, i]) => String(u).startsWith('/api/reception/courriels') && (i as RequestInit | undefined)?.method === 'POST',
      );
      expect(post).toBeDefined();
      const body = JSON.parse((post![1] as RequestInit).body as string);
      expect(body.type).toBe('FACTURE_PRESTATAIRE');
      expect(body.expediteur).toBe('Clinique Test');
      expect(body.objet).toBe('Facture test');
      expect(body.montant).toBe(250_000);
      expect(body.prestataire).toBe('Dr. Test');
      expect(typeof body.dateCourriel).toBe('string');
    });
    expect(toast.success).toHaveBeenCalledWith('Courriel enregistré avec succès.');
    // Rechargement de la page 1 après création
    await waitFor(() => {
      expect(String(appelsListe(fm).at(-1)![0])).toContain('page=1');
    });
  });

  it('affiche l\'erreur renvoyée par l\'API quand la création échoue', async () => {
    const user = userEvent.setup();
    stubFetch({ creationOk: false });
    renderReception();
    await screen.findByText('Clinique Sainte-Marie');

    await user.click(screen.getByRole('button', { name: /Nouveau courriel/ }));
    await user.type(screen.getByPlaceholderText('Ex: Clinique Sainte-Marie'), 'Clinique Test');
    await user.type(screen.getByPlaceholderText('Ex: Facture #FAC-2026-0451'), 'Facture test');
    await user.click(screen.getByRole('button', { name: /Enregistrer/ }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Doublon détecté.');
    });
    // Le dialogue reste ouvert pour correction
    expect(screen.getByText('Enregistrer un courriel')).toBeInTheDocument();
  });
});

// ─── Détail et traitement ─────────────────────────────────────────────────────

describe('Réception — détail, édition et suppression', () => {
  it('ouvre la fiche détail depuis la ligne du tableau', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderReception();
    await screen.findByText('Clinique Sainte-Marie');

    await user.click(screen.getByText('Jean Dupont'));

    const dlg = screen.getByRole('dialog');
    expect(within(dlg).getByText('Détails du courriel')).toBeInTheDocument();
    // Badges type/statut : présents dans la fiche (ils existent aussi dans le
    // tableau derrière le dialogue, d'où le ciblage within(dlg))
    expect(within(dlg).getAllByText('Dossier remboursement').length).toBeGreaterThan(0);
    expect(within(dlg).getAllByText('Traité').length).toBeGreaterThan(0);
    expect(within(dlg).getByText('DOS-2026-009')).toBeInTheDocument();
    expect(within(dlg).getByText('Dossier complet')).toBeInTheDocument();
    expect(within(dlg).getByText('Rabe Hery')).toBeInTheDocument();
    expect(within(dlg).getByText('13/02/2026')).toBeInTheDocument();
  });

  it('passe en mode édition et enregistre via PATCH', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderReception();
    await screen.findByText('Clinique Sainte-Marie');

    await user.click(screen.getByText('Jean Dupont'));
    await user.click(screen.getByRole('button', { name: /Modifier/ }));

    expect(screen.getByText('Mode édition')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Ajouter des observations...'), ' à relancer');
    await user.click(screen.getByRole('button', { name: /Enregistrer/ }));

    await waitFor(() => {
      const patch = fm.mock.calls.find(
        ([u, i]) => String(u).startsWith('/api/reception/courriels/') && (i as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patch).toBeDefined();
      expect(String(patch![0])).toContain('/api/reception/courriels/c2');
      expect(JSON.parse((patch![1] as RequestInit).body as string)).toEqual({
        statut: 'TRAITE',
        observations: 'Dossier complet à relancer',
        dossierId: 'd9',
      });
    });
    expect(toast.success).toHaveBeenCalledWith('Courriel mis à jour.');
  });

  it('supprime après confirmation (DELETE + toast)', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderReception();
    await screen.findByText('Clinique Sainte-Marie');

    await user.click(screen.getByText('Jean Dupont'));
    await user.click(screen.getByRole('button', { name: /Supprimer/ }));

    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Supprimer ce courriel ?')).toBeInTheDocument();
    expect(within(dialog).getByText('Jean Dupont')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Supprimer/ }));

    await waitFor(() => {
      const del = fm.mock.calls.find(
        ([u, i]) => String(u).startsWith('/api/reception/courriels/') && (i as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(del).toBeDefined();
      expect(String(del![0])).toContain('/api/reception/courriels/c2');
    });
    expect(toast.success).toHaveBeenCalledWith('Courriel supprimé.');
  });
});
