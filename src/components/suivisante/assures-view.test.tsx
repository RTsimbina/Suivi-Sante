// @vitest-environment jsdom
/**
 * Tests de caractérisation de la vue Assurés — filet de sécurité du
 * refactoring de découpage (P2, monolithe 3/3). Ils verrouillent le
 * comportement observable AVANT et APRÈS le découpage en sous-composants :
 * 5 cartes de statistiques, registre des familles expandable, filtres
 * (recherche, société, type avec filtrage client), création/édition
 * (POST/PUT), suppression en deux temps (DELETE), import Excel avec rapport
 * et droits d'édition par rôle.
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import AssuresView from './assures-view';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

// ─── Données de test ──────────────────────────────────────────────────────────

const societes = [{ id: 's1', nom: 'CNAPS' }, { id: 's2', nom: 'MNS' }];

function assure(p: Partial<typeof assures[number]> & { id: string; nom: string }) {
  return {
    prenom: null, nSS: null, matricule: null, typeBeneficiaire: 'ASSURE',
    assurePrincipalId: null, codeFamille: null, dateNaissance: null, sexe: null,
    dateEffet: null, bareme: null, telephone: null, email: null, adresse: null,
    actif: true, societe: { id: 's1', nom: 'CNAPS' }, _count: { dossiers: 0 },
    createdAt: '', updatedAt: '', ...p,
  };
}

const assures = [
  assure({
    id: 'p1', nom: 'Rakoto', prenom: 'Jean', nSS: 'SS-001', matricule: '74735',
    codeFamille: 'Famille 12', dateNaissance: '1980-01-15T00:00:00Z', sexe: 'M',
    dateEffet: '2025-01-01T00:00:00Z', bareme: 0.8, telephone: '034 12 345 67',
    _count: { dossiers: 3 },
  }),
  assure({ id: 'p2', nom: 'Randria', prenom: 'Be', matricule: '74740', _count: { dossiers: 0 } }),
];

const ayantsDroitMap: Record<string, typeof assures> = {
  p1: [
    assure({
      id: 'ad1', nom: 'Rakoto', prenom: 'Rasoa', matricule: '74735-C',
      typeBeneficiaire: 'CONJOINT', assurePrincipalId: 'p1', sexe: 'F',
      dateNaissance: '1983-06-20T00:00:00Z', _count: { dossiers: 1 },
    }),
    assure({
      id: 'ad2', nom: 'Rakoto', prenom: 'Manan', matricule: '74735-E1',
      typeBeneficiaire: 'ENFANT', assurePrincipalId: 'p1',
      dateNaissance: '2010-09-05T00:00:00Z', _count: { dossiers: 2 },
    }),
  ],
  p2: [],
};

const countsByType = { ASSURE: 12, CONJOINT: 5, ENFANT: 8 };
const pagination = { page: 1, limit: 20, total: 25, totalPages: 2 };
const importResult = {
  nbLignes: 10, nbSucces: 9, nbErreurs: 1, tauxSucces: 90,
  erreurs: [{ ligne: 4, message: 'Société introuvable' }],
};

interface FetchOpts { importOk?: boolean; sansAyantsDroit?: boolean }

function stubFetch(opts: FetchOpts = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const json = (body: unknown, ok = true) =>
      Promise.resolve({ ok, json: () => Promise.resolve(body) });

    if (url.startsWith('/api/assures/import')) {
      if (opts.importOk === false) return json({ erreur: 'Format Excel invalide.' }, false);
      return json(importResult);
    }
    if (url.startsWith('/api/assures')) {
      if (method === 'POST' || method === 'PUT' || method === 'DELETE') return json({});
      return json({ assures, ayantsDroitMap: opts.sansAyantsDroit ? {} : ayantsDroitMap, countsByType, pagination });
    }
    if (url.startsWith('/api/technique/societes')) return json({ societes });
    return Promise.reject(new Error('fetch non mocké : ' + url));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Appels liste (GET) /api/assures. */
