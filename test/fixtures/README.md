# DOM fixtures

Reduced snapshots of the page structure the platform modules target. They
are hand-built from the sites' markup and contain only the attributes the
selectors rely on, plus neighbours that must stay visible.

Attributes used by the tests:

- `data-expect-hidden="optA optB"`: hidden when one of these options is on.
- `data-expect-visible`: never hidden, whatever options are on.
- `data-expect-keep`: hidden at first (fail closed), visible after the
  content script marked it.

When a site changes its markup: copy the relevant part of the live DOM here
(strip personal data), mark the expectations, adjust the selectors until the
tests pass.
