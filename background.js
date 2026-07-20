const targetPatterns = [
  "https://app.sciastra.com/*",
  "https://*.amazonaws.com/*",
  "https://*.cloudfront.net/*"
];

chrome.webRequest.onCompleted.addListener(
  async (details) => {
    const { url, tabId, type } = details;
    
    // Ignore requests not originating from a tab
    if (tabId === -1) return;

    // We only want to capture if the initiator is app.sciastra.com
    // To do this strictly, we can check the tab's URL (though details.initiator is more reliable, let's just use tab URL)
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab.url || !tab.url.includes('app.sciastra.com')) {
         return;
      }
    } catch (e) {
      return; // Tab might be closed or inaccessible
    }

    // Check if the URL looks like a document or image
    const lowerUrl = url.toLowerCase();
    const isDoc = lowerUrl.includes('.pdf') || 
                  lowerUrl.includes('.png') || 
                  lowerUrl.includes('.jpg') || 
                  lowerUrl.includes('.jpeg') || 
                  lowerUrl.includes('.webp');
    
    const isBlob = lowerUrl.startsWith('blob:');
                  
    const isAwsS3 = lowerUrl.includes('s3.amazonaws.com') || lowerUrl.includes('cloudfront.net');
    
    // According to instructions: "Look for requests with type: fetch, blob: or responses containing .pdf, .png, or AWS/S3 links"
    // details.type maps to "xmlhttprequest" for fetch API in some contexts or just "xmlhttprequest"
    const isFetch = type === 'xmlhttprequest' || type === 'other';

    if (isDoc || isBlob || (isAwsS3 && isFetch)) {
      // Avoid duplicate captures
      const key = `urls_${tabId}`;
      const result = await chrome.storage.session.get([key]);
      let urls = result[key] || [];
      
      if (!urls.includes(url)) {
        urls.push(url);
        let data = {};
        data[key] = urls;
        await chrome.storage.session.set(data);
        
        // Notify popup if it's currently open
        chrome.runtime.sendMessage({ 
          action: 'NEW_URL', 
          tabId: tabId, 
          url: url 
        }).catch(() => {
          // Ignore error if popup is not open
        });
      }
    }
  },
  { urls: ["<all_urls>"] } // We use <all_urls> to catch cross-origin fetch requests
);

// Clean up storage when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  const key = `urls_${tabId}`;
  chrome.storage.session.remove(key);
});
