// @vitest-environment jsdom
/**
 * Tests de non-régression A-01 — Table des Dossiers et Vue Kanban :
 * une erreur API (401/403/500, réseau) doit afficher un état d'erreur
 * distinct avec relance — JAMAIS « Aucun dossier trouvé » ni un board vide.
 * Modèle de stub : reception-view.test.tsx.
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PeriodeProvider } from '@/lib/periode-context';
import DossiersView from './dossiers-view';
import KanbanView from './kanban-view';

vi.mock('next/navigation', () => {
  const params = new URLSearchParams();
  return {
    usePathname: () => '/',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
    useSearchParams: () => params,
  };
});

// Le dialog de détail est hors périmètre : seul l'état de liste est testé ici.
vi.mock('./dossier-detail', () => ({ default: () => null }));

beforeAll(() => {
  // Stubs jsdom requis par Radix / dnd-kit
  Element.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  if (!globalThis.ResizeObserver) {
    // dnd-kit fait `new ResizeObserver(...)` : un vi.fn() n'est pas
    // constructible — stub de classe minimale.
    globalThis.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
  }
});

const dossiers = [
  {
    id: 'd1', numeroDossier: 'DOS-2026-001', dateReception: '2026-01-15T00:00:00Z',
    beneficiaire: 'Rakoto Jean', typeDossier: 'HOSPITALISATION', statut: 'RECU',
    montantReclame: 150000, montantValide: null, montantPaye: null,
    societe: { nom: 'CNAPS' },
    gestionnaireAccueil: { nom: 'Ravao' }, gestionnaireTechnique: null, gestionnaireCompta: null,
  },
];

const pagination = { page: 1, limit: 20, total: 1, totalPages: 1 };

function jsonOk(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
}

function jsonErreur(status: number, body: unknown) {
  return Promise.resolve({ ok: false, status, json: () => Promise.resolve(body) });
}

/** Stub des 2 sources du hook Kanban : liste dossiers + gestionnaires. */
function stubKanban(reponseDossiers: () => Promise<unknown>) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/dossiers/gestionnaires')) return jsonOk([]);
    return reponseDossiers();
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderDossiers() {
  return render(<PeriodeProvider><DossiersView /></PeriodeProvider>);
}

function renderKanban() {
  return render(<PeriodeProvider><KanbanView /></PeriodeProvider>);
}

describe('Table des Dossiers — distinction erreur API / liste vide (A-01)', () => {
  it('affiche les dossiers sur une réponse 200', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonOk({ dossiers, pagination })));
    renderDossiers();
    expect(await screen.findByText('DOS-2026-001')).toBeInTheDocument();
  });

  it('affiche « Aucun dossier trouvé » uniquement sur une liste 200 vide', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonOk({ dossiers: [], pagination: { ...pagination, total: 0, totalPages: 0 } })));
    renderDossiers();
    expect(await screen.findByText('Aucun dossier trouvé')).toBeInTheDocument();
  });

  it('affiche l\'erreur de l\'API (500) avec relance — jamais « Aucun dossier trouvé »', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonErreur(500, { erreur: 'Erreur serveur' })));
    renderDossiers();
    expect(await screen.findByText('Erreur serveur')).toBeInTheDocument();
    expect(screen.queryByText('Aucun dossier trouvé')).not.toBeInTheDocument();

    // Le bouton Réessayer relance l'appel et rétablit l'affichage
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(() => jsonOk({ dossiers, pagination })));
    await user.click(screen.getByRole('button', { name: /Réessayer/ }));
    expect(await screen.findByText('DOS-2026-001')).toBeInTheDocument();
  });

  it('affiche un état d\'erreur sur un échec réseau (catch) — jamais une liste vide', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Network failure'))));
    renderDossiers();
    expect(await screen.findByText('Network failure')).toBeInTheDocument();
    expect(screen.queryByText('Aucun dossier trouvé')).not.toBeInTheDocument();
  });
});

describe('Vue Kanban — distinction erreur API / board vide (A-01)', () => {
  it('affiche le board sur une réponse 200', async () => {
    stubKanban(() => jsonOk({ dossiers }));
    renderKanban();
    expect(await screen.findByText('Non assignés uniquement')).toBeInTheDocument();
  });

  it('affiche l\'erreur de l\'API (401) — jamais un board « vide »', async () => {
    stubKanban(() => jsonErreur(401, { erreur: 'Non authentifié. Veuillez vous reconnecter.' }));
    renderKanban();
    expect(await screen.findByText('Non authentifié. Veuillez vous reconnecter.')).toBeInTheDocument();
    expect(screen.queryByText('Non assignés uniquement')).not.toBeInTheDocument();
  });

  it('affiche un état d\'erreur sur un échec réseau (catch)', async () => {
    stubKanban(() => Promise.reject(new Error('Network failure')));
    renderKanban();
    expect(await screen.findByText('Network failure')).toBeInTheDocument();
  });
});
