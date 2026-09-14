// @vitest-environment jsdom
/**
 * Tests de la page de connexion — point d'entrée critique de la plateforme.
 * Couvre : rendu, comptes démo, bascule mot de passe, messages d'erreur
 * (identifiants incorrects / compte verrouillé) et redirections par rôle.
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './page';
import { signIn } from 'next-auth/react';
import { useTheme } from 'next-themes';

vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
}));

vi.mock('next-themes', () => ({
  useTheme: vi.fn(() => ({ theme: 'light', setTheme: vi.fn() })),
}));

const mockSignIn = vi.mocked(signIn);

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

  it('affiche les champs email / mot de passe et le bouton de connexion', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText('Adresse e-mail')).toBeInTheDocument();
    expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mot de passe oublié/ })).toBeInTheDocument();
  });

  it('affiche les 5 comptes de démonstration', () => {
    render(<LoginPage />);
    expect(screen.getByText('admin@suivisante.mg')).toBeInTheDocument();
    expect(screen.getByText('accueil@suivisante.mg')).toBeInTheDocument();
    expect(screen.getByText('technique@suivisante.mg')).toBeInTheDocument();
    expect(screen.getByText('compta@suivisante.mg')).toBeInTheDocument();
    expect(screen.getByText('sante@suivisante.mg')).toBeInTheDocument();
  });

  it('pré-remplit le formulaire au clic sur un compte de démonstration', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByText('admin@suivisante.mg'));
    expect(screen.getByLabelText('Adresse e-mail')).toHaveValue('admin@suivisante.mg');
    expect(screen.getByLabelText('Mot de passe')).toHaveValue('SuiviSante@2026');
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
