/**
 * Build script for CF Exporter browser extensions and userscripts.
 * Assembles files for Chromium, Firefox, and Userscript distributions.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');
const CHROMIUM_DIST = path.join(DIST_DIR, 'chromium');
const FIREFOX_DIST = path.join(DIST_DIR, 'firefox');
const CHROMIUM_DEBUG_DIST = path.join(DIST_DIR, 'chromium-debug');
const FIREFOX_DEBUG_DIST = path.join(DIST_DIR, 'firefox-debug');

function cleanAndCreateDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, dest);
}

// Detect the available SVG to PNG renderer tool once at start
function getSvgRenderer() {
  // 1. Try npm package @resvg/resvg-js if installed
  try {
    const { Resvg } = require('@resvg/resvg-js');
    return (size, svg, png) => {
      const svgBuffer = fs.readFileSync(svg);
      const resvgInstance = new Resvg(svgBuffer, {
        fitTo: { mode: 'width', value: size }
      });
      fs.writeFileSync(png, resvgInstance.render().asPng());
    };
  } catch (e) {
    // Fall back to CLI tools
  }

  const nixResvg = '/nix/store/060j6jrih7gw0drzg3wxnvqnyrp8acg8-resvg-0.47.0/bin/resvg';
  if (fs.existsSync(nixResvg)) {
    return (size, svg, png) => execSync(`"${nixResvg}" -w ${size} "${svg}" "${png}"`);
  }
  
  const commands = [
    { test: 'resvg --version', run: (size, svg, png) => execSync(`resvg -w ${size} "${svg}" "${png}"`) },
    { test: 'convert --version', run: (size, svg, png) => execSync(`convert -background none -size ${size}x${size} "${svg}" "${png}"`) },
    { test: 'magick --version', run: (size, svg, png) => execSync(`magick convert -background none -size ${size}x${size} "${svg}" "${png}"`) }
  ];

  for (const cmd of commands) {
    try {
      execSync(cmd.test, { stdio: 'ignore' });
      return cmd.run;
    } catch (e) {
      // Try next
    }
  }

  console.error("Critical error: No SVG renderer found (install resvg, ImageMagick, or run 'npm install @resvg/resvg-js').");
  process.exit(1);
}

const renderSvg = getSvgRenderer();

function generateIcons(distPath) {
  const iconDir = path.join(distPath, 'icons');
  if (!fs.existsSync(iconDir)) fs.mkdirSync(iconDir, { recursive: true });

  const sizes = [16, 32, 48, 128];
  const svgPath = path.join(SRC_DIR, 'logo.svg');

  console.log(`Generating icons for ${path.basename(distPath)}...`);
  for (const size of sizes) {
    const destPng = path.join(iconDir, `icon-${size}.png`);
    try {
      renderSvg(size, svgPath, destPng);
      console.log(`  Created icon-${size}.png`);
    } catch (err) {
      console.error(`  Failed to render icon-${size}.png:`, err.message);
      process.exit(1);
    }
  }
}

function makeDebugContentJs(destContentJs) {
  let content = fs.readFileSync(destContentJs, 'utf8');
  content = content.replace('const IS_DEBUG = false;', 'const IS_DEBUG = true;');
  fs.writeFileSync(destContentJs, content, 'utf8');
}

function makeDebugManifestJson(destManifest) {
  const manifest = JSON.parse(fs.readFileSync(destManifest, 'utf8'));
  manifest.name = `${manifest.name} (Debug)`;
  fs.writeFileSync(destManifest, JSON.stringify(manifest, null, 2), 'utf8');
}

async function build() {
  console.log("Starting build process...");

  // 1. Verify dependencies
  const vendorJs = path.join(SRC_DIR, 'vendor', 'typst-all-in-one.js');
  if (!fs.existsSync(vendorJs)) {
    console.error(`Error: Local Typst library not found at: ${vendorJs}`);
    process.exit(1);
  }

  // 2. Clean and create output directories
  cleanAndCreateDir(CHROMIUM_DIST);
  cleanAndCreateDir(FIREFOX_DIST);
  cleanAndCreateDir(CHROMIUM_DEBUG_DIST);
  cleanAndCreateDir(FIREFOX_DEBUG_DIST);

  // Clean up legacy chrome folder if present
  const legacyChromeDir = path.join(DIST_DIR, 'chrome');
  if (fs.existsSync(legacyChromeDir)) {
    fs.rmSync(legacyChromeDir, { recursive: true, force: true });
  }

  // 3. Perform file copying in a single, unified loop
  const sharedFiles = [
    'content.js', 'content.css', 'compiler.js', 'lib.typ',
    'vendor/typst-all-in-one.js', 'vendor/typst_compiler.wasm', 'vendor/typst_renderer.wasm'
  ];

  const copies = [
    // Shared files -> Standard and Debug targets
    ...sharedFiles.flatMap(file => [
      [file, path.join(CHROMIUM_DIST, file)],
      [file, path.join(FIREFOX_DIST, file)],
      [file, path.join(CHROMIUM_DEBUG_DIST, file)],
      [file, path.join(FIREFOX_DEBUG_DIST, file)]
    ]),
    // Chromium specific (standard)
    ['chrome/manifest.json', path.join(CHROMIUM_DIST, 'manifest.json')],
    ['chrome/background.js', path.join(CHROMIUM_DIST, 'background.js')],
    ['chrome/offscreen.html', path.join(CHROMIUM_DIST, 'offscreen.html')],
    ['chrome/offscreen.js', path.join(CHROMIUM_DIST, 'offscreen.js')],
    // Chromium specific (debug)
    ['chrome/manifest.json', path.join(CHROMIUM_DEBUG_DIST, 'manifest.json')],
    ['chrome/background.js', path.join(CHROMIUM_DEBUG_DIST, 'background.js')],
    ['chrome/offscreen.html', path.join(CHROMIUM_DEBUG_DIST, 'offscreen.html')],
    ['chrome/offscreen.js', path.join(CHROMIUM_DEBUG_DIST, 'offscreen.js')],
    // Firefox specific (standard)
    ['firefox/manifest.json', path.join(FIREFOX_DIST, 'manifest.json')],
    ['firefox/background.js', path.join(FIREFOX_DIST, 'background.js')],
    // Firefox specific (debug)
    ['firefox/manifest.json', path.join(FIREFOX_DEBUG_DIST, 'manifest.json')],
    ['firefox/background.js', path.join(FIREFOX_DEBUG_DIST, 'background.js')]
  ];

  for (const [srcRel, destAbs] of copies) {
    copyFile(path.join(SRC_DIR, srcRel), destAbs);
  }

  // 4. Post-process Debug targets
  console.log("Post-processing Debug variants...");
  makeDebugContentJs(path.join(CHROMIUM_DEBUG_DIST, 'content.js'));
  makeDebugContentJs(path.join(FIREFOX_DEBUG_DIST, 'content.js'));
  makeDebugManifestJson(path.join(CHROMIUM_DEBUG_DIST, 'manifest.json'));
  makeDebugManifestJson(path.join(FIREFOX_DEBUG_DIST, 'manifest.json'));

  // 5. Generate PNG icons
  generateIcons(CHROMIUM_DIST);
  generateIcons(FIREFOX_DIST);
  generateIcons(CHROMIUM_DEBUG_DIST);
  generateIcons(FIREFOX_DEBUG_DIST);

  console.log("\nBuild finished successfully!");
  console.log(`Firefox extension:         ${FIREFOX_DIST}`);
  console.log(`Firefox extension (Debug): ${FIREFOX_DEBUG_DIST}`);
  console.log(`Chromium extension:         ${CHROMIUM_DIST}`);
  console.log(`Chromium extension (Debug): ${CHROMIUM_DEBUG_DIST}`);
}

build();
