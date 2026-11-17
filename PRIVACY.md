# Privacy Policy

No Spoilers does not collect, transmit or store any personal data.

All processing happens locally in your browser. The extension contains no
telemetry or analytics and contacts no servers.

What the extension stores, in the browser's extension storage:

- your settings for each site (synced between your devices by the browser's
  own sync, if you use it),
- whether protection is switched on (on this device only),
- two flags that remember whether the extension switched off YouTube autoplay
  or collapsed the Twitch chat, so it can undo that later.

What the extension reads:

- the pages of the supported sites you allowed (YouTube, Twitch, Kick)
  to hide or change elements on them,
- the address of the current tab when you open the popup, to show the
  matching settings,
- only with "Start live streams from the beginning" on: the player volume
  that Twitch keeps in its page storage (`volume` in `localStorage`) and Kick
  in its cookie `volume`. The extension silences the player while it moves the stream to
  its beginning; if the site saved that silenced volume, the extension sets
  the previous value back, or removes the entry if there was none before.
  The extension does not send the value anywhere.

Removing the extension removes all stored data.

If you have questions about privacy, please open an issue at
<https://github.com/0skater0/no-spoiler/issues>.
