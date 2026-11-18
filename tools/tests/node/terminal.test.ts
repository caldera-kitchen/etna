// Recipe text printed to a terminal carries no terminal commands (src/cli/terminal.ts).

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { guardTerminal, terminalSafe } from '../../src/cli/terminal.ts';

const ESC = '\u001b';
const BEL = '\u0007';
// Colors, a window title, a hyperlink, and an 8-bit CSI: what a hostile recipe can hold.
const HOSTILE = `x ${ESC}[31mRED${ESC}[0m ${ESC}]0;TITLE${BEL} ${ESC}]8;;https://attacker.example${ESC}\\click${ESC}]8;;${ESC}\\ \u009b2J`;

describe('terminalSafe', () => {
  it('shows every control character but tab, newline and CRLF', () => {
    const out = terminalSafe(HOSTILE);
    expect(out).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/);
    expect(out).toBe('x ^[[31mRED^[[0m ^[]0;TITLE^G ^[]8;;https://attacker.example^[\\click^[]8;;^[\\ <9b>2J');
    expect(terminalSafe('a\tb\nc\r\nd\re\u007f')).toBe('a\tb\nc\r\nd^Me^?');
    expect(terminalSafe('Crème brûlée — ½ cup, 2–3 °C')).toBe('Crème brûlée — ½ cup, 2–3 °C');
  });
});

describe('guardTerminal', () => {
  const stream = (isTTY: boolean) => {
    const written: unknown[] = [];
    return { isTTY, written, write: (chunk: unknown) => (written.push(chunk), true) };
  };

  it('filters what goes to a terminal, strings and bytes', () => {
    const s = stream(true);
    guardTerminal(s);
    s.write(HOSTILE);
    s.write(new TextEncoder().encode(`${ESC}[2J`));
    expect(s.written).toEqual([terminalSafe(HOSTILE), '^[[2J']);
  });

  it('leaves a file or a pipe exactly as written', () => {
    const s = stream(false);
    guardTerminal(s);
    s.write(HOSTILE);
    expect(s.written).toEqual([HOSTILE]);
  });

  it('etna lint piped quotes the recipe as it is (only a terminal is filtered)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'etna-terminal-'));
    mkdirSync(join(dir, 'recipes', 'ansi'), { recursive: true });
    writeFileSync(join(dir, 'recipes', 'ansi', 'recipe.md'), `---\netna: 1\n---\n\n# Ansi\n\n### Mix\n\n- 100 g flour\n- [${HOSTILE}](#nowhere)\n\nMix.\n`);
    const r = spawnSync(process.execPath, [join(import.meta.dirname, '..', '..', 'bin', 'etna.js'), 'lint', dir], { encoding: 'utf8' });
    expect(r.stdout + r.stderr).toContain(`${ESC}[31mRED`);
  });
});
