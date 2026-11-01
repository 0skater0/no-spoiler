/*
 * DOM snapshot for finding selectors on a live site. NOT part of the
 * extension. Paste into the browser console on the page you want to inspect
 * (the browser may ask you to type "allow pasting" first), then within six
 * seconds hover what should be captured (seek bar, tooltip ...). When the
 * console says "done", run  copy(nsDump)  to put the result on the clipboard.
 *
 * Records tag names, attributes and short text snippets only, no images or
 * scripts. Remove personal data (your user name, for example) before sharing.
 * Adjust SECTIONS for the site you are looking at.
 */
(() => {
  const SECTIONS = {
    // name: [selector, depth]
    playerControls: ['[data-a-target="player-controls"], .ytp-chrome-bottom', 14],
    belowPlayer: ['#live-channel-stream-information, .channel-info-content, ytd-watch-metadata', 14],
    rightColumn: ['[data-a-target="right-column-chat-bar"], #secondary', 6],
    sideNav: ["#side-nav, #guide", 10],
    carousel: ['[data-a-target="front-page-carousel"]', 10],
    card: ['article:has([data-a-target="preview-card-image-link"]), ytd-rich-item-renderer', 10],
  };
  const LIMIT = 25000;

  const short = (s, n = 50) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);
  const attrs = (el) =>
    [...el.attributes]
      .filter((a) => !["style", "src", "srcset", "d", "viewBox", "points"].includes(a.name))
      .map((a) => `${a.name}="${short(a.value, 70)}"`)
      .join(" ");
  const skel = (el, depth = 0, max = 9) => {
    if (!el || depth > max) return "";
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ");
    let out = `${"  ".repeat(depth)}<${el.tagName.toLowerCase()} ${attrs(el)}> ${short(text, 40)}\n`;
    for (const c of [...el.children].slice(0, 14)) out += skel(c, depth + 1, max);
    return out;
  };

  setTimeout(() => {
    const data = { url: location.href, html: attrs(document.documentElement), targets: {} };
    for (const el of document.querySelectorAll("[data-a-target], [data-test-selector]")) {
      const key = el.hasAttribute("data-a-target")
        ? `a-target=${el.getAttribute("data-a-target")}`
        : `test=${el.getAttribute("data-test-selector")}`;
      data.targets[key] = (data.targets[key] || 0) + 1;
    }
    for (const [name, [selector, depth]] of Object.entries(SECTIONS)) {
      const el = document.querySelector(selector);
      data[name] = el ? skel(el, 0, depth).slice(0, LIMIT) : "not found";
    }
    data.hovered = [...document.querySelectorAll('[role="tooltip"], [role="dialog"], [class*="balloon" i], [class*="tooltip" i]')]
      .filter((e) => e.offsetParent !== null && e.textContent.trim() && !String(e.className).includes("tooltip-arrow"))
      .slice(0, 5)
      .map((e) => skel(e, 0, 10).slice(0, 5000));
    window.nsDump = JSON.stringify(data, null, 1);
    console.log(`done: ${window.nsDump.length} characters. Run copy(nsDump) to copy.`);
  }, 6000);
})();
