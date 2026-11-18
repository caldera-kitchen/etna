// `etna` — the command-line entry point. Each subcommand lives in its own module and is
// loaded only when used, so a problem in one tool never breaks the others.

import { guardTerminal } from './terminal.ts';

const COMMANDS: Record<string, { summary: string; load: () => Promise<{ run: (argv: string[]) => Promise<number> }>; passName?: boolean }> = {
  lint: { summary: 'Check recipes against the Etna rules (rules.yaml)', load: () => import('../lint/cli.ts') },
  fmt: { summary: 'Rewrite recipes into the canonical source style', load: () => import('../fmt/cli.ts') },
  card: { summary: 'Render a printable recipe card (HTML or PDF) from a theme', load: () => import('../card/cli.ts') },
  list: { summary: 'Make a shopping list: ingredients totaled across steps and recipes', load: () => import('../list/cli.ts') },
  density: { summary: 'Check a collection against the density table; list what needs an entry', load: () => import('../density/cli.ts') },
  theme: { summary: 'List the card and chart themes, or check one against its contract', load: () => import('../card/theme-cli.ts') },
  fonts: { summary: 'Download the free fonts the themes use, for local cards and PDFs', load: () => import('../card/fonts-cli.ts') },
  dag: { summary: 'Render the flow chart of a structured recipe (SVG or PDF)', load: () => import('../dag/cli.ts') },
  marks: { summary: "Show what each step's chart box will say, and the kind of each mark", load: () => import('../marks/cli.ts') },
  catalog: { summary: 'Build catalog.json for a collection', load: () => import('../catalog/cli.ts'), passName: true },
  search: { summary: 'Search one or more collections from the terminal', load: () => import('../catalog/cli.ts'), passName: true },
  restructure: { summary: 'Check that a structured conversion kept every word of the traditional recipe', load: () => import('../restructure/cli.ts') },
  serve: { summary: 'Browse, search and view collections in a local web GUI', load: () => import('../serve/cli.ts') },
  'build-web': { summary: 'Build the static web GUI (for GitHub Pages)', load: () => import('../web/build-cli.ts') },
};

function help(): string {
  const width = Math.max(...Object.keys(COMMANDS).map((c) => c.length));
  const lines = Object.entries(COMMANDS).map(([name, c]) => `  ${name.padEnd(width)}  ${c.summary}`);
  return ['Usage: etna <command> [options]', '', 'Commands:', ...lines, '', 'Run `etna <command> --help` for a command\'s options.'].join('\n');
}

async function main(argv: string[]): Promise<number> {
  const [name, ...rest] = argv;
  if (!name || name === '--help' || name === '-h' || name === 'help') {
    console.log(help());
    return 0;
  }
  const command = COMMANDS[name];
  if (!command) {
    console.error(`etna: unknown command "${name}"\n\n${help()}`);
    return 2;
  }
  const module = await command.load();
  return module.run(command.passName ? [name, ...rest] : rest);
}

// Recipe text printed to a terminal cannot carry terminal commands (terminal.ts).
guardTerminal(process.stdout);
guardTerminal(process.stderr);

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(`etna: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  },
);
