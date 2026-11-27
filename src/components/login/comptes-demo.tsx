'use client';

/**
 * Comptes de démonstration — page de connexion.
 * ────────────────────────────────────────────────────────────────────────────
 * SOURCE DE VÉRITÉ : le catalogue src/lib/comptes-demo.ts (COMPTES_DEMO), le
 * même que le seed (prisma/seed-demo.ts) et la documentation — l'affichage ne
 * peut plus diverger des comptes réellement créés (aucune liste en dur ici).
 *
 * GARDE D'ENVIRONNEMENT : le bloc (identifiants + mots de passe de test +
 * boutons de copie) ne s'affiche QUE si NEXT_PUBLIC_ENV_DEMO=OUI — variable
 * de build définie uniquement sur les environnements de démonstration /
 * recette. Sur tout autre environnement (production) le bloc ne rend rien :
 * aucun identifiant ni mot de passe n'est affiché.
 *
 * Mots de passe : mêmes valeurs que prisma/seed-demo.ts (PWD_INTERNE /
 * PWD_EXTERNE) et scripts/reset_seed.mjs — réservés aux environnements de
 * développement / test, posés à la CRÉATION des comptes par le seed.
 */
import { useState } from 'react';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { COMPTES_DEMO, type CompteDemo } from '@/lib/comptes-demo';
import { ROLE_LABELS } from '@/lib/referentiels';

/** Mots de passe de démonstration par catégorie (voir en-tête). */
const MOT_DE_PASSE_DEMO: Record<CompteDemo['categorie'], string> = {
  INTERNE: 'SuiviSante@2026',
  EXTERNE: 'Contact@2026',
};

const GROUPES_DEMO: { cle: CompteDemo['categorie']; titre: string }[] = [
  { cle: 'INTERNE', titre: 'Comptes internes (personnel de la caisse)' },
  { cle: 'EXTERNE', titre: 'Comptes externes (entreprises, assurés & prestataires)' },
];

/** Libellé de rôle + précision de service pour les responsables de service. */
const SERVICE_RS: Record<string, string> = {
  ACCUEIL: 'Accueil',
  TECHNIQUE: 'Technique',
  COMPTABILITE: 'Comptabilité',
  CONTROLE_MEDICAL: 'Contrôle médical',
};

function libelleRole(compte: CompteDemo): string {
  const base = ROLE_LABELS[compte.role] ?? compte.role;
  if (compte.role === 'RESPONSABLE_SERVICE' && compte.serviceResponsable) {
    return `${base} · ${SERVICE_RS[compte.serviceResponsable] ?? compte.serviceResponsable}`;
  }
  return base;
}

/** Copie robuste : Clipboard API, avec repli execCommand (contexte non sécurisé). */
async function copierTexte(valeur: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(valeur);
      return true;
    }
  } catch {
    // Clipboard API refusée/indisponible — tentative de repli ci-dessous.
  }
  try {
    const zone = document.createElement('textarea');
    zone.value = valeur;
    zone.setAttribute('readonly', '');
    zone.style.position = 'fixed';
    zone.style.opacity = '0';
    document.body.appendChild(zone);
    zone.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(zone);
    return ok;
  } catch {
    return false;
  }
}

