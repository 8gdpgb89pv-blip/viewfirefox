(() => {
  const api = chrome;

  const SERVICE_URL = 'https://www.removepaywall.com/search?url=';
  const READER_URL = api.runtime.getURL('reader.html?url=');
  const DEFAULT_SITES = ["nytimes.com", "washingtonpost.com", "wsj.com", "bloomberg.com", "ft.com", "economist.com", "newyorker.com", "theatlantic.com", "technologyreview.com", "wired.com", "vanityfair.com", "vogue.com", "gq.com", "bonappetit.com", "architecturaldigest.com", "condenast.com", "forbes.com", "fortune.com", "fastcompany.com", "inc.com", "businessinsider.com", "zeit.de", "spiegel.de", "faz.net", "welt.de", "sueddeutsche.de", "handelsblatt.com", "manager-magazin.de", "wiwo.de", "tagesspiegel.de", "fr.de", "rp-online.de", "nw.de", "abendblatt.de", "mopo.de", "berliner-zeitung.de", "taz.de", "jungle.world", "cicero.de", "focus.de", "stern.de", "bild.de", "n-tv.de", "rtl.de", "kicker.de", "transfermarkt.de", "thetimes.co.uk", "theguardian.com", "telegraph.co.uk", "independent.co.uk", "thesun.co.uk", "dailymail.co.uk", "express.co.uk", "lemonde.fr", "lefigaro.fr", "liberation.fr", "latribune.fr", "les-echos.fr", "mediapart.fr", "elpais.com", "elmundo.es", "lavanguardia.com", "corriere.it", "repubblica.it", "lastampa.it", "nrc.nl", "volkskrant.nl", "telegraaf.nl", "dn.se", "svd.se", "politiken.dk", "berlingske.dk", "medium.com", "substack.com", "techcrunch.com", "theverge.com", "engadget.com", "arstechnica.com", "zdnet.com", "cnet.com", "pcmag.com", "tomshardware.com", "anandtech.com", "macrumors.com", "9to5mac.com", "9to5google.com", "androidcentral.com", "imore.com", "windowscentral.com", "xda-developers.com", "androidpolice.com", "neowin.net", "slashdot.org", "axios.com", "politico.com", "marketwatch.com", "barrons.com", "seekingalpha.com", "thestreet.com", "investopedia.com", "morningstar.com", "theinformation.com", "nature.com", "science.org", "cell.com", "thelancet.com", "nejm.org", "sciencemag.org", "scientificamerican.com", "nationalgeographic.com", "discovermagazine.com", "newscientist.com", "apartmenttherapy.com", "thekitchn.com", "food52.com", "seriouseats.com", "eater.com", "thrillist.com", "eonline.com", "tmz.com", "people.com", "usmagazine.com", "entertainmentweekly.com", "variety.com", "hollywoodreporter.com", "deadline.com", "indiewire.com", "rottentomatoes.com", "metacritic.com", "letterboxd.com", "goodreads.com", "espn.com", "espn.co.uk", "cbssports.com", "foxsports.com", "nbcsports.com", "skysports.com", "espncricinfo.com", "autoweek.com", "motorsport.com", "autosport.com", "cyclingnews.com", "velonews.com", "latimes.com", "chicagotribune.com", "bostonglobe.com", "sfgate.com", "seattletimes.com", "denverpost.com", "startribune.com", "detroitnews.com", "nydailynews.com", "nypost.com", "philly.com", "dallasnews.com", "statesman.com", "austinchronicle.com", "miaminewtimes.com", "quora.com", "scribd.com", "slideshare.net", "researchgate.net", "academia.edu", "jstor.org", "springer.com", "wiley.com", "sciencedirect.com", "ieee.org", "acm.org", "cambridge.org"];

  const DEFAULTS = {
    openInNewTab: true,
    showButton: true,
    autoDetect: true,
    buttonSites: DEFAULT_SITES
  };

  const log = (...args) => console.debug('[view]', ...args);

  const isHttpUrl = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const cleanUrl = (value) => {
    if (!isHttpUrl(value)) return null;
    const url = new URL(value);

    // Remove common campaign/tracking parameters without touching article IDs or content parameters.
    const removable = /^(utm_[a-z_]+|fbclid|gclid|mc_cid|mc_eid)$/i;
    [...url.searchParams.keys()].forEach((key) => {
      if (removable.test(key)) url.searchParams.delete(key);
    });

    url.hash = '';
    return url.toString();
  };

  async function getSettings() {
    const stored = await api.storage.local.get(Object.keys(DEFAULTS));
    return {
      openInNewTab: stored.openInNewTab ?? DEFAULTS.openInNewTab,
      showButton: stored.showButton ?? DEFAULTS.showButton,
      autoDetect: stored.autoDetect ?? DEFAULTS.autoDetect,
      buttonSites: Array.isArray(stored.buttonSites) && stored.buttonSites.length
        ? stored.buttonSites
        : DEFAULT_SITES
    };
  }

  async function saveDefaultsWithoutOverwritingUserChoices() {
    const stored = await api.storage.local.get(Object.keys(DEFAULTS));
    const patch = {};

    for (const [key, value] of Object.entries(DEFAULTS)) {
      if (stored[key] === undefined) patch[key] = value;
    }

    if (Object.keys(patch).length) {
      await api.storage.local.set(patch);
    }
  }

  async function setupMenus() {
    await api.contextMenus.removeAll();

    await api.contextMenus.create({
      id: 'view-page',
      title: 'Open this page with View',
      contexts: ['page'],
      documentUrlPatterns: ['http://*/*', 'https://*/*']
    });

    await api.contextMenus.create({
      id: 'view-link',
      title: 'Open link with View',
      contexts: ['link'],
      documentUrlPatterns: ['http://*/*', 'https://*/*']
    });

    await api.contextMenus.create({
      id: 'reader-page',
      title: 'Open this page in Reader View',
      contexts: ['page'],
      documentUrlPatterns: ['http://*/*', 'https://*/*']
    });

    await api.contextMenus.create({
      id: 'reader-link',
      title: 'Open link in Reader View',
      contexts: ['link'],
      documentUrlPatterns: ['http://*/*', 'https://*/*']
    });
  }

  async function openDestination(url, currentTabId, mode = 'service') {
    const cleaned = cleanUrl(url);
    if (!cleaned) throw new Error('Only HTTP(S) pages can be opened.');

    const settings = await getSettings();

    let destination = cleaned;
    if (mode === 'service') {
      destination = SERVICE_URL + encodeURIComponent(cleaned);
    } else if (mode === 'reader') {
      destination = READER_URL + encodeURIComponent(cleaned);
    }

    // Keep the preference consistent on desktop/mobile rather than hard-coding platform detection.
    if (settings.openInNewTab || !currentTabId) {
      return api.tabs.create({ url: destination });
    }

    return api.tabs.update(currentTabId, { url: destination });
  }

  api.runtime.onInstalled.addListener(async (details) => {
    try {
      await saveDefaultsWithoutOverwritingUserChoices();
      await setupMenus();

      if (api.commands?.reset) {
        await Promise.all([
          api.commands.reset('open-current-with-view'),
          api.commands.reset('open-current-reader-mode')
        ].map((p) => Promise.resolve(p).catch(() => undefined)));
      }

      // Lightweight migration marker for future updates.
      await api.storage.local.set({
        schemaVersion: 5,
        ...(details.reason === 'install' ? { firstRunAt: Date.now() } : {})
      });
    } catch (error) {
      console.error('[view] install/update setup failed', error);
    }
  });

  if (api.runtime.onStartup) {
    api.runtime.onStartup.addListener(async () => {
      try {
        await saveDefaultsWithoutOverwritingUserChoices();
        await setupMenus();
      } catch (error) {
        console.error('[view] startup setup failed', error);
      }
    });
  }

  api.contextMenus.onClicked.addListener(async (info, tab) => {
    const targetUrl = info.linkUrl || info.pageUrl;
    if (!targetUrl) return;

    try {
      const mode = info.menuItemId.startsWith('reader-') ? 'reader' : 'service';
      await openDestination(targetUrl, tab?.id ?? null, mode);
    } catch (error) {
      console.error('[view] context action failed', error);
    }
  });

  api.commands?.onCommand.addListener(async (command, commandTab) => {
    try {
      // Chrome supplies the active tab that triggered the shortcut. Use it
      // directly and only query as a compatibility fallback.
      let tab = commandTab;
      if (!tab?.url) {
        const tabs = await api.tabs.query({ active: true, currentWindow: true });
        tab = tabs?.[0];
      }
      if (!tab?.url) return;

      const mode = command === 'open-current-reader-mode' ? 'reader' : 'service';
      await openDestination(tab.url, tab.id ?? null, mode);
    } catch (error) {
      console.error('[view] command failed', error);
    }
  });

  async function fetchReaderSource(url) {
    const cleaned = cleanUrl(url);
    if (!cleaned) throw new Error('Only HTTP(S) pages can be read.');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(cleaned, {
        method: 'GET',
        credentials: 'omit',
        redirect: 'follow',
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`The page returned HTTP ${response.status}.`);
      const type = response.headers.get('content-type') || '';
      if (!/text\/html/i.test(type)) throw new Error('The source is not an HTML page.');
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  }

  api.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
      try {
        if (request.action === 'fetchReaderSource') {
          const html = await fetchReaderSource(request.url);
          sendResponse({ success: true, html });
          return;
        }

        if (request.action === 'openWithoutPaywall') {
          const tabId = sender?.tab?.id ?? request.tabId ?? null;
          await openDestination(request.url, tabId, 'service');
          sendResponse({ success: true });
          return;
        }

        if (request.action === 'openReaderMode') {
          const tabId = sender?.tab?.id ?? request.tabId ?? null;
          await openDestination(request.url, tabId, 'reader');
          sendResponse({ success: true });
          return;
        }

        if (request.action === 'getDefaults') {
          sendResponse({
            success: true,
            defaultSites: DEFAULT_SITES,
            settings: await getSettings()
          });
          return;
        }

        sendResponse({ success: false, error: 'Unknown action' });
      } catch (error) {
        console.error('[view] message failed', error);
        sendResponse({ success: false, error: error.message || String(error) });
      }
    })();

    return true;
  });


  // Re-trigger the content script check after navigation/activation. This is
  // a safety net for tabs where the page finished loading before the extension
  // started or where a SPA delayed its initial DOM update.
  api.tabs?.onUpdated?.addListener((tabId, changeInfo) => {
    if (changeInfo.status !== 'complete') return;
    api.tabs.sendMessage(tabId, { action: 'refresh' }).catch?.(() => {});
  });

  api.tabs?.onActivated?.addListener(({ tabId }) => {
    api.tabs.sendMessage(tabId, { action: 'refresh' }).catch?.(() => {});
  });

  // Make sure menus exist even when a background page starts without an install event.
  setupMenus().catch((error) => log('menu bootstrap skipped', error));
})();
