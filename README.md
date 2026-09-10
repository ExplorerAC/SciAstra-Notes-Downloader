# SciAstra Notes Downloader — v2.0.0

This build runs the scanner independently of the extension popup. Chrome may close an action popup when the page is interacted with; that no longer cancels the scan or clears captured documents. Captures are persisted in `chrome.storage.local`, and reopening the popup reloads the current results and scan state. The scanner no longer uses a blocking `alert()` when it finishes.

<div align="center">
  <img src="Downloader.png" alt="SciAstra Notes Downloader Logo" width="128" height="128" />
  <h1>SciAstra Notes Downloader</h1>
  <p>A Chrome extension for capturing and downloading document/page resources loaded by the SciAstra web viewer.</p>
</div>

## What changed in v2.0.0

The original extension identified files mostly by looking for `.pdf`, `.jpg`, `.png`, etc. in the URL. That is fragile because modern document viewers commonly use signed or extensionless URLs.

Version 2.0.0 adds:

- **New Logo:** A cool new `Downloader.png` representing the premium aesthetic.
- Response `Content-Type` detection (`application/pdf`, `image/*`, etc.).
- Support for extensionless/signed AWS, CloudFront and SciAstra resources.
- DOM resource discovery (`img`, `iframe`, `embed`, `object`, `source`).
- Performance resource discovery through `PerformanceResourceTiming`.
- Lightweight fetch/XHR URL observation.
- A more robust multi-container lazy-load scanner.
- Resource metadata and better automatic filenames.
- Duplicate filtering.
- More reliable bulk downloads.
- Backward compatibility with the old string-only session format.
- **Fresh new pure black dark mode aesthetic for the popup UI.**

## Installation

1. Open `chrome://extensions/` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the folder containing `manifest.json`.
5. Navigate to a SciAstra document/notes viewer.
6. Open the extension and press **Scan Pages**.

If you already had an older unpacked copy installed, remove/replace it or use **Reload** after replacing the files.

## Notes

The extension captures URLs for resources already made available to the browser. It does not bypass authentication, DRM, paywalls, or server-side access controls.

Some authenticated resources may expire quickly because their URLs are signed. If a captured resource stops working, scan again to obtain a fresh URL.

## Privacy

Captured resource metadata is kept in Chrome session storage for the current tab. The extension does not send captured URLs to an external server.

## Usage

Use downloaded materials only where you have permission to do so. Respect SciAstra's terms and the copyright of the notes/content creators.
