// The local server behind `etna serve`: the web GUI plus read-only access to one or more
// collection folders on this computer. Listens on 127.0.0.1 only.

import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { basename, dirname, join, resolve, sep } from 'node:path';

import { buildCatalog, collectionRoot } from '../catalog/node.ts';
import { folderOrder } from '../web/site-source.ts';
import { isPictureName, isValidSlug } from '../core/index.ts';
import { isInside } from '../node/files.ts';
import { buildWeb } from '../web/build.ts';
import { DENSITIES_LIMIT, THEME_FILE_NAME_RE, THEME_LIMITS } from '../web/sources.ts';

export interface LocalFolder {
  id: string;
  label: string;
  root: string;
}

/** Give each folder a short unique id from its name. */
export function foldersFrom(paths: string[]): LocalFolder[] {
  const used = new Set<string>();
  return paths.map((p) => {
    const root = realpathSync(resolve(p));
    const label = basename(root);
    let id = label;
    for (let n = 2; used.has(id); n++) id = `${label}-${n}`;
    used.add(id);
    return { id, label, root };
  });
}

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
};

/** Sent with every answer: no sniffing, no use by other sites' pages, no framing. */
const HARDENING = {
  'x-content-type-options': 'nosniff',
  'cross-origin-resource-policy': 'same-origin',
  'x-frame-options': 'DENY',
};

function send(res: ServerResponse, status: number, type: string, body: string | Uint8Array, headers: Record<string, string> = {}): void {
  // An answer already begun cannot be replaced by another: end the connection instead.
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...HARDENING, ...headers });
  res.end(body);
}

/**
 * True when the browser says another site's page sent the request (`Sec-Fetch-Site:
 * cross-site`). Any page the reader visits can make the browser call localhost; such a request
 * is refused before it does anything. Same-origin, same-site, `none` (typed or bookmarked) and
 * no header at all (curl, older browsers) are answered.
 */
export function isCrossSite(secFetchSite: string | string[] | undefined): boolean {
  const value = Array.isArray(secFetchSite) ? secFetchSite.join(',') : secFetchSite;
  return value !== undefined && value.trim().toLowerCase() === 'cross-site';
}

/** A refusal: the status and a plain message for the person who asked. */
class Refusal extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * The files of the theme `name` in a collection: regular files directly inside
 * `<collection root>/themes/<name>/` with a theme file's extension. Subfolders, other files and
 * symbolic links that lead outside the folder are skipped; a theme over THEME_LIMITS is refused.
 */
