/*
 * SciAstra Notes Downloader - network capture engine
 *
 * The original version relied almost entirely on file extensions in URLs.
 * Modern viewers frequently use opaque/signed URLs, so this version also
 * inspects response Content-Type headers and accepts resource candidates
 * reported by the content script.
 */

const STORAGE_PREFIX = 'urls_';
const META_PREFIX = 'meta_';
const SCAN_PREFIX = 'scan_';
const MAX_ITEMS = 5000;

const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/x-pdf',
  'application/octet-stream',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
  'image/tiff'
]);

const IMAGE_EXTENSIONS = /\.(?:png|jpe?g|webp|gif|bmp|avif|tiff?|jfif)(?:$|[?#&])/i;
const PDF_EXTENSION = /\.pdf(?:$|[?#&])/i;
const AWS_HOST = /(?:amazonaws\.com|cloudfront\.net)$/i;
const RESOURCE_HINT = /(?:pdf|slide|page|document|note|lecture|image|thumbnail|preview|media|asset)/i;
const SCIASTRA_HOST = /(?:^|\.)app\.sciastra\.com$/i;

function storageKey(tabId) {
  return `${STORAGE_PREFIX}${tabId}`;
}

function metaKey(tabId) {
  return `${META_PREFIX}${tabId}`;
}

function scanKey(tabId) {
  return `${SCAN_PREFIX}${tabId}`;
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    // Strip common cache-busting fragments, but retain signed query strings.
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

function getContentType(responseHeaders = []) {
  const header = responseHeaders.find(
    h => h.name && h.name.toLowerCase() === 'content-type'
  );
  return header?.value?.split(';')[0].trim().toLowerCase() || '';
}

function getFilename(responseHeaders = []) {
  const header = responseHeaders.find(
    h => h.name && h.name.toLowerCase() === 'content-disposition'
  );
  const value = header?.value || '';
  const utf8 = value.match(/filename\*=UTF-8''([^;]+)/i);
  const plain = value.match(/filename=[\"']?([^;\"']+)/i);
  const raw = utf8?.[1] || plain?.[1] || '';
  if (!raw) return '';
  try { return decodeURIComponent(raw.trim()); } catch { return raw.trim(); }
}

function isLikelyDocumentUrl(url, type = '', contentType = '') {
  if (!url || url.startsWith('data:')) return false;

  const lowerUrl = url.toLowerCase();
  const host = (() => {
    try { return new URL(url).hostname; } catch { return ''; }
  })();

  const mime = contentType.toLowerCase();
  const octetStreamLooksLikeDocument = mime === 'application/octet-stream' &&
    (PDF_EXTENSION.test(lowerUrl) || IMAGE_EXTENSIONS.test(lowerUrl) ||
      RESOURCE_HINT.test(lowerUrl) || AWS_HOST.test(host));

  const byMime = (mime.startsWith('image/') || mime === 'application/pdf' ||
    mime === 'application/x-pdf' || DOCUMENT_MIME_TYPES.has(mime)) &&
    mime !== 'application/octet-stream' || octetStreamLooksLikeDocument;

  const byExtension = PDF_EXTENSION.test(lowerUrl) || IMAGE_EXTENSIONS.test(lowerUrl);
  const byNetworkType = type === 'image' || type === 'media';

  // Opaque/signed AWS URLs often have no extension and may be reported as
  // XHR/fetch. Only accept them when they also look like a resource request.
  const awsFetch = AWS_HOST.test(host) &&
    (type === 'xmlhttprequest' || type === 'fetch' || type === 'other') &&
    !/\.(?:js|css|json|html|txt)(?:$|[?#&])/i.test(lowerUrl);

  return byMime || byExtension || byNetworkType || awsFetch;
}

async function getTabIsSciAstra(tabId) {
  if (tabId === -1) return false;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.url) return false;
    const host = new URL(tab.url).hostname;
    return SCIASTRA_HOST.test(host);
  } catch {
    return false;
  }
}

async function addCapture(tabId, url, info = {}) {
  if (!url || tabId === -1) return;
  if (!(await getTabIsSciAstra(tabId))) return;

  const normalized = normalizeUrl(url);
  const key = storageKey(tabId);
  const metaKeyForTab = metaKey(tabId);
  const result = await chrome.storage.local.get([key, metaKeyForTab]);
  const urls = Array.isArray(result[key]) ? result[key] : [];
  const metadata = result[metaKeyForTab] || {};

  const existingIndex = urls.findIndex(item => (typeof item === 'string' ? item : item.url) === normalized);
  if (existingIndex !== -1) {
    const existing = typeof urls[existingIndex] === 'string'
      ? { url: normalized }
      : { ...urls[existingIndex] };
    if (info.contentType && !existing.contentType) existing.contentType = info.contentType;
    if (info.filename && !existing.filename) existing.filename = info.filename;
    if (info.type && (!existing.type || existing.type === 'unknown')) existing.type = info.type;
    if (info.source) existing.source = info.source;
    urls[existingIndex] = existing;
    await chrome.storage.local.set({ [key]: urls });
    try {
      await chrome.runtime.sendMessage({ action: 'NEW_RESOURCE', tabId, item: existing, update: true });
    } catch {}
    return;
  }

  const item = {
    url: normalized,
    type: info.type || 'unknown',
    contentType: info.contentType || '',
    filename: info.filename || '',
    source: info.source || 'network',
    capturedAt: Date.now()
  };

  urls.push(item);
  if (urls.length > MAX_ITEMS) urls.splice(0, urls.length - MAX_ITEMS);
  metadata.lastCaptureAt = Date.now();
  metadata.count = urls.length;

  await chrome.storage.local.set({
    [key]: urls,
    [metaKeyForTab]: metadata
  });

  try {
    await chrome.runtime.sendMessage({
      action: 'NEW_RESOURCE',
      tabId,
      item
    });
  } catch {
    // Popup may not be open.
  }
}

// Capture response headers. This is the important change: the URL does not
// need to contain .pdf/.jpg/etc. if the response declares its actual MIME type.
chrome.webRequest.onHeadersReceived.addListener(
  details => {
    if (details.tabId === -1) return;

    const contentType = getContentType(details.responseHeaders);
    if (!isLikelyDocumentUrl(details.url, details.type, contentType)) return;
    const filename = getFilename(details.responseHeaders);

    // Fire-and-forget; listener must not block the request.
    addCapture(details.tabId, details.url, {
      type: details.type,
      contentType,
      filename,
      source: 'response-headers'
    });
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders', 'extraHeaders']
);

// Also catch useful URL-shaped resources whose response headers are unavailable
// or whose viewer loads them from DOM APIs.
chrome.webRequest.onCompleted.addListener(
  details => {
    if (details.tabId === -1) return;
    if (!isLikelyDocumentUrl(details.url, details.type, '')) return;

    addCapture(details.tabId, details.url, {
      type: details.type,
      source: 'completed-request'
    });
  },
  { urls: ['<all_urls>'] }
);

// Content script can report URLs from <img>, <iframe>, PerformanceResourceTiming,
// patched fetch/XHR, etc.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === 'RESOURCE_CANDIDATES' && sender.tab?.id != null) {
    const candidates = Array.isArray(message.urls) ? message.urls : [];
    Promise.all(
      candidates.slice(0, 1000).map(candidate => {
        if (typeof candidate === 'string') {
          return addCapture(sender.tab.id, candidate, { source: 'content-script' });
        }
        return addCapture(sender.tab.id, candidate.url, {
          type: candidate.type,
          contentType: candidate.contentType,
          filename: candidate.filename,
          source: candidate.source || 'content-script'
        });
      })
    ).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.action === 'SCAN_START' && sender.tab?.id != null) {
    const tabId = sender.tab.id;
    chrome.storage.local.set({
      [scanKey(tabId)]: {
        running: true,
        startedAt: Date.now(),
        lastUpdateAt: Date.now(),
        count: 0
      }
    }).catch(() => {});
    return;
  }

  if (message?.action === 'SCAN_PROGRESS' && sender.tab?.id != null) {
    const tabId = sender.tab.id;
    chrome.storage.local.get(scanKey(tabId)).then(result => {
      const current = result[scanKey(tabId)] || {};
      return chrome.storage.local.set({
        [scanKey(tabId)]: {
          ...current,
          running: true,
          lastUpdateAt: Date.now(),
          count: Number.isFinite(message.count) ? message.count : (current.count || 0)
        }
      });
    }).catch(() => {});
    return;
  }

  if (message?.action === 'SCAN_COMPLETE' && sender.tab?.id != null) {
    const tabId = sender.tab.id;
    chrome.storage.local.get([scanKey(tabId), storageKey(tabId)]).then(current => {
      const items = Array.isArray(current[storageKey(tabId)]) ? current[storageKey(tabId)] : [];
      return chrome.storage.local.set({
        [scanKey(tabId)]: {
          ...(current[scanKey(tabId)] || {}),
          running: false,
          completedAt: Date.now(),
          lastUpdateAt: Date.now(),
          count: items.length
        }
      }).then(() => chrome.runtime.sendMessage({ action: 'SCAN_COMPLETE', tabId, count: items.length }).catch(() => {}));
    }).catch(() => {});
    return;
  }

  if (message?.action === 'GET_SCAN_STATE' && sender.tab?.id != null) {
    const tabId = sender.tab.id;
    chrome.storage.local.get([scanKey(tabId), storageKey(tabId)]).then(result => {
      const items = Array.isArray(result[storageKey(tabId)]) ? result[storageKey(tabId)] : [];
      sendResponse({ ok: true, state: result[scanKey(tabId)] || { running: false, count: items.length }, count: items.length });
    }).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.action === 'GET_STATUS' && sender.tab?.id != null) {
    chrome.storage.local.get([storageKey(sender.tab.id), metaKey(sender.tab.id)])
      .then(result => sendResponse({
        ok: true,
        count: Array.isArray(result[storageKey(sender.tab.id)]) ? result[storageKey(sender.tab.id)].length : 0,
        meta: result[metaKey(sender.tab.id)] || {}
      }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  chrome.storage.local.remove([storageKey(tabId), metaKey(tabId), scanKey(tabId)]).catch(() => {});
});
