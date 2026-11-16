'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Sparkles, Mail, Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';

// Jeu de données officiel : workflow « Jeu de données de test (reset + seed) »
// (seed.yml → scripts/reset_seed.mjs). Deux mots de passe distincts, un par
// groupe — PWD_INTERNE / PWD_EXTERNE de scripts/reset_seed.mjs.
type CompteDemo = {
  email: string;
  role: string;
  password: string;
  groupe: 'internes' | 'externes';
  color: string;
};

const DEMO_CREDENTIALS: CompteDemo[] = [
  // ── Comptes internes (personnel de la caisse) — SuiviSante@2026 ──
  { email: 'admin@suivisante.mg', role: 'Administrateur', password: 'SuiviSante@2026', groupe: 'internes', color: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800' },
  { email: 'accueil@suivisante.mg', role: 'Accueil', password: 'SuiviSante@2026', groupe: 'internes', color: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800' },
  { email: 'technique@suivisante.mg', role: 'Service Technique', password: 'SuiviSante@2026', groupe: 'internes', color: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800' },
  { email: 'compta@suivisante.mg', role: 'Comptabilité', password: 'SuiviSante@2026', groupe: 'internes', color: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800' },
  { email: 'sante@suivisante.mg', role: 'Contrôle Santé', password: 'SuiviSante@2026', groupe: 'internes', color: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800' },
  // ── Comptes externes (portails) — Contact@2026 ──
  { email: 'portail.sanlam@suivisante.mg', role: 'Client / Assuré', password: 'Contact@2026', groupe: 'externes', color: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800' },
  { email: 'portail.telma@suivisante.mg', role: 'Client / Assuré', password: 'Contact@2026', groupe: 'externes', color: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800' },
  { email: 'contact.sanlam@sanlam.mg', role: 'Entreprise Cliente', password: 'Contact@2026', groupe: 'externes', color: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-800' },
  { email: 'contact.telma@telma.mg', role: 'Entreprise Cliente', password: 'Contact@2026', groupe: 'externes', color: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-800' },
  { email: 'contact.airtel@airtel.mg', role: 'Entreprise Cliente', password: 'Contact@2026', groupe: 'externes', color: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-800' },
  { email: 'contact.bni@bni.mg', role: 'Entreprise Cliente', password: 'Contact@2026', groupe: 'externes', color: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-800' },
  { email: 'j.rakotoarison@jirama.mg', role: 'Entreprise Cliente', password: 'Contact@2026', groupe: 'externes', color: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-800' },
  { email: 'facturation@hopital-principal.mg', role: 'Prestataire', password: 'Contact@2026', groupe: 'externes', color: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800' },
  { email: 'contact@clinique-saintemarie.mg', role: 'Prestataire', password: 'Contact@2026', groupe: 'externes', color: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800' },
];

const GROUPES_DEMO: { cle: CompteDemo['groupe']; titre: string }[] = [
  { cle: 'internes', titre: 'Comptes internes' },
  { cle: 'externes', titre: 'Comptes externes (entreprises & prestataires)' },
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
      const response = await fetch('/api/session/lockout', {
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
      // Récupérer la session pour déterminer la redirection selon le rôle
      try {
        const sessionRes = await fetch('/api/auth/session');
        if (sessionRes.ok) {
          const sessionData = await sessionRes.json();
          const role = sessionData?.user?.role;
          if (role === 'PORTAIL_CLIENT' || role === 'CONTACT_ENTREPRISE') {
            window.location.href = '/portail';
            return;
          }
          if (role === 'PRESTATAIRE') {
            window.location.href = '/portail-prestataire';
            return;
          }
        }
      } catch {
        // En cas d'erreur, redirection par défaut
      }
      window.location.href = '/';
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-12 relative">
      {/* Theme toggle in top-right */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
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
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300"
                >
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
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    aria-pressed={showPassword}
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
                  className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:underline"
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

            </form>
          </CardContent>
        </Card>

        {/* Demo credentials */}
        <Card className="mt-6 rounded-xl border border-dashed shadow-none bg-muted/30">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground mb-3 text-center">
              Comptes de démonstration
            </p>
            <div className="space-y-4">
              {GROUPES_DEMO.map((groupe) => {
                const comptes = DEMO_CREDENTIALS.filter((c) => c.groupe === groupe.cle);
                return (
                  <div key={groupe.cle} className="space-y-2">
                    <p className="text-[11px] font-semibold text-muted-foreground">
                      {groupe.titre} — mot de passe :{' '}
                      <code className="font-mono bg-muted px-1.5 py-0.5 rounded">{comptes[0]?.password}</code>
                    </p>
                    {comptes.map((cred) => (
                      <button
                        key={cred.email}
                        type="button"
                        onClick={() => {
                          setEmail(cred.email);
                          setPassword(cred.password);
                          setError('');
                        }}
                        className={`w-full flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-all cursor-pointer hover:shadow-sm hover:scale-[1.01] active:scale-[0.99] ${cred.color}`}
                      >
                        <span className="font-mono text-xs font-medium">
                          {cred.email}
                        </span>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-background/60 whitespace-nowrap">
                          {cred.role}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground text-center mt-3">
              Cliquez sur un compte pour pré-remplir le formulaire de connexion.
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