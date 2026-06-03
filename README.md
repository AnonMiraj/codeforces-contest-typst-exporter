# Codeforces: Export All Problems to Typst

This userscript exports all problems from a Codeforces contest (regular, group, or gym) into a Typst document. It adds **📥 Download .typ** and **📄 Download PDF** buttons to contest pages.

- **Download .typ** — generates a self-contained `.typ` file with base64-encoded images. Compile offline with the [Typst CLI](https://typst.app/).
- **Download PDF** — compiles to PDF in-browser via WebAssembly ([typst.ts](https://github.com/Myriad-Dreamin/typst.ts)). No local Typst installation needed. WASM modules are downloaded on first use.

## Installation

1. Install a userscript manager like [Violentmonkey](https://violentmonkey.github.io/).
2. Add `script.js` to your userscript manager.

## Usage

1. Open any Codeforces contest page.
2. Click **📥 Download .typ** or **📄 Download PDF**.


## License

[GNU GPL v3](https://www.gnu.org/licenses/gpl-3.0.en.html)
