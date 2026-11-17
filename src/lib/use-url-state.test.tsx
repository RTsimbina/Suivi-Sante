// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOngletUrl } from './use-url-state';

// ─── Mock next/navigation (instances stables pour éviter les boucles) ──────
const { paramsInstance, pushSpy, replaceSpy, pathnameRef } = vi.hoisted(() => ({
  paramsInstance: new URLSearchParams(),
  pushSpy: vi.fn(),
  replaceSpy: vi.fn(),
  pathnameRef: { current: '/' },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameRef.current,
  useRouter: () => ({ push: pushSpy, replace: replaceSpy, back: vi.fn() }),
  useSearchParams: () => paramsInstance,
}));

const ONGLETS = ['societes', 'calcul', 'import', 'exclusions'] as const;

describe('useOngletUrl — onglets de vues synchronisés avec l\'URL', () => {
  beforeEach(() => {
    pushSpy.mockClear();
    replaceSpy.mockClear();
    pathnameRef.current = '/';
    // Reconstruit l'instance pour partir d'une URL propre à chaque test
    for (const cle of [...paramsInstance.keys()]) paramsInstance.delete(cle);
  });

  it('restaure l\'onglet depuis l\'URL (?onglet=calcul) — comportement F5', () => {
    paramsInstance.set('vue', 'technique');
    paramsInstance.set('onglet', 'calcul');
    const { result } = renderHook(() => useOngletUrl(ONGLETS, 'societes'));
    const [onglet] = result.current;
    expect(onglet).toBe('calcul');
  });

  it('retombe sur le défaut si le paramètre est absent', () => {
    const { result } = renderHook(() => useOngletUrl(ONGLETS, 'societes'));
    expect(result.current[0]).toBe('societes');
  });

  it('retombe sur le défaut si le paramètre est inconnu (liste fermée)', () => {
    paramsInstance.set('onglet', 'pirate');
    const { result } = renderHook(() => useOngletUrl(ONGLETS, 'societes'));
    expect(result.current[0]).toBe('societes');
  });

  it('change d\'onglet → router.push avec l\'URL mise à jour (préserve vue/periode)', () => {
    paramsInstance.set('vue', 'technique');
    paramsInstance.set('periodeMode', 'MENSUEL');
    const { result } = renderHook(() => useOngletUrl(ONGLETS, 'societes'));
    act(() => result.current[1]('exclusions'));
    expect(pushSpy).toHaveBeenCalledTimes(1);
    const cible = pushSpy.mock.calls[0][0] as string;
    expect(cible).toContain('vue=technique');
    expect(cible).toContain('periodeMode=MENSUEL');
    expect(cible).toContain('onglet=exclusions');
    expect(cible.startsWith('/')).toBe(true); // même pathname
  });

  it('revenir à l\'onglet par défaut SUPPRIME le paramètre (URL propre)', () => {
    paramsInstance.set('onglet', 'calcul');
    const { result } = renderHook(() => useOngletUrl(ONGLETS, 'societes'));
    act(() => result.current[1]('societes'));
    const cible = pushSpy.mock.calls[0][0] as string;
    expect(cible).not.toContain('onglet');
  });
});
