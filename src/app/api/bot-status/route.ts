import { NextResponse } from 'next/server';

export async function GET() {
  const status = {
    whatsapp: {
      actif: !!process.env.WHATSAPP_ACCESS_TOKEN && !!process.env.WHATSAPP_PHONE_NUMBER_ID,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ? 'configuré' : undefined,
      details: !process.env.WHATSAPP_ACCESS_TOKEN ? 'WHATSAPP_ACCESS_TOKEN manquant' :
               !process.env.WHATSAPP_PHONE_NUMBER_ID ? 'WHATSAPP_PHONE_NUMBER_ID manquant' : 'Opérationnel',
    },
    telegram: {
      actif: !!process.env.TELEGRAM_BOT_TOKEN,
      details: !process.env.TELEGRAM_BOT_TOKEN ? 'TELEGRAM_BOT_TOKEN manquant' : 'Opérationnel',
    },
    messenger: {
      actif: !!process.env.MESSENGER_PAGE_ACCESS_TOKEN && !!process.env.MESSENGER_VERIFY_TOKEN,
      details: !process.env.MESSENGER_PAGE_ACCESS_TOKEN ? 'MESSENGER_PAGE_ACCESS_TOKEN manquant' :
               !process.env.MESSENGER_VERIFY_TOKEN ? 'MESSENGER_VERIFY_TOKEN manquant' : 'Opérationnel',
    },
    email: {
      actif: !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS,
      details: !process.env.SMTP_HOST ? 'SMTP_HOST manquant' :
               !process.env.SMTP_USER ? 'SMTP_USER manquant' : 'Opérationnel',
    },
    cron: {
      actif: process.env.CRON_ENABLED === 'true' && !!process.env.SMTP_HOST,
      details: process.env.CRON_ENABLED !== 'true' ? 'Désactivé (CRON_ENABLED=false)' :
               !process.env.SMTP_HOST ? 'SMTP non configuré' : 'Actif — 1er de chaque mois à 07h00',
    },
  };

  return NextResponse.json(status);
}