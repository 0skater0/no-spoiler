import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SRC } from "./helpers/env.js";

const platforms = readdirSync(path.join(SRC, "platforms"));

describe("platform stylesheets", () => {
  for (const id of platforms) {
    const css = readFileSync(path.join(SRC, "platforms", id, "content.css"), "utf8");

    it(`${id}: every rule parses`, () => {
      const blocks = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/\{/g).length;
      const style = document.createElement("style");
      style.textContent = css;
      document.head.appendChild(style);
      expect(style.sheet.cssRules.length).toBe(blocks);
      for (const rule of style.sheet.cssRules) {
        const sel = rule.selectorText.replace(/::(after|before)/g, "");
        expect(() => document.querySelector(sel), sel).not.toThrow();
      }
      style.remove();
    });

    it(`${id}: hiding rules are scoped to the active class`, () => {
      const rules = css.replace(/\/\*[\s\S]*?\*\//g, "").split("}");
      for (const r of rules) {
        if (!/display:\s*none|filter:|font-size:\s*0\b|opacity:\s*0\s*(!|;)/.test(r)) continue;
        const selectors = r.split("{")[0].split(/,(?![^()]*\))/).map((s) => s.trim());
        for (const s of selectors) {
          const scoped = s.startsWith(`html.ns-on.ns-${id}-`) || s.startsWith("html:not(");
          expect(scoped, s).toBe(true);
        }
      }
    });
  }
});