/** Bouton de copie avec retour visuel « Copié » (2 s). */
function BoutonCopier({ valeur, libelle, compact }: { valeur: string; libelle: string; compact?: boolean }) {
  const [copie, setCopie] = useState(false);

  async function gererCopie() {
    if (await copierTexte(valeur)) {
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    }
  }

  return (
    <button
      type="button"
      onClick={gererCopie}
      aria-label={copie ? `Copié — ${libelle}` : libelle}
      title={copie ? 'Copié !' : 'Copier'}
      className={`flex shrink-0 items-center justify-center rounded-full text-suivi-ink-soft transition-colors hover:text-suivi-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-suivi-brand dark:focus-visible:outline-suivi-brand-clair ${
        compact ? 'h-8 w-8' : 'h-6 w-6'
      }`}
    >
      {copie ? (
        <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </button>
  );
}

export function ComptesDemo({
  onPrefill,
}: {
  onPrefill: (email: string, password: string) => void;
}) {
  // Garde d'environnement : lu AU RENDU (inliné statiquement à la build par
  // Next.js — la condition devient constante dans le bundle de production).
  // Hors démonstration : aucun rendu, aucun identifiant affiché.
  const envDemo = process.env.NEXT_PUBLIC_ENV_DEMO === 'OUI';
  if (!envDemo || COMPTES_DEMO.length === 0) return null;

  return (
    // <details> ouvert par défaut : les comptes sont directement visibles
    // (le contenu reste repliable, donc les tests et le clavier passent).
    <details open className="group mt-4 rounded-2xl border border-dashed border-border bg-card">
      <summary className="flex min-h-11 cursor-pointer select-none list-none items-center justify-center gap-2 rounded-2xl px-4 text-xs font-medium text-suivi-ink-soft transition-colors hover:text-suivi-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-suivi-brand dark:focus-visible:outline-suivi-brand-clair [&::-webkit-details-marker]:hidden">
        Comptes de démonstration ({COMPTES_DEMO.length})
        <ChevronDown
          className="h-3.5 w-3.5 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="border-t border-dashed border-border p-4">
        <div className="space-y-3">
          {GROUPES_DEMO.map((groupe) => {
            const comptes = COMPTES_DEMO.filter((c) => c.categorie === groupe.cle);
            const mdp = MOT_DE_PASSE_DEMO[groupe.cle];
            if (comptes.length === 0) return null;
            return (
              <div key={groupe.cle} className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-suivi-ink-soft">
                  <span>
                    {groupe.titre} — mot de passe :{' '}
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{mdp}</code>
                  </span>
                  <BoutonCopier
                    valeur={mdp}
                    libelle={`Copier le mot de passe du groupe « ${groupe.titre} »`}
                  />
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {comptes.map((compte) => {
                    const mdpCompte = MOT_DE_PASSE_DEMO[compte.categorie];
                    return (
                      <div
                        key={compte.email}
                        className="flex min-h-11 items-center justify-between gap-1 rounded-lg border border-border bg-card transition-colors has-[button:active]:border-suivi-brand focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-suivi-brand dark:focus-within:outline-suivi-brand-clair"
                      >
                        {/* Zone cliquable principale : pré-remplit le formulaire */}
                        <button
                          type="button"
                          onClick={() => onPrefill(compte.email, mdpCompte)}
                          title={`${compte.nom} — ${compte.service}. ${compte.usage}. Cliquez pour pré-remplir le formulaire.`}
                          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left transition-colors hover:border-suivi-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-suivi-brand dark:focus-visible:outline-suivi-brand-clair"
                        >
                          <span className="min-w-0 break-all font-mono text-xs font-medium">
                            {compte.email}
                          </span>
                          <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-suivi-ink-soft">
                            {libelleRole(compte)}
                          </span>
                        </button>
                        {/* Boutons de copie — frères du bouton de pré-remplissage
                            (jamais imbriqués : un <button> ne peut pas en contenir un autre) */}
                        <span className="flex shrink-0 items-center pr-1.5">
                          <BoutonCopier
                            valeur={compte.email}
                            libelle={`Copier l'identifiant ${compte.email}`}
                            compact
                          />
                          <BoutonCopier
                            valeur={mdpCompte}
                            libelle={`Copier le mot de passe de ${compte.email}`}
                            compact
                          />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-center text-[11px] text-suivi-ink-soft">
          Cliquez sur un compte pour pré-remplir le formulaire, sur ⧉ pour copier
          l&apos;identifiant ou le mot de passe. Identifiants valables uniquement sur cet
          environnement de démonstration.
        </p>
      </div>
    </details>
  );
}
