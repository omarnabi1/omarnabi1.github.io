// Ontology and What-if Lab checks. Pure, no server.
import { CAMPAIGNS } from "../src/envoy/campaigns.js";
import { validateCampaign, canonicalize, familyOf, FAMILY_IDS, kindOf } from "../src/envoy/ontology.js";
import { simulate, compare, applyHypothesis, parseSimple, structuralZone, searchPackages } from "../src/envoy/lab.js";
import { newGame, act, contradicts } from "../src/envoy/engine.js";
import { paxFamilies, rowsToCases } from "../src/envoy/pax.js";

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log("FAIL", msg); } else console.log("ok  ", msg); };

// 1. Every curated campaign validates and every tag resolves to a family.
for (const c of CAMPAIGNS) {
  const v = validateCampaign(c);
  ok(v.ok, `${c.id} validates${v.errors.length ? ": " + v.errors.join("; ") : ""}`);
  const k = canonicalize(c);
  ok(k.warnings.length === 0, `${c.id}: all tags map to families${k.warnings.length ? " (" + k.warnings.join("; ") + ")" : ""}`);
  for (const t of k.tables) for (const a of t.actors) ok(FAMILY_IDS.includes(a.wants[0] || "security"), `${c.id}/${t.id}/${a.id} wants ${a.wants.join(",")} (${a.kind}${a.playable ? "" : ", AI-only"})`);
}
ok(familyOf("lithium_deal") === "resources" && familyOf("cyber_truce") === null || familyOf("cyber_truce") === "security", "keyword fallback maps unseen tags");
ok(kindOf({ name: "Revolutionary Guards (IRGC)", short: "IRGC" }) === "armed", "IRGC is armed, not playable");
ok(kindOf({ name: "Government of Iran", short: "Tehran" }) === "state", "Tehran is a state");

// 2. Hypothesis ops apply and validate; junk is ignored, not fatal.
const now = CAMPAIGNS[0];
const h = applyHypothesis(now, { ops: [
  { op: "add_clause", hs: "afg", id: "lithium", name: "Lithium concession for schools", tags: ["lithium_deal", "education"] },
  { op: "add_party", hs: "afg", id: "miners", name: "Lithium consortium", short: "Miners", kind: "company", wants: ["lithium_deal"] },
  { op: "shift", hs: "afg", party: "taliban", wants: ["+lithium_deal"] },
  { op: "nonsense", hs: "afg" }, { op: "mood", hs: "nowhere", party: "x", d: 5 }, { op: "add_party", hs: "afg", id: "ghost", wants: ["not_a_tag"] },
] });
ok(h.valid && h.applied.length === 3, `3 of 6 ops applied, campaign still valid (${h.applied.length}, ${h.errors.join("; ")})`);
ok(h.camp.hotspots[0].clauses.length === now.hotspots[0].clauses.length + 1 && now.hotspots[0].clauses.length === 6, "original campaign untouched");

// 3. Contradictions are void in the engine and skipped by the search.
const bt = { ...now, hotspots: [{ ...now.hotspots[0], clauses: [...now.hotspots[0].clauses, { id: "no_schools", name: "No schools", tags: ["x"], excludes: ["schools"] }] }] };
ok(contradicts(bt.hotspots[0], ["schools", "no_schools"]) && !contradicts(bt.hotspots[0], ["schools", "ct"]), "contradicts() detects excludes");
const st = newGame("now", 1, "asis", bt);
st.hs.afg.talks = true;
ok(/contradict/.test(act(st, "deal", "afg", { clauses: ["schools", "no_schools"] }).error || ""), "engine refuses a contradictory package");
ok(searchPackages(st, bt.hotspots[0]).every((p) => !(p.ids.includes("schools") && p.ids.includes("no_schools"))), "search skips contradictory packages");

// 4. Simulation is deterministic and fast.
const t0 = Date.now();
const a = simulate(now, { n: 100, seed: 3 }), b = simulate(now, { n: 100, seed: 3 });
ok(JSON.stringify(a.odds) === JSON.stringify(b.odds), `same seed, same odds (${JSON.stringify(a.odds)})`);
ok(Date.now() - t0 < 4000, `200 runs in ${Date.now() - t0}ms`);
ok(a.tables.every((t) => t.signed >= 0 && t.signed <= 100), "per-table odds in range");

// 5. The lithium what-if moves Afghanistan a lot and reports side effects honestly.
const r = compare(now, { title: "Lithium for schools", ops: h.applied }, { n: 150 });
const afg = r.tables.find((t) => t.id === "afg");
ok(!r.error && afg.focused && afg.after >= afg.before - 3, `Afghanistan measured like-for-like under focus (${afg.before}% to ${afg.after}%)`);
ok(r.zone.after > r.zone.before, `zone of agreement grows (${r.zone.before} to ${r.zone.after})`);
ok(/^Widens|^Opens/.test(r.verdict), `verdict: ${r.verdict}`);
const bad = compare(now, { ops: [{ op: "tension", hs: "isr", d: 40 }, { op: "tension", hs: "irn", d: 40 }, { op: "tension", hs: "yem", d: 40 }] }, { n: 150 });
ok(bad.delta.war > 0 && /war odds|Marginal/.test(bad.verdict), `heating three tables does not read as help (${bad.verdict}; war ${bad.base.odds.war}% to ${bad.after.odds.war}%)`);

// 6. Plain-words parser handles the simple shapes and does not over-match.
const ops1 = parseSimple(now, "Tehran drops its red line on missile caps and Washington warms up");
ok(ops1.some((o) => o.op === "remove_red" && o.party === "irgov") && !ops1.some((o) => o.op === "remove_red" && o.party === "us"), "parser: red line removal attaches to Tehran only");
ok(parseSimple(now, "Israel / Palestine cools down").every((o) => o.op === "tension"), "parser: a table name is not a party");
ok(parseSimple(now, "something unrelated entirely").length === 0, "parser: no false ops on unrelated text");

// 7. PA-X bridge.
const fams = paxFamilies(["ceasefire", "Powersharing/territorial", "refugees/displaced persons", "amnesty/pardon", "natural resources", "made up thing"]);
ok(fams.join(",") === "security,territory,displacement,accountability,resources", `PA-X categories map to families (${fams.join(",")})`);
const cases = rowsToCases([{ con: "Testland", agt: "Ceasefire", year: 1999, stage: "Cea", provisions: ["ceasefire"] }, { con: "Testland", agt: "Framework", year: 2001, stage: "SubComp", type: "Intra", provisions: ["ceasefire", "political", "DDR"] }]);
ok(cases.length === 1 && cases[0].signedFamilies.includes("governance") && cases[0].priorAgreements === 1, "PA-X rows become one case per conflict with the framework as target");

// 8. Structural zone is non-empty for every table that was ever resolved. Berlin 1962 has history.clauses
//    empty (nothing was signed until 1971) and the lab must say so rather than invent a deal.
for (const c of CAMPAIGNS) for (const H of c.hotspots) {
  const z = structuralZone(c, H).zone.length;
  const unsolvable = H.history && Array.isArray(H.history.clauses) && H.history.clauses.length === 0;
  ok(unsolvable ? z === 0 : z > 0, `${c.id}/${H.id} ${unsolvable ? "has no zone, as in history" : "has a zone of agreement"} (${z})`);
}

console.log(fails ? `\n${fails} failing` : "\nall lab checks pass");
process.exitCode = fails ? 1 : 0;
