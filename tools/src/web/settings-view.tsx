// The Settings tab: the sections in the left column (SettingsNav) and one section on the right
// (SettingsPanel). Everything here edits the one settings object main.tsx keeps (settings.ts).

import { useEffect, useRef, useState } from 'preact/hooks';
import { Fragment, type ComponentChildren } from 'preact';

import type { CatalogEntry } from '../catalog/index.ts';
import { CORNERS, fullAppearance, PALETTES, resolveScheme, SCHEMES, type Appearance } from './appearance.ts';
import type { ChartFontMenu, ChartThemeEntry, ThemeEntry } from './engine.ts';
import { parseRepo } from './repo.ts';
import { describeSettings, importSettings, MAX_SOURCES, serializeSettings, setIn, SETTINGS_FILE, SETTINGS_VERSION, specRepo, type Settings } from './settings.ts';
import { creativeCommonsUrl, ETNA_IS, groupCredits, projectLinks, readPackageCredits, requestSummary, shortCommit, type AboutData, type PackageCredit, type RequestHost } from './about.ts';
import { canMove, friendlyError, removedSiteSources, type SourceEntry } from './sourcelist.ts';
import type { RepoSource } from './sources.ts';

// ------------------------------------------------------------- shared types

export interface LoadedSource {
  source: RepoSource;
  status: 'loading' | 'ready' | 'error';
  entries: CatalogEntry[];
  nameOnly: boolean;
  error: string | null;
}

/** The card themes a picker offers, one group per origin: built-in first, then each source. */
export interface ThemeGroup {
  label: string;
  entries: ThemeEntry[];
}

export interface ChartThemeGroup {
  label: string;
  entries: ChartThemeEntry[];
}

export const PAPER_LABELS: Record<string, string> = {
  letter: 'Letter',
  a4: 'A4',
  'half-letter': 'Half letter',
  'index-4x6': 'Index card 4×6',
  'index-5x7': 'Index card 5×7',
  legal: 'Legal',
  a5: 'A5',
  custom: 'The style’s page',
};

// ----------------------------------------------------------------- sections

export const SECTIONS = [
  { id: 'sources', label: 'Sources' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'cards', label: 'Cards and printing' },
  { id: 'shopping', label: 'Shopping list' },
  { id: 'data', label: 'Data' },
  { id: 'about', label: 'About' },
] as const;
export type SectionId = (typeof SECTIONS)[number]['id'];

export function isSectionId(id: unknown): id is SectionId {
  return SECTIONS.some((s) => s.id === id);
}

