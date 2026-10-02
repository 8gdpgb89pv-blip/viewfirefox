# view — Chrome Extension

A cleaner way to read online articles in Google Chrome.

## Features

- Floating **Read** button on supported pages
- Smarter automatic paywall/access detection
- Personal always-show site list, including **Add current site**
- Reader View focused on article content
- **Listen to article** with play/pause, stop, speed control and reading progress
- Open in the current tab or a new tab
- Context-menu actions for pages and links
- Keyboard shortcuts for View and Reader View
- Dedicated cleanup for advertising elements on removepaywall.com

## Chrome

This package is Manifest V3 and uses a Chrome service worker for background tasks. Manifest V3 is supported generally in Chrome 88 and later.

## Installation for development

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the extracted extension folder.

For Chrome Web Store publishing, upload the ZIP with `manifest.json` at its root.

## Privacy

When the external View service is used, the requested article URL is sent to `https://www.removepaywall.com/search?url=` so that service can retrieve and display the article.
