# Codeforces: Export All Problems to Typst

This userscript exports all problems from a Codeforces contest (regular, group, or gym) into a Typst document (`.typ`). It adds "📥 Download .typ" and "📋 Copy to Clipboard" buttons to contest pages.

This script replaces the previous [Codeforces Contest PDF Exporter](https://github.com/AnonMiraj/codeforces-contest-pdf-exporter). It uses Typst for better layout control and formula rendering.

## Requirements

You must install [Typst](https://typst.app/) locally to compile the downloaded `.typ` files into PDFs.

## Installation

1. Install a userscript manager like [Violentmonkey](https://violentmonkey.github.io/) or Tampermonkey.
2. Add `script.js` to your userscript manager.

## Usage

1. Open any Codeforces contest page.
2. Click the **📥 Download .typ** button.
3. Run this command in your terminal to generate the PDF:
   ```bash
   typst compile <downloaded_file>.typ
   ```

## License

[GNU GPL v3](https://www.gnu.org/licenses/gpl-3.0.en.html)
