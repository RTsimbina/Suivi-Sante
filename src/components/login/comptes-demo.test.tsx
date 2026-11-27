// @vitest-environment jsdom
/**
 * Tests du composant ComptesDemo — bloc « Comptes de démonstration ».
 * ────────────────────────────────────────────────────────────────────────────
 * Couvre les DEUX variantes et la garde d'environnement :
 *   1. hors NEXT_PUBLIC_ENV_DEMO=OUI : aucun rendu (production) ;
 *   2. mode défaut (page /login) : ouvert, grille 2 colonnes, clic →
 *      onChoisirCompte(email, mot de passe de SA catégorie) ;
 *   3. mode compact (sidebar de la page d'accueil) : replié par défaut,
 *      1 colonne, aide personnalisée, clic → connexion directe ;
 *   4. bouton de copie (identifiant) avec retour « Copié ».
 * Les 31 comptes affichés dérivent du catalogue comptes-demo.ts (source de
 * vérité du seed) — le clic transmet le mot de passe de la catégorie du
 * compte, jamais une valeur codée en dur par carte.
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComptesDemo } from './comptes-demo';

describe('ComptesDemo — bloc comptes de démonstration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('ne rend rien hors environnement de démonstration (production)', () => {
    const { container } = render(<ComptesDemo onChoisirCompte={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  describe('NEXT_PUBLIC_ENV_DEMO=OUI', () => {
    it('mode login : ouvert par défaut, grille 2 colonnes, 31 comptes du catalogue', () => {
      vi.stubEnv('NEXT_PUBLIC_ENV_DEMO', 'OUI');
      const { container } = render(<ComptesDemo onChoisirCompte={vi.fn()} />);
      expect(screen.getByText(/Comptes de démonstration \(31\)/)).toBeInTheDocument();
      expect(screen.getByText('admin@suivisante.mg')).toBeInTheDocument();
      expect(screen.getByText('portail.bni@suivisante.mg')).toBeInTheDocument();
      expect(container.querySelector('details')).toHaveAttribute('open');
      expect(container.querySelector('.sm\\:grid-cols-2')).not.toBeNull();
    });

    it('mode login : le clic transmet le compte et le mot de passe de SA catégorie', async () => {
      vi.stubEnv('NEXT_PUBLIC_ENV_DEMO', 'OUI');
      const user = userEvent.setup();
      const onChoisirCompte = vi.fn();
      render(<ComptesDemo onChoisirCompte={onChoisirCompte} />);
      await user.click(screen.getByText('admin@suivisante.mg'));
      expect(onChoisirCompte).toHaveBeenLastCalledWith('admin@suivisante.mg', 'SuiviSante@2026');
      await user.click(screen.getByText('rs-controle-medical@suivisante.mg'));
      expect(onChoisirCompte).toHaveBeenLastCalledWith('rs-controle-medical@suivisante.mg', 'SuiviSante@2026');
      await user.click(screen.getByText('portail.bni@suivisante.mg'));
      expect(onChoisirCompte).toHaveBeenLastCalledWith('portail.bni@suivisante.mg', 'Contact@2026');
    });

    it('mode compact (sidebar accueil) : replié par défaut, 1 colonne, aide personnalisée', () => {
      vi.stubEnv('NEXT_PUBLIC_ENV_DEMO', 'OUI');
      const { container } = render(
        <ComptesDemo
          compact
          onChoisirCompte={vi.fn()}
          libelleAide="Cliquez sur un compte pour vous connecter directement avec ce profil."
        />,
      );
      // Replié par défaut + grille mono-colonne (largeur sidebar)
      expect(container.querySelector('details')).not.toHaveAttribute('open');
      expect(container.querySelector('.sm\\:grid-cols-2')).toBeNull();
      // Aide personnalisée (connexion directe, pas de pré-remplissage ici)
      expect(screen.getByText(/vous connecter directement avec ce profil/)).toBeInTheDocument();
    });

    it('mode compact : le clic sur une carte (panneau replié) déclenche la connexion', () => {
      vi.stubEnv('NEXT_PUBLIC_ENV_DEMO', 'OUI');
      const onChoisirCompte = vi.fn();
      render(
        <ComptesDemo
          compact
          onChoisirCompte={onChoisirCompte}
          libelleAction="Cliquez pour vous connecter avec ce profil."
        />,
      );
      // Le contenu des <details> fermés reste dans le DOM : le clic déclenche
      // l'action (jsdom ne rend pas le panneau visible, mais l'écouteur existe)
      fireEvent.click(screen.getByText('facturation@hopital-principal.mg'));
      expect(onChoisirCompte).toHaveBeenCalledWith('facturation@hopital-principal.mg', 'Contact@2026');
    });

    it('copie l\u2019identifiant via le bouton de copie avec retour « Copié »', async () => {
      vi.stubEnv('NEXT_PUBLIC_ENV_DEMO', 'OUI');
      const user = userEvent.setup();
      const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });
      render(<ComptesDemo onChoisirCompte={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: "Copier l'identifiant admin@suivisante.mg" }));
      expect(writeText).toHaveBeenCalledWith('admin@suivisante.mg');
      expect(screen.getByRole('button', { name: /Copié/ })).toBeInTheDocument();
    });
  });
});
