/**
 * Shared Typst compilation logic.
 * Runs in the offscreen document (Chrome) or background page (Firefox).
 */

// Helper to wait for the globally registered $typst variable to be available
async function getTypst() {
  let attempts = 0;
  while (!window.$typst) {
    if (attempts++ > 100) {
      throw new Error("Typst compiler failed to initialize (timeout)");
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return window.$typst;
}

/**
 * Compiles Typst source markup into a PDF.
 * @param {string} mainContent - The constructed Typst document markup
 * @param {Array<{path: string, arrayBuffer: Uint8Array|ArrayBuffer}>} images - List of images to map in the virtual filesystem
 * @returns {Promise<Uint8Array>} - The compiled PDF bytes
 */
export async function compilePdf(mainContent, images) {
  const $typst = await getTypst();

  // Reset shadow mapping to clear previous files/images
  try {
    $typst.resetShadow();
  } catch (e) {
    console.warn("resetShadow failed, continuing:", e);
  }

  // Map each problem image in the virtual filesystem
  for (const img of images) {
    const data = img.arrayBuffer instanceof Uint8Array 
      ? img.arrayBuffer 
      : new Uint8Array(img.arrayBuffer);
    
    console.log(`Mapping shadow file: ${img.path} (${data.byteLength} bytes)`);
    $typst.mapShadow(img.path, data);
  }

  // Compile the Typst source code to PDF bytes
  console.log("Starting Typst compilation...");
  const pdfData = await $typst.pdf({ mainContent });
  
  if (!pdfData || pdfData.byteLength === 0) {
    throw new Error("Compilation completed but generated empty PDF bytes.");
  }
  
  console.log(`Compilation successful! Generated ${pdfData.byteLength} bytes.`);
  return pdfData;
}
