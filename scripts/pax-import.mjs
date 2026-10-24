// Turns a PA-X dataset export into backtest rows for Envoy.
// Usage: node scripts/pax-import.mjs data/pax.csv > data/pax-cases.json
//
// PA-X (peaceagreements.org) exports one row per agreement with metadata columns and one binary column per
// coded provision. Column names differ between dataset versions, so this script reads the header, keeps the
// metadata it recognises, and treats every other column whose header matches a PA-X sub-category name (see
// src/envoy/pax.js PAX_FAMILY) as a provision flag. Unmatched provision columns are listed on stderr so
// the mapping can be extended. Nothing is fetched: download the CSV from PA-X under its licence first.
import { readFileSync } from "node:fs";
import { PAX_FAMILY, rowsToCases } from "../src/envoy/pax.js";

const file = process.argv[2];
if (!file) { console.error("usage: node scripts/pax-import.mjs <pax.csv>"); process.exit(1); }
const text = readFileSync(file, "utf8");
const rows = parseCsv(text);
const header = rows.shift().map((h) => h.trim());
const col = (names) => header.findIndex((h) => names.includes(h.toLowerCase()));
const iCon = col(["con", "conflict", "country/entity"]), iAgt = col(["agt", "agreement", "agreement name"]), iDat = col(["dat", "date", "signed"]), iStage = col(["stage"]), iType = col(["agtp", "agreement type", "type"]);
const provCols = header.map((h, i) => [h, i]).filter(([h]) => PAX_FAMILY[h.toLowerCase()] || PAX_FAMILY[h.toLowerCase().split("/").pop()]);
const unknown = header.filter((h, i) => ![iCon, iAgt, iDat, iStage, iType].includes(i) && !provCols.some(([, j]) => j === i));
console.error(`${rows.length} rows; ${provCols.length} provision columns matched; ${unknown.length} columns unmatched (first 20): ${unknown.slice(0, 20).join(", ")}`);

const out = rows.filter((r) => r.length === header.length).map((r) => ({
  con: r[iCon], agt: r[iAgt], year: Number(String(r[iDat] || "").match(/\d{4}/)?.[0]) || null, stage: r[iStage], type: r[iType],
  provisions: provCols.filter(([, i]) => /^(1|y|yes|true)$/i.test(String(r[i] || "").trim())).map(([h]) => h),
}));
console.log(JSON.stringify({ rows: out, cases: rowsToCases(out) }, null, 1));

function parseCsv(s) {
  const rows = [[]]; let cur = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { rows[rows.length - 1].push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; rows[rows.length - 1].push(cur); cur = ""; rows.push([]); }
    else cur += c;
  }
  if (cur || rows[rows.length - 1].length) rows[rows.length - 1].push(cur);
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
}
