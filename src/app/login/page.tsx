'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Sparkles, Mail, Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

const DEMO_CREDENTIALS = [
  { email: 'admin@smartflow.mg', role: 'Administrateur' },
  { email: 'accueil@smartflow.mg', role: 'Accueil' },
  { email: 'technique@smartflow.mg', role: 'Technique' },
  { email: 'compta@smartflow.mg', role: 'Comptabilité' },
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
          <h1 className="text-2xl font-bold tracking-tight">SmartFlow IA</h1>
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
                    placeholder="nom@smartflow.mg"
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
                <a
                  href="#"
                  className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline"
                >
                  Mot de passe oublié ?
                </a>
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
                  className="w-full flex items-center justify-between rounded-lg border bg-white px-3 py-2 text-sm hover:bg-emerald-50 hover:border-emerald-200 transition-colors cursor-pointer"
                >
                  <span className="font-mono text-xs text-foreground">
                    {cred.email}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {cred.role}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground text-center mt-3">
              Mot de passe : <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-[11px]">SmartFlow@2026</code>
            </p>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          © 2026 SmartFlow IA — Tous droits réservés
        </p>
      </div>
    </div>
  );
}