// @vitest-environment jsdom
/**
 * Tests de la page de connexion — point d'entrée critique de la plateforme.
 * Couvre : rendu, comptes démo, bascule mot de passe, messages d'erreur
 * (identifiants incorrects / compte verrouillé) et redirections par rôle.
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './page';
import { signIn } from 'next-auth/react';
import { useTheme } from 'next-themes';

vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
}));

// La page lit callbackUrl via useSearchParams (sous une limite Suspense)
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-themes', () => ({
  useTheme: vi.fn(() => ({ theme: 'light', setTheme: vi.fn() })),
}));

const mockSignIn = vi.mocked(signIn);

/** Stub du presse-papiers (jsdom n'en fournit pas). */
function stubClipboard() {
  const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

/** Remplace window.location (non navigable sous jsdom) par un stub lisible */
function stubLocation() {
  const stub = { href: '' };
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: stub,
  });
  return stub;
}

/** fetch mocké : /api/session/lockout et /api/auth/session configurables */
function stubFetch(opts: {
  lockout?: { locked: boolean; remainingMs?: number } | { ok: false };
  session?: { user?: { role?: string } } | null;
}) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/session/lockout')) {
      const lockout = opts.lockout as { ok?: boolean; locked?: boolean; remainingMs?: number } | undefined;
      if (lockout && 'ok' in lockout && lockout.ok === false) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ locked: false, ...(opts.lockout ?? {}) }),
      });
    }
    if (url.includes('/api/auth/session')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(opts.session ?? {}) });
    }
    return Promise.reject(new Error('fetch non mocké : ' + url));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('Page de connexion', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mockSignIn.mockReset();
    stubLocation();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('affiche les champs email / mot de passe et le bouton de connexion', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText('Adresse e-mail')).toBeInTheDocument();
    expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mot de passe oublié/ })).toBeInTheDocument();
  });

  it('n’affiche PAS le bloc comptes de démonstration hors environnement de démo', () => {
    // NEXT_PUBLIC_ENV_DEMO non défini (production) : aucun identifiant ni
    // mot de passe ne doit apparaître sur la page de connexion.
    render(<LoginPage />);
    expect(screen.queryByText(/Comptes de démonstration/)).not.toBeInTheDocument();
    expect(screen.queryByText('admin@suivisante.mg')).not.toBeInTheDocument();
    expect(screen.queryByText('SuiviSante@2026')).not.toBeInTheDocument();
    expect(screen.queryByText('Contact@2026')).not.toBeInTheDocument();
  });

  describe('environnement de démonstration (NEXT_PUBLIC_ENV_DEMO=OUI)', () => {
    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_ENV_DEMO', 'OUI');
    });

    it('affiche les comptes de démonstration synchronisés avec le catalogue (31 comptes)', () => {
      render(<LoginPage />);
      // Échantillon couvrant les deux groupes et les nouveaux profils
      expect(screen.getByText(/Comptes de démonstration \(31\)/)).toBeInTheDocument();
      expect(screen.getByText('admin@suivisante.mg')).toBeInTheDocument();
      expect(screen.getByText('accueil@suivisante.mg')).toBeInTheDocument();
      expect(screen.getByText('technique5@suivisante.mg')).toBeInTheDocument();
      expect(screen.getByText('finance1@suivisante.mg')).toBeInTheDocument();
      expect(screen.getByText('dg@suivisante.mg')).toBeInTheDocument();
      expect(screen.getByText('rs-controle-medical@suivisante.mg')).toBeInTheDocument();
      expect(screen.getByText('portail.bni@suivisante.mg')).toBeInTheDocument();
      expect(screen.getByText('facturation@hopital-principal.mg')).toBeInTheDocument();
      // Profils affichés avec leur libellé de rôle (référentiel)
      expect(screen.getByText('Direction Générale')).toBeInTheDocument();
      expect(screen.getByText('Responsable de service · Contrôle médical')).toBeInTheDocument();
      // Les mots de passe de démonstration sont visibles (env de démo)
      expect(screen.getByText('SuiviSante@2026')).toBeInTheDocument();
      expect(screen.getByText('Contact@2026')).toBeInTheDocument();
    });

    it('pré-remplit le formulaire au clic sur un compte de démonstration', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);
      await user.click(screen.getByText('admin@suivisante.mg'));
      expect(screen.getByLabelText('Adresse e-mail')).toHaveValue('admin@suivisante.mg');
      expect(screen.getByLabelText('Mot de passe')).toHaveValue('SuiviSante@2026');
    });

    it('pré-remplit le mot de passe externe pour un compte portail', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);
      await user.click(screen.getByText('portail.bni@suivisante.mg'));
      expect(screen.getByLabelText('Adresse e-mail')).toHaveValue('portail.bni@suivisante.mg');
      expect(screen.getByLabelText('Mot de passe')).toHaveValue('Contact@2026');
    });

    it('copie l’identifiant via le bouton de copie de la carte', async () => {
      const user = userEvent.setup();
      const writeText = stubClipboard();
      render(<LoginPage />);
      await user.click(screen.getByRole('button', { name: "Copier l'identifiant admin@suivisante.mg" }));
      expect(writeText).toHaveBeenCalledWith('admin@suivisante.mg');
      // Retour visuel « Copié » sur le bouton
      expect(screen.getByRole('button', { name: /Copié/ })).toBeInTheDocument();
    });

    it('copie le mot de passe via le bouton de copie de la carte', async () => {
      const user = userEvent.setup();
      const writeText = stubClipboard();
      render(<LoginPage />);
      await user.click(screen.getByRole('button', { name: 'Copier le mot de passe de dg@suivisante.mg' }));
      expect(writeText).toHaveBeenCalledWith('SuiviSante@2026');
    });

    it('copie le mot de passe du groupe depuis l’en-tête du groupe', async () => {
      const user = userEvent.setup();
      const writeText = stubClipboard();
      render(<LoginPage />);
      await user.click(screen.getByRole('button', { name: /Copier le mot de passe du groupe « Comptes externes/ }));
      expect(writeText).toHaveBeenCalledWith('Contact@2026');
    });
  });

  it('bascule la visibilité du mot de passe (accessible au clavier)', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    const pwd = screen.getByLabelText('Mot de passe');
    const toggle = screen.getByRole('button', { name: 'Afficher le mot de passe' });
    expect(pwd).toHaveAttribute('type', 'password');
    await user.click(toggle);
    expect(pwd).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Masquer le mot de passe' })).toBeInTheDocument();
  });

  it('soumet les identifiants à signIn en mode credentials sans redirection serveur', async () => {
    const user = userEvent.setup();
    stubFetch({ session: { user: { role: 'ADMIN' } } });
    mockSignIn.mockResolvedValue({ ok: true, error: null, status: 200, url: '' });
    render(<LoginPage />);
    await user.type(screen.getByLabelText('Adresse e-mail'), 'admin@suivisante.mg');
    await user.type(screen.getByLabelText('Mot de passe'), 'x');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith(
        'credentials',
        expect.objectContaining({
          email: 'admin@suivisante.mg',
          redirect: false,
        }),
      );
    });
  });

  it('affiche "Identifiants incorrects" quand les identifiants sont refusés', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch({ lockout: { locked: false } });
    mockSignIn.mockResolvedValue({ ok: false, error: 'CredentialsSignin', status: 401, url: '' });
    render(<LoginPage />);
    await user.type(screen.getByLabelText('Adresse e-mail'), 'admin@suivisante.mg');
    await user.type(screen.getByLabelText('Mot de passe'), 'mauvais');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Identifiants incorrects');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/session/lockout',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('affiche la durée de verrouillage quand le compte est bloqué', async () => {
    const user = userEvent.setup();
    stubFetch({ lockout: { locked: true, remainingMs: 120_000 } });
    mockSignIn.mockResolvedValue({ ok: false, error: 'CredentialsSignin', status: 401, url: '' });
    render(<LoginPage />);
    await user.type(screen.getByLabelText('Adresse e-mail'), 'admin@suivisante.mg');
    await user.type(screen.getByLabelText('Mot de passe'), 'x');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Compte temporairement verrouillé');
    expect(alert).toHaveTextContent('2 minutes');
  });

  it("retombe sur le message générique si l'API de verrouillage est indisponible", async () => {
    const user = userEvent.setup();
    stubFetch({ lockout: { ok: false } });
    mockSignIn.mockResolvedValue({ ok: false, error: 'CredentialsSignin', status: 401, url: '' });
    render(<LoginPage />);
    await user.type(screen.getByLabelText('Adresse e-mail'), 'admin@suivisante.mg');
    await user.type(screen.getByLabelText('Mot de passe'), 'x');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Identifiants incorrects');
  });

  it('redirige vers /portail pour un rôle externe PORTAIL_CLIENT', async () => {
    const user = userEvent.setup();
    const location = stubLocation();
    stubFetch({ session: { user: { role: 'PORTAIL_CLIENT' } } });
    mockSignIn.mockResolvedValue({ ok: true, error: null, status: 200, url: '' });
    render(<LoginPage />);
    await user.type(screen.getByLabelText('Adresse e-mail'), 'client@externe.mg');
    await user.type(screen.getByLabelText('Mot de passe'), 'x');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    await waitFor(() => {
      expect(location.href).toBe('/portail');
    });
  });

  it('redirige vers /portail pour un rôle externe CONTACT_ENTREPRISE', async () => {
    const user = userEvent.setup();
    const location = stubLocation();
    stubFetch({ session: { user: { role: 'CONTACT_ENTREPRISE' } } });
    mockSignIn.mockResolvedValue({ ok: true, error: null, status: 200, url: '' });
    render(<LoginPage />);
    await user.type(screen.getByLabelText('Adresse e-mail'), 'contact@entreprise.mg');
    await user.type(screen.getByLabelText('Mot de passe'), 'x');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    await waitFor(() => {
      expect(location.href).toBe('/portail');
    });
  });

  it('redirige vers / pour un rôle interne', async () => {
    const user = userEvent.setup();
    const location = stubLocation();
    stubFetch({ session: { user: { role: 'ADMIN' } } });
    mockSignIn.mockResolvedValue({ ok: true, error: null, status: 200, url: '' });
    render(<LoginPage />);
    await user.type(screen.getByLabelText('Adresse e-mail'), 'admin@suivisante.mg');
    await user.type(screen.getByLabelText('Mot de passe'), 'x');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    await waitFor(() => {
      expect(location.href).toBe('/');
    });
  });
});
