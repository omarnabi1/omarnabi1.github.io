// Balance check for Envoy v2. Random play should rarely win; a sensible player should usually win.
import { newGame, act, endMonth, resolveCrisis, canDo, weight, crossesRed, campaignOf } from "../src/envoy/engine.js";
import { CAMPAIGNS } from "../src/envoy/campaigns.js";

function combos(a, k) { const o = []; const r = (s, c) => { if (c.length === k) return o.push(c.slice()); for (let i = s; i < a.length; i++) { c.push(a[i]); r(i + 1, c); c.pop(); } }; r(0, []); return o; }
function bestTerms(H, st) {
  let best = null;
  for (let k = 1; k <= 3; k++) for (const ids of combos(H.clauses.map((c) => c.id), k)) {
    const tags = ["deal", ...ids.flatMap((id) => H.clauses.find((c) => c.id === id).tags)];
    let yes = 0, vetoOk = true;
    for (const p of H.parties) { const s = st.hs[H.id].parties[p.id]; const v = s.walked || crossesRed(p, tags) ? -99 : ids.reduce((x, id) => x + weight(p, H.clauses.find((c) => c.id === id)), 0) + (s.mood - 50) / 10; if (v >= 2) yes++; else if (p.veto) vetoOk = false; }
    const need = H.parties.length >= 3 ? H.parties.length - 1 : H.parties.length;
    const score = (vetoOk && yes >= need ? 100 : 0) + yes;
    if (!best || score > best.score) best = { ids, score, pass: vetoOk && yes >= need };
  }
  return best;
}
function smartTurn(st) {
  const camp = campaignOf(st);
  if (st.crisis) resolveCrisis(st, 0);
  // Focus: the open hotspot closest to a deal.
  const open = camp.hotspots.filter((H) => !st.hs[H.id].done).sort((a, b) => (st.hs[b.id].talks - st.hs[a.id].talks) || (avgMood(st, b) - avgMood(st, a)));
  let guard = 0;
  while (st.envoys > 0 && !st.ended && guard++ < 12) {
    let did = false;
    for (const H of open.slice(0, 2)) {
      const h = st.hs[H.id];
      if (h.done) continue;
      if (h.talks && !canDo(st, "deal", H.id)) { const b = bestTerms(H, st); if (b.pass) { act(st, "deal", H.id, { clauses: b.ids }); did = true; break; } }
      if (!canDo(st, "summit", H.id)) { act(st, "summit", H.id); did = true; break; }
      if (h.tension >= 88 && !canDo(st, "aid", H.id)) { act(st, "aid", H.id); did = true; break; }
      const p = H.parties.filter((p) => !h.parties[p.id].walked && !h.offered.includes(p.id)).sort((a, b) => (b.veto - a.veto) || (h.parties[a.id].mood - h.parties[b.id].mood))[0];
      if (p && !canDo(st, "message", H.id)) {
        const c = H.clauses.filter((c) => !crossesRed(p, c.tags)).sort((a, b) => weight(p, b) - weight(p, a))[0];
        act(st, "message", H.id, { party: p.id, clause: c.id }); did = true; break;
      }
    }
    if (!did) { const H = open.find((H) => !st.hs[H.id].done && !canDo(st, "aid", H.id)); if (H) act(st, "aid", H.id); else break; }
  }
  endMonth(st);
}
function avgMood(st, H) { const ps = Object.values(st.hs[H.id].parties); return ps.reduce((s, p) => s + p.mood, 0) / ps.length; }
function randomTurn(st, r) {
  const camp = campaignOf(st);
  if (st.crisis) resolveCrisis(st, r() < 0.5 ? 0 : 1);
  const acts = ["listen", "message", "aid", "keepers", "summit", "deal"];
  for (let g = 0; g < 8 && st.envoys > 0 && !st.ended; g++) {
    const H = camp.hotspots[Math.floor(r() * camp.hotspots.length)];
    const p = H.parties[Math.floor(r() * H.parties.length)];
    const a = acts[Math.floor(r() * acts.length)];
    act(st, a, H.id, { party: p.id, clause: H.clauses[Math.floor(r() * H.clauses.length)].id, clauses: H.clauses.map((c) => c.id).sort(() => r() - 0.5).slice(0, 2) });
  }
  endMonth(st);
}
for (const camp of CAMPAIGNS) {
  for (const mode of ["random", "smart"]) {
    let wins = 0, wars = 0, sc = 0, mo = 0; const N = 300;
    for (let s = 1; s <= N; s++) {
      let x = s * 99991; const r = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
      const st = newGame(camp.id, s * 7919, "asis");
      while (!st.ended) mode === "smart" ? smartTurn(st) : randomTurn(st, r);
      if (st.outcome === "win") { wins++; mo += st.month; } if (st.outcome === "war") wars++; sc += st.score;
    }
    console.log(camp.id.padEnd(5), mode.padEnd(6), "win", (wins / N * 100).toFixed(0).padStart(3) + "%", "war", (wars / N * 100).toFixed(0).padStart(3) + "%", "winMonth", wins ? (mo / wins).toFixed(1) : "-", "score", Math.round(sc / N));
  }
}
