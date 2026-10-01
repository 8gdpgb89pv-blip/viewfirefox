(() => {
  const api = typeof browser !== 'undefined' ? browser : chrome;
  const isAndroid = /Android/i.test(navigator.userAgent);
  const SERVICE_URL = 'https://www.removepaywall.com/search?url=';
  const $ = (id) => document.getElementById(id);
  const reader = $('reader');
  const state = $('state');
  const originalBtn = $('open-original');
  const viewBtn = $('open-view');
  const listenBtn = $('listen-toggle');
  const stopBtn = $('listen-stop');
  const speedSelect = $('listen-speed');
  const listenStatus = $('listen-status');

  const params = new URLSearchParams(location.search);
  const sourceUrl = params.get('url');

  const tts = 'speechSynthesis' in window ? window.speechSynthesis : null;
  let availableVoices = [];
  let speechItems = [];
  let speechIndex = -1;
  let speaking = false;
  let paused = false;
  let generation = 0;
  let androidTTSWarmed = false;
  let androidWarmupPromise = null;

  const absUrl = (value, base) => {
    try { return new URL(value, base).href; } catch { return value; }
  };

  const POSITIVE_ARTICLE_HINTS = /(?:^|[-_ ])(?:article|story|entry|post|content|body|text|copy|main)(?:$|[-_ ])/i;
  const NEGATIVE_ARTICLE_HINTS = /(?:^|[-_ ])(?:nav|menu|header|footer|aside|sidebar|comment|comments|related|recommend|newsletter|subscribe|subscription|social|share|sharing|breadcrumb|cookie|consent|privacy|impressum|legal|disclaimer|advert|advertisement|ad-|ad_|promo|sponsor|outbrain|taboola|author-bio|more-from|read-next)(?:$|[-_ ])/i;
  const SOCIAL_HOSTS = /(?:^|\.)(?:facebook|instagram|twitter|x|linkedin|reddit|pinterest|tiktok|youtube)\.(?:com|co\.uk|de|fr|it|es|net)$/i;
  const UTILITY_TEXT = /^(?:impressum|privacy(?: policy)?|datenschutz(?:erklärung)?|terms(?: of service)?|agb|cookie(?:s)?|cookie preferences|copyright|about us|kontakt|contact|advertise|media kit|follow us|share|teilen|newsletter|sign in|login|log in|subscribe|abonnieren)$/i;
  const SOCIAL_TEXT = /^(?:facebook|instagram|twitter|x|linkedin|reddit|pinterest|tiktok|youtube|mastodon|bluesky|whatsapp)$/i;
  const RELATED_HEADING = /^(?:related|related articles|you may also like|recommended|recommended for you|more stories|more from|read next|weiterlesen|mehr zum thema|auch interessant|das könnte sie auch interessieren|empfohlen|mehr von|ähnliche artikel)$/i;

  const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const elementText = (el) => normalizeText(el?.innerText || el?.textContent || '');
  const linkDensity = (el) => {
    const text = elementText(el);
    if (!text) return 1;
    const links = [...el.querySelectorAll('a')].reduce((sum, a) => sum + elementText(a).length, 0);
    return Math.min(1, links / text.length);
  };
  const paragraphCount = (el) => el.querySelectorAll('p').length;
  const semanticBonus = (el) => {
    const tag = el.tagName?.toLowerCase() || '';
    const label = `${el.id || ''} ${el.className || ''} ${el.getAttribute?.('itemprop') || ''}`;
    let score = 0;
    if (tag === 'article') score += 1200;
    if (tag === 'main') score += 350;
    if (/articlebody|article-body/i.test(label)) score += 1100;
    if (/article|story|entry|post|body|content|copy/i.test(label)) score += 450;
    if (/author|byline/i.test(label)) score += 50;
    if (NEGATIVE_ARTICLE_HINTS.test(label)) score -= 850;
    return score;
  };

  const scoreCandidate = (el) => {
    if (!el || !elementText(el)) return -Infinity;
    const text = elementText(el);
    if (text.length < 250) return -Infinity;
    const paragraphs = paragraphCount(el);
    const density = linkDensity(el);
    const punctuation = (text.match(/[.!?。！？]/g) || []).length;
    const longParagraphs = [...el.querySelectorAll('p')].filter((p) => elementText(p).length >= 80).length;
    const headings = el.querySelectorAll('h2,h3,h4').length;

    // Readability-like heuristic: reward long prose and semantic article containers,
    // heavily penalize navigation/link-heavy chrome.
    let score = Math.min(text.length, 30000) * 0.9;
    score += Math.min(paragraphs, 40) * 220;
    score += Math.min(longParagraphs, 25) * 320;
    score += Math.min(punctuation, 150) * 8;
    score += Math.min(headings, 12) * 50;
    score += semanticBonus(el);
    score -= density * Math.min(text.length, 16000) * 0.9;
    score -= NEGATIVE_ARTICLE_HINTS.test(`${el.id || ''} ${el.className || ''}`) ? 1800 : 0;
    return score;
  };

  const collectArticleCandidates = (doc) => {
    const selectors = [
      'article',
      '[itemprop="articleBody"]',
      '[itemtype*="Article"]',
      '[data-testid*="article-body" i]',
      '[data-testid*="story-body" i]',
      '[data-testid*="article-content" i]',
      '[class*="article-body" i]',
      '[class*="article__body" i]',
      '[class*="article-content" i]',
      '[class*="article-content__" i]',
      '[class*="story-body" i]',
      '[class*="story-content" i]',
      '[class*="entry-content" i]',
      '[class*="post-content" i]',
      '[class*="articleText" i]',
      '[class*="article-text" i]',
      'main',
      '[role="main"]',
      '#main',
      '.main'
    ];

    const seen = new Set();
    const candidates = [];
    const add = (el) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      candidates.push(el);
    };

    doc.querySelectorAll(selectors.join(',')).forEach(add);

    // Also build candidate ancestors from substantial paragraphs. This helps pages
    // that use anonymous containers instead of useful semantic class names.
    const paragraphs = [...doc.querySelectorAll('p')]
      .filter((p) => elementText(p).length >= 80)
      .slice(0, 180);
    for (const p of paragraphs) {
      let node = p.parentElement;
      for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
        if (node === doc.body || node === doc.documentElement) break;
        if (elementText(node).length >= 500) add(node);
      }
    }
    return candidates;
  };

  const isUtilityBlock = (el) => {
    const text = elementText(el);
    if (!text || text.length > 500) return false;
    if (UTILITY_TEXT.test(text)) return true;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= 7 && /(?:impressum|datenschutz|privacy|agb|terms|contact|kontakt|cookie|newsletter|subscribe|abonnieren|share|teilen)/i.test(text)) return true;
    return false;
  };

  const isSocialAnchor = (a) => {
    const text = elementText(a);
    const href = a.getAttribute('href') || '';
    try {
      const host = new URL(href, sourceUrl).hostname;
      if (SOCIAL_HOSTS.test(host)) return true;
    } catch (_) {}
    return SOCIAL_TEXT.test(text);
  };

  const shouldDropNode = (el) => {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    if (['script','style','noscript','template','iframe','object','embed','form','nav','header','footer','aside','dialog','svg','canvas'].includes(tag)) return true;
    if (el.matches?.('[role="navigation"],[role="banner"],[role="contentinfo"],[aria-modal="true"],[data-ad-slot],[data-ad-client]')) return true;
    const label = `${el.id || ''} ${typeof el.className === 'string' ? el.className : ''} ${el.getAttribute?.('aria-label') || ''}`;
    if (NEGATIVE_ARTICLE_HINTS.test(label)) return true;
    if (isUtilityBlock(el)) return true;
    return false;
  };

  const cleanClone = (root, baseUrl) => {
    const dropSelectors = [
      'script','style','noscript','template','iframe','object','embed','form',
      'nav','header','footer','aside','dialog','menu',
      '[role="navigation"]','[role="banner"]','[role="contentinfo"]',
      '[aria-modal="true"]','[data-ad-slot]','[data-ad-client]',
      '[class*="advertisement" i]','[id*="advertisement" i]','[class*="paywall" i]','[id*="paywall" i]',
      '[class*="newsletter" i]','[id*="newsletter" i]','[class*="social-share" i]','[class*="share-tools" i]',
      '[class*="related" i]','[id*="related" i]','[class*="recommended" i]','[id*="recommended" i]',
      '[class*="comment" i]','[id*="comment" i]','[class*="breadcrumb" i]','[class*="cookie" i]',
      '[class*="impressum" i]','[id*="impressum" i]','[class*="datenschutz" i]','[id*="datenschutz" i]',
      '[class*="author-bio" i]','[class*="author-info" i]','[class*="author-name" i]','[class*="byline" i]','[data-testid*="byline" i]','[rel="author"]','[itemprop="author"]',
      '[class*="more-from" i]','[class*="read-next" i]','[class*="promo" i]',
      '[class*="outbrain" i]','[class*="taboola" i]','[data-trb-region]'
    ];
    try { root.querySelectorAll(dropSelectors.join(',')).forEach((el) => el.remove()); } catch (_) {}

    // Remove obvious utility/social blocks even when their class names are generic.
    root.querySelectorAll('*').forEach((el) => {
      if (el === root) return;
      if (shouldDropNode(el)) {
        el.remove();
        return;
      }

      const text = elementText(el);
      const tag = el.tagName.toLowerCase();
      if (tag === 'a' && isSocialAnchor(el)) {
        const parent = el.parentElement;
        if (parent && (parent.querySelectorAll('a').length >= 2 || !parent.closest('p,blockquote,li') || elementText(parent) === text)) {
          el.remove();
          return;
        }
      }

      // Kill compact clusters of unrelated links (footer, share row, utility chrome)
      // while leaving ordinary links inside prose paragraphs intact.
      if (!el.closest('p,blockquote,li,figcaption') && text.length <= 900) {
        const links = el.querySelectorAll('a').length;
        if (links >= 3 && linkDensity(el) > 0.55) {
          el.remove();
          return;
        }
      }

      if ((tag === 'h2' || tag === 'h3' || tag === 'h4') && RELATED_HEADING.test(text)) {
        const parent = el.closest('section,div,aside') || el;
        if (elementText(parent).length < 2500) parent.remove();
      }
    });

    // A second pass catches utility blocks that become small only after social/share
    // elements have been removed.
    root.querySelectorAll('section,div,ul,ol,p').forEach((el) => {
      if (el === root) return;
      const text = elementText(el);
      if (!text || text.length < 2) {
        if (!el.querySelector('img,video,audio')) el.remove();
        return;
      }
      if (isUtilityBlock(el) && !el.closest('p,blockquote,li')) el.remove();
    });

    root.querySelectorAll('*').forEach((el) => {
      [...el.attributes].forEach((attr) => {
        if (/^on/i.test(attr.name) || ['style','srcset','integrity','nonce'].includes(attr.name)) el.removeAttribute(attr.name);
      });
      if (el.tagName === 'A') {
        const href = el.getAttribute('href');
        if (href) el.setAttribute('href', absUrl(href, baseUrl));
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
      if (el.tagName === 'IMG') {
        const src = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || el.getAttribute('data-original');
        if (src) el.setAttribute('src', absUrl(src, baseUrl));
        el.removeAttribute('loading');
        el.removeAttribute('decoding');
      }
    });

    return root;
  };

  const chooseArticle = (doc) => {
    const candidates = collectArticleCandidates(doc);
    const scored = candidates
      .map((el) => ({ el, score: scoreCandidate(el) }))
      .filter((entry) => Number.isFinite(entry.score))
      .sort((a, b) => b.score - a.score);

    // Prefer the best semantic candidate unless a much larger prose candidate
    // clearly contains more article text and less link-heavy chrome.
    if (scored.length) {
      const top = scored[0];
      const semantic = scored.find((entry) => /article|articleBody/i.test(`${entry.el.tagName} ${entry.el.id} ${entry.el.className} ${entry.el.getAttribute?.('itemprop') || ''}`));
      if (semantic && semantic.score >= top.score - 900) return semantic.el;
      return top.el;
    }
    return doc.body;
  };


  const extractJsonLdArticleBody = (doc) => {
    const bodies = [];
    const visit = (value) => {
      if (!value) return;
      if (Array.isArray(value)) { value.forEach(visit); return; }
      if (typeof value !== 'object') return;
      if (typeof value.articleBody === 'string' && value.articleBody.trim().length >= 700) {
        bodies.push(normalizeText(value.articleBody));
      }
      if (value['@graph']) visit(value['@graph']);
      for (const [key, child] of Object.entries(value)) {
        if (key !== 'articleBody' && (typeof child === 'object')) visit(child);
      }
    };

    doc.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      const raw = script.textContent?.trim();
      if (!raw) return;
      try { visit(JSON.parse(raw)); } catch (_) {
        // Some publishers concatenate multiple JSON objects. Try a conservative
        // substring extraction rather than failing Reader View completely.
        const match = raw.match(/"articleBody"\s*:\s*"((?:\\.|[^"\\])*)"/i);
        if (match) {
          try {
            const parsed = JSON.parse(`"${match[1]}"`);
            if (parsed.length >= 700) bodies.push(normalizeText(parsed));
          } catch (_) {}
        }
      }
    });
    return bodies.sort((a, b) => b.length - a.length)[0] || '';
  };

  const buildJsonLdFallback = (text) => {
    const container = document.createElement('div');
    const sentences = text.split(/(?<=[.!?。！？])\s+/);
    let paragraph = '';
    let count = 0;
    const flush = () => {
      const value = normalizeText(paragraph);
      if (!value) return;
      const p = document.createElement('p');
      p.textContent = value;
      container.appendChild(p);
      count += 1;
      paragraph = '';
    };
    for (const sentence of sentences) {
      paragraph += (paragraph ? ' ' : '') + sentence;
      if (paragraph.length >= 420) flush();
    }
    flush();
    return count >= 3 ? container : null;
  };

  const extractArticle = (doc) => {
    const candidate = chooseArticle(doc);
    const clone = cleanClone(candidate.cloneNode(true), sourceUrl);
    const cloneText = elementText(clone);
    const usableParagraphs = [...clone.querySelectorAll('p')].filter((p) => elementText(p).length >= 40).length;
    if (cloneText.length >= 500 && usableParagraphs >= 3) return clone;

    const jsonLdText = extractJsonLdArticleBody(doc);
    if (jsonLdText) {
      const fallback = buildJsonLdFallback(jsonLdText);
      if (fallback) return fallback;
    }

    return clone;
  };

  const getTitle = (doc) => doc.querySelector('meta[property="og:title"]')?.content || doc.querySelector('h1')?.textContent?.trim() || doc.title || new URL(sourceUrl).hostname;
  const getByline = (doc, scope = doc) => scope.querySelector('[rel="author"], [itemprop="author"], [class*="byline" i],[data-testid*="byline" i],[class*="author-name" i]')?.textContent?.replace(/\s+/g,' ').trim() || doc.querySelector('[rel="author"], [itemprop="author"], [class*="byline" i],[data-testid*="byline" i],[class*="author-name" i]')?.textContent?.replace(/\s+/g,' ').trim() || '';

  async function fetchDocument(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      try {
        const response = await fetch(url, {
          credentials: 'omit',
          redirect: 'follow',
          cache: 'no-store',
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`The page returned HTTP ${response.status}.`);
        const type = response.headers.get('content-type') || '';
        if (!/text\/html/i.test(type)) throw new Error('The source is not an HTML article.');
        return new DOMParser().parseFromString(await response.text(), 'text/html');
      } catch (directError) {
        // Android/Firefox fallback: perform the cross-origin fetch from the
        // privileged background extension context, then parse it locally.
        const result = await api.runtime.sendMessage({ action: 'fetchReaderSource', url });
        if (!result?.success || typeof result.html !== 'string') {
          throw directError;
        }
        return new DOMParser().parseFromString(result.html, 'text/html');
      }
    } finally {
      clearTimeout(timer);
    }
  }

  function refreshVoices() {
    if (!tts) return [];
    try {
      availableVoices = tts.getVoices() || [];
    } catch (_) {
      availableVoices = [];
    }
    return availableVoices;
  }

  function waitForVoices(timeoutMs = 1600) {
    if (!tts) return Promise.resolve([]);
    const initial = refreshVoices();
    if (initial.length) return Promise.resolve(initial);

    return new Promise((resolve) => {
      let settled = false;
      let poll = null;
      let timer = null;

      const finish = () => {
        if (settled) return;
        settled = true;
        if (poll) clearInterval(poll);
        if (timer) clearTimeout(timer);
        try {
          if (tts.onvoiceschanged === onVoicesChanged) tts.onvoiceschanged = null;
        } catch (_) {}
        resolve(refreshVoices());
      };

      const onVoicesChanged = () => {
        if (refreshVoices().length) finish();
      };

      try { tts.onvoiceschanged = onVoicesChanged; } catch (_) {}
      poll = setInterval(() => {
        if (refreshVoices().length) finish();
      }, 120);
      timer = setTimeout(finish, timeoutMs);
    });
  }

  function getAndroidVoiceLanguage(pageLang) {
    const requested = String(pageLang || '').toLowerCase();
    const legacy = String(legacyAndroidLang(pageLang)).toLowerCase();
    const root = requested.split('-')[0];
    const legacyRoot = legacy.split('-')[0];
    const voice = availableVoices.find(v => {
      const lang = String(v.lang || '').toLowerCase();
      return lang === requested || lang === legacy || lang.split('-')[0] === root || lang.split('-')[0] === legacyRoot;
    });
    return voice?.lang || '';
  }

  function warmUpAndroidTTS() {
    if (!isAndroid || !tts || androidTTSWarmed) return Promise.resolve();
    if (androidWarmupPromise) return androidWarmupPromise;

    androidWarmupPromise = new Promise((resolve) => {
      let settled = false;
      let fallbackTimer = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (fallbackTimer) clearTimeout(fallbackTimer);
        androidTTSWarmed = true;
        refreshVoices();
        resolve();
      };

      try { tts.cancel(); } catch (_) {}

      // Firefox Android can expose SpeechSynthesis before its native TTS
      // bridge/voice list is ready. A zero-audio utterance created directly
      // from the user's tap warms that bridge without speaking article text.
      const warmup = new SpeechSynthesisUtterance('');
      warmup.volume = 0;
      warmup.rate = 1;
      warmup.pitch = 1;
      warmup.onend = finish;
      warmup.onerror = finish;
      fallbackTimer = setTimeout(finish, 900);

      try {
        tts.speak(warmup);
      } catch (_) {
        finish();
      }
    }).finally(() => {
      androidWarmupPromise = null;
    });

    return androidWarmupPromise;
  }

  const legacyAndroidLang = (lang) => {
    const value = String(lang || '').toLowerCase();
    const aliases = {
      he: 'iw',
      'he-il': 'iw-il',
      id: 'in',
      'id-id': 'in-id',
      yi: 'ji',
      'yi-il': 'ji-il'
    };
    return aliases[value] || lang || '';
  };

  const getPageLanguage = () => {
    const raw = document.documentElement.lang || navigator.language || 'en-US';
    return String(raw).trim() || 'en-US';
  };

  const getBestVoice = (pageLang) => {
    if (!availableVoices.length) return null;
    const requested = String(pageLang || '').toLowerCase();
    const legacy = String(legacyAndroidLang(pageLang)).toLowerCase();
    const root = requested.split('-')[0];
    const legacyRoot = legacy.split('-')[0];

    return availableVoices.find((voice) => String(voice.lang || '').toLowerCase() === requested) ||
      availableVoices.find((voice) => String(voice.lang || '').toLowerCase() === legacy) ||
      availableVoices.find((voice) => String(voice.lang || '').toLowerCase().split('-')[0] === root) ||
      availableVoices.find((voice) => String(voice.lang || '').toLowerCase().split('-')[0] === legacyRoot) ||
      availableVoices.find((voice) => voice.default) ||
      availableVoices[0] || null;
  };

  function setListenAvailable(available) {
    const controls = [$('listen-controls'), listenBtn, stopBtn, speedSelect];
    controls.forEach(el => { if (el) el.hidden = !available; });
    if (!available && tts) listenStatus.textContent = 'No article text available.';
    if (!tts) {
      if (listenBtn) { listenBtn.hidden = false; listenBtn.disabled = true; }
      if (stopBtn) stopBtn.hidden = true;
      if (speedSelect) speedSelect.hidden = true;
      if (listenStatus) listenStatus.textContent = 'Text-to-speech is not available in this browser.';
    }
  }

  function chunkSpeechText(text, maxLength = 900) {
    const normalized = normalizeText(text);
    if (!normalized) return [];
    if (normalized.length <= maxLength) return [normalized];

    const sentences = normalized.match(/[^.!?。！？]+(?:[.!?。！？]+|$)/g) || [normalized];
    const chunks = [];
    let chunk = '';

    const pushChunk = () => {
      const value = normalizeText(chunk);
      if (value) chunks.push(value);
      chunk = '';
    };

    for (const sentence of sentences) {
      const value = normalizeText(sentence);
      if (!value) continue;
      if (!chunk) {
        if (value.length <= maxLength) {
          chunk = value;
        } else {
          for (let i = 0; i < value.length; i += maxLength) {
            chunks.push(value.slice(i, i + maxLength).trim());
          }
        }
      } else if ((chunk.length + value.length + 1) <= maxLength) {
        chunk += ` ${value}`;
      } else {
        pushChunk();
        if (value.length <= maxLength) chunk = value;
        else {
          for (let i = 0; i < value.length; i += maxLength) {
            const piece = value.slice(i, i + maxLength).trim();
            if (piece) chunks.push(piece);
          }
        }
      }
    }
    pushChunk();
    return chunks.length ? chunks : [normalized];
  }

  function collectSpeechItems() {
    const candidates = [...document.querySelectorAll('.article-body p, .article-body h2, .article-body h3, .article-body h4, .article-body blockquote, .article-body li')];
    const items = [];
    for (const el of candidates) {
      if (el.closest('.tts-skip')) continue;
      if (el.parentElement?.closest('p, li, blockquote')) continue;
      const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length < 2) continue;
      for (const chunk of chunkSpeechText(text)) {
        if (chunk.length >= 2) items.push({ el, text: chunk });
      }
    }
    return items;
  }

  function clearHighlight() {
    speechItems.forEach(item => item.el.classList.remove('tts-current'));
  }

  function updateListenStatus(text) {
    if (listenStatus) listenStatus.textContent = text;
  }

  function stopSpeaking() {
    generation += 1;
    if (tts) {
      try { tts.cancel(); } catch (_) {}
    }
    clearHighlight();
    speechIndex = -1;
    speaking = false;
    paused = false;
    listenBtn?.classList.remove('is-playing', 'is-paused');
    if (listenBtn) listenBtn.textContent = '▶ Listen to article';
    if (stopBtn) stopBtn.disabled = true;
    updateListenStatus('');
  }

  function buildUtterance(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    const pageLang = getPageLanguage();
    const voice = getBestVoice(pageLang);

    if (isAndroid) {
      // On Firefox Android, letting the native engine choose the voice is more
      // reliable on first use than attaching a voice object from an asynchronously
      // populated list. Only provide a language when we know the device has a
      // voice for it; otherwise leave both voice and lang to the platform default.
      const supportedLang = getAndroidVoiceLanguage(pageLang);
      if (supportedLang) utterance.lang = supportedLang;
      else utterance.lang = legacyAndroidLang(pageLang);
    } else if (voice?.lang) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = pageLang;
    }

    utterance.rate = Number(speedSelect?.value || 1);
    utterance.pitch = 1;
    utterance.volume = 1;
    return utterance;
  }

  function speakAt(index, token, retry = 0) {
    if (!tts || token !== generation) return;
    if (index >= speechItems.length) {
      const finishedToken = token;
      stopSpeaking();
      if (finishedToken === generation - 1 || speechItems.length) updateListenStatus('Finished');
      return;
    }

    clearHighlight();
    speechIndex = index;
    const item = speechItems[index];
    item.el.classList.add('tts-current');
    try { item.el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}

    // Do not await voice loading here. On mobile browsers, delaying speak()
    // after the tap can lose the interaction context. A cached/default voice
    // is perfectly valid and voice discovery continues independently.
    refreshVoices();
    const utterance = buildUtterance(item.text);
    let started = false;
    let watchdog = null;

    const clearWatchdog = () => {
      if (watchdog) {
        clearTimeout(watchdog);
        watchdog = null;
      }
    };

    utterance.onstart = () => {
      started = true;
      clearWatchdog();
      if (token !== generation) return;
      speaking = true;
      paused = false;
      listenBtn?.classList.add('is-playing');
      listenBtn?.classList.remove('is-paused');
      if (listenBtn) listenBtn.textContent = '⏸ Pause';
      if (stopBtn) stopBtn.disabled = false;
      updateListenStatus(`Part ${index + 1} of ${speechItems.length}`);
    };

    utterance.onend = () => {
      clearWatchdog();
      if (token !== generation) return;
      speakAt(index + 1, token);
    };

    utterance.onerror = (event) => {
      clearWatchdog();
      if (token !== generation || event.error === 'canceled' || event.error === 'interrupted') return;

      // Android can transiently report audio-busy/language/synthesis errors
      // while the native TTS engine is waking. Retry once with a freshly built
      // utterance and, if necessary, without forcing a voice selection.
      if (retry < 1) {
        try { tts.cancel(); } catch (_) {}
        refreshVoices();
        setTimeout(() => speakAt(index, token, retry + 1), 80);
        return;
      }

      speaking = false;
      paused = false;
      listenBtn?.classList.remove('is-playing', 'is-paused');
      if (listenBtn) listenBtn.textContent = '▶ Listen to article';
      if (stopBtn) stopBtn.disabled = true;
      updateListenStatus(`Could not speak this part: ${event.error || 'speech error'}`);
    };

    // Some mobile implementations return from speak() before their engine is
    // ready. If no onstart arrives, restart once instead of leaving the button
    // looking active while nothing is playing.
    watchdog = setTimeout(() => {
      watchdog = null;
      if (token !== generation || started) return;
      if (retry < 1) {
        try { tts.cancel(); } catch (_) {}
        setTimeout(() => speakAt(index, token, retry + 1), 80);
      }
    }, 1800);

    try {
      // Clear any stale native queue before starting the first fresh utterance.
      // resume() is harmless when not paused and helps some Android TTS engines
      // leave a previously paused state.
      // Resume only an existing paused session. On Android, calling resume()
      // immediately before the first utterance can leave some native engines in
      // a stale state, so the explicit warm-up above handles first-use startup.
      if (speaking && paused) {
        try { tts.resume(); } catch (_) {}
      }
      tts.speak(utterance);
    } catch (error) {
      clearWatchdog();
      if (retry < 1) {
        setTimeout(() => speakAt(index, token, retry + 1), 80);
      } else {
        speaking = false;
        if (listenBtn) listenBtn.textContent = '▶ Listen to article';
        if (stopBtn) stopBtn.disabled = true;
        updateListenStatus(`Could not start speech: ${error.message || error}`);
      }
    }
  }

  function toggleSpeaking() {
    if (!tts || !speechItems.length) return;
    if (speaking && !paused) {
      try { tts.pause(); } catch (_) {}
      paused = true;
      listenBtn?.classList.remove('is-playing');
      listenBtn?.classList.add('is-paused');
      if (listenBtn) listenBtn.textContent = '▶ Resume';
      updateListenStatus(`Paused at ${Math.max(1, speechIndex + 1)} of ${speechItems.length}`);
      return;
    }
    if (speaking && paused) {
      try { tts.resume(); } catch (_) {}
      paused = false;
      listenBtn?.classList.add('is-playing');
      listenBtn?.classList.remove('is-paused');
      if (listenBtn) listenBtn.textContent = '⏸ Pause';
      return;
    }

    generation += 1;
    try { tts.cancel(); } catch (_) {}
    speechItems = collectSpeechItems();
    if (!speechItems.length) {
      updateListenStatus('No readable article text found.');
      return;
    }
    if (stopBtn) stopBtn.disabled = false;

    if (isAndroid && !androidTTSWarmed) {
      updateListenStatus('Preparing voice…');
      const token = generation;
      warmUpAndroidTTS().then(() => {
        if (token !== generation) return;
        // Re-read the voice list after warm-up; Firefox Android often exposes
        // built-in voices only after the first synthesis request.
        refreshVoices();
        speakAt(0, token);
      });
      return;
    }

    speakAt(0, generation);
  }

  function changeSpeed() {
    if (!tts || !speaking) return;
    const index = Math.max(0, speechIndex);
    generation += 1;
    try { tts.cancel(); } catch (_) {}
    if (!paused) speakAt(index, generation);
  }

  function render(doc) {
    const candidate = chooseArticle(doc);
    const clone = extractArticle(doc);
    const textLength = elementText(clone).length;
    const paragraphText = [...clone.querySelectorAll('p')].map(elementText).filter((t) => t.length >= 40);
    if (textLength < 500 || paragraphText.length < 3) throw new Error('Reader View could not extract enough article text from this page.');

    const title = normalizeText(getTitle(doc));
    document.title = `${title} — view Reader`;

    const header = document.createElement('header');
    header.className = 'article-header';
    const h1 = document.createElement('h1');
    h1.textContent = title;
    header.appendChild(h1);
    const byline = normalizeText(getByline(doc, candidate));
    if (byline && byline.length < 180) {
      const meta = document.createElement('div');
      meta.className = 'byline';
      meta.textContent = byline;
      header.appendChild(meta);
    }

    const body = document.createElement('article');
    body.className = 'article-body';
    body.appendChild(clone);
    reader.replaceChildren(header, body);

    speechItems = collectSpeechItems();
    setListenAvailable(speechItems.length > 0);
    updateListenStatus(speechItems.length ? `${speechItems.length} readable sections` : '');
  }

  async function openService() {
    const destination = SERVICE_URL + encodeURIComponent(sourceUrl);

    // On Firefox for Android, leave the extension reader by navigating the
    // current tab directly. This avoids relying on a background-page tab
    // creation while the extension page is in the foreground.
    if (isAndroid) {
      location.assign(destination);
      return;
    }

    const response = await api.runtime.sendMessage({ action: 'openWithoutPaywall', url: sourceUrl, tabId: null });
    if (!response?.success) throw new Error(response?.error || 'Could not open View.');
  }

  originalBtn.addEventListener('click', () => { stopSpeaking(); location.href = sourceUrl; });
  viewBtn.addEventListener('click', async () => {
    viewBtn.disabled = true;
    const old = viewBtn.textContent;
    viewBtn.textContent = 'Opening…';
    try { await openService(); } catch (e) { viewBtn.disabled = false; viewBtn.textContent = old; state.textContent = e.message; }
  });
  listenBtn?.addEventListener('click', toggleSpeaking);
  stopBtn?.addEventListener('click', stopSpeaking);
  speedSelect?.addEventListener('change', changeSpeed);
  window.addEventListener('pagehide', stopSpeaking);

  refreshVoices();
  if (tts) {
    try { tts.onvoiceschanged = refreshVoices; } catch (_) {}
    if (isAndroid) {
      // Android voice lists can appear after the reader has already loaded.
      // Poll briefly so the first tap can use a language-matched voice.
      let voicePolls = 0;
      const voicePoll = setInterval(() => {
        refreshVoices();
        voicePolls += 1;
        if (availableVoices.length || voicePolls >= 15) clearInterval(voicePoll);
      }, 150);
    } else if (typeof tts.addEventListener === 'function') {
      tts.addEventListener('voiceschanged', refreshVoices);
    }
  }

  if (!tts) setListenAvailable(false);

  (async () => {
    try {
      if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) throw new Error('Invalid source URL.');
      const doc = await fetchDocument(sourceUrl);
      render(doc);
    } catch (error) {
      setListenAvailable(false);
      reader.replaceChildren(Object.assign(document.createElement('div'), { className:'state', textContent: `${error.message} You can open the original page or use View.` }));
    }
  })();
})();
