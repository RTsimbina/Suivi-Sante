import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Portail Client',
  description: 'Portail client pour le suivi des dossiers de santé.',
};

export default function PortailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
