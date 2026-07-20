<div align="center">
  <img src="Downloader.png" alt="SciAstra Notes Downloader Logo" width="128" height="128" />
  <h1>SciAstra Notes Downloader</h1>
  <p>A sleek, automated Chrome Extension to effortlessly extract and download documents and lecture slides from SciAstra.</p>
</div>

## 🚀 Overview

**SciAstra Notes Downloader** is a custom Google Chrome Extension built to automate the tedious process of digging through the browser's Network tab to extract PDFs and slide images. 

Whether the viewer lazily loads images or fetches data from AWS S3, this extension intercepts the network traffic natively and presents it to you in a beautiful, easy-to-use interface.

## ✨ Features

- **Network Interception**: Automatically detects and captures URLs for PDFs, images (`.png`, `.jpeg`), and AWS S3 blobs loaded by the SciAstra viewer.
- **Auto-Scroll & Scan**: A one-click solution that automatically scrolls through the slide deck, forcing the browser to load all pages so you don't have to scroll manually.
- **Preview & Download**: 
  - 👁️ **View**: Preview captured slides or documents in a new tab before saving.
  - ⬇️ **Download**: Save individual files instantly.
  - 📦 **Download All**: Bulk-download all discovered documents with one click.
- **Premium UI**: Features a modern, dark-mode, glassmorphism interface built with Vanilla CSS.

## 🛠️ Installation

Since this is a custom, unpacked extension, follow these steps to install it in your browser:

1. Clone or download this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. In the top right corner, turn on **Developer mode**.
4. Click the **Load unpacked** button in the top left corner.
5. Select the folder containing this repository (the folder containing `manifest.json`).
6. *Optional*: Pin the extension to your Chrome toolbar for quick access!

## 📖 How to Use

1. Navigate to a document or slide deck on `https://app.sciastra.com/viewPdf`.
2. Click the **SciAstra Notes Downloader** icon in your Chrome toolbar.
3. If documents were already loaded by the browser, they will immediately appear in the list.
4. Click the **Scan Pages** button to automatically scroll the viewer and capture all hidden/lazy-loaded slides.
5. Use the view or download icons next to each document to save them locally!

## 🔐 Privacy & Permissions

This extension is built with privacy in mind. It uses **Manifest V3** and its permissions are strictly scoped to:
- `*://app.sciastra.com/*` - The extension only operates on the specific target domain.
- **Storage** - Only uses `session` storage to keep track of URLs temporarily while the tab is open.
- **No data is ever sent to external servers.**

## 💻 Tech Stack

- **HTML/CSS/JS**: Vanilla web technologies with no heavy frameworks.
- **Chrome Extensions API**: `webRequest`, `scripting`, `downloads`, `activeTab`.

## ⚠️ Legal & Usage Disclaimer

- **Personal Use Only**: The documents and slides downloaded using this extension are intended strictly for personal educational use (e.g., keeping local copies or printing them for personal study).
- **No Redistribution**: You are strictly prohibited from sharing, uploading, or redistributing the downloaded notes, slides, or documents on any public platforms, social media, or with unauthorized individuals. 
- **Not Affiliated**: This extension is an independent tool built for personal productivity and is not affiliated with, maintained, or endorsed by SciAstra. Please respect the intellectual property of the content creators.
