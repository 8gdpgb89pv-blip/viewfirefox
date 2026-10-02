(function () {
  'use strict';

  const host = String(location.hostname || '').toLowerCase().replace(/^www\./, '');
  if (host !== 'removepaywall.com' && !host.endsWith('.removepaywall.com')) return;

  // Exact DOM paths supplied from real removepaywall.com pages.
  const BLOCK_XPATHS = [
    '/html/body/div[1]/div[2]/div[2]',
    '//*[@id="ad_position_box"]',
    '/html/ins[2]',
    '/html/body/div/div[1]/div[1]/header/nav',
    '/html/body/div/div[1]/div[1]/form'
  ];

  // CSS equivalents make the blocking work continuously without depending on XPath timing.
  const BLOCK_SELECTORS = [
    '#ad_position_box',
    'html > ins:nth-of-type(2)',
    'body > ins:nth-of-type(2)',
    'body > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2)',
    'html > body > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > header > nav',
    'html > body > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > form',
    'ins.adsbygoogle.adsbygoogle-noablate',
    'ins.adsbygoogle',
    '[data-google-av-adk]',
    '[data-google-av-aid]',
    '.GoogleActiveViewElement',
    '[data-nc="1"]',
    '#full-slot-autoplay-in-motion',
    '#bannerAWithoutBody',
    '[class*="ns-vcgft-"]',
    '[class*="ns-k08pc-"]',
    '[class*="ns-ayl9i-"]',
    'iframe[title="Advertisement" i]',
    'iframe[aria-label="Advertisement" i]',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[src*="googleadservices.com"]',
    'iframe[src*="pagead2.googlesyndication.com"]'
  ];

  const HIDE_CSS = `
    #ad_position_box,
    html > ins:nth-of-type(2),
    body > ins:nth-of-type(2),
    body > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2),
    html > body > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > header > nav,
    ins.adsbygoogle.adsbygoogle-noablate,
    ins.adsbygoogle,
    [data-google-av-adk],
    [data-google-av-aid],
    .GoogleActiveViewElement,
    [data-nc="1"],
    #full-slot-autoplay-in-motion,
    #bannerAWithoutBody,
    [class*="ns-vcgft-"],
    [class*="ns-k08pc-"],
    [class*="ns-ayl9i-"] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
      max-height: 0 !important;
      min-height: 0 !important;
    }
  `;

  function hideAndRemove(node) {
    if (!node || node === document.documentElement || node === document.body) return;
    try {
      node.style.setProperty('display', 'none', 'important');
      node.style.setProperty('visibility', 'hidden', 'important');
      node.style.setProperty('opacity', '0', 'important');
      node.style.setProperty('pointer-events', 'none', 'important');
      node.setAttribute('aria-hidden', 'true');
    } catch (_) {}
    try { node.remove(); } catch (_) {}
  }

  function evaluateXPath(xpath) {
    try {
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      for (let i = 0; i < result.snapshotLength; i++) {
        hideAndRemove(result.snapshotItem(i));
      }
    } catch (_) {}
  }

  function removeByXPath() {
    for (const xpath of BLOCK_XPATHS) evaluateXPath(xpath);

    // Fast direct-ID path for the supplied //*[@id="ad_position_box"] rule.
    try {
      hideAndRemove(document.getElementById('ad_position_box'));
    } catch (_) {}
  }

  function removeBySelectors(root) {
    const scope = root && root.querySelectorAll ? root : document;
    try {
      if (scope.nodeType === Node.ELEMENT_NODE) {
        for (const selector of BLOCK_SELECTORS) {
          try {
            if (scope.matches(selector)) hideAndRemove(scope);
          } catch (_) {}
        }
      }
      const nodes = scope.querySelectorAll(BLOCK_SELECTORS.join(','));
      for (const node of nodes) hideAndRemove(node);
    } catch (_) {}
  }

  function installCSS() {
    try {
      if (document.getElementById('__view_adblock_css')) return;
      const style = document.createElement('style');
      style.id = '__view_adblock_css';
      style.textContent = HIDE_CSS;
      (document.documentElement || document.head || document.body)?.appendChild(style);
    } catch (_) {}
  }

  function clean(root = document) {
    removeByXPath();
    removeBySelectors(root);
    removeByXPath();
  }

  installCSS();
  clean();

  function startObserver() {
    if (!document.documentElement) return false;
    try {
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type !== 'childList') continue;
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Re-run XPath globally because exact absolute paths can target a newly inserted node.
              clean(node);
            }
          }
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      return true;
    } catch (_) {
      return false;
    }
  }

  startObserver();

  // Catch ads created by Google after several async phases.
  const delays = [0, 25, 50, 100, 200, 350, 500, 750, 1000, 1500, 2500, 4000, 6000, 9000, 12000];
  for (const delay of delays) setTimeout(() => { installCSS(); clean(); }, delay);

  // Keep the exact blocks enforced for the lifetime of the service page.
  setInterval(() => { installCSS(); clean(); }, 750);
})();
