document.addEventListener('DOMContentLoaded', async () => {
  const urlListEl = document.getElementById('url-list');
  const statusText = document.getElementById('status-text');
  const countBadge = document.getElementById('count-badge');
  const downloadAllBtn = document.getElementById('download-all-btn');
  const clearBtn = document.getElementById('clear-btn');
  const scanBtn = document.getElementById('scan-btn');

  let currentTabId = null;
  let capturedItems = [];
  let scanning = false;
  let scanStartedAt = 0;

  const scanKey = () => `scan_${currentTabId}`;

  const icons = {
    eye: '<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 10.5a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/></svg>',
    download: '<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>'
  };

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  currentTabId = tab.id;
  let isSciAstra = false;
  try {
    isSciAstra = new URL(tab.url || '').hostname === 'app.sciastra.com' ||
      new URL(tab.url || '').hostname.endsWith('.app.sciastra.com');
  } catch {}

  if (!isSciAstra) {
    statusText.textContent = 'Navigate to app.sciastra.com';
    scanBtn.disabled = true;
    return;
  }

  await loadItems();
  await loadScanState();

  async function loadScanState() {
    if (currentTabId == null) return;
    try {
      const result = await chrome.storage.local.get([scanKey()]);
      const state = result[scanKey()] || {};
      scanning = Boolean(state.running);
      scanStartedAt = state.startedAt || 0;
      scanBtn.disabled = scanning;
      if (scanning) {
        statusText.textContent = capturedItems.length
          ? `Scanning… ${capturedItems.length} found`
          : 'Scanning…';
      } else if (state.completedAt) {
        statusText.textContent = capturedItems.length ? 'Documents found' : 'Scan complete — no documents found';
      }
      renderList();
    } catch {}
  }

  function normalizeItem(raw) {
    if (typeof raw === 'string') {
      return { url: raw, type: 'unknown', contentType: '', filename: '', source: 'legacy' };
    }
    return {
      url: raw?.url || '',
      type: raw?.type || 'unknown',
      contentType: raw?.contentType || '',
      filename: raw?.filename || '',
      source: raw?.source || 'unknown',
      capturedAt: raw?.capturedAt || Date.now()
    };
  }

  function extensionFromMime(mime) {
    const value = String(mime || '').split(';')[0].trim().toLowerCase();
    const map = {
      'application/pdf': '.pdf',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/bmp': '.bmp',
      'image/avif': '.avif',
      'image/tiff': '.tiff'
    };
    return map[value] || '';
  }

  function filenameFor(item, index) {
    const supplied = String(item.filename || '').trim();
    if (supplied && !supplied.includes('/') && supplied.length < 180) return supplied;

    try {
      const u = new URL(item.url);
      const pathName = decodeURIComponent(u.pathname.split('/').pop() || '');
      if (pathName && pathName.length <= 100 && /\.[a-z0-9]{2,6}$/i.test(pathName)) return pathName;
    } catch {}

    const ext = extensionFromMime(item.contentType) || (
      /\.pdf(?:$|[?#])/i.test(item.url) ? '.pdf' :
      /\.(?:jpe?g)(?:$|[?#])/i.test(item.url) ? '.jpg' :
      /\.png(?:$|[?#])/i.test(item.url) ? '.png' :
      /\.webp(?:$|[?#])/i.test(item.url) ? '.webp' : ''
    );

    const kind = (item.contentType || '').includes('pdf') ? 'PDF' : 'Page';
    return `SciAstra_${kind}_${String(index + 1).padStart(3, '0')}${ext}`;
  }

  function shortName(item, index) {
    const filename = filenameFor(item, index);
    if (filename.length <= 34) return filename;
    return `${filename.slice(0, 28)}…${filename.slice(-6)}`;
  }

  function renderList() {
    urlListEl.innerHTML = '';
    countBadge.textContent = capturedItems.length;

    if (!capturedItems.length) {
      statusText.textContent = scanning ? 'Scanning…' : 'Waiting for documents...';
      downloadAllBtn.disabled = true;
      return;
    }

    statusText.textContent = scanning ? `Scanning… ${capturedItems.length} found` : 'Documents found';
    downloadAllBtn.disabled = false;

    capturedItems.forEach((rawItem, index) => {
      const item = normalizeItem(rawItem);
      const li = document.createElement('li');

      const span = document.createElement('span');
      span.className = 'url-text';
      span.textContent = shortName(item, index);
      span.title = `${item.url}\n${item.contentType || item.type || 'unknown type'}`;

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'item-actions';

      const viewBtn = document.createElement('button');
      viewBtn.className = 'icon-btn view-btn';
      viewBtn.title = 'View Document';
      viewBtn.innerHTML = icons.eye;
      viewBtn.onclick = () => chrome.tabs.create({ url: item.url });

      const dlBtn = document.createElement('button');
      dlBtn.className = 'icon-btn download-btn';
      dlBtn.title = 'Download';
      dlBtn.innerHTML = icons.download;
      dlBtn.onclick = () => downloadFile(item, index);

      actionsDiv.appendChild(viewBtn);
      actionsDiv.appendChild(dlBtn);
      li.appendChild(span);
      li.appendChild(actionsDiv);
      urlListEl.appendChild(li);
    });
  }

  async function loadItems() {
    if (currentTabId == null) return;
    const key = `urls_${currentTabId}`;
    const result = await chrome.storage.local.get([key]);
    const raw = Array.isArray(result[key]) ? result[key] : [];
    capturedItems = raw.map(normalizeItem).filter(item => item.url);
    renderList();
  }

  function downloadFile(item, index) {
    const filename = filenameFor(item, index);
    chrome.downloads.download({
      url: item.url,
      filename: `SciAstra Notes/${filename}`,
      saveAs: false,
      conflictAction: 'uniquify'
    }, downloadId => {
      if (chrome.runtime.lastError) {
        // Some protected resources can reject a background download. Fall back
        // to opening the URL, which lets the browser use its authenticated tab.
        statusText.textContent = 'Download blocked — opening resource…';
        chrome.tabs.create({ url: item.url });
      }
    });
  }

  const refreshTimer = setInterval(async () => {
    if (currentTabId == null) return;
    await loadItems();
    await loadScanState();
  }, 1200);

  window.addEventListener('unload', () => clearInterval(refreshTimer));

  chrome.runtime.onMessage.addListener(message => {
    if (message.action === 'NEW_RESOURCE' && message.tabId === currentTabId && message.item?.url) {
      const incoming = normalizeItem(message.item);
      const existingIndex = capturedItems.findIndex(item => normalizeItem(item).url === incoming.url);
      if (existingIndex === -1) {
        capturedItems.push(incoming);
      } else {
        capturedItems[existingIndex] = { ...normalizeItem(capturedItems[existingIndex]), ...incoming };
      }
      renderList();
    }

    if (message.action === 'SCAN_COMPLETE') {
      scanning = false;
      scanBtn.disabled = false;
      renderList();
    }
  });

  clearBtn.addEventListener('click', async () => {
    if (currentTabId == null) return;
    await chrome.storage.local.remove([`urls_${currentTabId}`, `meta_${currentTabId}`]);
    capturedItems = [];
    renderList();
  });

  downloadAllBtn.addEventListener('click', () => {
    if (!capturedItems.length) return;
    capturedItems.forEach((rawItem, index) => {
      const item = normalizeItem(rawItem);
      setTimeout(() => downloadFile(item, index), index * 350);
    });
  });

  scanBtn.addEventListener('click', async () => {
    if (currentTabId == null || scanning) return;
    scanning = true;
    scanBtn.disabled = true;
    statusText.textContent = 'Scanning…';
    renderList();

    try {
      await chrome.scripting.executeScript({
        target: { tabId: currentTabId },
        files: ['scripts/content.js']
      });
    } catch (error) {
      scanning = false;
      scanBtn.disabled = false;
      statusText.textContent = 'Could not start scanner. Refresh the page.';
      console.error(error);
      return;
    }

    // The scan is owned by the page/background, not by this popup.
    // Chrome may close an action popup when the page receives focus; that is
    // normal. Results are persisted in chrome.storage.local and will still be
    // here when the popup is opened again.
    statusText.textContent = capturedItems.length
      ? `Scanning… ${capturedItems.length} found`
      : 'Scanning…';
  });
});
