// A style's name in a toolbar menu. A menu is as wide as its longest entry, and the card and
// chart toolbars must hold one row at 1280 px, so a toolbar shows a name of at most
// MENU_NAME_LIMIT characters, the last an ellipsis when it is cut. Settings, which has room,
// shows names whole. The theme checkers warn about a longer name (menuNameWarning).

/**
 * The most characters a toolbar menu shows of a style's name, the ellipsis included: the longest
 * bundled name, "Shopping list", has 13. Measured in Chrome at 1280 px, the card toolbar holds one
 * row with a 13-character name in its Style menu (5 px to spare). The chart toolbar does not
 * hold one row with a source's chart style of more than about 7 characters, at any limit.
 */
export const MENU_NAME_LIMIT = 13;

/** `text` cut to at most `limit` characters, the last an ellipsis when it is cut. */
export function cutName(text: string, limit = MENU_NAME_LIMIT): string {
  if (text.length <= limit) return text;
  if (limit <= 1) return '…';
  return `${text.slice(0, limit - 1).trimEnd()}…`;
}

/** True for the warning menuNameWarning gives: the GUI leaves it out of a style's notes, where it would only say what the menu shows. */
export const isMenuNameWarning = (message: string): boolean => message.includes(' characters; toolbar menus show ');

/** The checkers' warning for a name a toolbar menu will cut; null when it fits. */
export function menuNameWarning(name: string, limit = MENU_NAME_LIMIT): string | null {
  if (name.length <= limit) return null;
  return `name: "${name}" is ${name.length} characters; toolbar menus show ${limit} and will cut it to "${cutName(name, limit)}" (Settings shows it whole). Keep it to a word or two`;
}
