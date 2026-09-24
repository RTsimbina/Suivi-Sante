// @vitest-environment jsdom
/**
 * Tests de caractérisation de la vue Prestataires — filet de sécurité du
 * refactoring de découpage (Vague 3, monolithe 3/4). Ils verrouillent le
 * comportement observable AVANT et APRÈS le découpage : stats, liste maître,
 * auto-sélection, filtres, tableau, statut actif/inactif, retrait, dialogues
 * Lier et Créer, synchronisation depuis les dossiers, rôles.
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PrestatairesView from './prestataires-view';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// ─── Données de test ──────────────────────────────────────────────────────────

const societes = [
  { id: 's1', nom: 'CNAPS' },
  { id: 's2', nom: 'MNS' },
];

const prestataires = [
  { id: 'p1', nom: 'Clinique A', type: 'CLINIQUE', telephone: '034 11 111 11', email: null, actif: true },
  { id: 'p2', nom: 'Pharmacie B', type: 'PHARMACIE', telephone: null, email: null, actif: true },
  { id: 'p3', nom: 'Optique C', type: 'OPTICIEN', telephone: null, email: null, actif: true },
];

const liens = [
  {
    id: 'l1', prestataireId: 'p1', societeId: 's1', actif: true,
    prestataire: prestataires[0], societe: societes[0], nbDossiers: 5, montantTotal: 250_000,
  },
  {
    id: 'l2', prestataireId: 'p2', societeId: 's1', actif: false,
    prestataire: prestataires[1], societe: societes[0], nbDossiers: 0, montantTotal: 0,
  },
  {
    id: 'l3', prestataireId: 'p3', societeId: 's2', actif: true,
    prestataire: prestataires[2], societe: societes[1], nbDossiers: 2, montantTotal: 80_000,
  },
];

function stubFetch() {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/prestataires/societes/sync')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ created: 2 }) });
    }
    // GET lit data.liens ; POST/PATCH/DELETE ne lisent que res.ok —
    // renvoyer les liens convient aux deux cas.
    if (url.startsWith('/api/prestataires/societes')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ liens }) });
    }
    if (url.startsWith('/api/prestataires?limit=500')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ prestataires }) });
    }
    if (url.startsWith('/api/prestataires')) {
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ prestataire: { id: 'p-new', nom: 'Nouveau', type: 'CLINIQUE' } }),
      });
    }
    if (url.startsWith('/api/technique/societes')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(societes) });
    }
    return Promise.reject(new Error('fetch non mocké : ' + url));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Variante du stub où /api/prestataires/societes renvoie des liens vides. */
function stubFetchSansLiens() {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/prestataires/societes/sync')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ created: 2 }) });
    }
    if (url.startsWith('/api/prestataires/societes')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ liens: [] }) });
    }
    // (le reste est identique au stub standard)
    if (url.startsWith('/api/prestataires?limit=500')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ prestataires }) });
    }
    if (url.startsWith('/api/technique/societes')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(societes) });
    }
    return Promise.reject(new Error('fetch non mocké : ' + url));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Récupère la ligne <tr> du tableau correspondant au prestataire donné. */
