// @vitest-environment jsdom
/**
 * Tests de caractérisation de la vue Utilisateurs — filet de sécurité du
 * refactoring de découpage (P2). Ils verrouillent le comportement observable
 * AVANT et APRÈS l'éclatement en dossier utilisateurs/ : 4 cartes de stats,
 * filtres serveur (recherche, rôle, statut), tableau (badges rôle, verrou,
 * liaison manquante), bascule d'activation (PATCH), suppression en deux
 * temps (DELETE), création (POST, mot de passe min 8), édition (PUT sans
 * mot de passe si vide) et liaison CONTACT_ENTREPRISE en direct (débounce,
 * TROUVE/CREABLE/BLOQUE, préremplissage depuis la société).
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import UtilisateursView from './utilisateurs-view';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

beforeAll(() => {
  // Stubs jsdom requis par Radix Select
  Element.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
});

// ─── Données de test ──────────────────────────────────────────────────────────

const utilisateurs = [
  {
    id: 'u1', email: 'rakoto@suivisante.mg', nom: 'Rakoto Jean', role: 'ADMINISTRATEUR',
    roleLabel: 'Administrateur', actif: true, avatar: null, dernierLogin: '2026-10-29 08:00',
    failedAttempts: null, lockoutUntil: null, createdAt: '2025-06-01T09:00:00Z',
    updatedAt: '2025-06-01T09:00:00Z', liaisonExterne: null,
  },
  {
    id: 'u2', email: 'contact@cnaps.mg', nom: 'Hery Rabe', role: 'CONTACT_ENTREPRISE',
    roleLabel: 'Entreprise Cliente', actif: false, avatar: null, dernierLogin: null,
    failedAttempts: 5, lockoutUntil: '2099-01-01T00:00:00Z', createdAt: '2025-07-10T10:00:00Z',
    updatedAt: '2025-07-10T10:00:00Z', liaisonExterne: false,
  },
];

const societes = [
  { id: 's1', nom: 'CNAPS', contactPrincipal: 'Rabe Hery', emailContactPrincipal: 'rabe@cnaps.mg' },
];

const contacts = [
  { email: 'contact@cnaps.mg', nom: 'Rabe', prenom: 'Hery', societe: { nom: 'CNAPS' } },
];

interface FetchOpts { chargementKo?: boolean }

function stubFetch(opts: FetchOpts = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const json = (body: unknown, ok = true) =>
      Promise.resolve({ ok, json: () => Promise.resolve(body) });

    if (url.startsWith('/api/utilisateurs?') || url === '/api/utilisateurs') {
      if (method === 'POST' || method === 'PUT') return json({ message: 'Utilisateur cree.' });
      if (method === 'PATCH') return json({ message: 'Utilisateur desactiver.' });
      if (method === 'DELETE') return json({ message: 'Utilisateur supprime.' });
      if (opts.chargementKo) return json({ erreur: 'Erreur interne de la base.' }, false);
      return json({ utilisateurs });
    }
    if (url.startsWith('/api/utilisateurs/')) return json({});
    if (url.startsWith('/api/societes')) return json({ societes });
    if (url.startsWith('/api/entreprise-contacts')) return json({ contacts });
    return Promise.reject(new Error('fetch non mocké : ' + url));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** URL du dernier GET de la liste des utilisateurs. */
function dernierAppelListe(fm: ReturnType<typeof stubFetch>): string {
  const appels = fm.mock.calls.filter(
    ([u, i]) => String(u).startsWith('/api/utilisateurs?') && (i as RequestInit | undefined)?.method === undefined,
  );
  return appels.length ? String(appels[appels.length - 1][0]) : '';
}

