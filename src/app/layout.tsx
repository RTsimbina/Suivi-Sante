import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}