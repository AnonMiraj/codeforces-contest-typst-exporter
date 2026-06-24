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
const USERSCRIPT_DIST = path.join(DIST_DIR, 'userscript');

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

  console.error("Critical error: No SVG renderer found (install resvg or ImageMagick).");
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
  cleanAndCreateDir(USERSCRIPT_DIST);

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
    // Shared files -> Chromium and Firefox
    ...sharedFiles.flatMap(file => [
      [file, path.join(CHROMIUM_DIST, file)],
      [file, path.join(FIREFOX_DIST, file)]
    ]),
    // Chromium specific
    ['chrome/manifest.json', path.join(CHROMIUM_DIST, 'manifest.json')],
    ['chrome/background.js', path.join(CHROMIUM_DIST, 'background.js')],
    ['chrome/offscreen.html', path.join(CHROMIUM_DIST, 'offscreen.html')],
    ['chrome/offscreen.js', path.join(CHROMIUM_DIST, 'offscreen.js')],
    // Firefox specific
    ['firefox/manifest.json', path.join(FIREFOX_DIST, 'manifest.json')],
    ['firefox/background.js', path.join(FIREFOX_DIST, 'background.js')]
  ];

  for (const [srcRel, destAbs] of copies) {
    copyFile(path.join(SRC_DIR, srcRel), destAbs);
  }

  // 4. Generate PNG icons
  generateIcons(CHROMIUM_DIST);
  generateIcons(FIREFOX_DIST);

  // 5. Build Userscript target
  console.log("Building Userscript target...");
  try {
    let template = fs.readFileSync(path.join(SRC_DIR, 'userscript.js'), 'utf8');
    const css = fs.readFileSync(path.join(SRC_DIR, 'content.css'), 'utf8');
    const lib = fs.readFileSync(path.join(SRC_DIR, 'lib.typ'), 'utf8');
    const js = fs.readFileSync(path.join(SRC_DIR, 'content.js'), 'utf8');

    const escape = str => str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

    template = template
      .replace('__CSS_CONTENT__', escape(css))
      .replace('__LIB_TYP_CONTENT__', escape(lib))
      .replace('// __CONTENT_JS__', js);

    fs.writeFileSync(path.join(USERSCRIPT_DIST, 'script.user.js'), template, 'utf8');
    console.log(`  Created ${path.join(USERSCRIPT_DIST, 'script.user.js')}`);
  } catch (err) {
    console.error("  Failed to build Userscript target:", err.message);
    process.exit(1);
  }

  console.log("\nBuild finished successfully!");
  console.log(`Firefox extension:  ${FIREFOX_DIST}`);
  console.log(`Chromium extension: ${CHROMIUM_DIST}`);
  console.log(`Userscript:         ${USERSCRIPT_DIST}/script.user.js`);
}

build();
