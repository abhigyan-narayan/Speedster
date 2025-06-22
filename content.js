let currentSpeed = 1.0;
let lastSpeed = 1.0;
let overlay = null;
let lastKnownUrl = location.href;
let applySpeedDebouncedTimeout = null;
let showOverlayDebounceTimeout = null;
let isExtensionEnabledForSite = true;
const isTopFrame = (window.self === window.top); // Determine if this script is in the top-level frame

/**
 * Displays a temporary overlay on the screen showing the current playback speed.
 * This function is now debounced internally to prevent flickering and only shows if user initiated.
 * @param {number} speed The current playback speed to display.
 * @param {boolean} isUserInitiated True if the speed change was initiated by user action.
 */
function showOverlay(speed, isUserInitiated) {
  // Only show overlay if this content script instance is in the top-level frame AND it's user initiated
  if (!isUserInitiated || !isTopFrame) {
    return;
  }

  // Clear any existing debounce timeout to reset the timer
  if (showOverlayDebounceTimeout) {
    clearTimeout(showOverlayDebounceTimeout);
  }

  showOverlayDebounceTimeout = setTimeout(() => {
    // If an overlay already exists and is still in the DOM, clear its removal timeout and update it.
    if (overlay && overlay.parentNode) {
      clearTimeout(overlay._timeout); // Clear the previous removal timeout
      overlay.textContent = `${speed.toFixed(2)}x`; // Update text
      overlay.style.opacity = '1'; // Ensure it's fully visible
      // Reset its removal timer
      overlay._timeout = setTimeout(() => {
        if (overlay) {
          overlay.style.opacity = '0'; // Start fade out
          setTimeout(() => {
            if (overlay && overlay.parentNode) {
              document.body.removeChild(overlay);
              overlay = null;
            }
          }, 100); // Match transition duration
        }
      }, 1500); // Display for 1.5 seconds
      return; // Exit as overlay already exists and is updated
    }

    // Create the new overlay element if it doesn't exist
    overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '80px';
    overlay.style.left = '50px';
    overlay.style.background = 'rgba(0, 0, 0, 0.7)';
    overlay.style.color = 'white';
    overlay.style.padding = '12px 18px';
    overlay.style.fontSize = '24px';
    overlay.style.fontWeight = 'bold';
    overlay.style.borderRadius = '8px';
    overlay.style.zIndex = '99999';
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.1s ease-in-out';

    overlay.textContent = `${speed.toFixed(2)}x`;

    document.body.appendChild(overlay);
    setTimeout(() => {
      overlay.style.opacity = '1';
    }, 10); // A very short delay to trigger CSS transition

    // Set a timeout to fade out and remove the overlay after 1.5 seconds
    overlay._timeout = setTimeout(() => {
      if (overlay) {
        overlay.style.opacity = '0'; // Start fade out
        // Remove element after transition completes
        setTimeout(() => {
          if (overlay && overlay.parentNode) {
            document.body.removeChild(overlay);
            overlay = null;
          }
        }, 100); // Match transition duration
      }
    }, 1500); // Display for 1.5 seconds
  }, 200); // Debounce delay: 50ms. Adjust if needed.
}


/**
 * Finds all media elements (video and audio) on the page and applies the given speed.
 * If in the top frame, it also sends messages to iframes.
 * @param {number} speed The playback speed to apply.
 * @param {boolean} [isUserInitiated=false] True if the speed change was initiated by user action.
 */
