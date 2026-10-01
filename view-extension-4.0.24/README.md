view 4.0.21

# view

Firefox extension for opening article pages through View's external service, with a faster popup, improved paywall signal detection, Reader View fallback, site controls, keyboard shortcuts, and mobile-friendly UI.

## 4.0.7
- Fixed Firefox for Android actions: popup actions now navigate the current tab directly, and the floating View button does the same instead of relying on a background-message round trip.
- Reader View's "Open with View" button uses the same Android-safe direct navigation path.
- Added desktop fallback navigation if the background action is unavailable.

## 4.0.5
- Removed the AMO-incompatible homepage metadata from the package manifest so the store validator accepts the package.
- Kept explicit Firefox for Android compatibility at 142.0+, matching the built-in Firefox data-collection permission requirements used by this release.

## 4.0.4 highlights

- Removes the reported `/html/body/div[1]/div[2]/div[2]` ad slot on removepaywall.com, including when it is dynamically recreated.
- Adds Google Active View / Adsense / DoubleClick cleanup as a fallback.

## 4.0.1 highlights

- Reader View now uses a local extension reader instead of Firefox `about:reader`, avoiding pages that reject embedding through frame security headers.
- The floating View button no longer has a close/dismiss control.
- The built-in 170-site list is fully rendered; the popup no longer truncates it to the first 80 sorted entries.
- The removepaywall.com page gets lightweight ad cleanup for common ad containers/iframes.

## 4.0.0 highlights

- Migrated from Manifest V2 to Manifest V3 while retaining Firefox's background-script model and adding a Chrome-compatible `service_worker` declaration.
- Settings now survive extension updates instead of being reset on every install/update event.
- Smarter detection uses weighted phrases/selectors instead of treating generic words like `subscription` as a paywall by themselves.
- Added Reader View as a non-destructive fallback for pages Firefox can render in reader mode.
- Added context-menu actions and keyboard shortcuts.
- Added site search, current-site markers, restore built-in sites, and better domain validation.
- Floating button is isolated in a Shadow DOM and intentionally has no close/dismiss control.
- Common tracking parameters are stripped before creating the outgoing service URL.
- Firefox data-transmission metadata is declared because the chosen View service receives the article URL when the user activates the service.

## External-service behavior

The extension still uses:

`https://www.removepaywall.com/search?url=`

The extension does not alter article DOM content or inject publisher-specific scripts. Reader View is handled by Firefox itself.

## Privacy

The original page URL is not sent to the external View service until the user explicitly chooses an action that uses the service. The extension stores preferences and the enabled-site list locally.

## Permissions

The extension needs access to HTTP(S) pages to detect supported article pages and show the optional floating button. The `websiteActivity` Firefox data-collection declaration reflects that the current page URL is transmitted to the external service only when the user chooses the service action.

Built-in sites: 170 (fully displayed in the popup with filtering and scrolling).

## Important scope

This update improves access workflows and reliability but does not add code that attempts to defeat authentication, subscription credentials, metering cookies, or other access-control mechanisms inside publisher sites.

### Listen to article

Reader View includes browser-native text-to-speech with play/pause, stop, reading speed controls, automatic section progression, and highlighting of the section currently being read. No external speech service or additional extension permission is required.


## 4.0.5
- Removed the AMO-incompatible homepage metadata from the package manifest so the store validator accepts the package.
- Kept explicit Firefox for Android compatibility at 142.0+, matching the built-in Firefox data-collection permission requirements used by this release.

## 4.0.4
- Improved auto-detection using structural, overlay, metering, and content-truncation signals.
- Added **Add current site** to always show the View button for the current hostname.
## Compatibility

This release targets Firefox 115 ESR and newer, including Firefox for Android. The Firefox background script uses the event-page style `background.scripts` configuration so older supported Firefox versions are not blocked by newer service-worker behavior.

The **Open in new tab** setting applies on desktop and Android. When disabled, View/Reader opens in the current tab; when enabled, the extension creates a new tab where the browser allows it.



## 4.0.10
- Fixed the floating Open with View button so Android never silently no-ops when background navigation fails.
- Added direct new-tab/current-tab fallback navigation for the floating button.
- Add current site now reloads the active tab when a live content-script refresh is unavailable, ensuring the floating button appears immediately on the newly enabled site.

- 4.0.10: floating View navigation now always has a direct current-tab fallback; Add current site waits for the content script to confirm the button is visible and reloads only when necessary.


### 4.0.10
- Restored the floating View button to the original reliable direct-navigation model.
- Added cached open-in-new-tab preference so the click never waits on async work.
- Made Add current site reload the current tab when necessary so the always-show rule is picked up deterministically.


## 4.0.17
- Restored the working direct floating-button behavior.
- Automatic button checks now run at document start, DOM ready, and during client-side navigation.
- Explicitly added sites are synchronized through storage events and a lightweight polling fallback.
- Removepaywall ad cleanup uses the supplied XPath rules plus an early CSS content script and MutationObserver.


## 4.0.17
- Restored the proven document-idle content script timing used by 4.0.12 for automatic floating-button injection.
- Preserved the floating button implementation unchanged from 4.0.12.
- Added deterministic removepaywall.com blocking for `/html/body/div[1]/div[2]/div[2]`, `//*[@id="ad_position_box"]`, and `/html/ins[2]`.
- Added CSS equivalents and repeated DOM cleanup for late-created ad elements.
