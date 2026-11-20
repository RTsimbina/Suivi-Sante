/**
 * Types et constantes de la vue Configuration (refactoring P2 — extraits du
 * monolithe configuration-view.tsx). Source unique partagée par le hook
 * use-bots-config et les présentateurs.
 */
import type { Bot } from 'lucide-react';

export interface BotStatus {
  nom: string;
  canal: string;
  actif: boolean;
  messagesTotal: number;
  icon: typeof Bot;
  couleur: string;
}

export interface MessageBot {
  id: string;
  canal: string;
  expeditieurId: string;
  expeditieurNom: string;
  message: string;
  reponse: string;
  lu: boolean;
  createdAt: string;
}

export interface SmtpConfigForm {
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  emailRapportDestinataire: string;
}

export interface SmtpConfigDB {
  id: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFrom: string;
  emailRapportDestinataire: string | null;
  actif: boolean;
  updatedAt: string;
}

export function formatDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export const CANAL_COLORS: Record<string, string> = {
  WHATSAPP: 'bg-green-100 text-green-700 border-green-200',
  TELEGRAM: 'bg-info-100 text-info-700 dark:text-info-300 border-info-200 dark:border-info-800',
  MESSENGER: 'bg-violet-100 text-violet-700 border-violet-200',
};
