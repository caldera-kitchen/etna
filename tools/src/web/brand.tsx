// Etna's identity in the top bar: the Contour mark beside the wordmark (24 px; app.css `.top h1`),
// a link home to the landing page. Fixed, not a setting.

import { MARK_SVG } from './appearance.ts';

/** A mark, drawn from trusted constant markup (appearance.ts), never user text. */
export function MarkIcon(props: { svg: string; size: number; class?: string }) {
  return (
    <svg
      class={props.class}
      width={props.size}
      height={props.size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: props.svg }}
    />
  );
}

/**
 * The mark and the name, as the header shows them: a link to the landing page, as a site's logo
 * is. It is a real address (this page, with no recipe in its hash), so it can be opened in a new
 * tab; a plain click goes home in place through `onHome`, which leaves an entry for Back.
 */
export function Brand(props: { href: string; onHome: () => void }) {
  return (
    <h1 class="brand-title">
      <a
        class="brand"
        href={props.href}
        aria-label="Etna, home"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          props.onHome();
        }}
      >
        <MarkIcon svg={MARK_SVG} size={24} class="brand-mark" />
        <span>Etna</span>
      </a>
    </h1>
  );
}
