'use client';

import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';

export type RoleType =
  | 'ADMINISTRATEUR'
  | 'ACCUEIL'
  | 'TECHNIQUE'
  | 'COMPTABILITE'
  | 'SANTE'
  | 'UTILISATEUR';

export const ROLE_LABELS: Record<RoleType, string> = {
  ADMINISTRATEUR: 'Administrateur',
  ACCUEIL: 'Accueil',
  TECHNIQUE: 'Service Technique',
  COMPTABILITE: 'Comptabilité',
  SANTE: 'Contrôle Santé',
  UTILISATEUR: 'Utilisateur',
};

interface AuthContextValue {
  user: {
    id: string;
    email: string;
    nom: string;
    role: string;
    avatar?: string | null;
  } | null;
  role: RoleType | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasRole: (...roles: RoleType[]) => boolean;
  roleLabel: string;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  role: null,
  isAuthenticated: false,
  isLoading: true,
  hasRole: () => false,
  roleLabel: '',
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  const user = session?.user ?? null;
  const role = (user?.role as RoleType) ?? null;
  const isAuthenticated = status === 'authenticated';
  const isLoading = status === 'loading';
  const roleLabel = role ? ROLE_LABELS[role] ?? role : '';

  const hasRole = useCallback(
    (...roles: RoleType[]) => {
      if (!role) return false;
      return roles.includes(role);
    },
    [role]
  );

  const value = useMemo(
    () => ({
      user,
      role,
      isAuthenticated,
      isLoading,
      hasRole,
      roleLabel,
    }),
    [user, role, isAuthenticated, isLoading, hasRole, roleLabel]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé dans un <AuthProvider>');
  }
  return context;
}