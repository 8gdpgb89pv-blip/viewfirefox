document.addEventListener('DOMContentLoaded', async () => {
  const api = typeof browser !== 'undefined' ? browser : chrome;
  const isAndroid = /Android/i.test(navigator.userAgent);

  const $ = (id) => document.getElementById(id);
  const openBtn = $('open-current');
  const readerBtn = $('open-reader');
  const copyBtn = $('copy-url');
  const originalBtn = $('open-original');
  const addSiteBtn = $('add-input');
  const resetBtn = $('reset-sites');
  const urlBox = $('current-url');
  const titleBox = $('current-title');
  const detectionNote = $('detection-note');
  const statusPill = $('status-pill');
  const tabToggle = $('tab-toggle');
  const btnToggle = $('btn-toggle');
  const autoToggle = $('auto-toggle');
  const siteInput = $('site-input');
  const siteSearch = $('site-search');
  const siteList = $('site-list');
  const siteCount = $('site-count');
  const addCurrentSiteBtn = $('add-current-site');

  const defaults = {
    openInNewTab: true,
    showButton: true,
    autoDetect: true,
    buttonSites: []
  };

  let settings = { ...defaults };
  let defaultSites = [];
  let currentTab = null;
  let sites = [];

  const setStatus = (text, state = '') => {
    statusPill.textContent = text;
    statusPill.className = `status-pill ${state}`.trim();
  };

  const cleanUrl = (value) => {
    if (!isValidHttpUrl(value)) return null;
    const url = new URL(value);
    const removable = /^(utm_[a-z_]+|fbclid|gclid|mc_cid|mc_eid)$/i;
    [...url.searchParams.keys()].forEach((key) => {
      if (removable.test(key)) url.searchParams.delete(key);
    });
    url.hash = '';
    return url.toString();
  };

  const destinationFor = (action, value) => {
    const cleaned = cleanUrl(value);
    if (!cleaned) return null;
    if (action === 'openReaderMode') {
      return `${api.runtime.getURL('reader.html')}?url=${encodeURIComponent(cleaned)}`;
    }
    return `https://www.removepaywall.com/search?url=${encodeURIComponent(cleaned)}`;
  };

  const isValidHttpUrl = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const normalizeDomain = (value) => {
    let input = String(value || '').trim().toLowerCase();
    if (!input) return null;

    try {
      if (!/^https?:\/\//i.test(input)) input = `https://${input}`;
      const url = new URL(input);
      if (!['http:', 'https:'].includes(url.protocol)) return null;

      let host = url.hostname.toLowerCase().replace(/^www\./, '');
      if (!host || host.includes(' ') || host === 'localhost' || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return null;
      if (!host.includes('.')) return null;
      return host;
    } catch {
      return null;
    }
  };

  const saveSettings = async (patch) => {
    settings = { ...settings, ...patch };
    await api.storage.local.set(patch);
  };

  async function load() {
    const [stored, defaultResponse] = await Promise.all([
      api.storage.local.get(['openInNewTab', 'showButton', 'autoDetect', 'buttonSites']),
      api.runtime.sendMessage({ action: 'getDefaults' }).catch(() => null)
    ]);

    defaultSites = defaultResponse?.defaultSites || [];
    settings = {
      openInNewTab: stored.openInNewTab ?? defaultResponse?.settings?.openInNewTab ?? defaults.openInNewTab,
      showButton: stored.showButton ?? defaultResponse?.settings?.showButton ?? defaults.showButton,
      autoDetect: stored.autoDetect ?? defaultResponse?.settings?.autoDetect ?? defaults.autoDetect,
      buttonSites: Array.isArray(stored.buttonSites) && stored.buttonSites.length
        ? stored.buttonSites
        : (defaultResponse?.settings?.buttonSites || defaultSites)
    };

    sites = [...settings.buttonSites];
    tabToggle.checked = settings.openInNewTab;
    btnToggle.checked = settings.showButton;
    autoToggle.checked = settings.autoDetect;
    renderSites();
    refreshCurrentSiteButton();
  }

  function renderSites() {
    const query = siteSearch.value.trim().toLowerCase();
    const filtered = sites
      .filter((site) => !query || site.toLowerCase().includes(query))
      .sort((a, b) => a.localeCompare(b));

    siteCount.textContent = String(sites.length);
    refreshCurrentSiteButton();
    siteList.replaceChildren();

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = query ? 'No matching sites.' : 'No sites enabled.';
      siteList.appendChild(empty);
      return;
    }

    filtered.forEach((site) => {
      const item = document.createElement('div');
      item.className = 'site-item';

      const name = document.createElement('span');
      name.className = 'site-name';
      name.textContent = site;

      if (currentTab?.url) {
        try {
          const host = new URL(currentTab.url).hostname.toLowerCase().replace(/^www\./, '');
          if (host === site.replace(/^www\./, '') || host.endsWith(`.${site.replace(/^www\./, '')}`)) {
            const tag = document.createElement('span');
            tag.className = 'site-tag';
            tag.textContent = 'current';
            name.appendChild(tag);
          }
        } catch {}
      }

      const remove = document.createElement('button');
      remove.className = 'remove-btn';
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => removeSite(site));

      item.append(name, remove);
      siteList.appendChild(item);
    });
  }

  function refreshCurrentSiteButton() {
    if (!addCurrentSiteBtn) return;
    const domain = normalizeDomain(currentTab?.url || '');
    if (!domain) {
      addCurrentSiteBtn.disabled = true;
      addCurrentSiteBtn.textContent = 'Add current site';
      addCurrentSiteBtn.title = 'Only HTTP(S) pages can be added.';
      return;
    }

    const enabled = sites.some((site) => {
      const clean = site.replace(/^www\./i, '').toLowerCase();
      return domain === clean || domain.endsWith(`.${clean}`);
    });

    addCurrentSiteBtn.disabled = enabled;
    addCurrentSiteBtn.textContent = enabled ? 'Already added' : 'Add current site';
    addCurrentSiteBtn.title = enabled ? `${domain} is already enabled.` : `Always show the View button on ${domain}.`;
  }

  async function refreshDetection() {
    if (!currentTab?.url || !isValidHttpUrl(currentTab.url)) {
      setStatus('Unavailable', 'is-error');
      detectionNote.textContent = 'This page cannot be processed by the extension.';
      openBtn.disabled = true;
      readerBtn.disabled = true;
      originalBtn.disabled = true;
      refreshCurrentSiteButton();
      return;
    }

    openBtn.disabled = false;
    readerBtn.disabled = false;
    originalBtn.disabled = false;

    let detection = null;
    try {
      detection = await api.tabs.sendMessage(currentTab.id, { action: 'getDetection' });
    } catch {
      detection = null;
    }

    const enabled = detection?.enabledForSite;
    const detected = detection?.detection?.shouldShow;
    const reason = detection?.detection?.reason;

    if (enabled || detected) {
      setStatus(enabled ? 'Enabled here' : 'Paywall signal', 'is-paywall');
      detectionNote.textContent = enabled
        ? 'This site is on your always-show list.'
        : `View found a likely paywall signal (${reason || 'detected'}).`;
    } else {
      setStatus('Ready', 'is-ready');
      detectionNote.textContent = 'No strong paywall signal was detected. You can still open the page with View.';
    }
  }

  function populateTab() {
    const url = currentTab?.url || '';
    urlBox.textContent = url || 'No page URL available';
    titleBox.textContent = currentTab?.title || (url ? new URL(url).hostname : 'No page selected');
  }

  async function openWith(action) {
    if (!currentTab?.url || !isValidHttpUrl(currentTab.url)) return;

    const button = action === 'openWithoutPaywall' ? openBtn : readerBtn;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Opening…';

    try {
      // Firefox for Android is most reliable when navigation is initiated
      // directly from the popup. Unlike older builds, we also honor the
      // user's Open in new tab preference on Android.
      if (isAndroid) {
        const destination = destinationFor(action, currentTab.url);
        if (!destination) throw new Error('Only HTTP(S) pages can be opened.');

        const openNew = settings.openInNewTab === true;
        if (openNew) {
          try {
            await api.tabs.create({ url: destination });
          } catch (tabError) {
            // Last-resort browser navigation if tabs.create is unavailable.
            const opened = window.open(destination, '_blank');
            if (!opened) throw tabError;
          }
        } else {
          await api.tabs.update(currentTab.id, { url: destination });
        }
        window.close();
        return;
      }

      const response = await api.runtime.sendMessage({
        action,
        url: currentTab.url,
        tabId: currentTab.id
      });
      if (!response?.success) throw new Error(response?.error || 'Could not open page');
      window.close();
    } catch (error) {
      button.disabled = false;
      button.textContent = original;
      detectionNote.textContent = error.message || 'Could not open the page.';
      setStatus('Error', 'is-error');
    }
  }

  async function addSite(value) {
    const domain = normalizeDomain(value);
    if (!domain) {
      detectionNote.textContent = 'Enter a valid domain such as example.com.';
      siteInput.focus();
      return;
    }

    if (sites.includes(domain)) {
      detectionNote.textContent = `${domain} is already enabled.`;
      siteInput.select();
      return;
    }

    sites.push(domain);
    await saveSettings({ buttonSites: sites });
    siteInput.value = '';
    siteSearch.value = '';
    renderSites();
    detectionNote.textContent = `${domain} added to the always-show list.`;

    try {
      await api.tabs.sendMessage(currentTab.id, { action: 'refresh' });
    } catch {}
  }

  async function refreshCurrentTabButton() {
    if (!currentTab?.id) return false;

    try {
      const response = await api.tabs.sendMessage(currentTab.id, { action: 'refresh' });
      if (response?.success === true && response?.visible === true) return true;
    } catch {}

    // Reload is the reliable fallback: the newly saved site list is then read
    // during content-script startup, so the floating button is created even when
    // Firefox has not yet accepted a message from the popup.
    try {
      await api.tabs.reload(currentTab.id);
      return true;
    } catch {
      return false;
    }
  }

  async function addCurrentSite() {
    const domain = normalizeDomain(currentTab?.url || '');
    if (!domain) {
      detectionNote.textContent = 'The current page cannot be added. Open a normal HTTP(S) website first.';
      setStatus('Unavailable', 'is-error');
      return;
    }

    if (!sites.some((site) => normalizeDomain(site) === domain)) {
      sites.push(domain);
      await saveSettings({ buttonSites: sites });
      siteInput.value = '';
      siteSearch.value = '';
      renderSites();
      detectionNote.textContent = `${domain} added — the View button will always show on this site.`;
    } else {
      detectionNote.textContent = `${domain} is already enabled — refreshing the page to show View.`;
      refreshCurrentSiteButton();
    }

    // Tell the already-open page to re-check immediately. The content script also
    // listens directly to storage.onChanged, so this is only a fast path.
    let visible = false;
    try {
      const response = await api.tabs.sendMessage(currentTab.id, { action: 'refreshButton' });
      visible = response?.success === true && response?.visible === true;
    } catch {}

    // Only reload when the content script is not present (e.g. an old tab or
    // a page that did not receive the message). This guarantees the button gets
    // injected without requiring the user to revisit the site.
    if (!visible) {
      try { await api.tabs.reload(currentTab.id); } catch {}
    }

    refreshCurrentSiteButton();
    window.close();
  }

  async function removeSite(site) {
    sites = sites.filter((entry) => entry !== site);
    await saveSettings({ buttonSites: sites });
    renderSites();

    try {
      await api.tabs.sendMessage(currentTab.id, { action: 'refresh' });
    } catch {}
  }

  openBtn.addEventListener('click', () => openWith('openWithoutPaywall'));
  readerBtn.addEventListener('click', () => openWith('openReaderMode'));

  copyBtn.addEventListener('click', async () => {
    if (!currentTab?.url) return;
    try {
      await navigator.clipboard.writeText(currentTab.url);
      copyBtn.textContent = 'Copied';
      setTimeout(() => (copyBtn.textContent = 'Copy link'), 900);
    } catch {
      detectionNote.textContent = 'Clipboard access was blocked by the browser.';
    }
  });

  originalBtn.addEventListener('click', async () => {
    if (!currentTab?.id || !currentTab?.url) return;
    try {
      await api.tabs.update(currentTab.id, { url: currentTab.url });
      window.close();
    } catch (error) {
      detectionNote.textContent = error.message || 'Could not open the original page.';
    }
  });

  addSiteBtn.addEventListener('click', () => addSite(siteInput.value));
  addCurrentSiteBtn?.addEventListener('click', addCurrentSite);
  siteInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') addSite(siteInput.value);
  });
  siteSearch.addEventListener('input', renderSites);

  tabToggle.addEventListener('change', async () => {
    await saveSettings({ openInNewTab: tabToggle.checked });
  });

  btnToggle.addEventListener('change', async () => {
    await saveSettings({ showButton: btnToggle.checked });
    try {
      await api.tabs.sendMessage(currentTab.id, { action: 'refresh' });
    } catch {}
  });

  autoToggle.addEventListener('change', async () => {
    await saveSettings({ autoDetect: autoToggle.checked });
    try {
      await api.tabs.sendMessage(currentTab.id, { action: 'refresh' });
    } catch {}
  });

  resetBtn.addEventListener('click', async () => {
    if (!defaultSites.length) return;
    sites = [...defaultSites];
    await saveSettings({ buttonSites: sites });
    renderSites();
    detectionNote.textContent = `Restored ${sites.length} built-in sites.`;
    try {
      await api.tabs.sendMessage(currentTab.id, { action: 'refresh' });
    } catch {}
  });

  try {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    currentTab = tabs?.[0] || null;
    populateTab();
    await load();
    await refreshDetection();
  } catch (error) {
    console.error('[view popup] init failed', error);
    setStatus('Error', 'is-error');
    detectionNote.textContent = 'The popup could not read the current tab.';
    openBtn.disabled = true;
    readerBtn.disabled = true;
    originalBtn.disabled = true;
  }
});
