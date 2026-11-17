'use client';

/**
 * Page Portail client (découpage P2-01) — l'ancien monolithe de 829 lignes
 * est réparti dans src/components/portail/ :
 *   - contenu-portail.tsx  : session/redirections, coque (header + période) ;
 *   - use-portail-data.ts  : chargement + pagination serveur des dossiers ;
 *   - portail-assure.tsx   : vue assuré (infos, KPIs, onglets) ;
 *   - portail-entreprise.tsx : vue entreprise ;
 *   - portail-commun.tsx   : KPIs, carte dossier, pagination, exports ;
 *   - exports.ts           : téléchargements CSV / PDF (jsPDF) ;
 *   - utils.tsx / types.ts : formats, libellés, types.
 * Comportements, permissions, responsive et règles métier inchangés.
 */

import { Suspense } from 'react';
import { PeriodeProvider } from '@/lib/periode-context';
import ContenuPortail from '@/components/portail/contenu-portail';

export default function PortailPage() {
  return (
    // useSearchParams (période + onglet) exige une limite Suspense pour le prerender
    <Suspense fallback={null}>
      <PeriodeProvider>
        <ContenuPortail />
      </PeriodeProvider>
    </Suspense>
  );
}
