/**
 * Utilitaire de chiffrement symétrique pour les secrets stockés en BDD.
 * Utilise AES-256-GCM (Node.js crypto natif).
 *
 * Alternative au stockage en clair dans ConfigurationEmail.smtpPass.
 * La clé de chiffrement est tirée de SERVER_ENCRYPTION_KEY (env var).
 *
 * ⚠️ FAIL-CLOSED : SERVER_ENCRYPTION_KEY est OBLIGATOIRE. Les anciens
 * fallbacks silencieux (« pas de clé → texte stocké/retourné tel quel »)
 * produisaient des mots de passe illisibles à l'envoi (erreurs 535
 * incompréhensibles) et masquaient une configuration serveur incomplète.
 * Désormais, toute opération sans clé — ou avec une clé qui ne correspond
 * pas — lève une erreur explicite et actionnable.
 */

import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Dérive une clé AES-256 à partir d'une chaîne (SERVER_ENCRYPTION_KEY).
 * Utilise SHA-256 pour obtenir exactement 32 octets.
 */
function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Chiffre un texte clair. Retourne : base64(iv + authTag + ciphertext)
 * @throws si `secret` (SERVER_ENCRYPTION_KEY) est absent — aucun secret
 *         ne doit jamais être stocké en clair en base.
 */
export function encrypt(plaintext: string, secret: string): string {
  if (!secret) {
    throw new Error(
      'SERVER_ENCRYPTION_KEY manquante : refus de stocker un secret en clair. ' +
        'Définissez la variable SERVER_ENCRYPTION_KEY avant de sauvegarder la configuration SMTP.'
    );
  }
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  // Concaténer : iv (12) + authTag (16) + ciphertext
  const combined = Buffer.concat([iv, authTag, Buffer.from(encrypted, 'hex')]);
  return combined.toString('base64');
}

/**
 * Déchiffre un texte chiffré par encrypt().
 * @throws si `secret` est absent (SERVER_ENCRYPTION_KEY non configurée) ou si
 *         le déchiffrement échoue (clé différente de celle du chiffrement,
 *         donnée corrompue, ancien mot de passe stocké en clair) — avec un
 *         message actionnable plutôt qu'un mot de passe illisible.
 */
export function decrypt(encrypted: string, secret: string): string {
  if (!secret) {
    throw new Error(
      'SERVER_ENCRYPTION_KEY manquante : impossible de déchiffrer le secret stocké en base. ' +
        'Définissez SERVER_ENCRYPTION_KEY (même valeur que lors du chiffrement) puis redéployez.'
    );
  }
  try {
    const key = deriveKey(secret);
    const combined = Buffer.from(encrypted, 'base64');

    if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      return encrypted; // Trop court pour être chiffré
    }

    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    // Clé différente de celle du chiffrement, donnée corrompue, ou ancien
    // mot de passe stocké en clair (format hérité). On échoue bruyamment
    // avec la marche à suivre, au lieu de renvoyer un garbage silencieux.
    throw new Error(
      'Déchiffrement impossible : SERVER_ENCRYPTION_KEY incorrecte ou donnée non chiffrée. ' +
        'Re-sauvegardez la configuration SMTP depuis la page Configuration pour la chiffrer avec la clé courante.'
    );
  }
}

/**
 * Vérifie si une valeur semble être déjà chiffrée (base64 avec les bons headers).
 * Utilisé pour décider s'il faut chiffrer ou non lors d'une mise à jour.
 */
export function isEncrypted(value: string, secret: string): boolean {
  if (!secret || !value) return false;
  try {
    const combined = Buffer.from(value, 'base64');
    return combined.length >= IV_LENGTH + AUTH_TAG_LENGTH + 1;
  } catch {
    return false;
  }
}