/** The sections as vertical tabs: one Tab stop; Up, Down, Home and End move between them. */
export function SettingsNav(props: { section: SectionId; onSection: (id: SectionId) => void; summaries: Record<SectionId, string> }) {
  const onKeyDown = (e: KeyboardEvent) => {
    const i = SECTIONS.findIndex((s) => s.id === props.section);
    const n = SECTIONS.length;
    const next =
      e.key === 'ArrowDown' || e.key === 'ArrowRight'
        ? (i + 1) % n
        : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
          ? (i - 1 + n) % n
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    props.onSection(SECTIONS[next].id);
    document.getElementById(`settings-tab-${SECTIONS[next].id}`)?.focus();
  };
  return (
    <div class="settings-nav">
      <div class="settings-tabs" role="tablist" aria-label="Settings sections" aria-orientation="vertical" onKeyDown={onKeyDown}>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            id={`settings-tab-${s.id}`}
            role="tab"
            aria-selected={props.section === s.id}
            aria-controls="settings-section"
            tabIndex={props.section === s.id ? 0 : -1}
            class={props.section === s.id ? 'on' : ''}
            onClick={() => props.onSection(s.id)}
          >
            <span class="settings-tab-name">{s.label}</span>
            {props.summaries[s.id] && <span class="settings-tab-note">{props.summaries[s.id]}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the panel

export interface SourceActions {
  onAdd: (repo: string) => string | null;
  onRemove: (id: string) => void;
  onKeep: (id: string) => void;
  onHide: (id: string, hidden: boolean) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onRetry: (id: string) => void;
  /** Lists the site's own source `id` again after the reader removed it. */
  onRestore: (id: string) => void;
}

export interface StorageState {
  available: boolean;
  readOnly: boolean;
  problem: string | null;
}

export function SettingsPanel(props: {
  section: SectionId;
  settings: Settings;
  change: (fn: (s: Settings) => Settings) => void;
  entries: SourceEntry[];
  loaded: Map<string, LoadedSource>;
  labelOf: (id: string) => string;
  actions: SourceActions;
  prefersDark: boolean;
  recipeThemes: ThemeGroup[];
  listThemes: ThemeGroup[];
  chartThemes: ChartThemeGroup[];
  /** The Flow chart Fonts row's entries, the chart toolbar's Font menu's, and the value it comes to. */
  chartFonts: ChartFontMenu;
  defaultTheme: { card: string; list: string; chart: string };
  wakeSupported: boolean;
  storage: StorageState;
  listCount: number;
  onAnnounce: (text: string) => void;
  /** What About and Data say of this build: its stamp and credits, and the hosts it reads from. */
  build: { about: AboutData; hosts: RequestHost[]; localServer: boolean; site: readonly { id: string; label: string }[] };
}) {
  const label = SECTIONS.find((s) => s.id === props.section)?.label ?? '';
  return (
    <section class="settings" id="settings-section" role="tabpanel" aria-labelledby={`settings-tab-${props.section}`}>
      <h2 class="settings-title">{label}</h2>
      {props.section === 'sources' && <SourcesSection {...props} />}
      {props.section === 'appearance' && <AppearanceSection {...props} />}
      {props.section === 'cards' && <CardsSection {...props} />}
      {props.section === 'shopping' && <ShoppingSection {...props} />}
      {props.section === 'data' && <DataSection {...props} />}
      {props.section === 'about' && <AboutSection {...props} />}
    </section>
  );
}

type PanelProps = Parameters<typeof SettingsPanel>[0];

// ------------------------------------------------------------------ Sources

function SourcesSection(props: PanelProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  // After a move, the button pressed (or, at an end, its pair) keeps the focus.
  const refocus = useRef<{ id: string; which: 'up' | 'down' } | null>(null);
  useEffect(() => {
    const r = refocus.current;
    if (!r) return;
    refocus.current = null;
    const row = list.current?.querySelector<HTMLElement>(`[data-source="${CSS.escape(r.id)}"]`);
    const want = row?.querySelector<HTMLButtonElement>(`button.move-${r.which}:not(:disabled)`) ?? row?.querySelector<HTMLButtonElement>('button.move-up:not(:disabled), button.move-down:not(:disabled)');
    want?.focus();
  });
  const kept = props.settings.sources?.length ?? 0;
  const submit = (e: Event) => {
    e.preventDefault();
    const repo = parseRepo(text);
    if (!repo) {
      setError('Write the repository as owner/name (for example owner/recipes), or paste its github.com address.');
      input.current?.focus();
      return;
    }
    const problem = props.actions.onAdd(repo);
    if (problem) {
      setError(problem);
      input.current?.focus();
      return;
    }
    setError(null);
    setText('');
    props.onAnnounce(`Added ${repo}. It is loading.`);
  };
  const focusAfterRemoval = (index: number) => {
    requestAnimationFrame(() => {
      const rows = list.current ? [...list.current.querySelectorAll<HTMLElement>('li.src-row')] : [];
      const row = rows[index] ?? rows[index - 1];
      (row?.querySelector<HTMLElement>('.src-actions button:not(:disabled)') ?? input.current)?.focus();
    });
  };
  const links = props.entries.filter((e) => e.origin === 'link');
  const removedSite = removedSiteSources(props.settings, props.build.site);
  return (
    <>
      <p class="settings-intro">Where your recipes come from. Recipes from every source are listed and searched together; the order here decides which source’s themes come first.</p>
      <form class="settings-add" onSubmit={submit} noValidate>
        <label for="add-repo">Add a public GitHub repository</label>
        <div class="settings-add-row">
          <input
            id="add-repo"
            ref={input}
            class={error ? 'bad' : ''}
            placeholder="owner/name, or a github.com address"
            value={text}
            autocomplete="off"
            spellcheck={false}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? 'add-repo-error add-repo-help' : 'add-repo-help'}
            onInput={(e) => setText((e.target as HTMLInputElement).value)}
          />
          <button type="submit" class="primary">
            Add
          </button>
        </div>
        {error && (
          <p class="settings-error" id="add-repo-error" role="alert">
            {error}
          </p>
        )}
        <p class="settings-help" id="add-repo-help">
          Any public repository with a <code>recipes/</code> folder works. With a <code>catalog.json</code> at its root, search covers ingredients and
          the method; without one, recipe names only.
        </p>
      </form>
      {links.length > 0 && (
        <p class="settings-note link-note">
          The link you opened brought {links.length === 1 ? 'a repository' : `${links.length} repositories`} for this visit only. Your own list is
          unchanged; use Keep to add one to it.
        </p>
      )}
      <h3 class="settings-sub">
        {props.entries.length} {props.entries.length === 1 ? 'source' : 'sources'}
      </h3>
      {props.entries.length === 0 ? (
        <p class="settings-help">None yet. Add a repository above{isLocalHost() ? ', or run etna serve <folder> to read a collection on this computer' : ''}.</p>
      ) : (
        <ul class="src-list" ref={list} aria-label="Sources">
          {props.entries.map((e, i) => (
            <SourceRow
              key={e.id}
              entry={e}
              index={i}
              label={props.labelOf(e.id)}
              loaded={props.loaded.get(e.id)}
              canUp={canMove(props.entries, e.id, -1)}
              canDown={canMove(props.entries, e.id, 1)}
              onMove={(delta) => {
                refocus.current = { id: e.id, which: delta < 0 ? 'up' : 'down' };
                props.actions.onMove(e.id, delta);
                props.onAnnounce(`Moved ${e.id} ${delta < 0 ? 'up' : 'down'}: now ${i + 1 + delta} of ${props.entries.length}.`);
              }}
              onHide={(hidden) => {
                props.actions.onHide(e.id, hidden);
                props.onAnnounce(hidden ? `${e.id} is hidden: its recipes are not listed.` : `${e.id} is shown again.`);
              }}
              onRemove={() => {
                props.actions.onRemove(e.id);
                props.onAnnounce(e.origin === 'link' ? `Dismissed ${e.id}.` : `Removed ${e.id}.`);
                focusAfterRemoval(i);
              }}
              onKeep={() => {
                props.actions.onKeep(e.id);
                props.onAnnounce(`Kept ${e.id} in this browser.`);
                requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-source="${CSS.escape(e.id)}"] .src-actions button`)?.focus());
              }}
              onRetry={() => {
                props.actions.onRetry(e.id);
                props.onAnnounce(`Trying ${e.id} again.`);
              }}
            />
          ))}
        </ul>
      )}
      {removedSite.map((d) => (
        <p class="settings-note site-removed" key={d.id}>
          You removed <strong>{d.label}</strong>, the recipes this site comes with, so they are not listed.{' '}
          <button
            class="link inline"
            onClick={() => {
              props.actions.onRestore(d.id);
              props.onAnnounce(`Put back ${d.label}. It is loading.`);
            }}
          >
            Put back {d.label}
          </button>
        </p>
      ))}
      {kept >= MAX_SOURCES && <p class="settings-note">This browser keeps at most {MAX_SOURCES} repositories; remove one to add another.</p>}
      <p class="settings-help where">
        The repositories you add are remembered in this browser (see Data), not in the address, and not on any server. Folders from{' '}
        <code>etna serve</code> come from this computer each time and can be hidden, not removed. A link with <code>?repo=</code> adds its
        repositories for that visit only.
        {props.build.site.length > 0 && (
          <>
            {' '}
            This site comes with recipes of its own, marked “This site”: they are read from the site itself, not from GitHub, and listed for
            every visitor until removed. Removing them is remembered in this browser.
          </>
        )}
      </p>
    </>
  );
}

function isLocalHost(): boolean {
  return typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
}

function SourceRow(props: {
  entry: SourceEntry;
  index: number;
  label: string;
  loaded: LoadedSource | undefined;
  canUp: boolean;
  canDown: boolean;
  onMove: (delta: -1 | 1) => void;
  onHide: (hidden: boolean) => void;
  onRemove: () => void;
  onKeep: () => void;
  onRetry: () => void;
}) {
  const e = props.entry;
  const l = props.loaded;
  const unsupported = e.spec !== null && typeof e.spec === 'object' && !!e.spec.path;
  const state: { kind: string; text: ComponentChildren } = e.hidden
    ? { kind: 'hidden', text: 'Hidden: its recipes are not loaded or listed' }
    : unsupported
      ? { kind: 'error', text: `Not read: a folder inside a repository (${typeof e.spec === 'object' && e.spec ? e.spec.path : ''}) needs a later Etna` }
      : !l || l.status === 'loading'
        ? { kind: 'loading', text: 'Loading…' }
        : l.status === 'error'
          ? { kind: 'error', text: `Could not load: ${friendlyError(l.error ?? '')}` }
          : l.nameOnly
            ? { kind: 'names', text: `${l.entries.length} ${l.entries.length === 1 ? 'recipe' : 'recipes'}, names only: it has no catalog.json, so search sees titles only` }
            : { kind: 'ready', text: `${l.entries.length} ${l.entries.length === 1 ? 'recipe' : 'recipes'}` };
  const origin = e.origin === 'computer' ? 'This computer' : e.origin === 'site' ? 'This site' : e.origin === 'browser' ? 'This browser' : 'From the link you opened';
  const name = props.label;
  return (
    <li class={`src-row ${e.origin} ${state.kind}`} data-source={e.id}>
      <div class="src-text">
        <div class="src-line">
          <span class="src-kind" aria-hidden="true">
            {e.kind === 'local' ? <FolderIcon /> : e.kind === 'site' ? <SiteIcon /> : <RepoIcon />}
          </span>
          <strong class="src-name">{name}</strong>
          <span class="visually-hidden">, {e.kind === 'local' ? 'a folder on this computer' : e.kind === 'site' ? 'the recipes this site comes with' : 'a GitHub repository'}, </span>
          <span class="src-tag">{origin}</span>
        </div>
        <div class={`src-state ${state.kind}`}>{state.text}</div>
      </div>
      <div class="src-actions" role="group" aria-label={`${name}`}>
        {e.origin !== 'link' && (
          <>
            <button class="icon move-up" disabled={!props.canUp} aria-label={`Move ${name} up`} title="Move up" onClick={() => props.onMove(-1)}>
              <ChevronIcon up />
            </button>
            <button class="icon move-down" disabled={!props.canDown} aria-label={`Move ${name} down`} title="Move down" onClick={() => props.onMove(1)}>
              <ChevronIcon />
            </button>
          </>
        )}
        {state.kind === 'error' && !unsupported && (
          <button onClick={props.onRetry} aria-label={`Try ${name} again`}>
            Try again
          </button>
        )}
        {e.origin === 'link' ? (
          <>
            <button class="keep" onClick={props.onKeep} aria-label={`Keep ${name} in this browser`}>
              Keep
            </button>
            <button onClick={props.onRemove} aria-label={`Dismiss ${name}`}>
              Dismiss
            </button>
          </>
        ) : (
          <button onClick={() => props.onHide(!e.hidden)} aria-label={`${e.hidden ? 'Show' : 'Hide'} ${name}`}>
            {e.hidden ? 'Show' : 'Hide'}
          </button>
        )}
        {(e.origin === 'browser' || e.origin === 'site') && (
          <button onClick={props.onRemove} aria-label={`Remove ${name}`}>
            Remove
          </button>
        )}
      </div>
    </li>
  );
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false">
      <path d="M1.8 4.2c0-.7.5-1.2 1.2-1.2h3l1.5 1.6H13c.7 0 1.2.5 1.2 1.2v6.4c0 .7-.5 1.2-1.2 1.2H3c-.7 0-1.2-.5-1.2-1.2Z" />
    </svg>
  );
}

/** The recipes the site comes with: a page with lines, as a guide or tutorial is. */
function SiteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false">
      <path d="M8 3.6C6.6 2.6 4.6 2.2 2 2.4v10c2.6-.2 4.6.2 6 1.2 1.4-1 3.4-1.4 6-1.2v-10c-2.6-.2-4.6.2-6 1.2Zm0 0v10" />
    </svg>
  );
}

function RepoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false">
      <path d="M3.5 13.5V3a1 1 0 0 1 1-1H13v9.5H4.6a1.1 1.1 0 0 0 0 2.2H13" />
    </svg>
  );
}

function ChevronIcon(props: { up?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false">
      <path d={props.up ? 'm3.5 10 4.5-4.5 4.5 4.5' : 'm3.5 6 4.5 4.5L12.5 6'} stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

// --------------------------------------------------------------- Appearance

/** A group of radio buttons: one Tab stop, arrow keys choose (the browser's own behavior). */
function Choices<T extends string>(props: {
  legend: string;
  help?: string;
  name: string;
  value: T;
  options: { id: T; label: string; note?: string; picture?: ComponentChildren }[];
  onChange: (id: T) => void;
  wide?: boolean;
}) {
  return (
    <fieldset class={`choices${props.wide ? ' wide' : ''}`}>
      <legend>{props.legend}</legend>
      {props.help && <p class="settings-help">{props.help}</p>}
      <div class="choice-list">
        {props.options.map((o) => (
          <label key={o.id} class={`choice${props.value === o.id ? ' on' : ''}`}>
            <input type="radio" name={props.name} value={o.id} checked={props.value === o.id} onChange={() => props.onChange(o.id)} />
            {o.picture}
            <span class="choice-text">
              <span class="choice-label">{o.label}</span>
              {o.note && <span class="choice-note">{o.note}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function AppearanceSection(props: PanelProps) {
  const a = fullAppearance(props.settings.appearance);
  const scheme = resolveScheme(a.scheme, props.prefersDark);
  const set = <K extends keyof Appearance>(key: K, value: Appearance[K]) => props.change((s) => setIn(s, 'appearance', key, value));
  return (
    <>
      <p class="settings-intro">How Etna itself looks. Each change applies at once and is remembered in this browser. Recipe cards keep their own styles (Cards and printing).</p>
      <Choices
        legend="Palette"
        name="app-palette"
        value={a.palette}
        wide
        onChange={(v) => set('palette', v)}
        options={PALETTES.map((t) => {
          const c = t[scheme];
          return {
            id: t.id,
            label: t.label,
            note: t.note,
            picture: (
              <span class="swatch" aria-hidden="true" style={{ background: c.ground, borderColor: c.rule }}>
                <span class="swatch-panel" style={{ background: c.paper, borderColor: c.rule }}>
                  <span style={{ background: c.ink }} />
                  <span style={{ background: c.ink, opacity: 0.45 }} />
                </span>
                <span class="swatch-accent" style={{ background: c.accent }} />
              </span>
            ),
          };
        })}
      />
      <Choices legend="Light or dark" help="“Match this device” follows your computer or phone." name="app-scheme" value={a.scheme} onChange={(v) => set('scheme', v)} options={SCHEMES} />
      <Choices
        legend="Corners"
        help="Buttons, fields, the recipe list and the card’s page on screen. Printing is not affected."
        name="app-corners"
        value={a.corners}
        onChange={(v) => set('corners', v)}
        options={CORNERS.map((c) => ({ ...c, note: c.id === 'soft' ? 'As it has been' : undefined, picture: <span class={`corner-pic ${c.id}`} aria-hidden="true" /> }))}
      />
      {Object.keys(props.settings.appearance ?? {}).length > 0 && (
        <p>
          <button class="settings-button" onClick={() => props.change((s) => ({ ...s, appearance: {} }))}>
            Back to the standard look
          </button>
        </p>
      )}
    </>
  );
}

// ------------------------------------------------- Cards and Shopping list

/** One remembered choice: its name, its control, and a Reset while it differs from the default. */
function Row(props: { label: string; id: string; set: boolean; onReset: () => void; children: ComponentChildren; help?: string }) {
  return (
    <div class="pref">
      <label class="pref-label" for={props.id}>
        {props.label}
      </label>
      <div class="pref-control">
        {props.children}
        {props.set && (
          <button class="pref-reset link" onClick={props.onReset} aria-label={`Reset ${props.label} to the default`}>
            Reset
          </button>
        )}
      </div>
      {props.help && <p class="settings-help pref-help">{props.help}</p>}
    </div>
  );
}

function ThemeSelect(props: { id: string; groups: { label: string; entries: { id: string; label: string; available: boolean }[] }[]; value: string; onChange: (id: string) => void }) {
  return (
    <select id={props.id} value={props.value} onChange={(e) => props.onChange((e.target as HTMLSelectElement).value)}>
      {props.groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.entries.map((t) => (
            <option key={t.id} value={t.id} disabled={!t.available}>
              {t.available ? t.label : `${t.label} (unavailable)`}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

const SIZES = ['auto', ...Array.from({ length: 13 }, (_, i) => `${8 + i / 2}pt`)];

function PaperSelect(props: { id: string; value: string | undefined; onChange: (v: string | undefined) => void }) {
  return (
    <select id={props.id} value={props.value ?? ''} onChange={(e) => props.onChange((e.target as HTMLSelectElement).value || undefined)}>
      <option value="">Style’s own</option>
      {Object.entries(PAPER_LABELS)
        .filter(([id]) => id !== 'custom')
        .map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
    </select>
  );
}

function SizeSelect(props: { id: string; value: string | undefined; onChange: (v: string | undefined) => void }) {
  const value = props.value ?? 'auto';
  const options = SIZES.includes(value) ? SIZES : [...SIZES, value];
  return (
    <select id={props.id} value={value} onChange={(e) => props.onChange((e.target as HTMLSelectElement).value)}>
      {options.map((s) => (
        <option key={s} value={s}>
          {s === 'auto' ? 'Auto (fitted to the page)' : s.replace('pt', ' pt')}
        </option>
      ))}
    </select>
  );
}

const cardGroups = (groups: ThemeGroup[]) => groups.map((g) => ({ label: g.label, entries: g.entries.map((t) => ({ id: t.id, label: t.label, available: t.theme !== null && t.errors.length === 0 })) }));
const chartGroups = (groups: ChartThemeGroup[]) => groups.map((g) => ({ label: g.label, entries: g.entries.map((t) => ({ id: t.id, label: t.label, available: t.theme !== null })) }));

function CardsSection(props: PanelProps) {
  const c = props.settings.cards ?? {};
  const set = (key: keyof NonNullable<Settings['cards']>, value: unknown) => props.change((s) => setIn(s, 'cards', key, value));
  const g = props.settings.chart ?? {};
  const setChart = (key: keyof NonNullable<Settings['chart']>, value: unknown) => props.change((s) => setIn(s, 'chart', key, value));
  return (
    <>
      <p class="settings-intro">What a recipe’s Card and Flow chart tabs start with. They are the same choices the card’s toolbar makes: change one there and it shows here.</p>
      <h3 class="settings-sub">Card</h3>
      <Row label="Style" id="pref-card-theme" set={c.theme !== undefined} onReset={() => set('theme', undefined)}>
        <ThemeSelect id="pref-card-theme" groups={cardGroups(props.recipeThemes)} value={c.theme ?? props.defaultTheme.card} onChange={(v) => set('theme', v)} />
      </Row>
      <Row label="Ingredients" id="pref-card-parts" set={c.parts !== undefined} onReset={() => set('parts', undefined)} help="For recipes in parts, where a style can show either.">
        <select id="pref-card-parts" value={c.parts ?? 'paired'} onChange={(e) => set('parts', (e.target as HTMLSelectElement).value === 'sections' ? 'sections' : 'paired')}>
          <option value="paired">With each part</option>
          <option value="sections">In one list</option>
        </select>
      </Row>
      <Row label="Notes" id="pref-card-notes" set={c.notes !== undefined} onReset={() => set('notes', undefined)}>
        <label class="pref-check">
          <input id="pref-card-notes" type="checkbox" checked={c.notes === true} onChange={(e) => set('notes', (e.target as HTMLInputElement).checked)} />
          Print the recipe’s notes on the card
        </label>
      </Row>
      <Row label="Paper size" id="pref-card-paper" set={c.paper !== undefined} onReset={() => set('paper', undefined)} help="A style that does not offer this paper uses its own.">
        <PaperSelect id="pref-card-paper" value={c.paper} onChange={(v) => set('paper', v)} />
      </Row>
      <Row label="Text size" id="pref-card-size" set={c.size !== undefined} onReset={() => set('size', undefined)}>
        <SizeSelect id="pref-card-size" value={c.size} onChange={(v) => set('size', v)} />
      </Row>
      <Row
        label="Colors"
        id="pref-card-palette"
        set={c.palette !== undefined}
        onReset={() => set('palette', undefined)}
        help="Match the app: on screen, a card and the shopping list take their colors from Settings > Appearance, light or dark. On paper, and in a saved PDF, they are always the style’s own."
      >
        <select id="pref-card-palette" value={c.palette ?? 'app'} onChange={(e) => set('palette', (e.target as HTMLSelectElement).value === 'own' ? 'own' : 'app')}>
          <option value="app">Match the app</option>
          <option value="own">Style’s own</option>
        </select>
      </Row>
      <h3 class="settings-sub">Flow chart</h3>
      <Row label="Style" id="pref-chart-theme" set={g.theme !== undefined} onReset={() => setChart('theme', undefined)}>
        <ThemeSelect id="pref-chart-theme" groups={chartGroups(props.chartThemes)} value={g.theme ?? props.defaultTheme.chart} onChange={(v) => setChart('theme', v)} />
      </Row>
      <Row
        label="Joined edges"
        id="pref-chart-join-edges"
        set={g['join-edges'] !== undefined}
        onReset={() => setChart('join-edges', undefined)}
        help="Edges joining one step: each in its own lane, or down one shared lane. Unset, the chart style decides."
      >
        <select id="pref-chart-join-edges" value={g['join-edges'] ?? 'separate'} onChange={(e) => setChart('join-edges', (e.target as HTMLSelectElement).value === 'bus' ? 'bus' : 'separate')}>
          <option value="separate">Separate</option>
          <option value="bus">Bus</option>
        </select>
      </Row>
      <Row
        label="Fit to"
        id="pref-chart-shape"
        set={g.shape !== undefined}
        onReset={() => setChart('shape', undefined)}
        help="What the chart is laid out for. Screen: one column, as large as the window allows; it scrolls. A page: the card’s paper size (letter unless it is A4), with the print margin below; the chart may be folded into columns to print larger, and the chart on screen is the one that prints. Page, either way up: whichever way prints the chart larger. A PDF is always a page: with Screen it is made as for Page, either way up. The chart toolbar’s Fit buttons make the same choice."
      >
        <select
          id="pref-chart-shape"
          value={g.shape ?? 'screen'}
          onChange={(e) => setChart('shape', ((v) => (v === 'auto' || v === 'portrait' || v === 'landscape' ? v : 'screen'))((e.target as HTMLSelectElement).value))}
        >
          <option value="screen">Screen</option>
          <option value="auto">Page, either way up</option>
          <option value="portrait">Portrait page</option>
          <option value="landscape">Landscape page</option>
        </select>
      </Row>
      <Row
        label="Colors"
        id="pref-chart-palette"
        set={g.palette !== undefined}
        onReset={() => setChart('palette', undefined)}
        help="Match the app: Flow and Dense take their colors from Settings > Appearance, light or dark; a saved SVG keeps the colors on screen, and a PDF is always drawn on a white page, in the same palette’s light colors. Ink, Station and any style that does not ask for it keep their own colors whatever this says."
      >
        <select id="pref-chart-palette" value={g.palette ?? 'app'} onChange={(e) => setChart('palette', (e.target as HTMLSelectElement).value === 'own' ? 'own' : 'app')}>
          <option value="app">Match the app</option>
          <option value="own">Style’s own</option>
        </select>
      </Row>
      <Row
        label="Fonts"
        id="pref-chart-fonts"
        set={g.fonts !== undefined}
        onReset={() => setChart('fonts', undefined)}
        help="Match active card: the chart’s title takes the title font and weight of the card style in use (Card > Style above), its other text the body font. Style’s own: the chart style’s own fonts. A card style by name: that card’s fonts, whichever card is in use. The chart toolbar’s Font menu shows what the chart is set in: Style (its own), or a card style, the one in use while following it; picking the card in use there follows it, another pins it. A chart style that keeps its own fonts, such as Station, ignores this."
      >
        <select id="pref-chart-fonts" value={props.chartFonts.value} onChange={(e) => setChart('fonts', (e.target as HTMLSelectElement).value)}>
          {props.chartFonts.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Row>
      <Row
        label="Print margin"
        id="pref-chart-margin"
        set={g.margin !== undefined}
        onReset={() => setChart('margin', undefined)}
        help="The page margin a printed chart keeps on every side. Half an inch clears most printers; choose more if a chart runs onto a second page."
      >
        <select id="pref-chart-margin" value={g.margin ?? '0.5in'} onChange={(e) => setChart('margin', ((v) => (v === '0.75in' || v === '1in' ? v : '0.5in'))((e.target as HTMLSelectElement).value))}>
          <option value="0.5in">½ inch</option>
          <option value="0.75in">¾ inch</option>
          <option value="1in">1 inch</option>
        </select>
      </Row>
      <h3 class="settings-sub">While a recipe is open</h3>
      <Row
        label="Screen"
        id="pref-screen-on"
        set={props.settings['screen-on'] !== undefined}
        onReset={() => props.change((s) => ({ ...s, 'screen-on': undefined }))}
        help={props.wakeSupported ? undefined : 'This browser cannot keep the screen on; the choice is kept for one that can.'}
      >
        <label class="pref-check">
          <input id="pref-screen-on" type="checkbox" checked={props.settings['screen-on'] === true} onChange={(e) => props.change((s) => ({ ...s, 'screen-on': (e.target as HTMLInputElement).checked }))} />
          Screen stays on
        </label>
      </Row>
    </>
  );
}

function ShoppingSection(props: PanelProps) {
  const l = props.settings.shopping ?? {};
  const set = (key: keyof NonNullable<Settings['shopping']>, value: unknown) => props.change((s) => setIn(s, 'shopping', key, value));
  return (
    <>
      <p class="settings-intro">
        How the shopping list prints. The list itself ({props.listCount} {props.listCount === 1 ? 'recipe' : 'recipes'}) is kept apart from these settings; the Shopping list tab
        has its own Clear.
      </p>
      <Row label="Style" id="pref-list-theme" set={l.theme !== undefined} onReset={() => set('theme', undefined)}>
        {props.listThemes.length > 0 ? (
          <ThemeSelect id="pref-list-theme" groups={cardGroups(props.listThemes)} value={l.theme ?? props.defaultTheme.list} onChange={(v) => set('theme', v)} />
        ) : (
          <span id="pref-list-theme">No shopping-list style is available.</span>
        )}
      </Row>
      <Row label="Paper size" id="pref-list-paper" set={l.paper !== undefined} onReset={() => set('paper', undefined)}>
        <PaperSelect id="pref-list-paper" value={l.paper} onChange={(v) => set('paper', v)} />
      </Row>
      <Row label="Text size" id="pref-list-size" set={l.size !== undefined} onReset={() => set('size', undefined)}>
        <SizeSelect id="pref-list-size" value={l.size} onChange={(v) => set('size', v)} />
      </Row>
      <Row label="Recipes" id="pref-list-uses" set={l.uses !== undefined} onReset={() => set('uses', undefined)}>
        <label class="pref-check">
          <input id="pref-list-uses" type="checkbox" checked={l.uses === true} onChange={(e) => set('uses', (e.target as HTMLInputElement).checked)} />
          Show which recipe each item is for
        </label>
      </Row>
    </>
  );
}

// --------------------------------------------------------------------- Data

function DataSection(props: PanelProps) {
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const resetButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);
  const st = props.storage;
  const save = () => {
    const blob = new Blob([serializeSettings(props.settings, true)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = SETTINGS_FILE;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage({ kind: 'ok', text: `Saved ${SETTINGS_FILE} (${describeSettings(props.settings)}). Your browser put it where it keeps downloads.` });
  };
  const load = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    let text: string;
    try {
      text = f.size > 1024 * 1024 ? '' : await f.text();
    } catch {
      setMessage({ kind: 'error', text: `Could not read ${f.name}. Nothing was changed.` });
      return;
    }
    const result = importSettings(text, f.size);
    if (!result.ok) {
      setMessage({ kind: 'error', text: `${f.name} was not loaded: ${result.error}. Nothing was changed.` });
      return;
    }
    props.change(() => result.value.settings);
    setMessage({ kind: 'ok', text: `Loaded ${f.name}: ${describeSettings(result.value.settings)}. ${result.value.notes.join(' ')}`.trim() });
  };
  const s = props.settings;
  const a = Object.keys(s.appearance ?? {}).length;
  const choices = Object.keys(s.cards ?? {}).length + Object.keys(s.chart ?? {}).length + Object.keys(s.shopping ?? {}).length + (s['screen-on'] === undefined ? 0 : 1);
  return (
    <>
      <p class="settings-intro">
        Etna keeps your settings in this browser, for this address only. Nothing leaves it: there is no Etna server and no account. The only requests go to{' '}
        {requestSummary(props.build.hosts)} (Settings › About says what each is asked for).
      </p>
      {!st.available && <p class="settings-note">This browser does not let Etna keep anything here: your choices last until the page is reloaded. Save them to a file to keep them.</p>}
      {st.readOnly && (
        <p class="settings-note">
          The settings here were saved by a newer Etna. They are used as far as this version understands them, and changes are not kept, so the newer version loses nothing.
        </p>
      )}
      {st.problem && <p class="settings-note">{st.problem} The next change replaces them.</p>}
      <h3 class="settings-sub">Kept in this browser</h3>
      <table class="kept">
        <thead>
          <tr>
            <th scope="col">What</th>
            <th scope="col">Now</th>
            <th scope="col">Stored as</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Repositories you added or hid</th>
            <td>
              {(s.sources ?? []).map(specRepo).join(', ') || 'none'}
              {(s.hide ?? []).length > 0 && `; hidden: ${(s.hide ?? []).join(', ')}`}
              {(s.removed ?? []).length > 0 && `; removed from this site’s own: ${(s.removed ?? []).join(', ')}`}
            </td>
            <td>
              <code>etna.settings</code>
            </td>
          </tr>
          <tr>
            <th scope="row">Appearance</th>
            <td>{a > 0 ? `${PALETTES.find((t) => t.id === fullAppearance(s.appearance).palette)?.label} palette, ${fullAppearance(s.appearance).corners} corners` : 'the standard look'}</td>
            <td>
              <code>etna.settings</code>
            </td>
          </tr>
          <tr>
            <th scope="row">Card and list choices</th>
            <td>{choices > 0 ? `${choices} ${choices === 1 ? 'choice' : 'choices'}` : 'the defaults'}</td>
            <td>
              <code>etna.settings</code>
            </td>
          </tr>
          <tr>
            <th scope="row">The welcome</th>
            <td>{s.welcome === 'short' ? 'hidden' : 'not hidden'}</td>
            <td>
              <code>etna.settings</code>
            </td>
          </tr>
          <tr>
            <th scope="row">Shopping list</th>
            <td>
              {props.listCount} {props.listCount === 1 ? 'recipe' : 'recipes'}
            </td>
            <td>
              <code>etna.shopping-list</code>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="settings-help">Clearing this site’s data in the browser forgets all of it; so does closing a private window.</p>
      <h3 class="settings-sub">Take them with you</h3>
      <div class="settings-buttons">
        <button class="settings-button" onClick={save}>
          Save settings to a file
        </button>
        <button class="settings-button" onClick={() => file.current?.click()}>
          Load settings from a file…
        </button>
        <input ref={file} type="file" accept=".json,application/json" class="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={load} />
      </div>
      <p class="settings-help">Loading a file replaces the settings here with the file’s. Keys this version does not know are left out; a file it cannot read changes nothing.</p>
      <h3 class="settings-sub">Start again</h3>
      {!confirming ? (
        <button ref={resetButton} class="settings-button" onClick={() => setConfirming(true)}>
          Reset to defaults…
        </button>
      ) : (
        <div class="confirm" role="group" aria-labelledby="reset-question">
          <p id="reset-question">
            Reset every setting to the default? Your repositories, appearance, card and list choices and a hidden welcome are forgotten. The shopping list stays (it has its own Clear).
          </p>
          <div class="settings-buttons">
            <button
              ref={confirmButton}
              class="settings-button danger"
              onClick={() => {
                props.change(() => ({}));
                setConfirming(false);
                setMessage({ kind: 'ok', text: 'Settings are back to the defaults.' });
                requestAnimationFrame(() => resetButton.current?.focus());
              }}
            >
              Reset everything
            </button>
            <button
              class="settings-button"
              onClick={() => {
                setConfirming(false);
                requestAnimationFrame(() => resetButton.current?.focus());
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <p class={`settings-message ${message?.kind ?? ''}`} role="status">
        {message?.text}
      </p>
    </>
  );
}

// -------------------------------------------------------------------- About

/**
 * The packages whose code the app is made of, with their license texts: a chunk of its own
 * (virtual:etna-credits, written by the build from the bundler's record), loaded when About is
 * first shown, so the app's first load does not carry the texts.
 */
function ThirdPartyCode() {
  const [packages, setPackages] = useState<PackageCredit[] | 'loading' | 'failed'>('loading');
  useEffect(() => {
    let live = true;
    import('virtual:etna-credits').then(
      (m) => live && setPackages(readPackageCredits(m.packages)),
      () => live && setPackages('failed'),
    );
    return () => {
      live = false;
    };
  }, []);
  return (
    <>
      <h3 class="settings-sub ruled">Third-party code</h3>
      {packages === 'loading' ? (
        <p>Loading the list…</p>
      ) : packages === 'failed' ? (
        <p>The list of the code this app is made of could not be loaded. Reload the page to try again.</p>
      ) : (
        <>
          <p>
            Besides Etna’s own code, this app is made of these {packages.length} free software packages, each the work of its authors and redistributed under the license
            named with it.
          </p>
          <details class="license">
            <summary>The {packages.length} packages</summary>
            <ul class="about-list credits">
              {groupCredits(packages).map((group) => {
                const [first] = group;
                const many = group.length > 1;
                return (
                  <li key={`${first.name}@${first.version}`}>
                    <strong class="credit-family">
                      {group.map((p, i) => (
                        <span key={`${p.name}@${p.version}`}>
                          {i > 0 && <span class="credit-version">, </span>}
                          {p.name} <span class="credit-version">{p.version}</span>
                        </span>
                      ))}
                    </strong>
                    {first.copyright && <span class="credit-line">{first.copyright}</span>}
                    {first.text ? (
                      <>
                        <span class="credit-line">{first.license ?? 'No license stated'}</span>
                        <details class="license">
                          <summary>{first.files.join(' and ')}, in full</summary>
                          <pre>{first.text}</pre>
                        </details>
                      </>
                    ) : (
                      <span class="credit-line">
                        No license file. {many ? 'Each package.json' : 'package.json'} lists {first.license ? `${first.license} license` : 'no license'}
                        {first.author ? `${first.license ? ' and' : ', and'} author ${first.author}` : ''}.
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        </>
      )}
    </>
  );
}

function AboutSection(props: PanelProps) {
  const { about, hosts, localServer, site } = props.build;
  const links = projectLinks(about.sourceUrl);
  const docsUrl = about.docs ? creativeCommonsUrl(about.docs.name) : null;
  return (
    <>
      <p class="settings-intro">{ETNA_IS}</p>
      <h3 class="settings-sub">This build</h3>
      <dl class="about">
        <dt>Version</dt>
        <dd>{about.version || 'not recorded'}</dd>
        <dt>Commit</dt>
        <dd>
          {about.commit ? (
            <>
              <code title={about.commit}>{shortCommit(about.commit)}</code>
              {about.committed && `, ${about.committed}`}
              {about.modified && ', with changes not yet committed'}
            </>
          ) : (
            'not recorded (built outside a Git checkout)'
          )}
        </dd>
        {site.length > 0 && (
          <>
            <dt>Comes with</dt>
            <dd>
              {site.map((d) => d.label).join(', ')}: recipes this site carries and reads from itself, listed for every new visitor (marked “This site” in
              Sources). You can hide or remove them like any source.
            </dd>
          </>
        )}
        <dt>Settings format</dt>
        <dd>
          Version {SETTINGS_VERSION} (<code>"etna-settings": {SETTINGS_VERSION}</code> in a saved file)
        </dd>
      </dl>
      <h3 class="settings-sub">Your data</h3>
      <p>Kept in this browser, for this site only, in its local storage:</p>
      <ul class="about-list">
        <li>
          <code>etna.settings</code>: your settings, that is the sources you added, hid, removed or reordered, the appearance, and your choices for cards, charts, the shopping list and
          keeping the screen on.
        </li>
        <li>
          <code>etna.shopping-list</code>: the recipes on your shopping list.
        </li>
      </ul>
      <p>Nothing else is kept, and the app sets no cookie. Settings › Data shows what is kept, saves it to a file and clears it.</p>
      <p>Besides the files it is made of{site.length > 0 ? ' and the recipes it comes with' : ''}, the app requests things only from:</p>
      <ul class="about-list">
        {hosts.map((h) => (
          <li key={h.what}>
            <strong>{h.what}</strong>
            {h.hosts.length > 0 && (
              <>
                {' ('}
                {h.hosts.map((name, i) => (
                  <Fragment key={name}>
                    {i > 0 && ', '}
                    <code>{name}</code>
                  </Fragment>
                ))}
                {')'}
              </>
            )}
            , {h.why}.
          </li>
        ))}
      </ul>
      <p>
        The page’s security policy lets it fetch from no other host. Like any request on the web, each one tells that host your network address, your browser and the site
        that asked. There is no account, no sign-in and no analytics.
      </p>
      <p>
        The app never changes a recipe: it reads GitHub without signing in{localServer ? ', and etna serve answers only requests to read' : ''}.
      </p>
      <h3 class="settings-sub ruled">Fonts</h3>
      {about.fonts.length > 0 ? (
        <>
          <p>The card styles and flow charts are set in these free fonts, each the work of its authors and redistributed under the license named with it.</p>
          <details class="license">
            <summary>The {about.fonts.length} fonts</summary>
            <ul class="about-list credits">
              {about.fonts.map((f) => (
                <li key={f.family}>
                  <strong class="credit-family">{f.family}</strong>
                  <span class="credit-line">{f.copyright}</span>
                  <span class="credit-line">{f.license}</span>
                </li>
              ))}
            </ul>
            {about.fontLicenseTexts.map((text, i) => (
              <details class="license" key={i}>
                <summary>The {about.fonts.find((f) => f.text === i)?.license ?? 'license'}, in full</summary>
                <pre>{text}</pre>
              </details>
            ))}
          </details>
        </>
      ) : (
        <p>This build was made without the font cache, so it names no fonts.</p>
      )}
      <ThirdPartyCode />
      {(about.code || about.docs) && <h3 class="settings-sub ruled">License</h3>}
      {about.code && (
        <>
          <p>
            Etna’s code, this app and its card and chart styles included, is released under the {about.code.name}
            {about.code.copyright ? `: ${about.code.copyright}.` : '.'}
          </p>
          {about.code.text && (
            <details class="license">
              <summary>The {about.code.name}, in full</summary>
              <pre>{about.code.text}</pre>
            </details>
          )}
        </>
      )}
      {about.docs && (
        <p>
          The specification, the documentation and the unit and density tables this app carries are released under{' '}
          {docsUrl ? (
            <a href={docsUrl} target="_blank" rel="noopener noreferrer">
              {about.docs.name}
            </a>
          ) : (
            about.docs.name
          )}
          .
        </p>
      )}
      {links.length > 0 && (
        <>
          <h3 class="settings-sub">Links</h3>
          <ul class="about-list">
            {links.map((l) => (
              <li key={l.label}>
                <a href={l.href} target="_blank" rel="noopener noreferrer">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
