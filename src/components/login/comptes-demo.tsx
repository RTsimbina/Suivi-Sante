'use client';

/**
 * Comptes de démonstration — workflow « Jeu de données de test (reset + seed) »
 * (seed.yml → scripts/reset_seed.mjs). Deux mots de passe distincts, un par
 * groupe — PWD_INTERNE / PWD_EXTERNE de scripts/reset_seed.mjs.
 *
 * Affichés dans TOUS les environnements (demande produit) : la base est
 * systématiquement (re)seedée par le workflow ci-dessus, les identifiants
 * affichés correspondent donc toujours aux comptes réellement présents.
 */
import { ChevronDown } from 'lucide-react';

type CompteDemo = {
  email: string;
  role: string;
  password: string;
  groupe: 'internes' | 'externes';
};

const DEMO_CREDENTIALS: CompteDemo[] = [
  // ── Comptes internes (personnel de la caisse) — SuiviSante@2026 ──
  { email: 'admin@suivisante.mg', role: 'Administrateur', password: 'SuiviSante@2026', groupe: 'internes' },
  { email: 'accueil@suivisante.mg', role: 'Accueil', password: 'SuiviSante@2026', groupe: 'internes' },
  { email: 'technique@suivisante.mg', role: 'Service Technique', password: 'SuiviSante@2026', groupe: 'internes' },
  { email: 'compta@suivisante.mg', role: 'Comptabilité', password: 'SuiviSante@2026', groupe: 'internes' },
  { email: 'sante@suivisante.mg', role: 'Contrôle Santé', password: 'SuiviSante@2026', groupe: 'internes' },
  // ── Comptes externes (portails) — Contact@2026 ──
  { email: 'portail.sanlam@suivisante.mg', role: 'Client / Assuré', password: 'Contact@2026', groupe: 'externes' },
  { email: 'portail.telma@suivisante.mg', role: 'Client / Assuré', password: 'Contact@2026', groupe: 'externes' },
  { email: 'contact.sanlam@sanlam.mg', role: 'Entreprise Cliente', password: 'Contact@2026', groupe: 'externes' },
  { email: 'contact.telma@telma.mg', role: 'Entreprise Cliente', password: 'Contact@2026', groupe: 'externes' },
  { email: 'contact.airtel@airtel.mg', role: 'Entreprise Cliente', password: 'Contact@2026', groupe: 'externes' },
  { email: 'contact.bni@bni.mg', role: 'Entreprise Cliente', password: 'Contact@2026', groupe: 'externes' },
  { email: 'contact.jirama@jirama.mg', role: 'Entreprise Cliente', password: 'Contact@2026', groupe: 'externes' },
  { email: 'facturation@hopital-principal.mg', role: 'Prestataire', password: 'Contact@2026', groupe: 'externes' },
  { email: 'contact@clinique-saintemarie.mg', role: 'Prestataire', password: 'Contact@2026', groupe: 'externes' },
];

const GROUPES_DEMO: { cle: CompteDemo['groupe']; titre: string }[] = [
  { cle: 'internes', titre: 'Comptes internes' },
  { cle: 'externes', titre: 'Comptes externes (entreprises & prestataires)' },
];

export function ComptesDemo({
  onPrefill,
}: {
  onPrefill: (email: string, password: string) => void;
}) {
  if (DEMO_CREDENTIALS.length === 0) return null;

  return (
    // <details> ouvert par défaut : les comptes sont directement visibles
    // (le contenu reste repliable, donc les tests et le clavier passent).
    <details open className="group mt-4 rounded-2xl border border-dashed border-border bg-card">
      <summary className="flex min-h-11 cursor-pointer select-none list-none items-center justify-center gap-2 rounded-2xl px-4 text-xs font-medium text-suivi-ink-soft transition-colors hover:text-suivi-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-suivi-brand dark:focus-visible:outline-suivi-brand-clair [&::-webkit-details-marker]:hidden">
        Comptes de démonstration
        <ChevronDown
          className="h-3.5 w-3.5 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="border-t border-dashed border-border p-4">
        <div className="space-y-3">
          {GROUPES_DEMO.map((groupe) => {
            const comptes = DEMO_CREDENTIALS.filter((c) => c.groupe === groupe.cle);
            return (
              <div key={groupe.cle} className="space-y-1.5">
                <p className="text-[11px] font-semibold text-suivi-ink-soft">
                  {groupe.titre} — mot de passe :{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{comptes[0]?.password}</code>
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {comptes.map((cred) => (
                    <button
                      key={cred.email}
                      type="button"
                      onClick={() => onPrefill(cred.email, cred.password)}
                      className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-left transition-colors hover:border-suivi-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-suivi-brand dark:focus-visible:outline-suivi-brand-clair"
                    >
                      <span className="min-w-0 break-all font-mono text-xs font-medium">
                        {cred.email}
                      </span>
                      <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-suivi-ink-soft">
                        {cred.role}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-center text-[11px] text-suivi-ink-soft">
          Cliquez sur un compte pour pré-remplir le formulaire de connexion.
        </p>
      </div>
    </details>
  );
}
