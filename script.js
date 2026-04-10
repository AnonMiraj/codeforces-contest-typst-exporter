// ==UserScript==
// @name         Codeforces: Export All Problems to Typst (Matches New Lib)
// @namespace    https://github.com/AnonMiraj
// @author       ezzeldin
// @license      GPL3
// @description  Export Codeforces problems to Typst.
// @match        https://codeforces.com/group/*/contest/*
// @match        https://codeforces.com/gym/*
// @match        https://codeforces.com/contest/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @connect      *
// @esversion    11
// @version      4.0
// ==/UserScript==

(function() {
  'use strict';

  if (!document.querySelector('table.datatable') && !document.querySelector('table.problems')) return;

  const container = document.querySelector('div[style*="text-align: right"] a[href*="/problems"]')?.parentElement
    || document.querySelector('.second-level-menu ul')
    || document.body;

  if (!container) return;

  const btnContainer = document.createElement(container.tagName === "UL" ? "li" : "span");
  btnContainer.style.marginLeft = "15px";

  const downloadBtn = document.createElement('a');
  downloadBtn.textContent = '📥 Download .typ';
  downloadBtn.style.cssText = 'color: #d35400; text-decoration: none; cursor: pointer; font-weight: bold; margin-right: 10px;';

  const copyBtn = document.createElement('a');
  copyBtn.textContent = '📋 Copy to Clipboard';
  copyBtn.style.cssText = 'color: #27ae60; text-decoration: none; cursor: pointer; font-weight: bold;';

  btnContainer.appendChild(downloadBtn);
  btnContainer.appendChild(copyBtn);
  container.appendChild(btnContainer);

  downloadBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    await handleAction('download', downloadBtn, copyBtn);
  });

  copyBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    await handleAction('copy', downloadBtn, copyBtn);
  });

  async function handleAction(action, btnPrimary, btnSecondary) {
    const originalText = btnPrimary.textContent;
    const originalSecondaryText = btnSecondary.textContent;

    btnPrimary.style.pointerEvents = 'none';
    btnSecondary.style.pointerEvents = 'none';
    btnPrimary.textContent = 'Fetching...';

    try {
      const typstSource = await generateTypstSource((progress) => {
        btnPrimary.textContent = progress;
      });

      if (!typstSource) {
        alert('No problems found or generation failed.');
        resetUI();
        return;
      }

      if (action === 'download') {
        const contestTitle = getContestTitle();
        downloadFile(`${contestTitle.replace(/[^a-zA-Z0-9]/g, '_')}.typ`, typstSource);
        btnPrimary.textContent = 'Downloaded!';
      } else {
        copyToClipboard(typstSource);
        btnSecondary.textContent = 'Copied!';
      }
    } catch (err) {
      console.error(err);
      btnPrimary.textContent = 'Error!';
    } finally {
      setTimeout(resetUI, 2000);
    }

    function resetUI() {
      btnPrimary.textContent = originalText;
      btnSecondary.textContent = originalSecondaryText;
      btnPrimary.style.pointerEvents = '';
      btnSecondary.style.pointerEvents = '';
    }
  }

  async function generateTypstSource(updateStatus) {
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

    if (!links.length) return null;

    const contestTitle = getContestTitle();
    const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    let typstSource = `\n#import "@preview/mitex:0.2.5": *

#let problem-counter = counter("problem")

#let m(str) = mi(str)
#let dm(str) = mitex("$$" + str + "$$")

#let get-balloon-color(index) = {
  let colors = (
    "Silver",      // A
    "Red",         // B
    "Pink",        // C
    "Green",       // D
    "Purple",      // E
    "Yellow",      // F
    "Black",       // G
    "White",       // H
    "Orange",      // I
    "Lime Green",  // J
    "Blue",        // K
    "Gold",        // L
    "Light Blue",  // M
    "Black",       // N
    "White"        // O
  )
  if index < colors.len() {
    colors.at(index)
  } else {
    "Unknown"
  }
}

#let contest-layout(
  title: "Olympiad in Informatics",
  location: "Somewhere",
  date: "Once upon a time",
  body
) = {
  problem-counter.update(0)

  set text(font: "New Computer Modern", size: 11pt, lang: "en")
  set par(justify: true, leading: 0.65em, first-line-indent: 0pt, spacing: 1em)
  
  set list(indent: 1.5em, marker: ([•], [--]))
  set enum(indent: 1.5em)

  set page(
    paper: "a4",
    margin: (top: 2cm, bottom: 2cm, x: 2cm), 
    
    header: context {
      set text(font: "New Computer Modern", size: 10pt)
      set align(center)
      stack(
        dir: ttb,
        spacing: 0.5em,
        block[#title \\ #location, #date],
        line(length: 100%, stroke: 0.5pt)
      )
    },

    footer: context {
      line(length: 100%, stroke: 0.5pt)
      set align(center)
      set text(font: "New Computer Modern", size: 10pt)
      let page-num = counter(page).get().first()
      let total-pages = counter(page).final().first()
      [Page #page-num of #total-pages]
    }
  )

  body
}

#let problem(
  title: "",
  input-file: "standard input",
  output-file: "standard output",
  time-limit: "1 second",      
  memory-limit: "256 megabytes", 
  balloon: auto,
  points: none,
  body
) = {
  pagebreak(weak: true)
  
  problem-counter.step()
  
  context {
    let p-index = problem-counter.get().first() - 1
    let p-letter = problem-counter.display("A")

    set text(font: "New Computer Modern", weight: "bold", size: 16pt)
    
    block(below: 1em)[
      Problem #p-letter. #title
    ]

    let meta-text(content) = text(font: "New Computer Modern", size: 10pt, content)
    let meta-label(content) = text(font: "New Computer Modern", size: 10pt, content)

    let row(label, value) = (
      meta-label(label), 
      meta-text(value)
    )

    let cells = ()
    
    if input-file != none {
      cells += row("Input file:", input-file)
    }
    if output-file != none {
      cells += row("Output file:", output-file)
    }
    if time-limit != none {
      cells += row("Time limit:", time-limit)
    }
    if memory-limit != none {
      cells += row("Memory limit:", memory-limit)
    }

    let display-balloon = if balloon == auto {
      get-balloon-color(p-index)
    } else {
      balloon
    }

    if display-balloon != none {
      cells += row("Balloon Color:", display-balloon)
    }
    
    if points != none {
      cells += row("Points:", str(points))
    }

    pad(bottom: 0.5em)[
      #grid(
        columns: (auto, auto),
        column-gutter: 1.5em, 
        row-gutter: 0.2em,
        ..cells
      )
    ]
  }

  body
}

#let section-header(title) = {
  v(0.5em)
  block(below: 0.5em)[
    #text(font: "New Computer Modern", weight: "bold", size: 12pt, title)
  ]
}

#let input-spec(body) = { section-header("Input") + body }
#let output-spec(body) = { section-header("Output") + body }
#let note(body) = { section-header("Note") + body }
#let scoring(body) = { section-header("Scoring") + body }
#let interaction(body) = { section-header("Interaction") + body }

#let sample(..args) = {
  v(0.5em)
  section-header("Example" + if args.pos().len() > 2 { "s" } else { "" })
  
  let header-cell(content) = block(
    width: 100%, 
    inset: 6pt, 
    stroke: (bottom: 0.5pt + black),
    fill: none,
    align(center, text(font: "New Computer Modern", weight: "bold", size: 10pt, content))
  )

  let content-cell(content) = block(
    width: 100%, 
    inset: 6pt,
    text(font: "DejaVu Sans Mono", size: 10pt, raw(block: true, content)) 
  )

  let cells = (header-cell("standard input"), header-cell("standard output"))
  let data = args.pos()
  
  for i in range(0, data.len(), step: 2) {
    let in-str = data.at(i)
    let out-str = if i + 1 < data.len() { data.at(i + 1) } else { "" }
    
    cells.push(content-cell(in-str))
    cells.push(content-cell(out-str))
  }

  block(breakable: false, width: 100%)[
    #table(
      columns: (1fr, 1fr),
      inset: 0pt,
      stroke: 0.5pt + black,
      align: left,
      ..cells
    )
  ]
}
\n\n`;
    typstSource += `#import "@preview/based:0.2.0": base64\n\n`;

    typstSource += `#show: contest-layout.with(\n`;
    typstSource += `  title: "${escapeString(contestTitle)}",\n`;
    typstSource += `  location: "Codeforces",\n`;
    typstSource += `  date: "${dateStr}"\n`;
    typstSource += `)\n\n`;

    for (const url of links) {
      updateStatus(`Parsing ${links.indexOf(url) + 1}/${links.length}...`);
      const problemTypst = await fetchAndParseProblem(url);
      if (problemTypst) {
        typstSource += problemTypst + "\n\n";
      }
    }
    return typstSource;
  }

  async function fetchAndParseProblem(url) {
    try {
      const res = await fetch(url);
      const txt = await res.text();
      const doc = new DOMParser().parseFromString(txt, 'text/html');
      const prob = doc.querySelector('.problem-statement');

      if (!prob) return null;

      const imgTags = Array.from(prob.querySelectorAll('img'));
      const imageMap = new Map();

      await Promise.all(imgTags.map(async (img) => {
        let src = img.src;
        if (src.startsWith('//')) src = 'https:' + src;

        try {
          const base64 = await fetchImageBase64(src);
          imageMap.set(img.src, base64);
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
      result += `  memory-limit: "${escapeString(memoryLimit)}"\n`;
      result += `)[\n`;

      const contentNodes = Array.from(prob.childNodes).filter(n =>
        n.className !== 'header' &&
        n.className !== 'input-specification' &&
        n.className !== 'output-specification' &&
        n.className !== 'sample-tests' &&
        n.className !== 'note'
      );

      result += convertNodesToTypst(contentNodes, imageMap) + `\n\n`;

      const inputSpec = prob.querySelector('.input-specification');
      if (inputSpec) {
        const titleNode = inputSpec.querySelector('.section-title');
        if (titleNode) titleNode.remove();
        result += `#input-spec[\n${convertNodesToTypst(inputSpec.childNodes, imageMap)}\n]\n`;
      }

      const outputSpec = prob.querySelector('.output-specification');
      if (outputSpec) {
        const titleNode = outputSpec.querySelector('.section-title');
        if (titleNode) titleNode.remove();
        result += `#output-spec[\n${convertNodesToTypst(outputSpec.childNodes, imageMap)}\n]\n`;
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
        result += `#note[\n${convertNodesToTypst(note.childNodes, imageMap)}\n]\n`;
      }

      result += `]`;
      return result;

    } catch (err) {
      console.error(err);
      return `// Failed to load ${url}`;
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

  function fetchImageBase64(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: url,
        responseType: "blob",
        onload: (response) => {
          if (response.status !== 200) {
            reject(new Error(`HTTP error ${response.status}`));
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Clean = reader.result.split(',')[1];
            resolve(base64Clean);
          };
          reader.onerror = reject;
          reader.readAsDataURL(response.response);
        },
        onerror: (err) => reject(err)
      });
    });
  }

  function convertNodesToTypst(nodes, imageMap) {
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
          out += `#m("${escapeLatex(rawTex)}")`;
          return;
        }
        if (node.classList.contains('tex-formula')) {
          const rawTex = node.textContent.replace(/^\$\$\$|^\$\$|^\$|\$\$\$|\$\$|\$$/g, '');
          out += `#dm("${escapeLatex(rawTex)}")`;
          return;
        }
        if (node.classList.contains('tt') || node.style.fontFamily === 'monospace') {
          out += `\`${node.textContent}\``;
          return;
        }

        switch (tag) {
          case 'p':
            out += convertNodesToTypst(node.childNodes, imageMap) + "\n\n";
            break;
          case 'b':
          case 'strong':
            out += ` *${convertNodesToTypst(node.childNodes, imageMap)}* `;
            break;
          case 'i':
          case 'em':
            out += ` _${convertNodesToTypst(node.childNodes, imageMap)}_ `;
            break;
          case 'ul':
            Array.from(node.children).forEach(li => {
              out += ` - ${convertNodesToTypst(li.childNodes, imageMap)}\n`;
            });
            out += "\n";
            break;
          case 'ol':
            Array.from(node.children).forEach((li, idx) => {
              out += ` + ${convertNodesToTypst(li.childNodes, imageMap)}\n`;
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
            out += convertNodesToTypst(node.childNodes, imageMap);
            break;
          case 'img':
            const base64 = imageMap.get(node.src);
            if (base64) {
              out += `\n#align(center)[#image(base64.decode("${base64}"), width: 80%)]\n`;
            } else {
              out += `\n// [IMAGE MISSING: ${node.src}]\n`;
            }
            break;
          default:
            out += convertNodesToTypst(node.childNodes, imageMap);
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
      result += escapeString(plainText);
      const latex = match[1] || match[2];
      if (latex.includes('\\\\') || latex.length > 50) {
        result += `#dm("${escapeLatex(latex)}")`;
      } else {
        result += `#m("${escapeLatex(latex)}")`;
      }
      lastIndex = regex.lastIndex;
    }
    result += escapeString(text.substring(lastIndex));
    return result;
  }

  function escapeString(str) {
    if (!str) return "";
    return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/#/g, "\\#");
  }

  function escapeLatex(str) {
    if (!str) return "";
    return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function getContestTitle() {
    return document.querySelector('.contest-name a')?.textContent.trim() || document.title || "Codeforces Contest";
  }

  function copyToClipboard(text) {
    if (typeof GM_setClipboard !== 'undefined') {
      GM_setClipboard(text);
    } else {
      navigator.clipboard.writeText(text).catch(err => {
        console.error("Clipboard write failed", err);
        alert("Failed to copy to clipboard.");
      });
    }
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
