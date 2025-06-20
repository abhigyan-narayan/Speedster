let currentSpeed = 1.0;
let lastSpeed = 1.0;
let overlay = null;

/**
 * Displays a temporary overlay on the screen showing the current playback speed.
 * @param {number} speed The current playback speed to display.
 */
function showOverlay(speed) {
  // Create overlay element if it doesn't exist
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.style.position = 'fixed'; // Position relative to the viewport
    overlay.style.top = '80px'; // Adjusted further down from 50px
    overlay.style.left = '50px'; // Adjusted from 20px, to slightly shift it to the right
    overlay.style.background = 'rgba(0, 0, 0, 0.7)'; // Semi-transparent black background
    overlay.style.color = 'white'; // White text color
    overlay.style.padding = '12px 18px'; // Padding around the text
    overlay.style.fontSize = '24px'; // Adjusted from 20px, for a slightly larger font
    overlay.style.fontWeight = 'bold'; // Bold text
    overlay.style.borderRadius = '8px'; // Rounded corners
    overlay.style.zIndex = '9999'; // Ensure it's on top of most page content
    document.body.appendChild(overlay); // Add the overlay to the document body
  }

  // Update the text content of the overlay
  overlay.textContent = `${speed.toFixed(2)}x`;
  overlay.style.display = 'block'; // Make sure the overlay is visible

  // Clear any existing timeout to keep the overlay visible if speed is adjusted quickly
  clearTimeout(overlay._timeout);
  // Set a new timeout to hide the overlay after 1.5 seconds
  overlay._timeout = setTimeout(() => {
    overlay.style.display = 'none';
  }, 1500);
}

/**
 * Applies the given playback speed to all video and audio elements on the page.
 * @param {number} speed The playback speed to apply.
 */
function applySpeedToMedia(speed) {
  // Select all video and audio elements and set their playback rate
  document.querySelectorAll("video, audio").forEach(media => {
    media.playbackRate = speed;
  });
}

/**
 * Loads the saved playback speed for the current site from local storage
 * and applies it to media elements.
 */
function loadSiteSpeed() {
  const origin = location.origin; // Get the origin (protocol + hostname + port) of the current page
  chrome.storage.local.get(['siteSpeeds'], ({ siteSpeeds }) => {
    // Check if siteSpeeds exists and if there's a saved speed for the current origin
    if (siteSpeeds && siteSpeeds[origin]) {
      currentSpeed = siteSpeeds[origin]; // Set current speed to the loaded speed
      applySpeedToMedia(currentSpeed); // Apply the loaded speed to media
      showOverlay(currentSpeed); // Show the speed overlay
    }
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
 * Listener for messages from the background script.
 * Handles commands to increase, decrease, or reset playback speed.
 * Saving is now handled automatically with each speed change.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "increase-speed") {
    // Increase speed by 0.25, capping at 5.0
    currentSpeed = Math.min(currentSpeed + 0.25, 5.0);
  } else if (request.type === "decrease-speed") {
    // Decrease speed by 0.25, capping at 0.25
    currentSpeed = Math.max(currentSpeed - 0.25, 0.25);
  } else if (request.type === "reset-speed") {
    // If current speed is 1.0 and lastSpeed was different, revert to lastSpeed
    if (currentSpeed === 1.0 && lastSpeed !== 1.0) {
      currentSpeed = lastSpeed;
    } else {
      // Otherwise, save current speed as lastSpeed and reset to 1.0
      lastSpeed = currentSpeed;
      currentSpeed = 1.0;
    }
  } else {
    // If the request type is not recognized, do nothing
    return;
  }

  // Apply the new speed to media, show overlay, and save for persistence
  applySpeedToMedia(currentSpeed);
  showOverlay(currentSpeed);
  saveSiteSpeed(currentSpeed); // Speed is now saved automatically
});

// Apply saved speed immediately when the content script is injected into the page.
// This ensures that the speed is applied as early as possible, preventing media
// from playing at default speed initially.
loadSiteSpeed();

