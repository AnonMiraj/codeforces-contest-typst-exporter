# Codeforces to PDF Exporter

A browser extension that exports all problems from a Codeforces contest (regular, group, or gym) into a beautifully typeset PDF document locally in your browser. It injects **📥 Download .typ** and **📄 Download PDF** buttons directly into Codeforces contest pages.

- **Download .typ** — Generates a self-contained `.typ` source file with local template styling.
- **Download PDF** — Compiles the contest problems directly to PDF in-browser using WebAssembly (via a local Typst compiler). No external Typst installation or network calls are required!

---

## Installation

### Firefox

**Download from Firefox Browser add-ons:**

[![image](img/firefox-marketplace.png)](https://addons.mozilla.org/codeforces-to-pdf-exporter)

*Note: While waiting for official store approval, you can install the extension manually:*

1. Download the latest `firefox-extension.zip` from the [Latest Releases](https://github.com/AnonMiraj/codeforces-contest-typst-exporter/releases).
2. Extract the ZIP file to a folder on your computer.
3. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
4. Click **Load Temporary Add-on...**.
5. Navigate to the extracted folder and select the **`manifest.json`** file.

---

### Chromium-based Browsers (Chrome, Edge, Brave, Opera)

Currently, the Chromium extension must be installed manually in Developer Mode:

1. Download the latest `chromium-extension.zip` from the [Latest Releases](https://github.com/AnonMiraj/codeforces-contest-typst-exporter/releases).
2. Extract the ZIP file to a folder on your computer.
3. Open your browser and navigate to the Extensions page:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
4. Enable **Developer mode** (usually a toggle in the top-right corner).
5. Click **Load unpacked** (top-left corner).
6. Select the folder where you extracted the `chromium-extension.zip` contents.

---

## Usage

1. Navigate to any Codeforces contest, gym, or group contest page.
2. Click **📥 Download .typ** or **📄 Download PDF** next to the sub-navigation menu.
3. Confirm that the document compiles and downloads directly to your device.

---

## License

[GNU GPL v3](https://www.gnu.org/licenses/gpl-3.0.en.html)
