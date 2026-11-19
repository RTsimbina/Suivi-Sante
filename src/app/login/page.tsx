'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { HeartPulse, Mail, Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { LoginThemeToggle } from '@/components/login/theme-toggle';
import { ComptesDemo } from '@/components/login/comptes-demo';
import { loginContent } from '@/components/login/content';
import { ciblePostConnexion } from '@/lib/navigation';

// Comptes de démonstration : affichés dans tous les environnements — la base
// est (re)seedée par le workflow « Jeu de données de test (reset + seed) »,
// les identifiants affichés correspondent aux comptes réellement présents.

/** Formulaire de connexion (séparé pour lire l'URL sous une limite Suspense). */
function FormulaireLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [infoMotDePasse, setInfoMotDePasse] = useState('');
  const [loading, setLoading] = useState(false);

  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

  // Destination initiale : le proxy redirige les sessions expirées vers
  // /login?callbackUrl=<page consultée> ; après connexion, l'utilisateur
  // retrouve cette page (si elle est locale et autorisée pour son rôle —
  // la garde de rôle de la page de destination fait le reste).
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl');

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
      // Destination initiale (callbackUrl local, jamais /login lui-même) ;
      // sinon l'accueil. Les rôles sans navigation interne ont déjà été
      // redirigés vers leur portail dédié.
      window.location.href = ciblePostConnexion(callbackUrl) ?? '/';
    }
  }

  // Flux « mot de passe oublié » intégré à la page : message affiché dans la
  // page (role="status") — mêmes messages que l'ancien window.alert().
  function gererMotDePasseOublie() {
    if (email.trim()) {
      fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
        .then((r) => r.json())
        .then((data) =>
          setInfoMotDePasse(data.message || 'Si un compte existe, un lien de réinitialisation a été envoyé.')
        )
        .catch(() => setInfoMotDePasse('Erreur réseau. Veuillez réessayer.'));
    } else {
      window.location.href = '/reset-password';
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col bg-suivi-surface text-suivi-ink">
      {/* Lien d'évitement vers le formulaire */}
      <a
        href="#connexion-formulaire"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-suivi-brand focus:px-5 focus:py-2.5 focus:text-sm focus:font-medium focus:text-white"
      >
        Aller au formulaire de connexion
      </a>

      <main className="flex flex-1 flex-col lg:flex-row">
        {/* Colonne gauche — fond pâle (≥1024px) */}
        <div className="flex flex-col px-6 pb-6 pt-6 sm:px-10 lg:w-[56%] lg:px-14 lg:pb-8 lg:pt-8">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-suivi-brand">
                <HeartPulse className="h-5 w-5 text-white" aria-hidden="true" />
              </span>
              <span className="text-lg font-semibold tracking-tight">Suivi Santé</span>
            </div>
            <LoginThemeToggle />
          </header>

          <div className="my-auto max-w-xl py-10 lg:py-12">
            {loginContent.surtitre && (
              <p className="text-xl font-semibold tracking-tight text-suivi-rose lg:text-2xl">
                {loginContent.surtitre}
              </p>
            )}
            <h1 className="mt-3 text-4xl font-light leading-tight tracking-tight lg:text-5xl">
              {loginContent.titre}
            </h1>
            {loginContent.phrase && (
              <p className="mt-4 max-w-md text-base leading-relaxed text-suivi-ink-soft">
                {loginContent.phrase}
              </p>
            )}
          </div>

          {/* Besoin d'aide ? — bas de colonne sur ordinateur */}
          {supportEmail && (
            <p className="hidden text-sm text-suivi-ink-soft lg:block">
              Besoin d&rsquo;aide ?{' '}
              <a
                href={`mailto:${supportEmail}`}
                className="rounded font-medium text-suivi-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-suivi-brand dark:text-suivi-brand-clair dark:focus-visible:outline-suivi-brand-clair"
              >
                Contactez le support
              </a>
            </p>
          )}
        </div>

        {/* Colonne droite — aplat bleu ≥1024px, carte de connexion */}
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-8 sm:px-6 lg:w-[44%] lg:bg-suivi-brand lg:px-8 lg:py-12">
          <div className="w-full max-w-[420px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700">
            <Card className="rounded-2xl border-none shadow-lg shadow-suivi-brand/15">
              <CardHeader className="px-6 pb-2 pt-6 text-center lg:px-8">
                <h2 className="text-xl font-semibold tracking-tight">Connexion</h2>
                <p className="mt-1 text-sm leading-relaxed text-suivi-ink-soft">
                  Entrez vos identifiants pour accéder à la plateforme
                </p>
              </CardHeader>
              <CardContent className="px-6 pb-6 lg:px-8">
                <form id="connexion-formulaire" onSubmit={handleSubmit} className="space-y-4" tabIndex={-1}>
                  {/* Erreur de connexion */}
                  {error && (
                    <div
                      id="erreur-connexion"
                      role="alert"
                      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                    >
                      {error}
                    </div>
                  )}

                  {/* Réponse du flux mot de passe oublié */}
                  {infoMotDePasse && (
                    <div
                      id="info-mot-de-passe"
                      role="status"
                      className="rounded-xl border border-suivi-brand/20 bg-suivi-brand/5 px-4 py-3 text-sm leading-relaxed text-suivi-ink"
                    >
                      {infoMotDePasse}
                    </div>
                  )}

                  {/* E-mail */}
                  <div className="space-y-2">
                    <Label htmlFor="email">Adresse e-mail</Label>
                    <div className="relative">
                      <Mail
                        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-suivi-ink-soft"
                        aria-hidden="true"
                      />
                      <Input
                        id="email"
                        type="email"
                        placeholder="nom@suivisante.mg"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-11 rounded-xl pl-10 placeholder:text-suivi-ink-soft"
                        aria-describedby={error ? 'erreur-connexion' : undefined}
                        required
                        autoComplete="email"
                        disabled={loading}
                      />
                    </div>
                  </div>

                  {/* Mot de passe */}
                  <div className="space-y-2">
                    <Label htmlFor="password">Mot de passe</Label>
                    <div className="relative">
                      <Lock
                        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-suivi-ink-soft"
                        aria-hidden="true"
                      />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-11 rounded-xl pl-10 pr-12 placeholder:text-suivi-ink-soft"
                        aria-describedby={error ? 'erreur-connexion' : undefined}
                        required
                        autoComplete="current-password"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-suivi-ink-soft transition-colors hover:text-suivi-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-suivi-brand dark:focus-visible:outline-suivi-brand-clair"
                        aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                        aria-pressed={showPassword}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Mot de passe oublié */}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={gererMotDePasseOublie}
                      className="rounded-full px-3 py-2.5 text-sm font-medium text-suivi-brand underline-offset-4 hover:text-suivi-brand-forte hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-suivi-brand dark:text-suivi-brand-clair dark:hover:text-suivi-brand-clair dark:focus-visible:outline-suivi-brand-clair"
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>

                  {/* Connexion */}
                  <Button
                    type="submit"
                    className="h-12 w-full rounded-full bg-suivi-brand text-base font-medium text-white hover:bg-suivi-brand-forte focus-visible:ring-suivi-brand focus-visible:ring-offset-2 focus-visible:ring-offset-card dark:focus-visible:ring-suivi-brand-clair"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Connexion en cours…
                      </>
                    ) : (
                      'Se connecter'
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Comptes de démonstration — tous environnements */}
            <ComptesDemo
              onPrefill={(courriel, motDePasse) => {
                setEmail(courriel);
                setPassword(motDePasse);
                setError('');
              }}
            />
          </div>

          {/* Besoin d'aide ? — sous la carte sur mobile */}
          {supportEmail && (
            <p className="mt-6 text-center text-sm text-suivi-ink-soft lg:hidden">
              Besoin d&rsquo;aide ?{' '}
              <a
                href={`mailto:${supportEmail}`}
                className="rounded font-medium text-suivi-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-suivi-brand dark:text-suivi-brand-clair dark:focus-visible:outline-suivi-brand-clair"
              >
                Contactez le support
              </a>
            </p>
          )}
        </div>
      </main>

      {/* Pied discret */}
      <footer className="px-6 pb-6 text-center text-xs leading-relaxed text-suivi-ink-soft lg:absolute lg:bottom-0 lg:left-auto lg:right-0 lg:w-[44%] lg:pb-5 lg:text-white/75">
        <p>
          © {new Date().getFullYear()} Suivi Santé — Tous droits réservés
          {loginContent.legal && <span className="block">{loginContent.legal}</span>}
        </p>
      </footer>
    </div>
  );
}

/**
 * Page de connexion : le formulaire lit le callbackUrl via useSearchParams,
 * qui exige une limite Suspense pour le prerender statique.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <FormulaireLogin />
    </Suspense>
  );
}
