import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    template: '%s | Suivi Santé',
    default: 'Suivi Santé — Gestion des Dossiers de Santé',
  },
  description: 'Plateforme intelligente de suivi des dossiers de santé. Centralisation Excel, ISA et SAGE avec analyses IA en temps réel.',
  icons: {
    icon: '/favicon.svg',
  },
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    type: 'website',
    siteName: 'Suivi Santé',
    title: 'Suivi Santé — Gestion des Dossiers de Santé',
    description: 'Plateforme interne de suivi des dossiers de santé.',
    locale: 'fr_MG',
  },
  twitter: {
    card: 'summary',
    title: 'Suivi Santé',
    description: 'Plateforme interne de suivi des dossiers de santé.',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Nonce CSP généré par requête dans src/proxy.ts — transmis à next-thèmes
  // pour que son script inline (classe de thème avant peinture) soit autorisé
  // par la CSP sans 'unsafe-inline'. NB : rend toutes les pages dynamiques,
  // acceptable car l'application est intégralement derrière authentification.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers nonce={nonce}>
          {children}
        </Providers>
        {/* Toaster Radix — notifications du hook useToast() */}
        <Toaster />
        {/* Toaster sonner — notifications des vues utilisant toast() de 'sonner' ;
            sans lui, tous ces toasts étaient silencieux (constat audit n°3) */}
        <SonnerToaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}