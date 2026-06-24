/**
 * Content Script for Codeforces pages.
 * Injects exporter buttons and parses problem details.
 */

(function() {
  'use strict';

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
  downloadBtn.innerHTML = '<span>📥 Download .typ</span>';
  
  // Create PDF button
  const pdfBtn = document.createElement('a');
  pdfBtn.className = "cf-pdf-btn cf-pdf-btn-pdf";
  pdfBtn.innerHTML = '<span>📄 Download PDF</span>';

  btnContainer.appendChild(downloadBtn);
  btnContainer.appendChild(pdfBtn);
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

  // State utility to manage button spinner/disabled status
  function setButtonState(btn, text, loading = false) {
    if (loading) {
      btn.classList.add('disabled');
      btn.innerHTML = `<span class="cf-pdf-spinner"></span> <span>${text}</span>`;
    } else {
      btn.classList.remove('disabled');
      const isPdf = btn.classList.contains('cf-pdf-btn-pdf');
      btn.innerHTML = isPdf ? `<span>📄 ${text}</span>` : `<span>📥 ${text}</span>`;
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
    const links = getProblemLinks();
    if (!links.length) return null;

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
      updateStatus(`Parsing ${links.indexOf(url) + 1}/${links.length}...`);
      const result = await fetchAndParseProblem(url, 'typst');
      if (result) {
        typstSource += result.source + "\n\n";
      }
    }

    return typstSource;
  }

  async function generatePdfSource(libContent, updateStatus) {
    const links = getProblemLinks();
    if (!links.length) return { mainContent: null, images: [] };

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

    return { mainContent, images: allImages };
  }

  async function fetchAndParseProblem(url, mode) {
    try {
      const res = await fetch(url);
      const txt = await res.text();
      const doc = new DOMParser().parseFromString(txt, 'text/html');
      const prob = doc.querySelector('.problem-statement');

      if (!prob) return null;

      const imgTags = Array.from(prob.querySelectorAll('img'));
      const imageList = [];
      let assetCounter = 0;

      await Promise.all(imgTags.map(async (img) => {
        let src = img.src;
        if (src.startsWith('//')) src = 'https:' + src;

        try {
          const arrayBuffer = await fetchImageArrayBuffer(src);
          const path = `/assets/img_${url.split('/').pop()}_${assetCounter++}.png`;
          
          let base64 = null;
          if (mode === 'typst') {
            base64 = arrayBufferToBase64(arrayBuffer);
          }
          
          imageList.push({ src: img.src, base64, arrayBuffer, path });
          // Update the DOM node's src so that we can find it in mapping
          img.setAttribute('data-target-path', path);
        } catch (e) {
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
})();
