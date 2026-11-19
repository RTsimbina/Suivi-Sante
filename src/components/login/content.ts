/**
 * Contenu éditorial de la page de connexion.
 * Centralisé ici : le composant n'embarque aucun texte codé en dur.
 * Une valeur vide masque l'élément correspondant à l'affichage.
 */
export const loginContent = {
  /** Sur-titre affiché en rose au-dessus du H1 (grande taille uniquement). */
  surtitre: 'Portail Suivi Santé',
  /** Titre principal (H1) de la colonne gauche. */
  titre: 'Le suivi de vos dossiers de santé',
  /** Phrase courte sous le H1. */
  phrase: 'Connectez-vous pour accéder à votre espace personnel ou prestataire.',
  // [À COMPLÉTER] : mention légale (éditeur, hébergeur, enregistrement…).
  // Laisser vide pour masquer la ligne du pied de page.
  legal: '',
} as const;
