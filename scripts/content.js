// Auto-scroll logic to trigger lazy loading of document pages/images
(async function() {
  // Try to find the scrollable container. 
  // It might be the window itself, or a specific div containing the viewer.
  // We'll try scrolling the window, and any large scrollable divs we find.

  function getScrollableContainers() {
    const containers = [window];
    
    // Find divs that are likely the main viewer container
    const divs = document.querySelectorAll('div');
    for (const div of divs) {
      if (div.scrollHeight > div.clientHeight && div.clientHeight > 300) {
        // Looks like a main scrollable area
        containers.push(div);
      }
    }
    return containers;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function autoScroll(container) {
    let isWindow = container === window;
    
    let currentPos = isWindow ? window.scrollY : container.scrollTop;
    let maxPos = isWindow ? document.body.scrollHeight - window.innerHeight : container.scrollHeight - container.clientHeight;
    
    const scrollStep = 500; // Pixels to scroll each step
    
    // If we're already at the bottom, reset to top first just in case
    if (currentPos >= maxPos - 100) {
      isWindow ? window.scrollTo(0, 0) : (container.scrollTop = 0);
      await sleep(1000); // Wait for top to load
      currentPos = 0;
    }

    // Keep scrolling until we reach the bottom
    let previousMax = -1;
    let stuckCount = 0;
    
    while (currentPos < maxPos) {
      currentPos += scrollStep;
      
      if (isWindow) {
        window.scrollTo(0, currentPos);
      } else {
        container.scrollTop = currentPos;
      }
      
      // Wait for network requests to fire and DOM to update
      await sleep(800);
      
      // Re-evaluate maxPos in case lazy loading expanded the container
      maxPos = isWindow ? document.body.scrollHeight - window.innerHeight : container.scrollHeight - container.clientHeight;
      currentPos = isWindow ? window.scrollY : container.scrollTop;

      // Anti-stuck mechanism if container stops growing but we haven't reached logical bottom
      if (maxPos === previousMax) {
        stuckCount++;
        if (stuckCount > 3) break; // We haven't progressed in 3 scrolls, probably at true bottom
      } else {
        stuckCount = 0;
        previousMax = maxPos;
      }
    }
    
    // Scroll back to top when done
    isWindow ? window.scrollTo(0, 0) : (container.scrollTop = 0);
  }

  const containers = getScrollableContainers();
  
  // We'll scroll the first likely container we find, or window
  // Often there's a specific 'viewer' class, but without exact DOM inspection, 
  // checking all major scrollables is safer.
  if (containers.length > 0) {
    // If there's a specific inner container, it's usually the last one added to our list (deepest)
    const targetContainer = containers.length > 1 ? containers[containers.length - 1] : containers[0];
    await autoScroll(targetContainer);
    alert("Scanning complete! Check the extension popup.");
  }

})();
