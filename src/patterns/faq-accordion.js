// Generic FAQ accordion at the bottom of a landing page. Almost every
// AI-template site ends with one. Detected via two paths:
//
//   a) ≥ 3 native <details> elements grouped together (most semantic).
//   b) A section labeled "FAQ" / "Frequently Asked Questions" / "Common
//      Questions" / "Questions" / "Q&A" with ≥ 3 uniform-shape children
//      whose text starts with a question word ("How", "What", "When",
//      "Why", "Can", "Does", "Is", "Do", etc.) or ends with "?".
//
// Both paths require the items to live in the lower half of the page —
// FAQ sections are always near the bottom. Helps distinguish from
// support pages where Q&A is the main content.

export default {
  id: 'faq_accordion',
  label: 'Generic FAQ accordion at the bottom of the page',
  shortLabel: 'FAQ',
  description: '"Frequently asked questions" — 3+ collapsible Q&A items near the bottom.',
  category: 'layout',
  thresholds: {
    minItems: 3,
    headingRegex: '^(faq|faqs?|frequently asked questions?|common questions?|questions?|q\\s*&\\s*a)\\b',
    questionStart: '^(how|what|when|where|why|who|which|can|could|do(es)?|is|are|will|should|may|might|am|have|has)\\b',
    bottomHalfFraction: 0.5
  },

  extract: function (ctx) {
    const { visible, isVisible, thresholds: T } = ctx;
    const docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, 1);
    const bottomCutoff = docH * T.bottomHalfFraction;
    const headingRe = new RegExp(T.headingRegex, 'i');
    const questionRe = new RegExp(T.questionStart, 'i');

    function looksLikeQuestion(text) {
      const t = text.trim();
      if (!t) return false;
      if (t.endsWith('?')) return true;
      if (questionRe.test(t)) return true;
      return false;
    }

    // Path A: native <details> cluster in the bottom half.
    const detailsList = Array.from(document.querySelectorAll('details')).filter(d => {
      if (!isVisible(d)) return false;
      const r = d.getBoundingClientRect();
      const top = r.top + window.scrollY;
      return top >= bottomCutoff;
    });
    let detailsCount = detailsList.length;
    let detailsSamples = [];
    if (detailsCount >= T.minItems) {
      detailsSamples = detailsList.slice(0, 3).map(d => {
        const sum = d.querySelector('summary');
        return { kind: 'details', text: ((sum || d).textContent || '').trim().slice(0, 80) };
      });
    }

    // Path B: heading match → uniform repeating children below.
    let accordionCount = 0;
    let accordionSamples = [];
    let foundHeading = null;
    const headings = visible.filter(el => /^H[1-4]$/.test(el.tagName) || /heading|title/i.test(el.className || ''));
    for (const h of headings) {
      const text = (h.textContent || '').trim();
      if (text.length > 60) continue;
      if (!headingRe.test(text)) continue;
      const r = h.getBoundingClientRect();
      const top = r.top + window.scrollY;
      if (top < bottomCutoff) continue;
      // Walk forward in DOM, looking for a parent / sibling that contains
      // ≥3 children whose text starts with a question word.
      let scope = h.parentElement;
      let bestCount = 0;
      let bestSamples = [];
      for (let depth = 0; depth < 4 && scope; depth++) {
        const candidates = Array.from(scope.querySelectorAll('*'));
        for (const c of candidates) {
          const kids = Array.from(c.children).filter(isVisible);
          if (kids.length < T.minItems) continue;
          // Each kid must look like a question entry: short leading text that
          // starts with a question word OR ends in "?".
          const qKids = kids.filter(k => {
            const t = (k.textContent || '').trim();
            if (t.length < 3 || t.length > 800) return false;
            // Take the first 120 chars (likely the question line)
            const lead = t.slice(0, 120);
            return looksLikeQuestion(lead);
          });
          if (qKids.length >= T.minItems && qKids.length > bestCount) {
            bestCount = qKids.length;
            bestSamples = qKids.slice(0, 3).map(k => ({
              kind: 'accordion',
              text: (k.textContent || '').trim().slice(0, 80)
            }));
          }
        }
        if (bestCount >= T.minItems) break;
        scope = scope.parentElement;
      }
      if (bestCount > accordionCount) {
        accordionCount = bestCount;
        accordionSamples = bestSamples;
        foundHeading = text;
      }
    }

    return {
      detailsCount,
      detailsSamples,
      accordionCount,
      accordionSamples,
      faqHeading: foundHeading
    };
  },

  score: function (signal, T) {
    if (!signal) return { triggered: false };
    if (signal.detailsCount >= T.minItems) {
      return {
        triggered: true,
        evidence: {
          mode: 'details',
          count: signal.detailsCount,
          samples: signal.detailsSamples
        }
      };
    }
    if (signal.accordionCount >= T.minItems) {
      return {
        triggered: true,
        evidence: {
          mode: 'accordion',
          heading: signal.faqHeading,
          count: signal.accordionCount,
          samples: signal.accordionSamples
        }
      };
    }
    return { triggered: false };
  }
};
