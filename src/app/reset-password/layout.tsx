import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Réinitialisation du mot de passe',
  description: 'Réinitialiser votre mot de passe Suivi Santé.',
};

export default function ResetPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
