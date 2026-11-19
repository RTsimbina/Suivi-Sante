'use client';

/**
 * Bascule de thème de la page de connexion.
 * Même cycle que le ThemeToggle partagé (clair → sombre → système) et mêmes
 * libellés, en variante locale de 44 px : le composant partagé fait 32 px et
 * est utilisé par toutes les autres pages (hors périmètre de cette refonte).
 */
import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

export function LoginThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  if (!mounted) {
    // Avant hydratation : coquille non interactive (même logique que le toggle partagé).
    return (
      <span
        aria-hidden="true"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-suivi-brand/30 bg-card/60 text-suivi-ink-soft"
      >
        <Sun className="h-4 w-4" />
      </span>
    );
  }

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const icon =
    theme === 'dark' ? (
      <Moon className="h-4 w-4" aria-hidden="true" />
    ) : theme === 'light' ? (
      <Sun className="h-4 w-4" aria-hidden="true" />
    ) : (
      <Monitor className="h-4 w-4" aria-hidden="true" />
    );

  const label = theme === 'dark' ? 'Sombre' : theme === 'light' ? 'Clair' : 'Auto';

  return (
    <button
      type="button"
      onClick={cycleTheme}
      title={theme === 'dark' ? 'Mode sombre' : theme === 'light' ? 'Mode clair' : 'Système'}
      aria-label={`Changer de thème (actuel : ${label})`}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-suivi-brand/30 bg-card/60 text-suivi-ink-soft transition-colors hover:border-suivi-brand hover:text-suivi-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-suivi-brand dark:focus-visible:outline-suivi-brand-clair"
    >
      {icon}
    </button>
  );
}
