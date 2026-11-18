// Search synonyms. Data, not logic: each row is a group of names for the same thing, and a
// search for any of them finds recipes using any of them. How rows are applied is in
// `text.ts`; the first name of a row is only its internal label.
//
// Keep this short. Add a row only for a real miss — two names for one ingredient that both
// occur in recipes, or a name people type that recipes never use. Spelling slips (`carmel`,
// `brocolli`) and plurals do not belong here: fuzzy matching and stemming cover them.
// Write names in lower case without punctuation; singular or plural does not matter.

export const SYNONYMS: readonly (readonly string[])[] = [
  ['scallion', 'green onion', 'spring onion'],
  ['powdered sugar', 'confectioners sugar', 'icing sugar'],
  ['cornstarch', 'corn starch'],
  ['chickpea', 'garbanzo'],
];
