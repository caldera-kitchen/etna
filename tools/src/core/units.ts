// The units registry: recognizes the unit that follows a quantity (SPEC §6).

import type { Quantity, UnitDef, UnitKind, UnitMatch } from './model.ts';
import { isPlural } from './quantity.ts';

const KINDS: UnitKind[] = ['mass', 'volume', 'length', 'size', 'piece', 'container', 'approximate', 'recipe'];

interface Form {
  /** Lower-cased spelling. */
  text: string;
  def: UnitDef;
}

export class UnitRegistry {
  readonly units: UnitDef[];
  /** Every accepted spelling, longest first, so `small bag` wins over `small`. */
  private readonly forms: Form[];

  constructor(units: UnitDef[]) {
    this.units = units;
    const forms: Form[] = [];
    for (const def of units) {
      const spellings = new Set<string>([def.name, ...(def.symbol ? [def.symbol] : []), ...(def.plural ? [def.plural] : []), ...def.aliases]);
      for (const s of spellings) forms.push({ text: s.toLowerCase(), def });
    }
    forms.sort((a, b) => b.text.length - a.text.length);
    this.forms = forms;
  }

  /**
   * Match a unit at the start of `text`. The unit must be followed by whitespace, a comma
   * or the end of the text. Matching ignores case.
   */
  match(text: string): { unit: UnitMatch; length: number } | null {
    const lower = text.toLowerCase();
    for (const form of this.forms) {
      if (!lower.startsWith(form.text)) continue;
      const next = text[form.text.length];
      if (next !== undefined && !/[\s,]/.test(next)) continue;
      return { unit: { raw: text.slice(0, form.text.length), def: form.def }, length: form.text.length };
    }
    return null;
  }

  find(name: string): UnitDef | null {
    const lower = name.toLowerCase();
    return this.forms.find((f) => f.text === lower)?.def ?? null;
  }
}

/** Canonical spelling of a unit for a quantity: the symbol, or the name agreeing in number. */
export function canonicalUnit(def: UnitDef, quantity: Quantity | null): string {
  if (def.symbol) return def.symbol;
  if (def.plural && quantity && isPlural(quantity)) return def.plural;
  return def.name;
}

/** The unit written out as a word (`grams`, `tablespoon`), for themes that display long forms. */
export function longUnit(def: UnitDef, quantity: Quantity | null): string {
  const plural = def.plural ?? (def.symbol && def.kind !== 'size' ? pluralize(def.name) : null);
  if (plural && quantity && isPlural(quantity)) return plural;
  return def.name;
}

function pluralize(name: string): string {
  if (/(s|x|z|ch|sh)$/.test(name)) return `${name}es`;
  return `${name}s`;
}

/** Build a registry from the parsed content of `registries/units.yaml`. */
export function createUnitRegistry(data: unknown): UnitRegistry {
  const list = (data as { units?: unknown } | null)?.units;
  if (!Array.isArray(list)) throw new Error('units registry: expected a top-level "units" list');
  const units: UnitDef[] = list.map((entry, i) => {
    const e = entry as Record<string, unknown>;
    if (typeof e.name !== 'string') throw new Error(`units registry: entry ${i} has no name`);
    const kind = e.kind as UnitKind;
    if (!KINDS.includes(kind)) throw new Error(`units registry: "${e.name}" has unknown kind "${String(e.kind)}"`);
    return {
      name: e.name,
      symbol: typeof e.symbol === 'string' ? e.symbol : null,
      plural: typeof e.plural === 'string' ? e.plural : null,
      aliases: Array.isArray(e.aliases) ? e.aliases.map(String) : [],
      kind,
      system: e.system === 'metric' || e.system === 'us' ? e.system : null,
      grams: kind === 'mass' && typeof e.grams === 'number' && e.grams > 0 ? e.grams : null,
      ml: kind === 'volume' && typeof e.ml === 'number' && e.ml > 0 ? e.ml : null,
    };
  });
  return new UnitRegistry(units);
}
