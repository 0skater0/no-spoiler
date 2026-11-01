// Evaluates the platform stylesheets against fixtures: which elements does a
// given set of html classes hide?
import { readFileSync } from "node:fs";
import path from "node:path";
import { SRC } from "./env.js";

function isHidingRule(style) {
  return (
    style.getPropertyValue("display") === "none" ||
    style.getPropertyValue("opacity") === "0" ||
    /^0(px)?$/.test(style.getPropertyValue("font-size")) ||
    /blur\(/.test(style.getPropertyValue("filter"))
  );
}

/** Returns [{ selector, rule }] for every hiding rule of a platform stylesheet. */
export function hidingSelectors(platformId) {
  const css = readFileSync(path.join(SRC, "platforms", platformId, "content.css"), "utf8");
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
  const out = [];
  for (const rule of style.sheet.cssRules) {
    if (!rule.selectorText || !isHidingRule(rule.style)) continue;
    for (const sel of rule.selectorText.split(/,(?![^()]*\))/)) {
      if (sel.includes("::")) continue; // pseudo-elements draw, they do not hide
      out.push(sel.trim());
    }
  }
  style.remove();
  return out;
}

/** True when the element or one of its ancestors matches a hiding selector. */
export function isHidden(el, selectors) {
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    if (selectors.some((s) => node.matches(s))) return true;
  }
  return false;
}

export function setHtmlClasses(classes) {
  document.documentElement.className = classes.join(" ");
}
