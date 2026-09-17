import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Portail Prestataire — Suivi Santé',
  description: 'Espace prestataire de soins : barèmes, actes médicaux, factures et règlements.',
};

export default function PortailPrestataireLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