function applySpeed(speed, isUserInitiated = false) {
    const mediaElements = document.querySelectorAll('video, audio');
    mediaElements.forEach(media => {
        media.playbackRate = speed;
        if (speed === 0) {
            media.pause();
        }
    });
    currentSpeed = speed;

    // Only show overlay if this is the top-level frame and user initiated
    if (isTopFrame) {
        showOverlay(speed, isUserInitiated);

        // If in top frame, also send message to all iframes
        try {
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach(iframe => {
                if (iframe.contentWindow) {
                    iframe.contentWindow.postMessage({
                        type: 'SPEEDSTER_SET_SPEED',
                        speed: speed,
                        isUserInitiated: isUserInitiated // Pass through, though iframes won't show overlay
                    }, '*'); // Use '*' for targetOrigin for now, ideally restrict to known origins like 'https://www.youtube.com'
                }
            });
        } catch (e) {
            console.warn("SPEEDSTER: Could not post message to some iframes due to security restrictions:", e);
        }
    }
}


/**
 * Debounces the applySpeed function to prevent excessive calls.
 * This is useful for MutationObserver which can fire many times rapidly.
 */
function applySpeedDebounced() {
    if (applySpeedDebouncedTimeout) {
        clearTimeout(applySpeedDebouncedTimeout);
    }
    // Note: isUserInitiated is false for debounced calls, so overlay won't show
    applySpeedDebouncedTimeout = setTimeout(() => {
        applySpeed(currentSpeed, false);
    }, 200); // Apply speed after 100ms of no further mutations
}

/**
 * Loads the stored speed for the current site or initializes it.
 * Only the top-level frame handles storage. Iframes receive speed via postMessage.
 */
function loadSiteSpeed() {
    if (isTopFrame) {
        chrome.storage.local.get([location.origin, 'isExtensionEnabledForSiteGlobally'], (result) => {
            // Load global enablement flag first
            if (typeof result.isExtensionEnabledForSiteGlobally !== 'undefined') {
                isExtensionEnabledForSite = result.isExtensionEnabledForSiteGlobally;
            } else {
                // If global setting not found, initialize it as true
                isExtensionEnabledForSite = true;
                chrome.storage.local.set({ 'isExtensionEnabledForSiteGlobally': true });
            }

            // Load speed for the current site if extension is enabled
            if (isExtensionEnabledForSite && result[location.origin]) {
                currentSpeed = result[location.origin];
            } else if (!isExtensionEnabledForSite) {
                // If extension is disabled for the site, set speed to 0 and pause
                currentSpeed = 0;
            } else {
                // Default to 1.0 if no stored speed for the site
                currentSpeed = 1.0;
            }
            // Apply initial speed. isUserInitiated is false for initial load from storage.
            applySpeed(currentSpeed, false);
        });
    } else {
        // If in an iframe, do NOT load from storage.
        // Assume default speed and await message from top frame.
        currentSpeed = 1.0;
        isExtensionEnabledForSite = true; // Assume enabled until told otherwise by top frame
        applySpeed(currentSpeed, false); // Apply default speed initially within iframe
    }
}

/**
 * Saves the current speed for the current site to storage.
 * Only the top-level frame handles storage.
 */
function saveSiteSpeed() {
    if (isTopFrame) {
        chrome.storage.local.set({ [location.origin]: currentSpeed });
    }
}

/**
 * Resets the speed to 1.0 or toggles between 1.0 and lastSpeed.
 */
function resetSpeed() {
    if (!isExtensionEnabledForSite) {
        return;
    }
    if (currentSpeed !== 1.0) {
        lastSpeed = currentSpeed; // Store current speed before resetting
        currentSpeed = 1.0;
    } else if (lastSpeed !== 1.0) {
        currentSpeed = lastSpeed; // Toggle back to last custom speed
    }
    applySpeed(currentSpeed, true); // User initiated
    saveSiteSpeed(); // Only saves if isTopFrame
}

/**
 * Adjusts the speed based on the command.
 * @param {string} command 'increase-speed' or 'decrease-speed'.
 */
