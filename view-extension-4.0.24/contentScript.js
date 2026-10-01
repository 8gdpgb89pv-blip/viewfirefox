(function() {
  const SERVICE_URL = 'https://www.removepaywall.com/search?url=';

  const DEBUG = false;
  const log = (...args) => DEBUG && console.log('[view]', ...args);

  log('Content script loaded on:', window.location.hostname);

  // macOS fallback for Command+Shift+V on normal article pages. Firefox itself
  // uses this shortcut for Paste as Plain Text, so WebExtension command delivery
  // can be blocked by the browser. Do not interfere with text-entry controls.
  const shortcutRuntime = typeof browser !== 'undefined' ? browser.runtime :
    (typeof chrome !== 'undefined' ? chrome.runtime : null);
  document.addEventListener('keydown', (event) => {
    if (!event.metaKey || !event.shiftKey || event.ctrlKey || event.altKey ||
        event.key.toLowerCase() !== 'v') return;

    const target = event.target instanceof Element ? event.target : null;
    const editable = !!target && (
      target.matches('input, textarea, select, [contenteditable="true"], [contenteditable=""]') ||
      !!target.closest('[contenteditable="true"], [contenteditable=""]')
    );
    if (editable) return;

    event.preventDefault();
    event.stopPropagation();
    shortcutRuntime?.sendMessage({
      action: 'openWithoutPaywall',
      url: window.location.href,
      fromKeyboardShortcut: true
    }).catch?.(() => {});
  }, true);

  const isAndroid = /Android/i.test(navigator.userAgent);
  const currentHost = window.location.hostname.toLowerCase();
  const isServicePage = currentHost.replace(/^www\./, '') === 'removepaywall.com' ||
                        currentHost.replace(/^www\./, '').endsWith('.removepaywall.com');

  // Full built-in fallback list. The background script stores the same list,
  // but keeping a local copy means the floating button still works if storage
  // is temporarily unavailable during page startup.
  const PRELOADED_SITES = [
    "nytimes.com",
    "washingtonpost.com",
    "wsj.com",
    "bloomberg.com",
    "ft.com",
    "economist.com",
    "newyorker.com",
    "theatlantic.com",
    "technologyreview.com",
    "wired.com",
    "vanityfair.com",
    "vogue.com",
    "gq.com",
    "bonappetit.com",
    "architecturaldigest.com",
    "condenast.com",
    "forbes.com",
    "fortune.com",
    "fastcompany.com",
    "inc.com",
    "businessinsider.com",
    "zeit.de",
    "spiegel.de",
    "faz.net",
    "welt.de",
    "sueddeutsche.de",
    "handelsblatt.com",
    "manager-magazin.de",
    "wiwo.de",
    "tagesspiegel.de",
    "fr.de",
    "rp-online.de",
    "nw.de",
    "abendblatt.de",
    "mopo.de",
    "berliner-zeitung.de",
    "taz.de",
    "jungle.world",
    "cicero.de",
    "focus.de",
    "stern.de",
    "bild.de",
    "n-tv.de",
    "rtl.de",
    "kicker.de",
    "transfermarkt.de",
    "thetimes.co.uk",
    "theguardian.com",
    "telegraph.co.uk",
    "independent.co.uk",
    "thesun.co.uk",
    "dailymail.co.uk",
    "express.co.uk",
    "lemonde.fr",
    "lefigaro.fr",
    "liberation.fr",
    "latribune.fr",
    "les-echos.fr",
    "mediapart.fr",
    "elpais.com",
    "elmundo.es",
    "lavanguardia.com",
    "corriere.it",
    "repubblica.it",
    "lastampa.it",
    "nrc.nl",
    "volkskrant.nl",
    "telegraaf.nl",
    "dn.se",
    "svd.se",
    "politiken.dk",
    "berlingske.dk",
    "medium.com",
    "substack.com",
    "techcrunch.com",
    "theverge.com",
    "engadget.com",
    "arstechnica.com",
    "zdnet.com",
    "cnet.com",
    "pcmag.com",
    "tomshardware.com",
    "anandtech.com",
    "macrumors.com",
    "9to5mac.com",
    "9to5google.com",
    "androidcentral.com",
    "imore.com",
    "windowscentral.com",
    "xda-developers.com",
    "androidpolice.com",
    "neowin.net",
    "slashdot.org",
    "axios.com",
    "politico.com",
    "marketwatch.com",
    "barrons.com",
    "seekingalpha.com",
    "thestreet.com",
    "investopedia.com",
    "morningstar.com",
    "theinformation.com",
    "nature.com",
    "science.org",
    "cell.com",
    "thelancet.com",
    "nejm.org",
    "sciencemag.org",
    "scientificamerican.com",
    "nationalgeographic.com",
    "discovermagazine.com",
    "newscientist.com",
    "apartmenttherapy.com",
    "thekitchn.com",
    "food52.com",
    "seriouseats.com",
    "eater.com",
    "thrillist.com",
    "eonline.com",
    "tmz.com",
    "people.com",
    "usmagazine.com",
    "entertainmentweekly.com",
    "variety.com",
    "hollywoodreporter.com",
    "deadline.com",
    "indiewire.com",
    "rottentomatoes.com",
    "metacritic.com",
    "letterboxd.com",
    "goodreads.com",
    "espn.com",
    "espn.co.uk",
    "cbssports.com",
    "foxsports.com",
    "nbcsports.com",
    "skysports.com",
    "espncricinfo.com",
    "autoweek.com",
    "motorsport.com",
    "autosport.com",
    "cyclingnews.com",
    "velonews.com",
    "latimes.com",
    "chicagotribune.com",
    "bostonglobe.com",
    "sfgate.com",
    "seattletimes.com",
    "denverpost.com",
    "startribune.com",
    "detroitnews.com",
    "nydailynews.com",
    "nypost.com",
    "philly.com",
    "dallasnews.com",
    "statesman.com",
    "austinchronicle.com",
    "miaminewtimes.com",
    "quora.com",
    "scribd.com",
    "slideshare.net",
    "researchgate.net",
    "academia.edu",
    "jstor.org",
    "springer.com",
    "wiley.com",
    "sciencedirect.com",
    "ieee.org",
    "acm.org",
    "cambridge.org"
  ];

  let openInNewTab = !isAndroid; // preserve the original desktop/new-tab + Android/current-tab behavior
  let settingsLoaded = false;

  const normalizeHost = (value) => String(value || '').toLowerCase().replace(/^www\./, '');

  const inList = (list) => {
    if (!Array.isArray(list)) return false;
    const h = normalizeHost(currentHost);
    return list.some((site) => {
      const clean = normalizeHost(site);
      return h === clean || h.endsWith('.' + clean);
    });
  };

  const isPreloadedSite = () => inList(PRELOADED_SITES);

  const PAYWALL_STRONG = [
    'subscribe to continue','subscribe to read','subscribe to keep reading',
    'subscribe for full access','sign in to continue reading','sign in to read this article',
    'this article is for subscribers','this content is for subscribers',
    'this article is only for subscribers','this content is only for subscribers',
    'members only','subscriber-only','subscribers only','premium article','premium content',
    'unlock this article','start your subscription','become a subscriber',
    "you've reached your article limit",'you have reached your article limit',
    "you've reached your free article limit",'you have reached your free article limit',
    'free articles remaining','free articles left','articles remaining','articles left',
    'register to continue reading','subscribe to unlock','subscription required',
    'your free articles are finished','you have no free articles left',
    'nur für abonnenten','nur für subscriber','abo erforderlich','abonnement erforderlich',
    'sie haben ihr artikel-limit erreicht','kostenlose artikel verbleiben','nur für ab sofort abonnenten',
    'réservé aux abonnés','abonnement requis','solo para suscriptores','suscripción requerida',
    'solo per abbonati','abbonamento richiesto'
  ];
  const PAYWALL_WEAK = ['continue reading','read the full article','already a subscriber','have an account?','premium','subscribe','sign in','log in','unlock','subscription','subscriber'];
  const PAYWALL_STRUCTURE = /(?:paywall|meter|subscription|subscriber|premium|article[-_ ]?limit|access[-_ ]?limit|registration|login[-_ ]?wall|content[-_ ]?gate|member[-_ ]?only|abo[-_ ]?wall|abonnement)/i;
  const LIMIT_PATTERN = /(?:\b(?:0|no|zero)\s+(?:free\s+)?articles?\s+(?:remaining|left)\b|\b(?:article|articles|reading)\s+limit\b|\blimit\s+(?:reached|exceeded)\b|\b(?:free\s+)?articles?\s+remaining\b)/i;

  const visibleElement = (el) => {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    try {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
    } catch (_) { return true; }
  };

  const compactTextNodes = () => {
    const nodes = [];
    const selectors = [
      '[role="dialog"]','[aria-modal="true"]','[data-testid*="paywall" i]',
      '[data-testid*="meter" i]','[id*="paywall" i]','[class*="paywall" i]',
      '[id*="meter" i]','[class*="meter" i]','[data-testid*="subscription" i]',
      '[class*="subscription" i]','[id*="subscription" i]','[class*="premium" i]',
      '[id*="premium" i]','[class*="registration" i]','[class*="login-wall" i]',
      '[class*="content-gate" i]','[id*="content-gate" i]','[data-paywall]','[data-meter]'
    ];
    try { document.querySelectorAll(selectors.join(',')).forEach((el) => { if (visibleElement(el)) nodes.push(el); }); } catch (_) {}
    return nodes;
  };

  const articleLike = () => {
    const roots = [];
    try {
      document.querySelectorAll('article,[itemprop="articleBody"],main,[role="main"],[class*="article-body" i],[class*="story-body" i],[class*="entry-content" i]').forEach((el) => {
        if (visibleElement(el) && (el.innerText || '').length >= 500) roots.push(el);
      });
    } catch (_) {}
    if (!roots.length && document.body) roots.push(document.body);
    return roots.sort((a,b) => (b.innerText?.length || 0) - (a.innerText?.length || 0))[0] || null;
  };

  const detectTruncation = (root) => {
    if (!root) return false;
    const nodes = [root, ...root.querySelectorAll('p,div,section')].slice(0, 300);
    for (const el of nodes) {
      try {
        const style = getComputedStyle(el);
        const hiddenOverflow = ['hidden','clip'].includes(style.overflowY) || style.overflow === 'hidden' || style.overflowY === 'hidden';
        const limitedHeight = Number.isFinite(el.scrollHeight) && Number.isFinite(el.clientHeight) && el.scrollHeight - el.clientHeight > 80;
        const blur = /blur\(/i.test(style.filter || '') || /blur\(/i.test(style.webkitFilter || '');
        const clamp = /line-clamp/i.test(style.webkitLineClamp || '') || /line-clamp/i.test(style.lineClamp || '');
        const mask = /gradient|mask/i.test(style.maskImage || '') || /gradient|mask/i.test(style.webkitMaskImage || '');
        if ((hiddenOverflow && limitedHeight) || blur || clamp || mask) return true;
      } catch (_) {}
    }
    return false;
  };

  const hasPaywall = () => {
    if (!document.body) return false;

    let score = 0;
    const bodyText = (document.body.innerText || '').toLowerCase();
    const roots = compactTextNodes();
    const article = articleLike();

    // Strong phrase in page-wide text is only a weak signal because newsletters,
    // footers and navigation often contain subscription language.
    if (PAYWALL_STRONG.some((p) => bodyText.includes(p))) score += 1;

    for (const node of roots) {
      const text = (node.innerText || '').toLowerCase();
      if (!text) continue;
      if (PAYWALL_STRONG.some((p) => text.includes(p))) score += 3;
      else if (PAYWALL_WEAK.some((p) => text.includes(p))) score += 1;
      if (LIMIT_PATTERN.test(text)) score += 3;
      if (PAYWALL_STRUCTURE.test(`${node.id || ''} ${node.className || ''} ${node.getAttribute?.('data-testid') || ''}`)) score += 2;
      if (node.matches?.('[role="dialog"],[aria-modal="true"]')) {
        const rect = node.getBoundingClientRect();
        if (rect.width > Math.min(innerWidth * 0.35, 320) && rect.height > 120) score += 2;
      }
    }

    if (article) {
      const articleText = (article.innerText || '').toLowerCase();
      if (PAYWALL_STRONG.some((p) => articleText.includes(p))) score += 2;
      if (LIMIT_PATTERN.test(articleText)) score += 2;
      if (detectTruncation(article)) score += 3;
    }

    // An actual visible modal/overlay containing account/subscription language
    // is a much stronger signal than generic site text.
    try {
      document.querySelectorAll('[role="dialog"],[aria-modal="true"]').forEach((el) => {
        if (!visibleElement(el)) return;
        const text = (el.innerText || '').toLowerCase();
        if (PAYWALL_STRONG.some((p) => text.includes(p)) || LIMIT_PATTERN.test(text)) score += 4;
      });
      document.querySelectorAll('[data-paywall],[data-meter]').forEach((el) => {
        if (visibleElement(el)) score += 4;
      });
    } catch (_) {}

    return score >= 4;
  };

  const loadOpenPreference = () => {
    try {
      const storage = typeof browser !== 'undefined' ? browser.storage : chrome.storage;
      storage.local.get(['openInNewTab'], (result) => {
        if (typeof result?.openInNewTab === 'boolean') openInNewTab = result.openInNewTab;
        settingsLoaded = true;
      });
    } catch (e) {
      log('Could not load tab preference:', e);
    }
  };
  loadOpenPreference();

  // IMPORTANT: Keep this cache updated, but never read storage inside the button
  // click handler. That preserves the simple click behavior of the original
  // working button and avoids losing mobile user activation.
  try {
    const storageApi = typeof browser !== 'undefined' ? browser.storage : chrome.storage;
    storageApi.onChanged?.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.openInNewTab && typeof changes.openInNewTab.newValue === 'boolean') {
        openInNewTab = changes.openInNewTab.newValue;
      }

      if (changes.buttonSites || changes.showButton || changes.autoDetect) {
        // Let the storage write settle before checking. This is what makes
        // “Add current site” appear on an already-open webpage immediately.
        setTimeout(checkAndShowButton, 0);
      }
    });
  } catch (e) {
    log('Storage change listener unavailable:', e);
  }

  // Remove the exact ad slot reported for removepaywall.com, plus known Google ad markup.
  if (isServicePage) {
    const AD_XPATHS = [
      '/html/body/div[1]/div[2]/div[2]'
    ];
    const AD_SELECTORS = [
      'ins.adsbygoogle',
      '[data-ad-slot]',
      '[data-ad-client]',
      '[data-google-av-adk]',
      '[data-google-av-aid]',
      '.GoogleActiveViewElement',
      '[aria-label*="advertisement" i]',
      '[id^="google_ads"]',
      '[id*="ad-container" i]',
      '[id*="ad_container" i]',
      '[class*="ad-container" i]',
      '[class*="ad_container" i]',
      '[class*="advertisement" i]',
      '[class*="ad-slot" i]',
      '[class*="adslot" i]',
      'iframe[src*="doubleclick.net"]',
      'iframe[src*="googlesyndication.com"]',
      'iframe[src*="googleadservices.com"]',
      'iframe[src*="pagead2.googlesyndication.com"]'
    ];

    const removeNode = (node) => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
      try { node.remove(); } catch (_) {
        try {
          node.style.setProperty('display', 'none', 'important');
          node.setAttribute('aria-hidden', 'true');
        } catch (_) {}
      }
    };

    const removeExactXPathAds = () => {
      for (const path of AD_XPATHS) {
        try {
          let node;
          while ((node = document.evaluate(path, document, null,
            XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue)) {
            removeNode(node);
          }
        } catch (_) {}
      }
    };

    const cleanAds = (root = document) => {
      removeExactXPathAds();
      try {
        if (root.querySelectorAll) root.querySelectorAll(AD_SELECTORS.join(',')).forEach(removeNode);
      } catch (_) {}
    };

    const runAdCleanup = () => {
      cleanAds();
      [50, 150, 300, 600, 1000, 2000, 5000].forEach((delay) => setTimeout(cleanAds, delay));
    };

    runAdCleanup();
    if (document.documentElement) {
      const adObserver = new MutationObserver((mutations) => {
        let changed = false;
        for (const mutation of mutations) {
          if (mutation.type === 'childList' && mutation.addedNodes.length) {
            changed = true;
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) cleanAds(node);
            });
          }
        }
        if (changed) removeExactXPathAds();
      });
      adObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  const createButton = () => {
    if (document.getElementById('view-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'view-btn';
    btn.type = 'button';
    btn.textContent = 'Read';

    // This is intentionally kept close to the original working implementation.
    if (isAndroid) {
      btn.style.cssText = `
        position: fixed !important;
        top: 100px !important;
        right: 10px !important;
        z-index: 2147483647 !important;
        padding: 12px 18px !important;
        background: #000 !important;
        color: #fff !important;
        border: none !important;
        border-radius: 8px !important;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
        font-size: 14px !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
        min-width: 70px !important;
        min-height: 44px !important;
        text-align: center !important;
        -webkit-tap-highlight-color: transparent !important;
        user-select: none !important;
        touch-action: manipulation !important;
      `;
    } else {
      btn.style.cssText = `
        position: fixed !important;
        bottom: 20px !important;
        right: 20px !important;
        z-index: 2147483647 !important;
        padding: 12px 20px !important;
        background: #000 !important;
        color: #fff !important;
        border: none !important;
        border-radius: 6px !important;
        font-family: sans-serif !important;
        font-size: 13px !important;
        font-weight: 500 !important;
        cursor: pointer !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
        min-height: 44px !important;
        touch-action: manipulation !important;
      `;
    }

    // Keep the actual click handler simple and synchronous, exactly as the
    // original implementation did. Current-tab navigation is especially
    // reliable on Firefox Android.
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = SERVICE_URL + encodeURIComponent(window.location.href);
      log('Opening:', url, 'newTab:', openInNewTab);

      if (openInNewTab) {
        // Desktop: preserve the original direct new-tab behavior.
        const opened = window.open(url, '_blank');
        if (!opened) {
          // Android or a popup-blocked environment: ask the background page
          // to create the tab. This path is only used when a new tab was chosen.
          try {
            const runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
            // Send the ORIGINAL page URL because background.js wraps it in the
            // View service URL itself. Sending `url` here would double-wrap it.
            runtime.sendMessage({ action: 'openWithoutPaywall', url: window.location.href, fromFloatingButton: true }).catch?.(() => {});
          } catch (_) {
            // Last resort: use the current page so the click never becomes a no-op.
            window.location.href = url;
          }
        }
      } else {
        window.location.href = url;
      }
    });

    const appendButton = () => {
      if (!document.getElementById('view-btn')) {
        (document.body || document.documentElement).appendChild(btn);
        log('Floating button added');
      }
    };

    if (document.body) appendButton();
    else {
      const observer = new MutationObserver((_, obs) => {
        if (document.body) { appendButton(); obs.disconnect(); }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  };

  const removeButton = () => {
    const existing = document.getElementById('view-btn');
    if (existing) existing.remove();
  };

  function checkAndShowButton() {
    if (isServicePage) return;

    let storage;
    try {
      storage = typeof browser !== 'undefined' ? browser.storage : chrome.storage;
      storage.local.get(['showButton', 'buttonSites', 'autoDetect'], (result) => {
        const r = result || {};
        if (r.showButton === false) {
          removeButton();
          return;
        }

        const userSites = Array.isArray(r.buttonSites) ? r.buttonSites : [];
        const siteEnabled = inList(userSites);
        const preloaded = isPreloadedSite();
        const detected = r.autoDetect !== false && hasPaywall();

        // An explicitly added site ALWAYS wins, regardless of auto-detection.
        if (siteEnabled || preloaded || detected) createButton();
        else removeButton();
      });
    } catch (e) {
      // Storage failure: still honor built-in sites / detection.
      if (isPreloadedSite() || hasPaywall()) createButton();
    }
  }

  // Message path used by the popup after “Add current site”, and by the
  // background fallback for new-tab navigation.
  const runtimeApi = typeof browser !== 'undefined' ? browser.runtime : (typeof chrome !== 'undefined' ? chrome.runtime : null);
  runtimeApi?.onMessage?.addListener((request, sender, sendResponse) => {
    if (request.action === 'refresh' || request.action === 'refreshButton') {
      checkAndShowButton();
      sendResponse?.({ success: true, visible: !!document.getElementById('view-btn') });
      return true;
    }

    if (request.action === 'openCurrentWithoutPaywall') {
      const url = SERVICE_URL + encodeURIComponent(window.location.href);
      window.location.href = url;
      sendResponse?.({ success: true });
      return true;
    }

    return false;
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAndShowButton, { once: true });
  } else {
    checkAndShowButton();
  }

  // Re-check auto-detection when a site injects a subscription wall after load.
  // Debounced so normal article rendering does not cause repeated full scans.
  let detectionTimer = null;
  try {
    const detectionObserver = new MutationObserver((mutations) => {
      let relevant = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes || []) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.id === 'view-btn' || node.closest?.('#view-btn')) continue;
          relevant = true;
          break;
        }
        if (relevant) break;
      }
      if (!relevant) return;
      clearTimeout(detectionTimer);
      detectionTimer = setTimeout(checkAndShowButton, 600);
    });
    if (document.documentElement) detectionObserver.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}

  // SPA/navigation support. Keep the checks inexpensive.
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      removeButton();
      checkAndShowButton();
    }
  }, 1500);

  setTimeout(checkAndShowButton, 2000);
  setTimeout(checkAndShowButton, 5000);
})();
