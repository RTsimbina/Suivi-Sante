'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Taille de page par défaut pour toute la plateforme */
export const PAGE_SIZE = 20;

export interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface SharedPaginationProps {
  /** Pagination state */
  pagination: PaginationState;
  /** Callback appelé avec le nouveau numéro de page */
  onPageChange: (page: number) => void;
  /** Label singulier pour l'entité (ex: "courriel", "résultat") */
  label?: string;
  /** Classe CSS supplémentaire pour le conteneur */
  className?: string;
}

/**
 * Composant de pagination unique pour toute la plateforme.
 * Affiche : "X élément(s) • Page N sur M" + boutons Précédent / Suivant.
 * Visible uniquement si totalPages > 1.
 */
export function SharedPagination({ pagination, onPageChange, label, className }: SharedPaginationProps) {
  const { page, total, totalPages } = pagination;

  if (totalPages <= 1) return null;

  const labelText = label
    ? `${total} ${label}${total > 1 ? 's' : ''} • Page ${page} sur ${totalPages}`
    : `Page ${page} sur ${totalPages}`;

  return (
    <div className={`flex items-center justify-between mt-4 pt-4 border-t ${className || ''}`}>
      <p className="text-xs text-muted-foreground">{labelText}</p>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
