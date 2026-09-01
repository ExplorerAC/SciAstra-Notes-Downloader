/*
 * SciAstra scanner
 *
 * Does two jobs:
 *  1. Report resources already known to the page.
 *  2. Aggressively but safely scroll likely viewer containers so lazy-loaded
 *     pages are requested.
 *
 * It deliberately does not download page data itself. The service worker
 * captures the actual network resources and the popup downloads them later.
 */
(async function sciAstraScanner() {
  if (window.__SCIASTRA_SCANNER_RUNNING__) return;
  window.__SCIASTRA_SCANNER_RUNNING__ = true;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const sent = new Set();
  let reportedCount = 0;

  const IMAGE_EXT = /\.(?:png|jpe?g|webp|gif|bmp|avif|tiff?|jfif)(?:$|[?#&])/i;
  const PDF_EXT = /\.pdf(?:$|[?#&])/i;
  const RESOURCE_HINT = /(pdf|slide|page|document|note|lecture|image|thumbnail|preview|media|asset|s3|cloudfront|amazonaws)/i;

  function absoluteUrl(value) {
    if (!value) return null;
    try { return new URL(value, location.href).href; } catch { return null; }
  }

  function looksInteresting(url, type = '', contentType = '') {
    if (!url || url.startsWith('data:') || url.startsWith('javascript:')) return false;
    if (url.startsWith('blob:')) return false; // Background cannot fetch a page blob URL.

    const lower = url.toLowerCase();
    const mime = String(contentType).toLowerCase();
    const resourceType = String(type).toLowerCase();

    return PDF_EXT.test(lower) ||
      IMAGE_EXT.test(lower) ||
      mime.includes('application/pdf') ||
      mime.startsWith('image/') ||
      resourceType === 'img' ||
      resourceType === 'image' ||
      RESOURCE_HINT.test(lower);
  }

  function collectDomResources() {
    const out = [];

    document.querySelectorAll('img[src], iframe[src], embed[src], object[data], source[src]').forEach(el => {
      const raw = el.currentSrc || el.src || el.data;
      const url = absoluteUrl(raw);
      if (looksInteresting(url, el.tagName.toLowerCase())) {
        out.push({ url, type: el.tagName.toLowerCase(), source: 'dom' });
      }
    });

    document.querySelectorAll('[style*="url("]').forEach(el => {
      const match = String(el.getAttribute('style')).match(/url\(["']?([^"')]+)["']?\)/i);
      const url = absoluteUrl(match?.[1]);
      if (looksInteresting(url, 'background')) out.push({ url, type: 'image', source: 'dom' });
    });

    return out;
  }

  function collectPerformanceResources() {
    const out = [];
    try {
      performance.getEntriesByType('resource').forEach(entry => {
        const url = absoluteUrl(entry.name);
        if (looksInteresting(url, entry.initiatorType)) {
          out.push({ url, type: entry.initiatorType, source: 'performance' });
        }
      });
    } catch {}
    return out;
  }

  function sendCandidates(candidates) {
    const fresh = [];
    for (const item of candidates) {
      const url = typeof item === 'string' ? item : item?.url;
      if (!url || sent.has(url)) continue;
      sent.add(url);
      fresh.push(item);
    }

    if (!fresh.length) return;
    chrome.runtime.sendMessage({ action: 'RESOURCE_CANDIDATES', urls: fresh }).catch(() => {});
    reportedCount = sent.size;
    chrome.runtime.sendMessage({ action: 'SCAN_PROGRESS', count: reportedCount }).catch(() => {});
  }

  function installFetchAndXhrObservers() {
    // These wrappers only observe URL strings. They do not alter requests or responses.
    try {
      if (!window.__SCIASTRA_FETCH_PATCHED__) {
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
          try {
            const input = args[0];
            const raw = typeof input === 'string' ? input : input?.url;
            const url = absoluteUrl(raw);
            if (looksInteresting(url, 'fetch')) sendCandidates([{ url, type: 'fetch', source: 'fetch' }]);
          } catch {}
          return originalFetch.apply(this, args);
        };
        window.__SCIASTRA_FETCH_PATCHED__ = true;
      }
    } catch {}

    try {
      if (!window.__SCIASTRA_XHR_PATCHED__) {
        const originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
          try {
            const absolute = absoluteUrl(url);
            if (looksInteresting(absolute, 'xmlhttprequest')) {
              sendCandidates([{ url: absolute, type: 'xmlhttprequest', source: 'xhr' }]);
            }
          } catch {}
          return originalOpen.call(this, method, url, ...rest);
        };
        window.__SCIASTRA_XHR_PATCHED__ = true;
      }
    } catch {}
  }

  function getScrollableCandidates() {
    const result = [{ element: window, score: 0 }];
    const nodes = document.querySelectorAll('body *');

    for (const el of nodes) {
      if (!(el instanceof HTMLElement)) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;

      const scrollableY = el.scrollHeight > el.clientHeight + 100;
      if (!scrollableY || el.clientHeight < 180) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width < 250 || rect.height < 150) continue;

      let score = 0;
      const text = `${el.id} ${el.className} ${el.getAttribute('aria-label') || ''}`.toLowerCase();
      if (/(viewer|pdf|document|slide|page|reader|content|note)/.test(text)) score += 100;
      score += Math.min(50, el.clientHeight / 20);
      score += Math.min(100, el.scrollHeight / 1000);
      if (style.overflowY === 'scroll') score += 20;
      if (style.overflowY === 'auto') score += 10;

      result.push({ element: el, score });
    }

    return result.sort((a, b) => b.score - a.score).slice(0, 6);
  }

  async function scrollContainer(element) {
    const isWindow = element === window;
    let stableRounds = 0;
    let lastMax = -1;
    let position = 0;
    const step = Math.max(350, Math.floor((isWindow ? window.innerHeight : element.clientHeight) * 0.75));

    if (isWindow) window.scrollTo({ top: 0, behavior: 'instant' });
    else element.scrollTop = 0;
    await sleep(700);

    for (let i = 0; i < 250; i++) {
      const max = isWindow
        ? Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
        : Math.max(0, element.scrollHeight - element.clientHeight);

      if (max <= 5) break;

      position = Math.min(position + step, max);
      if (isWindow) window.scrollTo({ top: position, behavior: 'instant' });
      else element.scrollTop = position;

      await sleep(450);
      sendCandidates([...collectDomResources(), ...collectPerformanceResources()]);

      const newMax = isWindow
        ? Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
        : Math.max(0, element.scrollHeight - element.clientHeight);

      if (newMax <= lastMax + 2) stableRounds++;
      else stableRounds = 0;
      lastMax = newMax;

      if (position >= newMax - 10) {
        // Give lazy loaders another chance at the bottom.
        await sleep(900);
        const finalMax = isWindow
          ? Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
          : Math.max(0, element.scrollHeight - element.clientHeight);
        if (finalMax <= position + 10) break;
        position = Math.min(position, finalMax);
      }

      if (stableRounds >= 8) break;
    }

    if (isWindow) window.scrollTo({ top: 0, behavior: 'instant' });
    else element.scrollTop = 0;
  }

  try {
    chrome.runtime.sendMessage({ action: 'SCAN_START' }).catch(() => {});
    installFetchAndXhrObservers();
    sendCandidates([...collectDomResources(), ...collectPerformanceResources()]);

    const candidates = getScrollableCandidates();
    // Scroll the strongest candidates. This is more reliable than selecting
    // whichever <div> happens to be last in the DOM.
    for (const { element } of candidates.slice(0, 4)) {
      await scrollContainer(element);
    }

    // One final collection catches resources requested immediately after the
    // final lazy-load tick.
    await sleep(1000);
    sendCandidates([...collectDomResources(), ...collectPerformanceResources()]);

    chrome.runtime.sendMessage({ action: 'SCAN_COMPLETE', count: reportedCount }).catch(() => {});
  } finally {
    window.__SCIASTRA_SCANNER_RUNNING__ = false;
  }
})();