function adjustSpeed(command) {
    if (!isExtensionEnabledForSite) {
        // If extension is disabled for this site, do not adjust speed.
        return;
    }

    let newSpeed = currentSpeed;
    if (command === 'increase-speed') {
        newSpeed += 0.25;
        if (newSpeed > 16) newSpeed = 16; // Cap at 16x
    } else if (command === 'decrease-speed') {
        newSpeed -= 0.25;
        if (newSpeed < 0) newSpeed = 0; // Don't go below 0
    }

    // Ensure floating point precision
    newSpeed = parseFloat(newSpeed.toFixed(2));
    applySpeed(newSpeed, true); // User initiated
    saveSiteSpeed(); // Only saves if isTopFrame
}

// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Determine if the sender is the popup based on sender.url
    const popupUrl = chrome.runtime.getURL("popup.html");
    const isFromPopup = sender.url && sender.url.startsWith(popupUrl);

    switch (request.type) {
        case 'increase-speed':
        case 'decrease-speed':
            adjustSpeed(request.type);
            // ALWAYS send response for popup UI update
            sendResponse({ currentSpeed: currentSpeed, isEnabledForSite: isExtensionEnabledForSite });
            break;
        case 'reset-speed':
            resetSpeed();
            sendResponse({ currentSpeed: currentSpeed, isEnabledForSite: isExtensionEnabledForSite });
            break;
        case 'get-speed-status-from-popup':
            sendResponse({ currentSpeed: currentSpeed, isEnabledForSite: isExtensionEnabledForSite });
            return true;
        case 'toggle-site-enablement-from-popup':
            if (isTopFrame) {
                isExtensionEnabledForSite = !isExtensionEnabledForSite;
                currentSpeed = 1.0;
                applySpeed(currentSpeed, true);
                chrome.storage.local.set({
                    'isExtensionEnabledForSiteGlobally': isExtensionEnabledForSite,
                    [location.origin]: currentSpeed
                }, () => {
                    sendResponse({ currentSpeed: currentSpeed, isEnabledForSite: isExtensionEnabledForSite });
                });
                return true;
            } else {
                sendResponse({ currentSpeed: currentSpeed, isEnabledForSite: isExtensionEnabledForSite });
            }
            break;
    }
});



// Listener for messages from other frames (e.g., top frame sending speed to iframe)
if (!isTopFrame) {
    window.addEventListener('message', (event) => {
        // IMPORTANT: Verify the origin of the message to prevent security vulnerabilities
        // For YouTube embeds, the parent origin would be the site embedding it.
        // A more robust check might involve checking event.origin against chrome.runtime.id for extension-sent messages
        // For now, we'll assume the top frame's postMessage is trusted.

        if (event.data && event.data.type === 'SPEEDSTER_SET_SPEED') {
            const receivedSpeed = event.data.speed;
            const receivedIsUserInitiated = event.data.isUserInitiated; // Though not used for overlay in iframe
            console.log(`SPEEDSTER (iframe): Received speed ${receivedSpeed} from top frame.`);
            // Apply the speed received from the top frame.
            // isUserInitiated is false because this is an inherited speed change, not directly from user in iframe.
            applySpeed(receivedSpeed, false);
            // Since this is inherited, we don't save to storage from the iframe.
        }
    });
}


// Create a MutationObserver to detect changes in the DOM and URL (for SPAs like YouTube)
const observer = new MutationObserver((mutations) => {
  // Only the top frame should manage URL changes for overall site speed
  if (isTopFrame && location.href !== lastKnownUrl) {
    lastKnownUrl = location.href; // Update the last known URL
    loadSiteSpeed(); // This will load the speed for the new site/video and apply it
  } else if (isExtensionEnabledForSite) {
    // If URL hasn't changed, but DOM mutations occurred (e.g., new video elements added,
    // or existing ones replaced/reset), re-apply the current speed.
    // This applies to both top frame and iframes.
    applySpeedDebounced();
  }
});

// Observe the entire document body for changes in its children and subtree.
observer.observe(document.body, { childList: true, subtree: true });

// Initial load of site speed when the content script is first injected.
loadSiteSpeed();
