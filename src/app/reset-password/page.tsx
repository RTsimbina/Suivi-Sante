'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Sparkles, Lock, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Vérifications de complexité du mot de passe
  const hasMinLength = newPassword.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const isStrong = hasMinLength && hasLetter && hasNumber && passwordsMatch;

  // Pas de token → afficher la demande d'envoi
  useEffect(() => {
    if (!token) {
      setError('Aucun token de réinitialisation fourni. Veuillez demander un nouveau lien depuis la page de connexion.');
    }
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Lien de réinitialisation invalide.');
      return;
    }

    if (!isStrong) {
      setError('Veuillez respecter tous les critères de sécurité.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
      } else {
        setError(data.message || 'Une erreur est survenue.');
      }
    } catch {
      setError('Erreur de connexion au serveur. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50/50 px-4 py-12">
        <div className="w-full max-w-md text-center">
          <div className="flex flex-col items-center mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 mb-3">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">SmartFlow IA</h1>
          </div>
          <Card className="rounded-xl border shadow-sm">
            <CardContent className="p-8">
              <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Mot de passe modifié</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Votre mot de passe a été mis à jour avec succès. Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
              </p>
              <Button
                onClick={() => router.push('/login')}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                size="lg"
              >
                Aller à la page de connexion
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50/50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 mb-3">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">SmartFlow IA</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Réinitialisation du mot de passe
          </p>
        </div>

        <Card className="rounded-xl border shadow-sm">
          <CardHeader className="pb-4 pt-6 px-6">
            <h2 className="text-lg font-semibold text-center">Nouveau mot de passe</h2>
            <p className="text-sm text-muted-foreground text-center">
              Choisissez un mot de passe fort et sécurisé
            </p>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Error */}
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Nouveau mot de passe */}
              <div className="space-y-2">
                <Label htmlFor="new-password">Nouveau mot de passe</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Minimum 8 caractères"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Critères de sécurité */}
              <div className="space-y-1.5 text-xs">
                <p className="font-medium text-muted-foreground mb-2">Critères de sécurité :</p>
                <div className={`flex items-center gap-2 ${hasMinLength ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${hasMinLength ? 'bg-emerald-600' : 'bg-gray-300'}`} />
                  Au moins 8 caractères
                </div>
                <div className={`flex items-center gap-2 ${hasLetter ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${hasLetter ? 'bg-emerald-600' : 'bg-gray-300'}`} />
                  Au moins une lettre
                </div>
                <div className={`flex items-center gap-2 ${hasNumber ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${hasNumber ? 'bg-emerald-600' : 'bg-gray-300'}`} />
                  Au moins un chiffre
                </div>
                <div className={`flex items-center gap-2 ${hasSpecial ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${hasSpecial ? 'bg-emerald-600' : 'bg-gray-300'}`} />
                  Un caractère spécial (recommandé)
                </div>
                <div className={`flex items-center gap-2 ${passwordsMatch ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${passwordsMatch ? 'bg-emerald-600' : 'bg-gray-300'}`} />
                  Les mots de passe correspondent
                </div>
              </div>

              {/* Confirmation */}
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmer le mot de passe</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Retapez le mot de passe"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                size="lg"
                disabled={loading || !isStrong}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Mise à jour en cours…
                  </>
                ) : (
                  'Réinitialiser le mot de passe'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Retour */}
        <div className="text-center mt-4">
          <button
            onClick={() => router.push('/login')}
            className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline"
          >
            Retour à la page de connexion
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50/50">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}