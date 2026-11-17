// Runs in the page (page.evaluate), after the fonts have loaded. Keeps every
// [data-max-width] line within that width, so a longer site list never runs out
// of the tile: first the font shrinks, down to minScale of its size, then the
// line wraps. Throws if any text still ends up outside the page.
export function fitText(minScale) {
  for (const el of document.querySelectorAll("[data-max-width]")) {
    const maxWidth = Number(el.dataset.maxWidth);
    const fits = () => el.getBoundingClientRect().width <= maxWidth;
    const start = parseFloat(getComputedStyle(el).fontSize);
    let size = start;
    while (!fits() && size - 0.5 >= start * minScale) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
    }
    if (!fits()) {
      el.style.fontSize = `${start}px`;
      el.style.whiteSpace = "normal";
      el.style.width = `${maxWidth}px`;
    }
  }
  for (const el of document.querySelectorAll("h1, p")) {
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth || r.bottom > innerHeight || el.scrollWidth > el.clientWidth) {
      throw new Error(`"${el.textContent}" does not fit into the page`);
    }
  }
}
