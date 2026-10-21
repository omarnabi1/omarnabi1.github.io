// Balance check: random play should rarely win; a sensible plan should usually win.
import { newGame, applyMove, endTurn, evaluateDeal } from "../src/envoy/engine.js";
import { SCENARIOS } from "../src/envoy/scenarios.js";

function combos(arr, k) { const out = []; const rec = (s, c) => { if (c.length === k) return out.push(c.slice()); for (let i = s; i < arr.length; i++) { c.push(arr[i]); rec(i + 1, c); c.pop(); } }; rec(0, []); return out; }
function bestDeal(st) { const sc = SCENARIOS[st.sc]; let best = null; for (let k = 1; k <= 4; k++) for (const c of combos(sc.clauses.map((x) => x.id), k)) { const r = evaluateDeal(st, c); const y = r.votes.filter((v) => v.accept).length; if (!best || (r.passed && !best.passed) || (r.passed === best.passed && y > best.y)) best = { ...r, y, c }; } return best; }

function play(scId, seed, smart) {
  const st = newGame(scId, seed); const sc = SCENARIOS[scId]; let r = seed;
  const rnd = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
  while (!st.ended) {
    let guard = 0;
    while (st.capital > 0 && !st.ended && guard++ < 10) {
      if (smart) {
        const d = bestDeal(st);
        if (st.talks && st.capital >= 5 && d.passed) { applyMove(st, "deal", { clauses: d.c }); break; }
        if (!st.talks && st.capital >= 4 && applyMove(st, "summit").move) continue;
        if (st.scores.intensity >= 72 && !st.monitors && st.capital >= 3) { applyMove(st, "monitors", { variant: "local" }); continue; }
        if (st.guarantors.length < 1 && st.capital >= 3) { applyMove(st, "guarantor", { guarantor: sc.guarantors[0].id }); continue; }
        const need = d.votes.filter((v) => !v.accept && !st.actors[v.actor].walked && !(st.pitched || []).includes(v.actor)).sort((a, b) => (sc.veto.includes(b.actor) - sc.veto.includes(a.actor)) || ((b.value ?? -9) - (a.value ?? -9)));
        if (need.length && st.capital >= 2) { const tgt = need[0].actor; applyMove(st, "backchannel", { target: tgt }, { tone: 1, addresses: sc.actors.find((a) => a.id === tgt).interests.slice(0, 1) }); continue; }
        if (st.capital >= 2 && !st.used.includes("aidx")) { applyMove(st, "community"); continue; }
        break;
      } else {
        const moves = ["listen", "backchannel", "aid", "incentive", "community", "summit", "monitors"];
        const m = moves[Math.floor(rnd() * moves.length)]; const t = sc.actors[Math.floor(rnd() * sc.actors.length)].id;
        const res = applyMove(st, m, { target: t, variant: rnd() < 0.5 ? "foreign" : "local" }, { tone: Math.floor(rnd() * 5) - 2, addresses: [] });
        if (st.talks && rnd() < 0.3 && st.capital >= 5) { const sc2 = sc.clauses.map((c) => c.id).sort(() => rnd() - 0.5).slice(0, 3); applyMove(st, "deal", { clauses: sc2 }); }
        if (res.error) break;
      }
    }
    if (!st.ended) endTurn(st);
  }
  return st;
}
for (const id of Object.keys(SCENARIOS)) {
  for (const smart of [false, true]) {
    let wins = 0, total = 0, turns = 0, wars = 0; const N = 300;
    for (let s = 1; s <= N; s++) { const st = play(id, s * 7919, smart); if (st.outcome === "deal") { wins++; turns += st.turn; } if (st.outcome === "war") wars++; total += st.score; }
    console.log(id.padEnd(12), smart ? "smart " : "random", "win%", (wins / N * 100).toFixed(0), "avgTurnWin", wins ? (turns / wins).toFixed(1) : "-", "war%", (wars / N * 100).toFixed(0), "avgScore", Math.round(total / N));
  }
}
// Trace one smart Afghanistan game.
const st = play("afghanistan", 7919, true);
for (const l of st.log) console.log(l.t, l.kind, l.text);
console.log(Object.fromEntries(Object.entries(st.actors).map(([k, a]) => [k, [a.trust, a.stance]])));
