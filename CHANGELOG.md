# Changelog

All notable changes to this extension go here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-11-01

### Changed

- Access to YouTube is now optional like Twitch: the extension asks for no site access when it is installed. A welcome page opens after installing, where you allow the sites you want; this also works later from the toolbar popup and the settings page. The icon shows a red "!" while no site is allowed.
- If an update leaves the extension without access to any site, the welcome page opens so you can allow them again.

## [1.0.0] - 2026-11-01

Complete rewrite. The extension is now called *No Spoilers*, runs on Firefox and Chrome from one code base (Manifest V3) and supports YouTube and Twitch.

### Added

- Chrome support. Both browsers are built from the same source; `npm run package` produces one zip per browser.
- Twitch: blur video, clip and (optionally) live thumbnails; hide video and clip lengths, watch progress, the player time, the seek bar and its hover preview, end-of-video recommendations, stream uptime; collapse the chat on videos and/or live streams with Twitch's own button and keep it collapsed; hide titles, title tooltips, category, tags, streamer avatar and name on cards; hide the home page carousel and the recommended channels and categories in the sidebar; disable video previews on hover. Twitch access is optional and granted from the popup.
- YouTube: hide durations and watch progress bars on thumbnails (home, search, recommendations), hide video titles (page, player, thumbnails and browser tab) and title tooltips.
- Jump buttons for YouTube and Twitch videos: in the player bar next to play, and in the middle of the video while hovering. The jump sizes (5 s to 1 h) are chosen in the settings.
- Toolbar popup: the settings of the current site at the top, the other sites collapsed below; an overview on other pages. The icon shows whether protection is on.
- Settings page with all sites, reset per site, and the keyboard shortcut.

### Changed

- All changes apply immediately in open tabs, without reloading the page.
- Settings are migrated from 0.9.x on update: the old "show" options become "hide" options, the on/off state is kept.
- The keyboard shortcut stays `Ctrl+Alt+U` in Firefox. Chrome uses `Alt+Shift+U`, because Chrome does not allow `Ctrl+Alt` shortcuts.
- Autoplay is only switched back on if the extension switched it off.
- New icon. The previous one used the YouTube logo.
- Minimum versions: Firefox 140, Chrome 120.

### Removed

- The `tabs` and `contextMenus` permissions. The settings page is reached from the popup or the browser's extension menu.

### Fixed

- Skip buttons appeared twice.
- Turning the extension off loaded a file that did not exist (`skip-button.js`).
- CSS was injected into the active tab instead of the tab that loaded, so background tabs were not protected.
- Changed settings left the previous CSS in open pages.
- The chat setting was not loaded on the settings page and was saved as off.

## [0.9.9] - 2023-08-05

### Added

- Skip buttons (-10, -5, +5, +10 minutes) next to the play button on YouTube.

## [0.9.8] - 2023-07-30

Settings page with dark mode, configurable keyboard shortcut and reset to defaults. Options for video time, progress bar, comments, description, recommendations, chat, end cards and autoplay.

[Unreleased]: https://github.com/0skater0/no-spoiler/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/0skater0/no-spoiler/releases/tag/v1.1.0
[1.0.0]: https://github.com/0skater0/no-spoiler/releases/tag/v1.0.0
