// What the CLI writes to a terminal. Recipes, themes and catalogs come from repositories the
// reader may not control, and the tools print their text (a lint message quotes the line, a
// shopping list its items, search its titles). A control character in that text would reach
// the terminal as a command: change colors, retitle the window, rewrite what was printed,
// or plant a hyperlink. Etna writes no escapes of its own, so on a terminal every control
// character but tab, newline and a carriage return ending a line is shown in caret notation
// (ESC as `^[`) instead. Output to a file or a pipe is left exactly as written.

/** The text with C0 and C1 controls (but tab, newline and CRLF) shown visibly: `^[` for ESC, `^?` for DEL, `\u009b` as `<9b>`. */
export function terminalSafe(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\r(?!\n)|[\u0000-\u0008\u000b-\u000c\u000e-\u001f\u007f-\u009f]/g, (c) => {
    const code = c.charCodeAt(0);
    if (code < 0x20) return `^${String.fromCharCode(code + 64)}`;
    if (code === 0x7f) return '^?';
    return `<${code.toString(16)}>`;
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Writable = { isTTY?: boolean; write: (chunk: any, ...rest: any[]) => boolean };

/** Make `stream` write `terminalSafe` text when it is a terminal; leave it alone otherwise. */
export function guardTerminal(stream: Writable): void {
  if (!stream.isTTY) return;
  const write = stream.write.bind(stream);
  stream.write = (chunk: unknown, ...rest: unknown[]): boolean => {
    const text = typeof chunk === 'string' ? chunk : chunk instanceof Uint8Array ? new TextDecoder().decode(chunk) : null;
    return text === null ? write(chunk, ...rest) : write(terminalSafe(text), ...rest);
  };
}
