// A heading's qualifier (ADR 0014) and the name a chart draws. In a module of their own, apart
// from the parser, so the chart's code (which the GUI runs in a Web Worker) can use them without
// loading the Markdown parser (see dag/index.ts).

/**
 * Split a part heading into its name and a qualifier: the text after the first em dash with
 * white space on both sides (SPEC §4.1). `Biga — 50% hydration` → `{ name: 'Biga', qualifier:
 * '50% hydration' }`. A heading with nothing before the dash, or nothing after it, has no
 * qualifier. A hyphen or en dash never introduces one.
 */
export function splitQualifier(text: string): { name: string; qualifier: string | null } {
  const m = /\s\u2014\s/.exec(text);
  if (!m) return { name: text, qualifier: null };
  const name = text.slice(0, m.index).trim();
  const qualifier = text.slice(m.index + m[0].length).trim();
  if (name === '' || qualifier === '') return { name: text, qualifier: null };
  return { name, qualifier };
}

/**
 * The name a chart draws for a component or step: its heading, less a qualifier that designates
 * it optional (the chart marks that its own way). Every other heading is drawn whole.
 */
export function nodeName(node: { heading: { text: string }; optional: boolean }): string {
  return node.optional ? splitQualifier(node.heading.text).name : node.heading.text;
}
