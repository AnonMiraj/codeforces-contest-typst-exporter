// ==UserScript==
// @name         Codeforces: Export All Problems to Typst (Matches New Lib)
// @namespace    https://github.com/AnonMiraj
// @author       ezzeldin
// @license      GPL3
// @description  Export Codeforces problems to Typst and compile to PDF locally.
// @match        https://codeforces.com/group/*/contest/*
// @match        https://codeforces.com/gym/*
// @match        https://codeforces.com/contest/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *
// @esversion    11
// @version      5.1
// ==/UserScript==

(function() {
  'use strict';

  // Inject shared styling
  const style = document.createElement('style');
  style.textContent = `__CSS_CONTENT__`;
  document.head.appendChild(style);

  // Helper to fetch images via cross-origin GM_xmlhttpRequest
  async function fetchImageArrayBuffer(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: url,
        responseType: "arraybuffer",
        onload: (response) => {
          if (response.status !== 200) {
            reject(new Error(`Failed to fetch image: HTTP ${response.status}`));
            return;
          }
          resolve(response.response);
        },
        onerror: (err) => reject(err)
      });
    });
  }

  // Promise-cache for the compiler script loading
  let typstTsPromise = null;

  // Load the lightweight 212KB typst-all-in-one script
  async function loadTypstTs() {
    const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    if (win.$typst) return win.$typst;
    if (typstTsPromise) return typstTsPromise;

    typstTsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/gh/AnonMiraj/codeforces-contest-typst-exporter@main/src/vendor/typst-all-in-one.js';
      script.id = 'typst';
      script.onload = () => {
        const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        if (!w.$typst) {
          reject(new Error('Typst compiler failed to initialize'));
          return;
        }
        resolve(w.$typst);
      };
      script.onerror = () => {
        typstTsPromise = null;
        reject(new Error('Failed to load Typst compiler from CDN'));
      };
      document.head.appendChild(script);
    });

    return typstTsPromise;
  }

  // Compile PDF locally in the page context
  async function compilePdfDirectly(mainContent, images) {
    const $typst = await loadTypstTs();
    try {
      $typst.resetShadow();
    } catch (e) {
      console.warn("resetShadow failed, continuing:", e);
    }

    // Map each image into the virtual filesystem
    for (const img of images) {
      const data = new Uint8Array(img.arrayBuffer);
      console.log(`[Userscript] Mapping shadow file: ${img.path} (${data.byteLength} bytes)`);
      $typst.mapShadow(img.path, data);
    }

    console.log("[Userscript] Starting Typst compilation in page context...");
    const pdfBytes = await $typst.pdf({ mainContent });
    if (!pdfBytes || pdfBytes.byteLength === 0) {
      throw new Error("Generated PDF bytes are empty");
    }
    return pdfBytes;
  }

  // Mock message router to bridge content.js logic directly to the page context
  async function sendBackgroundMessage(message) {
    console.log(`[Userscript Router] Routing message: ${message.type}`);
    
    if (message.type === 'GET_LIB_TYP') {
      return { success: true, content: `__LIB_TYP_CONTENT__` };
    }
    
    if (message.type === 'FETCH_IMAGE') {
      try {
        const arrayBuffer = await fetchImageArrayBuffer(message.url);
        return { success: true, data: Array.from(new Uint8Array(arrayBuffer)) };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
    

    
    if (message.type === 'COMPILE_PDF') {
      try {
        const pdfBytes = await compilePdfDirectly(message.mainContent, message.images);
        return { success: true, pdfData: Array.from(pdfBytes) };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
    
    return { success: false, error: `Unsupported message type: ${message.type}` };
  }

  // Expose mock sendBackgroundMessage so child IIFE scope can resolve it
  window.sendBackgroundMessageMock = sendBackgroundMessage;

  // __CONTENT_JS__
})();
