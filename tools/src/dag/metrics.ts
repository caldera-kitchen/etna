// Built-in advance widths for laying out proportional text, so that no font is measured at
// render time and a chart comes out the same in Node and in the browser. These tables are only
// the `text-measure` fallback, for a font with no generated metrics: a font with them
// (font-metrics.ts, every font in the cache) is measured by its own widths instead. Their only
// readers: `measurer` in measure.ts reads ADVANCES when the first family of a stack has no
// metrics, and the theme checker (theme.ts) reads MEASURED_FAMILIES to warn about such a stack
// naming a font the tables were not measured for. CHARS is also the character set the
// generated metrics cover (metrics-node.ts).
//
// Each table gives, for every character in CHARS, the widest advance (in 1/1000 em) found among
// the fonts its family list names, at the weights of its band: "regular" covers weights up to
// 400, "bold" anything heavier (the widest of 500, 600 and 700). Taking the widest font for each
// character means a line is never measured narrower than any of those fonts draws it; kerning
// only ever brings a line in. A character not in the table counts as the widest one there is.
//
// Measured in Chrome (canvas measureText at 1000 px) on macOS, 2026-11-06:
//   sans   Avenir Next, Nunito Sans, Helvetica Neue, Helvetica, Arial
//          (Arimo and Liberation Sans share Arial's widths)
//   serif  Charter, Iowan Old Style, Georgia, Source Serif 4, Times New Roman
//          (Tinos and Liberation Serif share Times New Roman's widths)

/** The characters the tables cover, in table order. */
export const CHARS = "0123456789 !\"#$%&'()*+,-./:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~°½⅓⅔¼¾⅛–—‘’“”…×éèêëàâäáñçüöóôíîïúûÉ®™•·";

/** Fonts each table covers: a theme whose font stack names others may overflow its boxes. */
export const MEASURED_FAMILIES: Record<'sans' | 'serif', readonly string[]> = {
  sans: ['Avenir Next', 'Nunito Sans', 'Helvetica Neue', 'Helvetica', 'Arial', 'Arimo', 'Liberation Sans'],
  serif: ['Charter', 'Iowan Old Style', 'Georgia', 'Source Serif 4', 'Times New Roman', 'Tinos', 'Liberation Serif'],
};

export const ADVANCES: Record<string, readonly number[]> = {
  'sans-regular': [600,600,600,600,600,600,600,600,600,600,278,333,426,600,600,1000,704,278,333,333,450,666,278,424,278,370,300,300,666,666,666,556,1015,729,685,724,770,667,611,795,761,278,519,667,556,906,777,872,667,883,722,667,611,732,689,1101,667,667,611,333,370,333,666,556,500,556,637,556,637,572,333,632,583,250,251,519,296,889,581,611,635,635,360,500,350,581,515,841,525,514,500,352,265,352,666,400,937,834,834,893,893,834,556,1000,278,278,426,426,1000,666,572,572,572,572,556,556,556,556,581,556,581,611,611,611,278,278,278,581,581,667,815,1000,524,333],
  'sans-bold': [646,646,646,646,646,646,646,646,646,646,278,357,498,603,646,1000,781,303,358,358,489,666,300,434,300,415,333,333,666,666,666,611,1015,744,722,741,774,667,611,778,773,318,556,722,611,955,790,851,667,857,722,667,621,741,713,1113,703,669,648,354,415,354,690,556,500,574,659,574,658,596,364,658,617,296,299,595,319,924,616,632,657,657,396,556,384,614,567,871,594,567,519,391,289,391,666,416,959,950,950,940,940,950,556,1000,300,300,507,507,1000,666,596,596,596,596,574,574,574,574,616,574,614,632,632,632,296,296,296,614,614,667,815,1000,524,333],
  'serif-regular': [614,556,559,556,565,556,566,556,596,566,278,338,412,745,610,932,831,215,419,419,500,833,302,374,302,481,319,319,833,833,833,486,1000,722,667,707,781,653,612,742,815,390,518,722,618,935,808,802,621,802,703,561,632,787,722,1037,722,722,667,421,481,421,1000,643,500,541,619,520,614,533,369,557,641,329,303,594,329,955,643,579,622,601,456,465,360,628,579,836,569,586,490,486,500,486,833,419,1050,1050,1050,1050,1050,1050,643,1000,333,333,474,474,1000,833,533,533,533,533,541,541,541,541,643,520,628,579,579,579,329,329,329,628,628,653,942,980,590,333],
  'serif-bold': [701,594,626,625,649,599,648,594,676,648,297,376,555,745,641,1000,857,278,453,453,502,833,328,379,328,491,367,367,833,833,833,548,1000,776,757,729,834,721,671,807,913,446,595,817,686,1023,843,838,701,838,797,649,689,833,764,1126,809,732,737,466,491,466,1000,703,500,596,646,536,663,572,393,591,680,354,346,641,346,1016,690,636,658,648,520,513,397,677,585,866,603,599,525,500,500,500,833,420,1071,1071,1071,1071,1071,1071,703,1000,333,333,533,533,1000,833,572,572,572,572,596,596,596,596,690,536,677,636,636,636,354,354,354,677,677,721,942,1000,590,338],
};