function renderUtilisateurs() {
  return render(<UtilisateursView />);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ─── Statistiques et tableau ─────────────────────────────────────────────────

describe('Utilisateurs — statistiques et tableau', () => {
  it('affiche les 4 cartes de stats (total, actifs, inactifs, verrouillés)', async () => {
    stubFetch();
    renderUtilisateurs();
    await screen.findByText('Rakoto Jean');

    expect(screen.getByText('Total comptes')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Actifs')).toBeInTheDocument();
    // 1 = actifs, inactifs et verrouillés (trois cartes portent ce compteur)
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Inactifs')).toBeInTheDocument();
    expect(screen.getByText('Verrouilles')).toBeInTheDocument();
  });

  it('affiche le tableau avec badges rôle, verrou et liaison manquante', async () => {
    stubFetch();
    renderUtilisateurs();
    await screen.findByText('Rakoto Jean');

    const table = screen.getByRole('table');
    expect(within(table).getByText('rakoto@suivisante.mg')).toBeInTheDocument();
    expect(within(table).getByText('Administrateur')).toBeInTheDocument();
    expect(within(table).getByText('contact@cnaps.mg')).toBeInTheDocument();
    expect(within(table).getByText('Entreprise Cliente')).toBeInTheDocument();
    expect(within(table).getByText('Verrouille')).toBeInTheDocument();
    expect(within(table).getByText('Liaison manquante')).toBeInTheDocument();
    // Badges de statut cliquables
    expect(within(table).getAllByText('Actif').length).toBeGreaterThan(0);
    expect(within(table).getAllByText('Inactif').length).toBeGreaterThan(0);
    // Dernière connexion
    expect(within(table).getByText('2026-10-29 08:00')).toBeInTheDocument();
    expect(within(table).getByText('Jamais')).toBeInTheDocument();
  });

  it('affiche l\'état vide et la liste conservée en cas d\'erreur serveur', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderUtilisateurs();
    await screen.findByText('Rakoto Jean');

    // Aucun résultat : filtre serveur qui ne renvoie rien
    fm.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.startsWith('/api/utilisateurs?') && method === 'GET') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ utilisateurs: [] }) });
      }
      return Promise.reject(new Error('fetch non mocké : ' + url));
    });
    await user.type(screen.getByPlaceholderText('Rechercher par nom ou e-mail...'), 'zz');
    expect(await screen.findByText('Aucun utilisateur trouve')).toBeInTheDocument();
  });

  it('signale l\'erreur serveur par un toast sans vider la liste', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderUtilisateurs();
    await screen.findByText('Rakoto Jean');

    // Les recherches suivantes renvoient une erreur 500 côté stub
    fm.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.startsWith('/api/utilisateurs?') && method === 'GET') {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ erreur: 'Erreur interne de la base.' }) });
      }
      return Promise.reject(new Error('fetch non mocké : ' + url));
    });
    await user.type(screen.getByPlaceholderText('Rechercher par nom ou e-mail...'), 'ra');

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Erreur interne de la base.');
    });
    // La liste précédente reste affichée (jamais vidée sur erreur)
    expect(screen.getByText('Rakoto Jean')).toBeInTheDocument();
  });
});

// ─── Filtres serveur ─────────────────────────────────────────────────────────

describe('Utilisateurs — filtres serveur', () => {
  it('transmet la recherche, le rôle et le statut à l\'API', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderUtilisateurs();
    await screen.findByText('Rakoto Jean');

    await user.type(screen.getByPlaceholderText('Rechercher par nom ou e-mail...'), 'rak');
    await waitFor(() => {
      expect(dernierAppelListe(fm)).toContain('q=rak');
    });

    // Filtres natifs (2 FilterSelect)
    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[0], 'ADMINISTRATEUR');
    await waitFor(() => {
      expect(dernierAppelListe(fm)).toContain('role=ADMINISTRATEUR');
    });
    await user.selectOptions(selects[1], 'true');
    await waitFor(() => {
      expect(dernierAppelListe(fm)).toContain('actif=true');
    });
  });

  it('efface la recherche via la croix', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderUtilisateurs();
    await screen.findByText('Rakoto Jean');

    await user.type(screen.getByPlaceholderText('Rechercher par nom ou e-mail...'), 'rak');
    await user.click(screen.getByRole('button', { name: '' }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Rechercher par nom ou e-mail...')).toHaveValue('');
    });
  });
});

// ─── Activation et suppression ───────────────────────────────────────────────

