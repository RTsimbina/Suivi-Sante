'use client';

import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  if (!mounted) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs font-medium"
      >
        <Sun className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Clair</span>
      </Button>
    );
  }

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const icon =
    theme === 'dark' ? (
      <Moon className="h-3.5 w-3.5" />
    ) : theme === 'light' ? (
      <Sun className="h-3.5 w-3.5" />
    ) : (
      <Monitor className="h-3.5 w-3.5" />
    );

  const label =
    theme === 'dark' ? 'Sombre' : theme === 'light' ? 'Clair' : 'Auto';

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      onClick={cycleTheme}
      title={theme === 'dark' ? 'Mode sombre' : theme === 'light' ? 'Mode clair' : 'Système'}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}