'use client';

import { SessionProvider } from 'next-auth/react';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from 'next-themes';

export function Providers({
  children,
  nonce,
}: {
  children: React.ReactNode;
  /** Nonce CSP par requête (voir src/proxy.ts) — requis pour le script inline de next-thèmes */
  nonce?: string;
}) {
  return (
    <SessionProvider
      refetchInterval={5 * 60 * 1000}
      refetchOnWindowFocus={true}
    >
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
        nonce={nonce}
      >
        <AuthProvider>{children}</AuthProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}