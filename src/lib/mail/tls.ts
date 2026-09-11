/**
 * Options TLS des connexions SMTP sortantes — STRICTES par défaut.
 * ──────────────────────────────────────────────────────────────────
 * `rejectUnauthorized: true` (valeur par défaut de Node) : le certificat du
 * serveur SMTP est validé contre le magasin de certificats (autorité,
 * chaîne, expiration, nom d'hôte). Un certificat auto-signé, expiré ou
 * incohérent fait échouer la connexion avec un message clair
 * (interpreterErreurSMTP) au lieu d'exposer identifiants et contenus des
 * courriels à un attaquant en position d'interception (MITM).
 *
 * L'ancien comportement (`rejectUnauthorized: false` sur les ports 465 ET
 * 587) désactivait toute validation : c'est le correctif « Constat n°2 »
 * de l'audit de sécurité. Si un serveur interne utilise réellement un
 * certificat auto-signé, ajoutez son certificat d'AC au magasin du système
 * (NODE_EXTRA_CA_CERTS) plutôt que de désactiver la validation.
 */

export function optionsTlsSmtp(): { rejectUnauthorized: boolean } {
  return { rejectUnauthorized: true };
}
