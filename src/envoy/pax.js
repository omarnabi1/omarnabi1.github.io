// PA-X bridge: maps PA-X peace-agreement provision categories onto Envoy's ontology families, and loads
// PA-X style rows into backtest cases.
//
// PA-X (PeaceRep, University of Edinburgh) codes 2,257 agreements from 170+ processes since 1990 across
// 225+ provision categories. The dataset is a download at peaceagreements.org; it is not fetched here.
// Drop the CSV at data/pax.csv and run scripts/pax-import.mjs to turn it into cases.

import { FAMILIES } from "./ontology.js";

// Searchable PA-X sub-category (as PA-X spells it) -> family. Built from FAMILIES[*].pax, with the PA-X
// group name added where a sub-category name repeats across groups ("general", "courts", "mechanism").
export const PAX_FAMILY = {};
for (const [fid, f] of Object.entries(FAMILIES)) for (const cat of f.pax) PAX_FAMILY[cat.toLowerCase()] = fid;
Object.assign(PAX_FAMILY, {
  "security sector/general": "security",
  "transitional justice/courts": "accountability",
  "transitional justice/mechanism": "accountability",
  "powersharing/political": "governance",
  "powersharing/territorial": "territory",
  "powersharing/economic": "economy",
  "powersharing/military": "arms",
  "justice sector reform/courts": "process",
});

export const PAX_STAGES = { Pre: "pre-negotiation", SubPar: "partial framework", SubComp: "comprehensive framework", Imp: "implementation", Ren: "renewal", Cea: "ceasefire", Other: "other" };
export const PAX_TYPES = { Inter: "interstate", InterIntra: "mixed", Intra: "intrastate", IntraLocal: "local" };

export function paxFamilies(provisions) {
  const out = new Set();
  for (const p of provisions || []) {
    const k = String(p).toLowerCase().trim();
    const f = PAX_FAMILY[k] || PAX_FAMILY[k.split("/").pop()];
    if (f) out.add(f);
  }
  return [...out];
}

// A PA-X row as the importer produces it: { con, agt, year, stage, type, provisions: [sub-category names] }.
// Only comprehensive or partial frameworks become backtest targets; ceasefires and pre-talks are context.
export function rowsToCases(rows) {
  const byConflict = {};
  for (const r of rows) {
    if (!r || !r.con) continue;
    (byConflict[r.con] = byConflict[r.con] || []).push(r);
  }
  const cases = [];
  for (const [con, list] of Object.entries(byConflict)) {
    list.sort((a, b) => (a.year || 0) - (b.year || 0));
    const target = list.find((r) => r.stage === "SubComp") || list.filter((r) => r.stage === "SubPar").pop();
    if (!target) continue;
    cases.push({ id: String(con).toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24), conflict: con, agreement: target.agt, year: target.year, type: PAX_TYPES[target.type] || target.type, signedFamilies: paxFamilies(target.provisions), priorAgreements: list.filter((r) => r !== target && (r.year || 0) <= (target.year || 0)).length });
  }
  return cases;
}
