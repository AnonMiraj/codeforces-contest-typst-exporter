/**
 * Offscreen DOM script for Chrome.
 * Registers compilation message receiver and compiles Typst markup.
 */

import { compilePdf } from './compiler.js';

console.log("[Offscreen] Page loaded. Starting initialization...");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only handle messages destined for the offscreen context
  if (message.target !== 'offscreen' || message.type !== 'COMPILE_PDF_INTERNAL') {
    return false;
  }

  console.log(`[Offscreen] Received COMPILE_PDF_INTERNAL message. Main content size: ${message.mainContent.length} characters, Images count: ${message.images ? message.images.length : 0}`);
  
  compilePdf(message.mainContent, message.images)
    .then(pdfBytes => {
      console.log(`[Offscreen] PDF generated successfully. Bytes: ${pdfBytes.byteLength}`);
      // Serialize Uint8Array to normal array for cloning across contexts
      const pdfData = Array.from(pdfBytes);
      sendResponse({ success: true, pdfData });
    })
    .catch(err => {
      console.error("[Offscreen] Compilation failed:", err);
      sendResponse({ success: false, error: err.message });
    });

  return true; // Keep connection open for async response
});

console.log("[Offscreen] Setup completed. Dispatching OFFSCREEN_READY handshake signal to background service worker...");
chrome.runtime.sendMessage({ type: 'OFFSCREEN_READY' })
  .then(() => {
    console.log("[Offscreen] OFFSCREEN_READY handshake sent successfully.");
  })
  .catch(err => {
    console.error("[Offscreen] Critical error: failed to send OFFSCREEN_READY handshake to background:", err);
  });
