// Backtest: does the lab recover real peace agreements from pre-agreement positions, and does it beat
// a trivial rule on the same encodings? Positions were encoded by the same hand that wrote the ranking
// rules, so this is a smoke test against circularity, not validation. Validation needs held-out cases
// encoded independently (PA-X import).
import { BACKTESTS } from "../src/envoy/backtests.js";
import { scoreCase } from "../src/envoy/lab.js";
import { validateCampaign } from "../src/envoy/ontology.js";
const pct = (x) => `${Math.round(x * 100)}%`;
let sumLab = 0, sumNoRed = 0, sumNet = 0, sumPerm = 0, disLab = 0, disNoRed = 0, disNet = 0;
for (const camp of BACKTESTS) {
  const v = validateCampaign(camp);
  if (!v.ok) { console.log(`${camp.id}: INVALID ${v.errors.join("; ")}`); process.exitCode = 1; continue; }
  const r = scoreCase(camp);
  sumLab += r.lab.jaccard; sumNoRed += r.noRed.jaccard; sumNet += r.netPos.jaccard; sumPerm += r.permutation; disLab += r.lab.distractors; disNoRed += r.noRed.distractors; disNet += r.netPos.distractors;
  console.log(`${camp.id.padEnd(12)} ${camp.year} lab ${r.lab.ids.join("+")} J=${pct(r.lab.jaccard)} dis=${r.lab.distractors} | no-red J=${pct(r.noRed.jaccard)} dis=${r.noRed.distractors} | net-positive J=${pct(r.netPos.jaccard)} dis=${r.netPos.distractors} | permutation J=${pct(r.permutation)}`);
}
const n = BACKTESTS.length;
console.log(`\nMean clause Jaccard vs the real deal: lab ${pct(sumLab / n)} (wrong picks ${disLab}) | no-red-line rule ${pct(sumNoRed / n)} (${disNoRed}) | net-positive rule ${pct(sumNet / n)} (${disNet}) | random signed sets ${pct(sumPerm / n)}`);
const margin = sumLab / n - Math.max(sumNoRed, sumNet) / n;
console.log(margin > 0.02 ? `Lab beats the best one-line rule by ${pct(margin)}.` : `Lab does NOT beat a one-line rule on these encodings (margin ${pct(margin)}). Treat the number as a smoke test.`);
if (disLab > 0 || sumLab / n < sumPerm / n + 0.2) { console.log("Backtest failed: wrong picks, or no better than chance."); process.exitCode = 1; }