function dernierAppelListe(fm: ReturnType<typeof stubFetch>): string {
  const appels = fm.mock.calls.filter(
    ([u, i]) => String(u).startsWith('/api/assures') && (i as RequestInit | undefined)?.method === undefined,
  );
  return appels.length ? String(appels[appels.length - 1][0]) : '';
}

function renderAssures(userRole = 'ADMINISTRATEUR') {
  return render(<AssuresView userRole={userRole} />);
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ─── Statistiques ─────────────────────────────────────────────────────────────

describe('Assurés — statistiques', () => {
  it('affiche les 5 cartes agrégées depuis le comptage serveur et la page', async () => {
    stubFetch();
    renderAssures();
    await screen.findByText('Jean Rakoto');

    expect(screen.getByText('Total bénéficiaires')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument(); // 12 + 5 + 8
    expect(screen.getByText('Assurés principaux')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Conjoints')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Enfants')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('Sociétés couvertes')).toBeInTheDocument();
    // Les familles de la page sont toutes chez CNAPS
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});

// ─── Registre des familles ────────────────────────────────────────────────────

describe('Assurés — registre des familles', () => {
  it('affiche les principaux avec badges type/société, matricule, barème, statut', async () => {
    stubFetch();
    renderAssures();

    await screen.findByText('Jean Rakoto');
    expect(screen.getByText('Be Randria')).toBeInTheDocument();

    const table = screen.getByRole('table');
    expect(within(table).getAllByText('Assuré').length).toBeGreaterThan(0);
    expect(within(table).getAllByText('74735').length).toBeGreaterThanOrEqual(1);
    expect(within(table).getAllByText('01 janv. 2025').length).toBeGreaterThanOrEqual(1); // date d'effet (format local mois abrégé)
    expect(within(table).getByText('0.8')).toBeInTheDocument();
    expect(within(table).getAllByText('Actif').length).toBeGreaterThanOrEqual(2);

    // Titre du registre avec le total du comptage
    expect(screen.getByText('Registre des bénéficiaires (25)')).toBeInTheDocument();
    // Pagination partagée
    expect(screen.getByText('25 bénéficiaires • Page 1 sur 2')).toBeInTheDocument();
  });

  it('déplie une famille pour afficher les ayants droit', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderAssures();
    await screen.findByText('Jean Rakoto');

    // La famille p1 a 2 ayants droit → ligne cliquable
    await user.click(screen.getByText('Jean Rakoto'));

    expect(screen.getByText('Rasoa Rakoto')).toBeInTheDocument();
    expect(screen.getByText('Manan Rakoto')).toBeInTheDocument();
    expect(screen.getByText('Conjoint')).toBeInTheDocument();
    expect(screen.getByText('Enfant')).toBeInTheDocument();

    // Replier
    await user.click(screen.getByText('Jean Rakoto'));
    expect(screen.queryByText('Rasoa Rakoto')).not.toBeInTheDocument();
  });

  it('filtre les familles selon le type (conjoint ou enfant dans la famille)', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderAssures();
    await screen.findByText('Jean Rakoto');

    // Filtre type = Conjoint : seule la famille p1 contient un conjoint
    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[1], 'CONJOINT');
    expect(screen.getByText('Jean Rakoto')).toBeInTheDocument();
    expect(screen.queryByText('Be Randria')).not.toBeInTheDocument();
    expect(dernierAppelListe(fm)).toContain('typeBeneficiaire=CONJOINT');

    // Filtre type = Enfant : p1 toujours visible (enfant présent)
    await user.selectOptions(selects[1], 'ENFANT');
    expect(screen.getByText('Jean Rakoto')).toBeInTheDocument();
  });

  it('transmet la recherche et le filtre société au serveur', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderAssures();
    await screen.findByText('Jean Rakoto');

    await user.type(screen.getByPlaceholderText('Rechercher...'), 'rak');
    await waitFor(() => {
      expect(dernierAppelListe(fm)).toContain('search=rak');
    });

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[0], 's2');
    await waitFor(() => {
      const url = dernierAppelListe(fm);
      expect(url).toContain('societeId=s2');
      expect(url).toContain('avecAyantsDroit=true');
    });
  });

  it('affiche l\'état vide quand aucune famille ne correspond au filtre type', async () => {
    const user = userEvent.setup();
    stubFetch({ sansAyantsDroit: true });
    renderAssures();
    await screen.findByText('Jean Rakoto');

    // Aucune famille de la page n'a de conjoint → registre vide
    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[1], 'CONJOINT');
    expect(await screen.findByText('Aucun bénéficiaire trouvé')).toBeInTheDocument();
  });
});

