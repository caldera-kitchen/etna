// `etna theme list` and `etna theme check <name|dir>…`

import { basename } from 'node:path';

import { loadUnits } from '../node/files.ts';
import { checkTheme, LAYOUTS, THEME_CONTRACT } from './index.ts';
import { listThemes, loadTheme, readThemeFiles, themeDir } from './node.ts';

const HELP = `Usage: etna theme list
       etna theme check <name|dir>...

Themes: list the bundled ones, or check a theme against its contract (card themes: version
${THEME_CONTRACT}; both kinds are documented in themes/README.md).

  list    Each bundled card theme: name, layout and description. Then the bundled
          chart themes.
  check   Each theme named (a bundled theme) or given as a directory. A card theme: required
          files, theme.yaml keys and types, the contract version, the slots in card.html,
          content a theme may not carry, font stacks; then a sample traditional and a sample
          structured recipe rendered with it. A chart theme (kind: chart) is checked
          as "etna dag --check-theme" does: every value's type and range.

Options:
  --help  Show this help.

Exit code: 0 when every theme checked is clean (warnings allowed), 1 when one has errors,
2 on a usage error.`;

export async function run(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    return 0;
  }
  const [command, ...rest] = argv;
  const unknown = rest.find((a) => a.startsWith('-'));
  if (unknown !== undefined) return usage(`unknown option ${unknown}`);
  if (command === 'list') {
    if (rest.length > 0) return usage('list takes no arguments');
    const cards = list();
    console.log('\nChart themes (etna dag --theme):\n');
    const charts = await (await import('../dag/cli.ts')).run(['--list-themes']);
    return cards || charts;
  }
  if (command === 'check') {
    if (rest.length === 0) return usage('check needs a theme name or directory');
    return check(rest);
  }
  return usage(command === undefined ? 'no command given' : `unknown command "${command}"`);
}

function usage(message: string): number {
  console.error(`etna theme: ${message}\n\n${HELP}`);
  return 2;
}

function list(): number {
  const rows: string[][] = [];
  let failed = 0;
  for (const name of listThemes()) {
    try {
      const theme = loadTheme(name);
      const description = typeof theme.manifest.description === 'string' ? theme.manifest.description : '';
      rows.push([name, theme.layout, description]);
    } catch (error) {
      failed++;
      rows.push([name, '-', `cannot be loaded: ${(error as Error).message}`]);
    }
  }
  const header = ['theme', 'layout', 'description'];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]))).join('  ');
  console.log(line(header));
  for (const row of rows) console.log(line(row));
  console.log(`\nLayouts: ${LAYOUTS.join(', ')}.`);
  return failed > 0 ? 1 : 0;
}

/** True when the theme folder's theme.yaml says `kind: chart`. */
function isChartTheme(files: Record<string, string>): boolean {
  return /^kind:\s*["']?chart["']?\s*(?:#.*)?$/m.test(files['theme.yaml'] ?? '');
}

async function check(targets: string[]): Promise<number> {
  const units = loadUnits();
  let failed = 0;
  for (const target of targets) {
    let files: Record<string, string>;
    let dir: string;
    try {
      dir = themeDir(target);
      files = readThemeFiles(dir);
    } catch (error) {
      failed++;
      console.log(`${target}: ${(error as Error).message}`);
      continue;
    }
    if (isChartTheme(files)) {
      if ((await (await import('../dag/cli.ts')).run(['--check-theme', target])) !== 0) failed++;
      continue;
    }
    const report = checkTheme(files, { units });
    const label = /[\\/]/.test(target) || target.startsWith('.') ? `${target} (${basename(dir)})` : target;
    if (report.errors.length > 0) failed++;
    const verdict =
      report.errors.length > 0
        ? `${report.errors.length} error${report.errors.length === 1 ? '' : 's'}`
        : report.warnings.length > 0
          ? 'ok, with warnings'
          : 'ok';
    console.log(`${label}: ${verdict}`);
    for (const e of report.errors) console.log(`  error    ${e}`);
    for (const w of report.warnings) console.log(`  warning  ${w}`);
  }
  return failed > 0 ? 1 : 0;
}