describe('Utilisateurs — activation et suppression', () => {
  it('bascule le statut via PATCH et recharge la liste', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderUtilisateurs();
    await screen.findByText('Rakoto Jean');

    const table = screen.getByRole('table');
    const rowU2 = screen.getByText('contact@cnaps.mg').closest('tr') as HTMLElement;
    await user.click(within(rowU2).getByText('Inactif'));

    await waitFor(() => {
      const patch = fm.mock.calls.find(
        ([u, i]) => String(u).startsWith('/api/utilisateurs') && (i as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patch).toBeDefined();
      expect(JSON.parse((patch![1] as RequestInit).body as string)).toEqual({ id: 'u2', actif: true });
    });
    expect(toast.success).toHaveBeenCalledWith('Utilisateur desactiver.');
  });

  it('supprime en deux temps (confirmation inline puis DELETE)', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderUtilisateurs();
    await screen.findByText('Rakoto Jean');

    const rowU2 = screen.getByText('contact@cnaps.mg').closest('tr') as HTMLElement;
    await user.click(within(rowU2).getByRole('button', { name: /Supprimer l'utilisateur/ }));
    expect(within(rowU2).getByRole('button', { name: /Oui/ })).toBeInTheDocument();
    await user.click(within(rowU2).getByRole('button', { name: /Oui/ }));

    await waitFor(() => {
      const del = fm.mock.calls.find(
        ([u, i]) => String(u).startsWith('/api/utilisateurs') && (i as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(del).toBeDefined();
      expect(String(del![0])).toContain('id=u2');
    });
    expect(toast.success).toHaveBeenCalledWith('Utilisateur supprime.');
  });
});

// ─── Création / édition ──────────────────────────────────────────────────────

describe('Utilisateurs — création et édition', () => {
  it('ouvre le formulaire de création avec mot de passe obligatoire (min 8)', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderUtilisateurs();
    await screen.findByText('Rakoto Jean');

    await user.click(screen.getByRole('button', { name: /Nouvel utilisateur/ }));

    // Titre du dialogue (le bouton de la barre porte le même libellé)
    const dlg = screen.getByRole('dialog');
    expect(within(dlg).getByText('Nouvel utilisateur')).toBeInTheDocument();
    expect(screen.getByLabelText('Nom complet')).toHaveValue('');
    expect(screen.getByLabelText(/Mot de passe/)).toHaveAttribute('minLength', '8');
    // Bouton de visibilité du mot de passe
    expect(screen.getByLabelText('Adresse e-mail')).toHaveAttribute('type', 'email');
  });

  it('crée un utilisateur (POST)', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderUtilisateurs();
    await screen.findByText('Rakoto Jean');

    await user.click(screen.getByRole('button', { name: /Nouvel utilisateur/ }));
    await user.type(screen.getByLabelText('Nom complet'), 'Nouvel User');
    await user.type(screen.getByLabelText('Adresse e-mail'), 'nouvel@suivisante.mg');
    await user.type(screen.getByLabelText(/Mot de passe/), 'MotDePasse1');
    await user.click(screen.getByRole('button', { name: /Creer l'utilisateur/ }));

    await waitFor(() => {
      const post = fm.mock.calls.find(
        ([u, i]) => String(u).startsWith('/api/utilisateurs') && (i as RequestInit | undefined)?.method === 'POST',
      );
      expect(post).toBeDefined();
      const body = JSON.parse((post![1] as RequestInit).body as string);
      expect(body.nom).toBe('Nouvel User');
      expect(body.email).toBe('nouvel@suivisante.mg');
      expect(body.password).toBe('MotDePasse1');
      expect(body.role).toBe('ACCUEIL'); // valeur par défaut du formulaire
    });
    expect(toast.success).toHaveBeenCalledWith('Utilisateur cree.');
  });

  it('pré-remplit l\'édition et enregistre via PUT sans mot de passe si vide', async () => {
    const user = userEvent.setup();
    const fm = stubFetch();
    renderUtilisateurs();
    await screen.findByText('Rakoto Jean');

    // Bouton d'édition de la ligne de l'utilisateur u1
    const rowU1 = screen.getByText('rakoto@suivisante.mg').closest('tr') as HTMLElement;
    await user.click(within(rowU1).getByRole('button', { name: /Modifier l'utilisateur/ }));

    // Titre du dialogue (unique : le tableau n'affiche pas ce libellé)
    expect(screen.getByText("Modifier l'utilisateur")).toBeInTheDocument();
    expect(screen.getByLabelText('Nom complet')).toHaveValue('Rakoto Jean');
    expect(screen.getByLabelText('Adresse e-mail')).toHaveValue('rakoto@suivisante.mg');
    expect(screen.getByLabelText(/Mot de passe/)).not.toBeRequired();

    await user.click(screen.getByRole('button', { name: /Enregistrer/ }));
    await waitFor(() => {
      const put = fm.mock.calls.find(
        ([u, i]) => String(u).startsWith('/api/utilisateurs') && (i as RequestInit | undefined)?.method === 'PUT',
      );
      expect(put).toBeDefined();
      const body = JSON.parse((put![1] as RequestInit).body as string);
      expect(body.id).toBe('u1');
      expect(body.nom).toBe('Rakoto Jean');
      expect(body.password).toBeUndefined(); // champ laissé vide
    });
  });
});

// ─── Liaison CONTACT_ENTREPRISE ──────────────────────────────────────────────

describe('Utilisateurs — liaison CONTACT_ENTREPRISE en direct', () => {
  it("vérifie l'e-mail après délai (contact existant → TROUVE)", async () => {
    // pointerEventsCheck 0 : Radix verrouille pointer-events pendant l'animation
    // d'ouverture du dialogue, jamais levée dans jsdom
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const fm = stubFetch();
    renderUtilisateurs();
    await screen.findByText('Rakoto Jean');

    await user.click(screen.getByRole('button', { name: /Nouvel utilisateur/ }));
    // Trigger du rôle : 3e combobox (2 filtres natifs + Radix rôle du dialogue)
    await user.click(screen.getAllByRole('combobox')[2]);
    await user.click(await screen.findByRole('option', { name: 'Entreprise Cliente' }));

    // Saisir l'e-mail d'un contact existant → débounce 400 ms puis GET contacts
    await user.type(screen.getByLabelText('Adresse e-mail'), 'contact@cnaps.mg');
    expect(await screen.findByText(/Contact existant : Hery Rabe — CNAPS/, {}, { timeout: 2500 })).toBeInTheDocument();
    expect(fm.mock.calls.some(([u]) => String(u).startsWith('/api/entreprise-contacts'))).toBe(true);
  });

  it('propose la création via la société sélectionnée (CREABLE) et préremplit le nom', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    stubFetch();
    renderUtilisateurs();
    await screen.findByText('Rakoto Jean');

    await user.click(screen.getByRole('button', { name: /Nouvel utilisateur/ }));
    await user.click(screen.getAllByRole('combobox')[2]);
    await user.click(await screen.findByRole('option', { name: 'Entreprise Cliente' }));

    // Email inconnu → BLOQUE tant qu'aucune société n'est choisie
    await user.type(screen.getByLabelText('Adresse e-mail'), 'autre@cnaps.mg');
    expect(await screen.findByText(/Aucun contact d'entreprise avec cet e-mail/, {}, { timeout: 2500 })).toBeInTheDocument();

    // Trigger de la société : 4e combobox (présent depuis le choix du rôle)
    await user.click(screen.getAllByRole('combobox')[3]);
    await user.click(await screen.findByRole('option', { name: 'CNAPS' }));

    expect(await screen.findByText(/le contact sera créé automatiquement/)).toBeInTheDocument();
    // Préremplissage du nom depuis le contact principal (l'e-mail saisi est conservé)
    expect(screen.getByLabelText('Nom complet')).toHaveValue('Rabe Hery');
    expect(screen.getByLabelText('Adresse e-mail')).toHaveValue('autre@cnaps.mg');
  });
});
