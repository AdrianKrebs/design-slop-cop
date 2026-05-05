// Numbered "1, 2, 3" step sequences. Looks for prominent numeric markers
// in reading order with at least 3 consecutive ascending values.

export default {
  id: 'numbered_steps',
  label: 'Numbered step sequence (1, 2, 3 …)',
  shortLabel: '1·2·3 steps',
  description: 'A landing page pretending to be an onboarding flow.',
  category: 'layout',
  thresholds: {
    minFontSize: 14,
    minBadgeBoxSize: 24,    // small digit acceptable when wrapped in a styled badge
    minRunLength: 3,
    maxStepNumbers: 50      // safety cap so a malicious / huge page can't blow memory
  },

  extract: function (ctx) {
    const { visible, thresholds: T } = ctx;
    const stepNumbers = [];
    for (const el of visible) {
      if (el.children.length > 0) continue;
      const txt = (el.textContent || '').trim();
      let num = null;
      // Standalone digit: "1", "01", "1.", "01.", "1)", "1/", "1 —"
      const m1 = txt.match(/^0?([1-9])\s*[.)\/\-—]?$/);
      // "Step 1" / "Step 01"
      const m2 = txt.match(/^Step\s+0?([1-9])$/i);
      // Circled number ①
      const m3 = txt.match(/^([①②③④⑤⑥⑦⑧⑨])$/);
      if (m1) num = parseInt(m1[1], 10);
      else if (m2) num = parseInt(m2[1], 10);
      else if (m3) num = '①②③④⑤⑥⑦⑧⑨'.indexOf(m3[1]) + 1;
      if (!num) continue;
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize);
      const r = el.getBoundingClientRect();
      // Either the digit itself is large, or it sits in a clearly-styled badge:
      //   - parent has a circular/rounded box ≥ 24×24
      //   - parent has a background fill or border
      let qualifies = fs >= T.minFontSize;
      if (!qualifies && el.parentElement) {
        const pr = el.parentElement.getBoundingClientRect();
        const pcs = getComputedStyle(el.parentElement);
        const isBadgeShape = pr.width >= T.minBadgeBoxSize && pr.height >= T.minBadgeBoxSize
          && pr.width <= 80 && pr.height <= 80;
        const hasFill = pcs.backgroundColor && pcs.backgroundColor !== 'rgba(0, 0, 0, 0)' && pcs.backgroundColor !== 'transparent';
        const hasBorder = parseFloat(pcs.borderTopWidth) >= 1;
        const isRounded = parseFloat(pcs.borderTopLeftRadius) >= 6;
        if (isBadgeShape && (hasFill || hasBorder || isRounded)) qualifies = true;
      }
      if (!qualifies) continue;
      stepNumbers.push({ num, top: r.top, left: r.left, fontSize: fs });
      if (stepNumbers.length >= T.maxStepNumbers) break;
    }
    stepNumbers.sort((a, b) => a.top - b.top || a.left - b.left);
    let runLength = 0;
    let currentRun = 0;
    let prev = 0;
    for (const s of stepNumbers) {
      if (s.num === prev + 1) currentRun++;
      else if (s.num === 1) currentRun = 1;
      else if (s.num !== prev) currentRun = 0;
      runLength = Math.max(runLength, currentRun);
      prev = s.num;
    }
    return {
      runLength,
      samples: stepNumbers.slice(0, 6).map(s => ({ num: s.num, fontSize: Math.round(s.fontSize) }))
    };
  },

  score: function (signal, T) {
    if (!signal || signal.runLength < T.minRunLength) return { triggered: false };
    return {
      triggered: true,
      evidence: { runLength: signal.runLength, samples: signal.samples }
    };
  }
};
