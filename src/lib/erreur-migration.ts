/**
 * Traduit une erreur de base de données en message actionnable pour l'admin.
 *
 * Cas historique (incident du 16/09/2026) : le code référençait la colonne
 * Societe.emailContactPrincipal (ajoutée au schéma Prisma) alors que la
 * migration 20260916120000 n'avait jamais été appliquée en production — le
 * build Vercel ne lançait pas « prisma migrate deploy ». Toute requête sur
 * la table Societe (même sans la nouvelle colonne : Prisma sélectionne tous
 * les champs scalaires sans select explicite) levait
 * « column ... does not exist » → 500 générique → « aucune liste trouvée »
 * dans Prestataires, Sociétés Client et Service Technique, sans explication.
 *
 * Le build applique désormais les migrations (package.json → prisma migrate
 * deploy) ; ce helper garde un message clair si une migration manque à
 * nouveau (déployer du code plus récent que la base, base restaurée, etc.).
 */
export function messageErreurBase(error: unknown, defaut: string): string {
  const brut =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (/column[\s\S]*does not exist|does not exist in|n'existe pas|n’existe pas/i.test(brut)) {
    return (
      'Base de données incomplète : une migration est en attente d’application. ' +
      'Redéployez l’application (le build exécute « prisma migrate deploy ») ' +
      'ou appliquez-la manuellement : npx prisma migrate deploy'
    );
  }
  return defaut;
}
