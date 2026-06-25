/**
 * Content Script for Codeforces pages.
 * Injects exporter buttons and parses problem details.
 */

(function() {
  'use strict';

  const IS_DEBUG = false; // Will be set to true by the build script for debug variants
  const debugLogs = [];
  const debugHtmlStore = [];
  const fetchCache = {};
  const imageCache = {};

  function logDebug(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    console.log(line);
    debugLogs.push(line);
  }

  async function cachedFetchText(url) {
    if (fetchCache[url]) {
      logDebug(`HTML Fetch Cache HIT: ${url}`);
      return fetchCache[url];
    }
    logDebug(`HTML Fetch Cache MISS: ${url}`);
    const res = await fetch(url);
    const txt = await res.text();
    fetchCache[url] = txt;
    if (IS_DEBUG) {
      debugHtmlStore.push({ url, html: txt });
    }
    return txt;
  }

  async function cachedFetchImage(url) {
    if (imageCache[url]) {
      logDebug(`Image Fetch Cache HIT: ${url}`);
      return imageCache[url].slice(0);
    }
    logDebug(`Image Fetch Cache MISS: ${url}`);
    const arrayBuffer = await fetchImageArrayBuffer(url);
    imageCache[url] = arrayBuffer;
    return arrayBuffer.slice(0);
  }

  // Ensure we are on a page containing contest/problem listings
  if (!document.querySelector('table.datatable') && !document.querySelector('table.problems')) return;

  // Locate insertion container
  const container = document.querySelector('div[style*="text-align: right"] a[href*="/problems"]')?.parentElement
    || document.querySelector('.second-level-menu ul')
    || document.body;

  if (!container) return;

  // Create UI Container
  const btnContainer = document.createElement(container.tagName === "UL" ? "li" : "span");
  btnContainer.className = "cf-pdf-btn-container";
  if (container.tagName === "UL") {
    btnContainer.style.display = "inline-block";
    btnContainer.style.marginLeft = "15px";
  } else {
    btnContainer.style.marginLeft = "15px";
  }

  // Create TYP button
  const downloadBtn = document.createElement('a');
  downloadBtn.className = "cf-pdf-btn cf-pdf-btn-typ";
  const downloadSpan = document.createElement('span');
  downloadSpan.textContent = '📥 Download .typ';
  downloadBtn.appendChild(downloadSpan);
  
  // Create PDF button
  const pdfBtn = document.createElement('a');
  pdfBtn.className = "cf-pdf-btn cf-pdf-btn-pdf";
  const pdfSpan = document.createElement('span');
  pdfSpan.textContent = '📄 Download PDF';
  pdfBtn.appendChild(pdfSpan);

  btnContainer.appendChild(downloadBtn);
  btnContainer.appendChild(pdfBtn);

  // Create Debug button if in debug mode
  let debugBtn = null;
  if (IS_DEBUG) {
    debugBtn = document.createElement('a');
    debugBtn.className = "cf-pdf-btn cf-pdf-btn-debug";
    const debugSpan = document.createElement('span');
    debugSpan.textContent = '🐛 Debug';
    debugBtn.appendChild(debugSpan);
    btnContainer.appendChild(debugBtn);
  }

  container.appendChild(btnContainer);

  // Setup click listeners
  downloadBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    await handleTypDownload(downloadBtn);
  });

  pdfBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    await handlePdfDownload(pdfBtn);
  });

  if (IS_DEBUG && debugBtn) {
    debugBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await handleDebugDownload(debugBtn);
    });
  }

  // State utility to manage button spinner/disabled status
  function setButtonState(btn, text, loading = false) {
    btn.textContent = '';
    if (loading) {
      btn.classList.add('disabled');
      const spinner = document.createElement('span');
      spinner.className = 'cf-pdf-spinner';
      const spanText = document.createElement('span');
      spanText.textContent = ` ${text}`;
      btn.appendChild(spinner);
      btn.appendChild(spanText);
    } else {
      btn.classList.remove('disabled');
      const isPdf = btn.classList.contains('cf-pdf-btn-pdf');
      const isDebug = btn.classList.contains('cf-pdf-btn-debug');
      const spanText = document.createElement('span');
      if (isPdf) {
        spanText.textContent = `📄 ${text}`;
      } else if (isDebug) {
        spanText.textContent = `🐛 ${text}`;
      } else {
        spanText.textContent = `📥 ${text}`;
      }
      btn.appendChild(spanText);
    }
  }

  async function handleTypDownload(btn) {
    const originalText = 'Download .typ';
    setButtonState(btn, 'Fetching...', true);

    try {
      const libContent = await fetchLibTypContent();
      const typstSource = await generateTypstSource(libContent, (progress) => {
        setButtonState(btn, progress, true);
      });

      if (!typstSource) {
        alert('No problems found or parsing failed.');
        setButtonState(btn, originalText, false);
        return;
      }

      const contestTitle = getContestTitle();
      const filename = `${contestTitle.replace(/[^a-zA-Z0-9]/g, '_')}.typ`;
      downloadFile(filename, typstSource, 'text/plain');
      setButtonState(btn, 'Downloaded!', false);


    } catch (err) {
      console.error(err);
      setButtonState(btn, 'Error!', false);
      alert('Typst source generation failed: ' + err.message);
    } finally {
      setTimeout(() => setButtonState(btn, originalText, false), 2000);
    }
  }

  async function handlePdfDownload(btn) {
    const originalText = 'Download PDF';
    setButtonState(btn, 'Fetching problems...', true);

    try {
      const libContent = await fetchLibTypContent();
      const { mainContent, images } = await generatePdfSource(libContent, (progress) => {
        setButtonState(btn, progress, true);
      });

      if (!mainContent) {
        alert('No problems found or parsing failed.');
        setButtonState(btn, originalText, false);
        return;
      }

      setButtonState(btn, 'Compiling PDF...', true);

      // Compile PDF via Background context (handles WASM and CORS)
      const response = await sendBackgroundMessage({
        type: 'COMPILE_PDF',
        mainContent,
        images
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Unknown compilation error');
      }

      // Convert response array back to Uint8Array
      const pdfBytes = new Uint8Array(response.pdfData);
      const contestTitle = getContestTitle();
      const filename = `${contestTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      
      downloadFile(filename, pdfBytes, 'application/pdf');
      setButtonState(btn, 'Downloaded!', false);


    } catch (err) {
      console.error(err);
      setButtonState(btn, 'Error!', false);
      alert('PDF generation failed: ' + err.message);
    } finally {
      setTimeout(() => setButtonState(btn, originalText, false), 3000);
    }
  }

  async function handleDebugDownload(btn) {
    const originalText = 'Debug';
    setButtonState(btn, 'Debugging...', true);

    debugLogs.length = 0;
    debugHtmlStore.length = 0;

    logDebug(`=== Codeforces to PDF Exporter Debug Log ===`);
    logDebug(`User Agent: ${navigator.userAgent}`);
    logDebug(`Timestamp: ${new Date().toISOString()}`);
    logDebug(`URL: ${window.location.href}`);

    try {
      logDebug(`Step 1: Fetching lib.typ content...`);
      const libContent = await fetchLibTypContent();
      logDebug(`Successfully loaded lib.typ (${libContent.length} chars)`);

      logDebug(`Step 2: Generating Typst markup (.typ)...`);
      const typstSource = await generateTypstSource(libContent, (progress) => {
        setButtonState(btn, `Typst: ${progress}`, true);
      });
      logDebug(`Generated Typst source markup successfully (${typstSource ? typstSource.length : 0} chars)`);

      logDebug(`Step 3: Generating PDF compilation source...`);
      const { mainContent, images } = await generatePdfSource(libContent, (progress) => {
        setButtonState(btn, `PDF Source: ${progress}`, true);
      });
      logDebug(`Generated PDF source markup successfully (${mainContent ? mainContent.length : 0} chars)`);
      logDebug(`Collected ${images.length} images for shadow filesystem mapping`);

      if (!mainContent) {
        throw new Error('No problems parsed. Verify page DOM selectors.');
      }

      logDebug(`Step 4: Compiling PDF via background...`);
      setButtonState(btn, 'Compiling...', true);
      const response = await sendBackgroundMessage({
        type: 'COMPILE_PDF',
        mainContent,
        images
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'WASM compilation failed in background context.');
      }
      
      const pdfBytes = new Uint8Array(response.pdfData);
      logDebug(`WASM compilation successful. PDF size: ${pdfBytes.length} bytes`);

      logDebug(`Step 5: Packaging debug ZIP archive...`);
      setButtonState(btn, 'Packaging...', true);
      const zip = new TinyZip();
      
      zip.addFile('contest.typ', typstSource || '');
      zip.addFile('contest.pdf', pdfBytes);
      
      debugHtmlStore.forEach((item, index) => {
        const problemCode = item.url.split('/').pop() || `problem_${index}`;
        zip.addFile(`problems/${problemCode}.html`, item.html);
      });

      logDebug(`Step 6: Writing debug.log and exporting ZIP...`);
      zip.addFile('debug.log', debugLogs.join('\n'));

      const zipBytes = zip.generate();
      logDebug(`ZIP archive generated successfully. Size: ${zipBytes.length} bytes`);

      const contestTitle = getContestTitle();
      const filename = `${contestTitle.replace(/[^a-zA-Z0-9]/g, '_')}_debug.zip`;
      downloadFile(filename, zipBytes, 'application/zip');
      
      setButtonState(btn, 'Completed!', false);
    } catch (err) {
      logDebug(`CRITICAL ERROR during debug export: ${err.message}\nStack: ${err.stack}`);
      try {
        const errorZip = new TinyZip();
        errorZip.addFile('debug.log', debugLogs.join('\n'));
        const errZipBytes = errorZip.generate();
        downloadFile('cf_exporter_debug_error_log.zip', errZipBytes, 'application/zip');
      } catch (zipErr) {
        console.error("Failed to export error log zip:", zipErr);
      }
      setButtonState(btn, 'Failed!', false);
      alert('Debug export failed. Check downloaded error log zip. Error: ' + err.message);
    } finally {
      setTimeout(() => setButtonState(btn, originalText, false), 3000);
    }
  }

  // Helper to send messages to background with debugging and custom timeout / errors
  async function sendBackgroundMessage(message) {
    if (typeof window !== 'undefined' && typeof window.sendBackgroundMessageMock === 'function') {
      return window.sendBackgroundMessageMock(message);
    }
    const api = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);
    if (!api || !api.runtime || !api.runtime.sendMessage) {
      throw new Error(`Browser extension API not available. Cannot route message: ${message.type}`);
    }
    console.log(`[CF Exporter] Sending message to background:`, message.type);
    try {
      const response = await api.runtime.sendMessage(message);
      console.log(`[CF Exporter] Received response for ${message.type}:`, response ? (response.success ? "Success" : "Failure") : "null");
      return response;
    } catch (err) {
      console.error(`[CF Exporter] Extension connection error on '${message.type}':`, err);
      throw new Error(`Background communication failed for ${message.type}: ${err.message}. Please check if the extension background service worker or page is running in extension settings.`);
    }
  }

  // Requests the background script to fetch lib.typ template contents
  async function fetchLibTypContent() {
    const response = await sendBackgroundMessage({ type: 'GET_LIB_TYP' });
    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to retrieve lib.typ template');
    }
    return response.content;
  }

  // Requests background to fetch images without CORS blocks
  async function fetchImageArrayBuffer(url) {
    const response = await sendBackgroundMessage({ type: 'FETCH_IMAGE', url });
    if (!response || !response.success) {
      throw new Error(response?.error || `Failed to fetch image: ${url}`);
    }
    // Return array bytes as an ArrayBuffer
    return new Uint8Array(response.data).buffer;
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function getProblemLinks() {
    const selectors = [
      'table.datatable tr td.id a',
      'table.datatable tr td.index a',
      'table.problems tr td.id a',
      'table.problems tr td.index a'
    ];
    const anchors = Array.from(document.querySelectorAll(selectors.join(',')));
    const seen = new Set(), links = [];
    anchors.forEach(a => {
      if (!seen.has(a.href) && a.href.includes('/problem/')) {
        seen.add(a.href);
        links.push(a.href);
      }
    });
    return links;
  }

  async function generateTypstSource(libContent, updateStatus) {
    logDebug(`generateTypstSource: Retrieving problem links...`);
    const links = getProblemLinks();
    if (!links.length) {
      logDebug(`ERROR: No problem links found on this page.`);
      return null;
    }
    logDebug(`Found ${links.length} problem links: ${links.join(', ')}`);

    const contestTitle = getContestTitle();
    const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    let typstSource = '\n' + libContent.trim() + '\n\n';
    typstSource += `#import "@preview/based:0.2.0": base64\n\n`;

    typstSource += `#show: contest-layout.with(\n`;
    typstSource += `  title: "${escapeString(contestTitle)}",\n`;
    typstSource += `  location: "Codeforces",\n`;
    typstSource += `  date: "${dateStr}"\n`;
    typstSource += `)\n\n`;

    for (const url of links) {
      logDebug(`generateTypstSource: Processing ${links.indexOf(url) + 1}/${links.length} (${url})...`);
      updateStatus(`Parsing ${links.indexOf(url) + 1}/${links.length}...`);
      const result = await fetchAndParseProblem(url, 'typst');
      if (result) {
        typstSource += result.source + "\n\n";
      }
    }

    logDebug(`generateTypstSource: Completed Typst markup generation.`);
    return typstSource;
  }

  async function generatePdfSource(libContent, updateStatus) {
    logDebug(`generatePdfSource: Retrieving problem links...`);
    const links = getProblemLinks();
    if (!links.length) {
      logDebug(`ERROR: No problem links found on this page.`);
      return { mainContent: null, images: [] };
    }
    logDebug(`Found ${links.length} problem links: ${links.join(', ')}`);

    const contestTitle = getContestTitle();
    const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    let mainContent = '\n' + libContent.trim() + '\n\n';
    mainContent += `#show: contest-layout.with(\n`;
    mainContent += `  title: "${escapeString(contestTitle)}",\n`;
    mainContent += `  location: "Codeforces",\n`;
    mainContent += `  date: "${dateStr}"\n`;
    mainContent += `)\n\n`;

    const allImages = [];
    const seenImagePaths = new Set();

    for (const url of links) {
      logDebug(`generatePdfSource: Processing ${links.indexOf(url) + 1}/${links.length} (${url})...`);
      updateStatus(`Parsing ${links.indexOf(url) + 1}/${links.length}...`);
      const result = await fetchAndParseProblem(url, 'pdf');
      if (result) {
        mainContent += result.source + "\n\n";
        for (const img of result.images) {
          if (!seenImagePaths.has(img.path)) {
            seenImagePaths.add(img.path);
            allImages.push({
              path: img.path,
              arrayBuffer: Array.from(new Uint8Array(img.arrayBuffer)) // Send as standard array for cloning
            });
          }
        }
      }
    }

    logDebug(`generatePdfSource: Completed PDF markup generation. Mapped ${allImages.length} unique images.`);
    return { mainContent, images: allImages };
  }

  async function fetchAndParseProblem(url, mode) {
    try {
      const txt = await cachedFetchText(url);
      const doc = new DOMParser().parseFromString(txt, 'text/html');
      const prob = doc.querySelector('.problem-statement');

      if (!prob) {
        logDebug(`WARNING: Element .problem-statement not found for ${url}`);
        return null;
      }

      logDebug(`Parsing problem statement for ${url}. Title: ${prob.querySelector('.header .title')?.textContent.trim() || 'Unknown'}`);

      const imgTags = Array.from(prob.querySelectorAll('img'));
      const imageList = [];
      let assetCounter = 0;

      await Promise.all(imgTags.map(async (img) => {
        let src = img.src;
        if (src.startsWith('//')) src = 'https:' + src;

        try {
          const arrayBuffer = await cachedFetchImage(src);
          const path = `/assets/img_${url.split('/').pop()}_${assetCounter++}.png`;
          
          let base64 = null;
          if (mode === 'typst') {
            base64 = arrayBufferToBase64(arrayBuffer);
          }
          
          imageList.push({ src: img.src, base64, arrayBuffer, path });
          img.setAttribute('data-target-path', path);
          logDebug(`Successfully fetched and mapped image: ${src} -> ${path} (${arrayBuffer.byteLength} bytes)`);
        } catch (e) {
          logDebug(`ERROR: Failed to fetch image: ${src}. Error: ${e.message}`);
          console.warn("Failed to fetch image:", src, e);
        }
      }));

      const header = prob.querySelector('.header');
      const title = header?.querySelector('.title')?.textContent.trim() || 'Unknown';
      const cleanTitle = title.replace(/^[A-Z]\d?\.?\s+/, "");

      const timeLimit = header?.querySelector('.time-limit')?.childNodes[1]?.textContent.trim() || 'N/A';
      const memoryLimit = header?.querySelector('.memory-limit')?.childNodes[1]?.textContent.trim() || 'N/A';
      const inputFile = header?.querySelector('.input-file')?.childNodes[1]?.textContent.trim() || 'standard input';
      const outputFile = header?.querySelector('.output-file')?.childNodes[1]?.textContent.trim() || 'standard output';

      let result = `#problem(\n`;
      result += `  title: "${escapeString(cleanTitle)}",\n`;
      result += `  input-file: "${escapeString(inputFile)}",\n`;
      result += `  output-file: "${escapeString(outputFile)}",\n`;
      result += `  time-limit: "${escapeString(timeLimit)}",\n`;
      result += `  memory-limit: "${escapeString(memoryLimit)}",\n`;
      result += `  balloon: none\n`;
      result += `)[\n`;

      const contentNodes = Array.from(prob.childNodes).filter(n =>
        n.className !== 'header' &&
        n.className !== 'input-specification' &&
        n.className !== 'output-specification' &&
        n.className !== 'sample-tests' &&
        n.className !== 'note'
      );

      result += convertNodesToTypst(contentNodes, imageList, mode) + `\n\n`;

      const inputSpec = prob.querySelector('.input-specification');
      if (inputSpec) {
        const titleNode = inputSpec.querySelector('.section-title');
        if (titleNode) titleNode.remove();
        result += `#input-spec[\n${convertNodesToTypst(inputSpec.childNodes, imageList, mode)}\n]\n`;
      }

      const outputSpec = prob.querySelector('.output-specification');
      if (outputSpec) {
        const titleNode = outputSpec.querySelector('.section-title');
        if (titleNode) titleNode.remove();
        result += `#output-spec[\n${convertNodesToTypst(outputSpec.childNodes, imageList, mode)}\n]\n`;
      }

      const inputs = prob.querySelectorAll('.sample-tests .input pre');
      const outputs = prob.querySelectorAll('.sample-tests .output pre');

      if (inputs.length > 0) {
        result += `#sample(\n`;
        const sampleArgs = [];
        for (let i = 0; i < inputs.length; i++) {
          const inText = extractSampleText(inputs[i]);
          const outText = extractSampleText(outputs[i]);
          sampleArgs.push(`  "${escapeString(inText)}", "${escapeString(outText)}"`);
        }
        result += sampleArgs.join(',\n') + `\n)\n`;
      }

      const note = prob.querySelector('.note');
      if (note) {
        const titleNode = note.querySelector('.section-title');
        if (titleNode) titleNode.remove();
        result += `#note[\n${convertNodesToTypst(note.childNodes, imageList, mode)}\n]\n`;
      }

      result += `]`;
      return { source: result, images: imageList };

    } catch (err) {
      console.error(err);
      return { source: `// Failed to load ${url}`, images: [] };
    }
  }

  function extractSampleText(preElement) {
    if (!preElement) return "";
    const clone = preElement.cloneNode(true);
    const brs = clone.querySelectorAll('br');
    brs.forEach(br => br.replaceWith('\n'));
    const divs = clone.querySelectorAll('div');
    divs.forEach(d => d.replaceWith(d.textContent + '\n'));

    return clone.textContent.trim();
  }

  function convertNodesToTypst(nodes, imageList, mode) {
    if (!nodes) return "";
    if (nodes instanceof NodeList || nodes instanceof HTMLCollection) nodes = Array.from(nodes);
    if (!Array.isArray(nodes)) nodes = [nodes];

    let out = "";

    nodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        out += parseTextWithMath(node.textContent);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName.toLowerCase();

        if (node.classList.contains('tex-span')) {
          const rawTex = node.textContent.replace(/^\$\$\$|^\$\$|^\$|\$\$\$|\$\$|\$$/g, '');
          out += `[#m("${escapeLatex(rawTex)}")]`;
          return;
        }
        if (node.classList.contains('tex-formula')) {
          const rawTex = node.textContent.replace(/^\$\$\$|^\$\$|^\$|\$\$\$|\$\$|\$$/g, '');
          out += `[#dm("${escapeLatex(rawTex)}")]`;
          return;
        }
        if (node.classList.contains('tt') || node.style.fontFamily === 'monospace') {
          out += `\`${node.textContent}\``;
          return;
        }

        switch (tag) {
          case 'p':
            out += convertNodesToTypst(node.childNodes, imageList, mode) + "\n\n";
            break;
          case 'b':
          case 'strong':
            out += ` *${convertNodesToTypst(node.childNodes, imageList, mode)}* `;
            break;
          case 'i':
          case 'em':
            out += ` _${convertNodesToTypst(node.childNodes, imageList, mode)}_ `;
            break;
          case 'ul':
            Array.from(node.children).forEach(li => {
              out += ` - ${convertNodesToTypst(li.childNodes, imageList, mode)}\n`;
            });
            out += "\n";
            break;
          case 'ol':
            Array.from(node.children).forEach((li, idx) => {
              out += ` + ${convertNodesToTypst(li.childNodes, imageList, mode)}\n`;
            });
            out += "\n";
            break;
          case 'pre':
            out += `\`\`\`\n${node.textContent}\n\`\`\`\n`;
            break;
          case 'br':
            out += `\n`;
            break;
          case 'div':
          case 'span':
          case 'center':
            out += convertNodesToTypst(node.childNodes, imageList, mode);
            break;
          case 'img':
            const targetPath = node.getAttribute('data-target-path');
            const imgData = imageList.find(img => img.src === node.src || img.path === targetPath);
            if (imgData) {
              if (mode === 'pdf') {
                out += `\n#align(center)[#image("${imgData.path}", width: 80%)]\n`;
              } else {
                out += `\n#align(center)[#image(base64.decode("${imgData.base64}"), width: 80%)]\n`;
              }
            } else {
              out += `\n// [IMAGE MISSING: ${node.src}]\n`;
            }
            break;
          default:
            out += convertNodesToTypst(node.childNodes, imageList, mode);
        }
      }
    });
    return out;
  }

  function parseTextWithMath(text) {
    if (!text) return "";
    let lastIndex = 0;
    let result = "";
    let match;

    // Use regular expression to isolate and replace math tags (matching 6-dollar display math and 3-dollar inline math)
    const cfMathRegex = /\$\$\$\$\$\$(.*?)\$\$\$\$\$\$|\$\$\$(.*?)\$\$\$/gs;
    while ((match = cfMathRegex.exec(text)) !== null) {
      const plainText = text.substring(lastIndex, match.index);
      result += escapeMarkup(plainText);
      const latex = match[1] !== undefined ? match[1] : match[2];
      if (match[1] !== undefined || latex.includes('\\\\')) {
        result += `[#dm("${escapeLatex(latex)}")]`;
      } else {
        result += `[#m("${escapeLatex(latex)}")]`;
      }
      lastIndex = cfMathRegex.lastIndex;
    }
    result += escapeMarkup(text.substring(lastIndex));
    return result;
  }

  function escapeString(str) {
    if (!str) return "";
    return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/#/g, "\\#");
  }

  function escapeMarkup(str) {
    if (!str) return "";
    return str
      .replace(/\\/g, "\\\\")
      .replace(/[*_$[\]#`@<>=\/]/g, "\\$&");
  }

  function escapeLatex(str) {
    if (!str) return "";
    return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function getContestTitle() {
    return document.querySelector('.contest-name a')?.textContent.trim() || document.title || "Codeforces Contest";
  }

  function downloadFile(filename, content, mimeType) {
    const blob = content instanceof Uint8Array ? new Blob([content], { type: mimeType }) : new Blob([content], { type: mimeType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }
  // CRC-32 checksum calculator
  function crc32(data) {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
    let crc = 0 ^ (-1);
    for (let i = 0; i < data.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
  }

  // Tiny store-only ZIP writer (no compression, method 0)
  class TinyZip {
    constructor() {
      this.files = [];
    }
    
    addFile(name, content) {
      const encoder = new TextEncoder();
      const data = typeof content === 'string' ? encoder.encode(content) : new Uint8Array(content);
      this.files.push({ name, data });
    }
    
    generate() {
      let offset = 0;
      const encoder = new TextEncoder();
      const preparedFiles = this.files.map(f => {
        const nameBuf = encoder.encode(f.name);
        const crc = crc32(f.data);
        return {
          name: f.name,
          nameBuf,
          data: f.data,
          crc,
          size: f.data.length
        };
      });
      
      preparedFiles.forEach(f => {
        f.offset = offset;
        offset += 30 + f.nameBuf.length + f.size;
      });
      
      const localHeadersSize = offset;
      let centralDirectorySize = 0;
      preparedFiles.forEach(f => {
        centralDirectorySize += 46 + f.nameBuf.length;
      });
      
      const totalSize = localHeadersSize + centralDirectorySize + 22;
      const out = new Uint8Array(totalSize);
      const view = new DataView(out.buffer);
      
      let pos = 0;
      
      // Write Local Headers and File Data
      preparedFiles.forEach(f => {
        view.setUint32(pos, 0x04034b50, true); pos += 4; // Local header signature
        view.setUint16(pos, 10, true); pos += 2;          // Version needed
        view.setUint16(pos, 0, true); pos += 2;           // General flags
        view.setUint16(pos, 0, true); pos += 2;           // Store method (0)
        view.setUint16(pos, 0, true); pos += 2;           // Mod time
        view.setUint16(pos, 0, true); pos += 2;           // Mod date
        view.setUint32(pos, f.crc, true); pos += 4;       // CRC32
        view.setUint32(pos, f.size, true); pos += 4;      // Compressed size
        view.setUint32(pos, f.size, true); pos += 4;      // Uncompressed size
        view.setUint16(pos, f.nameBuf.length, true); pos += 2; // Filename length
        view.setUint16(pos, 0, true); pos += 2;           // Extra field length
        
        out.set(f.nameBuf, pos); pos += f.nameBuf.length;
        out.set(f.data, pos); pos += f.size;
      });
      
      // Write Central Directory Headers
      const cdOffset = pos;
      preparedFiles.forEach(f => {
        view.setUint32(pos, 0x02014b50, true); pos += 4; // Central directory signature
        view.setUint16(pos, 20, true); pos += 2;          // Made by (2.0)
        view.setUint16(pos, 10, true); pos += 2;          // Version needed (1.0)
        view.setUint16(pos, 0, true); pos += 2;           // Flags
        view.setUint16(pos, 0, true); pos += 2;           // Method
        view.setUint16(pos, 0, true); pos += 2;           // Mod time
        view.setUint16(pos, 0, true); pos += 2;           // Mod date
        view.setUint32(pos, f.crc, true); pos += 4;       // CRC32
        view.setUint32(pos, f.size, true); pos += 4;      // Compressed size
        view.setUint32(pos, f.size, true); pos += 4;      // Uncompressed size
        view.setUint16(pos, f.nameBuf.length, true); pos += 2; // Filename length
        view.setUint16(pos, 0, true); pos += 2;           // Extra field length
        view.setUint16(pos, 0, true); pos += 2;           // File comment length
        view.setUint16(pos, 0, true); pos += 2;           // Disk start
        view.setUint16(pos, 0, true); pos += 2;           // Internal attrs
        view.setUint32(pos, 0, true); pos += 4;           // External attrs
        view.setUint32(pos, f.offset, true); pos += 4;    // Offset of local header
        
        out.set(f.nameBuf, pos); pos += f.nameBuf.length;
      });
      
      // Write End of Central Directory
      view.setUint32(pos, 0x06054b50, true); pos += 4; // EOCD signature
      view.setUint16(pos, 0, true); pos += 2;          // Disk number
      view.setUint16(pos, 0, true); pos += 2;          // CD disk start
      view.setUint16(pos, preparedFiles.length, true); pos += 2; // CD disk records
      view.setUint16(pos, preparedFiles.length, true); pos += 2; // CD total records
      view.setUint32(pos, cdOffset - localHeadersSize, true); pos += 4; // CD size
      view.setUint32(pos, localHeadersSize, true); pos += 4; // CD offset
      view.setUint16(pos, 0, true); pos += 2;          // Comment length
      
      return out;
    }
  }
})();
