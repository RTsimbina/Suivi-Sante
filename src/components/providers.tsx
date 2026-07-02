'use client';

import { SessionProvider } from 'next-auth/react';
import { AuthProvider } from '@/lib/auth-context';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      refetchInterval={5 * 60 * 1000} // Vérifier la session toutes les 5 minutes
      refetchOnWindowFocus={true}
    >
      <AuthProvider>{children}</AuthProvider>
    </SessionProvider>
  );
}