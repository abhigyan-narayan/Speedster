let currentSpeed = 1.0;
let lastSpeed = 1.0;
let overlay = null;
let lastKnownUrl = location.href; // Keep track of the last known URL for mutation observer
let applySpeedDebouncedTimeout = null; // Timeout ID for debounced function
let isExtensionEnabledForSite = true; // Global flag: true by default, updated by storage

/**
 * Displays a temporary overlay on the screen showing the current playback speed.
 * @param {number} speed The current playback speed to display.
 */
function showOverlay(speed) {
  // If an overlay already exists and is still in the DOM, clear its timeout and remove it.
  // This ensures a fresh overlay is created for each display, preventing lingering issues.
  if (overlay && overlay.parentNode) {
    clearTimeout(overlay._timeout);
    document.body.removeChild(overlay);
    overlay = null; // Reset the overlay reference
  }

  // Create the new overlay element
  overlay = document.createElement('div');
  overlay.style.position = 'fixed'; // Position relative to the viewport
  overlay.style.top = '80px'; // Adjusted further down
  overlay.style.left = '50px'; // Slightly shifted to the right
  overlay.style.background = 'rgba(0, 0, 0, 0.7)'; // Semi-transparent black background
  overlay.style.color = 'white'; // White text color
  overlay.style.padding = '12px 18px'; // Padding around the text
  overlay.style.fontSize = '24px'; // Larger font
  overlay.style.fontWeight = 'bold'; // Bold text
  overlay.style.borderRadius = '8px'; // Rounded corners
  overlay.style.zIndex = '9999'; // Ensure it's on top of most page content
  overlay.textContent = `${speed.toFixed(2)}x`; // Set the text content
  document.body.appendChild(overlay); // Add the overlay to the document body

  // Set a timeout to remove the overlay from the DOM after 1.5 seconds
  overlay._timeout = setTimeout(() => {
    // Check if the overlay element still exists and is attached to the DOM before removing
    if (overlay && overlay.parentNode) {
      document.body.removeChild(overlay);
    }
    overlay = null; // Clear the reference to the overlay after removal
  }, 1500); // 1.5 seconds (1500 milliseconds)
}

/**
 * Event listener for 'playing' event on media elements.
 * Ensures the media element has the current playback rate.
 * This function does NOT show the overlay anymore, as per user request.
 */
function handleMediaPlaying(event) {
  const media = event.target;
  // Only apply speed if the extension is enabled for this site
  if (isExtensionEnabledForSite && media.playbackRate !== currentSpeed) {
    media.playbackRate = currentSpeed;
  }
}

/**
 * Applies the given playback speed to all video and audio elements on the page.
 * Adds a 'playing' event listener to each to ensure speed is applied when media starts.
 * @param {number} speed The playback speed to apply.
 */
function applySpeedToMedia(speed) {
  // Select all video and audio elements and set their playback rate
  document.querySelectorAll("video, audio").forEach(media => {
    media.playbackRate = speed;
    // Add 'playing' event listener only if it hasn't been added yet for this media element
    if (!media._speedOverlayListenerAdded) {
      media.addEventListener('playing', handleMediaPlaying);
      media._speedOverlayListenerAdded = true; // Set a flag to prevent adding duplicate listeners
    }
  });
}

/**
 * Debounced function to re-apply the current speed to all media elements.
 * This prevents applying speed too frequently during rapid DOM changes
 * on dynamic websites like YouTube.
 */
function applySpeedDebounced() {
  if (applySpeedDebouncedTimeout) {
    clearTimeout(applySpeedDebouncedTimeout);
  }
  // Set a timeout to apply speed after a short delay, allowing the DOM to settle
  applySpeedDebouncedTimeout = setTimeout(() => {
    // Only apply speed if the extension is currently enabled for this site.
    // This is important for media that loads dynamically after initial page load.
    if (isExtensionEnabledForSite) {
      applySpeedToMedia(currentSpeed); // Re-apply the current speed to all media
    }
  }, 200); // 200ms delay for robustness
}


/**
 * Loads the saved playback speed for the current site from local storage
 * and applies it to media elements. Also checks for site disablement.
 */
function loadSiteSpeed() {
  const origin = location.origin; // Get the origin (protocol + hostname + port) of the current page
  chrome.storage.local.get(['siteSpeeds', 'disabledSites'], ({ siteSpeeds, disabledSites }) => {
    // Determine if the extension is disabled for the current site
    const siteDisabled = disabledSites && disabledSites.includes(origin);
    isExtensionEnabledForSite = !siteDisabled; // Update the global flag

    if (siteDisabled) {
      // If disabled, reset currentSpeed to 1.0 and ensure media plays normally
      currentSpeed = 1.0;
      applySpeedToMedia(currentSpeed); // Ensure speed is 1.0 if disabled
      console.log(`Media Speed Controller: Disabled for ${origin}`);
      // Do not show overlay on load if disabled.
      return; // Stop further processing for this load
    }

    // If not disabled, proceed to load saved speed
    if (siteSpeeds && siteSpeeds[origin]) {
      currentSpeed = siteSpeeds[origin]; // Set current speed to the loaded speed
    } else {
      currentSpeed = 1.0; // Default to 1.0 if no speed is saved for this site
    }
    applySpeedToMedia(currentSpeed); // Apply speed, but don't show overlay here on initial load
  });
}

