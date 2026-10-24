// What-if Lab: runs the Envoy engine many times to answer "if this happened, would it resolve that?"
//
// Everything here is pure and conflict-agnostic. A hypothesis is a list of structured changes to a
// campaign (new clause, new party, shifted interests, resource shifts). The lab applies it, plays the
// world N times with and without it using a fixed mediator policy, and reports the difference.
//
// Numbers from here are odds INSIDE THE MODEL. The backtests (backtest.js) are what earn them trust.

import { newGame, act, endMonth, resolveCrisis, canDo, weight, crossesRed, campaignOf, voteOn, contradicts, DIFFS } from "./engine.js";
import { familyOf, familiesOf, canonicalize, validateCampaign, understanding, kindOf } from "./ontology.js";

const clone = (o) => JSON.parse(JSON.stringify(o));
const slug = (s, n = 24) => String(s || "").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, n);
const clip = (s, n) => String(s || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

/* ---------- hypotheses ---------- */
// Supported ops. Every op names a table (hs). Party ops name a party on that table.
//   { op: "add_clause",  hs, id, name, tags }                      a new term on the table
//   { op: "add_party",   hs, id, name, short, icon, kind, veto, mood, wants, dislikes, red, has, needs }
//   { op: "shift",       hs, party, wants: ["+tag","-tag"], dislikes: [...], red: [...] }   change interests
//   { op: "mood",        hs, party, d }                           warm or cool a party
//   { op: "tension",     hs, d }                                  heat or cool a table
//   { op: "link",        a, b, w }                                set how strongly two tables infect each other
//   { op: "resource",    hs, party, has: { lithium: 70 }, needs: { cash: { from, share } } }
//   { op: "remove_red",  hs, party, tag }                         a red line softens
export const MAX_OPS = 12;

export function applyHypothesis(camp0, hyp) {
  const camp = clone(camp0);
  const ops = (Array.isArray(hyp && hyp.ops) ? hyp.ops : []).slice(0, MAX_OPS);
  const applied = [];
  const H = (id) => camp.hotspots.find((h) => h.id === id);
  const P = (h, id) => h && h.parties.find((p) => p.id === id);
  const edit = (list, changes) => {
    let out = [...(list || [])];
    for (const c of changes || []) {
      const s = String(c);
      const t = slug(s.replace(/^[+-]/, ""));
      if (!t) continue;
      if (s.startsWith("-")) out = out.filter((x) => x !== t);
      else if (!out.includes(t)) out.push(t);
    }
    return out;
  };
  for (const o of ops) {
    const h = H(o.hs);
    switch (o.op) {
      case "add_clause": {
        if (!h || h.clauses.length >= 8) break;
        const id = slug(o.id || o.name, 16);
        if (!id || h.clauses.some((c) => c.id === id)) break;
        const tags = [...new Set((Array.isArray(o.tags) ? o.tags : []).map((t) => slug(t)).filter(Boolean))].slice(0, 2);
        const excludes = (Array.isArray(o.excludes) ? o.excludes : []).map((x) => slug(x, 16)).filter((x) => h.clauses.some((c) => c.id === x)).slice(0, 3);
        h.clauses.push({ id, name: clip(o.name, 44) || id, tags: tags.length ? tags : [id], excludes, hyp: true });
        for (const x of excludes) { const c = h.clauses.find((c) => c.id === x); c.excludes = [...new Set([...(c.excludes || []), id])]; }
        applied.push(o);
        break;
      }
      case "add_party": {
        if (!h || h.parties.length >= 6) break;
        const id = slug(o.id || o.short || o.name, 16);
        if (!id || h.parties.some((p) => p.id === id)) break;
        const tagSet = new Set(h.clauses.flatMap((c) => c.tags));
        const wants = edit([], o.wants).filter((t) => tagSet.has(t));
        if (!wants.length) break;
        h.parties.push({
          id, name: clip(o.name, 60) || id, short: clip(o.short || o.name, 16) || id, icon: typeof o.icon === "string" ? o.icon.slice(0, 4) : "🏭",
          kind: o.kind, veto: !!o.veto, mood: Math.max(0, Math.min(100, Number(o.mood) || 40)), tier: "thin", docs: 0,
          wants, dislikes: edit([], o.dislikes).filter((t) => !wants.includes(t)), red: edit([], o.red).filter((t) => !wants.includes(t)),
          has: o.has && typeof o.has === "object" ? o.has : undefined, needs: o.needs && typeof o.needs === "object" ? o.needs : undefined,
          cards: { goal: { t: clip(o.goal, 90) || "Added by hypothesis." }, flex: { t: clip(o.flex, 90) || "Unknown." }, red: { t: clip(o.redText, 90) || (o.red && o.red.length ? "See red lines." : "None stated.") } },
          hyp: true,
        });
        applied.push(o);
        break;
      }
      case "shift": {
        const p = P(h, o.party);
        if (!p) break;
        p.wants = edit(p.wants, o.wants);
        p.dislikes = edit(p.dislikes, o.dislikes).filter((t) => !p.wants.includes(t));
        p.red = edit(p.red, o.red).filter((t) => !p.wants.includes(t));
        if (!p.wants.length) p.wants = h.clauses[0].tags.slice(0, 1);
        applied.push(o);
        break;
      }
      case "remove_red": {
        const p = P(h, o.party);
        const t = slug(o.tag);
        if (!p || !t) break;
        p.red = (p.red || []).filter((x) => x !== t);
        if (p.redUnless) delete p.redUnless[t];
        applied.push(o);
        break;
      }
      case "mood": {
        const p = P(h, o.party);
        if (!p) break;
        p.mood = Math.max(0, Math.min(100, p.mood + Math.max(-30, Math.min(30, Number(o.d) || 0))));
        applied.push(o);
        break;
      }
      case "tension": {
        if (!h) break;
        h.tension = Math.max(0, Math.min(99, h.tension + Math.max(-40, Math.min(40, Number(o.d) || 0))));
        applied.push(o);
        break;
      }
      case "link": {
        const a = H(o.a), b = H(o.b);
        if (!a || !b || a === b) break;
        const w = Math.max(0, Math.min(1, Number(o.w) || 0));
        camp.links = (camp.links || []).filter(([x, y]) => !((x === a.id && y === b.id) || (x === b.id && y === a.id)));
        if (w > 0) camp.links.push([a.id, b.id, w]);
        applied.push(o);
        break;
      }
      case "resource": {
        const p = P(h, o.party);
        if (!p) break;
        if (o.has && typeof o.has === "object") p.has = { ...(p.has || {}), ...o.has };
        if (o.needs && typeof o.needs === "object") p.needs = { ...(p.needs || {}), ...o.needs };
        applied.push(o);
        break;
      }
    }
  }
  const v = validateCampaign(camp);
  return { camp, applied, valid: v.ok, errors: v.errors, warnings: v.warnings };
}

/* ---------- zone of possible agreement ---------- */
function combos(a, k) { const o = []; const r = (s, c) => { if (c.length === k) return o.push(c.slice()); for (let i = s; i < a.length; i++) { c.push(a[i]); r(i + 1, c); c.pop(); } }; r(0, []); return o; }

// Exhaustive: every 1-3 clause package on a table, scored by the engine's own vote rule.
export function searchPackages(st, H, maxK = 3) {
  const out = [];
  const ids = H.clauses.map((c) => c.id);
  for (let k = 1; k <= Math.min(maxK, ids.length); k++) {
    for (const set of combos(ids, k)) {
      if (contradicts(H, set)) continue;
      const v = voteOn(st, H, set);
      const margin = v.votes.reduce((s, x) => s + (x.v == null ? -3 : Math.min(3, x.v - v.threshold)), 0);
      // support: how much every party gains in total. Among passing packages, the broadest shared gain
      // ranks first; real comprehensive agreements bundle, so this favors the bigger balanced package.
      const support = v.votes.reduce((s, x) => s + (x.v == null ? -3 : x.v), 0);
      // coverage: how many parties get at least one thing they want. A deal where each side's pain is
      // paired with its own gain (the trade) beats one that only satisfies the easy parties.
      const tags = set.flatMap((id) => H.clauses.find((c) => c.id === id).tags);
      const coverage = H.parties.filter((p) => p.wants.some((t) => tags.includes(t))).length;
      out.push({ ids: set, passed: v.passed, yes: v.yes, need: v.need, vetoNo: v.vetoNo, red: v.votes.filter((x) => x.why === "red").map((x) => x.party), margin: Math.round(margin * 10) / 10, support: Math.round(support * 10) / 10, coverage });
    }
  }
  // Final tiebreak: the more comprehensive package. More issues means more room to trade and more to lose
  // by walking away, which is why real framework agreements bundle.
  out.sort((a, b) => (b.passed - a.passed) || (b.yes - a.yes) || (b.coverage - a.coverage) || (b.support - a.support) || (b.margin - a.margin) || (b.ids.length - a.ids.length));
  return out;
}
export const zoneOf = (st, H) => searchPackages(st, H).filter((p) => p.passed);

/* ---------- the mediator policy ---------- */
// The same sensible player used by the balance test. Deterministic given the state.
const avgMood = (st, H) => H.parties.reduce((s, p) => s + st.hs[H.id].parties[p.id].mood, 0) / H.parties.length;
function pickCrisis(st) {
  // Prefer the choice whose effects cool the hottest table; ties go to the first.
  const c = st.crisis;
  if (!c) return 0;
  const score = (fx) => {
    let s = 0;
    for (const [hid, d] of Object.entries(fx.tension || {})) s -= d * (st.hs[hid] ? st.hs[hid].tension / 50 : 1);
    for (const d of Object.values(fx.mood || {})) s += d / 3;
    s -= (fx.global || 0) * 1.5;
    s -= (fx.envoys ? 4 : 0);
    return s;
  };
  return score(c.choices[1].fx) > score(c.choices[0].fx) ? 1 : 0;
}
// The same sensible player used by the balance test. Deterministic given the state. Focus goes to the
// two tables with open talks or the warmest parties. Known weakness, kept on purpose: it will chase a
// table that warmed up but still cannot close. compare() reports that cost separately as "attention".
// opts.first: a table id the mediator works before any other while it is open. Used by compare() to
// measure a hypothesis on its own table like-for-like, free of which table happens to look warmest.
export function mediatorTurn(st, opts = {}) {
  const camp = campaignOf(st);
  if (st.crisis) resolveCrisis(st, pickCrisis(st));
  const open = camp.hotspots.filter((H) => !st.hs[H.id].done).sort((a, b) => ((b.id === opts.first) - (a.id === opts.first)) || (st.hs[b.id].talks - st.hs[a.id].talks) || (avgMood(st, b) - avgMood(st, a)));
  let guard = 0;
  while (st.envoys > 0 && !st.ended && guard++ < 12) {
    let did = false;
    for (const H of open.slice(0, 2)) {
      const h = st.hs[H.id];
      if (h.done) continue;
      if (h.talks && !canDo(st, "deal", H.id)) { const b = searchPackages(st, H)[0]; if (b && b.passed) { act(st, "deal", H.id, { clauses: b.ids }); did = true; break; } }
      if (!canDo(st, "summit", H.id)) { act(st, "summit", H.id); did = true; break; }
      if (h.tension >= 88 && !canDo(st, "aid", H.id)) { act(st, "aid", H.id); did = true; break; }
      const p = H.parties.filter((p) => !h.parties[p.id].walked && !h.offered.includes(p.id)).sort((a, b) => (b.veto - a.veto) || (h.parties[a.id].mood - h.parties[b.id].mood))[0];
      if (p && !canDo(st, "message", H.id)) {
        const c = H.clauses.filter((c) => !crossesRed(p, c.tags)).sort((a, b) => weight(p, b) - weight(p, a))[0];
        if (c) { act(st, "message", H.id, { party: p.id, clause: c.id }); did = true; break; }
      }
    }
    // Envoys reset every month, so leftovers go to aid rather than going to waste.
    if (!did) { const H = open.find((H) => !st.hs[H.id].done && !canDo(st, "aid", H.id)); if (H) act(st, "aid", H.id); else break; }
  }
  endMonth(st);
}

/* ---------- uncertainty: CR-AI knows some parties less well ---------- */
// Per run, a party CR-AI understands poorly may differ from the card: one random clause it was neutral on
// becomes a dislike, or one dislike becomes neutral. The spread of results then reflects thin data.
function perturb(camp, seed) {
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const c = clone(camp);
  const notes = [];
  for (const H of c.hotspots) for (const p of H.parties) {
    const u = understanding(p);
    if (rnd() < u) continue;
    const tags = [...new Set(H.clauses.flatMap((x) => x.tags))].filter((t) => !p.wants.includes(t) && !(p.red || []).includes(t));
    if (p.dislikes.length && rnd() < 0.5) { const t = p.dislikes[Math.floor(rnd() * p.dislikes.length)]; p.dislikes = p.dislikes.filter((x) => x !== t); notes.push(`${H.id}/${p.id} softer on ${t}`); }
    else { const pool = tags.filter((t) => !p.dislikes.includes(t)); if (pool.length) { const t = pool[Math.floor(rnd() * pool.length)]; p.dislikes.push(t); notes.push(`${H.id}/${p.id} harder on ${t}`); } }
  }
  return { camp: c, notes };
}

/* ---------- simulation ---------- */
export const MAX_RUNS = 400;
export function simulate(camp, opts = {}) {
  const n = Math.max(1, Math.min(MAX_RUNS, Number(opts.n) || 200));
  const diff = DIFFS[opts.diff] ? opts.diff : "standard";
  const base = (Number(opts.seed) || 7) >>> 0;
  const uncertain = opts.uncertain !== false;
  const tally = { win: 0, war: 0, timeout: 0 };
  const winMonths = [];
  const perTable = Object.fromEntries(camp.hotspots.map((H) => [H.id, { signed: 0, month: [], flares: 0, blockers: {}, neverTalked: 0, packages: {} }]));
  const scores = [];
  for (let i = 0; i < n; i++) {
    const seed = (base + i * 7919) >>> 0;
    const c = uncertain ? perturb(camp, seed ^ 0x9e3779b9).camp : camp;
    const st = newGame(c.id, seed, opts.twist || "asis", c, diff);
    let guard = 0;
    while (!st.ended && guard++ < 60) mediatorTurn(st, { first: opts.first });
    tally[st.outcome || "timeout"] += 1;
    scores.push(st.score || 0);
    if (st.outcome === "win") winMonths.push(st.month);
    for (const H of camp.hotspots) {
      const h = st.hs[H.id];
      const t = perTable[H.id];
      if (h.done) {
        t.signed += 1;
        const m = (st.log.find((l) => l.kind === "deal" && l.hs === H.id) || {}).m;
        if (m) t.month.push(m);
        const key = (h.clauses || []).slice().sort().join("+");
        t.packages[key] = (t.packages[key] || 0) + 1;
      } else {
        if (!h.talks) t.neverTalked += 1;
        // Who blocked: the party most often voting no, red, or vetoing in failed votes on this table.
        for (const l of st.log) if (l.kind === "vote" && l.hs === H.id) for (const v of l.votes || []) if (!v.yes) t.blockers[v.party] = (t.blockers[v.party] || 0) + 1;
        if (!st.log.some((l) => l.kind === "vote" && l.hs === H.id)) {
          const cold = H.parties.map((p) => ({ id: p.id, mood: h.parties[p.id].mood })).sort((a, b) => a.mood - b.mood)[0];
          if (cold) t.blockers[cold.id] = (t.blockers[cold.id] || 0) + 1;
        }
      }
      t.flares += st.log.filter((l) => l.kind === "flare" && l.hs === H.id).length;
    }
  }
  const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
  const pct = (k) => Math.round((tally[k] / n) * 1000) / 10;
  return {
    n, diff, uncertain,
    odds: { win: pct("win"), war: pct("war"), timeout: pct("timeout") },
    medianWinMonth: med(winMonths),
    medianScore: med(scores),
    tables: camp.hotspots.map((H) => {
      const t = perTable[H.id];
      const blockers = Object.entries(t.blockers).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, k]) => ({ party: id, short: (H.parties.find((p) => p.id === id) || {}).short || id, runs: k }));
      const top = Object.entries(t.packages).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => ({ clauses: k.split("+"), runs: v }));
      return { id: H.id, name: H.name, signed: Math.round((t.signed / n) * 1000) / 10, medianMonth: med(t.month), flaresPerRun: Math.round((t.flares / n) * 100) / 100, neverTalked: Math.round((t.neverTalked / n) * 1000) / 10, blockers, packages: top };
    }),
  };
}

