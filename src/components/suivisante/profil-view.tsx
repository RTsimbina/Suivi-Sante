'use client';

/**
 * Vue Profil — page d'assemblage (refactoring P2 : le monolithe de 475 lignes
 * est découpé dans le dossier `profil/`).
 *
 * Rôle de cette page principale :
 *  - orchestration : le hook use-profil (profil, historique, mot de passe,
 *    avatar) et le libellé de rôle dérivé de la session ;
 *  - affichage transverse : chargement et état « profil indisponible » ;
 *  - délégation : ProfilHeader, ProfilAvatar, ProfilMotDePasse et
 *    ProfilHistorique.
 */
import { User, Loader2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { ROLE_LABELS } from '@/lib/auth-context';
import type { RoleType } from '@/lib/auth-context';
import ProfilHeader from './profil/profil-header';
import ProfilAvatar from './profil/profil-avatar';
import ProfilMotDePasse from './profil/profil-mot-de-passe';
import ProfilHistorique from './profil/profil-historique';
import { useProfil } from './profil/use-profil';

export default function ProfilView() {
  const { data: session } = useSession();
  const profil = useProfil();

  const role = (session?.user?.role as RoleType) || '';
  const roleLabel = ROLE_LABELS[role] ?? role;

  if (profil.loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!profil.profil) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <User className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Impossible de charger le profil.</p>
        <p className="text-xs text-muted-foreground mt-1">Vérifiez votre connexion et réessayez.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* En-tête profil */}
      <ProfilHeader profil={profil.profil} roleLabel={roleLabel} />

      {/* Sélection avatar */}
      <ProfilAvatar
        currentAvatar={profil.profil.avatar}
        avatarLoading={profil.avatarLoading}
        onChanger={profil.handleChangeAvatar}
      />

      {/* Changement mot de passe */}
      <ProfilMotDePasse
        ancienMdp={profil.ancienMdp}
        onAncienChange={profil.setAncienMdp}
        nouveauMdp={profil.nouveauMdp}
        onNouveauChange={profil.setNouveauMdp}
        confirmMdp={profil.confirmMdp}
        onConfirmChange={profil.setConfirmMdp}
        submittingMdp={profil.submittingMdp}
        onSubmit={profil.handleChangeMdp}
      />

      {/* Traçabilité — Historique des modifications */}
      <ProfilHistorique historique={profil.historique} loading={profil.loadingHistorique} />
    </div>
  );
}
