// @vitest-environment jsdom
/**
 * Tests du composant SharedPagination — pagination unique de la plateforme
 * (utilisée par dossiers, assurés, réception et journal).
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SharedPagination, PAGE_SIZE, type PaginationState } from './shared-pagination';

const state = (overrides: Partial<PaginationState> = {}): PaginationState => ({
  page: 2,
  limit: PAGE_SIZE,
  total: 60,
  totalPages: 3,
  ...overrides,
});

describe('SharedPagination', () => {
  it('ne rend rien quand il n\u2019y a qu\u2019une seule page', () => {
    const { container } = render(
      <SharedPagination pagination={state({ totalPages: 1 })} onPageChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('ne rend rien quand totalPages vaut 0 (liste vide)', () => {
    const { container } = render(
      <SharedPagination
        pagination={state({ page: 1, total: 0, totalPages: 0 })}
        onPageChange={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('affiche le libellé avec label singulier et pluriel', () => {
    render(
      <SharedPagination
        pagination={state({ page: 2, total: 1, totalPages: 3 })}
        onPageChange={vi.fn()}
        label="courriel"
      />,
    );
    // total=1 → pas de "s"
    expect(screen.getByText('1 courriel • Page 2 sur 3')).toBeInTheDocument();
  });

  it('met le label au pluriel quand total > 1', () => {
    render(
      <SharedPagination pagination={state()} onPageChange={vi.fn()} label="résultat" />,
    );
    expect(screen.getByText('60 résultats • Page 2 sur 3')).toBeInTheDocument();
  });

  it('affiche un libellé sans entité quand label est absent', () => {
    render(<SharedPagination pagination={state()} onPageChange={vi.fn()} />);
    expect(screen.getByText('Page 2 sur 3')).toBeInTheDocument();
  });

  it('désactive Précédent sur la première page et Suivant sur la dernière', () => {
    const { rerender } = render(
      <SharedPagination pagination={state({ page: 1 })} onPageChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Page précédente' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Page suivante' })).toBeEnabled();

    rerender(
      <SharedPagination pagination={state({ page: 3 })} onPageChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Page suivante' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Page précédente' })).toBeEnabled();
  });

  it('appelle onPageChange(page - 1) au clic sur Précédent', () => {
    const onPageChange = vi.fn();
    render(<SharedPagination pagination={state()} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Page précédente' }));
    expect(onPageChange).toHaveBeenCalledTimes(1);
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('appelle onPageChange(page + 1) au clic sur Suivant', () => {
    const onPageChange = vi.fn();
    render(<SharedPagination pagination={state()} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
    expect(onPageChange).toHaveBeenCalledTimes(1);
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('expose PAGE_SIZE = 20 pour toute la plateforme', () => {
    expect(PAGE_SIZE).toBe(20);
  });
});