/* ---------- compare: with vs without ---------- */
export function compare(camp, hyp, opts = {}) {
  const base = simulate(camp, opts);
  const applied = applyHypothesis(camp, hyp);
  if (!applied.valid) return { error: "That hypothesis breaks the scenario: " + applied.errors.slice(0, 2).join("; "), errors: applied.errors };
  if (!applied.applied.length) return { error: "No change could be applied. Name a table and a party or clause that exists." };
  const after = simulate(applied.camp, opts);
  const delta = { win: Math.round((after.odds.win - base.odds.win) * 10) / 10, war: Math.round((after.odds.war - base.odds.war) * 10) / 10 };
  const touched = applied.applied.map((o) => o.hs).find((id) => camp.hotspots.some((h) => h.id === id)) || camp.hotspots[0].id;
  // The target table is measured like-for-like: both worlds played with the mediator working it first.
  // Otherwise the result mostly reflects which table happened to look warmest to the mediator.
  const baseF = simulate(camp, { ...opts, first: touched }), afterF = simulate(applied.camp, { ...opts, first: touched });
  const tables = camp.hotspots.map((H) => {
    const focused = H.id === touched;
    const a = (focused ? baseF : base).tables.find((t) => t.id === H.id), b = (focused ? afterF : after).tables.find((t) => t.id === H.id);
    return { id: H.id, name: H.name, before: a.signed, after: b.signed, delta: Math.round((b.signed - a.signed) * 10) / 10, focused };
  });
  // Structural zone of agreement on the touched table: packages that pass once everyone is at the table
  // (mood 60, nobody walked). Independent of how the first months go.
  const H0 = camp.hotspots.find((h) => h.id === touched), H1 = applied.camp.hotspots.find((h) => h.id === touched);
  const z0 = structuralZone(camp, H0, opts), z1 = structuralZone(applied.camp, H1, opts);
  const target = tables.find((t) => t.id === touched);
  target.medianBefore = baseF.tables.find((t) => t.id === touched).medianMonth;
  target.medianAfter = afterF.tables.find((t) => t.id === touched).medianMonth;
  target.unit = camp.unit || "Month";
  const short = (id) => (H1.parties.find((p) => p.id === id) || { short: id }).short;
  const blockers = { before: blockersOf(z0.all).map(short), after: blockersOf(z1.all).map(short) };
  const zone = { table: touched, name: H0.name, before: z0.zone.length, after: z1.zone.length, total: z1.all.length, best: z1.zone.slice(0, 3).map((p) => p.ids), bestBefore: z0.zone.slice(0, 3).map((p) => p.ids), blockers };
  return {
    hypothesis: { title: clip(hyp && hyp.title, 120) || "Untitled what-if", ops: applied.applied, warnings: applied.warnings },
    base, after, delta, tables, focused: { before: baseF.odds, after: afterF.odds },
    zone,
    sideEffects: tables.filter((t) => t.id !== touched && Math.abs(t.delta) >= 5),
    verdict: verdictOf(target, delta, zone, blockers),
  };
}
export function structuralZone(camp, H, opts = {}) {
  const st = newGame(camp.id, 1, opts.twist || "asis", camp, opts.diff);
  for (const p of Object.values(st.hs[H.id].parties)) { p.mood = 60; p.walked = 0; }
  const all = searchPackages(st, H, opts.maxK || 3);
  return { all, zone: all.filter((p) => p.passed) };
}
// Verdict leads with structure (which packages can pass, who blocks), because that is what the backtests
// validate. The dynamic lines are secondary: they depend on the mediator's attention as much as the idea.
function verdictOf(target, delta, zone, blockers) {
  const z0 = zone.before, z1 = zone.after;
  let lead, at;
  if (z1 === 0) { lead = "Still blocked"; at = `no package can pass on ${zone.name}${blockers.after.length ? `: ${blockers.after.join(" and ")} cannot both sign` : ""}`; }
  else if (z0 === 0) { lead = "Opens the door"; at = `${zone.name} goes from no possible deal to ${z1} package${z1 > 1 ? "s" : ""} that could pass`; }
  else if (z1 >= z0 * 1.5) { lead = "Widens the deal space"; at = `${z0} to ${z1} of ${zone.total} packages could pass on ${zone.name}`; }
  else if (z1 < z0) { lead = "Narrows the deal space"; at = `${z0} to ${z1} packages could pass on ${zone.name}`; }
  else { lead = "Marginal"; at = `the deal space on ${zone.name} barely changes (${z0} to ${z1} packages)`; }
  if (target && target.medianBefore && target.medianAfter && target.medianAfter !== target.medianBefore) at += `; with a mediator's full attention it closes in ${target.unit.toLowerCase()} ${target.medianAfter} instead of ${target.medianBefore}`;
  let world = "";
  if (delta.war >= 10) world = ` Left to a mediator that follows the warmth, the whole world does worse: war odds ${Math.round(delta.war)} points higher, because attention shifts to this table while others flare.`;
  else if (delta.win <= -8) world = ` The world as a whole resolves less often (${Math.round(-delta.win)} points) as attention shifts to this table.`;
  else if (delta.win >= 8) world = ` The world as a whole resolves more often too (${Math.round(delta.win)} points).`;
  return `${lead}: ${at}.${world}`;
}
// Who stops a deal: parties that veto or hit a red line in the most packages.
function blockersOf(all) {
  const n = {};
  for (const p of all) { for (const id of p.vetoNo) n[id] = (n[id] || 0) + 1; for (const id of p.red) n[id] = (n[id] || 0) + 2; }
  return Object.entries(n).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => id);
}

