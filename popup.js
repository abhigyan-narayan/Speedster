/**
 * Asynchronously sends a message to the content script in the active tab.
 * @param {object} message The message object to send.
 * @returns {Promise<any>} A promise that resolves with the response from the content script.
 */
async function sendMessageToContentScript(message) {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
                    // Check for runtime.lastError to catch issues with content script not being ready
                    // or if the tab is not allowed (e.g., about:blank, chrome:// pages)
                    if (chrome.runtime.lastError) {
                        console.warn("Could not send message to content script:", chrome.runtime.lastError.message);
                        resolve(null); // Resolve with null or handle error gracefully
                    } else {
                        resolve(response);
                    }
                });
            } else {
                resolve(null); // No active tab found
            }
        });
    });
}

/**
 * Updates the speed display and the "Allow on this site" toggle in the popup UI.
 * @param {number} speed The current playback speed.
 * @param {boolean} isEnabledForSite True if the extension is enabled for the current site, false otherwise.
 */
function updatePopupUI(speed, isEnabledForSite) {
    const speedDisplay = document.getElementById('speedDisplay');
    const allowOnSiteCheckbox = document.getElementById('allowOnSite');

    if (speedDisplay) {
        speedDisplay.textContent = `${speed.toFixed(2)}x`;
    }
    if (allowOnSiteCheckbox) {
        allowOnSiteCheckbox.checked = isEnabledForSite;
    }
}

// Event listener for when the popup HTML content is fully loaded
document.addEventListener('DOMContentLoaded', async () => {
    // Get initial speed status from the content script
    const response = await sendMessageToContentScript({ type: "get-speed-status-from-popup" });
    if (response) {
        updatePopupUI(response.currentSpeed, response.isEnabledForSite);
    } else {
        // Fallback or error state for UI if content script doesn't respond
        updatePopupUI(1.0, true); // Assume default 1.0x and enabled
    }

    // Event listener for Increase button
    const increaseBtn = document.getElementById('increaseBtn');
    if (increaseBtn) {
        increaseBtn.addEventListener('click', async () => {
            const response = await sendMessageToContentScript({ type: "increase-speed" });
            if (response) {
                updatePopupUI(response.currentSpeed, response.isEnabledForSite);
            }
        });
    }

    // Event listener for Decrease button
    const decreaseBtn = document.getElementById('decreaseBtn');
    if (decreaseBtn) {
        decreaseBtn.addEventListener('click', async () => {
            const response = await sendMessageToContentScript({ type: "decrease-speed" });
            if (response) {
                updatePopupUI(response.currentSpeed, response.isEnabledForSite);
            }
        });
    }

    // Event listener for "Allow on this site" checkbox
    const allowOnSiteCheckbox = document.getElementById('allowOnSite');
    if (allowOnSiteCheckbox) {
        allowOnSiteCheckbox.addEventListener('change', async () => {
            const response = await sendMessageToContentScript({ type: "toggle-site-enablement-from-popup" });
            if (response) {
                updatePopupUI(response.currentSpeed, response.isEnabledForSite);
            }
        });
    }
});

