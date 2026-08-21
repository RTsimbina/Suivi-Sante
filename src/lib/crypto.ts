/**
 * Utilitaire de chiffrement symétrique pour les secrets stockés en BDD.
 * Utilise AES-256-GCM (Node.js crypto natif).
 *
 * L'alternative au stockage en clair dans ConfigurationEmail.smtpPass.
 * La clé de chiffrement est tirée de SERVER_ENCRYPTION_KEY (env var).
 * Si la clé n'est pas définie, le texte est retourné tel quel (fallback).
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Dérive une clé AES-256 à partir d'une chaîne (SERVER_ENCRYPTION_KEY).
 * Utilise SHA-256 pour obtenir exactement 32 octets.
 */
function deriveKey(secret: string): Buffer {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Chiffre un texte clair. Retourne : base64(iv + authTag + ciphertext)
 */
export function encrypt(plaintext: string, secret: string): string {
  if (!secret) return plaintext; // Pas de clé = pas de chiffrement
  const crypto = require('crypto');
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
 * Si le déchiffrement échoue (mauvaise clé, format invalide), retourne le texte tel quel.
 */
export function decrypt(encrypted: string, secret: string): string {
  if (!secret) return encrypted; // Pas de clé = pas de déchiffrement
  try {
    const crypto = require('crypto');
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
    // Si le déchiffrement échoue, le mot de passe est peut-être en clair (ancien format)
    return encrypted;
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
