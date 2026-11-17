// The README's option table must list every option of every platform with its default.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers/env.js";

// "Label (extra words)" and "Label" name the same option; the README may explain more in its parentheses.
const baseLabel = (label) => label.replace(/\s*\([^)]*\)$/, "").trim();

/** Rows of the option table, grouped under their bold platform heading. */
function readmeRows() {
  const rows = {};
  let platform = null;
  for (const line of readFileSync(path.join(ROOT, "README.md"), "utf8").split(/\r?\n/)) {
    const cells = /^\|\s*(.+?)\s*\|\s*(.*?)\s*\|$/.exec(line);
    if (!cells) continue;
    const heading = /^\*\*(.+)\*\*$/.exec(cells[1]);
    if (heading) {
      platform = heading[1];
      rows[platform] = [];
    } else if (platform && (cells[2] === "on" || cells[2] === "off")) {
      rows[platform].push({ label: baseLabel(cells[1]), on: cells[2] === "on" });
    }
  }
  return rows;
}

const platforms = readdirSync(path.join(ROOT, "src", "platforms")).map((id) =>
  JSON.parse(readFileSync(path.join(ROOT, "src", "platforms", id, "platform.json"), "utf8")),
);

describe("README option table", () => {
  const rows = readmeRows();

  for (const platform of platforms) {
    it(`lists every ${platform.label} option with its default`, () => {
      // Jump sizes are described in the row of their jump buttons.
      const options = platform.options.filter((o) => o.type !== "steps");
      const table = rows[platform.label] ?? [];
      expect(table.map((r) => r.label)).toEqual(options.map((o) => baseLabel(o.label)));
      expect(table.map((r) => r.on)).toEqual(options.map((o) => o.default));
    });
  }

  it("has no section for a site that does not exist", () => {
    expect(Object.keys(rows).sort()).toEqual(platforms.map((p) => p.label).sort());
  });
});
