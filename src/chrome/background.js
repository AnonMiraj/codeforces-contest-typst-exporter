/**
 * Background Service Worker for Chrome.
 * Manages message router, local file loading, CORS fetches, and Offscreen Document lifecycle.
 */

// Keep track of the offscreen document state
let creatingOffscreen = null;
let offscreenReadyResolve = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(`[Background SW] Received message type: ${message.type}`);

  if (message.type === 'OFFSCREEN_READY') {
    console.log(`[Background SW] Handshake signal 'OFFSCREEN_READY' received from offscreen document.`);
    if (offscreenReadyResolve) {
      console.log(`[Background SW] Resolving pending offscreen readiness Promise.`);
      offscreenReadyResolve();
      offscreenReadyResolve = null;
    } else {
      console.warn(`[Background SW] Received 'OFFSCREEN_READY' but no pending ready Promise found.`);
    }
    sendResponse({ success: true });
    return false;
  }

  if (message.type === 'GET_LIB_TYP') {
    const libUrl = chrome.runtime.getURL('lib.typ');
    console.log(`[Background SW] Reading template from: ${libUrl}`);
    fetch(libUrl)
      .then(res => res.text())
      .then(content => {
        console.log(`[Background SW] Successfully read lib.typ (${content.length} characters)`);
        sendResponse({ success: true, content });
      })
      .catch(err => {
        console.error(`[Background SW] Failed to read template:`, err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // async response
  }

  if (message.type === 'FETCH_IMAGE') {
    console.log(`[Background SW] Fetching proxy image: ${message.url}`);
    fetch(message.url)
      .then(res => res.arrayBuffer())
      .then(buffer => {
        console.log(`[Background SW] Successfully fetched image (${buffer.byteLength} bytes) for: ${message.url}`);
        sendResponse({ success: true, data: Array.from(new Uint8Array(buffer)) });
      })
      .catch(err => {
        console.warn(`[Background SW] Background image fetch failed for ${message.url}:`, err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (message.type === 'COMPILE_PDF') {
    console.log(`[Background SW] Starting COMPILE_PDF pipeline. Document size: ${message.mainContent.length} chars, Images to map: ${message.images.length}`);
    handlePdfCompilation(message.mainContent, message.images)
      .then(pdfData => {
        console.log(`[Background SW] COMPILE_PDF pipeline complete. Returning ${pdfData.length} bytes to sender.`);
        sendResponse({ success: true, pdfData });
      })
      .catch(err => {
        console.error(`[Background SW] COMPILE_PDF pipeline crashed:`, err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
});

// Helper to open the offscreen document context safely
async function setupOffscreen() {
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  console.log(`[Background SW] Checking offscreen document status: ${offscreenUrl}`);
  
  // Check if document is already open
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) {
    console.log(`[Background SW] Offscreen document context is already active.`);
    return;
  }

  if (creatingOffscreen) {
    console.log(`[Background SW] A creation request is already pending. Awaiting creation...`);
    await creatingOffscreen;
    return;
  }

  console.log(`[Background SW] Spawning new offscreen document...`);
  const readyPromise = new Promise(resolve => {
    offscreenReadyResolve = resolve;
  });

  creatingOffscreen = chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['DOM_PARSER'],
    justification: 'Typst WebAssembly compilation requires DOM context and synchronous XMLHttpRequests.'
  });

  await creatingOffscreen;
  creatingOffscreen = null;
  console.log(`[Background SW] Offscreen document created in browser. Awaiting 'OFFSCREEN_READY' signal...`);

  // Await the ready signal from offscreen.js
  await readyPromise;
  console.log(`[Background SW] Handshake successful! Offscreen document is fully initialized.`);
}

async function handlePdfCompilation(mainContent, images) {
  await setupOffscreen();

  try {
    console.log(`[Background SW] Forwarding COMPILE_PDF_INTERNAL to offscreen document...`);
    // Forward compilation parameters to the offscreen page
    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'COMPILE_PDF_INTERNAL',
      mainContent,
      images
    });

    console.log(`[Background SW] Response from offscreen received:`, response ? (response.success ? "Success" : "Failed") : "null");

    if (!response || !response.success) {
      throw new Error(response?.error || 'Typst compilation inside offscreen document failed.');
    }

    return response.pdfData;
  } finally {
    console.log(`[Background SW] Keeping offscreen document alive to optimize subsequent compilations.`);
  }
}

