// Sidebar/nav with emoji icons. Common AI-generated dashboard pattern.

export default {
  id: 'sidebar_emoji',
  label: 'Sidebar/nav with emoji icons',
  shortLabel: 'Emoji nav',
  description: 'Nav or sidebar items with emoji icons.',
  category: 'layout',
  thresholds: {
    sidebarRatio: 0.4,        // ≥40% of sidebar links must contain emoji
    sidebarMinLinks: 3,
    minNavCount: 3
  },

  extract: function (ctx) {
    const { isVisible, countEmoji, thresholds: T } = ctx;
    // Sidebar pattern: dedicated aside / sidebar with emoji-prefixed links.
    let sidebarPattern = false;
    const aside = document.querySelector('aside, nav[class*="sidebar" i], [class*="sidebar" i], [data-sidebar]');
    if (aside && isVisible(aside)) {
      const links = Array.from(aside.querySelectorAll('a, button')).slice(0, 30);
      let withEmoji = 0;
      for (const l of links) {
        if (countEmoji(l.textContent || '') > 0) withEmoji++;
      }
      if (links.length >= T.sidebarMinLinks && withEmoji / links.length > T.sidebarRatio) {
        sidebarPattern = true;
      }
    }

    // Loose: emoji-prefixed nav / sidebar links. Card titles with cute
    // emojis and standalone <button>s aren't slop on their own — the slop
    // signature is emoji icons used as nav glyphs.
    const uiSel = 'nav a, nav button, aside a, aside button, header a, header button, [role=navigation] a, .sidebar a, .sidebar button';
    let inNavOrButtons = 0;
    for (const el of document.querySelectorAll(uiSel)) {
      if (!isVisible(el)) continue;
      inNavOrButtons += countEmoji((el.textContent || '').slice(0, 100));
    }

    // Total page emoji count for evidence
    const totalInPage = countEmoji(document.body.innerText || '');

    return { sidebarPattern, inNavOrButtons, totalInPage };
  },

  score: function (signal, T) {
    if (!signal) return { triggered: false };
    if (!signal.sidebarPattern && signal.inNavOrButtons < T.minNavCount) return { triggered: false };
    return {
      triggered: true,
      evidence: {
        sidebarPattern: signal.sidebarPattern,
        emojiInNavOrButtons: signal.inNavOrButtons,
        totalPageEmoji: signal.totalInPage
      }
    };
  }
};