// ─── Création / édition / suppression ────────────────────────────────────────

describe('Assurés — création, édition, suppression (rôle ADMINISTRATEUR)', () => {
  it('ouvre le formulaire vierge et bloque la création sans nom ni société', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderAssures();
    await screen.findByText('Jean Rakoto');

    await user.click(screen.getByRole('button', { name: /Nouveau bénéficiaire/ }));

    const dlg = screen.getByRole('dialog');
    expect(within(dlg).getByText('Nouveau bénéficiaire')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Rakoto')).toHaveValue('');
    const creer = screen.getByRole('button', { name: /Créer/ });
    expect(creer).toBeDisabled();

    // Remplissage minimal
    await user.type(screen.getByPlaceholderText('Rakoto'), 'Nouveau');
    await user.selectOptions(screen.getByDisplayValue('-- Sélectionner --'), 's1');
    expect(creer).toBeEnabled();
  });

  it('crée un bénéficiaire (POST avec valeurs par défaut)', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderAssures();
    await screen.findByText('Jean Rakoto');

    await user.click(screen.getByRole('button', { name: /Nouveau bénéficiaire/ }));
    await user.type(screen.getByPlaceholderText('Rakoto'), 'Nouveau');
    await user.selectOptions(screen.getByDisplayValue('-- Sélectionner --'), 's1');
    await user.click(screen.getByRole('button', { name: /Créer/ }));

    await waitFor(() => {
      const post = fm.mock.calls.find(
        ([u, i]) => String(u).startsWith('/api/assures') && (i as RequestInit | undefined)?.method === 'POST',
      );
      expect(post).toBeDefined();
      const body = JSON.parse((post![1] as RequestInit).body as string);
      expect(body.nom).toBe('Nouveau');
      expect(body.societeId).toBe('s1');
      expect(body.typeBeneficiaire).toBe('ASSURE');
      expect(body.bareme).toBe(0.8);
      expect(body.assurePrincipalId).toBeNull();
      expect(body.actif).toBe(true);
    });
  });

  it('pré-remplit le formulaire en édition et enregistre via PUT', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderAssures();
    await screen.findByText('Jean Rakoto');

    await user.click(screen.getByRole('button', { name: /Modifier l'assuré/ }));

    expect(screen.getByText('Modifier le bénéficiaire')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Rakoto')).toHaveValue('Rakoto');
    expect(screen.getByPlaceholderText('Jean')).toHaveValue('Jean');
    expect(screen.getByPlaceholderText('74735')).toHaveValue('74735');
    // Barème existant repris tel quel
    expect(screen.getByPlaceholderText('0.8')).toHaveValue(0.8);

    await user.click(screen.getByRole('button', { name: /Enregistrer/ }));
    await waitFor(() => {
      const put = fm.mock.calls.find(
        ([u, i]) => String(u).startsWith('/api/assures') && (i as RequestInit | undefined)?.method === 'PUT',
      );
      expect(put).toBeDefined();
      const body = JSON.parse((put![1] as RequestInit).body as string);
      expect(body.id).toBe('p1');
      expect(body.nom).toBe('Rakoto');
      expect(body.bareme).toBe(0.8);
    });
  });

  it('supprime en deux temps (confirmation inline puis DELETE)', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderAssures();
    await screen.findByText('Jean Rakoto');

    // La famille p2 n'a pas d'ayants droit : sa ligne n'est pas cliquable et
    // son bouton de suppression est ciblé via la ligne du tableau.
    const rowP2 = screen.getByText('Be Randria').closest('tr') as HTMLElement;
    await user.click(within(rowP2).getByRole('button', { name: /Supprimer l'assuré/ }));
    // Confirmation inline : bouton « Oui » + annulation possible
    expect(within(rowP2).getByRole('button', { name: /Oui/ })).toBeInTheDocument();
    await user.click(within(rowP2).getByRole('button', { name: /Oui/ }));

    await waitFor(() => {
      const del = fm.mock.calls.find(
        ([u, i]) => String(u).startsWith('/api/assures') && (i as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(del).toBeDefined();
      expect(String(del![0])).toContain('id=p2');
    });
  });

  it('annule la confirmation de suppression (bouton croix)', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderAssures();
    await screen.findByText('Jean Rakoto');

    const rowP2 = screen.getByText('Be Randria').closest('tr') as HTMLElement;
    await user.click(within(rowP2).getByRole('button', { name: /Supprimer l'assuré/ }));
    await user.click(within(rowP2).getByRole('button', { name: /Annuler la suppression/ }));
    expect(within(rowP2).queryByRole('button', { name: /Oui/ })).not.toBeInTheDocument();
    expect(fm.mock.calls.some(([u, i]) => (i as RequestInit | undefined)?.method === 'DELETE')).toBe(false);
  });
});

// ─── Import Excel ─────────────────────────────────────────────────────────────

describe('Assurés — import Excel', () => {
  it('ouvre le dialogue et bloque l\'import sans fichier', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderAssures();
    await screen.findByText('Jean Rakoto');

    await user.click(screen.getByRole('button', { name: /Importer/ }));

    expect(screen.getByText('Importer des bénéficiaires')).toBeInTheDocument();
    expect(screen.getByText('Colonnes attendues :')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Importer le fichier/ })).toBeDisabled();
  });

  it('importe un fichier et affiche le rapport (totaux + erreurs par ligne)', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    const { container } = renderAssures();
    await screen.findByText('Jean Rakoto');

    await user.click(screen.getByRole('button', { name: /Importer/ }));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'beneficiaires.xlsx'));

    expect(screen.getByText('beneficiaires.xlsx')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Importer le fichier/ }));

    await waitFor(() => {
      const post = fm.mock.calls.find(([u]) => String(u).startsWith('/api/assures/import'));
      expect(post).toBeDefined();
    });
    expect(toast.warning).toHaveBeenCalledWith('Import partiel : 9 succès, 1 erreurs');
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText(/Ligne 4 :/)).toBeInTheDocument();
    expect(screen.getByText('Société introuvable')).toBeInTheDocument();
  });

  it('affiche l\'erreur renvoyée par l\'API quand l\'import échoue', async () => {
    const user = userEvent.setup();
    stubFetch({ importOk: false });
    const { container } = renderAssures();
    await screen.findByText('Jean Rakoto');

    await user.click(screen.getByRole('button', { name: /Importer/ }));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'beneficiaires.xlsx'));
    await user.click(screen.getByRole('button', { name: /Importer le fichier/ }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Format Excel invalide.');
    });
  });
});

// ─── Droits par rôle ──────────────────────────────────────────────────────────

describe('Assurés — droits par rôle', () => {
  it('masque les actions et les boutons pour un rôle non éditeur (ACCUEIL)', async () => {
    stubFetch();
    renderAssures('ACCUEIL');
    await screen.findByText('Jean Rakoto');

    expect(screen.queryByRole('button', { name: /Nouveau bénéficiaire/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Importer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Modifier l'assuré/ })).not.toBeInTheDocument();
    // Pas de colonne Actions
    expect(screen.queryByText('Actions')).not.toBeInTheDocument();
  });
});
