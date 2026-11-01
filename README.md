# No Spoilers

![Latest release](https://img.shields.io/github/v/release/0skater0/no-spoiler)
![Firefox users](https://img.shields.io/amo/users/no-spoilers-youtube?label=Firefox%20users)
![License](https://img.shields.io/github/license/0skater0/no-spoiler)
![Open issues](https://img.shields.io/github/issues/0skater0/no-spoiler)
![Last commit](https://img.shields.io/github/last-commit/0skater0/no-spoiler)

Browser extension for Firefox and Chrome that hides spoilers on video sites:
video time, progress bars, durations on thumbnails, comments, chat,
recommendations and end screens. Beyond spoilers, it lets you decide what
else you want to see, for example titles, tags or sidebar recommendations,
and adds jump buttons to the player.

Supported sites: **YouTube** and **Twitch**.

![Demo GIF](images/demo.gif)

## Features

The toolbar icon shows whether protection is on (red) or off (grey). Click it
to open the popup:

- On YouTube or Twitch, the popup shows that site's settings at the top and
  the other sites collapsed below.
- On any other page, it shows an overview with one row per site.
- "All settings" opens the options page with every site and the keyboard
  shortcut.

Changes apply immediately in all open tabs, no reload needed.

Keyboard shortcut to switch protection on and off: `Ctrl+Alt+U` in Firefox,
`Alt+Shift+U` in Chrome (`Command+Shift+U` on macOS). Chrome does not allow
`Ctrl+Alt` shortcuts. Both can be changed: Firefox on the options page,
Chrome on `chrome://extensions/shortcuts`.

### YouTube

| Option | Default |
|---|---|
| Hide current time and duration in the player | on |
| Hide progress bar and chapter title | on |
| Hide end screen and end cards | on |
| Turn off autoplay (switched back on when protection is turned off) | on |
| Jump buttons in the player bar, next to play (sizes selectable, default 5 and 10 min) | off |
| Jump buttons in the middle of the video on hover (sizes selectable, default 1, 5 and 10 min) | off |
| Hide comments | on |
| Hide description and chapter list | on |
| Hide recommendations next to the video | on |
| Hide live chat and chat replay | on |
| Hide durations on thumbnails (home, search, recommendations) | on |
| Hide watch progress bars on thumbnails | on |
| Hide video titles (watch page, player, thumbnails, browser tab) | off |
| Hide title tooltips | off |

### Twitch

| Option | Default |
|---|---|
| Hide current time and duration in the player | on |
| Hide seek bar | on |
| Hide seek bar hover preview | on |
| Hide recommendations at the end of a video | on |
| Jump buttons in the player bar on videos (sizes selectable) | off |
| Jump buttons in the middle of videos on hover (sizes selectable) | off |
| Collapse chat replay on videos (Twitch's own collapse button) | on |
| Collapse chat on live streams | off |
| Blur video and clip thumbnails | on |
| Blur live stream thumbnails | off |
| Hide video and clip lengths | on |
| Hide watch progress bars on videos | on |
| Disable video previews on hover | on |
| Hide category, tags, streamer avatar, streamer name on cards | off |
| Hide titles of streams, videos and clips | off |
| Hide title tooltips | off |
| Hide featured carousel on the home page | off |
| Hide recommended channels / categories in the sidebar | off |
| Hide stream uptime | on |

No Spoilers only runs on the sites you allow: after installing, a welcome
page lets you grant access to YouTube, Twitch or both.

## Installation

### From the stores

- **Firefox:** [addons.mozilla.org](https://addons.mozilla.org/firefox/addon/no-spoilers-youtube/), click *Add to Firefox*.
- **Chrome:** Chrome Web Store (link follows once the listing is live).

### Manually (latest build or development)

Download `no-spoiler-firefox-<version>.zip` or `no-spoiler-chrome-<version>.zip`
from the [latest release](https://github.com/0skater0/no-spoiler/releases), or
build it yourself (see [CONTRIBUTING](CONTRIBUTING.md)).

- **Firefox:** open `about:debugging#/runtime/this-firefox`, click
  *Load Temporary Add-on…* and select the zip or `dist/firefox/manifest.json`.
  Temporary add-ons are removed when Firefox restarts.
- **Chrome:** unpack the zip into a folder, open `chrome://extensions`, enable
  *Developer mode*, click *Load unpacked* and select that folder (or
  `dist/chrome`).

### Site access

Access to each site is optional and asked for only when you want it. After
installing, the welcome page opens; click *Allow access* for the sites you
use. Later you can do the same in the toolbar popup or on the settings page.
Until at least one site is allowed, the icon shows a red "!".

## Updating from 0.9.x

The Firefox add-on keeps its ID, so existing installations update from AMO.
Your settings are carried over: the old "show" options become the new "hide"
options, the on/off state is kept, and the old storage keys are removed.

## Privacy

No Spoilers makes no network requests and collects no data. Settings are
stored in the browser's extension storage (synced by the browser if you use
its sync). See [PRIVACY.md](PRIVACY.md).

## Contributing

Bug reports, ideas and pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md)
covers the setup, the architecture and how to add a new site.
[TESTING.md](TESTING.md) has the manual test checklist.

## Feedback and support

Please report problems and ideas [as an issue](https://github.com/0skater0/no-spoiler/issues).
When a site changed its layout and something is no longer hidden, the page
URL and the option name help most. Security issues: see [SECURITY.md](SECURITY.md).

## License

MIT, see [LICENSE](LICENSE). Provided as-is without warranty.

### Support me and my work

This extension is free. If you would like to buy me a coffee:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/P5P7NLC40)