function rowOf(nom: string): HTMLElement {
  const row = screen.getByText(nom).closest('tr');
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

// ─── Données : fiche détaillée (module GESTION → PRESTATAIRES) ───────────────

const ficheP1 = {
  id: 'p1',
  nom: 'Clinique A',
  type: 'CLINIQUE',
  telephone: '034 11 111 11',
  email: 'contact@cliniquea.mg',
  adresse: 'Anosy, Antananarivo',
  nif: '4001111111',
  stat: '6512 311 2001 01234',
  statutJuridique: 'SARL',
  statut: 'CONVENTIONNE',
  rib: '000 12345 67890 12 3',
  actif: true,
  societes: [
    { id: 'l1', prestataireId: 'p1', societeId: 's1', actif: true, societe: societes[0] },
  ],
  _count: { dossiers: 5 },
};

/** Stub standard + fiche GET /api/prestataires/p1 pour les tests du module. */
function stubFetchAvecFiche() {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('/api/prestataires/p1')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ prestataire: ficheP1 }) });
    }
    if (url.startsWith('/api/prestataires?limit=500')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ prestataires }) });
    }
    if (url.startsWith('/api/prestataires/societes')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ liens }) });
    }
    if (url.startsWith('/api/technique/societes')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(societes) });
    }
    return Promise.reject(new Error('fetch non mocké : ' + url));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('PrestatairesView — caractérisation', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('affiche les 5 statistiques agrégées', async () => {
    stubFetch();
    render(<PrestatairesView userRole="ADMINISTRATEUR" />);

    expect(await screen.findByText('Sociétés liées')).toBeInTheDocument();
    expect(screen.getByText('Prestataires')).toBeInTheDocument();
    expect(screen.getByText('Total liens')).toBeInTheDocument();
    expect(screen.getByText('Actifs')).toBeInTheDocument();
    expect(screen.getByText('Inactifs / société')).toBeInTheDocument();

    // Totaux attendus : 2 sociétés liées, 3 prestataires, 3 liens,
    // 2 actifs, 1 inactif (valeurs à lever via le parent des cartes).
    expect(within(screen.getByText('Sociétés liées').parentElement!).getByText('2')).toBeInTheDocument();
    expect(within(screen.getByText('Prestataires').parentElement!).getByText('3')).toBeInTheDocument();
    expect(within(screen.getByText('Total liens').parentElement!).getByText('3')).toBeInTheDocument();
    expect(within(screen.getByText('Actifs').parentElement!).getByText('2')).toBeInTheDocument();
    expect(within(screen.getByText('Inactifs / société').parentElement!).getByText('1')).toBeInTheDocument();
  });

  it('liste les sociétés avec leurs compteurs et auto-sélectionne la première', async () => {
    stubFetch();
    render(<PrestatairesView userRole="ADMINISTRATEUR" />);

    // CNAPS : liste + en-tête du détail (auto-sélection) => >= 2 occurrences
    expect((await screen.findAllByText('CNAPS')).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('MNS')).toBeInTheDocument();

    // En-tête du détail : badge « 2 prestataires », 1 actif, 1 inactif
    expect(await screen.findByText('2 prestataires')).toBeInTheDocument();
    expect(screen.getByText('1 actif(s)')).toBeInTheDocument();
    expect(screen.getByText('1 inactif(s)')).toBeInTheDocument();
  });

  it('affiche le tableau des liens avec type, dossiers, montant et statut', async () => {
    stubFetch();
    render(<PrestatairesView userRole="ADMINISTRATEUR" />);

    expect(await screen.findByText('Clinique A')).toBeInTheDocument();
    expect(screen.getByText('Pharmacie B')).toBeInTheDocument();

    // Badges de type (libellés français) — scopus au tableau : les <option>
    // des filtres portent les mêmes libellés.
    const table = screen.getByText('Clinique A').closest('table');
    expect(table).not.toBeNull();
    expect(within(table as HTMLElement).getByText('Clinique')).toBeInTheDocument();
    expect(within(table as HTMLElement).getByText('Pharmacie')).toBeInTheDocument();

    // Montant réclamé formaté fr-MG (l1 = 250 000 Ar ; l2 = — car 0)
    // (l'en-tête affiche aussi « 250 000 Ar réclamés » : scopus au tableau)
    expect(within(table as HTMLElement).getByText(/250\s?000\s?Ar/)).toBeInTheDocument();

    // Téléphone affiché sous le nom
    expect(screen.getByText('034 11 111 11')).toBeInTheDocument();

    // Indicateurs d'action par statut
    expect(screen.getByText('Autorisé')).toBeInTheDocument();
    expect(screen.getByText('Actes refusés')).toBeInTheDocument();
  });

  it('recherche filtre le tableau des prestataires (côté client)', async () => {
    const user = userEvent.setup();
    stubFetch();
    render(<PrestatairesView userRole="ADMINISTRATEUR" />);

    await screen.findByText('Clinique A');
    await user.type(screen.getByPlaceholderText('Rechercher un prestataire...'), 'Pharmacie');

    await waitFor(() => {
      expect(screen.queryByText('Clinique A')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Pharmacie B')).toBeInTheDocument();
  });

  it('filtre par type et par statut via les listes déroulantes', async () => {
    const user = userEvent.setup();
    stubFetch();
    render(<PrestatairesView userRole="ADMINISTRATEUR" />);

    await screen.findByText('Clinique A');

    // Filtre type = PHARMACIE (1er combobox des filtres)
    const [typeSelect, statutSelect] = screen.getAllByRole('combobox');
    await user.selectOptions(typeSelect, 'PHARMACIE');
    await waitFor(() => {
      expect(screen.queryByText('Clinique A')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Pharmacie B')).toBeInTheDocument();

    // Réinitialise le type, filtre statut = inactif
    await user.selectOptions(typeSelect, '');
    await user.selectOptions(statutSelect, 'inactif');
    await waitFor(() => {
      expect(screen.queryByText('Clinique A')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Pharmacie B')).toBeInTheDocument();
  });

  it('bascule le statut actif/inactif d\u2019un lien (PATCH)', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch();
    render(<PrestatairesView userRole="ADMINISTRATEUR" />);

    await screen.findByText('Pharmacie B');
    const row = rowOf('Pharmacie B');
    const toggle = await within(row).findByRole('button', { name: /Inactif/ });
    await user.click(toggle);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/prestataires/societes',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ id: 'l2', actif: true }),
        }),
      );
    });
  });

  it('retire un lien avec confirmation (DELETE ?id=)', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch();
    render(<PrestatairesView userRole="ADMINISTRATEUR" />);

    await screen.findByText('Pharmacie B');
    const row = rowOf('Pharmacie B');
    const unlinkBtn = await within(row).findAllByRole('button');
    const unlink = unlinkBtn.find(b => b.querySelector('.lucide-unlink'));
    expect(unlink).toBeDefined();
    await user.click(unlink!);

    // Confirmation en deux temps
    const confirmer = await within(row).findByRole('button', { name: 'Confirmer' });
    await user.click(confirmer);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/prestataires/societes?id=l2'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  it('ouvre le dialog Lier avec les prestataires disponibles et lie (POST)', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch();
    render(<PrestatairesView userRole="ADMINISTRATEUR" />);

    await user.click(await screen.findByRole('button', { name: /Ajouter un prestataire/ }));

    const dialog = await screen.findByRole('dialog');
    // Disponibles pour s1 : p3 uniquement (p1 et p2 déjà liés)
    const select = within(dialog).getByRole('combobox');
    await user.selectOptions(select, 'p3');
    await user.click(within(dialog).getByRole('button', { name: 'Lier' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/prestataires/societes',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ prestataireId: 'p3', societeId: 's1' }),
        }),
      );
    });
  });

  it('crée un prestataire via le dialog de création (POST /api/prestataires)', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch();
    render(<PrestatairesView userRole="ADMINISTRATEUR" />);

    await user.click(await screen.findByRole('button', { name: /Nouveau prestataire/ }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByPlaceholderText(/Centre Hospitalier/), 'Clinique Test');
    // Type obligatoire : 1re combobox du formulaire (le groupe est ajouté après)
    await user.selectOptions(within(dialog).getAllByRole('combobox')[0], 'CLINIQUE');
    await user.click(within(dialog).getByRole('button', { name: /Créer le prestataire/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/prestataires',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            nom: 'Clinique Test',
            type: 'CLINIQUE',
            telephone: undefined,
            email: undefined,
            adresse: undefined,
            nif: undefined,
            statut: undefined,
            rib: undefined,
          }),
        }),
      );
    });
    expect(await screen.findByText(/Prestataire créé avec succès/)).toBeInTheDocument();
  });

  it('propose la synchronisation manuelle quand aucun lien n\u2019existe', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetchSansLiens();
    render(<PrestatairesView userRole="ADMINISTRATEUR" />);

    expect(await screen.findByText('Aucun lien prestataire-société')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Synchroniser manuellement/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/prestataires/societes/sync',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(await screen.findByText(/2 lien\(s\) créé\(s\)/)).toBeInTheDocument();
  });

  it('recherche filtre la liste des sociétés (colonne gauche)', async () => {
    const user = userEvent.setup();
    stubFetch();
    render(<PrestatairesView userRole="ADMINISTRATEUR" />);

    await screen.findByText('2 prestataires');

    const input = screen.getByPlaceholderText('Rechercher une société...');
    await user.type(input, 'MNS');

    // CNAPS disparaît de la liste de gauche (l'en-tête du détail le conserve)
    await waitFor(() => {
      expect(screen.queryAllByText('CNAPS')).toHaveLength(1);
    });
    expect(screen.getByText('MNS')).toBeInTheDocument();
  });

  it('masque les actions d\u2019écriture sans rôle autorisé', async () => {
    stubFetch();
    render(<PrestatairesView userRole="ACCUEIL" />);

    expect(await screen.findByText('Clinique A')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nouveau prestataire/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ajouter un prestataire/ })).not.toBeInTheDocument();

    // Statut en Badge statique (pas de bouton de bascule)
    expect(screen.queryByRole('button', { name: /Inactif/ })).not.toBeInTheDocument();
    expect(screen.getByText('Actes refusés')).toBeInTheDocument();
  });

  it('affiche l\u2019état vide quand aucune société n\u2019existe', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/prestataires/societes')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ liens: [] }) });
      }
      if (url.startsWith('/api/prestataires?limit=500')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ prestataires: [] }) });
      }
      if (url.startsWith('/api/technique/societes')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
      }
      return Promise.reject(new Error('fetch non mocké : ' + url));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<PrestatairesView userRole="ADMINISTRATEUR" />);

    expect(await screen.findByText('Aucune société enregistrée')).toBeInTheDocument();
  });
});

