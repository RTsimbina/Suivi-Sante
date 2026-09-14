// @vitest-environment jsdom
/**
 * Tests du basculeur de thème (Clair → Sombre → Auto → Clair).
 * Le cycle de thème avait été cassé par un audit antérieur — garde-fou.
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeToggle } from './theme-toggle';
import { useTheme } from 'next-themes';

vi.mock('next-themes', () => ({
  useTheme: vi.fn(),
}));

const mockUseTheme = vi.mocked(useTheme);
const setTheme = vi.fn();

/** Configure le mock useTheme avec un thème donné (cast large : type partiel voulu) */
const useThemeMock = (theme: string | undefined) =>
  mockUseTheme.mockReturnValue({ theme, setTheme } as unknown as ReturnType<typeof useTheme>);

describe('ThemeToggle', () => {
  beforeEach(() => {
    setTheme.mockClear();
  });

  it('affiche "Clair" quand theme = light', () => {
    useThemeMock('light');
    render(<ThemeToggle />);
    expect(screen.getByText('Clair')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Changer de thème \(actuel : Clair\)/ })).toBeInTheDocument();
  });

  it('affiche "Sombre" quand theme = dark', () => {
    useThemeMock('dark');
    render(<ThemeToggle />);
    expect(screen.getByText('Sombre')).toBeInTheDocument();
  });

  it('affiche "Auto" quand theme = system', () => {
    useThemeMock('system');
    render(<ThemeToggle />);
    expect(screen.getByText('Auto')).toBeInTheDocument();
  });

  it('cycle light → dark au clic', () => {
    useThemeMock('light');
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button'));
    expect(setTheme).toHaveBeenCalledTimes(1);
    expect(setTheme).toHaveBeenCalledWith('dark');
  });

  it('cycle dark → system au clic', () => {
    useThemeMock('dark');
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button'));
    expect(setTheme).toHaveBeenCalledWith('system');
  });

  it('cycle system → light au clic', () => {
    useThemeMock('system');
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button'));
    expect(setTheme).toHaveBeenCalledWith('light');
  });

  it('cycle undefined → light (valeur inconnue)', () => {
    useThemeMock(undefined);
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button'));
    expect(setTheme).toHaveBeenCalledWith('light');
  });
});