/* ---------- failure modes in words ---------- */
export function explain(sim, camp) {
  const lines = [];
  for (const t of sim.tables) {
    if (t.signed >= 80) continue;
    const b = t.blockers[0];
    if (t.neverTalked >= 40) lines.push(`${t.name}: talks never opened in ${t.neverTalked}% of runs${b ? `; ${b.short} stayed coldest` : ""}.`);
    else if (b) lines.push(`${t.name}: ${b.short} blocked the vote most often (${b.runs} failed votes across ${sim.n} runs).`);
    if (t.flaresPerRun >= 0.5) lines.push(`${t.name} flared ${t.flaresPerRun} times per run on average.`);
  }
  if (!lines.length) lines.push("Every table closed in most runs.");
  return lines;
}

/* ---------- a plain-words hypothesis -> ops (rules only; the LLM version lives in llm.js) ---------- */
// Handles the simplest shapes without AI, so the lab works even when Workers AI is offline:
//   "<party> drops its red line on <clause>"   "<party> warms up"   "<table> cools down"
export function parseSimple(camp, text) {
  const ops = [];
  // One clause of the sentence at a time, so "Tehran drops X and Washington warms up" stays two changes.
  const parts = String(text || "").toLowerCase().split(/[.;,]|\band\b|\bwhile\b|\bbut\b/).map((s) => s.trim()).filter(Boolean);
  for (const t of parts) {
    // The subject is whatever comes before the verb, so "Hamas accepts guarantees for Israel" names Hamas only.
    const verb = t.search(/\b(drops?|softens?|warms?|cools?|hardens?|accepts?|wants?|backs?|supports?|is |are |becomes?|no longer|friendlier|angrier|hostile|more open)/);
    const subj = verb > 0 ? t.slice(0, verb) : t;
    const has = (needle) => needle.length >= 3 && new RegExp(`(^|[^a-z])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(subj);
    for (const H of camp.hotspots) {
      const hn = H.name.toLowerCase();
      const tableHit = t.includes(hn);
      if (tableHit && /cools? down|calms?|de-?escalat/.test(t)) ops.push({ op: "tension", hs: H.id, d: -15 });
      if (tableHit && /heats? up|escalat|flares?/.test(t)) ops.push({ op: "tension", hs: H.id, d: 15 });
      if (tableHit) continue;
      for (const p of H.parties) {
        const pn = [p.short.toLowerCase(), p.name.toLowerCase(), p.id];
        if (!pn.some(has)) continue;
        if (/drops? (its |their )?red line|no longer (a )?red line|softens/.test(t)) for (const c of H.clauses) if (t.includes(c.name.toLowerCase()) || c.tags.some((g) => t.includes(g.replace(/_/g, " ")))) for (const g of c.tags) ops.push({ op: "remove_red", hs: H.id, party: p.id, tag: g });
        if (/warms?|friendlier|softer|more open/.test(t)) ops.push({ op: "mood", hs: H.id, party: p.id, d: 12 });
        if (/cools?|hardens?|angrier|hostile/.test(t)) ops.push({ op: "mood", hs: H.id, party: p.id, d: -12 });
        for (const c of H.clauses) if (new RegExp(`(accepts?|wants?|backs?|supports?) .*${c.name.toLowerCase().split(" ")[0]}`).test(t)) ops.push({ op: "shift", hs: H.id, party: p.id, wants: c.tags.map((g) => "+" + g), dislikes: c.tags.map((g) => "-" + g) });
      }
    }
  }
  return ops.slice(0, MAX_OPS);
}

export { canonicalize, familyOf, familiesOf, kindOf };

/* ---------- backtest scoring (shared by test/envoy-backtest.mjs and the API) ---------- */
// Clause-level Jaccard against the real agreement (not family recall, which almost any large package
// satisfies), plus two one-line baselines and a permutation score, so the lab is judged against what a
// trivial rule achieves on the same encodings rather than against zero.
export function scoreCase(camp) {
  const H = camp.hotspots[0];
  const signed = new Set(H.history.clauses);
  const k = Math.max(3, signed.size);
  const jac = (ids) => { const a = new Set(ids); const inter = [...a].filter((x) => signed.has(x)).length; const uni = new Set([...a, ...signed]).size; return uni ? inter / uni : 0; };
  const dis = (ids) => ids.filter((id) => !signed.has(id)).length;
  const lab = structuralZone(camp, H, { maxK: k }).zone[0];
  const labIds = lab ? lab.ids : [];
  const noRed = H.clauses.filter((c) => !H.parties.some((p) => crossesRed(p, c.tags))).map((c) => c.id);
  const netPos = H.clauses.filter((c) => !H.parties.some((p) => crossesRed(p, c.tags)) && H.parties.reduce((t, p) => t + weight(p, c), 0) > 0).map((c) => c.id);
  // Permutation: the lab's package scored against random "signed" sets of the same size, averaged.
  let perm = 0; const all = H.clauses.map((c) => c.id); let seed = 11;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  for (let t = 0; t < 50; t++) { const pool = all.slice().sort(() => rnd() - 0.5).slice(0, signed.size); const fake = new Set(pool); const a = new Set(labIds); const inter = [...a].filter((x) => fake.has(x)).length; perm += inter / new Set([...a, ...fake]).size; }
  return { lab: { ids: labIds, jaccard: jac(labIds), distractors: dis(labIds) }, noRed: { ids: noRed, jaccard: jac(noRed), distractors: dis(noRed) }, netPos: { ids: netPos, jaccard: jac(netPos), distractors: dis(netPos) }, permutation: perm / 50, signed: [...signed] };
}
