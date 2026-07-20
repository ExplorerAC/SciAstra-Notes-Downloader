document.addEventListener('DOMContentLoaded', async () => {
  const urlListEl = document.getElementById('url-list');
  const statusText = document.getElementById('status-text');
  const countBadge = document.getElementById('count-badge');
  const downloadAllBtn = document.getElementById('download-all-btn');
  const clearBtn = document.getElementById('clear-btn');
  const scanBtn = document.getElementById('scan-btn');

  let currentTabId = null;
  let capturedUrls = [];

  // Get current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    currentTabId = tab.id;
    if (!tab.url.includes('app.sciastra.com')) {
      statusText.textContent = "Navigate to app.sciastra.com";
      scanBtn.disabled = true;
      return;
    }
    loadUrls();
  }

  function renderList() {
    urlListEl.innerHTML = '';
    countBadge.textContent = capturedUrls.length;
    
    if (capturedUrls.length === 0) {
      statusText.textContent = "Waiting for documents...";
      downloadAllBtn.disabled = true;
      return;
    }

    statusText.textContent = "Documents found";
    downloadAllBtn.disabled = false;

    capturedUrls.forEach((url, index) => {
      const li = document.createElement('li');
      
      const span = document.createElement('span');
      span.className = 'url-text';
      // Simple logic to extract filename or just show URL
      let displayName = url.split('/').pop().split('?')[0];
      if (!displayName || displayName.length > 30) {
        displayName = `Document ${index + 1}`;
      }
      span.textContent = displayName;
      span.title = url;

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'item-actions';

      const viewBtn = document.createElement('button');
      viewBtn.className = 'icon-btn view-btn';
      viewBtn.title = 'View Document';
      viewBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
      viewBtn.onclick = () => {
        chrome.tabs.create({ url: url });
      };

      const dlBtn = document.createElement('button');
      dlBtn.className = 'icon-btn download-btn';
      dlBtn.title = 'Download';
      dlBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
      dlBtn.onclick = () => downloadFile(url, displayName);

      actionsDiv.appendChild(viewBtn);
      actionsDiv.appendChild(dlBtn);

      li.appendChild(span);
      li.appendChild(actionsDiv);
      urlListEl.appendChild(li);
    });
  }

  async function loadUrls() {
    if (!currentTabId) return;
    const key = `urls_${currentTabId}`;
    const result = await chrome.storage.session.get([key]);
    capturedUrls = result[key] || [];
    renderList();
  }

  function downloadFile(url, filename) {
    chrome.downloads.download({
      url: url,
      // If it's a blob or generic S3 link, maybe we don't have a good extension
      // We rely on chrome's MIME type detection or force .pdf/.png if we know
      saveAs: true // Prompt user where to save
    });
  }

  // Listen for new URLs from background script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'NEW_URL' && message.tabId === currentTabId) {
      if (!capturedUrls.includes(message.url)) {
        capturedUrls.push(message.url);
        renderList();
      }
    }
  });

  // Buttons
  clearBtn.addEventListener('click', async () => {
    if (!currentTabId) return;
    const key = `urls_${currentTabId}`;
    await chrome.storage.session.remove(key);
    capturedUrls = [];
    renderList();
  });

  downloadAllBtn.addEventListener('click', () => {
    capturedUrls.forEach((url, index) => {
      // Small delay between downloads to prevent browser blocking
      setTimeout(() => {
        downloadFile(url, `SciAstra_Doc_${index + 1}`);
      }, index * 500);
    });
  });

  scanBtn.addEventListener('click', async () => {
    if (!currentTabId) return;
    
    // Inject content script to auto-scroll
    chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      files: ['scripts/content.js']
    });
    
    statusText.textContent = "Scanning (scrolling)...";
  });
});
