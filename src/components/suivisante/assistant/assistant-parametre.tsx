'use client';

/**
 * Présentateur d'un champ de paramètre de question de l'assistant (refactoring
 * P2 — extrait du monolithe assistant-view.tsx) : période avec presets et
 * dates personnalisées, numéro de dossier, ou liste d'options fournie par le
 * serveur (société, prestataire, assuré, statut, acte, année).
 */
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PERIODE_PRESETS } from './types';
import type { ParamKey } from '@/lib/assistant/types';

interface ChampParametreProps {
  def: { key: ParamKey; label: string; required?: boolean; aide?: string };
  valeur: string;
  options: Partial<Record<string, { id: string; label: string }[]>>;
  onChange: (v: string) => void;
}

export function ChampParametre({ def, valeur, options, onChange }: ChampParametreProps) {
  if (def.key === 'PERIODE') {
    const preset = valeur.split('|')[0] || 'ANNEE_COURANTE';
    const personnalisee = preset === 'PERSONNALISEE';
    const [, du = '', au = ''] = valeur.split('|');
    return (
      <div className="flex items-end gap-1.5 flex-wrap">
        <div>
          <label className="text-[10px] text-muted-foreground block mb-1">{def.label}{def.required ? ' *' : ''}</label>
          <Select value={preset} onValueChange={(v) => onChange(v === 'PERSONNALISEE' ? 'PERSONNALISEE||' : v)}>
            <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODE_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {personnalisee && (
          <>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Du</label>
              <Input type="date" value={du} onChange={(e) => onChange(`PERSONNALISEE|${e.target.value}|${au}`)} className="h-9 w-[140px] text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Au</label>
              <Input type="date" value={au} onChange={(e) => onChange(`PERSONNALISEE|${du}|${e.target.value}`)} className="h-9 w-[140px] text-xs" />
            </div>
          </>
        )}
      </div>
    );
  }

  if (def.key === 'DOSSIER') {
    return (
      <div>
        <label className="text-[10px] text-muted-foreground block mb-1">{def.label}{def.required ? ' *' : ''}</label>
        <Input
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.aide || 'DOS-AAAA-XXXXXX'}
          className="h-9 w-[190px] text-xs"
        />
      </div>
    );
  }

  // SOCIETE / PRESTATAIRE / ASSURE / STATUT / ACTE / ANNEE : listes fournies par le serveur
  const liste = options[def.key] ?? [];
  return (
    <div>
      <label className="text-[10px] text-muted-foreground block mb-1">{def.label}{def.required ? ' *' : ''}</label>
      <Select value={valeur || undefined} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-[210px] text-xs">
          <SelectValue placeholder={liste.length === 0 ? 'Aucune option disponible' : `Sélectionner...`} />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {liste.map((o) => (
            <SelectItem key={o.id} value={o.id} className="text-xs">{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
