// The "slop font" call-out list from the r/UXDesign reddit thread.
// Match by prefix so "Geist Variable" / "Inter Variable" count as the same family.
export const SLOP_FONT_PREFIXES = [
  'Space Grotesk',
  'Instrument Serif',
  'Fraunces',
  'Bricolage Grotesque',
  'Sora',
  'Young Serif',
  'Bodoni',
  'Geist',
  'Syne'
];

export function isSlopFont(name) {
  if (!name) return false;
  return SLOP_FONT_PREFIXES.some(p => name === p || name.startsWith(p + ' '));
}