/**
 * Saves the current playback speed for the current site to local storage.
 * @param {number} speed The speed to save.
 */
function saveSiteSpeed(speed) {
  const origin = location.origin; // Get the origin of the current page
  chrome.storage.local.get(['siteSpeeds'], ({ siteSpeeds }) => {
    if (!siteSpeeds) {
      siteSpeeds = {}; // Initialize siteSpeeds if it doesn't exist
    }
    siteSpeeds[origin] = speed; // Store the current speed for the current origin
    chrome.storage.local.set({ siteSpeeds }); // Save the updated siteSpeeds object to local storage
  });
}

/**
 * Listener for messages from the background script (keyboard shortcuts)
 * and popup.js (UI interactions).
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // If the extension is disabled for this site, only allow specific messages from popup.
  // Other keyboard shortcuts should be ignored.
  if (!isExtensionEnabledForSite && request.type !== "toggle-site-enablement-from-popup" && request.type !== "get-speed-status-from-popup") {
    sendResponse({ currentSpeed: currentSpeed, isEnabledForSite: isExtensionEnabledForSite }); // Always send response back to popup to update its UI with the current state (disabled)
    return; // Ignore commands if disabled, unless it's a popup request for status or toggle.
  }

  // Handle messages from the popup (popup.js)
  if (request.type === "get-speed-status-from-popup") {
    // Send current speed and enablement status back to the popup
    sendResponse({ currentSpeed: currentSpeed, isEnabledForSite: isExtensionEnabledForSite });
    return true; // Indicate that sendResponse will be called asynchronously
  } else if (request.type === "toggle-site-enablement-from-popup") {
    const origin = location.origin;
    chrome.storage.local.get(['disabledSites'], ({ disabledSites }) => {
      let updatedDisabledSites = disabledSites || [];
      if (isExtensionEnabledForSite) { // Currently enabled, so disable it
        updatedDisabledSites.push(origin);
        isExtensionEnabledForSite = false;
        currentSpeed = 1.0; // Reset speed when disabling
        applySpeedToMedia(currentSpeed); // Immediately apply 1.0x
        console.log(`Media Speed Controller: Disabled for ${origin}`);
      } else { // Currently disabled, so enable it
        updatedDisabledSites = updatedDisabledSites.filter(site => site !== origin);
        isExtensionEnabledForSite = true;
        // Re-load speed for this site (will apply saved or default)
        // This implicitly calls applySpeedToMedia, so no need for an extra call here.
        loadSiteSpeed();
        console.log(`Media Speed Controller: Enabled for ${origin}`);
      }
      chrome.storage.local.set({ disabledSites: updatedDisabledSites }, () => {
        // Send response back to popup to update its UI with the new state
        sendResponse({ currentSpeed: currentSpeed, isEnabledForSite: isExtensionEnabledForSite });
      });
    });
    return true; // Indicate that sendResponse will be called asynchronously
  }

  // Handle messages for speed changes (from background script or popup buttons)
  if (request.type === "increase-speed") {
    currentSpeed = Math.min(currentSpeed + 0.25, 5.0);
  } else if (request.type === "decrease-speed") {
    currentSpeed = Math.max(currentSpeed - 0.25, 0.25);
  } else if (request.type === "reset-speed") {
    if (currentSpeed === 1.0 && lastSpeed !== 1.0) {
      currentSpeed = lastSpeed;
    } else {
      lastSpeed = currentSpeed;
      currentSpeed = 1.0;
    }
  } else {
    sendResponse({ currentSpeed: currentSpeed, isEnabledForSite: isExtensionEnabledForSite }); // Unknown request type, send current status
    return;
  }

  // For increase/decrease/reset commands (keyboard or popup buttons):
  applySpeedToMedia(currentSpeed);
  showOverlay(currentSpeed); // ONLY show overlay when speed is *manually* changed
  saveSiteSpeed(currentSpeed); // Speed is now saved automatically

  // Send response back to popup for speed change commands
  sendResponse({ currentSpeed: currentSpeed, isEnabledForSite: isExtensionEnabledForSite });
  return true; // Indicate that sendResponse will be called asynchronously
});


// Create a MutationObserver to detect changes in the DOM and URL (for SPAs like YouTube)
const observer = new MutationObserver((mutations) => {
  // Check if the URL has changed, which typically means a new page/video has loaded
  if (location.href !== lastKnownUrl) {
    lastKnownUrl = location.href; // Update the last known URL
    loadSiteSpeed(); // This will load the speed for the new site/video and apply it
  } else {
    // If URL hasn't changed, but DOM mutations occurred (e.g., new video elements added,
    // or existing ones replaced/reset), re-apply the current speed.
    // Only debounce and apply speed if the extension is enabled for this site.
    if (isExtensionEnabledForSite) {
      applySpeedDebounced();
    }
  }
});

// Observe the entire document body for changes in its children and subtree.
// This is crucial for dynamic sites like YouTube where elements are added/removed
// or their attributes (like 'src' for video) are changed without a full page reload.
observer.observe(document.body, { childList: true, subtree: true });

// Initial load of site speed when the content script is first injected.
// This handles the initial page load for the first video.
// This call will set `currentSpeed` and `isExtensionEnabledForSite` and apply speed.
loadSiteSpeed();

