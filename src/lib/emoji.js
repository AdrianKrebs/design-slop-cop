// Pure helper. Safe in both Node and browser contexts.
// Counts emoji codepoints. Excludes plain dingbats often used as non-emoji glyphs.
export function countEmoji(s) {
  if (!s) return 0;
  // Variation selector ️ is the "show as emoji" qualifier.
  const re = /(?:\p{Extended_Pictographic}️?)|[\u{1F300}-\u{1FAFF}]|[\u{1F900}-\u{1F9FF}]|[\u{2600}-\u{26FF}]️/gu;
  const m = s.match(re);
  return m ? m.length : 0;
}
