// Recipe directory slugs (SPEC §2).

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Derive a slug from a title: lowercase, `&` → `and`, accents folded, punctuation stripped, spaces → `-`. */
export function slugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isValidSlug(name: string): boolean {
  return SLUG_RE.test(name);
}