// ─── Module GESTION → PRESTATAIRES : liste centralisée, fiche, modification ──

describe('PrestatairesView — annuaire, fiche détaillée et modification', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  async function allerSurAnnuaire(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('tab', { name: /Tous les prestataires/ }));
  }

  it('affiche la liste centralisée de tous les prestataires avec statut et rattachements', async () => {
    const user = userEvent.setup();
    stubFetchAvecFiche();
    render(<PrestatairesView userRole="ADMINISTRATEUR" />);

    await allerSurAnnuaire(user);

    // Les 3 prestataires du référentiel sont visibles, y compris Optique C
    // qui n'est pas conventionné avec la société auto-sélectionnée.
    expect(await screen.findByText('Clinique A')).toBeInTheDocument();
    expect(screen.getByText('Pharmacie B')).toBeInTheDocument();
    expect(screen.getByText('Optique C')).toBeInTheDocument();

    // Rattachements (badges sociétés) — Clinique A et Pharmacie B ↔ CNAPS
    expect(screen.getAllByText('CNAPS').length).toBeGreaterThanOrEqual(1);

    // Statut rapide
    expect(screen.getAllByText('Actif').length).toBeGreaterThan(0);
  });

  it('recherche et filtres du panneau centralisé (nom, e-mail, NIF, Num STAT)', async () => {
    const user = userEvent.setup();
    stubFetchAvecFiche();
    render(<PrestatairesView userRole="ADMINISTRATEUR" />);

    await allerSurAnnuaire(user);
    await screen.findByText('Clinique A');

    await user.type(screen.getByPlaceholderText('Rechercher par nom, e-mail, NIF, Num STAT...'), 'Pharmacie');
    await waitFor(() => {
      expect(screen.queryByText('Clinique A')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Pharmacie B')).toBeInTheDocument();
  });

  it('ouvre la fiche détaillée avec les informations structurées et les sociétés rattachées', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetchAvecFiche();
    render(<PrestatairesView userRole="ADMINISTRATEUR" />);

    await allerSurAnnuaire(user);
    const row = rowOf('Clinique A');
    const boutons = await within(row).findAllByRole('button');
    const voir = boutons.find(b => b.querySelector('.lucide-eye'));
    expect(voir).toBeDefined();
    await user.click(voir!);

    expect(
      fetchMock.mock.calls.some(([url]) => String(url) === '/api/prestataires/p1')
    ).toBe(true);
    const dialog = await screen.findByRole('dialog');
    // Informations structurées exigées sur la fiche
    expect(within(dialog).getByText('Statut juridique')).toBeInTheDocument();
    expect(within(dialog).getByText('SARL')).toBeInTheDocument();
    expect(within(dialog).getByText('Num STAT (Numéro Statistique)')).toBeInTheDocument();
    expect(within(dialog).getByText('6512 311 2001 01234')).toBeInTheDocument();
    expect(within(dialog).getByText('NIF (Numéro d\'Identification Fiscale)')).toBeInTheDocument();
    expect(within(dialog).getByText('000 12345 67890 12 3')).toBeInTheDocument();
    // Sociétés clientes rattachées avec état de la convention
    expect(within(dialog).getByText('CNAPS')).toBeInTheDocument();
    expect(within(dialog).getByText(/Convention active/)).toBeInTheDocument();
    // Accès à la modification depuis la fiche (ADMINISTRATEUR)
    expect(within(dialog).getByRole('button', { name: /Modifier le prestataire/ })).toBeInTheDocument();
  });

  it('ouvre le formulaire « Modifier le prestataire » depuis la fiche et enregistre (PUT)', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetchAvecFiche();
    render(<PrestatairesView userRole="ADMINISTRATEUR" />);

    await allerSurAnnuaire(user);
    const row = rowOf('Clinique A');
    const boutons = await within(row).findAllByRole('button');
    const voir = boutons.find(b => b.querySelector('.lucide-eye'));
    await user.click(voir!);

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /Modifier le prestataire/ }));

    // Le formulaire est pré-rempli avec les données de la fiche
    const form = await screen.findByRole('dialog');
    const nomInput = within(form).getByLabelText(/Nom \/ Raison sociale/) as HTMLInputElement;
    expect(nomInput.value).toBe('Clinique A');

    // Modifier le téléphone puis enregistrer
    const telInput = within(form).getByLabelText('Téléphone');
    await user.clear(telInput);
    await user.type(telInput, '032 22 222 22');
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/prestataires',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            id: 'p1',
            nom: 'Clinique A',
            type: 'CLINIQUE',
            telephone: '032 22 222 22',
            email: 'contact@cliniquea.mg',
            adresse: 'Anosy, Antananarivo',
            nif: '4001111111',
            stat: '6512 311 2001 01234',
            statutJuridique: 'SARL',
            statut: 'CONVENTIONNE',
            rib: '000 12345 67890 12 3',
          }),
        }),
      );
    });
  });

  it('bloque l\u2019enregistrement si l\u2019e-mail est invalide (validation Zod partagée)', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetchAvecFiche();
    render(<PrestatairesView userRole="ADMINISTRATEUR" />);

    await allerSurAnnuaire(user);
    const row = rowOf('Clinique A');
    const boutons = await within(row).findAllByRole('button');
    await user.click(boutons.find(b => b.querySelector('.lucide-eye'))!);

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /Modifier le prestataire/ }));

    const form = await screen.findByRole('dialog');
    const emailInput = within(form).getByLabelText('Adresse e-mail');
    await user.clear(emailInput);
    await user.type(emailInput, 'pas-un-email');
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }));

    // Aucun PUT n'est envoyé et l'erreur du champ est affichée
    await waitFor(() => {
      expect(within(form).getByText(/Adresse email invalide/)).toBeInTheDocument();
    });
    const appelsPut = fetchMock.mock.calls.filter(
      (call) =>
        String(call[0]) === '/api/prestataires' && call[1]?.method === 'PUT'
    );
    expect(appelsPut).toHaveLength(0);
  });

  it('masque la modification sans rôle autorisé (ACCUEIL : lecture seule)', async () => {
    const user = userEvent.setup();
    stubFetchAvecFiche();
    render(<PrestatairesView userRole="ACCUEIL" />);

    await allerSurAnnuaire(user);
    const row = rowOf('Clinique A');
    const boutons = await within(row).findAllByRole('button');
    // Bouton fiche présent, bouton modifier absent
    expect(boutons.find(b => b.querySelector('.lucide-eye'))).toBeDefined();
    expect(boutons.find(b => b.querySelector('.lucide-pencil'))).toBeUndefined();

    // La fiche reste consultable mais sans bouton de modification
    await user.click(boutons.find(b => b.querySelector('.lucide-eye'))!);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: /Modifier le prestataire/ })).not.toBeInTheDocument();
  });
});
