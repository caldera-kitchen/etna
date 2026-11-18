// `etna serve` — browse collections on this computer in the web GUI. Works offline.

import { createEtnaServer, foldersFrom } from './server.ts';

const HELP = `Usage: etna serve <collection-folder...> [--port <n>]

Starts a local, read-only web GUI over one or more collection folders: browse,
search, view cards and flow charts, preview formatting. Nothing is written.
Public GitHub repositories can be added from inside the GUI.

Options:
  --port <n>   Port to listen on (default: 4173)`;

export async function run(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    return 0;
  }
  const paths: string[] = [];
  let port = 4173;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port') port = Number(argv[++i]);
    else paths.push(argv[i]);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('etna serve: --port needs a number between 1 and 65535');
    return 2;
  }
  const folders = foldersFrom(paths);
  const server = await createEtnaServer(folders);
  await new Promise<void>((ready, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', ready);
  });
  console.log(`Etna is running at http://localhost:${port}`);
  for (const f of folders) console.log(`  ${f.label}: ${f.root}`);
  if (folders.length === 0) console.log('  (no local folders; add a GitHub repo in the GUI)');
  console.log('Press Ctrl+C to stop.');
  return new Promise<number>(() => {
    // Keep running until interrupted.
  });
}