export function readCollectionTheme(folderRoot: string, name: string): Record<string, string> {
  if (!isValidSlug(name)) throw new Refusal(400, 'A theme name is lower-case letters and digits joined by hyphens.');
  const root = realpathSync(collectionRoot(folderRoot));
  const themes = join(root, 'themes');
  const dir = join(themes, name);
  let real: string;
  try {
    if (!lstatSync(dir).isDirectory()) throw new Error('not a folder');
    real = realpathSync(dir);
  } catch {
    throw new Refusal(404, `This collection has no theme named "${name}".`);
  }
  if (dirname(real) !== realpathSync(themes) || !real.startsWith(root + sep)) throw new Refusal(404, `This collection has no theme named "${name}".`);

  const files: Record<string, string> = {};
  let total = 0;
  for (const entry of readdirSync(real, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (!THEME_FILE_NAME_RE.test(entry.name)) continue;
    const path = join(real, entry.name);
    if (entry.isSymbolicLink()) {
      // Followed only when it stays inside the theme's folder.
      let target: string;
      try {
        target = realpathSync(path);
      } catch {
        continue;
      }
      if (dirname(target) !== real) continue;
    } else if (!entry.isFile()) continue;
    const stat = statSync(path);
    if (!stat.isFile()) continue;
    if (Object.keys(files).length >= THEME_LIMITS.files) throw new Refusal(413, `Theme "${name}" has more than ${THEME_LIMITS.files} files.`);
    if (stat.size > THEME_LIMITS.fileBytes) throw new Refusal(413, `Theme "${name}": ${entry.name} is larger than ${THEME_LIMITS.fileBytes / 1024} KB.`);
    total += stat.size;
    if (total > THEME_LIMITS.totalBytes) throw new Refusal(413, `Theme "${name}" is larger than ${THEME_LIMITS.totalBytes / 1024 / 1024} MB in all.`);
    files[entry.name] = readFileSync(path, 'utf8');
  }
  if (!Object.hasOwn(files, 'theme.yaml')) throw new Refusal(404, `This collection has no theme named "${name}".`);
  return files;
}

/**
 * The collection's own `densities.md`, directly in its root, or null when it has none. A file
 * that is a link out of the collection, not a regular file, or over DENSITIES_LIMIT is refused.
 */
export function readCollectionDensities(folderRoot: string): string | null {
  const root = realpathSync(collectionRoot(folderRoot));
  const file = join(root, 'densities.md');
  try {
    lstatSync(file);
  } catch {
    return null;
  }
  // With links followed it must still be that one file in the collection's root.
  let real: string;
  try {
    real = realpathSync(file);
  } catch {
    return null;
  }
  if (dirname(real) !== root || !isInside(file, root)) throw new Refusal(403, 'Only the collection’s own densities.md can be read.');
  const stat = statSync(real);
  if (!stat.isFile()) throw new Refusal(403, 'Only the collection’s own densities.md can be read.');
  if (stat.size > DENSITIES_LIMIT) throw new Refusal(413, `densities.md is larger than ${DENSITIES_LIMIT / 1024} KB.`);
  return readFileSync(real, 'utf8');
}

/** The largest picture file the server hands out (32 MiB). The app reads no more than the start of one over 1024 KiB. */
const IMAGE_FILE_LIMIT = 32 * 1024 * 1024;

/**
 * A recipe's picture file: `requested` is `<recipe folder>/image/<name>` inside the collection,
 * `name` one Etna reads (`etna.jpg`, `etna.png`, `markdown.jpg`, `markdown.png`), in a folder
 * that holds a recipe.md. With links followed the file must still lie inside that recipe's folder.
 */
export function readRecipeImage(folderRoot: string, requested: string): Uint8Array {
  const refuse = () => new Refusal(403, 'Only the picture files of a recipe inside the collection can be read.');
  const file = resolve(folderRoot, requested);
  const recipeDir = dirname(dirname(file));
  if (!file.startsWith(folderRoot + sep) || !isPictureName(basename(file)) || basename(dirname(file)) !== 'image') throw refuse();
  if (!existsSync(join(recipeDir, 'recipe.md'))) throw refuse();
  const realDir = realpathSync(recipeDir);
  if (!realDir.startsWith(folderRoot + sep)) throw refuse();
  const stat = statSync(file);
  if (!stat.isFile() || !isInside(file, realDir)) throw refuse();
  if (stat.size > IMAGE_FILE_LIMIT) throw new Refusal(413, `This picture file is larger than ${IMAGE_FILE_LIMIT / 1024 / 1024} MiB.`);
  return readFileSync(file);
}

/** The largest recipe file the server hands out. Real recipes are a few kilobytes. */
const RECIPE_FILE_LIMIT = 1024 * 1024;

/**
 * True when the request names this computer in its Host header. A page on another site can
 * make a visitor's browser call a local server under a host name of its own (DNS rebinding)
 * and read the answers; such a request names that site, not localhost.
 */
export function isLocalHost(host: string | undefined): boolean {
  if (!host) return false;
  const name = host.replace(/:\d+$/, '').toLowerCase();
  return name === 'localhost' || name === '127.0.0.1' || name === '[::1]' || name.endsWith('.localhost');
}

export async function createEtnaServer(folders: LocalFolder[]): Promise<Server> {
  const bundle = await buildWeb();
  return createServer((req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (!isLocalHost(req.headers.host)) return send(res, 403, 'text/plain', 'This server answers only as localhost.');
      if (isCrossSite(req.headers['sec-fetch-site'])) return send(res, 403, 'text/plain', 'This server does not answer other sites’ pages.');
      if (req.method !== 'GET') return send(res, 405, 'text/plain', 'Read-only: only GET is supported.');

      if (url.pathname === '/api/sources') {
        return send(res, 200, 'application/json', JSON.stringify(folders.map(({ id, label }) => ({ id, label }))));
      }

      const m = /^\/api\/sources\/([^/]+)\/(catalog|order|file|theme|densities|image)$/.exec(url.pathname);
      if (m) {
        const folder = folders.find((f) => f.id === decodeURIComponent(m[1]));
        if (!folder) return send(res, 404, 'text/plain', 'Unknown source.');
        if (m[2] === 'catalog') return send(res, 200, 'application/json', JSON.stringify(buildCatalog(folder.root)));
        // The order the folder's README states for its recipes (slugs), or [] (listorder.ts).
        if (m[2] === 'order') return send(res, 200, 'application/json', JSON.stringify(folderOrder(folder.root, buildCatalog(folder.root).recipes)));
        if (m[2] === 'densities') {
          const text = readCollectionDensities(folder.root);
          return text === null ? send(res, 404, 'text/plain', 'This collection has no densities.md.') : send(res, 200, 'text/markdown; charset=utf-8', text);
        }
        if (m[2] === 'theme') return send(res, 200, 'application/json', JSON.stringify(readCollectionTheme(folder.root, url.searchParams.get('name') ?? '')));
        // Bytes the app reads as data (no page shows this address): no type to sniff, none to run.
        // The length tells the app a large file's size, though it reads only the start of one.
        if (m[2] === 'image') {
          const bytes = readRecipeImage(folder.root, url.searchParams.get('path') ?? '');
          return send(res, 200, 'application/octet-stream', bytes, { 'content-length': String(bytes.length) });
        }
        // Only recipe files inside the folder are readable.
        const requested = url.searchParams.get('path') ?? '';
        const file = resolve(folder.root, requested);
        if (!file.startsWith(folder.root + sep) || basename(file) !== 'recipe.md') {
          return send(res, 403, 'text/plain', 'Only recipe.md files inside the collection can be read.');
        }
        // The same again with links followed: a recipe.md that is a link out of the folder is refused.
        const stat = statSync(file);
        if (!stat.isFile() || !isInside(file, folder.root)) return send(res, 403, 'text/plain', 'Only recipe.md files inside the collection can be read.');
        if (stat.size > RECIPE_FILE_LIMIT) return send(res, 413, 'text/plain', 'This recipe file is too large to show.');
        return send(res, 200, 'text/markdown; charset=utf-8', readFileSync(file, 'utf8'));
      }

      const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      // Own keys only: `/__proto__` or `/constructor` is not a file of the bundle.
      const content = Object.hasOwn(bundle.files, name) ? bundle.files[name] : undefined;
      if (typeof content !== 'string') return send(res, 404, 'text/plain', 'Not found.');
      const ext = name.split('.').pop() ?? '';
      const type = Object.hasOwn(TYPES, ext) ? TYPES[ext] : 'text/plain';
      // The page's policy, and the chart worker's own (a worker is held to the policy its script comes with).
      const policy = name === 'index.html' ? `${bundle.csp}; frame-ancestors 'none'` : name === 'chart-worker.js' ? bundle.workerCsp : null;
      return send(res, 200, type, content, policy ? { 'content-security-policy': policy } : {});
    } catch (e) {
      try {
        if (e instanceof Refusal) return send(res, e.status, 'text/plain; charset=utf-8', e.message);
        const missing = (e as NodeJS.ErrnoException)?.code === 'ENOENT';
        return send(res, missing ? 404 : 500, 'text/plain', missing ? 'Not found.' : String(e instanceof Error ? e.message : e));
      } catch {
        res.destroy();
      }
    }
  });
}
