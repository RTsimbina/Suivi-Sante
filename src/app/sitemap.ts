import type { MetadataRoute } from 'next';

/**
 * Sitemap vide — cet outil est interne et ne doit pas être indexé.
 * Retourner un tableau vide plutôt que d'absence de fichier évite
 * les erreurs 404 et signale explicitement aux crawlers qu'il n'y a
 * aucune URL à explorer.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [];
}
