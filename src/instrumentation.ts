export async function register() {
  // Activer le cron d'envoi mensuel des rapports par email
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { demarrerCronMensuel } = await import('./lib/cron-email-mensuel');
    demarrerCronMensuel();
  }
}