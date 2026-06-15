
// @name         Codeforces: Export All Problems to Typst (Matches New Lib)
// @namespace    https://github.com/AnonMiraj
// @author       ezzeldin
// @license      GPL3
// @description  Export Codeforces problems to Typst.
// @match        https://codeforces.com/group/*/contest/*
// @match        https://codeforces.com/gym/*
// @match        https://codeforces.com/contest/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *
// @esversion    11
// @version      5.0
// ==/UserScript==

(function() {
  'use strict';

  if (!document.querySelector('table.datatable') && !document.querySelector('table.problems')) return;

  const container = document.querySelector('div[style*="text-align: right"] a[href*="/problems"]')?.parentElement
    || document.querySelector('.second-level-menu ul')
    || document.body;

  if (!container) return;

  const LIB_TYP_URL = 'https://github.com/AnonMiraj/codeforces-contest-typst-exporter/raw/refs/heads/main/lib.typ';
  let cachedLibTyp = null;

  const btnContainer = document.createElement(container.tagName === "UL" ? "li" : "span");
  btnContainer.style.marginLeft = "15px";

  const downloadBtn = document.createElement('a');
  downloadBtn.textContent = '📥 Download .typ';
  downloadBtn.style.cssText = 'color: #d35400; text-decoration: none; cursor: pointer; font-weight: bold; margin-right: 10px;';

  const pdfBtn = document.createElement('a');
  pdfBtn.textContent = '📄 Download PDF';
  pdfBtn.style.cssText = 'color: #1a5276; text-decoration: none; cursor: pointer; font-weight: bold;';

  btnContainer.appendChild(downloadBtn);
  btnContainer.appendChild(pdfBtn);
  container.appendChild(btnContainer);

  downloadBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    await handleTypDownload(downloadBtn);
  });

  pdfBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    await handlePdfDownload(pdfBtn);
  });

  async function fetchLibTyp() {
    if (cachedLibTyp) return cachedLibTyp;
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: LIB_TYP_URL,
        responseType: "text",
        onload: (response) => {
          if (response.status !== 200) {
            reject(new Error(`Failed to fetch lib.typ (HTTP ${response.status})`));
            return;
          }
          cachedLibTyp = response.responseText;
          resolve(cachedLibTyp);
        },
        onerror: () => reject(new Error('Failed to fetch lib.typ'))
      });
    });
  }

  async function fetchImageArrayBuffer(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: url,
        responseType: "arraybuffer",
        onload: (response) => {
          if (response.status !== 200) {
            reject(new Error(`HTTP error ${response.status}`));
            return;
          }
          resolve(response.response);
        },
        onerror: (err) => reject(err)
      });
    });
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  async function step(name, fn) {
    try {
      return await fn();
    } catch (err) {
      const wrapped = err instanceof Error ? err : new Error(String(err));
      wrapped.step = name;
      throw wrapped;
    }
  }

  async function handleTypDownload(btn) {
    const originalText = btn.textContent;
    btn.style.pointerEvents = 'none';
    btn.textContent = 'Fetching...';

    try {
      const typstSource = await generateTypstSource((progress) => {
        btn.textContent = progress;
      });

      if (!typstSource) {
        alert('No problems found or generation failed.');
        resetBtn();
        return;
      }

      const contestTitle = getContestTitle();
      downloadFile(`${contestTitle.replace(/[^a-zA-Z0-9]/g, '_')}.typ`, typstSource);
      btn.textContent = 'Downloaded!';
    } catch (err) {
      console.error(err);
      btn.textContent = 'Error!';
    } finally {
      setTimeout(resetBtn, 2000);
    }

    function resetBtn() {
      btn.textContent = originalText;
      btn.style.pointerEvents = '';
    }
  }

  async function handlePdfDownload(btn) {
    const originalText = btn.textContent;
    btn.style.pointerEvents = 'none';

    try {
      const contestTitle = getContestTitle();

      btn.textContent = 'Fetching problems...';
      const { mainContent, images } = await step('generatePdfSource', () =>
        generatePdfSource((progress) => { btn.textContent = progress; })
      );
      if (!mainContent) {
        alert('No problems found or generation failed.');
        btn.textContent = originalText;
        btn.style.pointerEvents = '';
        return;
      }

      btn.textContent = 'Loading compiler (first time only)...';
      const $typst = await step('loadTypstTs', loadTypstTs);

      btn.textContent = 'Rendering PDF...';

      for (const [, imgData] of images) {
        await step('mapShadow', () => $typst.mapShadow(imgData.path, new Uint8Array(imgData.arrayBuffer)));
      }

      const pdfData = await step('typst.pdf', () => $typst.pdf({ mainContent }));
      const blob = new Blob([pdfData], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${contestTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      btn.textContent = 'Downloaded!';
    } catch (err) {
      console.error(err);
      btn.textContent = 'Error!';
      alert('PDF generation failed at "' + err.step + '": ' + err.message);
    } finally {
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.pointerEvents = '';
      }, 3000);
    }
  }

  let typstTsPromise = null;

  async function loadTypstTs() {
    const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    if (win.$typst) return win.$typst;
    if (typstTsPromise) return typstTsPromise;

    typstTsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = 'https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-all-in-one.ts@0.7.0/dist/esm/index.js';
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

  async function generateTypstSource(updateStatus) {
    const links = getProblemLinks();
    if (!links.length) return null;

    const contestTitle = getContestTitle();
    const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    const libContent = await fetchLibTyp();
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

  async function generatePdfSource(updateStatus) {
    const links = getProblemLinks();
    if (!links.length) return { mainContent: null, images: new Map() };

    const contestTitle = getContestTitle();
    const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    const libTypContent = await fetchLibTyp();
    let mainContent = '\n' + libTypContent.trim() + '\n\n';
    mainContent += `#show: contest-layout.with(\n`;
    mainContent += `  title: "${escapeString(contestTitle)}",\n`;
    mainContent += `  location: "Codeforces",\n`;
    mainContent += `  date: "${dateStr}"\n`;
    mainContent += `)\n\n`;

    const allImages = new Map();

    for (const url of links) {
      updateStatus(`Parsing ${links.indexOf(url) + 1}/${links.length}...`);
      const result = await fetchAndParseProblem(url, 'pdf');
      if (result) {
        mainContent += result.source + "\n\n";
        for (const [imgUrl, imgData] of result.images) {
          allImages.set(imgUrl, imgData);
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
      const imageMap = new Map();
      let assetCounter = 0;

      await Promise.all(imgTags.map(async (img) => {
        let src = img.src;
        if (src.startsWith('//')) src = 'https:' + src;

        try {
          const arrayBuffer = await fetchImageArrayBuffer(src);
          const base64 = arrayBufferToBase64(arrayBuffer);
          const path = `/assets/img_${assetCounter++}.png`;
          imageMap.set(img.src, { base64, arrayBuffer, path });
        } catch (e) {
          console.warn("Failed to fetch image:", src, e);
        }
      }));

      const header = doc.querySelector('.header');
      const title = header.querySelector('.title')?.textContent.trim() || 'Unknown';
      const cleanTitle = title.replace(/^[A-Z]\d?\.?\s+/, "");

      const timeLimit = header.querySelector('.time-limit')?.childNodes[1]?.textContent.trim() || 'N/A';
      const memoryLimit = header.querySelector('.memory-limit')?.childNodes[1]?.textContent.trim() || 'N/A';
      const inputFile = header.querySelector('.input-file')?.childNodes[1]?.textContent.trim() || 'standard input';
      const outputFile = header.querySelector('.output-file')?.childNodes[1]?.textContent.trim() || 'standard output';

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

      result += convertNodesToTypst(contentNodes, imageMap, mode) + `\n\n`;

      const inputSpec = prob.querySelector('.input-specification');
      if (inputSpec) {
        const titleNode = inputSpec.querySelector('.section-title');
        if (titleNode) titleNode.remove();
        result += `#input-spec[\n${convertNodesToTypst(inputSpec.childNodes, imageMap, mode)}\n]\n`;
      }

      const outputSpec = prob.querySelector('.output-specification');
      if (outputSpec) {
        const titleNode = outputSpec.querySelector('.section-title');
        if (titleNode) titleNode.remove();
        result += `#output-spec[\n${convertNodesToTypst(outputSpec.childNodes, imageMap, mode)}\n]\n`;
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
        result += `#note[\n${convertNodesToTypst(note.childNodes, imageMap, mode)}\n]\n`;
      }

      result += `]`;
      return { source: result, images: imageMap };

    } catch (err) {
      console.error(err);
      return { source: `// Failed to load ${url}`, images: new Map() };
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

  function convertNodesToTypst(nodes, imageMap, mode) {
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
            out += convertNodesToTypst(node.childNodes, imageMap, mode) + "\n\n";
            break;
          case 'b':
          case 'strong':
            out += ` *${convertNodesToTypst(node.childNodes, imageMap, mode)}* `;
            break;
          case 'i':
          case 'em':
            out += ` _${convertNodesToTypst(node.childNodes, imageMap, mode)}_ `;
            break;
          case 'ul':
            Array.from(node.children).forEach(li => {
              out += ` - ${convertNodesToTypst(li.childNodes, imageMap, mode)}\n`;
            });
            out += "\n";
            break;
          case 'ol':
            Array.from(node.children).forEach((li, idx) => {
              out += ` + ${convertNodesToTypst(li.childNodes, imageMap, mode)}\n`;
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
            out += convertNodesToTypst(node.childNodes, imageMap, mode);
            break;
          case 'img':
            const imgData = imageMap.get(node.src);
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
            out += convertNodesToTypst(node.childNodes, imageMap, mode);
        }
      }
    });
    return out;
  }

  function parseTextWithMath(text) {
    if (!text) return "";
    const regex = /\$\$\$(.*?)\$\$\$|\$\$(.*?)\$\$/gs;
    let lastIndex = 0;
    let result = "";
    let match;

    while ((match = regex.exec(text)) !== null) {
      const plainText = text.substring(lastIndex, match.index);
      result += escapeMarkup(plainText);
      const latex = match[1] || match[2];
      if (latex.includes('\\\\') || latex.length > 50) {
        result += `[#dm("${escapeLatex(latex)}")]`;
      } else {
        result += `[#m("${escapeLatex(latex)}")]`;
      }
      lastIndex = regex.lastIndex;
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

  function downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
})();
