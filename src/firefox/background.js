/**
 * Background script for Firefox.
 * Runs inside the browser-generated event page.
 */

// Import the locally bundled Typst library first to register window.$typst
import './vendor/typst-all-in-one.js';
import { compilePdf } from './compiler.js';

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_LIB_TYP') {
    fetch(browser.runtime.getURL('lib.typ'))
      .then(res => res.text())
      .then(content => sendResponse({ success: true, content }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async
  }

  if (message.type === 'FETCH_IMAGE') {
    fetch(message.url)
      .then(res => res.arrayBuffer())
      .then(buffer => {
        // Send array buffer bytes directly
        sendResponse({ success: true, data: Array.from(new Uint8Array(buffer)) });
      })
      .catch(err => {
        console.warn(`Background image fetch failed for ${message.url}:`, err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (message.type === 'COMPILE_PDF') {
    console.log("Firefox background received compile request.");
    compilePdf(message.mainContent, message.images)
      .then(pdfBytes => {
        const pdfData = Array.from(pdfBytes);
        sendResponse({ success: true, pdfData });
      })
      .catch(err => {
        console.error("Firefox background compilation failed:", err);
        sendResponse({ success: false, error: err?.message || String(err) });
      });
    return true;
  }
});

