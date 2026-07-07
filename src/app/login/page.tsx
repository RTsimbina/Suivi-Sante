'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Sparkles, Mail, Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

const DEMO_CREDENTIALS = [
  { email: 'admin@smartflow.mg', role: 'Administrateur', color: 'bg-red-100 text-red-700 border-red-200' },
  { email: 'accueil@smartflow.mg', role: 'Accueil', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { email: 'technique@smartflow.mg', role: 'Technique', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { email: 'compta@smartflow.mg', role: 'Comptabilité', color: 'bg-green-100 text-green-700 border-green-200' },
  { email: 'utilisateur@smartflow.mg', role: 'Utilisateur', color: 'bg-purple-100 text-purple-700 border-purple-200' },
];

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      // Vérifier si le compte est verrouillé
      const emailTrimmed = email.toLowerCase().trim();
      const response = await fetch('/api/auth/check-lockout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailTrimmed }),
      });
      if (response.ok) {
        const lockData = await response.json();
        if (lockData.locked) {
          const mins = Math.ceil(lockData.remainingMs / 60000);
          setError(`Compte temporairement verrouillé. Réessayez dans ${mins} minute${mins > 1 ? 's' : ''}. Trop de tentatives échouées.`);
        } else {
          setError('Identifiants incorrects. Veuillez vérifier votre e-mail et mot de passe.');
        }
      } else {
        setError('Identifiants incorrects. Veuillez vérifier votre e-mail et mot de passe.');
      }
    } else if (result?.ok) {
      window.location.href = '/';
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50/50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 mb-3">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Suivi Santé</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Suivi des Dossiers Santé
          </p>
        </div>

        {/* Login Card */}
        <Card className="rounded-xl border shadow-sm">
          <CardHeader className="pb-4 pt-6 px-6">
            <h2 className="text-lg font-semibold text-center">Connexion</h2>
            <p className="text-sm text-muted-foreground text-center">
              Entrez vos identifiants pour accéder à la plateforme
            </p>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Error */}
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Adresse e-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="nom@suivisante.mg"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                    autoComplete="email"
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                    autoComplete="current-password"
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

              {/* Forgot password link */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const emailInput = (document.getElementById('email') as HTMLInputElement);
                    const emailVal = emailInput?.value?.trim();
                    if (emailVal) {
                      fetch('/api/auth/forgot-password', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: emailVal }),
                      }).then(r => r.json()).then(data => {
                        alert(data.message || 'Si un compte existe, un lien de réinitialisation a été envoyé.');
                      }).catch(() => alert('Erreur réseau. Veuillez réessayer.'));
                    } else {
                      window.location.href = '/reset-password';
                    }
                  }}
                  className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline"
                >
                  Mot de passe oublié ?
                </button>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                size="lg"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connexion en cours…
                  </>
                ) : (
                  'Se connecter'
                )}
              </Button>

              {/* Separator */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-muted-foreground">ou</span>
                </div>
              </div>

              {/* Google Login */}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => signIn('google', { callbackUrl: '/' })}
                disabled={loading}
              >
                <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Connexion avec Google
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Demo credentials */}
        <Card className="mt-6 rounded-xl border border-dashed shadow-none bg-muted/30">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground mb-3 text-center">
              Comptes de démonstration
            </p>
            <div className="space-y-2">
              {DEMO_CREDENTIALS.map((cred) => (
                <button
                  key={cred.email}
                  type="button"
                  onClick={() => {
                    setEmail(cred.email);
                    setPassword('SmartFlow@2026');
                    setError('');
                  }}
                  className={`w-full flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-all cursor-pointer hover:shadow-sm hover:scale-[1.01] active:scale-[0.99] ${cred.color}`}
                >
                  <span className="font-mono text-xs font-medium">
                    {cred.email}
                  </span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/60">
                    {cred.role}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground text-center mt-3">
              Mot de passe commun : <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-[11px]">SmartFlow@2026</code>
            </p>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          © 2026 Suivi Santé — Tous droits réservés
        </p>
      </div>
    </div>
  );
}