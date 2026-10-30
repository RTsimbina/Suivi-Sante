'use client';

/**
 * Select natif générique du module Utilisateurs (évite l'erreur Radix
 * SelectItem value=""). Extrait tel quel de l'ancien monolithe
 * utilisateurs-view.tsx.
 */
import { cn } from '@/lib/utils';

export default function FilterSelect({ value, onChange, options, className, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  placeholder?: string;
}) {
  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      className={cn(
        'h-9 text-sm rounded-md border border-input bg-background px-3 py-1 ring-offset-background',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer',
        className
      )}
    >
      <option value="">{placeholder || 'Tous'}</option>
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
