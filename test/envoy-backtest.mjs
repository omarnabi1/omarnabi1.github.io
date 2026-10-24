// Backtest: does the lab recover real peace agreements from pre-agreement positions?
// No case-specific tuning: the engine, policy and ontology are the ones every scenario uses.
// Two readings per case:
//   structural: the best package in the zone of agreement once everyone is at the table
//   played:     what the mediator policy actually signs across 100 simulated runs
// Score = family recall (share of the real deal's interest families present) and distractor hits
// (a distractor is a clause that was on the table but was NOT signed).
import { BACKTESTS } from "../src/envoy/backtests.js";
import { structuralZone, simulate } from "../src/envoy/lab.js";
import { validateCampaign, familiesOf } from "../src/envoy/ontology.js";

const fams = (H, ids) => familiesOf(ids.flatMap((id) => (H.clauses.find((c) => c.id === id) || { tags: [] }).tags));
const pct = (x) => `${Math.round(x * 100)}%`;
let okCases = 0, sumRecall = 0, sumPlayed = 0, distractorHits = 0, totalPicks = 0;

for (const camp of BACKTESTS) {
  const v = validateCampaign(camp);
  if (!v.ok) { console.log(`${camp.id}: INVALID ${v.errors.join("; ")}`); process.exitCode = 1; continue; }
  const H = camp.hotspots[0];
  const signed = new Set(H.history.clauses);
  const realF = fams(H, [...signed]);
  // Comprehensive agreements run 5 or 6 provisions; the game caps a signed package at 3. The structural
  // search is allowed the real deal's size; the played line keeps the game's cap.
  const z = structuralZone(camp, H, { maxK: Math.max(3, signed.size) });
  const best = z.zone[0];
  const bestF = best ? fams(H, best.ids) : [];
  const recall = realF.filter((f) => bestF.includes(f)).length / realF.length;
  const sim = simulate(camp, { n: 100, uncertain: false });
  const t = sim.tables[0];
  const top = t.packages[0];
  const playedF = top ? fams(H, top.clauses) : [];
  const playedRecall = playedF.length ? realF.filter((f) => playedF.includes(f)).length / realF.length : 0;
  const picks = [...(best ? best.ids : []), ...(top ? top.clauses : [])];
  const dis = picks.filter((id) => !signed.has(id));
  distractorHits += dis.length; totalPicks += picks.length;
  sumRecall += recall; sumPlayed += playedRecall;
  const pass = recall >= 0.6 && dis.length === 0;
  if (pass) okCases++;
  console.log(`${pass ? "PASS" : "MISS"} ${camp.id.padEnd(12)} ${camp.year} ${camp.type.padEnd(10)} signed=${t.signed}% zone=${z.zone.length}/${z.all.length}(k≤${Math.max(3, signed.size)}) | real ${realF.join(",")} | best ${best ? best.ids.join("+") : "-"} (recall ${pct(recall)}) | played ${top ? top.clauses.join("+") : "-"} (${pct(playedRecall)})${dis.length ? ` | distractors picked: ${dis.join(",")}` : ""}`);
  if (v.warnings.length) console.log("   warnings:", v.warnings.join("; "));
}
const n = BACKTESTS.length;
console.log(`\n${okCases}/${n} cases pass. Mean family recall: structural ${pct(sumRecall / n)}, played ${pct(sumPlayed / n)}. Distractor picks: ${distractorHits}/${totalPicks}.`);
if (okCases < Math.ceil(n * 0.6)) { console.log("Backtest below the 60% bar."); process.exitCode = 1; }
