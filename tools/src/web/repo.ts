// A GitHub repository name as the app accepts it. Kept apart from sources.ts so the small
// pre-paint script and the settings module can use it without the source readers.

// `owner/name`; neither part may be only dots (`..`).
export const REPO_RE = /^(?!\.+\/)[A-Za-z0-9_.-]+\/(?!\.+$)[A-Za-z0-9_.-]+$/;

/** Accepts `owner/name` or a github.com URL; returns `owner/name` or null. */
export function parseRepo(input: string): string | null {
  const trimmed = input.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '');
  const repo = trimmed.split('/').slice(0, 2).join('/');
  return REPO_RE.test(repo) ? repo : null;
}
